const { groups, validateMappings, allocate } = require('./property-expense-allocations');
module.exports = function createMappings(context, validateRange) {
  async function catalog(connection) {
    const accounts = [];
    for (let start = 1; ; start += 1000) {
      const query = `select * from Account where Active in (true, false) startposition ${start} maxresults 1000`;
      const result = await context.qbRequest(connection, 'get', `query?query=${encodeURIComponent(query)}`);
      if (!result.QueryResponse) throw new Error('Unable to read QuickBooks accounts.');
      const page = result.QueryResponse.Account || []; accounts.push(...page);
      if (page.length < 1000) break;
    }
    return accounts.map(a => ({ accountId: String(a.Id), name: a.FullyQualifiedName || a.Name, type: a.AccountType, subtype: a.AccountSubType || '', active: a.Active !== false }));
  }
  async function purchases(connection, range, beforePage) {
    const result = new Map();
    for (let start = 1; ; start += 1000) {
      if (beforePage) await beforePage();
      const dateFilter = range ? ` where TxnDate >= '${range.from}' and TxnDate <= '${range.to}'` : '';
      const query = `select * from Purchase${dateFilter} orderby Id startposition ${start} maxresults 1000`;
      const response = await context.qbRequest(connection, 'get', `query?query=${encodeURIComponent(query)}`);
      if (!response.QueryResponse) throw new Error('QuickBooks returned an incomplete expense response.');
      const page = response.QueryResponse.Purchase || [];
      for (const purchase of page) result.set(String(purchase.Id), purchase);
      if (page.length < 1000) break;
    }
    return result;
  }
  function register() {
    context.app.put('/api/properties/:propertyId/expenses/:expenseId/report', context.authenticateManagerProfile, async (req, res) => {
      const { month = '', reference = '', url = '' } = req.body || {};
      if (typeof month !== 'string' || (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        || typeof reference !== 'string' || reference.length > 200 || typeof url !== 'string' || url.length > 2000
        || (url && !/^https:\/\//i.test(url))) return res.status(400).json({ message: 'Use a valid work month, report reference, and HTTPS report link.' });
      try {
        const record = await context.PropertyExpense.findOneAndUpdate({ _id: req.params.expenseId, projectId: req.params.propertyId },
          { $set: { maintenanceReport: { month, reference: reference.trim(), url: url.trim() } } }, { new: true, runValidators: true });
        if (!record) return res.status(404).json({ message: 'Property expense not found.' });
        res.json({ maintenanceReport: record.maintenanceReport });
      } catch (_) { res.status(400).json({ message: 'Unable to save the report link.' }); }
    });
    context.app.get('/api/properties/:propertyId/expenses/mappings', context.authenticateManagerProfile, async (req, res) => {
      let range;
      if (req.query?.from !== undefined || req.query?.to !== undefined) {
        try { range = validateRange(req.query); }
        catch (error) { return res.status(400).json({ message: error.message }); }
      }
      try {
        const connection = await context.getQbConnection(req.params.propertyId);
        const accounts = await catalog(connection);
        let preview = null;
        let accountActivity = null;
        if (range) {
          const resolve = resolver(connection, { payee: false });
          const allMappings = accounts.map(account => ({ accountId: account.accountId, group: 'other' }));
          const transactions = [];
          const counts = new Map();
          const accountIds = new Set(accounts.map(account => account.accountId));
          for (const purchase of (await purchases(connection)).values()) {
            const resolved = await resolve(purchase);
            const used = new Set((resolved.Line || []).filter(line => line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail).map(line => {
              const detail = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail;
              return String((detail.AccountRef || detail.ItemAccountRef)?.value || '');
            }));
            for (const id of used) {
              if (!accountIds.has(id)) throw new Error('An expense account could not be resolved. Refresh the QuickBooks account catalog and retry.');
              counts.set(id, (counts.get(id) || 0) + 1);
            }
            if (resolved.TxnDate < range.from || resolved.TxnDate > range.to) continue;
            if (!resolved.TxnDate) throw new Error('QuickBooks returned an expense without a transaction date.');
            const allocation = allocate(resolved, allMappings);
            if (allocation.unmapped.length) throw new Error('An expense account could not be resolved. Refresh the QuickBooks account catalog and retry.');
            transactions.push({ id: String(purchase.Id), allocations: allocation.allocations.map(({ accountId, amount }) => ({ accountId, amount })) });
          }
          preview = { range, transactions };
          accountActivity = Array.from(counts, ([accountId, count]) => ({ accountId, count }));
        }
        res.json({ accounts, preview, accountActivity, mappings: connection.expenseMappings || [], excludedAccountIds: connection.expenseExcludedAccountIds || [], groups, version: connection.expenseMappingVersion || 0 });
      } catch (error) { res.status(503).json({ message: `Unable to load QuickBooks mapping preview: ${error.message}` }); }
    });
    context.app.put('/api/properties/:propertyId/expenses/mappings', context.authenticateManagerProfile, async (req, res) => {
      let mappings, excludedAccountIds;
      try {
        mappings = validateMappings(req.body.mappings);
        excludedAccountIds = req.body.excludedAccountIds;
        if (excludedAccountIds !== undefined && (!Array.isArray(excludedAccountIds) || excludedAccountIds.length > 2000
          || excludedAccountIds.some(id => typeof id !== 'string' || !/^[0-9]+$/.test(id))
          || new Set(excludedAccountIds).size !== excludedAccountIds.length
          || mappings.some(row => excludedAccountIds.includes(row.accountId)))) throw new Error('Each account must be either mapped or explicitly excluded, not both.');
      } catch (error) { return res.status(400).json({ message: error.message }); }
      try {
        const connection = await context.getQbConnection(req.params.propertyId);
        const accounts = await catalog(connection), ids = new Set(accounts.map(a => a.accountId));
        if (mappings.some(row => !ids.has(row.accountId)) || excludedAccountIds?.some(id => !ids.has(id))) return res.status(400).json({ message: 'An account no longer exists. Reload the mappings.' });
        const exclusions = excludedAccountIds || (connection.expenseExcludedAccountIds || []).filter(id => !mappings.some(row => row.accountId === id));
        const result = await context.QuickBooksConnection.findOneAndUpdate({ _id: connection._id,
          $and: [ { $or: [{ expenseImportLeaseUntil: { $exists: false } }, { expenseImportLeaseUntil: { $lte: new Date() } }] },
            { $or: [{ expenseMappingVersion: Number(req.body.version) }, ...(Number(req.body.version) === 0 ? [{ expenseMappingVersion: { $exists: false } }] : [])] } ] },
        { $set: { expenseMappings: mappings, expenseExcludedAccountIds: exclusions }, $inc: { expenseMappingVersion: 1 } }, { new: true });
        if (!result) return res.status(409).json({ message: 'A sync is running or mappings changed in another session. Reload and retry.' });
        res.json({ mappings, excludedAccountIds: exclusions, version: result.expenseMappingVersion });
      } catch (_) { res.status(503).json({ message: 'Unable to save expense mappings. Your previous mappings are unchanged.' }); }
    });
  }
  // References are cached only within one property sync, never across companies.
  function resolver(connection, { payee = true } = {}) {
    const cache = new Map();
    async function lookup(type, id) {
      if (!id) return null;
      const key = `${type}:${id}`;
      if (!cache.has(key)) cache.set(key, context.qbRequest(connection, 'get', `${type.toLowerCase()}/${encodeURIComponent(id)}`).then(result => {
        if (!result[type]) throw new Error(`Unable to resolve QuickBooks ${type}.`);
        return result[type];
      }));
      return cache.get(key);
    }
    return async purchase => {
      const result = JSON.parse(JSON.stringify(purchase));
      if (payee && result.EntityRef?.value && !result.EntityRef.name) {
        const type = result.EntityRef.type || 'Vendor';
        if (!['Vendor', 'Customer', 'Employee'].includes(type)) throw new Error('Unsupported QuickBooks payee type.');
        const payee = await lookup(type, result.EntityRef.value);
        result.EntityRef.name = payee.DisplayName || [payee.GivenName, payee.FamilyName].filter(Boolean).join(' ');
      }
      for (const line of result.Line || []) {
        const detail = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail;
        if (!detail) continue;
        if (line.ItemBasedExpenseLineDetail && !detail.ItemAccountRef) {
          const item = await lookup('Item', detail.ItemRef?.value);
          detail.ItemAccountRef = item?.ExpenseAccountRef || item?.AssetAccountRef || {};
        }
        const ref = detail.AccountRef || detail.ItemAccountRef;
        if (ref?.value && !ref.name) {
          const account = await lookup('Account', ref.value); ref.name = account.FullyQualifiedName || account.Name;
        }
      }
      return result;
    };
  }
  return { register, resolver, purchases };
};

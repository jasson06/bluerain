const { groups, validateMappings } = require('./property-expense-allocations');
module.exports = function createMappings(context) {
  async function catalog(connection) {
    const accounts = [];
    for (let start = 1; ; start += 1000) {
      const query = `select * from Account startposition ${start} maxresults 1000`;
      const result = await context.qbRequest(connection, 'get', `query?query=${encodeURIComponent(query)}`);
      if (!result.QueryResponse) throw new Error('Unable to read QuickBooks accounts.');
      const page = result.QueryResponse.Account || []; accounts.push(...page);
      if (page.length < 1000) break;
    }
    return accounts.map(a => ({ accountId: String(a.Id), name: a.FullyQualifiedName || a.Name, type: a.AccountType, active: a.Active !== false }));
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
      try {
        const connection = await context.getQbConnection(req.params.propertyId);
        res.json({ accounts: await catalog(connection), mappings: connection.expenseMappings || [], groups, version: connection.expenseMappingVersion || 0 });
      } catch (_) { res.status(400).json({ message: 'Connect QuickBooks and retry loading expense mappings.' }); }
    });
    context.app.put('/api/properties/:propertyId/expenses/mappings', context.authenticateManagerProfile, async (req, res) => {
      let mappings;
      try { mappings = validateMappings(req.body.mappings); } catch (error) { return res.status(400).json({ message: error.message }); }
      try {
        const connection = await context.getQbConnection(req.params.propertyId);
        const accounts = await catalog(connection), ids = new Set(accounts.map(a => a.accountId));
        if (mappings.some(row => !ids.has(row.accountId))) return res.status(400).json({ message: 'An account no longer exists. Reload the mappings.' });
        const result = await context.QuickBooksConnection.findOneAndUpdate({ _id: connection._id,
          $and: [ { $or: [{ expenseImportLeaseUntil: { $exists: false } }, { expenseImportLeaseUntil: { $lte: new Date() } }] },
            { $or: [{ expenseMappingVersion: Number(req.body.version) }, ...(Number(req.body.version) === 0 ? [{ expenseMappingVersion: { $exists: false } }] : [])] } ] },
        { $set: { expenseMappings: mappings }, $inc: { expenseMappingVersion: 1 } }, { new: true });
        if (!result) return res.status(409).json({ message: 'A sync is running or mappings changed in another session. Reload and retry.' });
        res.json({ mappings, version: result.expenseMappingVersion });
      } catch (_) { res.status(503).json({ message: 'Unable to save expense mappings. Your previous mappings are unchanged.' }); }
    });
  }
  // References are cached only within one property sync, never across companies.
  function resolver(connection) {
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
      if (result.EntityRef?.value && !result.EntityRef.name) {
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
  return { register, resolver };
};

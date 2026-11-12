'use strict';

// Dates here are inclusive QuickBooks calendar dates, never UTC instants.
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validateRange({ from, to } = {}) {
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Choose valid start and end dates.');
  return { from, to };
}
function expenseAmount(expense) {
  return Number(expense.amount) || 0;
}
function purchaseFields(purchase) {
  if (!purchase.Id || !validDate(purchase.TxnDate) || !Number.isFinite(purchase.TotalAmt)) {
    throw new Error('QuickBooks returned an expense with an invalid ID, date, or amount.');
  }
  const lines = purchase.Line || [];
  const categories = [...new Set(lines.map(line => line.AccountBasedExpenseLineDetail?.AccountRef?.name
    || line.ItemBasedExpenseLineDetail?.ItemRef?.name).filter(Boolean))];
  const rate = purchase.ExchangeRate == null ? 1 : Number(purchase.ExchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('QuickBooks returned an invalid exchange rate.');
  const amount = Math.round(purchase.TotalAmt * rate * (purchase.Credit ? -1 : 1) * 100) / 100;
  return {
    date: purchase.TxnDate, vendor: purchase.EntityRef?.name || '',
    description: lines.map(line => line.Description).filter(Boolean).join(' · ') || purchase.PrivateNote || 'QuickBooks expense',
    category: categories.join(' / ') || 'Uncategorized', amount, receiptTotal: amount,
    salesTax: Math.round((Number(purchase.TxnTaxDetail?.TotalTax) || 0) * rate * (purchase.Credit ? -1 : 1) * 100) / 100, ref: purchase.DocNumber || '',
    status: 'approved'
  };
}

module.exports = function createExpenseSync(context) {
  const scope = propertyId => ({ projectId: propertyId });
  const importKey = (connection, id) => `${connection.environment}:${connection.realmId}:Purchase:${id}`;

  async function savePurchase(connection, propertyId, purchase) {
    const fields = purchaseFields(purchase);
    const key = importKey(connection, purchase.Id);
    const existing = await context.PropertyExpense.findOne({ projectId: propertyId, quickBooksImportKey: key }).lean();
    const quickBooks = { ...existing?.quickBooks, connectionId: connection._id, realmId: connection.realmId,
      environment: connection.environment, entityType: 'Purchase', entityId: String(purchase.Id),
      docNumber: purchase.DocNumber || '', syncToken: purchase.SyncToken, syncStatus: 'synced',
      syncedAt: new Date(), lastError: '', currency: purchase.CurrencyRef?.value || '',
      sourceUpdatedAt: purchase.MetaData?.LastUpdatedTime || '', lines: purchase.Line || [] };
    const update = { ...fields, projectId: propertyId, quickBooksImportKey: key, quickBooks };
    // Property records are independent of construction expenses and estimates.
    if (!existing) update.source = 'quickbooks';
    try {
      await context.PropertyExpense.findOneAndUpdate(existing ? { _id: existing._id, ...scope(propertyId) } : { quickBooksImportKey: key, projectId: propertyId },
        { $set: update }, { upsert: !existing, new: true, runValidators: true, setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // A unique source key protects retries across server processes.
      const result = await context.PropertyExpense.updateOne({ quickBooksImportKey: key, projectId: propertyId }, { $set: update });
      if (!result.matchedCount) throw new Error('This QuickBooks expense is already linked to a different property.');
    }
    return existing ? 'updated' : 'imported';
  }

  async function synchronize(propertyId, range) {
    const connection = await context.getQbConnection(propertyId);
    const lease = context.crypto.randomUUID();
    const now = new Date();
    const locked = await context.QuickBooksConnection.findOneAndUpdate({ _id: connection._id,
      $or: [{ expenseImportLeaseUntil: { $exists: false } }, { expenseImportLeaseUntil: { $lte: now } }] },
    { $set: { expenseImportLease: lease, expenseImportLeaseUntil: new Date(Date.now() + 120000) } }, { new: true });
    if (!locked) return { busy: true, message: 'Expenses are syncing in another session. Refresh shortly.' };
    const heartbeat = async () => {
      const result = await context.QuickBooksConnection.updateOne({ _id: connection._id, expenseImportLease: lease },
        { $set: { expenseImportLeaseUntil: new Date(Date.now() + 120000) } });
      if (!result.matchedCount) throw new Error('Expense sync session expired. Refresh to retry.');
    };
    const summary = { ...range, startedAt: now, imported: 0, updated: 0, removed: 0, status: 'synced' };
    try {
      // Fetch every page before saving; a failed page must not imply removed records.
      const purchases = new Map();
      for (let start = 1; ; start += 1000) {
        await heartbeat();
        const query = `select * from Purchase where TxnDate >= '${range.from}' and TxnDate <= '${range.to}' orderby Id startposition ${start} maxresults 1000`;
        const response = await context.qbRequest(connection, 'get', `query?query=${encodeURIComponent(query)}`);
        if (!response.QueryResponse) throw new Error('QuickBooks returned an incomplete expense response.');
        const page = response.QueryResponse.Purchase || [];
        for (const purchase of page) purchases.set(String(purchase.Id), purchase);
        if (page.length < 1000) break;
      }
      const previous = await context.PropertyExpense.find({ projectId: propertyId, 'quickBooks.connectionId': connection._id,
        'quickBooks.realmId': connection.realmId, 'quickBooks.environment': connection.environment,
        'quickBooks.entityType': 'Purchase', date: { $gte: range.from, $lte: range.to }, status: { $ne: 'archived' } }).lean();
      const removed = [];
      for (const expense of previous) {
        const id = String(expense.quickBooks.entityId || '');
        if (!id || purchases.has(id)) continue;
        await heartbeat();
        // Read by ID to distinguish a changed date from an actual deletion.
        try {
          const result = await context.qbRequest(connection, 'get', `purchase/${encodeURIComponent(id)}`);
          if (!result.Purchase) throw new Error('QuickBooks returned an incomplete expense response.');
          purchases.set(id, result.Purchase);
        } catch (error) {
          const errors = error.response?.data?.Fault?.Error || [];
          if (!errors.some(item => String(item.code) === '610')) throw error;
          removed.push(expense);
        }
      }
      for (const purchase of purchases.values()) {
        await heartbeat();
        summary[await savePurchase(connection, propertyId, purchase)]++;
      }
      for (const expense of removed) {
        await heartbeat();
        await context.PropertyExpense.updateOne({ _id: expense._id, projectId: propertyId },
          { $set: { status: 'archived', 'quickBooks.syncStatus': 'deleted', 'quickBooks.syncedAt': new Date() } });
        summary.removed++;
      }
      summary.completedAt = new Date();
      await context.QuickBooksConnection.updateOne({ _id: connection._id, expenseImportLease: lease },
        { $set: { lastExpenseImportAt: summary.completedAt }, $push: { expenseImportHistory: { $each: [summary], $slice: -20 } } });
      return summary;
    } catch (error) {
      summary.status = 'failed';
      summary.message = String(error.response?.data?.Fault?.Error?.[0]?.Message || error.message).slice(0, 500);
      summary.completedAt = new Date();
      await context.QuickBooksConnection.updateOne({ _id: connection._id, expenseImportLease: lease },
        { $push: { expenseImportHistory: { $each: [summary], $slice: -20 } } });
      return summary;
    } finally {
      await context.QuickBooksConnection.updateOne({ _id: connection._id, expenseImportLease: lease },
        { $unset: { expenseImportLease: '', expenseImportLeaseUntil: '' } });
    }
  }

  function register() {
    context.app.post('/api/properties/:propertyId/expenses/sync', context.authenticateManagerProfile, async (req, res) => {
      let range;
      try { range = validateRange(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
      const propertyId = req.params.propertyId;
      if (!context.mongoose.Types.ObjectId.isValid(propertyId)) return res.status(400).json({ message: 'Invalid property.' });
      try {
        if (!await context.Project.findById(propertyId).select('_id')) return res.status(404).json({ message: 'Property not found.' });
        let sync;
        const connection = await context.QuickBooksConnection.findOne({ projectId: propertyId }).lean();
        if (!connection || connection.status === 'disconnected') sync = { disconnected: true, message: 'Connect this property to QuickBooks to sync expenses.' };
        else {
          try { sync = await synchronize(propertyId, range); }
          catch (error) { sync = { status: 'failed', message: 'Unable to connect to QuickBooks. Check the connection and refresh.' }; }
        }
        const records = await context.PropertyExpense.find({ ...scope(propertyId), status: 'approved', date: { $gte: range.from, $lte: range.to } }).lean();
        const expenses = records.map(item => ({ _id: item._id, date: item.date,
          vendor: item.vendor || '', description: item.description || '', category: item.category || 'Uncategorized',
          amount: expenseAmount(item), source: 'QuickBooks', status: item.quickBooks?.syncStatus || item.status }));
        expenses.sort((a, b) => b.date.localeCompare(a.date));
        const latest = await context.QuickBooksConnection.findOne({ projectId: propertyId }).select('lastExpenseImportAt expenseImportHistory companyName').lean();
        res.json({ expenses, range, sync, companyName: latest?.companyName || '', lastSyncedAt: latest?.lastExpenseImportAt || null,
          history: (latest?.expenseImportHistory || []).slice().reverse() });
      } catch (error) {
        res.status(500).json({ message: 'Unable to load expenses. Refresh to retry.' });
      }
    });
  }
  return { register, synchronize, savePurchase };
};
module.exports.validateRange = validateRange;
module.exports.purchaseFields = purchaseFields;
module.exports.expenseAmount = expenseAmount;

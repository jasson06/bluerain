'use strict';

// Derive links from invoice lines rather than persisting a second, staleable link.
module.exports = async function withMaintenanceInvoices(Invoice, value) {
  const isList = Array.isArray(value);
  const records = (isList ? value : [value]).map(record => record.toObject ? record.toObject() : { ...record });
  const pairs = new Map();
  const pairKey = (estimateId, itemId) => estimateId && itemId ? `${estimateId}:${itemId}` : '';
  const register = (record, estimateId, itemId) => {
    const key = pairKey(estimateId, itemId);
    if (!key) return;
    if (!pairs.has(key)) pairs.set(key, { estimateId, itemId, records: new Set() });
    pairs.get(key).records.add(record);
  };
  for (const record of records) {
    record.invoices = [];
    register(record, record.linkedEstimateId, record.linkedEstimateItemId);
    if (Array.isArray(record.history)) {
      record.history = record.history.map(entry => {
        const copy = { ...entry, invoices: [] };
        register(copy, entry.estimateId, entry.estimateItemId);
        register(record, entry.estimateId, entry.estimateItemId);
        return copy;
      });
    }
  }
  if (pairs.size) {
    const invoices = await Invoice.find({
      $or: [...pairs.values()].map(({ estimateId, itemId }) => ({
        lineItems: { $elemMatch: { estimateId, itemId } }
      }))
    }).select('_id invoiceNumber date status lineItems').sort({ createdAt: -1 }).lean();
    for (const invoice of invoices) {
      const amounts = new Map();
      for (const line of invoice.lineItems || []) {
        const key = pairKey(line.estimateId, line.itemId);
        if (!pairs.has(key)) continue;
        const amount = Number(line.total ?? Number(line.quantity || 0) * Number(line.unitPrice || 0));
        if (!Number.isFinite(amount)) throw new Error(`Invalid billed amount in invoice ${invoice._id}`);
        amounts.set(key, (amounts.get(key) || 0) + amount);
      }
      const recipients = new Map();
      for (const [key, amount] of amounts) {
        for (const record of pairs.get(key).records) {
          recipients.set(record, (recipients.get(record) || 0) + amount);
        }
      }
      for (const [record, amount] of recipients) {
        record.invoices.push({
          _id: invoice._id, invoiceNumber: invoice.invoiceNumber,
          date: invoice.date, status: invoice.status, amount
        });
      }
    }
  }
  return isList ? records : records[0];
};

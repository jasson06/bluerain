'use strict';
const groups = {
  electricity: 'Utilities / Electricity', water: 'Utilities / Water & Sewer', gas: 'Utilities / Gas',
  trashSewer: 'Utilities / Trash', internet: 'Utilities / Internet', maintenance: 'Maintenance & Repairs',
  monthlyDebt: 'Mortgage / Debt Payments', insurance: 'Insurance', propertyTax: 'Property Tax',
  bankFees: 'Bank Fees', processingFees: 'Processing Fees', contractServices: 'Contract Services',
  payroll: 'Payroll', administrative: 'Administrative', managementFee: 'Management Fees', other: 'Other Operating Expenses',
  returnedRent: 'Returned Rent / NSF Adjustments', depositTransfer: 'Tenant Deposit Transfers'
};
const nonOperating = new Set(['monthlyDebt', 'returnedRent', 'depositTransfer']);
const cents = n => Math.round(Number(n || 0) * 100);
function validateMappings(rows) {
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('Choose valid expense mappings.');
  const seen = new Set();
  return rows.map(row => {
    const accountId = String(row.accountId || '');
    if (!/^[0-9]+$/.test(accountId) || seen.has(accountId) || !groups[row.group]) throw new Error('Each account needs one valid reporting group.');
    seen.add(accountId);
    return { accountId, group: row.group };
  });
}
function allocate(purchase, mappings = []) {
  const byId = new Map(mappings.map(row => [String(row.accountId), row.group]));
  const lines = (purchase.Line || []).filter(line => line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail);
  if (!Number.isFinite(Number(purchase.TotalAmt)) || lines.some(line => !Number.isFinite(Number(line.Amount)))) throw new Error('QuickBooks returned an invalid allocation amount.');
  const raw = lines.map(line => cents(line.Amount));
  const sum = raw.reduce((a, b) => a + b, 0), total = cents(purchase.TotalAmt);
  const delta = total - sum;
  if (Math.abs(delta) > 1 && Math.abs(delta - cents(purchase.TxnTaxDetail?.TotalTax)) > 1) throw new Error(`Expense ${purchase.Id}: line amounts do not reconcile with the transaction total.`);
  if (!sum && total) throw new Error(`Expense ${purchase.Id}: missing allocation amounts.`);
  const rate = purchase.ExchangeRate == null ? 1 : Number(purchase.ExchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid expense exchange rate.');
  const sign = purchase.Credit ? -1 : 1;
  let cumulative = 0, previous = 0;
  const all = lines.map((line, index) => {
    const ref = line.AccountBasedExpenseLineDetail?.AccountRef || line.ItemBasedExpenseLineDetail?.ItemAccountRef || {};
    cumulative += raw[index];
    const rounded = Math.round((sum ? cumulative / sum * total : cumulative) * rate) * sign;
    const amount = (rounded - previous) / 100; previous = rounded;
    return { lineId: String(line.Id || index), accountId: String(ref.value || ''), category: ref.name || 'Unresolved account',
      description: line.Description || '', group: byId.get(String(ref.value)), amount };
  });
  const allocations = all.filter(line => line.group && groups[line.group]);
  return { allocations, amount: allocations.reduce((sum, line) => sum + cents(line.amount), 0) / 100,
    originalTotal: Math.round(total * rate) * sign / 100,
    excludedAmount: all.filter(line => !line.group).reduce((sum, line) => sum + cents(line.amount), 0) / 100,
    unmapped: all.filter(line => !line.group).map(({ accountId, category }) => ({ accountId, category })) };
}
function projectRecord(record, connection) {
  if (!record.quickBooks?.purchase) return null; // Legacy imports require a refresh before inclusion.
  if (String(record.quickBooks.realmId) !== String(connection?.realmId) || record.quickBooks.environment !== connection?.environment) return null;
  const mapped = allocate(record.quickBooks.purchase, connection.expenseMappings || []);
  if (!mapped.allocations.length) return null;
  return { ...record, ...mapped, category: [...new Set(mapped.allocations.map(line => line.category))].join(' / ') };
}
module.exports = { groups, nonOperating, validateMappings, allocate, projectRecord };

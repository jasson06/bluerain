const { allocate, validateMappings, projectRecord } = require('../server/property-expense-allocations');
const createMappings = require('../server/property-expense-mappings');
const line = (value, Amount, name = value) => ({ Amount, AccountBasedExpenseLineDetail: { AccountRef: { value, name } } });
const purchase = { Id: '1', TotalAmt: 110, TxnTaxDetail: { TotalTax: 10 }, Line: [line('1', 60), line('2', 40)] };
test('only mapped allocations count, with tax shared and original total preserved', () => {
  expect(allocate(purchase, [{ accountId: '1', group: 'electricity' }])).toMatchObject({ amount: 66, originalTotal: 110, excludedAmount: 44 });
  expect(allocate(purchase, []).allocations).toEqual([]);
});
test('split rounding reconciles in home currency and refunds keep their sign', () => {
  const result = allocate({ ...purchase, Credit: true, ExchangeRate: 1.2345 }, [{ accountId: '1', group: 'electricity' }, { accountId: '2', group: 'monthlyDebt' }]);
  expect(result.amount).toBe(result.originalTotal); expect(result.amount).toBe(-135.8);
});
test('mapping changes reclassify cached records and disabling excludes without deleting', () => {
  const record = { quickBooks: { purchase, realmId: 'a', environment: 'sandbox' } };
  const connection = { realmId: 'a', environment: 'sandbox', expenseMappings: [{ accountId: '1', group: 'monthlyDebt' }] };
  expect(projectRecord(record, connection).allocations[0].group).toBe('monthlyDebt');
  expect(projectRecord(record, { ...connection, expenseMappings: [] })).toBeNull();
  expect(projectRecord(record, { ...connection, realmId: 'other' })).toBeNull();
  expect(record.quickBooks.purchase).toEqual(purchase);
});
test('unknown groups, duplicate IDs and invalid amounts cannot silently enter totals', () => {
  expect(() => validateMappings([{ accountId: '1', group: 'invented' }])).toThrow();
  expect(() => validateMappings([{ accountId: '1', group: 'other' }, { accountId: '1', group: 'other' }])).toThrow();
  expect(() => allocate({ ...purchase, TotalAmt: 999 }, [])).toThrow('reconcile');
});
test('zero-total offsetting allocations retain both amounts', () => {
  const result = allocate({ TotalAmt: 0, Line: [line('1', 20), line('2', -20)] }, [{ accountId: '1', group: 'other' }]);
  expect(result.amount).toBe(20); expect(result.excludedAmount).toBe(-20);
});
test('payees and item expense accounts resolve by ID, with a per-sync cache', async () => {
  const qbRequest = jest.fn(async (_, method, path) => {
    if (path === 'vendor/5') return { Vendor: { DisplayName: 'Construction Company' } };
    if (path === 'item/7') return { Item: { ExpenseAccountRef: { value: '9' } } };
    if (path === 'account/9') return { Account: { FullyQualifiedName: '530-21 OPX:Repairs & maintenance' } };
    throw Error(path);
  });
  const resolve = createMappings({ qbRequest }).resolver({ realmId: 'a' });
  const input = { EntityRef: { value: '5', type: 'Vendor' }, Line: [{ Amount: 10, ItemBasedExpenseLineDetail: { ItemRef: { value: '7', name: 'Plumbing work' } } }] };
  const result = await resolve(input); await resolve(input);
  expect(result.EntityRef.name).toBe('Construction Company');
  expect(result.Line[0].ItemBasedExpenseLineDetail.ItemAccountRef.name).toBe('530-21 OPX:Repairs & maintenance');
  expect(qbRequest).toHaveBeenCalledTimes(3); expect(input.EntityRef.name).toBeUndefined();
});
test('mapping save is isolated from payment mappings and rejects concurrent edits', async () => {
  const routes = {};
  const context = { app: { get: jest.fn(), put: (path, auth, handler) => { routes.save = handler; } }, authenticateManagerProfile: () => {},
    getQbConnection: async () => ({ _id: 'a' }), qbRequest: async () => ({ QueryResponse: { Account: [{ Id: '1', Name: 'Electricity' }] } }),
    QuickBooksConnection: { findOneAndUpdate: jest.fn().mockResolvedValue(null) } };
  createMappings(context).register();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await routes.save({ params: { propertyId: 'p' }, body: { version: 0, mappings: [{ accountId: '1', group: 'electricity' }] } }, res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(context.QuickBooksConnection.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ expenseMappings: [{ accountId: '1', group: 'electricity' }] });
});

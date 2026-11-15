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
  expect(context.QuickBooksConnection.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ expenseMappings: [{ accountId: '1', group: 'electricity' }], expenseExcludedAccountIds: [] });
});

test('mapping activity uses all dates while preview includes only the selected range without ledger writes', async () => {
  const routes = {};
  const qbRequest = jest.fn(async (_, method, path) => {
    const query = decodeURIComponent(path);
    if (query.includes('from Account')) return { QueryResponse: { Account: [
      { Id: '1', Name: 'Electricity', AccountType: 'Expense', Active: true },
      { Id: '2', Name: 'Repairs', AccountType: 'Expense', Active: false }
    ] } };
    if (query.includes('from Purchase')) return { QueryResponse: { Purchase: [
      { ...purchase, TxnDate: '2026-11-01' }, { ...purchase, Id: '2', TxnDate: '2026-11-02', Credit: true, ExchangeRate: 1.5 },
      { Id: '3', TxnDate: '2026-11-03', TotalAmt: 5, Line: [{ Amount: 5, ItemBasedExpenseLineDetail: { ItemRef: { value: '7' } } }] },
      { Id: '4', TxnDate: '2025-01-01', TotalAmt: 0, Line: [line('1', 10), line('1', -10)] }
    ] } };
    if (path === 'item/7') return { Item: { ExpenseAccountRef: { value: '2', name: 'Repairs' } } };
    throw new Error(path);
  });
  const context = {
    app: { get: (url, auth, handler) => { routes[url] = handler; }, put: jest.fn() },
    authenticateManagerProfile: jest.fn(), qbRequest,
    getQbConnection: jest.fn(async () => ({ expenseMappings: [], expenseExcludedAccountIds: ['2'] })),
    PropertyExpense: { findOneAndUpdate: jest.fn() }, QuickBooksConnection: { updateOne: jest.fn() }
  };
  createMappings(context, require('../server/quickbooks-expenses').validateRange).register();
  const handler = routes['/api/properties/:propertyId/expenses/mappings'];
  const range = { from: '2026-11-01', to: '2026-11-30' };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await handler({ params: { propertyId: 'p' }, query: range }, res);
  expect(res.status).not.toHaveBeenCalled();
  const payload = res.json.mock.calls[0][0];
  expect(payload.preview).toEqual({ range, transactions: [
    { id: '1', allocations: [{ accountId: '1', amount: 66 }, { accountId: '2', amount: 44 }] },
    { id: '2', allocations: [{ accountId: '1', amount: -99 }, { accountId: '2', amount: -66 }] },
    { id: '3', allocations: [{ accountId: '2', amount: 5 }] }
  ] });
  expect(payload.accounts[1].active).toBe(false);
  expect(payload.accountActivity).toEqual([{ accountId: '1', count: 3 }, { accountId: '2', count: 3 }]);
  expect(payload.excludedAccountIds).toEqual(['2']);
  expect(context.PropertyExpense.findOneAndUpdate).not.toHaveBeenCalled();
  expect(context.QuickBooksConnection.updateOne).not.toHaveBeenCalled();
  expect(decodeURIComponent(qbRequest.mock.calls[1][2])).toContain('select * from Purchase orderby Id');
  expect(decodeURIComponent(qbRequest.mock.calls[1][2])).not.toContain('TxnDate');
  qbRequest.mockClear();
  await handler({ params: { propertyId: 'p' }, query: { from: "bad' query", to: range.to } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(qbRequest).not.toHaveBeenCalled();
});

test('an incomplete preview page reports an error instead of zero activity', async () => {
  let handler;
  const context = {
    app: { get: (url, auth, fn) => { handler = fn; }, put: jest.fn() },
    authenticateManagerProfile: jest.fn(), getQbConnection: async () => ({}),
    qbRequest: jest.fn().mockResolvedValueOnce({ QueryResponse: { Account: [] } })
      .mockResolvedValueOnce({})
  };
  createMappings(context, require('../server/quickbooks-expenses').validateRange).register();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await handler({ params: { propertyId: 'p' }, query: { from: '2026-11-01', to: '2026-11-30' } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json.mock.calls[0][0].message).toContain('incomplete');
  expect(res.json.mock.calls[0][0].preview).toBeUndefined();
});

test('explicit exclusions validate separately, save atomically, and survive legacy updates', async () => {
  let handler;
  const context = {
    app: { get: jest.fn(), put: (url, auth, fn) => { handler = fn; } }, authenticateManagerProfile: jest.fn(),
    getQbConnection: jest.fn(async () => ({ _id: 'a', expenseExcludedAccountIds: ['2'] })),
    qbRequest: async () => ({ QueryResponse: { Account: [{ Id: '1' }, { Id: '2' }] } }),
    QuickBooksConnection: { findOneAndUpdate: jest.fn().mockResolvedValue({ expenseMappingVersion: 2 }) }
  };
  createMappings(context).register();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { params: { propertyId: 'p' }, body: { version: 1, mappings: [{ accountId: '1', group: 'electricity' }], excludedAccountIds: ['2'] } };
  await handler(req, res);
  expect(context.QuickBooksConnection.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
    $set: { expenseMappings: req.body.mappings, expenseExcludedAccountIds: ['2'] }, $inc: { expenseMappingVersion: 1 }
  });
  expect(res.json.mock.calls[0][0]).toMatchObject({ excludedAccountIds: ['2'], version: 2 });
  delete req.body.excludedAccountIds;
  await handler(req, res);
  expect(context.QuickBooksConnection.findOneAndUpdate.mock.calls[1][1].$set.expenseExcludedAccountIds).toEqual(['2']);
  context.QuickBooksConnection.findOneAndUpdate.mockClear();
  for (const excludedAccountIds of [['1'], ['2', '2'], ['999'], [2], '2']) {
    req.body.excludedAccountIds = excludedAccountIds;
    await handler(req, res);
    expect(res.status).toHaveBeenLastCalledWith(400);
  }
  expect(context.QuickBooksConnection.findOneAndUpdate).not.toHaveBeenCalled();
});

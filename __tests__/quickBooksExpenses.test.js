const createSync = require('../server/quickbooks-expenses');
const { validateRange, purchaseFields, expenseAmount } = createSync;
const connection = { _id: 'connection-a', realmId: 'company-a', environment: 'sandbox' };
const range = { from: '2026-11-01', to: '2026-11-30' };
const purchase = (id = '1', overrides = {}) => ({ Id: id, TxnDate: '2026-11-01', TotalAmt: 108.25,
  EntityRef: { name: 'Hardware store' }, Line: [{ Amount: 100, Description: 'Repair supplies',
    AccountBasedExpenseLineDetail: { AccountRef: { name: 'Repairs' } } }], ...overrides });
const lean = value => ({ lean: () => Promise.resolve(value) });
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(q => matches(row, q));
    if (key === '$and') return value.every(q => matches(row, q));
    const actual = key.split('.').reduce((obj, part) => obj?.[part], row);
    if (value && typeof value === 'object') return Object.entries(value).every(([op, expected]) =>
      op === '$gte' ? actual >= expected : op === '$lte' ? actual <= expected : op === '$ne' ? actual !== expected : false);
    return String(actual) === String(value);
  });
}
function setup(records = []) {
  const rows = records;
  const context = {
    crypto: { randomUUID: () => 'lease-a' }, getQbConnection: jest.fn().mockResolvedValue(connection),
    qbRequest: jest.fn().mockResolvedValue({ QueryResponse: { Purchase: [purchase()] } }),
    QuickBooksConnection: {
      findOneAndUpdate: jest.fn().mockResolvedValue(connection), updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 })
    },
    QuickBooksSyncLog: { findOne: jest.fn(() => lean(null)) },
    PropertyExpense: {
      findOne: jest.fn(query => lean(rows.find(row => matches(row, query)) || null)),
      find: jest.fn(query => lean(rows.filter(row => matches(row, query)))),
      findOneAndUpdate: jest.fn(async (query, update, options) => {
        let row = rows.find(row => matches(row, query));
        if (!row && options.upsert) { row = { _id: `local-${rows.length + 1}` }; rows.push(row); }
        if (row) Object.assign(row, update.$set);
        return row;
      }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 })
    }
  };
  return { context, rows, service: createSync(context) };
}

test('inclusive ranges reject impossible dates, reverse ranges and query injection', () => {
  expect(validateRange(range)).toEqual(range);
  expect(validateRange({ from: '2024-02-29', to: '2024-02-29' })).toBeTruthy();
  for (const from of ['2026-02-29', '2026-11-31', "2026-11-01' or 1=1", null]) {
    expect(() => validateRange({ from, to: range.to })).toThrow();
  }
  expect(() => validateRange({ from: range.to, to: range.from })).toThrow();
});

test('uses tax-inclusive totals, descriptions/categories, signed credits and home currency', () => {
  expect(purchaseFields(purchase())).toMatchObject({ amount: 108.25, receiptTotal: 108.25, category: 'Repairs', vendor: 'Hardware store' });
  expect(purchaseFields(purchase('2', { Credit: true })).amount).toBe(-108.25);
  expect(purchaseFields(purchase('2', { TotalAmt: 10, ExchangeRate: 1.25 })).amount).toBe(12.5);
  expect(() => purchaseFields(purchase('3', { TotalAmt: NaN }))).toThrow();
  expect(expenseAmount({ amount: 108.25 }, 'p')).toBe(108.25);
});

test('repeated imports update the same property record, including a zeroed/voided amount', async () => {
  const { service, rows } = setup();
  expect(await service.savePurchase(connection, 'p', purchase())).toBe('imported');
  expect(await service.savePurchase(connection, 'p', purchase('1', { TotalAmt: 0 }))).toBe('updated');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ projectId: 'p', amount: 0, status: 'approved', quickBooksImportKey: 'sandbox:company-a:Purchase:1' });
});

test('property imports never query or mutate construction expense records', async () => {
  const { service, context, rows } = setup();
  context.Expense = new Proxy({}, { get() { throw new Error('Construction expenses must stay separate'); } });
  context.QuickBooksSyncLog = new Proxy({}, { get() { throw new Error('Construction export logs must stay separate'); } });
  await service.savePurchase(connection, 'p', purchase());
  await service.savePurchase(connection, 'p', purchase('1', { TotalAmt: 25 }));
  expect(rows).toHaveLength(1);
  expect(rows[0].amount).toBe(25);
});

test('retrieves all pages and never treats a failed page as deletions', async () => {
  const { service, context } = setup();
  context.qbRequest.mockResolvedValueOnce({ QueryResponse: { Purchase: Array.from({ length: 1000 }, (_, i) => purchase(String(i))) } })
    .mockRejectedValueOnce(new Error('Rate limit'));
  const result = await service.synchronize('p', range);
  expect(decodeURIComponent(context.qbRequest.mock.calls[1][2])).toContain('startposition 1001');
  expect(result.status).toBe('failed');
  expect(context.PropertyExpense.findOneAndUpdate).not.toHaveBeenCalled();
  expect(context.PropertyExpense.updateOne).not.toHaveBeenCalled();
  expect(context.QuickBooksConnection.updateOne.mock.calls.at(-1)[1]).toHaveProperty('$unset');
});

test('refreshes an expense whose QuickBooks date moved out of the selected month', async () => {
  const { service, context, rows } = setup();
  await service.savePurchase(connection, 'p', purchase());
  context.qbRequest.mockResolvedValueOnce({ QueryResponse: {} }).mockResolvedValueOnce({ Purchase: purchase('1', { TxnDate: '2026-10-31' }) });
  expect((await service.synchronize('p', range)).updated).toBe(1);
  expect(rows[0].date).toBe('2026-10-31');
});

test('archives confirmed deleted expenses but never archives on a connection failure', async () => {
  const { service, context } = setup();
  await service.savePurchase(connection, 'p', purchase());
  const deleted = { response: { data: { Fault: { Error: [{ code: '610' }] } } } };
  context.qbRequest.mockResolvedValueOnce({ QueryResponse: {} }).mockRejectedValueOnce(deleted);
  expect((await service.synchronize('p', range)).removed).toBe(1);
  expect(context.PropertyExpense.updateOne.mock.calls[0][1].$set.status).toBe('archived');
  context.PropertyExpense.updateOne.mockClear();
  context.qbRequest.mockResolvedValueOnce({ QueryResponse: {} }).mockRejectedValueOnce(new Error('offline'));
  expect((await service.synchronize('p', range)).status).toBe('failed');
  expect(context.PropertyExpense.updateOne).not.toHaveBeenCalled();
});

test('concurrent sync returns busy without querying or mutating expenses', async () => {
  const { service, context } = setup();
  context.QuickBooksConnection.findOneAndUpdate.mockResolvedValue(null);
  expect((await service.synchronize('p', range)).busy).toBe(true);
  expect(context.qbRequest).not.toHaveBeenCalled();
});

test('authenticated route validates range before touching data', async () => {
  const { service, context } = setup();
  context.authenticateManagerProfile = jest.fn();
  context.app = { post: jest.fn() };
  service.register();
  const [path, auth, handler] = context.app.post.mock.calls[0];
  expect(path).toBe('/api/properties/:propertyId/expenses/sync');
  expect(auth).toBe(context.authenticateManagerProfile);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await handler({ body: { from: 'invalid' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(context.getQbConnection).not.toHaveBeenCalled();
});

test('disconnected route returns saved property records only, scoped by date and status', async () => {
  const { service, context } = setup([
    { _id: 'mine', projectId: 'p', date: '2026-11-01', amount: 12, status: 'approved' },
    { _id: 'other', projectId: 'other', date: '2026-11-01', amount: 999, status: 'approved' },
    { _id: 'old', projectId: 'p', date: '2026-10-31', amount: 999, status: 'approved' },
    { _id: 'deleted', projectId: 'p', date: '2026-11-01', amount: 999, status: 'archived' }
  ]);
  context.app = { post: jest.fn() }; context.authenticateManagerProfile = jest.fn();
  context.mongoose = { Types: { ObjectId: { isValid: () => true } } };
  context.Project = { findById: () => ({ select: async () => ({ _id: 'p' }) }) };
  context.QuickBooksConnection.findOne = () => ({ lean: async () => null, select() { return this; } });
  service.register();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await context.app.post.mock.calls[0][2]({ body: range, params: { propertyId: 'p' } }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0]).toMatchObject({ sync: { disconnected: true }, expenses: [{ _id: 'mine', amount: 12 }] });
  expect(context.qbRequest).not.toHaveBeenCalled();
});

test('unique-key conflicts never update a different property', async () => {
  const { service, context } = setup();
  context.PropertyExpense.findOneAndUpdate.mockRejectedValue({ code: 11000 });
  context.PropertyExpense.updateOne.mockResolvedValue({ matchedCount: 0 });
  await expect(service.savePurchase(connection, 'p', purchase())).rejects.toThrow('different property');
  expect(context.PropertyExpense.updateOne.mock.calls[0][0]).toEqual({ quickBooksImportKey: 'sandbox:company-a:Purchase:1', projectId: 'p' });
});

test('a full first page is followed by the next page and all expenses are saved', async () => {
  const { service, context, rows } = setup();
  context.qbRequest.mockResolvedValueOnce({ QueryResponse: { Purchase: Array.from({ length: 1000 }, (_, i) => purchase(String(i))) } })
    .mockResolvedValueOnce({ QueryResponse: { Purchase: [purchase('1000')] } });
  const result = await service.synchronize('p', range);
  expect(result).toMatchObject({ status: 'synced', imported: 1001 });
  expect(rows).toHaveLength(1001);
});

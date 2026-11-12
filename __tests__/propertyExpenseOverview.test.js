const createFlow = require('../server/flows/properties');
function query(value) { return { lean: async () => value, sort() { return this; } }; }
async function overview(expenses) {
  const context = { app: { get: jest.fn() }, mongoose: { Types: { ObjectId: { isValid: () => true } } },
    Project: { findById: () => query({ _id: 'p', propertyProfile: {} }) },
    QuickBooksConnection: { findOne: () => query(null) },
    PropertyExpense: { find: jest.fn(() => query(expenses)) },
    Expense: new Proxy({}, { get() { throw new Error('Construction data must not be read'); } })
  };
  for (const model of ['Tenant', 'Unit', 'Payment', 'MaintenanceRequest', 'MaintenanceSchedule', 'PortfolioTask']) context[model] = { find: () => query([]) };
  createFlow(context).get_api_properties_id_overview();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await context.app.get.mock.calls[0][1]({ params: { id: 'p' }, query: {
    from: '2026-11-01T05:00:00Z', to: '2026-12-01T06:00:00Z', timeZone: 'America/Chicago'
  } }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(context.PropertyExpense.find).toHaveBeenCalledWith({ projectId: 'p', status: 'approved' });
  return res.json.mock.calls[0][0];
}

test('overview reads the property ledger only and includes calendar dates at both month edges', async () => {
  const result = await overview([
    { date: '2026-11-01', amount: 10, category: 'Supplies' },
    { date: '2026-11-30', amount: 15, category: 'Supplies' },
    { date: '2026-10-31', amount: 100 }, { date: '2026-12-01', amount: 200 }
  ]);
  expect(result.financials.postedExpenses).toBe(25);
  expect(result.financials.expenseCount).toBe(2);
  expect(result.financials.operatingExpenses).toBe(25);
});

test('refunds reduce actual property expenses and flow into NOI without a zero floor', async () => {
  const result = await overview([{ date: '2026-11-12', amount: -20, category: 'Supplies' }]);
  expect(result.financials.postedExpenses).toBe(-20);
  expect(result.financials.operatingExpenses).toBe(-20);
  expect(result.financials.estimatedNOI).toBe(20);
});

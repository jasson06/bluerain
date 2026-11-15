const createFlow = require('../server/flows/properties');
function query(value) { return { lean: async () => value, sort() { return this; } }; }
async function overview(expenses, profile = {}, mappings = [{ accountId: '10', group: 'other' }], extra = {}, tracked = []) {
  expenses = expenses.map(row => ({ ...row, quickBooks: { realmId: 'realm', environment: 'sandbox', purchase: { Id: '1', TxnDate: row.date, TotalAmt: Math.abs(row.amount), Credit: row.amount < 0, Line: [{ Amount: Math.abs(row.amount), AccountBasedExpenseLineDetail: { AccountRef: { value: row.accountId || '10', name: row.category || 'Supplies' } } }] } } }));
  const context = { app: { get: jest.fn() }, mongoose: { Types: { ObjectId: { isValid: () => true } } },
    Project: { findById: () => query({ _id: 'p', propertyProfile: profile }) },
    QuickBooksConnection: { findOne: () => query({ realmId: 'realm', environment: 'sandbox', expenseMappings: mappings, ...extra }) },
    PropertyExpense: { find: jest.fn(() => query(expenses)) },
    Expense: new Proxy({}, { get() { throw new Error('Construction data must not be read'); } })
  };
  for (const model of ['Tenant', 'Unit', 'Payment', 'MaintenanceRequest', 'MaintenanceSchedule', 'PortfolioTask']) context[model] = { find: () => query(model === 'MaintenanceRequest' ? tracked : []) };
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


test('mapped actuals replace only the matching saved property amounts', async () => {
  const result = await overview([{ date: '2026-11-12', amount: 40 }], { electricalMonthly: 500, insurancePremium: 1200 }, [{ accountId: '10', group: 'electricity' }]);
  expect(result.financials.expenseBreakdown.electrical).toBe(40);
  expect(result.financials.expenseBreakdown.insurance).toBe(100);
  expect(result.financials.operatingExpenses).toBe(140);
  expect(result.financials.expenseSources.electricity).toBe('QuickBooks actuals');
});
test('successful empty mapped period is zero, never the manual estimate', async () => {
  const result = await overview([], { electricalMonthly: 500 }, [{ accountId: '10', group: 'electricity' }], { expenseImportHistory: [{ status: 'synced', from: '2026-11-01', to: '2026-11-30', mappingVersion: 0 }] });
  expect(result.financials.operatingExpenses).toBe(0);
  expect(result.financials.expenseActualsUnavailable).toBe(false);
});
test('without sync coverage mapped estimates remain excluded and actuals are unavailable', async () => {
  const result = await overview([], { electricalMonthly: 500 }, [{ accountId: '10', group: 'electricity' }]);
  expect(result.financials.operatingExpenses).toBe(0);
  expect(result.financials.expenseActualsUnavailable).toBe(true);
});
test.each(['monthlyDebt', 'returnedRent', 'depositTransfer'])('%s does not inflate operating expense or reduce rent again', async group => {
  const result = await overview([{ date: '2026-11-12', amount: 1000 }], { monthlyDebt: 700 }, [{ accountId: '10', group }]);
  expect(result.financials.operatingExpenses).toBe(0);
  expect(result.financials.rentalIncome).toBe(0);
  if (group === 'monthlyDebt') expect(result.financials.debtPayments).toBe(1000);
});

test('mapped construction payments replace maintenance job totals without modifying the jobs', async () => {
  const jobs = [{ title: 'Repair', cost: 500, completedAt: '2026-11-12T12:00:00Z' }];
  const result = await overview([{ date: '2026-11-12', amount: 600 }], {}, [{ accountId: '10', group: 'maintenance' }], {}, jobs);
  expect(result.financials.maintenanceExpenses).toBe(600);
  expect(result.financials.trackedMaintenanceExpenses).toBe(500);
  expect(result.financials.operatingExpenses).toBe(600);
  expect(jobs[0].cost).toBe(500);
});

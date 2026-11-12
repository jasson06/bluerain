const fs = require('fs');
const path = require('path');
const vm = require('vm');
function setup() {
  const elements = {};
  const get = id => elements[id] ||= { value: '', innerHTML: '', textContent: '', disabled: false, setAttribute: jest.fn() };
  const context = vm.createContext({ document: { getElementById: get },
    state: { currentProperty: { _id: 'p' }, currentTab: 'expenses', propertyOverviewData: {} },
    localStorage: { getItem: () => 'manager-token' },
    fetch: jest.fn(), setTimeout: jest.fn(), renderPropertyOverview: jest.fn(), navigateWorkspaceTab: jest.fn(),
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/expenses.js'), 'utf8'), context);
  return { context, get };
}
const data = (expenses = [], sync = { status: 'synced' }) => ({ expenses, sync, history: [], lastSyncedAt: '2026-11-12T12:00:00Z' });
const response = payload => ({ ok: true, json: async () => payload });

test('calendar presets use inclusive month/year boundaries, including leap days', () => {
  const { context } = setup();
  expect(context.expensePresetRange('month', new Date(2024, 1, 15))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(context.expensePresetRange('lastMonth', new Date(2026, 0, 1))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  expect(context.expensePresetRange('quarter', new Date(2026, 10, 1))).toEqual({ from: '2026-10-01', to: '2026-12-31' });
});

test('opening defaults to this month and automatically syncs with manager authentication', async () => {
  const { context, get } = setup();
  context.fetch.mockResolvedValue(response(data()));
  await context.loadExpenseWorkspace('p');
  expect(get('expenseRange').value).toBe('month');
  const [url, options] = context.fetch.mock.calls[0];
  expect(url).toBe('/api/properties/p/expenses/sync');
  expect(options.headers.Authorization).toBe('Bearer manager-token');
  expect(JSON.parse(options.body)).toEqual(context.expensePresetRange('month'));
  expect(get('expenseSyncStatus').textContent).toContain('up to date');
  expect(context.state.propertyOverviewData).toBeNull();
});

test('custom range triggers sync and invalid dates clear stale totals without a request', async () => {
  const { context, get } = setup();
  context.initializeExpenseWorkspace('p');
  get('expenseFrom').value = '2026-10-01'; get('expenseTo').value = '2026-10-31';
  context.fetch.mockResolvedValue(response(data()));
  context.changeExpenseDates();
  expect(get('expenseRange').value).toBe('custom');
  expect(JSON.parse(context.fetch.mock.calls[0][1].body)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  get('expenseTo').value = '2026-09-01';
  await context.loadExpenseWorkspace('p');
  expect(context.fetch).toHaveBeenCalledTimes(1);
  expect(get('expenseSyncStatus').textContent).toContain('valid');
  expect(get('expenseSummary').textContent).toBe('');
});

test('renders escaped values, signed amounts and filtered totals', async () => {
  const { context, get } = setup();
  context.fetch.mockResolvedValue(response(data([
    { date: '2026-11-01', vendor: '<script>', description: 'Repair', category: 'Maintenance', amount: 100.25, source: 'QuickBooks', status: 'synced' },
    { date: '2026-11-02', vendor: 'Refund', description: 'Returned', category: 'Supplies', amount: -10.25, source: 'QuickBooks', status: 'synced' }
  ])));
  await context.loadExpenseWorkspace('p');
  expect(get('expensesList').innerHTML).toContain('&lt;script>');
  expect(get('expensesList').innerHTML).not.toContain('<script>');
  expect(get('expenseSummary').textContent).toContain('90.00');
  get('expenseSearch').value = 'refund';
  context.renderExpenseWorkspace();
  expect(get('expenseSummary').textContent).toContain('-10.25');
  expect(get('expensesList').innerHTML).not.toContain('Repair');
});

test('a late response cannot overwrite a different range or property', async () => {
  const { context, get } = setup();
  let resolveFirst;
  context.fetch.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce(response(data([], { status: 'failed', message: 'New range failed' })));
  const first = context.loadExpenseWorkspace('p');
  get('expenseFrom').value = '2026-01-01';
  await context.loadExpenseWorkspace('p');
  resolveFirst(response(data())); await first;
  expect(get('expenseSyncStatus').textContent).toContain('New range failed');
  expect(get('expenseSyncStatus').textContent).toContain('may be incomplete');
});

test('overview navigation carries the selected period into the Expenses tab', () => {
  const { context, get } = setup();
  get('overviewRange').value = 'year';
  context.openExpensesFromOverview();
  expect(get('expenseRange').value).toBe('year');
  expect(context.navigateWorkspaceTab).toHaveBeenCalledWith('expenses');
});

test('the dedicated property collection cannot expose construction expense fields', () => {
  const mongoose = require('mongoose');
  const model = require('../server/property-expense-model')(new mongoose.Mongoose());
  expect(model.collection.name).toBe('property_expenses');
  expect(model.schema.path('item')).toBeUndefined();
  expect(model.schema.path('lineItems')).toBeUndefined();
  expect(model.schema.indexes()).toContainEqual([{ quickBooksImportKey: 1 }, { unique: true, background: true }]);
});

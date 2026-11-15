const fs = require('fs');
const path = require('path');
const vm = require('vm');
function setup() {
  const elements = {};
  const get = id => elements[id] ||= { value: '', innerHTML: '', textContent: '', disabled: false, setAttribute: jest.fn() };
  const tabs = ['transactions', 'mappings', 'history'].map(section => ({
    dataset: { expenseWorkspace: section }, classList: { toggle: jest.fn() }, setAttribute: jest.fn()
  }));
  const context = vm.createContext({ document: { getElementById: get, querySelectorAll: () => tabs },
    state: { currentProperty: { _id: 'p' }, currentTab: 'expenses', propertyOverviewData: {} },
    localStorage: { getItem: () => 'manager-token' },
    fetch: jest.fn(), setTimeout: jest.fn(), renderPropertyOverview: jest.fn(), navigateWorkspaceTab: jest.fn(),
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  });
  context.expenseMappingFetch = (...args) => context.fetch(...args);
  context.expenseMappingEditor = null;
  context.openExpenseMappings = jest.fn();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/expenses.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/navigation-properties.js'), 'utf8'), context);
  context.getFilteredApplicationsList = () => [];
  context.renderWorkspaceSidebar = jest.fn();
  context.navigateWorkspaceTab = jest.fn();
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

test('opening defaults to this month and reads saved expenses without importing', async () => {
  const { context, get } = setup();
  context.fetch.mockResolvedValue(response(data()));
  await context.loadExpenseWorkspace('p');
  expect(get('expenseRange').value).toBe('month');
  const [url, options] = context.fetch.mock.calls[0];
  const range = context.expensePresetRange('month');
  expect(url).toBe(`/api/properties/p/expenses?from=${range.from}&to=${range.to}`);
  expect(options.method).toBe('GET');
  expect(options.headers.Authorization).toBe('Bearer manager-token');
  expect(options.body).toBeUndefined();
  expect(get('expenseSyncStatus').textContent).toContain('Showing saved expenses');
  expect(context.state.propertyOverviewData).not.toBeNull();
  await context.loadExpenseWorkspace('p');
  expect(context.fetch.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
});

test('custom range reads saved records and invalid dates clear stale totals without a request', async () => {
  const { context, get } = setup();
  context.initializeExpenseWorkspace('p');
  get('expenseFrom').value = '2026-10-01'; get('expenseTo').value = '2026-10-31';
  context.fetch.mockResolvedValue(response(data()));
  context.changeExpenseDates();
  expect(get('expenseRange').value).toBe('custom');
  expect(context.fetch.mock.calls[0][0]).toBe('/api/properties/p/expenses?from=2026-10-01&to=2026-10-31');
  expect(context.fetch.mock.calls[0][1].method).toBe('GET');
  get('expenseTo').value = '2026-09-01';
  await context.loadExpenseWorkspace('p');
  expect(context.fetch).toHaveBeenCalledTimes(1);
  expect(get('expenseSyncStatus').textContent).toContain('valid');
  expect(get('expenseSummary').textContent).toBe('');
});

test('explicit sync preserves visible rows and posts only the selected range', async () => {
  const { context, get } = setup();
  context.fetch.mockResolvedValueOnce(response(data([
    { date: '2026-11-01', vendor: 'Hardware', category: 'Maintenance', amount: 25 }
  ])));
  await context.loadExpenseWorkspace('p');
  const rows = get('expensesList').innerHTML;
  let finish;
  context.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = context.loadExpenseWorkspace('p', true);
  expect(get('expensesList').innerHTML).toBe(rows);
  expect(get('expenseRefresh').disabled).toBe(true);
  const [url, options] = context.fetch.mock.calls[1];
  expect(url).toBe('/api/properties/p/expenses/sync');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual(context.expensePresetRange('month'));
  finish(response(data()));
  await pending;
  expect(get('expenseRefresh').disabled).toBe(false);
  expect(get('expenseSyncStatus').textContent).toContain('up to date');
  expect(context.state.propertyOverviewData).toBeNull();
});

test('sub-tabs switch panels without starting another import or discarding mapping edits', async () => {
  const { context, get } = setup();
  context.fetch.mockResolvedValue(response({ ...data(), history: [{
    from: '2026-11-01', to: '2026-11-30', completedAt: '2026-11-12T12:00:00Z',
    status: 'failed', message: '<unsafe>', imported: 1, updated: 2, removed: 0
  }] }));
  await context.loadExpenseWorkspace('p');
  context.selectExpenseWorkspace('history');
  expect(get('expenseHistoryPanel').hidden).toBe(false);
  expect(get('expenseTransactionsPanel').hidden).toBe(true);
  expect(get('expenseHistory').innerHTML).toContain('<th>Refreshed</th>');
  expect(get('expenseHistory').innerHTML).toContain('&lt;unsafe>');
  context.selectExpenseWorkspace('mappings');
  expect(context.openExpenseMappings).toHaveBeenCalledTimes(1);
  context.expenseMappingEditor = { propertyId: 'p' };
  context.selectExpenseWorkspace('transactions');
  context.selectExpenseWorkspace('mappings');
  expect(context.openExpenseMappings).toHaveBeenCalledTimes(1);
  expect(context.fetch).toHaveBeenCalledTimes(1);
});

test('busy sync polling reads saved records rather than starting another sync', async () => {
  const { context } = setup();
  context.fetch.mockResolvedValueOnce(response(data([], { busy: true, message: 'Sync running' })))
    .mockResolvedValueOnce(response(data()));
  await context.loadExpenseWorkspace('p', true);
  await context.setTimeout.mock.calls[0][0]();
  expect(context.fetch.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET']);
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

test('expense tab and sidebar counts track the loaded period, not search filters or another property', async () => {
  const { context, get } = setup();
  context.fetch.mockResolvedValueOnce(response(data([
    { date: '2026-11-01', vendor: 'Hardware', category: 'Maintenance', amount: 25 },
    { date: '2026-11-02', vendor: 'Water', category: 'Utilities', amount: 10 }
  ]))).mockResolvedValueOnce(response(data()));
  await context.loadExpenseWorkspace('p');
  expect(get('tabCountExpenses').textContent).toBe(2);
  expect(context.workspaceBadge('expenses')).toBe(2);
  get('expenseSearch').value = 'hardware';
  context.renderExpenseWorkspace();
  expect(get('expenseSummary').textContent).toContain('1 of 2 transactions');
  expect(get('tabCountExpenses').textContent).toBe(2);
  expect(context.workspaceBadge('expenses')).toBe(2);
  context.state.currentProperty = { _id: 'other' };
  context.updateTabCounts();
  expect(get('tabCountExpenses').textContent).toBe(0);
  expect(context.workspaceBadge('expenses')).toBe(0);
  context.state.currentProperty = { _id: 'p' };
  get('expenseFrom').value = '2026-01-01';
  const changedRange = context.loadExpenseWorkspace('p');
  expect(get('tabCountExpenses').textContent).toBe(0);
  await changedRange;
  expect(get('tabCountExpenses').textContent).toBe(0);
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

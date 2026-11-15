const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { groups } = require('../server/property-expense-allocations');
const catalog = () => ({
  accounts: [
    { accountId: '1', name: 'Electricity', type: 'Expense', active: true },
    { accountId: '2', name: 'Repairs & Maintenance', type: 'Expense', active: true },
    { accountId: '3', name: 'Returned rent / NSF', type: 'Expense', active: true },
    { accountId: '4', name: 'Inactive water', type: 'Expense', active: false },
    { accountId: '5', name: '<Old fees>', type: 'Expense', active: false },
    { accountId: '6', name: 'Bank fees', type: 'Expense', active: true }
  ],
  mappings: [{ accountId: '6', group: 'bankFees' }], excludedAccountIds: ['5'], groups, version: 1,
  accountActivity: [{ accountId: '1', count: 1 }, { accountId: '2', count: 2 }, { accountId: '3', count: 1 }],
  preview: { range: { from: '2026-11-01', to: '2026-11-30' }, transactions: [
    { id: 'a', allocations: [{ accountId: '1', amount: 66 }, { accountId: '2', amount: 44 }] },
    { id: 'b', allocations: [{ accountId: '2', amount: -10 }] },
    { id: 'c', allocations: [{ accountId: '3', amount: 20 }] }
  ] }
});
const response = payload => ({ ok: true, json: async () => payload });
function setup() {
  const elements = {};
  const get = id => elements[id] ||= { value: '', checked: false, hidden: false, textContent: '', innerHTML: '', disabled: false };
  const filters = ['needs', 'mapped', 'excluded'].map(filter => ({
    dataset: { mappingFilter: filter }, classList: { toggle: jest.fn() }, setAttribute: jest.fn()
  }));
  const context = vm.createContext({
    document: { getElementById: get, querySelectorAll: () => filters, addEventListener: jest.fn() },
    window: { addEventListener: jest.fn() }, state: { currentProperty: { _id: 'p' }, propertyOverviewData: {} },
    fetch: jest.fn().mockResolvedValue(response(catalog())), confirm: jest.fn().mockReturnValue(true),
    managerSessionRequest: (url, options, fetcher) => fetcher(url, options),
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    selectExpenseWorkspace: jest.fn(), loadExpenseWorkspace: jest.fn().mockResolvedValue(),
  });
  get('expenseFrom').value = '2026-11-01';
  get('expenseTo').value = '2026-11-30';
  get('expenseRange').value = 'month';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/expense-mappings.js'), 'utf8'), context);
  return { context, get };
}

test.each([
  ['Electricity', 'Expense', '', 'electricity'],
  ['530-21 OPX:Repairs & maintenance', 'Expense', '', 'maintenance'],
  ['Office costs', 'Expense', 'OfficeGeneralAdministrativeExpenses', 'administrative'],
  ['Gas', 'Expense', '', 'gas'],
  ['Electricity', 'Bank', '', ''],
  ['Water repairs', 'Expense', '', ''],
  ['MIS OPX x4217 sweep', 'Expense', '', ''],
  ['NSF bank fees', 'Expense', '', ''],
  ['Deposit transfer', 'Other Current Liability', '', ''],
  ['Returned rent', 'Expense', '', ''],
  ['NOPAL', 'Expense', '', '']
])('suggestions require one unambiguous expense match: %s', (name, type, subtype, expected) => {
  expect(setup().context.expenseMappingSuggestion({ name, type, subtype })).toBe(expected);
});

test('starts with needs mapping, prioritizes period activity, and keeps exclusions distinct', async () => {
  const { context, get } = setup();
  await context.openExpenseMappings();
  expect(context.fetch.mock.calls[0][0]).toBe('/api/properties/p/expenses/mappings?from=2026-11-01&to=2026-11-30');
  expect(context.visibleExpenseMappingAccounts().map(account => account.accountId)).toEqual(['2', '1', '3']);
  expect(get('expenseMappingRows').innerHTML).toContain('Suggested:');
  expect(get('expenseMappingRows').innerHTML).not.toContain('Inactive water');
  expect(context.expenseMappingChanges()).toHaveLength(0);
  get('expenseMappingInactive').checked = true;
  context.renderExpenseMappingRows();
  expect(get('expenseMappingRows').innerHTML).toContain('Inactive water');
  context.filterExpenseMappings('excluded');
  expect(get('expenseMappingRows').innerHTML).toContain('&lt;Old fees>');
  context.filterExpenseMappings('mapped');
  expect(get('expenseMappingRows').innerHTML).toContain('Bank fees');
  get('expenseMappingSearch').value = 'missing';
  context.renderExpenseMappingRows();
  expect(get('expenseMappingRows').innerHTML).toContain('No accounts match');
});

test('splits by all-date activity, including history outside the period and zero-net activity, with search across both groups', async () => {
  const { context, get } = setup();
  const payload = catalog();
  payload.accounts.push({ accountId: '7', name: 'Water without activity', type: 'Expense', active: true });
  payload.accounts.push({ accountId: '8', name: 'Water with historical activity', type: 'Expense', active: true });
  payload.accountActivity.push({ accountId: '4', count: 2 }, { accountId: '8', count: 5 });
  payload.preview.transactions.push(
    { id: 'd', allocations: [{ accountId: '4', amount: 10 }] },
    { id: 'e', allocations: [{ accountId: '4', amount: -10 }] }
  );
  context.fetch.mockResolvedValueOnce(response(payload));
  await context.openExpenseMappings();
  const group = key => get('expenseMappingRows').innerHTML.match(new RegExp(`data-mapping-activity="${key}"[^>]*>([\\s\\S]*?)</section>`))[1];
  expect(group('with')).toContain('Inactive water');
  expect(group('with')).toContain('Water with historical activity');
  expect(group('with')).toContain('0 this period');
  expect(group('with')).toContain('0.00');
  expect(group('with')).not.toContain('Water without activity');
  expect(group('without')).toContain('Water without activity');
  expect(group('without')).not.toContain('Inactive water');
  expect(get('expenseMappingRows').innerHTML.indexOf('With transactions'))
    .toBeLessThan(get('expenseMappingRows').innerHTML.indexOf('No transactions'));

  get('expenseMappingSearch').value = 'water';
  context.renderExpenseMappingRows();
  expect(group('with')).toContain('Inactive water');
  expect(group('with')).not.toContain('data-expense-account="1"');
  expect(group('without')).toContain('Water without activity');
  context.selectAllExpenseMappings(true);
  expect(get('expenseMappingSelected').textContent).toBe('3 selected');
  get('expenseMappingBulk').value = 'water';
  context.applyExpenseMappingBulk();
  expect(context.expenseMappingChanges().map(account => account.accountId)).toEqual(['4', '7', '8']);
  context.filterExpenseMappings('mapped');
  expect(group('with')).toContain('Inactive water');
  expect(group('without')).toContain('Water without activity');
  expect(context.fetch).toHaveBeenCalledTimes(1);
});

test('bulk changes survive filters and preview deduplicates transactions with signed allocations', async () => {
  const { context, get } = setup();
  await context.openExpenseMappings();
  get('expenseMappingSearch').value = 'maintenance';
  context.selectAllExpenseMappings(true);
  expect(get('expenseMappingSelected').textContent).toBe('1 selected');
  get('expenseMappingSearch').value = 'electricity';
  context.selectAllExpenseMappings(true);
  get('expenseMappingBulk').value = 'maintenance';
  context.applyExpenseMappingBulk();
  expect(context.expenseMappingChanges()).toHaveLength(2);
  expect(context.expenseMappingImpact()).toMatchObject({ operating: 10000, transactions: 2, affected: 2, monthlyDebt: 0 });
  expect(get('expenseMappingDirty').textContent).toBe('2 unsaved changes');
  expect(get('expenseMappingImpact').textContent).toContain('100.00');
  context.changeExpenseMapping('3', 'returnedRent');
  expect(context.expenseMappingImpact()).toMatchObject({ operating: 10000, returnedRent: 2000, transactions: 3, affected: 3 });
});

test('accepting visible suggestions changes drafts only and never classifies ambiguous accounts', async () => {
  const { context, get } = setup();
  await context.openExpenseMappings();
  context.suggestExpenseMappings();
  expect(context.expenseMappingChanges().map(account => account.accountId)).toEqual(['1', '2']);
  expect(context.fetch).toHaveBeenCalledTimes(1);
  context.filterExpenseMappings('needs');
  expect(get('expenseMappingRows').innerHTML).toContain('Returned rent');
  expect(get('expenseMappingRows').innerHTML).not.toContain('Suggested:');
});

test('cancel and browser navigation protect unsaved drafts', async () => {
  const { context, get } = setup();
  await context.openExpenseMappings();
  context.changeExpenseMapping('1', 'electricity');
  context.confirm.mockReturnValue(false);
  expect(context.closeExpenseMappings()).toBe(false);
  expect(context.expenseMappingChanges()).toHaveLength(1);
  const beforeUnload = context.window.addEventListener.mock.calls.find(([name]) => name === 'beforeunload')[1];
  const event = { preventDefault: jest.fn() };
  beforeUnload(event);
  expect(event.preventDefault).toHaveBeenCalled();
  context.confirm.mockReturnValue(true);
  expect(context.closeExpenseMappings()).toBe(true);
  expect(get('expenseMappingsPanel').hidden).toBe(true);
  expect(context.expenseMappingChanges()).toHaveLength(0);
});

test('save uses all draft accounts, locks edits, persists explicit exclusions and syncs once', async () => {
  const { context, get } = setup();
  await context.openExpenseMappings();
  context.changeExpenseMapping('1', 'electricity');
  context.changeExpenseMapping('2', 'excluded');
  let finish;
  context.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = context.saveExpenseMappings();
  expect(get('expenseMappingSave').disabled).toBe(true);
  expect(context.closeExpenseMappings()).toBe(false);
  context.changeExpenseMapping('1', 'water');
  const [url, options] = context.fetch.mock.calls[1];
  expect(url).toBe('/api/properties/p/expenses/mappings');
  expect(JSON.parse(options.body)).toEqual({
    version: 1, mappings: [{ accountId: '1', group: 'electricity' }, { accountId: '6', group: 'bankFees' }],
    excludedAccountIds: ['2', '5']
  });
  finish(response({ version: 2 }));
  await pending;
  expect(context.loadExpenseWorkspace).toHaveBeenCalledTimes(1);
  expect(context.loadExpenseWorkspace).toHaveBeenCalledWith('p', true);
  expect(context.expenseMappingChanges()).toHaveLength(0);
  expect(get('expenseMappingDirty').textContent).toBe('0 unsaved changes');
});

test('save errors keep draft changes and preview errors do not show successful zero impact', async () => {
  const { context, get } = setup();
  await context.openExpenseMappings();
  context.changeExpenseMapping('1', 'electricity');
  context.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Mappings changed in another session' }) });
  await context.saveExpenseMappings();
  expect(context.expenseMappingChanges()).toHaveLength(1);
  expect(get('expenseMappingMessage').textContent).toContain('another session');
  expect(context.loadExpenseWorkspace).not.toHaveBeenCalled();
  context.closeExpenseMappings();
  context.fetch.mockResolvedValueOnce(response({ ...catalog(), preview: null }));
  await context.openExpenseMappings();
  expect(get('expenseMappingsPanel').innerHTML).toContain('account activity is unavailable');
  expect(get('expenseMappingsPanel').innerHTML).not.toContain('expenseMappingSave');
});

test('a period change while the preview is loading cannot display stale activity', async () => {
  const { context, get } = setup();
  let finish;
  context.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = context.openExpenseMappings();
  get('expenseFrom').value = '2026-10-01';
  finish(response(catalog()));
  await pending;
  expect(get('expenseMappingsPanel').innerHTML).toContain('selected period changed');
  expect(get('expenseMappingsPanel').innerHTML).not.toContain('expenseMappingSave');
  expect(context.expenseMappingChanges()).toHaveLength(0);
});

test('canceling discard restores the mapping period and prevents switching properties', async () => {
  const { context, get } = setup();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/expenses.js'), 'utf8'), context);
  context.updateTabCounts = jest.fn();
  context.initializeExpenseWorkspace('p');
  get('expenseFrom').value = '2026-11-01';
  get('expenseTo').value = '2026-11-30';
  await context.openExpenseMappings();
  context.changeExpenseMapping('1', 'electricity');
  context.confirm.mockReturnValue(false);
  get('expenseFrom').value = '2026-10-01';
  get('expenseRange').value = 'custom';
  await context.loadExpenseWorkspace('p');
  expect(get('expenseFrom').value).toBe('2026-11-01');
  expect(get('expenseRange').value).toBe('month');
  expect(context.expenseMappingChanges()).toHaveLength(1);
  expect(context.fetch).toHaveBeenCalledTimes(1);

  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/navigation-properties.js'), 'utf8'), context);
  await context.selectProperty('other');
  expect(context.state.currentProperty._id).toBe('p');
  expect(context.expenseMappingChanges()).toHaveLength(1);
});

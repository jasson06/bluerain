const createSchedules = require('../server/flows/maintenance-schedules');
const createEstimates = require('../server/flows/maintenance-estimates');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup({ daysUntilDue = 7, status = 'in-progress', linked = true, historical = false, existingItem = false } = {}) {
  const due = new Date(2026, 9, 21 + daysUntilDue, 12);
  const schedule = {
    _id: 'schedule-a', projectId: 'property-a', title: 'Inspection',
    description: 'Original description', frequency: 'monthly', intervalDays: null,
    startDate: new Date(2026, 8, 21, 12), nextScheduledDate: due, status, cost: 10,
    linkedEstimateId: linked ? 'estimate-a' : null,
    linkedEstimateItemId: existingItem ? 'item-a' : null,
    history: historical ? [{ estimateItemId: 'old-item' }] : []
  };
  schedule.save = jest.fn(async () => schedule);
  const items = [];
  if (historical) items.push({ _id: 'old-item', maintenanceScheduleId: schedule._id, name: 'Previous visit', total: 10 });
  if (existingItem) items.push({ _id: 'item-a', maintenanceScheduleId: schedule._id, name: 'Inspection', total: 10 });
  const estimate = {
    _id: 'estimate-a', title: 'Recurring maintenance',
    lineItems: [{ category: 'Maintenance', items }],
    markModified: jest.fn(),
    save: jest.fn(async () => {
      items.forEach((item, index) => { if (!item._id) item._id = `new-item-${index}`; });
    })
  };
  let handler;
  const context = {
    app: { put: (url, fn) => { handler = fn; } },
    MaintenanceSchedule: {
      findOne: jest.fn(async () => schedule),
      findById: jest.fn(async () => schedule)
    },
    Estimate: {
      findById: jest.fn(async () => estimate),
      findOne: jest.fn(async () => estimate)
    },
    getRecurringMaintenanceEstimateTitle: () => estimate.title,
    getRecurringMaintenanceUnitLabel: async () => '',
    getEstimateItemStatusFromMaintenanceStatus: value => value,
    calculateEstimateTotal: categories => categories.flatMap(category => category.items).reduce((sum, item) => sum + item.total, 0),
    syncVendorAssignedEstimateItem: jest.fn(),
    ensureVendorProjectAssignment: jest.fn(),
    maintenanceQC: { complete: jest.fn(async () => schedule) },
    maintenanceQCError: jest.fn((res, error) => { throw error; })
  };
  Object.assign(context, createSchedules(context));
  context.updateNextScheduledDates = jest.fn();
  context.syncMaintenanceScheduleToEstimate = jest.fn(createEstimates(context).syncMaintenanceScheduleToEstimate);
  context.put_api_properties_propertyId_maintenance_schedules_scheduleId();
  const sendUpdate = async body => {
    const req = {
      params: { propertyId: schedule.projectId, scheduleId: schedule._id },
      body
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), set: jest.fn() };
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(schedule);
    return res;
  };
  const edit = async (overrides = {}) => {
    return sendUpdate({
        title: 'Updated inspection', description: 'Updated description',
        frequency: schedule.frequency, startDate: new Date(schedule.startDate).toISOString(),
        status: schedule.status, cost: 25, ...overrides
    });
  };
  return { context, schedule, estimate, items, edit, sendUpdate };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 21, 16));
});

afterEach(() => jest.useRealTimers());

test.each([
  [-1, false], [0, true], [1, true], [2, false], [7, false]
])('editing a visit due in %i days gates creation to today and tomorrow', async (daysUntilDue, creates) => {
  const { context, items, edit } = setup({ daysUntilDue });
  await edit();
  expect(context.syncMaintenanceScheduleToEstimate).toHaveBeenCalledWith(
    expect.any(Object), { createIfMissing: creates }
  );
  expect(items).toHaveLength(creates ? 1 : 0);
});

test.each(['pending', 'in-progress'])('due %s schedules create only one item across repeated edits', async status => {
  const { items, edit } = setup({ daysUntilDue: 1, status, linked: false });
  await edit();
  await edit({ cost: 40 });
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ name: 'Updated inspection', total: 40 });
});

test('editing after completion does not create the next visit or modify historical items', async () => {
  const { items, edit } = setup({ historical: true, status: 'pending' });
  await edit();
  expect(items).toEqual([{ _id: 'old-item', maintenanceScheduleId: 'schedule-a', name: 'Previous visit', total: 10 }]);
});

test('existing future visit items still receive edits without creating duplicates', async () => {
  const { items, edit } = setup({ existingItem: true });
  await edit();
  await edit();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ _id: 'item-a', name: 'Updated inspection', description: 'Updated description', total: 25 });
});

test('a future schedule without an estimate does not create one', async () => {
  const { context, edit } = setup({ linked: false });
  context.Estimate.findOne.mockResolvedValue(null);
  await edit();
  expect(context.syncVendorAssignedEstimateItem).not.toHaveBeenCalled();
});

test('creation uses the recalculated next date when recurrence settings change', async () => {
  const { schedule, items, edit } = setup({ daysUntilDue: 0 });
  await edit({ frequency: 'yearly' });
  expect(schedule.nextScheduledDate.getFullYear()).toBe(2027);
  expect(items).toHaveLength(0);
});

test.each([0, 1, 2])('changing the start date checks the resulting visit due in %i days', async daysUntilDue => {
  const { context, items, edit } = setup();
  const startDate = new Date(2026, 9, 20 + daysUntilDue, 12);
  await edit({ startDate: startDate.toISOString(), frequency: 'daily' });
  expect(context.updateNextScheduledDates).toHaveBeenCalledWith('schedule-a');
  expect(items).toHaveLength(daysUntilDue < 2 ? 1 : 0);
});

test.each([
  [new Date(2026, 9, 21, 0), true],
  [new Date(2026, 9, 22, 23, 59, 59, 999), true],
  [new Date(2026, 9, 23, 0), false]
])('creation checks calendar-day boundaries for %s', async (nextScheduledDate, creates) => {
  const { schedule, items, edit } = setup();
  schedule.nextScheduledDate = nextScheduledDate;
  await edit();
  expect(items).toHaveLength(creates ? 1 : 0);
});

test('tomorrow includes the full calendar day across a daylight saving change', async () => {
  jest.setSystemTime(new Date(2026, 9, 31, 12));
  const { schedule, items, edit } = setup();
  schedule.nextScheduledDate = new Date(2026, 10, 1, 23, 59);
  await edit();
  expect(items).toHaveLength(1);
});

test('completion through editing retains explicit line-item creation and QC submission', async () => {
  const { context, schedule, edit } = setup();
  await edit({ status: 'completed', expectedNextScheduledDate: schedule.nextScheduledDate.toISOString() });
  expect(context.syncMaintenanceScheduleToEstimate).toHaveBeenCalledWith(schedule, { createIfMissing: true });
  expect(context.maintenanceQC.complete).toHaveBeenCalled();
});

function setupInlineCard(options = {}) {
  const server = setup({ status: 'pending', ...options });
  server.schedule.startDate = new Date(2026, 8, 1, 12);
  const schedule = JSON.parse(JSON.stringify(server.schedule));
  const state = {
    currentProperty: { _id: 'property-a' }, maintenanceSchedules: [schedule],
    portfolioRecurringMaintenance: []
  };
  const listeners = {};
  const read = name => fs.readFileSync(path.join(__dirname, '../dist/property-management/js', name), 'utf8');
  const context = vm.createContext({
    state, window: {}, API_URL: '/api', console,
    document: {
      getElementById: id => ({ addEventListener: (type, handler) => { listeners[`${id}:${type}`] = handler; } })
    },
    fetch: jest.fn(async (url, request) => {
      const res = await server.sendUpdate(JSON.parse(request.body));
      return {
        ok: true, json: async () => JSON.parse(JSON.stringify(server.schedule)),
        headers: { get: name => res.set.mock.calls.find(([header]) => header === name)?.[1] || null }
      };
    }),
    ensureVendorInvitedToProject: jest.fn(),
    refreshPropertyMaintenanceView: jest.fn(), refreshPortfolioMaintenanceItem: jest.fn(),
    showNotification: jest.fn(), setMaintenanceVendorComboboxDisabled: jest.fn(),
    setMaintenanceVendorComboboxLoading: jest.fn()
  });
  const requests = read('maintenance-requests.js');
  vm.runInContext(requests.slice(
    requests.indexOf('function getMaintenanceScheduleUpdateMessage('),
    requests.indexOf('async function updateMaintenanceStatus(')
  ), context);
  const utilities = read('shared-utilities.js');
  vm.runInContext(utilities.slice(
    utilities.indexOf('function dateInputToISOAtNoon('),
    utilities.indexOf('function formatDateForInput(')
  ), context);
  const startup = read('property-management.js');
  vm.runInContext(startup.slice(
    startup.indexOf('async function handlePropertyMaintenanceInlineChange('),
    startup.indexOf('// Photo viewer modal')
  ), context);
  const changeDate = async (value, { portfolio = false } = {}) => {
    const fields = {
      '.recurring-maintenance-inline-vendor': { value: '' },
      '.recurring-maintenance-inline-start-date': { value },
      '.recurring-maintenance-inline-status': { value: 'pending' }
    };
    const card = {
      dataset: { maintId: 'schedule-a', projectId: 'property-a', maintSource: 'recurring' },
      querySelector: selector => fields[selector],
      closest: () => null
    };
    const field = { closest: () => card, matches: () => false };
    if (portfolio) {
      await listeners['portfolioComparisonTable:change']({
        target: {
          closest: selector => selector.startsWith('#portfolioMaintenanceListTable') ? null
            : selector.startsWith('.recurring-maintenance-inline') ? field : card
        }
      });
    } else {
      await listeners['scheduleList:change']({ target: { closest: () => field } });
    }
    expect(card.dataset.isSaving).toBeUndefined();
    expect(fields['.recurring-maintenance-inline-start-date'].disabled).toBe(false);
  };
  return { ...server, browser: context, changeDate, listeners };
}

test.each([
  ['2026-09-21', true], ['2026-09-22', true], ['2026-09-23', false], ['2026-09-20', false]
])('changing the property card start date to %s uses the shared creation window', async (date, creates) => {
  const { browser, items, schedule, changeDate } = setupInlineCard();
  await changeDate(date);
  expect(items).toHaveLength(creates ? 1 : 0);
  expect(browser.fetch).toHaveBeenCalledWith('/api/properties/property-a/maintenance-schedules/schedule-a',
    expect.objectContaining({ method: 'PUT' }));
  expect(browser.state.maintenanceSchedules[0].nextScheduledDate).toBe(schedule.nextScheduledDate.toISOString());
  expect(browser.window.lastLoadedSchedules).toBe(browser.state.maintenanceSchedules);
  expect(browser.refreshPropertyMaintenanceView).toHaveBeenCalled();
  expect(browser.showNotification).toHaveBeenCalledTimes(1);
  expect(browser.showNotification).toHaveBeenLastCalledWith(
    creates ? 'Maintenance created and sent to the linked estimate' : 'Recurring maintenance updated', 'success'
  );
});

test('repeated card date changes keep the existing estimate item in sync', async () => {
  const { items, changeDate, schedule } = setupInlineCard({ existingItem: true });
  await changeDate('2026-09-22');
  await changeDate('2026-09-28');
  expect(items).toHaveLength(1);
  expect(items[0]._id).toBe('item-a');
  expect(items[0].startDate).toBe(schedule.startDate);
  expect(new Date(items[0].startDate).getDate()).toBe(28);
});

test('portfolio inline updates keep working when a different property is open', async () => {
  const { browser, items } = setupInlineCard();
  browser.state.portfolioRecurringMaintenance = browser.state.maintenanceSchedules;
  browser.state.maintenanceSchedules = [];
  browser.state.currentProperty = { _id: 'other-property' };
  await browser.updatePortfolioRecurringMaintenanceSchedule('schedule-a', 'property-a', {
    startDate: browser.dateInputToISOAtNoon('2026-09-22')
  });
  expect(items).toHaveLength(1);
  expect(browser.state.portfolioRecurringMaintenance[0].linkedEstimateItemId).toBe(items[0]._id);
  expect(browser.refreshPropertyMaintenanceView).not.toHaveBeenCalled();
});

test('inline updates preserve the stored start date when only another field changes', async () => {
  const { browser, schedule } = setupInlineCard();
  const startDate = schedule.startDate.toISOString();
  await browser.updatePortfolioRecurringMaintenanceSchedule('schedule-a', 'property-a', { cost: 30 });
  expect(JSON.parse(browser.fetch.mock.calls[0][1].body).startDate).toBe(startDate);
});

test('property request and recurring containers share change and row-click handlers', () => {
  const { listeners } = setupInlineCard();
  expect(listeners['scheduleList:change']).toBe(listeners['maintenanceList:change']);
  expect(listeners['scheduleList:click']).toBe(listeners['maintenanceList:click']);
});

function setupPortfolioCard(options = {}) {
  const result = setupInlineCard(options);
  const { browser, listeners } = result;
  browser.state.portfolioRecurringMaintenance = browser.state.maintenanceSchedules;
  browser.state.maintenanceSchedules = [];
  browser.state.currentProperty = null;
  browser.state.portfolioWorkspaceMode = 'maintenance';
  browser.state.portfolioMaintenanceView = 'card';
  browser.setPortfolioMaintenanceItemSaving = jest.fn();
  const root = {
    dataset: {}, contains: () => true,
    addEventListener: (type, handler) => { listeners[`portfolioComparisonTable:${type}`] = handler; }
  };
  browser.document.getElementById = () => root;
  const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/portfolio-dashboard.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function initializePortfolioMaintenanceWorkspaceCardHandlers(')), browser);
  browser.initializePortfolioMaintenanceWorkspaceCardHandlers();
  return result;
}

test.each([
  ['2026-09-21', true], ['2026-09-22', true], ['2026-09-23', false], ['2026-09-20', false]
])('portfolio overview card date %s mirrors the creation window and toast', async (date, creates) => {
  const { browser, items, changeDate } = setupPortfolioCard();
  await changeDate(date, { portfolio: true });
  expect(items).toHaveLength(creates ? 1 : 0);
  expect(browser.showNotification).toHaveBeenCalledTimes(1);
  expect(browser.showNotification).toHaveBeenLastCalledWith(
    creates ? 'Maintenance created and sent to the linked estimate' : 'Recurring maintenance updated', 'success'
  );
  expect(browser.refreshPortfolioMaintenanceItem).toHaveBeenCalledWith('schedule-a', 'recurring');
});

test('portfolio card repeats update the linked item without repeating the creation toast', async () => {
  const { browser, items, changeDate } = setupPortfolioCard();
  await changeDate('2026-09-22', { portfolio: true });
  await changeDate('2026-09-28', { portfolio: true });
  expect(items).toHaveLength(1);
  expect(new Date(items[0].startDate).getDate()).toBe(28);
  expect(browser.showNotification.mock.calls).toEqual([
    ['Maintenance created and sent to the linked estimate', 'success'],
    ['Recurring maintenance updated', 'success']
  ]);
});

test('creation during date activation is reported even though the final sync updates an existing item', async () => {
  const { context, schedule, edit, items } = setup({ status: 'pending' });
  schedule.startDate = new Date(2026, 8, 1, 12);
  context.updateNextScheduledDates = createSchedules(context).updateNextScheduledDates;
  context.MaintenanceSchedule.find = jest.fn()
    .mockReturnValueOnce({ populate: async () => [schedule] })
    .mockReturnValueOnce({ populate: async () => [] });
  context.sendTodayMaintenanceReminder = jest.fn();
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const res = await edit({ startDate: new Date(2026, 8, 21, 12).toISOString(), frequency: 'monthly' });
    expect(items).toHaveLength(1);
    expect(res.set).toHaveBeenCalledWith('X-Maintenance-Line-Item-Created', 'true');
    expect(context.syncMaintenanceScheduleToEstimate).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
  }
});

test('a vendor sync failure does not emit a success toast', async () => {
  const { browser, context, changeDate } = setupPortfolioCard();
  const error = new Error('Vendor sync failed');
  context.syncVendorAssignedEstimateItem.mockRejectedValue(error);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await changeDate('2026-09-22', { portfolio: true });
    expect(browser.showNotification).toHaveBeenCalledTimes(1);
    expect(browser.showNotification).toHaveBeenCalledWith('Could not update recurring maintenance', 'error');
  } finally {
    log.mockRestore();
  }
});

test.each([true, false])('modal edits show the creation toast only for a new line item (existing: %s)', async existingItem => {
  const { browser, items } = setupInlineCard({ existingItem, daysUntilDue: 1 });
  const values = {
    scheduleTitle: 'Inspection', scheduleDescription: 'Updated description',
    scheduleFrequency: 'monthly', scheduleStartDate: '2026-09-01',
    scheduleVendor: '', scheduleUnit: '', scheduleStatus: 'pending', scheduleCost: '25'
  };
  browser.document.getElementById = id => ({ value: values[id], dataset: {} });
  browser.closeModal = jest.fn();
  browser.hideLoader = jest.fn();
  const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/maintenance-schedules.js'), 'utf8');
  vm.runInContext(source.slice(
    source.indexOf('async function handleUpdateMaintenanceSchedule('),
    source.indexOf('// Delete Maintenance Schedule')
  ), browser);
  await browser.handleUpdateMaintenanceSchedule('schedule-a');
  expect(items).toHaveLength(1);
  expect(browser.showNotification).toHaveBeenCalledTimes(1);
  expect(browser.showNotification).toHaveBeenCalledWith(
    existingItem ? 'Schedule updated!' : 'Maintenance created and sent to the linked estimate', 'success'
  );
});

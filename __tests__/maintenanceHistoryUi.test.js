const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dist = path.join(__dirname, '../dist');
const historySource = fs.readFileSync(path.join(dist, 'maintenance-history.js'), 'utf8');

function setup() {
    const entry = {
        _id: 'entry-a', completedAt: '2026-10-10T12:30:20.123Z', completedBy: 'Vendor',
        notes: 'Original', cost: 50, qcStatus: 'approved'
    };
    const schedule = {
        _id: 'schedule-a', projectId: { _id: 'property-a', name: 'Property' },
        assignedVendor: { _id: 'vendor-a', name: 'Vendor' }, unitId: { _id: 'unit-a', number: '1' },
        __v: 3, history: [entry, { _id: 'entry-b', completedAt: '2026-09-10T12:00:00Z' }]
    };
    const fields = Object.fromEntries(['completedAt', 'completedBy', 'cost', 'notes'].map(name => [name, { value: entry[name], disabled: false }]));
    const cancel = {};
    const errorBox = { textContent: '' };
    const form = {
        reportValidity: jest.fn(() => true),
        querySelector: selector => fields[selector.match(/name="(.*)"/)[1]],
        querySelectorAll: () => Object.values(fields)
    };
    const listeners = {};
    const trigger = { isConnected: true, focus: jest.fn() };
    const dialog = {
        innerHTML: '', setAttribute: jest.fn(), remove: jest.fn(),
        querySelector: selector => ({ form, '[data-cancel]': cancel, '.rm-error': errorBox })[selector],
        addEventListener: (name, handler) => { listeners[name] = handler; },
        showModal: jest.fn(),
        close: jest.fn(() => listeners.close())
    };
    const panel = {
        dataset: { schedule: 'schedule-a', selected: 'entry-a' }, isConnected: true,
        closest: () => ({ querySelector: () => ({ remove: jest.fn() }) })
    };
    const otherPanel = { ...panel, dataset: { ...panel.dataset } };
    const window = {
        syncRecurringHistorySchedule: jest.fn(), showNotification: jest.fn(),
        localStorage: { getItem: key => ({ token: 'test-token', managerId: 'manager-a' })[key] },
        sessionStorage: { getItem: () => null }
    };
    const context = vm.createContext({
        window, Date, URL, location: { origin: 'https://example.test' },
        document: {
            createElement: () => dialog, body: { append: jest.fn() }, documentElement: {},
            addEventListener: jest.fn(),
            querySelectorAll: selector => selector === '.rm-history' ? [panel, otherPanel] : []
        },
        MutationObserver: class { observe() {} },
        fetch: jest.fn(async () => ({
            ok: true, json: async () => ({ schedule: { ...schedule, __v: 4, history: [{ ...entry, notes: 'Updated' }] } })
        }))
    });
    vm.runInContext(historySource.replace(
        '{ render, historyButton, summary, qcBadge }',
        '{ render, historyButton, summary, qcBadge, editHistory, localDateTime }'
    ), context);
    const api = window.RecurringMaintenanceHistory;
    api.render(schedule);
    fields.completedAt.value = api.localDateTime(entry.completedAt);
    const open = action => api.editHistory(panel, entry._id, action, trigger);
    const submit = () => form.onsubmit({ preventDefault: jest.fn() });
    return { api, schedule, entry, fields, cancel, form, errorBox, listeners, dialog, panel, otherPanel, trigger, context, window, open, submit };
}

test('each completion has separate accessible hover edit and delete controls', () => {
    const { api, schedule } = setup();
    const html = api.render(schedule);
    expect((html.match(/data-history-action="edit"/g) || [])).toHaveLength(2);
    expect((html.match(/data-history-action="delete"/g) || [])).toHaveLength(2);
    expect(html).toContain('aria-label="Edit completion');
    expect(html).toContain('aria-label="Delete completion');
    expect(html).toContain('class="rm-history-entry"');
    const css = fs.readFileSync(path.join(dist, 'maintenance-history.css'), 'utf8');
    expect(css).toContain('.rm-history-entry:hover .rm-entry-actions');
    expect(css).toContain('.rm-history-entry:focus-within .rm-entry-actions');
    expect(css).toContain('@media (hover:none)');
});

test.each(['edit', 'delete'])('the delegated %s icon opens its history dialog instead of selecting the visit', action => {
    const { context, panel, dialog } = setup();
    const button = { dataset: { historyAction: action, entry: 'entry-a' } };
    const target = { closest: selector => selector === '.rm-history' ? panel : selector === 'button' ? button : null };
    const handler = context.document.addEventListener.mock.calls.find(([name, , capture]) => name === 'click' && !capture)[1];
    handler({ target });
    expect(dialog.showModal).toHaveBeenCalled();
    expect(context.fetch).not.toHaveBeenCalled();
});

test('editing sends only allowed fields with manager credentials and preserves unchanged date precision', async () => {
    const { fields, dialog, context, window, panel, otherPanel, entry, open, submit } = setup();
    open('edit');
    expect(dialog.innerHTML).toContain('Photos and QC records will be preserved.');
    expect(dialog.showModal).toHaveBeenCalled();
    fields.notes.value = 'Updated';
    fields.cost.value = '75';
    await submit();
    const [url, options] = context.fetch.mock.calls[0];
    expect(url).toBe('/api/properties/property-a/maintenance-schedules/schedule-a/history/entry-a');
    expect(options.method).toBe('PATCH');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-token', 'X-Manager-Id': 'manager-a' });
    expect(JSON.parse(options.body)).toEqual({
        expectedVersion: 3, managerId: 'manager-a', completedAt: entry.completedAt,
        completedBy: 'Vendor', cost: 75, notes: 'Updated'
    });
    expect(window.syncRecurringHistorySchedule).toHaveBeenCalledWith(expect.objectContaining({
        __v: 4, projectId: { _id: 'property-a', name: 'Property' },
        assignedVendor: { _id: 'vendor-a', name: 'Vendor' }
    }));
    expect(panel.outerHTML).toContain('data-selected="entry-a"');
    expect(otherPanel.outerHTML).toBe(panel.outerHTML);
    expect(window.showNotification).toHaveBeenCalledWith('Completion history updated', 'success');
    expect(dialog.close).toHaveBeenCalled();
});

test('a changed local completion date is sent as the corresponding ISO timestamp', async () => {
    const { fields, context, open, submit } = setup();
    open('edit');
    fields.completedAt.value = '2026-10-09T13:45:30';
    await submit();
    expect(JSON.parse(context.fetch.mock.calls[0][1].body).completedAt).toBe(new Date(fields.completedAt.value).toISOString());
});

test('unchanged whole-minute inputs retain the original milliseconds', async () => {
    const { api, entry, fields, context, open, submit } = setup();
    entry.completedAt = '2026-10-10T12:30:00.123Z';
    fields.completedAt.value = api.localDateTime(entry.completedAt);
    expect(fields.completedAt.value).toMatch(/T\d\d:\d\d$/);
    open('edit');
    await submit();
    expect(JSON.parse(context.fetch.mock.calls[0][1].body).completedAt).toBe(entry.completedAt);
});

test('delete requires confirmation and selects a remaining entry after success', async () => {
    const { context, schedule, panel, window, dialog, open, submit } = setup();
    context.fetch.mockResolvedValue({
        ok: true, json: async () => ({ schedule: { ...schedule, __v: 4, history: [schedule.history[1]] } })
    });
    open('delete');
    expect(dialog.innerHTML).toContain('This cannot be undone.');
    expect(dialog.innerHTML).not.toContain('name="cost"');
    expect(context.fetch).not.toHaveBeenCalled();
    await submit();
    expect(context.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(JSON.parse(context.fetch.mock.calls[0][1].body)).toEqual({ expectedVersion: 3, managerId: 'manager-a' });
    expect(panel.outerHTML).toContain('data-selected="entry-b"');
    expect(panel.outerHTML).not.toContain('data-entry="entry-a"');
    expect(window.showNotification).toHaveBeenCalledWith('Completion history deleted', 'success');
});

test('deleting the final entry renders an empty history without stale visit details', async () => {
    const { context, schedule, panel, open, submit } = setup();
    const remove = jest.fn();
    panel.closest = () => ({ querySelector: () => ({ remove }) });
    context.fetch.mockResolvedValue({ ok: true, json: async () => ({ schedule: { ...schedule, history: [] } }) });
    open('delete');
    await submit();
    expect(panel.outerHTML).toContain('No completion history yet.');
    expect(panel.outerHTML).toContain('data-selected=""');
    expect(remove).toHaveBeenCalled();
});

test('cancel makes no changes and restores keyboard focus', () => {
    const { context, cancel, trigger, dialog, open } = setup();
    open('delete');
    cancel.onclick();
    expect(context.fetch).not.toHaveBeenCalled();
    expect(dialog.remove).toHaveBeenCalled();
    expect(trigger.focus).toHaveBeenCalled();
});

test('server failures remain visible in the editor and do not emit success', async () => {
    const { context, errorBox, dialog, panel, fields, window, open, submit } = setup();
    context.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'This schedule changed. Refresh before changing completion history.' }) });
    open('edit');
    await submit();
    expect(errorBox.textContent).toContain('This schedule changed.');
    expect(dialog.close).not.toHaveBeenCalled();
    expect(window.showNotification).not.toHaveBeenCalled();
    expect(window.syncRecurringHistorySchedule).not.toHaveBeenCalled();
    expect(panel.dataset.saving).toBeUndefined();
    expect(fields.notes.disabled).toBe(false);
});

test('saving blocks duplicate submission and escape until the request finishes', async () => {
    const { context, open, submit, listeners, panel } = setup();
    let finish;
    context.fetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    open('edit');
    const first = submit();
    await submit();
    const event = { preventDefault: jest.fn() };
    listeners.cancel(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(context.fetch).toHaveBeenCalledTimes(1);
    expect(panel.dataset.saving).toBe('true');
    finish({ ok: false, json: async () => ({ message: 'Failed' }) });
    await first;
});

test.each(['renderPropertyRecurringMaintenanceCard', 'renderPortfolioRecurringMaintenanceCard'])('%s omits the creation date while preserving the next visit', name => {
    const workflow = fs.readFileSync(path.join(dist, 'property-management/js/maintenance-workflow.js'), 'utf8');
    const schedules = fs.readFileSync(path.join(dist, 'property-management/js/maintenance-schedules.js'), 'utf8');
    const context = vm.createContext({
        state: { currentProperty: { _id: 'property-a' } },
        window: { RecurringMaintenanceHistory: { qcBadge: () => '' } },
        formatDateDisplay: value => `formatted:${value}`,
        getPortfolioMaintenanceRenderContext: () => ({ projectId: 'property-a', propertyLabel: 'Property', unitLabel: 'None' }),
        getPortfolioMaintenanceSavingIndicator: () => '',
        getRecurringMaintenanceDisplayDate: item => item.startDate,
        formatMaintenanceCost: () => '$50',
        renderScheduleHistory: () => '', renderMaintenanceDescriptionPanel: () => '',
        renderRecurringMaintenanceInlineEditor: () => '', renderMaintenanceActions: () => ''
    });
    const source = name.includes('Portfolio') ? workflow : schedules;
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    const frequencyStart = workflow.indexOf('function getRecurringMaintenanceFrequencyLabel(');
    vm.runInContext(workflow.slice(frequencyStart, workflow.indexOf('\nfunction ', frequencyStart + 1)), context);
    vm.runInContext(source.slice(start, end), context);
    const schedule = {
        _id: 'schedule-a', title: 'Inspection', frequency: 'monthly', history: [],
        createdAt: '2026-09-01', nextScheduledDate: '2026-11-10', startDate: '2026-10-10'
    };
    const html = context[name](schedule);
    expect(html).not.toContain('Created:');
    expect(html).not.toContain('formatted:2026-09-01');
    expect(html).toContain('formatted:2026-11-10');
    expect(context[name]({ ...schedule, createdAt: null })).not.toContain('Created:');
});

test('the recurring-maintenance modal has no creation-date field', () => {
    const html = fs.readFileSync(path.join(dist, 'property-management.html'), 'utf8');
    expect(html).not.toContain('scheduleCreatedAt');
});

test.each([
    ['daily', null, 'Daily'],
    ['weekly', null, 'Weekly'],
    ['monthly', null, 'Monthly'],
    ['yearly', null, 'Yearly'],
    ['custom', 14, 'Every 14 days'],
    ['custom', 1, 'Every 1 day'],
    ['custom', null, 'Custom interval'],
    [undefined, null, 'Not specified']
])('recurring cards and rows display frequency %s with interval %s as %s', (frequency, intervalDays, label) => {
    const workflow = fs.readFileSync(path.join(dist, 'property-management/js/maintenance-workflow.js'), 'utf8');
    const schedules = fs.readFileSync(path.join(dist, 'property-management/js/maintenance-schedules.js'), 'utf8');
    const context = vm.createContext({
        state: { currentProperty: { _id: 'property-a' } },
        window: { RecurringMaintenanceHistory: { qcBadge: () => '', historyButton: () => '' } },
        formatDateDisplay: value => value,
        getPortfolioMaintenanceRenderContext: () => ({ projectId: 'property-a', propertyLabel: 'Property', unitLabel: 'None' }),
        getPortfolioMaintenanceSavingIndicator: () => '',
        getRecurringMaintenanceDisplayDate: item => item.startDate,
        getRecurringMaintenanceStatusOptionsHtml: () => '',
        renderMaintenanceVendorCombobox: () => '',
        formatMaintenanceCost: () => '$50',
        renderScheduleHistory: () => '',
        renderMaintenanceDescriptionPanel: () => '',
        renderMaintenanceDescriptionTable: () => '',
        renderRecurringMaintenanceInlineEditor: () => '',
        renderMaintenanceActions: () => ''
    });
    const load = (source, name) => {
        const start = source.indexOf(`function ${name}(`);
        const end = source.indexOf('\nfunction ', start + 1);
        vm.runInContext(source.slice(start, end), context);
    };
    load(workflow, 'getRecurringMaintenanceFrequencyLabel');
    const schedule = {
        _id: 'schedule-a', title: 'Inspection', frequency, intervalDays, history: [],
        startDate: '2026-10-10', nextScheduledDate: '2026-11-10'
    };
    for (const name of [
        'renderPropertyRecurringMaintenanceCard', 'renderPropertyRecurringMaintenanceListRow',
        'renderPortfolioRecurringMaintenanceCard', 'renderPortfolioRecurringMaintenanceRow'
    ]) {
        load(name === 'renderPropertyRecurringMaintenanceCard' ? schedules : workflow, name);
        const html = context[name](schedule);
        expect(html).toContain(label);
        if (name === 'renderPortfolioRecurringMaintenanceCard') {
            const header = html.slice(html.indexOf('class="maintenance-header"'), html.indexOf('class="maintenance-content"'));
            expect(header).toContain(`class="portfolio-badge" title="Maintenance frequency">${label}</span>`);
            expect(header).not.toContain('>Recurring</span>');
            expect(html).not.toContain('Frequency:');
        } else if (name === 'renderPortfolioRecurringMaintenanceRow') {
            expect(html).toContain('Frequency:');
        }
    }
});

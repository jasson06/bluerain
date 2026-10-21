const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = name => fs.readFileSync(path.join(__dirname, '../dist/property-management/js', name), 'utf8');

function setup() {
    const elements = {};
    const textInput = { value: '', dataset: {}, setAttribute: jest.fn() };
    const menu = { hidden: false };
    const wrapper = {
        dataset: {},
        closest: () => wrapper,
        querySelector: selector => ({
            'input[type="hidden"]': elements.scheduleVendor,
            '.maintenance-vendor-search-input': textInput,
            '.maintenance-vendor-suggestion-box': menu
        })[selector]
    };
    const form = { dataset: {}, querySelector: () => ({ textContent: '' }) };
    const document = {
        getElementById: id => {
            if (!elements[id]) elements[id] = { value: '', style: {} };
            return elements[id];
        }
    };
    elements.scheduleVendor = { value: 'previous-vendor', closest: () => wrapper };
    elements.addScheduleForm = form;
    const state = {
        currentProperty: null, allUnits: [],
        portfolioRecurringMaintenance: [],
        vendors: []
    };
    const context = vm.createContext({
        document, state, API_URL: '/api', console,
        fetch: jest.fn(async () => ({
            ok: true, json: async () => [{ _id: 'vendor-a', name: 'Current Vendor' }]
        })),
        openModal: jest.fn(), showNotification: jest.fn()
    });
    vm.runInContext(read('maintenance-workflow.js'), context);
    vm.runInContext(read('maintenance-schedules.js'), context);
    const requests = read('maintenance-requests.js');
    vm.runInContext(requests.slice(
        requests.indexOf('async function editPortfolioRecurringMaintenance('),
        requests.indexOf('function getMaintenanceScheduleUpdateMessage(')
    ), context);
    const edit = async assignedVendor => {
        state.portfolioRecurringMaintenance = [{
            _id: 'schedule-a', assignedVendor, title: 'Inspection', frequency: 'monthly',
            createdAt: '2026-09-01T12:30:00.000Z'
        }];
        await context.editPortfolioRecurringMaintenance('schedule-a', 'property-a');
    };
    return { context, elements, textInput, form, edit };
}

test.each([
    'vendor-a',
    { _id: 'vendor-a', name: 'Current Vendor' }
])('portfolio schedule edit loads the assigned vendor from %p', async assignedVendor => {
    const { context, elements, textInput, form, edit } = setup();
    await edit(assignedVendor);
    expect(context.fetch).toHaveBeenCalledWith('/api/vendors');
    expect(elements.scheduleVendor.value).toBe('vendor-a');
    expect(textInput.value).toBe('Current Vendor');
    expect(textInput.dataset.selectedLabel).toBe('Current Vendor');
    expect(form.dataset).toMatchObject({ projectId: 'property-a', source: 'portfolio', editMode: 'true' });
    expect(context.openModal).toHaveBeenCalledWith('addScheduleModal');
    expect(elements.scheduleCreatedAt).toBeUndefined();
    expect(context.showNotification).not.toHaveBeenCalled();
});

test('opening an unassigned schedule clears the previous vendor', async () => {
    const { elements, textInput, edit } = setup();
    await edit('vendor-a');
    await edit(null);
    expect(elements.scheduleVendor.value).toBe('');
    expect(textInput.value).toBe('');
    expect(textInput.dataset.selectedLabel).toBe('');
});

test('a populated vendor outside the vendor search results retains its ID and name', async () => {
    const { elements, textInput, edit } = setup();
    await edit({ _id: 'vendor-b', name: 'Assigned Vendor' });
    expect(elements.scheduleVendor.value).toBe('vendor-b');
    expect(textInput.value).toBe('Assigned Vendor');
});

test('property schedule edit also retains an ID-only vendor', async () => {
    const { context, elements, textInput } = setup();
    context.state.currentProperty = { _id: 'property-a' };
    context.fetch.mockImplementation(async url => ({
        ok: true,
        json: async () => url === '/api/vendors'
            ? [{ _id: 'vendor-a', name: 'Current Vendor' }]
            : [{ _id: 'schedule-a', assignedVendor: 'vendor-a', frequency: 'monthly' }]
    }));
    await context.editMaintenanceSchedule('schedule-a');
    expect(elements.scheduleVendor.value).toBe('vendor-a');
    expect(textInput.value).toBe('Current Vendor');
    expect(context.showNotification).not.toHaveBeenCalled();
    expect(elements.scheduleCreatedAt).toBeUndefined();
});

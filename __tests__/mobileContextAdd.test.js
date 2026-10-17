const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup({tab = 'units', portfolio = false, property = true, mode = null, recurring = false, invites = false} = {}) {
    const buttons = {};
    for (const id of ['mobileNavAddBtn', 'addUnitBtn', 'addTenantBtn', 'uploadDocumentBtn', 'addPaymentBtn', 'addMaintenanceBtn', 'addScheduleBtn', 'sendApplicationBtn', 'portfolioRecordPayment']) {
        buttons[id] = {dataset: {}, style: {}, hidden: false, disabled: false, click: jest.fn(), setAttribute: jest.fn(), addEventListener: jest.fn()};
    }
    buttons.recurringMaintenanceTab = {classList: {contains: () => recurring}};
    buttons['applicationsPane-applications'] = {getClientRects: () => invites ? [] : [{}]};
    const pane = {id: tab};
    buttons.propertyDashboard = {getClientRects: () => [{}], querySelector: () => pane};
    const main = {};
    const observer = {observe: jest.fn()};
    const document = {
        getElementById: id => buttons[id],
        querySelector: () => main,
        body: {classList: {add: jest.fn()}}
    };
    const context = vm.createContext({
        state: {currentProperty: property ? {_id: 'property-1'} : null},
        document, window: {addEventListener: jest.fn()},
        isPortfolioOverviewVisible: () => portfolio,
        getPortfolioComparisonActionConfig: () => mode ? {title: `Add ${mode}`} : null,
        MutationObserver: function(callback) { observer.callback = callback; return observer; },
        showNotification: jest.fn()
    });
    const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/portfolio-tasks-mobile.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('function getMobileContextAddAction()'), source.indexOf('function initializeMobilePortfolioNavigation()')), context);
    context.initializeMobileContextAdd();
    return {context, buttons, pane, observer, main, document};
}

describe('mobile context Add navigation button', () => {
    test.each([
        ['units', 'addUnitBtn', 'Add unit'],
        ['tenants', 'addTenantBtn', 'Add tenant'],
        ['documents', 'uploadDocumentBtn', 'Upload document'],
        ['payments', 'addPaymentBtn', 'Record payment'],
        ['maintenance', 'addMaintenanceBtn', 'New maintenance request'],
        ['applications', 'sendApplicationBtn', 'Send application']
    ])('%s delegates to the existing action', (tab, id, label) => {
        const {buttons} = setup({tab});
        const add = buttons.mobileNavAddBtn;
        expect(add.disabled).toBe(false);
        expect(add.setAttribute).toHaveBeenCalledWith('aria-label', label);
        add.addEventListener.mock.calls[0][1]();
        expect(buttons[id].click).toHaveBeenCalledTimes(1);
    });

    test('recurring maintenance creates a schedule', () => {
        const {buttons} = setup({tab: 'maintenance', recurring: true});
        buttons.mobileNavAddBtn.addEventListener.mock.calls[0][1]();
        expect(buttons.addScheduleBtn.click).toHaveBeenCalled();
        expect(buttons.addMaintenanceBtn.click).not.toHaveBeenCalled();
    });

    test.each([
        {tab: 'propertyOverview'},
        {tab: 'propertyInfo'},
        {tab: 'evictions'},
        {tab: 'applications', invites: true},
        {property: false},
        {portfolio: true},
        {portfolio: true, property: false}
    ])('disables Add when no contextual action exists: %j', options => {
        const {buttons} = setup(options);
        expect(buttons.mobileNavAddBtn.disabled).toBe(true);
        expect(buttons.mobileNavAddBtn.title).toBe('No add action in this view');
    });

    test.each(['maintenance', 'applications'])('portfolio %s uses its portfolio-context action without a selected property', mode => {
        const {buttons} = setup({portfolio: true, property: false, mode});
        expect(buttons.mobileNavAddBtn.disabled).toBe(false);
        buttons.mobileNavAddBtn.addEventListener.mock.calls[0][1]();
        expect(buttons.portfolioRecordPayment.click).toHaveBeenCalled();
    });

    test('inline portfolio views do not expose a hidden context action', () => {
        const {context, buttons} = setup({portfolio: true, mode: 'maintenance'});
        buttons.portfolioRecordPayment.style.display = 'none';
        context.syncMobileContextAddAction();
        expect(buttons.mobileNavAddBtn.disabled).toBe(true);
    });

    test('updates context on section changes and does not duplicate listeners', () => {
        const {context, buttons, pane, observer, main, document} = setup();
        pane.id = 'tenants';
        observer.callback();
        buttons.mobileNavAddBtn.addEventListener.mock.calls[0][1]();
        expect(buttons.addTenantBtn.click).toHaveBeenCalled();
        context.initializeMobileContextAdd();
        expect(buttons.mobileNavAddBtn.addEventListener).toHaveBeenCalledTimes(1);
        expect(observer.observe).toHaveBeenCalledWith(main, expect.objectContaining({subtree: true, childList: true}));
        expect(document.body.classList.add).toHaveBeenCalledWith('mobile-context-add-ready');
    });

    test('preserves disabled actions and explicitly reports stale unavailable actions', () => {
        const {context, buttons} = setup();
        buttons.addUnitBtn.disabled = true;
        context.syncMobileContextAddAction();
        expect(buttons.mobileNavAddBtn.disabled).toBe(true);
        buttons.mobileNavAddBtn.addEventListener.mock.calls[0][1]();
        expect(context.showNotification).toHaveBeenCalled();
        expect(buttons.addUnitBtn.click).not.toHaveBeenCalled();
    });
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(state) {
    const context = vm.createContext({
        state,
        document: {},
        window: {},
        setTimeout,
        clearTimeout,
        console
    });
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../dist/property-management/js/payments-search.js'), 'utf8'),
        context
    );
    return context;
}

describe('payment row tenant and unit display', () => {
    test('mobile card clicks toggle details without editing, including voided and credit payments', () => {
        const context = setup({});
        context.window.innerWidth = 375;
        context.editPayment = jest.fn();
        context.openPaymentEditLockPopover = jest.fn();
        const row = { dataset: {}, setAttribute: jest.fn(), closest: () => null };
        const event = { target: row, currentTarget: row };
        context.handlePaymentRowClick(event, 'payment-1');
        expect(row.dataset.mobileExpanded).toBe('true');
        expect(row.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'true');
        context.handlePaymentRowClick(event, 'payment-1');
        expect(row.dataset.mobileExpanded).toBe('false');
        expect(context.editPayment).not.toHaveBeenCalled();
        expect(context.openPaymentEditLockPopover).not.toHaveBeenCalled();
    });

    test.each(['Enter', ' '])('mobile card supports %s and ignores nested action controls', key => {
        const context = setup({});
        context.window.innerWidth = 375;
        const row = { dataset: {}, setAttribute: jest.fn(), closest: () => null };
        const event = { key, target: row, currentTarget: row, preventDefault: jest.fn() };
        context.handlePaymentRowKeydown(event, 'payment-1');
        expect(event.preventDefault).toHaveBeenCalled();
        expect(row.dataset.mobileExpanded).toBe('true');
        const buttonEvent = { ...event, target: { closest: () => ({}) } };
        context.handlePaymentRowClick(buttonEvent, 'payment-1');
        context.handlePaymentRowKeydown(buttonEvent, 'payment-1');
        expect(row.dataset.mobileExpanded).toBe('true');
    });

    test.each([
        ['posted', {}, 'editPayment', {}],
        ['posted', {manualAllocation: true}, 'openPaymentAllocation', {}],
        ['voided', {}, 'openPaymentEditLockPopover', {}],
        ['posted', {}, 'openPaymentEditLockPopover', {creditConsumed: 10}],
        ['posted', {}, 'openPaymentEditLockPopover', {creditSourceId: 'source-1', appliedCredit: 10}],
        ['posted', {manualAllocation: true}, 'openPaymentEditLockPopover', {appliedCredit: 10}],
        ['posted', {}, 'editPayment', {creditConsumed: null, appliedCredit: 0}]
    ])('renders all columns for a %s payment with QuickBooks metadata %j using %s and credit history %j', (postingStatus, quickBooks, handler, creditHistory) => {
        const context = setup({
            tenants: [{_id: 'tenant-1', name: 'Jasson Godoy'}],
            units: [{_id: 'unit-1', number: '101'}],
            payments: [{
                _id: 'payment-1', tenantId: 'tenant-1', unitId: 'unit-1',
                amount: 43, balance: -43, type: 'rent', applyTo: 'rent',
                periodMonth: '2026-10', date: '2026-10-06', method: 'cash',
                postingStatus, quickBooks, ...creditHistory
            }]
        });
        const list = {innerHTML: '', querySelector: jest.fn(() => null)};
        context.document.getElementById = id => id === 'paymentsList' ? list : null;
        context.window.__paymentsFiltersInitialized = true;
        context.initializePaymentPeriodFilter = jest.fn();
        context.getPaymentSearchAndSort = () => ({query: {tokens: {}, text: ''}, sort: {key: ''}});
        context.getQuickBooksPaymentMatch = () => null;
        context.getQuickBooksSourceLabel = () => '';
        context.escapeHtml = value => String(value ?? '');
        context.formatDateDisplay = value => value;
        context.wireClickableHeaderSort = jest.fn();
        context.updateSortArrows = jest.fn();

        context.renderPayments();

        const row = list.innerHTML.match(/<tr class="payment-row[\s\S]*?<\/tr>/)[0];
        const lockReason = context.getPaymentEditLockReason(context.state.payments[0]);
        const accessibility = lockReason ? ' aria-haspopup="dialog" aria-controls="paymentEditLockPopover"' : '';
        const openingTag = `<tr class="payment-row${postingStatus === 'voided' ? ' payment-row-voided' : ''}" onclick="handlePaymentRowClick(event, 'payment-1')" tabindex="0" aria-expanded="false"${accessibility} onkeydown="handlePaymentRowKeydown(event, 'payment-1')">`;
        expect(row.startsWith(openingTag)).toBe(true);
        const cells = row.slice(openingTag.length).match(/<td(?:\s[^>]*)?>[\s\S]*?<\/td>/g);
        expect(cells).toHaveLength(12);
        expect(cells[0]).toContain('Jasson Godoy');
        expect(cells[1]).toBe('<td>101</td>');
        expect(row).not.toContain('Editing locked');
        expect(cells[2]).not.toContain('<button');
        expect(cells[2]).toBe('<td data-label="Type">Rent</td>');
        expect(cells[3]).toBe('<td data-label="Applied to">Rent · OCT-26</td>');
        expect(cells[9]).toContain('data-label="Note"');
        expect(cells[10]).toContain('data-label="QuickBooks"');
        expect(row).not.toContain('Payment details');
        context.editPayment = jest.fn();
        context.openPaymentAllocation = jest.fn();
        context.openPaymentEditLockPopover = jest.fn();
        context.handlePaymentRowClick({ target: { closest: () => null } }, 'payment-1');
        expect(context[handler]).toHaveBeenCalled();
        if (postingStatus === 'voided') {
            expect(cells[10]).toContain('<span class="badge badge-warning">Voided locally</span>');
            expect(row.match(/class="badge badge-warning"/g)).toHaveLength(1);
        }
    });

    test.each([
        ['2026-11', 'NOV-26'],
        ['2027-01', 'JAN-27'],
        ['2026-12', 'DEC-26'],
        ['', ''],
        ['2026-13', '2026-13']
    ])('formats applied period %s as %s', (period, label) => {
        expect(setup({}).formatPaymentPeriodLabel(period)).toBe(label);
    });

    test('formats old credit notes using the source month while preserving custom text', () => {
        const context = setup({});
        const source = {_id: '6ac5bc38d68f10818085ebdd', tenantId: 'tenant-1', periodMonth: '2026-11', date: '2026-10-28'};
        const payment = {tenantId: 'tenant-1', periodMonth: '2026-12', note: 'Custom note (Applied from credit 6ac5bc38d68f10818085ebdd)'};
        expect(context.getPaymentDisplayNote(payment, [source])).toBe('Custom note (Credit applied from NOV-26)');
        expect(payment.note).toContain('Applied from credit 6ac5bc38d68f10818085ebdd');
    });

    test('falls back to the source receipt month for a legacy source without a period', () => {
        const context = setup({});
        expect(context.getPaymentDisplayNote(
            {tenantId: 'tenant-1', note: '(Applied from credit source-1)'},
            [{_id: 'source-1', tenantId: 'tenant-1', date: '2026-11-15T12:00:00Z'}]
        )).toBe('(Credit applied from NOV-26)');
    });

    test.each([
        [],
        [{_id: 'source-1', tenantId: 'another-tenant', periodMonth: '2026-11'}],
        [{_id: 'source-1', tenantId: 'tenant-1', date: 'invalid'}]
    ])('does not guess a source month when the source is missing, mismatched, or invalid: %j', (...sources) => {
        const context = setup({});
        const note = '(Applied from credit source-1)';
        expect(context.getPaymentDisplayNote({tenantId: 'tenant-1', note}, sources)).toBe(note);
    });

    test('supports searches by both display label and stored month', () => {
        const context = setup({});
        const row = {appliedText: 'Rent · NOV-26', localPayment: {periodMonth: '2026-11'}};
        expect(context.matchesUnifiedPaymentQuery(row, {text: 'nov-26'})).toBe(true);
        expect(context.matchesUnifiedPaymentQuery(row, {text: '2026-11'})).toBe(true);
    });

    test.each([
        [{postingStatus: 'voided', creditConsumed: 10}, 'This voided payment is kept for audit and excluded from balances.'],
        [{creditConsumed: 10}, 'Editing is disabled to preserve linked credit allocations and accounting history.'],
        [{creditSourceId: 'source-1'}, 'Editing is disabled to preserve linked credit allocations and accounting history.'],
        [{appliedCredit: 10}, 'Editing is disabled to preserve linked credit allocations and accounting history.']
    ])('explains the edit restriction for %j without opening the modal', (fields, reason) => {
        const context = setup({payments: [{_id: 'payment-1', ...fields}]});
        context.showNotification = jest.fn();
        context.openModal = jest.fn();
        context.document.getElementById = jest.fn();
        vm.runInContext(
            fs.readFileSync(path.join(__dirname, '../dist/property-management/js/payments-charges.js'), 'utf8'),
            context
        );

        context.editPayment('payment-1');

        expect(context.showNotification).toHaveBeenCalledWith(reason, 'info');
        expect(context.openModal).not.toHaveBeenCalled();
        expect(context.document.getElementById).not.toHaveBeenCalled();
    });

    test('resolves string references to loaded tenant and unit records', () => {
        const context = setup({
            tenants: [{_id: 'tenant-1', name: 'Jasson Godoy', unitId: 'unit-1'}],
            allTenants: [],
            units: [{_id: 'unit-1', number: '101'}]
        });
        const payment = {tenantId: 'tenant-1', unitId: 'unit-1'};

        const tenant = context.resolvePaymentTenant(payment);
        const unit = context.resolvePaymentUnit(payment, tenant);

        expect(tenant.name).toBe('Jasson Godoy');
        expect(unit.number).toBe('101');
    });

    test('uses populated tenant and unit references when supplied by the API', () => {
        const context = setup({tenants: [], allTenants: [], units: []});
        const payment = {
            tenantId: {_id: 'tenant-1', name: 'Jasson Godoy', unitId: {_id: 'unit-1', number: '101'}},
            unitId: {_id: 'unit-1', number: '101'}
        };

        const tenant = context.resolvePaymentTenant(payment);
        const unit = context.resolvePaymentUnit(payment, tenant);

        expect(tenant.name).toBe('Jasson Godoy');
        expect(unit.number).toBe('101');
    });

    test('falls back to the all-tenants cache and composes a split tenant name', () => {
        const context = setup({
            tenants: [],
            allTenants: [{_id: 'tenant-1', firstName: 'Jasson', lastName: 'Godoy'}],
            units: []
        });
        const tenant = context.resolvePaymentTenant({tenantId: 'tenant-1'});

        expect(`${tenant.firstName} ${tenant.lastName}`).toBe('Jasson Godoy');
    });
});

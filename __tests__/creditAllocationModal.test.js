const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
    const modal = {setAttribute: jest.fn(), innerHTML: ''};
    const text = {textContent: ''};
    const message = {textContent: '', scrollIntoView: jest.fn()};
    const save = {disabled: false, textContent: ''};
    const context = vm.createContext({
        document: {
            getElementById: jest.fn(id => ({
                paymentAllocationModal: modal,
                paymentAllocationTotal: text,
                paymentAllocationMessage: message,
                paymentAllocationSave: save
            }[id] || null)),
            body: {appendChild: jest.fn()},
            createElement: jest.fn()
        },
        window: {crypto: {randomUUID: jest.fn(() => '12345678-1234-4123-8123-123456789abc')}},
        state: {currentProperty: {_id: 'property-1'}, payments: [], tenants: []},
        escapeHtml: value => String(value ?? ''),
        formatDateDisplay: value => String(value ?? ''),
        showNotification: jest.fn(),
        openModal: jest.fn()
    });
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../dist/property-management/js/shared-utilities.js'), 'utf8'),
        context
    );
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../dist/property-management/js/quickbooks.js'), 'utf8'),
        context
    );
    return {context, modal, text, message, save};
}

function getAllocationEditor(context) {
    return vm.runInContext('paymentAllocationEditor', context);
}

describe('credit allocation modal', () => {
    test('opens the shared allocation modal with the selected available credit', () => {
        const {context} = setup();
        const event = {stopPropagation: jest.fn()};
        context.ensurePaymentAllocationModal = jest.fn(() => ({}));
        context.renderPaymentAllocationModal = jest.fn();
        context.addPaymentAllocationRow = jest.fn();
        context.state.payments = [
            {_id: 'voided-credit', tenantId: 'tenant-1', amount: -90, postingStatus: 'voided'},
            {_id: 'other-tenant-credit', tenantId: 'tenant-2', amount: -50},
            {_id: 'credit-1', tenantId: 'tenant-1', amount: -100, appliedCredit: 25}
        ];

        context.openCreditAllocation(event, 'tenant-1', 'voided-credit');

        expect(event.stopPropagation).toHaveBeenCalled();
        expect(getAllocationEditor(context).mode).toBe('credit');
        expect(getAllocationEditor(context).creditPaymentId).toBe('credit-1');
        expect(getAllocationEditor(context).total).toBe(75);
        expect(context.renderPaymentAllocationModal).toHaveBeenCalled();
        expect(context.addPaymentAllocationRow).toHaveBeenCalledWith(
            expect.objectContaining({amount: 75})
        );
        expect(context.openModal).toHaveBeenCalledWith('paymentAllocationModal');
    });

    test('renders a credit-specific view in the shared modal without the old menu flow', () => {
        const {context, modal} = setup();
        context.ensurePaymentAllocationModal = jest.fn(() => modal);

        context.renderPaymentAllocationModal({
            mode: 'credit',
            creditPaymentId: 'credit-123456',
            total: 42.5
        });

        expect(modal.setAttribute).toHaveBeenCalledWith('aria-label', 'Apply available credit');
        expect(modal.innerHTML).toContain('Available credit <strong>$42.50</strong>');
        expect(modal.innerHTML).toContain('Amount to apply');
        expect(modal.innerHTML).toContain('Apply credit');
        expect(modal.innerHTML).not.toContain('Add allocation');
    });

    test('removes the separate menu and prompt flow', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../dist/property-management/js/payments-search.js'),
            'utf8'
        );
        expect(source).toContain('openCreditAllocation');
        expect(source).not.toMatch(/creditApplyMenu|openCreditMenu|promptAndApplyCredit/);
    });

    test('allows partial credit applications but rejects amounts above the available balance', () => {
        const {context, text} = setup();
        vm.runInContext('paymentAllocationEditor = {mode: "credit", total: 100}', context);
        context.readPaymentAllocationRows = () => [
            {applyTo: 'rent', periodMonth: '2026-10', amount: 30}
        ];

        expect(context.updatePaymentAllocationTotal()).toBe(true);
        expect(text.textContent).toContain('Applying $30.00 of $100.00 available credit');
        expect(text.textContent).toContain('$70.00 will remain available.');

        context.readPaymentAllocationRows = () => [
            {applyTo: 'rent', periodMonth: '2026-10', amount: 101}
        ];
        expect(context.updatePaymentAllocationTotal()).toBe(false);
        expect(getAllocationEditor(context).validationError).toContain('exceeds the available amount');
    });

    test('still requires received payment allocations to match the full payment amount', () => {
        const {context} = setup();
        vm.runInContext('paymentAllocationEditor = {mode: "payment", total: 100}', context);
        context.readPaymentAllocationRows = () => [
            {applyTo: 'rent', periodMonth: '2026-10', amount: 30}
        ];

        expect(context.updatePaymentAllocationTotal()).toBe(false);
        expect(getAllocationEditor(context).validationError).toContain('Allocate the remaining $70.00');
    });

    test('submits the selected category and amount through the existing credit application endpoint', async () => {
        const {context} = setup();
        context.API_URL = '/api';
        context.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({applied: 30})
        });
        context.readPaymentAllocationRows = () => [
            {applyTo: 'rent', periodMonth: '2026-10', amount: 30, feeLabel: ''}
        ];
        context.updatePaymentAllocationTotal = jest.fn(() => true);
        context.invalidateCache = jest.fn();
        context.refreshContent = jest.fn().mockResolvedValue();
        context.closeModal = jest.fn();
        context.showNotification = jest.fn();
        context.state.tenants = [{_id: 'tenant-1', unitId: 'unit-1'}];
        vm.runInContext(
            'paymentAllocationEditor = {mode: "credit", propertyId: "property-1", creditPaymentId: "credit-1", tenantId: "tenant-1", credit: {}, total: 100, requestId: "12345678-1234-4123-8123-123456789abc"}',
            context
        );

        await context.savePaymentAllocation();

        expect(context.fetch).toHaveBeenCalledWith(
            '/api/properties/property-1/payments/credit-1/apply-credit',
            expect.objectContaining({
                method: 'POST',
                body: expect.any(String)
            })
        );
        expect(JSON.parse(context.fetch.mock.calls[0][1].body)).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                amount: 30,
                targetApplyTo: 'rent',
                periodMonth: '2026-10',
                requestId: '12345678-1234-4123-8123-123456789abc'
            })
        );
        expect(context.invalidateCache).toHaveBeenCalledWith('payments', 'tenants');
        expect(context.closeModal).toHaveBeenCalledWith('paymentAllocationModal');
    });
});

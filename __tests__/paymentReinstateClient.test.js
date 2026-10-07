const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(ok = true) {
    const context = vm.createContext({
        API_URL: '/api',
        state: {currentProperty: {_id: 'property-a'}, propertyOverviewData: {cached: true}},
        confirm: jest.fn(() => true),
        fetch: jest.fn(async () => ({ok, json: async () => ({message: 'Only voided payments can be reinstated'})})),
        showLoader: jest.fn(), hideLoader: jest.fn(),
        invalidateCache: jest.fn(), refreshContent: jest.fn(async () => {}),
        showNotification: jest.fn(), console: {error: jest.fn()}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/payments-charges.js'), 'utf8'), context);
    return context;
}

test('reinstatement posts to the scoped endpoint and refreshes affected views', async () => {
    const context = setup();
    await context.reinstatePayment('payment-a', true);
    expect(context.confirm).toHaveBeenCalledWith(expect.stringContaining('only reinstates the payment in Bluerain'));
    expect(context.fetch).toHaveBeenCalledWith('/api/properties/property-a/payments/payment-a/reinstate', {method: 'POST'});
    expect(context.invalidateCache).toHaveBeenCalledWith('payments', 'tenants');
    expect(context.refreshContent.mock.calls).toEqual([['payments'], ['tenants']]);
    expect(context.state.propertyOverviewData).toBeNull();
    expect(context.showNotification).toHaveBeenCalledWith('Payment reinstated. Tenant balances were recalculated.', 'success');
    expect(context.hideLoader).toHaveBeenCalledTimes(1);
});

test('cancelling leaves the payment untouched', async () => {
    const context = setup();
    context.confirm.mockReturnValue(false);
    await context.reinstatePayment('payment-a');
    expect(context.fetch).not.toHaveBeenCalled();
    expect(context.showLoader).not.toHaveBeenCalled();
});

test('API errors are shown without refreshing or reporting success', async () => {
    const context = setup(false);
    await context.reinstatePayment('payment-a');
    expect(context.showNotification).toHaveBeenCalledWith('Only voided payments can be reinstated', 'error');
    expect(context.console.error).toHaveBeenCalled();
    expect(context.refreshContent).not.toHaveBeenCalled();
    expect(context.hideLoader).toHaveBeenCalledTimes(1);
});

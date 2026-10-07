const fs = require('fs');
const path = require('path');
const vm = require('vm');
const server = require('../server/payment-credit-values');
const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/shared-utilities.js'), 'utf8'), browser);

test.each([
    [{amount: -100, creditConsumed: 30}, 70, 0],
    [{amount: -100, appliedCredit: 30}, 70, 0],
    [{amount: 200, balance: -70, creditConsumed: 30}, 70, 170],
    [{amount: 30, balance: -100}, 30, 30],
    [{amount: 0, appliedCredit: 30, creditSourceId: 'source'}, 0, 30],
    [{amount: 40, appliedCredit: 30}, 0, 70],
    [{amount: -100, creditConsumed: 100}, 0, 0],
    [{amount: 43, balance: 0}, 0, 43],
    [{amount: 100, balance: -100, postingStatus: 'voided'}, 0, 0]
])('browser and server agree on available credit and applied value for %j', (payment, available, applied) => {
    expect(server.availableCredit(payment)).toBe(available);
    expect(browser.availablePaymentCredit(payment)).toBe(available);
    expect(server.appliedValue(payment)).toBe(applied);
    expect(browser.paymentAppliedValue(payment)).toBe(applied);
});

test('browser monthly totals count a credit only at the destination', () => {
    const tenant = {_id: 'tenant', baseRent: 100};
    const payments = [
        {tenantId: 'tenant', applyTo: 'rent', periodMonth: '2026-10', amount: -100, appliedCredit: 0, creditConsumed: 30},
        {tenantId: 'tenant', applyTo: 'rent', periodMonth: '2026-10', amount: 0, appliedCredit: 30, creditSourceId: 'source'}
    ];
    browser.computeExpectedRentForMonth = () => 100;
    expect(browser.computeTenantMonthTotals(tenant, new Date('2026-10-15'), payments)).toMatchObject({
        expected: 100, paid: 30, outstanding: 70
    });
});

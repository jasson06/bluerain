const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(hasPayments, stateOverrides = {}) {
    const notices = [];
    const list = {
        innerHTML: '',
        querySelector: jest.fn(() => {
            if (!list.innerHTML.includes('data-qb-connection-notice')) return null;
            const notice = {remove: jest.fn()};
            notices.push(notice);
            return notice;
        })
    };
    const context = vm.createContext({
        document: {getElementById: id => id === 'paymentsList' ? list : null},
        window: {__paymentsFiltersInitialized: true},
        state: {
            tenants: [], units: [],
            payments: hasPayments ? [{
                _id: 'payment-1', tenantId: 'tenant-1',
                amount: 43, balance: 0, type: 'rent', applyTo: 'rent',
                periodMonth: '2026-10', date: '2026-10-06', method: 'cash'
            }] : [],
            quickBooksPaymentsConnected: false,
            ...stateOverrides
        },
        console, setTimeout, clearTimeout,
        escapeHtml: value => String(value ?? ''),
        formatDateDisplay: value => value,
        initializePaymentPeriodFilter: jest.fn(),
        getPaymentSearchAndSort: () => ({query: {tokens: {}, text: ''}, sort: {key: ''}})
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/payments-search.js'), 'utf8'), context);
    context.wireClickableHeaderSort = jest.fn();
    context.updateSortArrows = jest.fn();
    context.renderPayments();
    return {context, list, notices};
}

describe('payment table QuickBooks connection reminder', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test.each([true, false])('dismisses only the reminder after four seconds (has payments: %s)', hasPayments => {
        const {list, notices} = setup(hasPayments);
        expect(list.innerHTML).toContain('Connect this property to QuickBooks');
        expect(notices).toHaveLength(1);
        jest.advanceTimersByTime(3999);
        expect(notices[0].remove).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(notices[0].remove).toHaveBeenCalledTimes(1);
        expect(list.quickBooksConnectionNoticeTimeout).toBeNull();
        expect(list.innerHTML).toContain(hasPayments ? 'payment-row' : 'No matched transactions found');
    });

    test.each([true, false])('keeps error notices visible (has payments: %s)', hasPayments => {
        const {list, notices} = setup(hasPayments, {quickBooksPaymentsError: 'QuickBooks unavailable'});
        jest.advanceTimersByTime(60000);
        expect(list.innerHTML).toContain('QuickBooks unavailable');
        expect(list.innerHTML).not.toContain('data-qb-connection-notice');
        expect(notices).toHaveLength(0);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('rerendering cancels the previous timer and gives the new notice four seconds', () => {
        const {context, notices} = setup(true);
        jest.advanceTimersByTime(3000);
        context.renderPayments();
        expect(jest.getTimerCount()).toBe(1);
        jest.advanceTimersByTime(3999);
        expect(notices[0].remove).not.toHaveBeenCalled();
        expect(notices[1].remove).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(notices[1].remove).toHaveBeenCalledTimes(1);
    });

    test('an error replacing the reminder cancels pending dismissal', () => {
        const {context, list, notices} = setup(true);
        context.state.quickBooksPaymentsError = 'Refresh failed';
        context.renderPayments();
        jest.advanceTimersByTime(60000);
        expect(list.innerHTML).toContain('Refresh failed');
        expect(notices[0].remove).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('connected properties have no connection reminder or dismissal timer', () => {
        const {list} = setup(true, {quickBooksPaymentsConnected: true});
        expect(list.innerHTML).not.toContain('data-qb-connection-notice');
        expect(jest.getTimerCount()).toBe(0);
    });
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
    const banner = {style: {}, setAttribute: jest.fn(), remove: jest.fn()};
    const anchor = {setAttribute: jest.fn(), parentNode: {insertBefore: jest.fn()}};
    const context = vm.createContext({
        document: {
            getElementById: id => id === 'qbPaymentsProgress' || id === 'qbSetupProgress' ? banner : anchor,
            createElement: () => banner
        },
        escapeHtml: value => String(value),
        setTimeout,
        clearTimeout
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/quickbooks.js'), 'utf8'), context);
    return {context, banner, anchor};
}

describe('QuickBooks progress status dismissal', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test.each(['success', 'info'])('payment %s stays visible for four seconds then disappears', kind => {
        const {context, banner, anchor} = setup();
        context.setQuickBooksProgress('payments', 'Finished', kind);
        expect(anchor.setAttribute).toHaveBeenCalledWith('aria-busy', 'false');
        jest.advanceTimersByTime(3999);
        expect(banner.remove).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(banner.remove).toHaveBeenCalledTimes(1);
        expect(banner.quickBooksProgressTimeout).toBeNull();
    });

    test.each(['error', 'loading'])('payment %s remains visible', kind => {
        const {context, banner, anchor} = setup();
        context.setQuickBooksProgress('payments', 'Status', kind);
        jest.advanceTimersByTime(60000);
        expect(banner.remove).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
        expect(anchor.setAttribute).toHaveBeenCalledWith('aria-busy', kind === 'loading' ? 'true' : 'false');
    });

    test.each(['error', 'loading'])('a new %s cancels the prior dismissal timer', kind => {
        const {context, banner} = setup();
        context.setQuickBooksProgress('payments', 'Finished', 'info');
        jest.advanceTimersByTime(3000);
        context.setQuickBooksProgress('payments', 'New status', kind);
        jest.advanceTimersByTime(60000);
        expect(banner.remove).not.toHaveBeenCalled();
        expect(banner.innerHTML).toContain('New status');
    });

    test('a new completed status gets its own full four-second window', () => {
        const {context, banner} = setup();
        context.setQuickBooksProgress('payments', 'First', 'success');
        jest.advanceTimersByTime(3000);
        context.setQuickBooksProgress('payments', 'Second', 'info');
        jest.advanceTimersByTime(3999);
        expect(banner.remove).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(banner.remove).toHaveBeenCalledTimes(1);
    });

    test('setup instructions remain visible', () => {
        const {context, banner} = setup();
        context.setQuickBooksProgress('setup', 'Complete sign-in', 'info');
        jest.advanceTimersByTime(60000);
        expect(banner.remove).not.toHaveBeenCalled();
    });
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(payment = {creditConsumed: 30}) {
    const closeButton = {focus: jest.fn(), addEventListener: jest.fn()};
    const popover = {
        style: {},
        offsetWidth: 280,
        offsetHeight: 110,
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        remove: jest.fn(),
        contains: target => target === closeButton,
        querySelector: () => closeButton
    };
    const trigger = {
        setAttribute: jest.fn(),
        getBoundingClientRect: () => ({left: 1000, bottom: 700}),
        isConnected: true,
        focus: jest.fn(),
        contains: target => target === trigger
    };
    const document = {
        createElement: () => popover,
        body: {appendChild: jest.fn()},
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    };
    const window = {
        innerWidth: 1024, innerHeight: 768,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    };
    const context = vm.createContext({
        document, window,
        state: {payments: [{_id: 'payment-1', ...payment}]},
        escapeHtml: value => String(value),
        editPayment: jest.fn(),
        showNotification: jest.fn()
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/payments-search.js'), 'utf8'), context);
    const event = {currentTarget: trigger, stopPropagation: jest.fn()};
    context.openPaymentEditLockPopover(event, 'payment-1');
    return {context, event, popover, closeButton, trigger, document, window};
}

describe('payment edit lock explanation box', () => {
    test.each([
        [{creditConsumed: 30}, 'linked credit allocations and accounting history'],
        [{creditSourceId: 'source'}, 'linked credit allocations and accounting history'],
        [{amount: -30, appliedCredit: 30}, 'linked credit allocations and accounting history'],
        [{amount: 1785, balance: -35, appliedCredit: 35, creditConsumed: null}, 'green credit balance'],
        [{postingStatus: 'voided'}, 'excluded from balances']
    ])('shows the reason for %j without editing and stays in the viewport', (payment, reason) => {
        const {context, event, popover, closeButton, document} = setup(payment);
        expect(event.stopPropagation).toHaveBeenCalled();
        expect(document.body.appendChild).toHaveBeenCalledWith(popover);
        expect(popover.innerHTML).toContain(reason);
        expect(popover.innerHTML).toContain('Read-only payment');
        expect(popover.innerHTML).toContain('payment-edit-lock-icon');
        expect(popover.setAttribute).toHaveBeenCalledWith('role', 'dialog');
        expect(popover.setAttribute).toHaveBeenCalledWith('aria-describedby', 'paymentEditLockReason');
        expect(popover.style.left).toBe('736px');
        expect(popover.style.top).toBe('650px');
        expect(closeButton.focus).toHaveBeenCalled();
        expect(context.editPayment).not.toHaveBeenCalled();
        expect(context.showNotification).not.toHaveBeenCalled();
    });

    test.each(['Escape', 'Tab'])('%s closes the box and restores focus', key => {
        const {context, popover, trigger, document, window} = setup();
        context.handlePaymentEditLockKeydown({key, preventDefault: jest.fn()});
        expect(popover.remove).toHaveBeenCalled();
        expect(trigger.focus).toHaveBeenCalled();
        expect(trigger.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
        expect(document.removeEventListener).toHaveBeenCalledWith('click', context.dismissPaymentEditLockPopover);
        expect(document.removeEventListener).toHaveBeenCalledWith('keydown', context.handlePaymentEditLockKeydown);
        expect(window.removeEventListener).toHaveBeenCalledWith('scroll', context.dismissPaymentEditLockPopover, true);
        expect(window.removeEventListener).toHaveBeenCalledWith('resize', context.dismissPaymentEditLockPopover);
    });

    test('close button dismisses the box and restores focus', () => {
        const {popover, closeButton, trigger} = setup();
        closeButton.addEventListener.mock.calls.find(([name]) => name === 'click')[1]();
        expect(popover.remove).toHaveBeenCalled();
        expect(trigger.focus).toHaveBeenCalled();
    });

    test.each(['Enter', ' '])('%s on the focused row opens the box', key => {
        const {context, trigger, document} = setup();
        context.closePaymentEditLockPopover();
        document.body.appendChild.mockClear();
        const event = {key, currentTarget: trigger, target: trigger, preventDefault: jest.fn(), stopPropagation: jest.fn()};
        context.handlePaymentEditLockRowKeydown(event, 'payment-1');
        expect(event.preventDefault).toHaveBeenCalled();
        expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['Enter', true],
        [' ', true],
        ['ArrowDown', false]
    ])('ignores %s from a nested control: %s', (key, nested) => {
        const {context, trigger, document} = setup();
        context.closePaymentEditLockPopover();
        document.body.appendChild.mockClear();
        const event = {key, currentTarget: trigger, target: nested ? {} : trigger, preventDefault: jest.fn()};
        context.handlePaymentEditLockRowKeydown(event, 'payment-1');
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(document.body.appendChild).not.toHaveBeenCalled();
    });

    test.each(['click', 'scroll', 'resize'])('%s outside dismisses the box', type => {
        const {context, popover} = setup();
        context.dismissPaymentEditLockPopover({type, target: {}});
        expect(popover.remove).toHaveBeenCalled();
    });

    test('clicks inside the box or its trigger do not dismiss it', () => {
        const {context, popover, closeButton, trigger} = setup();
        context.dismissPaymentEditLockPopover({type: 'click', target: closeButton});
        context.dismissPaymentEditLockPopover({type: 'click', target: trigger});
        expect(popover.remove).not.toHaveBeenCalled();
    });

    test('clicking the same payment toggles the box closed', () => {
        const {context, popover, event, document} = setup();
        context.openPaymentEditLockPopover(event, 'payment-1');
        expect(popover.remove).toHaveBeenCalledTimes(1);
        expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    });

    test('ordinary payments retain their edit flow if the lock has been removed', () => {
        const {context, document} = setup({});
        expect(context.editPayment).toHaveBeenCalledWith('payment-1');
        expect(document.body.appendChild).not.toHaveBeenCalled();
    });

    test('missing payment reports an error instead of opening a box', () => {
        const {context, event, document} = setup({});
        context.openPaymentEditLockPopover(event, 'missing');
        expect(context.showNotification).toHaveBeenCalledWith('Payment not found', 'error');
        expect(document.body.appendChild).not.toHaveBeenCalled();
    });
});

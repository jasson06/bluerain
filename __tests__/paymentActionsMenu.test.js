const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(payment) {
    const items = (payment?.postingStatus === 'voided' ? ['download', 'reinstate'] : ['download', 'email', 'void', 'delete']).map(action => ({
        dataset: {action},
        focus: jest.fn(),
        closest() { return this; }
    }));
    const menu = {
        style: {},
        offsetWidth: 190,
        offsetHeight: 140,
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        remove: jest.fn(),
        contains: target => items.includes(target),
        querySelector: () => items[0],
        querySelectorAll: () => items
    };
    const trigger = {
        setAttribute: jest.fn(),
        getBoundingClientRect: () => ({right: 1000, bottom: 700}),
        isConnected: true,
        focus: jest.fn(),
        contains: target => target === trigger
    };
    const document = {
        createElement: () => menu,
        body: {appendChild: jest.fn()},
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        activeElement: items[0]
    };
    const window = {
        innerWidth: 1024, innerHeight: 768,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    };
    const context = vm.createContext({
        document, window,
        state: {payments: payment ? [{_id: 'payment-1', ...payment}] : []},
        exportReceipt: jest.fn(),
        emailReceipt: jest.fn(),
        voidPayment: jest.fn(),
        reinstatePayment: jest.fn(),
        deletePayment: jest.fn()
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/payments-search.js'), 'utf8'), context);
    const event = {currentTarget: trigger, stopPropagation: jest.fn()};
    context.openPaymentActionsMenu(event, 'payment-1');
    return {context, event, menu, items, trigger, document, window};
}

describe('payment row actions menu', () => {
    test.each([{}, {quickBooks: {entityId: 'qb-1'}}])('voided rows offer reinstatement and call its handler %j', details => {
        const {context, menu, items} = setup({postingStatus: 'voided', ...details});
        expect(menu.innerHTML).toContain('Reinstate payment');
        expect(menu.innerHTML).not.toContain('Email receipt');
        expect(menu.innerHTML).not.toContain('Void payment');
        expect(menu.innerHTML).not.toContain('data-action="delete"');
        const click = menu.addEventListener.mock.calls.find(([name]) => name === 'click')[1];
        click({target: items[1], stopPropagation: jest.fn()});
        expect(context.reinstatePayment).toHaveBeenCalledWith('payment-1', !!details.quickBooks);
        expect(menu.remove).toHaveBeenCalled();
    });
    test.each([{creditConsumed: 30}, {creditSourceId: 'source', appliedCredit: 30}])('locks destructive actions on payment credit history %j', payment => {
        const {menu} = setup(payment);
        expect(menu.innerHTML).not.toContain('Void payment');
        expect(menu.innerHTML).not.toContain('data-action="delete"');
        expect(menu.innerHTML).toContain('Download receipt');
    });
    test('opens without editing the row and remains inside the viewport', () => {
        const {event, menu, items, trigger, document} = setup();
        expect(event.stopPropagation).toHaveBeenCalled();
        expect(trigger.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
        expect(document.body.appendChild).toHaveBeenCalledWith(menu);
        expect(menu.innerHTML).toContain('Download receipt');
        expect(menu.innerHTML).toContain('Email receipt');
        expect(menu.innerHTML).toContain('Void payment');
        expect(menu.innerHTML).not.toContain('Reinstate payment');
        expect(menu.innerHTML).toContain('Delete');
        expect(menu.style.left).toBe('810px');
        expect(menu.style.top).toBe('620px');
        expect(items[0].focus).toHaveBeenCalled();
    });

    test.each([['download', 'exportReceipt'], ['email', 'emailReceipt'], ['void', 'voidPayment'], ['delete', 'deletePayment']])(
        '%s calls the existing handler with the payment ID and closes the menu',
        (action, handler) => {
            const {context, menu, items, trigger} = setup();
            const click = menu.addEventListener.mock.calls.find(([name]) => name === 'click')[1];
            const event = {target: items.find(item => item.dataset.action === action), stopPropagation: jest.fn()};
            click(event);
            expect(context[handler]).toHaveBeenCalledWith('payment-1', ...(action==='void'?[false]:[]));
            expect(menu.remove).toHaveBeenCalled();
            expect(trigger.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
            expect(trigger.focus).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
        }
    );

    test('Escape restores focus and removes dismissal listeners', () => {
        const {context, menu, trigger, document, window} = setup();
        context.handlePaymentActionsKeydown({key: 'Escape', preventDefault: jest.fn()});
        expect(menu.remove).toHaveBeenCalled();
        expect(trigger.focus).toHaveBeenCalled();
        expect(document.removeEventListener).toHaveBeenCalledWith('click', context.dismissPaymentActionsMenu);
        expect(window.removeEventListener).toHaveBeenCalledWith('scroll', context.dismissPaymentActionsMenu, true);
    });

    test('arrow keys navigate and wrap through actions', () => {
        const {context, items} = setup();
        context.handlePaymentActionsKeydown({key: 'ArrowDown', preventDefault: jest.fn()});
        expect(items[1].focus).toHaveBeenCalled();
        context.handlePaymentActionsKeydown({key: 'ArrowUp', preventDefault: jest.fn()});
        expect(items[3].focus).toHaveBeenCalled();
    });

    test.each(['click', 'scroll', 'resize'])('%s outside dismisses the menu', type => {
        const {context, menu} = setup();
        context.dismissPaymentActionsMenu({type, target: {}});
        expect(menu.remove).toHaveBeenCalled();
    });

    test('clicks inside the menu do not dismiss it prematurely', () => {
        const {context, menu, items} = setup();
        context.dismissPaymentActionsMenu({type: 'click', target: items[0]});
        expect(menu.remove).not.toHaveBeenCalled();
    });

    test('clicking the same trigger toggles the menu closed', () => {
        const {context, menu, event} = setup();
        context.openPaymentActionsMenu(event, 'payment-1');
        expect(menu.remove).toHaveBeenCalledTimes(1);
    });
});

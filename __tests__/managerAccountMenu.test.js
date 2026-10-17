const fs = require('fs');
const path = require('path');
const vm = require('vm');

function element(id, parent = null) {
    const listeners = {};
    const node = {
        id, parent, hidden: false, dataset: {}, attributes: {},
        addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
        dispatch: (type, event = {}) => (listeners[type] || []).forEach(handler => handler({target: node, preventDefault() {}, ...event})),
        setAttribute: (name, value) => { node.attributes[name] = value; },
        focus: jest.fn(),
        contains: other => { for (let current = other; current; current = current.parent) if (current === node) return true; return false; }
    };
    return node;
}

function setup() {
    const container = element('managerAccount');
    const menu = element('managerAccountMenu', container);
    const nodes = {container, menu, managerAccount: container, managerAccountMenu: menu};
    nodes.managerMenuButton = element('managerMenuButton', container);
    for (const id of ['managerProfileMenuItem', 'managerPasswordMenuItem', 'themeToggle', 'managerLogoutMenuItem']) nodes[id] = element(id, menu);
    for (const id of ['managerAvatarInitials', 'managerMenuName', 'managerProfileForm']) nodes[id] = element(id);
    menu.hidden = true;
    const documentListeners = {};
    const document = {
        getElementById: id => nodes[id],
        addEventListener: (type, handler) => { (documentListeners[type] ||= []).push(handler); },
        querySelectorAll: () => []
    };
    const context = vm.createContext({
        document, window: {addEventListener: jest.fn()},
        localStorage: {getItem: () => 'Jane Manager', removeItem: jest.fn()},
        Array, String, console
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/property-management-account.js'), 'utf8'), context);
    context.openManagerProfileSettings = jest.fn();
    context.logoutManager = jest.fn();
    vm.runInContext('initializeManagerAccountMenu()', context);
    const pointerdown = target => (documentListeners.pointerdown || []).forEach(handler => handler({target}));
    return {nodes, menu, container, context, pointerdown};
}

describe('manager account menu', () => {
    test('keeps the menu open when iOS blurs without a related target before click', () => {
        const {nodes, menu, container, pointerdown} = setup();
        nodes.managerMenuButton.dispatch('click');
        expect(menu.hidden).toBe(false);

        pointerdown(nodes.managerPasswordMenuItem);
        container.dispatch('focusout', {relatedTarget: null});
        expect(menu.hidden).toBe(false);
    });

    test('still closes when focus moves outside or the user taps outside', () => {
        const {nodes, menu, container, pointerdown} = setup();
        nodes.managerMenuButton.dispatch('click');
        container.dispatch('focusout', {relatedTarget: element('outsideButton')});
        expect(menu.hidden).toBe(true);

        nodes.managerMenuButton.dispatch('click');
        pointerdown(element('outsideArea'));
        expect(menu.hidden).toBe(true);
    });
});

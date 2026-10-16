const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = name => fs.readFileSync(path.join(__dirname, '../dist/property-management/js', name), 'utf8');
const workflow = read('maintenance-workflow.js');
const menuSource = workflow.slice(0, workflow.indexOf('function escapeHtml('));

function setup() {
    const items = ['Estimate', 'Edit', ''].map((label, index) => ({
        type: '',
        textContent: label,
        style: {removeProperty: jest.fn()},
        classList: {contains: name => index === 2 && name === 'delete-btn', add: jest.fn()},
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        querySelectorAll: () => [],
        focus: jest.fn()
    }));
    const content = {cloneNode: jest.fn(() => ({}))};
    const menu = {
        style: {}, offsetWidth: 190, offsetHeight: 145,
        appendChild: jest.fn(), setAttribute: jest.fn(), addEventListener: jest.fn(), remove: jest.fn(),
        contains: node => items.includes(node),
        querySelectorAll: () => items, querySelector: () => items[0]
    };
    const trigger = {
        parentElement: {querySelector: () => ({content})},
        setAttribute: jest.fn(), focus: jest.fn(), isConnected: true,
        contains: node => node === trigger,
        getBoundingClientRect: () => ({right: 310, bottom: 600})
    };
    const document = {
        createElement: () => menu, createTextNode: text => text,
        body: {appendChild: jest.fn()}, activeElement: items[0],
        addEventListener: jest.fn(), removeEventListener: jest.fn()
    };
    const window = {innerWidth: 320, innerHeight: 640, addEventListener: jest.fn(), removeEventListener: jest.fn()};
    const context = vm.createContext({document, window});
    vm.runInContext(menuSource, context);
    const event = {currentTarget: trigger, stopPropagation: jest.fn()};
    context.openMaintenanceActionsMenu(event);
    return {context, items, content, menu, trigger, document, window, event};
}

describe('maintenance card action menus', () => {
    test.each([
        ['maintenance-requests.js', 1],
        ['maintenance-schedules.js', 1],
        ['maintenance-workflow.js', 3]
    ])('%s routes every card action block through the shared menu', (file, count) => {
        const blocks = Array.from(read(file).matchAll(/\$\{renderMaintenanceActions\(`([^]*?)`\)\}/g));
        expect(blocks).toHaveLength(count);
        blocks.forEach(([, buttons]) => {
            expect(buttons).toContain('Estimate');
            expect(buttons).toContain('Edit');
            expect(buttons).toMatch(/delete|openPortfolioRecurringMaintenance/);
        });
    });

    test('renders an accessible three-dot trigger and keeps original actions in a template', () => {
        const context = vm.createContext({});
        vm.runInContext(menuSource, context);
        const buttons = '<button onclick="editMaintenance(\'request-1\')">Edit</button>';
        const html = context.renderMaintenanceActions(buttons);
        expect(html).toContain('fa-ellipsis-v');
        expect(html).toContain('type="button"');
        expect(html).toContain('aria-label="Maintenance actions"');
        expect(html).toContain('aria-haspopup="menu"');
        expect(html).toContain(`<template>${buttons}</template>`);
    });

    test('clones original action handlers into a floating menu within the phone viewport', () => {
        const {menu, trigger, document, content, items, event} = setup();
        expect(event.stopPropagation).toHaveBeenCalled();
        expect(content.cloneNode).toHaveBeenCalledWith(true);
        expect(document.body.appendChild).toHaveBeenCalledWith(menu);
        expect(menu.style.left).toBe('120px');
        expect(menu.style.top).toBe('487px');
        expect(trigger.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
        expect(items[0].focus).toHaveBeenCalled();
        items.forEach(item => {
            expect(item.type).toBe('button');
            expect(item.setAttribute).toHaveBeenCalledWith('role', 'menuitem');
        });
        expect(items[2].appendChild).toHaveBeenCalledWith(' Delete');
    });

    test('selecting an action closes the menu and restores focus', () => {
        const {menu, trigger} = setup();
        const click = menu.addEventListener.mock.calls.find(([name]) => name === 'click')[1];
        click({stopPropagation: jest.fn(), target: {closest: () => ({})}});
        expect(menu.remove).toHaveBeenCalled();
        expect(trigger.focus).toHaveBeenCalled();
        expect(trigger.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
    });

    test.each(['Escape', 'Tab'])('%s closes and cleans up dismissal listeners', key => {
        const {context, menu, trigger, document, window} = setup();
        context.handleMaintenanceActionsKeydown({key, preventDefault: jest.fn()});
        expect(menu.remove).toHaveBeenCalled();
        expect(trigger.focus).toHaveBeenCalled();
        expect(document.removeEventListener).toHaveBeenCalledWith('click', context.dismissMaintenanceActionsMenu);
        expect(window.removeEventListener).toHaveBeenCalledWith('scroll', context.dismissMaintenanceActionsMenu, true);
    });

    test.each([['ArrowDown', 1], ['ArrowUp', 2], ['Home', 0], ['End', 2]])('%s navigates the menu', (key, index) => {
        const {context, items} = setup();
        items.forEach(item => item.focus.mockClear());
        context.handleMaintenanceActionsKeydown({key, preventDefault: jest.fn()});
        expect(items[index].focus).toHaveBeenCalled();
    });

    test.each(['click', 'scroll', 'resize'])('%s outside dismisses the menu', type => {
        const {context, menu} = setup();
        context.dismissMaintenanceActionsMenu({type, target: {}});
        expect(menu.remove).toHaveBeenCalled();
    });

    test('internal clicks and scrolling do not dismiss the menu', () => {
        const {context, menu, items} = setup();
        ['click', 'scroll'].forEach(type => context.dismissMaintenanceActionsMenu({type, target: items[0]}));
        expect(menu.remove).not.toHaveBeenCalled();
    });

    test('clicking the same trigger toggles it closed', () => {
        const {context, event, menu} = setup();
        context.openMaintenanceActionsMenu(event);
        expect(menu.remove).toHaveBeenCalledTimes(1);
    });
});

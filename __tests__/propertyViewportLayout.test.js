const fs = require('fs');
const path = require('path');
const vm = require('vm');

function element(top, height = 0, computed = {}) {
    const properties = {};
    const classes = new Set();
    return {
        computed,
        getBoundingClientRect: () => ({top, height}),
        getClientRects: () => [{}],
        style: {
            getPropertyValue: key => properties[key] || '',
            setProperty: jest.fn((key, value) => {properties[key] = value;})
        },
        classList: {
            add: jest.fn(name => classes.add(name)),
            contains: name => classes.has(name)
        },
        closest: () => null
    };
}

function setup({height = 900, top = 250, pagerHeight = 52, mobile = false} = {}) {
    const main = element(0, height, {paddingBottom: mobile ? '20px' : '0px'});
    const pane = element(140, 0, {paddingBottom: '5px'});
    const root = element(top, 100);
    const pager = element(top + 100, pagerHeight, {marginTop: '8px'});
    root.parentElement = pane;
    root.nextElementSibling = pager;
    pager.parentElement = pane;
    pane.querySelectorAll = () => [root];
    const dashboard = element(80);
    dashboard.querySelector = () => pane;
    dashboard.closest = () => main;
    const toolbar = element(0, 60);
    const navigation = element(height - 64, 64, {position: 'fixed'});
    navigation.getClientRects = () => mobile ? [{}] : [];
    const observers = [];
    function Observer(callback) {
        this.callback = callback;
        this.observe = jest.fn();
        observers.push(this);
    }
    const frames = [];
    const context = vm.createContext({
        document: {
            getElementById: id => id === 'propertyDashboard' ? dashboard : navigation,
            querySelector: () => toolbar,
            addEventListener: jest.fn()
        },
        window: {innerHeight: height, scrollY: 0, addEventListener: jest.fn()},
        getComputedStyle: node => node.computed,
        MutationObserver: Observer,
        ResizeObserver: Observer,
        requestAnimationFrame: callback => {frames.push(callback); return frames.length;}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/property-viewport-layout.js'), 'utf8'), context);
    return {context, main, dashboard, pane, root, pager, toolbar, navigation, observers, frames};
}

describe('property viewport layout', () => {
    test.each([
        [900, 250, 52, '577px'],
        [1440, 250, 52, '1117px'],
        [720, 350, 80, '269px']
    ])('fills a %ipx viewport below %ipx of controls and reserves the %ipx pager', (height, top, pagerHeight, expected) => {
        const {context, pane, root} = setup({height, top, pagerHeight});
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe(expected);
        expect(pane.style.getPropertyValue('--property-pane-height')).toBe(`${height - 148}px`);
        expect(root.classList.add).toHaveBeenCalledWith('property-viewport-scroll');
    });

    test('reserves the mobile navigation and handles a wrapped pager', () => {
        const {context, root} = setup({height: 844, top: 300, pagerHeight: 88, mobile: true});
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('371px');
    });

    test('short screens keep a usable list and allow the page to scroll', () => {
        const {context, root} = setup({height: 400, top: 350});
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('140px');
    });

    test('browser keyboard and dynamic viewport changes resize the available area', () => {
        const {context, root} = setup();
        context.window.visualViewport = {height: 600, offsetTop: 10};
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('287px');
    });

    test('document scroll does not inflate the available height', () => {
        const {context, root} = setup({top: 150});
        context.window.scrollY = 100;
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('577px');
    });

    test('hidden pagers do not reserve space', () => {
        const {context, root, pager} = setup();
        pager.getClientRects = () => [];
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('637px');
    });

    test('accounts for nested section padding, sibling controls, and vertical gaps', () => {
        const {context, root, pane, pager} = setup();
        const wrapper = element(220, 0, {paddingBottom: '10px', display: 'flex', flexDirection: 'column', rowGap: '6px'});
        const controls = element(800, 30, {marginTop: '4px', marginBottom: '2px'});
        wrapper.parentElement = pane;
        wrapper.nextElementSibling = controls;
        root.parentElement = wrapper;
        pager.parentElement = wrapper;
        context.updatePropertyViewportLayout();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('525px');
    });

    test('property information and overview fill the screen even without record lists', () => {
        const {context, pane} = setup();
        pane.querySelectorAll = () => [];
        context.updatePropertyViewportLayout();
        expect(pane.style.getPropertyValue('--property-pane-height')).toBe('752px');
    });

    test('hidden tabs and nested scroll regions are not resized', () => {
        const {context, root, pane} = setup();
        pane.getClientRects = () => [];
        context.updatePropertyViewportLayout();
        expect(root.style.setProperty).not.toHaveBeenCalled();
        pane.getClientRects = () => [{}];
        pane.closest = () => root;
        context.updatePropertyViewportLayout();
        expect(root.style.setProperty).not.toHaveBeenCalled();
    });

    test('unchanged dimensions do not cause observer write loops', () => {
        const {context, root, pane} = setup();
        context.updatePropertyViewportLayout();
        context.updatePropertyViewportLayout();
        expect(root.style.setProperty).toHaveBeenCalledTimes(1);
        expect(root.classList.add).toHaveBeenCalledTimes(1);
        expect(pane.style.setProperty).toHaveBeenCalledTimes(1);
    });

    test('subtab switches, async content, and resize events coalesce into one layout frame', () => {
        const {context, dashboard, main, toolbar, observers, frames, root} = setup();
        context.window.visualViewport = {height: 900, offsetTop: 0, addEventListener: jest.fn()};
        context.initializePropertyViewportLayout();
        expect(observers[0].observe).toHaveBeenCalledWith(dashboard, expect.objectContaining({subtree: true, childList: true}));
        expect(observers[1].observe).toHaveBeenCalledWith(dashboard);
        expect(observers[1].observe).toHaveBeenCalledWith(main);
        expect(observers[1].observe).toHaveBeenCalledWith(toolbar);
        observers[0].callback();
        observers[1].callback();
        context.window.addEventListener.mock.calls[0][1]();
        expect(frames).toHaveLength(1);
        frames.shift()();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('577px');
        context.window.visualViewport.height = 1000;
        context.window.visualViewport.addEventListener.mock.calls[0][1]();
        frames.shift()();
        expect(root.style.getPropertyValue('--property-record-height')).toBe('677px');
    });
});

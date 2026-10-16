const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
    class Element {
        constructor() {
            this.scrollTop = 0;
            this.scrollHeight = 1500;
            this.clientHeight = 500;
        }
        closest() { return null; }
    }
    const classes = new Set();
    const navigation = {
        dataset: {},
        classList: {
            remove: name => classes.delete(name),
            toggle: (name, value) => value ? classes.add(name) : classes.delete(name)
        },
        contains: node => node === navigation,
        addEventListener: jest.fn()
    };
    const page = new Element();
    const document = {
        scrollingElement: page, activeElement: null,
        getElementById: () => navigation,
        querySelector: jest.fn(() => null),
        addEventListener: jest.fn()
    };
    const window = {innerWidth: 390, addEventListener: jest.fn()};
    const context = vm.createContext({document, window, Element});
    const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/portfolio-tasks-mobile.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('function initializeMobileBottomNavScroll()'), source.indexOf('function initializeMobilePortfolioNavigation()')), context);
    context.initializeMobileBottomNavScroll();
    const onScroll = document.addEventListener.mock.calls[0][1];
    const scroll = (top, target = page) => {
        target.scrollTop = top;
        onScroll({target: target === page ? document : target});
    };
    return {context, document, window, navigation, classes, page, Element, scroll};
}

describe('mobile bottom navigation scroll behavior', () => {
    test('slides away on downward scroll and reveals on upward scroll', () => {
        const {scroll, classes} = setup();
        scroll(100);
        expect(classes.has('scroll-hidden')).toBe(true);
        scroll(85);
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('accumulates small movements, ignores duplicate events, and resets on direction reversal', () => {
        const {scroll, classes} = setup();
        scroll(9);
        scroll(9);
        expect(classes.has('scroll-hidden')).toBe(false);
        scroll(12);
        expect(classes.has('scroll-hidden')).toBe(true);
        scroll(8);
        expect(classes.has('scroll-hidden')).toBe(false);
        scroll(17);
        scroll(15);
        scroll(20);
        expect(classes.has('scroll-hidden')).toBe(false);
        scroll(27);
        expect(classes.has('scroll-hidden')).toBe(true);
    });

    test('handles nested record list scrolling independently of document scrolling', () => {
        const {scroll, classes, Element} = setup();
        const list = new Element();
        scroll(200);
        scroll(30, list);
        scroll(15, list);
        expect(classes.has('scroll-hidden')).toBe(false);
        scroll(215);
        expect(classes.has('scroll-hidden')).toBe(true);
    });

    test('clamps iOS overscroll at both ends without false direction reversals', () => {
        const {scroll, classes} = setup();
        scroll(1000);
        scroll(1050);
        scroll(1000);
        expect(classes.has('scroll-hidden')).toBe(true);
        scroll(980);
        expect(classes.has('scroll-hidden')).toBe(false);
        scroll(-30);
        scroll(0);
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('does not react to modal, drawer, or sidebar scrolling', () => {
        const {scroll, classes, Element} = setup();
        const drawer = new Element();
        drawer.closest = () => ({});
        scroll(100, drawer);
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('resizing the records area does not mistake scroll clamping for upward scrolling', () => {
        const {scroll, classes, page} = setup();
        scroll(1000);
        expect(classes.has('scroll-hidden')).toBe(true);
        page.clientHeight += 64;
        scroll(936);
        expect(classes.has('scroll-hidden')).toBe(true);
        scroll(920);
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('keeps navigation visible while focused or a mobile panel is open', () => {
        const {scroll, document, navigation, classes} = setup();
        document.activeElement = navigation;
        scroll(100);
        expect(classes.has('scroll-hidden')).toBe(false);
        document.activeElement = null;
        document.querySelector.mockReturnValue({});
        scroll(200);
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('keyboard focus reveals a hidden bar', () => {
        const {scroll, navigation, classes} = setup();
        scroll(100);
        navigation.addEventListener.mock.calls[0][1]();
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('does not hide on desktop and resets after a resize', () => {
        const {scroll, window, classes} = setup();
        window.innerWidth = 1200;
        scroll(100);
        expect(classes.has('scroll-hidden')).toBe(false);
        window.innerWidth = 390;
        scroll(200);
        expect(classes.has('scroll-hidden')).toBe(true);
        window.addEventListener.mock.calls.find(([name]) => name === 'resize')[1]();
        expect(classes.has('scroll-hidden')).toBe(false);
    });

    test('binds one passive capture listener even if initialized repeatedly', () => {
        const {context, document} = setup();
        context.initializeMobileBottomNavScroll();
        expect(document.addEventListener).toHaveBeenCalledTimes(1);
        expect(document.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), {capture: true, passive: true});
    });
});

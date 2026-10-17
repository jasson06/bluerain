const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(width = 390) {
    const frames = [];
    const listeners = {};
    const properties = new Map([['--portfolio-tabs-scroll-reserve', '120px']]);
    const section = {
        style: {
            getPropertyValue: key => properties.get(key) || '',
            setProperty: jest.fn((key, value) => properties.set(key, value))
        },
        getBoundingClientRect: () => ({}), getClientRects: () => [{}],
        querySelector: () => null
    };
    let tabTop = 150;
    const tabs = {getClientRects: () => [{}], getBoundingClientRect: () => ({top: tabTop}), querySelector: () => null};
    const toolbar = {getBoundingClientRect: () => ({height: 60})};
    const scroller = {scrollTop: 100, scrollHeight: 2000, clientHeight: 844, scrollTo: jest.fn()};
    const observers = [];
    const context = vm.createContext({
        document: {
            getElementById: id => id === 'portfolioWorkspaceTabs' ? tabs : id === 'portfolioOverviewSection' ? section : null,
            querySelector: () => toolbar,
            scrollingElement: scroller,
            documentElement: {style: {setProperty: jest.fn()}},
            addEventListener: jest.fn((name, callback) => {listeners[name] = callback;}),
            removeEventListener: jest.fn()
        },
        window: {innerWidth: width, matchMedia: () => ({matches: false})},
        ResizeObserver: function(callback) {
            this.callback = callback;
            this.observe = jest.fn();
            this.disconnect = jest.fn();
            observers.push(this);
        },
        requestAnimationFrame: callback => {frames.push(callback); return frames.length;},
        cancelAnimationFrame: jest.fn()
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/property-management-toolbar.js'), 'utf8'), context);
    const flush = () => {while (frames.length) frames.shift()();};
    return {context, frames, listeners, observers, section, scroller, flush, moveTabs: top => {tabTop = top;}};
}

describe('portfolio tab alignment during initial mobile loading', () => {
    test('realigns after delayed content changes without resetting scroll reserve', () => {
        const {context, observers, scroller, section, moveTabs, flush} = setup();
        context.scrollPortfolioTabsBelowToolbar();
        flush();
        expect(scroller.scrollTo).toHaveBeenLastCalledWith({top: 190, behavior: 'instant'});
        expect(section.style.setProperty).not.toHaveBeenCalledWith('--portfolio-tabs-scroll-reserve', '0px');
        moveTabs(210);
        observers[0].callback();
        flush();
        expect(scroller.scrollTo).toHaveBeenLastCalledWith({top: 250, behavior: 'instant'});
        expect(observers).toHaveLength(1);
    });

    test('horizontal swipes preserve alignment but vertical user scrolling releases it', () => {
        const {context, observers, listeners, flush} = setup();
        context.scrollPortfolioTabsBelowToolbar();
        flush();
        listeners.touchstart({touches: [{clientX: 100, clientY: 100}]});
        listeners.touchmove({touches: [{clientX: 180, clientY: 105}]});
        expect(observers[0].disconnect).not.toHaveBeenCalled();
        listeners.touchmove({touches: [{clientX: 105, clientY: 160}]});
        expect(observers[0].disconnect).toHaveBeenCalled();
    });

    test('a new tab click replaces the previous alignment observer', () => {
        const {context, observers, flush} = setup();
        context.scrollPortfolioTabsBelowToolbar();
        flush();
        context.scrollPortfolioTabsBelowToolbar();
        flush();
        expect(observers[0].disconnect).toHaveBeenCalled();
        expect(observers).toHaveLength(2);
    });

    test('desktop keeps smooth scrolling without layout observers', () => {
        const {context, observers, scroller, flush} = setup(1200);
        context.scrollPortfolioTabsBelowToolbar();
        flush();
        expect(observers).toHaveLength(0);
        expect(scroller.scrollTo).toHaveBeenCalledWith({top: 190, behavior: 'smooth'});
    });
});

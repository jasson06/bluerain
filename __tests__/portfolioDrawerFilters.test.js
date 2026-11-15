const fs = require('fs');
const path = require('path');
const vm = require('vm');

function element() {
    const listeners = {};
    return {
        dataset: {}, style: {}, value: '', listeners,
        classList: {toggle: jest.fn()},
        addEventListener: jest.fn((name, callback) => { listeners[name] = callback; }),
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({left: 0, top: 0, bottom: 32, width: 240})
    };
}

function detailsBody(id) {
    const nodes = {};
    for (const name of [
        'portfolioDetailsSearchBar', 'clearPortfolioDetailsFiltersBtn',
        'portfolioDetailsActiveFilterChips', 'portfolioDetailsSearchSuggestions',
        'portfolioDetailsFilterBar', 'portfolioDetailsSuggestList',
        'portfolioDetailsSuggestTitle', 'portfolioDetailsSuggestValues',
        'portfolioDetailsSuggestBack', 'portfolioDetailsTbody', 'portfolioAppsTypeTags'
    ]) nodes[name] = element();
    const rows = [
        {dataset: {type: 'application', name: 'alice', status: 'pending'}, textContent: 'Alice pending', style: {}, closest: () => null},
        {dataset: {type: 'invite', name: 'bob', status: 'sent'}, textContent: 'Bob sent', style: {}, closest: () => null}
    ];
    nodes.portfolioDetailsTbody.querySelectorAll = selector =>
        selector === '[data-portfolio-filter-item="true"], tr' ? rows : [];
    const buttons = ['application', 'invite'].map(type => ({
        ...element(), getAttribute: key => key === 'data-type' ? type : null
    }));
    nodes.portfolioAppsTypeTags.querySelectorAll = () => buttons;
    return {id, nodes, rows, buttons, querySelector: selector => nodes[selector.slice(1)] || null};
}

function setup(width = 390) {
    const inline = detailsBody('portfolioDetailsBody');
    const drawer = detailsBody('globalOverviewBody');
    const document = {
        getElementById: id => inline.nodes[id] || null,
        querySelector: selector => inline.querySelector(selector)
    };
    const context = vm.createContext({
        document, window: {innerWidth: width},
        state: {
            applications: [{_id: 'app-1', name: 'Alice', status: 'pending'}],
            invites: [{_id: 'invite-1', name: 'Bob', status: 'sent'}]
        },
        debounce: callback => callback, setTimeout
    });
    for (const filename of ['portfolio-search.js', 'portfolio-details.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js', filename), 'utf8'), context);
    }
    context.initializePortfolioDetailsSearch(inline);
    context.renderPortfolioDetails('applications', {body: drawer, title: element()});
    return {context, inline, drawer};
}

describe('Applications drawer filters with inline portfolio details already loaded', () => {
    test.each([390, 820, 1280])('type buttons filter the drawer, not the inline list, at width %i', width => {
        const {drawer, inline} = setup(width);
        expect(drawer.rows.map(row => row.style.display)).toEqual(['', 'none']);
        drawer.buttons[1].listeners.click();
        expect(drawer.rows.map(row => row.style.display)).toEqual(['none', '']);
        drawer.buttons[0].listeners.click();
        expect(drawer.rows.map(row => row.style.display)).toEqual(['', 'none']);
        expect(inline.rows.map(row => row.style.display)).toEqual([undefined, undefined]);
    });

    test('drawer search and clear stay scoped to the drawer', () => {
        const {drawer, inline} = setup();
        drawer.buttons[1].listeners.click();
        drawer.nodes.portfolioDetailsSearchBar.value = 'name:alice';
        drawer.nodes.portfolioDetailsSearchBar.listeners.input();
        expect(drawer.rows.map(row => row.style.display)).toEqual(['none', 'none']);
        drawer.nodes.clearPortfolioDetailsFiltersBtn.onclick();
        expect(drawer.rows.map(row => row.style.display)).toEqual(['', '']);
        expect(drawer.nodes.portfolioDetailsSearchBar.value).toBe('');
        expect(inline.rows.map(row => row.style.display)).toEqual([undefined, undefined]);
    });

    test('type switching respects other drawer filters and chip removal updates drawer rows', () => {
        const {context, drawer, inline} = setup();
        drawer.nodes.portfolioDetailsSearchBar.value = 'name:bob';
        drawer.buttons[1].listeners.click();
        expect(drawer.rows.map(row => row.style.display)).toEqual(['none', '']);
        expect(context.window.__portfolioDetailsAccumulatedQuery).toContain('name:bob');
        context.removePortfolioDetailsFilterToken('name:', 'bob', drawer);
        drawer.buttons[0].listeners.click();
        expect(drawer.rows.map(row => row.style.display)).toEqual(['', 'none']);
        expect(inline.rows.map(row => row.style.display)).toEqual([undefined, undefined]);
    });

    test('existing unscoped inline filtering still works', () => {
        const {context, inline} = setup();
        context.window.__portfolioDetailsAccumulatedQuery = 'type:invite';
        context.renderFilteredPortfolioDetailsRows();
        expect(inline.rows.map(row => row.style.display)).toEqual(['none', '']);
    });
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const source = read('selection-studio.js');
const helpers = source.slice(0, source.indexOf('let closeRoomSwipe='));
const render = source.slice(source.indexOf('function render() {'), source.indexOf("document.querySelectorAll('[data-close]')"));

function node(tag = '') {
    const classes = new Set();
    return {
        tag, children: [], textContent: '', value: '', scrollLeft: 0,
        classList: {add: name => classes.add(name), toggle: jest.fn(), contains: name => classes.has(name)},
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; },
        setAttribute: jest.fn(), showModal: jest.fn()
    };
}

function text(element) {
    return String(element.textContent) + element.children.map(text).join(' ');
}

function setup(search, code) {
    const elements = {};
    const get = id => elements[id] ||= node();
    const document = {body: node(), getElementById: get, createElement: node};
    const context = vm.createContext({
        document, location: {search, origin: 'https://example.com'},
        URLSearchParams, URL, Intl, localStorage: {getItem: () => null}
    });
    vm.runInContext(helpers + '\nlet closeRoomSwipe=null; function attachRoomMenu() {}\n' + render + code + '\n})();', context);
    return {context, document, get};
}

test.each([
    ['?mode=client&embed=1&hidePrices=1', false],
    ['?mode=client&embed=1', true],
    ['', true],
    ['?hidePrices=0', true]
])('product cards and details respect the price display setting (%s)', (search, visible) => {
    const state = setup(search, `
        const sample={name:'Faucet', price:250, description:'Brushed finish', link:'https://example.com/faucet'};
        globalThis.savedCard=card(sample,true);
        globalThis.libraryCard=card(sample,false);
        showDetails(sample);
    `);
    [state.context.savedCard, state.context.libraryCard, state.get('detail-content')].forEach(element => {
        expect(text(element).includes('$250.00')).toBe(visible);
        expect(text(element)).toContain('Faucet');
    });
    expect(text(state.get('detail-content'))).toContain('Brushed finish');
    expect(state.get('details').showModal).toHaveBeenCalled();
    expect(state.document.body.classList.contains('hide-prices')).toBe(!visible);
});

test.each([
    ['?mode=client&embed=1&hidePrices=1', '', 'Alpha faucet'],
    ['?mode=client&embed=1', '$250.00', 'Zeta tile']
])('rendering preserves counts and scopes subtotal and price sorting (%s)', (search, total, first) => {
    const {get} = setup(search, `
        $('sort').value='low';
        products=[
            {name:'Zeta tile', price:10, description:'White tile', link:'https://example.com/tile'},
            {name:'Alpha faucet', price:250, description:'Brushed finish', link:'https://example.com/faucet'}
        ];
        boards=[{room:'Kitchen', selections:[products[1]]}];
        room='Kitchen';
        render();
    `);
    expect(get('count').textContent).toBe(1);
    expect(get('total').textContent).toBe(total);
    expect(get('products').children).toHaveLength(2);
    expect(text(get('products').children[0])).toContain(first);
    expect(get('selected').children).toHaveLength(1);
});

test('only the estimate embed opts into hiding prices', () => {
    const estimate = read('estimate-view.html');
    const url = new URL(estimate.match(/const selectionUrl = "([^"]+)"/)[1], 'https://example.com');
    expect(url.searchParams.get('hidePrices')).toBe('1');
    expect(url.searchParams.get('mode')).toBe('client');
    expect(url.searchParams.get('embed')).toBe('1');
});

test('price-free styling hides subtotal, price guidance, and price sorting, not selected counts', () => {
    const board = read('Selection-Board.html');
    expect(board).toContain('.hide-prices .selection-total,.hide-prices .selection-price-hint,.hide-prices #sort{display:none}');
    expect(board).toContain('<div class="selection-total"><strong id="total">');
    expect(board).toContain('class="hint selection-price-hint"');
    expect(board).not.toContain('.hide-prices .stats{display:none}');
});

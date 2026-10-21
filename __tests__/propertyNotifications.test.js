const fs = require('fs');
const path = require('path');
const vm = require('vm');

function element() {
    const node = {
        children: [], listeners: {}, attributes: {}, classes: new Set(),
        textContent: '',
        append(...children) { this.children.push(...children); },
        appendChild(child) { child.parent = this; this.children.push(child); },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        contains(target) { return this.children.includes(target); },
        remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    };
    node.classList = { add: name => node.classes.add(name) };
    return node;
}

function setup() {
    const container = element();
    const context = vm.createContext({
        document: { getElementById: () => container, createElement: element },
        Date, setTimeout, clearTimeout
    });
    const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/tenant-balances-reports.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('function showNotification(')), context);
    return { container, show: context.showNotification };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('messages coexist, remain readable for eight seconds, and fade out independently', () => {
    const { container, show } = setup();
    show('Saved schedule', 'success');
    jest.advanceTimersByTime(2000);
    show('Could not load vendors', 'error');
    expect(container.children).toHaveLength(2);
    const [first, second] = container.children;
    expect(first.children[1].children[1].textContent).toBe('Saved schedule');
    expect(second.children[1].children[1].textContent).toBe('Could not load vendors');
    jest.advanceTimersByTime(5999);
    expect(first.classes.has('is-leaving')).toBe(false);
    jest.advanceTimersByTime(1);
    expect(first.classes.has('is-leaving')).toBe(true);
    expect(second.classes.has('is-leaving')).toBe(false);
    expect(container.children).toHaveLength(2);
    jest.advanceTimersByTime(350);
    expect(container.children).toEqual([second]);
    jest.advanceTimersByTime(2000);
    expect(container.children).toHaveLength(0);
});

test('long messages receive additional reading time and are rendered as text', () => {
    const { container, show } = setup();
    const message = '<img src=x onerror=alert(1)>'.repeat(10);
    show(message);
    const notification = container.children[0];
    expect(notification.children[1].children[1].textContent).toBe(message);
    jest.advanceTimersByTime(8000);
    expect(notification.classes.has('is-leaving')).toBe(false);
    jest.advanceTimersByTime(message.length * 50 - 8000);
    expect(notification.classes.has('is-leaving')).toBe(true);
});

test.each([
    ['mouseenter', 'mouseleave'],
    ['focusin', 'focusout']
])('%s pauses the remaining reading time until %s', (pause, resume) => {
    const { container, show } = setup();
    show('Read this message');
    const notification = container.children[0];
    jest.advanceTimersByTime(3000);
    notification.listeners[pause]();
    jest.advanceTimersByTime(20000);
    expect(notification.classes.has('is-leaving')).toBe(false);
    notification.listeners[resume]({ relatedTarget: null });
    jest.advanceTimersByTime(4999);
    expect(notification.classes.has('is-leaving')).toBe(false);
    jest.advanceTimersByTime(1);
    expect(notification.classes.has('is-leaving')).toBe(true);
});

test('hover and keyboard focus both keep a message visible', () => {
    const { container, show } = setup();
    show('Read this message');
    const notification = container.children[0];
    notification.listeners.mouseenter();
    notification.listeners.focusin();
    notification.listeners.mouseleave();
    jest.advanceTimersByTime(20000);
    expect(notification.classes.has('is-leaving')).toBe(false);
    notification.listeners.focusout({ relatedTarget: null });
    jest.advanceTimersByTime(8000);
    expect(notification.classes.has('is-leaving')).toBe(true);
});

test('dismiss closes only the selected message and cancels its auto-dismiss timer', () => {
    const { container, show } = setup();
    show('First', 'success');
    show('Second', 'warning');
    const [first, second] = container.children;
    const close = first.children[2];
    expect(close.type).toBe('button');
    expect(close.attributes['aria-label']).toBe('Dismiss notification');
    close.listeners.click();
    close.listeners.click();
    expect(jest.getTimerCount()).toBe(2);
    jest.advanceTimersByTime(350);
    expect(container.children).toEqual([second]);
});

test('unsupported notification types use the informational style', () => {
    const { container, show } = setup();
    show('A message', 'unknown');
    expect(container.children[0].className).toBe('notification info show');
    expect(container.children[0].children[1].children[0].textContent).toBe('Notice');
});

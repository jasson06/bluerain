const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../dist/selection-studio.js'), 'utf8');
const gestures = source.slice(source.indexOf('let closeRoomSwipe='), source.indexOf("$('room-menu-cancel').onclick"));

function node() {
    const listeners = {};
    const classes = new Set();
    const attributes = {};
    return {
        listeners, attributes, dataset: {}, style: {setProperty: jest.fn()},
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
            contains: name => classes.has(name)
        },
        addEventListener: (type, callback) => (listeners[type] ||= []).push(callback),
        setAttribute: (name, value) => { attributes[name] = value; },
        setPointerCapture: jest.fn(), hasPointerCapture: () => true,
        releasePointerCapture: jest.fn(), focus: jest.fn(), onclick: jest.fn(),
        emit(type, values = {}) {
            const event = {
                type, pointerId: 1, button: 0, clientX: 100, clientY: 100,
                preventDefault: jest.fn(), stopImmediatePropagation: jest.fn(), ...values
            };
            (listeners[type] || []).forEach(callback => callback(event));
            return event;
        }
    };
}

function setup(tablet = true, phone = false) {
    const document = node();
    const dialog = {showModal: jest.fn(), close: jest.fn()};
    const elements = {'room-actions': dialog, 'room-actions-title': {}, 'room-menu-edit': {}, 'room-menu-delete': {}};
    const context = vm.createContext({
        document, $: id => elements[id], pretty: name => name,
        matchMedia: query => ({matches: query.includes('min-width') ? tablet : phone}),
        setTimeout, clearTimeout
    });
    vm.runInContext(gestures, context);
    function addRoom() {
        const button = node(), edit = node(), remove = node(), row = node();
        context.attachRoomMenu(button, 'Kitchen', edit, remove, row);
        return {button, edit, remove, row};
    }
    return {...addRoom(), addRoom, document, dialog, elements};
}

function swipe(button, dx, dy = 0, end = 'pointerup') {
    button.emit('pointerdown');
    button.emit('pointermove', {clientX: 100 + dx, clientY: 100 + dy});
    button.emit(end, {clientX: 100 + dx, clientY: 100 + dy});
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

test.each([[65, 'delete', '80px'], [-65, 'edit', '-80px']])(
    'swiping %i reveals %s without invoking an action or selecting a room',
    (dx, action, shift) => {
        const {button, row, edit, remove, dialog} = setup();
        swipe(button, dx);
        expect(row.dataset.swipeAction).toBe(action);
        expect(row.style.setProperty).toHaveBeenLastCalledWith('--room-shift', shift);
        expect(button.emit('click').stopImmediatePropagation).toHaveBeenCalled();
        expect(edit.onclick).not.toHaveBeenCalled();
        expect(remove.onclick).not.toHaveBeenCalled();
        jest.advanceTimersByTime(600);
        expect(dialog.showModal).not.toHaveBeenCalled();
    }
);

test.each([43, -43, 10, -10])('a short %ipx gesture does not expose actions', dx => {
    const {button, row} = setup();
    swipe(button, dx);
    expect(row.classList.contains('swipe-open')).toBe(false);
});

test.each([44, -44])('the 44px reveal threshold is inclusive (%i)', dx => {
    const {button, row} = setup();
    swipe(button, dx);
    expect(row.classList.contains('swipe-open')).toBe(true);
});

test.each([[400, '80px'], [-400, '-80px']])('large drags stay within the action width (%i)', (dx, shift) => {
    const {button, row} = setup();
    button.emit('pointerdown');
    button.emit('pointermove', {clientX: 100 + dx});
    expect(row.style.setProperty).toHaveBeenLastCalledWith('--room-shift', shift);
});

test('vertical scrolling remains native and does not open an action or a menu', () => {
    const {button, row, dialog} = setup();
    button.emit('pointerdown');
    const move = button.emit('pointermove', {clientX: 105, clientY: 135});
    button.emit('pointermove', {clientX: 170, clientY: 145});
    button.emit('pointerup');
    jest.advanceTimersByTime(600);
    expect(move.preventDefault).not.toHaveBeenCalled();
    expect(button.setPointerCapture).not.toHaveBeenCalled();
    expect(row.dataset.swipeAction).toBeUndefined();
    expect(dialog.showModal).not.toHaveBeenCalled();
});

test.each(['pointercancel', 'lostpointercapture'])('%s resets a drag and suppresses its click', type => {
    const {button, row} = setup();
    swipe(button, 70, 0, type);
    expect(row.dataset.swipeAction).toBe('');
    expect(row.classList.contains('swiping')).toBe(false);
    expect(button.emit('click').stopImmediatePropagation).toHaveBeenCalled();
});

test('only one room can stay open and tapping outside closes it', () => {
    const {button, row, addRoom, document} = setup();
    const second = addRoom();
    swipe(button, 70);
    swipe(second.button, -70);
    expect(row.dataset.swipeAction).toBe('');
    expect(second.row.dataset.swipeAction).toBe('edit');
    document.emit('pointerdown', {target: {closest: () => null}});
    expect(second.row.dataset.swipeAction).toBe('');
});

test('tapping an open room closes it without selecting, and the next tap selects normally', () => {
    const {button, row} = setup();
    swipe(button, 70);
    button.emit('click');
    button.emit('pointerdown');
    button.emit('pointerup');
    expect(button.emit('click').stopImmediatePropagation).toHaveBeenCalled();
    expect(row.dataset.swipeAction).toBe('');
    button.emit('pointerdown');
    button.emit('pointerup');
    expect(button.emit('click').stopImmediatePropagation).not.toHaveBeenCalled();
});

test('a reverse drag closes an exposed action', () => {
    const {button, row} = setup();
    swipe(button, 70);
    swipe(button, -60);
    expect(row.dataset.swipeAction).toBe('');
});

test.each(['edit', 'remove'])('tapping %s closes the swipe without replacing the existing handler', action => {
    const state = setup();
    const original = state[action].onclick;
    swipe(state.button, action === 'edit' ? -70 : 70);
    state[action].emit('click');
    expect(state.row.dataset.swipeAction).toBe('');
    expect(state[action].onclick).toBe(original);
});

test('Escape closes the swipe and returns focus to the room', () => {
    const {button, row} = setup();
    swipe(button, -70);
    row.emit('keydown', {key: 'Escape'});
    expect(row.dataset.swipeAction).toBe('');
    expect(button.focus).toHaveBeenCalled();
});

test.each([[true, false], [false, true]])('hold-for-options works on tablets and phones (%s, %s)', (tablet, phone) => {
    const {button, dialog, elements} = setup(tablet, phone);
    button.emit('pointerdown');
    jest.advanceTimersByTime(500);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(elements['room-actions-title'].textContent).toBe('Kitchen');
    expect(button.emit('click').stopImmediatePropagation).toHaveBeenCalled();
});

test('desktop mouse clicks keep normal selection and do not enable swipes', () => {
    const {button, row, dialog} = setup(false);
    swipe(button, 70);
    expect(button.emit('click').stopImmediatePropagation).not.toHaveBeenCalled();
    expect(row.dataset.swipeAction).toBeUndefined();
    jest.advanceTimersByTime(600);
    expect(dialog.showModal).not.toHaveBeenCalled();
});

test('phone gestures keep horizontal room scrolling instead of tablet swipes', () => {
    const {button, row, dialog} = setup(false, true);
    swipe(button, 70);
    expect(button.setPointerCapture).not.toHaveBeenCalled();
    expect(row.dataset.swipeAction).toBeUndefined();
    jest.advanceTimersByTime(600);
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(button.attributes['aria-describedby']).toBe('room-hold-hint');
});

test('disabled rooms and secondary pointers do not start a gesture', () => {
    const {button, row, dialog} = setup();
    button.emit('pointerdown', {isPrimary: false});
    button.emit('pointermove', {clientX: 170});
    button.disabled = true;
    swipe(button, 70);
    jest.advanceTimersByTime(600);
    expect(row.dataset.swipeAction).toBeUndefined();
    expect(dialog.showModal).not.toHaveBeenCalled();
});

test('keyboard users retain the room options menu', () => {
    const {button, dialog} = setup();
    button.emit('keydown', {key: 'F10', shiftKey: true});
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
});

test('tablet swipe styles preserve vertical scrolling, hide inactive actions, and respect reduced motion', () => {
    const html = fs.readFileSync(path.join(__dirname, '../dist/Selection-Board.html'), 'utf8');
    expect(html).toContain('@media(min-width:701px) and (any-pointer:coarse)');
    expect(html).toContain('touch-action:pan-y');
    expect(html).toContain('visibility:hidden;opacity:0;pointer-events:none');
    expect(html).toContain('[data-swipe-action="delete"]>.room-delete');
    expect(html).toContain('[data-swipe-action="edit"]>.room-edit');
    expect(html).toContain('@media(prefers-reduced-motion:reduce){.room-row>.room{transition:none}}');
});

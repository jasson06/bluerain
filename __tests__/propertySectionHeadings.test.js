const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
    const headings = ['Payments Workspace', 'Units', 'Tenants', 'Unrelated heading'].map(textContent => ({
        textContent, dataset: {}, classList: {add: jest.fn()}
    }));
    const dashboard = {
        querySelectorAll: () => headings,
        classList: {toggle: jest.fn()}
    };
    const context = vm.createContext({
        state: {currentProperty: {name: 'B-2019 KENDALL 401'}},
        document: {getElementById: () => dashboard}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/property-management/js/navigation-properties.js'), 'utf8'), context);
    return {context, headings, dashboard};
}

describe('property section headings', () => {
    test('payments header includes the property name in the requested order', () => {
        const {context, headings} = setup();
        context.updatePropertySectionHeadings();
        expect(headings[0].textContent).toBe('Payments-B-2019 KENDALL 401');
        expect(headings[0].dataset.propertySectionLabel).toBe('Payments Workspace');
        expect(headings[0].classList.add).toHaveBeenCalledWith('property-context-heading');
        expect(headings[1].textContent).toBe('B-2019 KENDALL 401 – Units');
        expect(headings[2].textContent).toBe('B-2019 KENDALL 401 – Tenants');
        expect(headings[3].textContent).toBe('Unrelated heading');
    });

    test('repeated updates and switching properties do not duplicate the name', () => {
        const {context, headings} = setup();
        context.updatePropertySectionHeadings();
        context.updatePropertySectionHeadings();
        expect(headings[0].textContent).toBe('Payments-B-2019 KENDALL 401');
        context.state.currentProperty = {name: '  Second Property  '};
        context.updatePropertySectionHeadings();
        expect(headings[0].textContent).toBe('Payments-Second Property');
        expect(headings[1].textContent).toBe('Second Property – Units');
    });

    test('clearing the property restores the original headings', () => {
        const {context, headings, dashboard} = setup();
        context.updatePropertySectionHeadings();
        context.state.currentProperty = null;
        context.updatePropertySectionHeadings();
        expect(headings[0].textContent).toBe('Payments Workspace');
        expect(headings[1].textContent).toBe('Units');
        expect(dashboard.classList.toggle).toHaveBeenLastCalledWith('property-combined-headings', false);
    });
});

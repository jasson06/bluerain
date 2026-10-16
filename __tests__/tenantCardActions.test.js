const fs = require('fs');
const path = require('path');
const vm = require('vm');

const readScript = name => fs.readFileSync(path.join(__dirname, '../dist/property-management/js', name), 'utf8');

function renderCard(mode) {
    const tenant = {_id: 'tenant-a', name: 'Alex & Sam <Smith>', leaseStatus: 'active'};
    const list = {innerHTML: '', querySelectorAll: () => []};
    const context = vm.createContext({
        document: {getElementById: () => list},
        state: {tenants: [tenant], units: []},
        currentTenantTab: 'active',
        getUnifiedCurrentPropertyPayments: () => [],
        propertyRecordPage: (id, items) => items,
        computeTenantMonthTotals: () => ({paid: 0, expected: 0}),
        escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        portfolioDate: () => 'Not set',
        portfolioMoney: () => '$0.00',
        renderPortfolioTenantNotesBadge: () => '',
        openPortfolioRecordDrawer: jest.fn(),
        viewTenantDetails: jest.fn(),
        editTenant: jest.fn()
    });
    if (mode === 'property') {
        const source = readScript('tenants.js');
        vm.runInContext(source.slice(source.indexOf('function renderTenants()'), source.indexOf('async function sendTenantCardNote(')), context);
        context.renderTenants();
        return {html: list.innerHTML, context};
    }
    const source = readScript('portfolio-dashboard.js');
    const start = source.indexOf('function renderPortfolioTenantGridCard(');
    vm.runInContext(source.slice(start, source.indexOf('\n', start)), context);
    if (mode === 'portfolio override') {
        const overrides = readScript('property-management.js');
        vm.runInContext(overrides.slice(
            overrides.indexOf('const renderPortfolioTenantGridCardBase='),
            overrides.indexOf('const renderTenantDetailsWithLedgerBase=')
        ), context);
    }
    return {html: context.renderPortfolioTenantGridCard({tenant, notesCount: 0}), context};
}

describe.each(['property', 'portfolio', 'portfolio override'])('%s tenant card actions', mode => {
    test('tenant name is an escaped, keyboard-accessible details button', () => {
        const {html, context} = renderCard(mode);
        const nameButton = html.match(/<button[^>]*class="tenant-name-button"[^>]*>[^]*?<\/button>/)[0];
        expect(nameButton).toContain('type="button"');
        expect(nameButton).toContain('Alex &amp; Sam &lt;Smith&gt;');
        vm.runInContext(nameButton.match(/onclick="([^"]+)"/)[1], context);
        if (mode === 'property') {
            expect(context.viewTenantDetails).toHaveBeenCalledWith('tenant-a');
        } else {
            expect(context.openPortfolioRecordDrawer).toHaveBeenCalledWith('tenant', 'tenant-a');
        }
        expect(html).not.toMatch(/<button[^>]*>[^<]*<i class="fas fa-eye"[^]*?Details\s*<\/button>/);
    });

    test('edit button is icon-only, labeled, and still edits the tenant', () => {
        const {html, context} = renderCard(mode);
        const editButton = html.match(/<button[^>]*onclick="editTenant\('[^']+'\)"[^>]*>[^]*?<\/button>/)[0];
        expect(editButton).toContain('type="button"');
        expect(editButton).toContain('aria-label="Edit tenant"');
        expect(editButton).toContain('title="Edit tenant"');
        expect(editButton).toContain('aria-hidden="true"');
        expect(editButton.replace(/<[^>]+>/g, '').trim()).toBe('');
        vm.runInContext(editButton.match(/onclick="([^"]+)"/)[1], context);
        expect(context.editTenant).toHaveBeenCalledWith('tenant-a');
    });
});

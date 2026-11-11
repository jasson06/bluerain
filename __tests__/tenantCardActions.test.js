const fs = require('fs');
const path = require('path');
const vm = require('vm');

const readScript = name => fs.readFileSync(path.join(__dirname, '../dist/property-management/js', name), 'utf8');

function renderCard(mode, notesHistory = []) {
    const tenant = {_id: 'tenant-a', name: 'Alex & Sam <Smith>', leaseStatus: 'active', notesHistory};
    const list = {innerHTML: '', querySelectorAll: () => []};
    const context = vm.createContext({
        document: {getElementById: () => list},
        state: {tenants: [tenant], units: []},
        currentTenantTab: 'active',
        getUnifiedCurrentPropertyPayments: () => [],
        propertyRecordPage: (id, items) => items,
        localStorage: {getItem: () => 'Management'},
        computeTenantMonthTotals: () => ({paid: 0, expected: 0}),
        escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        portfolioDate: () => 'Not set',
        portfolioMoney: () => '$0.00',
        renderPortfolioTenantNotesBadge: () => '',
        openPortfolioRecordDrawer: jest.fn(),
        viewTenantDetails: jest.fn(),
        editTenant: jest.fn()
    });

    vm.runInContext(readScript('notes.js'), context);
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

    describe.each(['property', 'portfolio override'])('%s tenant note deletion', mode => {
        function setupDeletion() {
            const notes = [{_id: 'note-a', text: 'Delete this'}, {_id: 'note-b', text: 'Keep this'}];
            const {html, context} = renderCard(mode, notes);
            const source = readScript('tenants.js');
            vm.runInContext(source.slice(source.indexOf('async function deleteTenantCardNote('), source.indexOf('async function viewTenantDetails(')), context);
            const other = {_id: 'tenant-b', notesHistory: [{_id: 'note-c', text: 'Other tenant'}]};
            context.state.tenants.push(other);
            context.state.allTenants = [...context.state.tenants];
            context.state.portfolioWorkspaceMode = mode === 'property' ? 'properties' : 'tenants';
            context.state.portfolioTenantView = 'grid';
            context.confirm = jest.fn(() => true);
            context.fetch = jest.fn(async () => ({ok: true, json: async () => ({notes: [notes[1]]})}));
            context.renderTenants = jest.fn();
            context.renderUnifiedPortfolioWorkspace = jest.fn();
            context.showNotification = jest.fn();
            context.console = {error: jest.fn()};
            const button = html.match(/<button[^>]*class="tenant-card-note-delete"[^>]*>/)[0];
            const handler = button.match(/onclick="([^"]+)"/)[1];
            const event = {preventDefault: jest.fn(), stopPropagation: jest.fn()};
            context.deleteButton = {dataset: {tenantId: 'tenant-a', noteId: 'note-a'}};
            context.clickEvent = event;
            const click = () => vm.runInContext(`(function(event) { return ${handler}; }).call(deleteButton, clickEvent)`, context);
            return {context, event, click, notes, other};
        }

        test('clicking the rendered trash control confirms once, deletes once, and updates the correct tenant', async () => {
            const {context, event, click, notes, other} = setupDeletion();
            await click();
            expect(event.preventDefault).toHaveBeenCalledTimes(1);
            expect(event.stopPropagation).toHaveBeenCalledTimes(1);
            expect(context.confirm).toHaveBeenCalledTimes(1);
            expect(context.fetch).toHaveBeenCalledTimes(1);
            expect(context.fetch).toHaveBeenCalledWith('/api/tenants/tenant-a/notes/note-a', {method: 'DELETE'});
            expect(context.state.tenants[0].notesHistory).toEqual([notes[1]]);
            expect(context.state.allTenants[0].notesHistory).toEqual([notes[1]]);
            expect(context.state.tenants[1]).toBe(other);
            if (mode === 'property') {
                expect(context.renderTenants).toHaveBeenCalledTimes(1);
                expect(context.renderUnifiedPortfolioWorkspace).not.toHaveBeenCalled();
            } else {
                expect(context.renderUnifiedPortfolioWorkspace).toHaveBeenCalledWith(false);
                expect(context.renderTenants).not.toHaveBeenCalled();
            }
            expect(readScript('tenants.js')).not.toContain("querySelectorAll('.tenant-card-note-delete')");
        });

        test('cancelling the rendered delete action leaves all notes untouched', async () => {
            const {context, click, notes} = setupDeletion();
            context.confirm.mockReturnValue(false);
            await click();
            expect(context.fetch).not.toHaveBeenCalled();
            expect(context.state.tenants[0].notesHistory).toEqual(notes);
            expect(context.renderTenants).not.toHaveBeenCalled();
            expect(context.renderUnifiedPortfolioWorkspace).not.toHaveBeenCalled();
        });

        test('a failed delete keeps the notes and displays an error', async () => {
            const {context, click, notes} = setupDeletion();
            context.fetch.mockResolvedValue({ok: false});
            await click();
            expect(context.state.tenants[0].notesHistory).toEqual(notes);
            expect(context.showNotification).toHaveBeenCalledWith('Could not delete tenant note', 'error');
            expect(context.renderTenants).not.toHaveBeenCalled();
            expect(context.renderUnifiedPortfolioWorkspace).not.toHaveBeenCalled();
        });
    });
describe.each(['property', 'portfolio', 'portfolio override'])('%s tenant card actions', mode => {
    test('notes show their saved author, never the currently signed-in viewer for legacy notes', () => {
        const {html} = renderCard(mode, [
            {_id: 'note-a', text: 'Authored note', authorRole: 'manager', authorName: 'Original <Manager>'},
            {_id: 'note-b', text: 'Legacy note'}
        ]);
        expect(html).toContain('Original &lt;Manager&gt;');
        expect(html).toContain('Management');
        const {html: legacy, context} = renderCard(mode, [{_id: 'old', text: 'Legacy note'}]);
        context.localStorage.getItem = () => 'Different Viewer';
        const rerendered = mode === 'property'
            ? (context.renderTenants(), context.document.getElementById().innerHTML)
            : context.renderPortfolioTenantGridCard({tenant: {_id: 'tenant-a', name: 'Tenant', notesHistory: [{_id: 'old', text: 'Legacy note'}]}});
        expect(legacy).toContain('Management');
        expect(rerendered).not.toContain('Different Viewer');
    });
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

    test.each(['property', 'portfolio override'])('%s tenant notes have separate hover edit and delete controls', mode => {
        const {html} = renderCard(mode, [{_id: 'note-a', text: '<b>Note</b>', createdAt: '2026-11-11'}]);
        expect(html).toContain('class="tenant-card-note-edit tenant-note-edit"');
        expect(html).toContain('aria-label="Edit note"');
        expect(html).toContain('onclick="editTenantNote(event, this)"');
        expect(html).toContain('class="tenant-card-note-delete"');
        expect(html).toContain('data-tenant-note-text data-tenant-id="tenant-a" data-note-id="note-a"');
        expect(html).toContain('&lt;b&gt;Note&lt;/b&gt;');
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

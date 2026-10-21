const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../dist/property-management');
const readScript = name => fs.readFileSync(path.join(root, 'js', name), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/property-management.css'), 'utf8').replace(/\r\n/g, '\n');
const rule = selector => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start) + 1);
};

test('card fields use available panel width and shrink to one column on narrow panels', () => {
    const panel = rule('.compact-maintenance-panel');
    expect(panel).toContain('display: grid');
    expect(panel).toContain('grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr))');
    expect(panel).toContain('gap: 10px 14px');
    expect(panel).toContain('min-width: 0');
    expect(panel).toContain('align-content: start');
});

test('descriptions, photos, and selected completion details span the full field grid', () => {
    const fullWidth = rule('.compact-maintenance-panel > .maintenance-description-card,\n.compact-maintenance-panel > [data-maint-photo-upload],\n.compact-maintenance-panel > .rm-details');
    expect(fullWidth).toContain('grid-column: 1 / -1');
});

test('inline editors retain their event delegation wrappers while their fields join the panel grid', () => {
    expect(rule('.compact-maintenance-panel > .maintenance-inline-editor')).toContain('display: contents !important');
    const labels = rule('.compact-maintenance-panel > .maintenance-inline-editor > label');
    expect(labels).toContain('grid-template-columns: minmax(0, 1fr) !important');
    expect(labels).toContain('min-width: 0');
    const controls = rule('.compact-maintenance-panel .maintenance-inline-editor input,\n.compact-maintenance-panel .maintenance-inline-editor select,\n.compact-maintenance-panel .maintenance-vendor-combobox');
    expect(controls).toContain('width: 100% !important');
    expect(controls).toContain('box-sizing: border-box');
    expect(controls).toContain('min-width: 0');
});

test.each([
    ['renderMaintenanceInlineEditor', { _id: 'request-a' }, 'maintenance-inline-vendor', 'maintenance-inline-scheduled', 'maintenance-inline-workflow'],
    ['renderRecurringMaintenanceInlineEditor', { _id: 'schedule-a', status: 'pending' }, 'recurring-maintenance-inline-vendor', 'recurring-maintenance-inline-start-date', 'recurring-maintenance-inline-status']
])('%s preserves all editable fields inside the shared layout wrapper', (name, item, vendor, date, status) => {
    const source = readScript('maintenance-workflow.js');
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    const context = vm.createContext({
        getMaintenanceWorkflowStage: () => 'new',
        getMaintenanceVendorId: () => 'vendor-a',
        getMaintenanceVendorLabel: () => 'Vendor',
        formatMaintenanceDateTimeInput: () => '',
        getMaintenanceWorkflowOptionsHtml: () => '<option>New</option>',
        getRecurringMaintenanceDateFieldLabel: () => 'Start Date',
        getRecurringMaintenanceDisplayDate: () => '',
        getRecurringMaintenanceStatusOptionsHtml: () => '<option>Upcoming</option>',
        renderMaintenanceVendorCombobox: options => `<div class="maintenance-vendor-combobox"><input class="${options.hiddenClass}"></div>`
    });
    vm.runInContext(source.slice(start, end), context);
    for (const compact of [true, false]) {
        const html = context[name](item, name === 'renderMaintenanceInlineEditor' ? compact : { compact });
        expect(html).toContain('class="maintenance-inline-editor');
        expect(html).toContain(vendor);
        expect(html).toContain(date);
        expect(html).toContain(status);
        expect((html.match(/<label /g) || [])).toHaveLength(3);
    }
});

test('property and portfolio card renderers and the legacy refresh path use the shared panel', () => {
    const workflow = readScript('maintenance-workflow.js');
    const schedules = readScript('maintenance-schedules.js');
    const requests = readScript('maintenance-requests.js');
    expect((workflow.match(/class="compact-maintenance-panel"/g) || [])).toHaveLength(3);
    expect(schedules).toContain('class="compact-maintenance-panel"');
    expect(requests).toContain('class="compact-maintenance-panel"');
    const fallback = workflow.slice(workflow.indexOf('const descriptionHtml = `'), workflow.indexOf('const replacementHtml = `'));
    expect(fallback).toContain('class="maintenance-description-card"');
});

test('mobile cards keep a compact two-column field grid without compressing date-time inputs', () => {
    const mobile = fs.readFileSync(path.join(root, 'css/mobile-compact-workspace.css'), 'utf8').replace(/\r\n/g, '\n');
    const phone = mobile.slice(mobile.indexOf('@media (max-width:600px)'));
    const panel = phone.match(/\.compact-maintenance-card \.compact-maintenance-panel \{([^}]+)\}/)[1];
    expect(panel).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(panel).toContain('gap:6px 8px');
    expect(panel).toContain('font-size:.78rem');
    expect(phone).toMatch(/label:has\(\.maintenance-inline-scheduled\) \{\s*grid-column:1 \/ -1;/);
    expect(phone).toContain('height:36px!important');
    expect(phone).toContain('min-height:36px!important');
    expect(phone).toContain('font-size:16px!important');
    expect(mobile).toContain('grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr))');
});

test('date pickers share card control heights and normalize native WebKit content sizing', () => {
    const controls = rule('.compact-maintenance-panel .maintenance-inline-editor input:not([type="hidden"]),\n.compact-maintenance-panel .maintenance-inline-editor select');
    expect(controls).toContain('height: 36px');
    expect(controls).toContain('min-height: 36px');
    expect(controls).toContain('margin: 0');
    expect(controls).toContain('font-family: inherit');
    expect(rule('.compact-maintenance-panel .maintenance-inline-editor input:is([type="date"], [type="datetime-local"])')).toContain('appearance: none');
    expect(rule('.compact-maintenance-panel .maintenance-inline-editor input::-webkit-date-and-time-value')).toContain('min-width: 0');
    expect(rule('.compact-maintenance-panel .maintenance-inline-editor input::-webkit-datetime-edit')).toContain('padding: 0');
});

test('request fields use a flat compact grid with consistent labels instead of padded tiles', () => {
    const fields = rule('.compact-maintenance-panel:has(> .maintenance-inline-editor[data-request-id])');
    expect(fields).toContain('gap: 6px 10px');
    expect(fields).not.toMatch(/padding:|border:|background:/);
    expect(css).not.toContain('background: rgba(148, 163, 184, 0.06)');
    const mobile = fs.readFileSync(path.join(root, 'css/mobile-compact-workspace.css'), 'utf8');
    expect(mobile).not.toMatch(/\.maintenance-inline-editor\[data-request-id\]\s*>\s*label\s*\{/);
    const labels = rule('.compact-maintenance-panel:has(> .maintenance-inline-editor[data-request-id]) > div:not(.maintenance-description-card, .maintenance-inline-editor, [data-maint-photo-upload], .rm-details) > strong,\n.compact-maintenance-panel > .maintenance-inline-editor[data-request-id] > label > :is(strong, span)');
    expect(labels).toContain('font-size: 0.74rem !important');
    expect(labels).toContain('font-weight: 600');
});

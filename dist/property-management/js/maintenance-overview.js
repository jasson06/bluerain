// Property management: maintenance overview.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Helper to render the global maintenance overview table into the modal body
function setGlobalMaintenanceOverviewTab(tabName) {
    globalMaintenanceOverviewState.activeTab = tabName;
    if (tabName === 'recurring') {
        globalMaintenanceOverviewState.filters.recurring = {
            property: '',
            status: 'in-progress',
            date: ''
        };
    }
    renderGlobalMaintenanceOverviewBody();
}

function getRecurringMaintenanceStatusLabel(status) {
    if (!status || status === 'pending') return 'Up-coming';
    if (status === 'in-progress') return 'In-progress';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getMaintenanceOverviewStatusLabel(status, tabName) {
    const rawStatus = status || 'pending';
    if (tabName === 'recurring') return getRecurringMaintenanceStatusLabel(rawStatus);
    return getMaintenanceWorkflowStageLabel(getMaintenanceWorkflowStage({ workflowStage: rawStatus, status: rawStatus }));
}

function getMaintenanceOverviewStageValue(item, tabName) {
    if (tabName === 'recurring') return item.status || 'pending';
    return getMaintenanceWorkflowStage(item);
}

function getMaintenanceOverviewAssignedLabel(item, tabName) {
    if (tabName === 'recurring') return item.assignedVendor?.name || '—';
    return getMaintenanceVendorLabel(item);
}

function getMaintenanceOverviewScheduledLabel(item, tabName) {
    if (tabName === 'recurring') {
        return item.nextScheduledDate ? formatDateDisplay(item.nextScheduledDate, 'en-US') : '—';
    }
    return item.scheduledFor ? formatMaintenanceDateTime(item.scheduledFor) : 'Not scheduled';
}

function getMaintenanceOverviewWorkflowControl(item) {
    const selectedStage = getMaintenanceWorkflowStage(item);
    return `<select class="maintenance-workflow-select" data-project-id="${(item.projectId && item.projectId._id) || item.projectId || ''}" data-request-id="${item._id || ''}" style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#ffffff24;min-width:138px;">${getMaintenanceWorkflowOptionsHtml(selectedStage)}</select>`;
}

function getMaintenanceOverviewPropertyLabel(item) {
    const projectName = item.projectName || (item.projectId && item.projectId.name) || '';
    let propertyAddress = item.propertyAddress || '';

    if (!propertyAddress && item.projectId) {
        const a = item.projectId.address || {};
        const line1 = a.line1 || a.addressLine1 || a.street || item.projectId.line1 || '';
        const line2 = a.line2 || a.addressLine2 || a.suite || item.projectId.line2 || '';
        const city = a.city || item.projectId.city || '';
        const state = a.state || item.projectId.state || '';
        const zip = a.zip || a.postalCode || item.projectId.zip || '';
        const parts = [];
        if (line1) parts.push(line1);
        if (line2) parts.push(line2);
        let last = '';
        if (city) last += city;
        if (state) last += (last ? ', ' : '') + state;
        if (zip) last += (last ? ' ' : '') + zip;
        if (last) parts.push(last);
        if (parts.length) propertyAddress = parts.join(', ');
    }

    if (!propertyAddress && item.notes) {
        try {
            const n = JSON.parse(item.notes);
            propertyAddress = n.propertyAddress || '';
        } catch {}
    }

    return propertyAddress || projectName || '—';
}

function getMaintenanceOverviewPropertyKey(item) {
    return String((item.projectId && item.projectId._id) || item.projectId || getMaintenanceOverviewPropertyLabel(item) || '').trim();
}

function getMaintenanceOverviewDateValue(value) {
    if (!value) return '';
    const s = String(value);
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMaintenanceOverviewDataset(tabName) {
    return tabName === 'recurring'
        ? globalMaintenanceOverviewState.schedules
        : globalMaintenanceOverviewState.requests;
}

function getMaintenanceOverviewDateField(tabName) {
    return tabName === 'recurring' ? 'nextScheduledDate' : 'createdAt';
}

function resetGlobalMaintenanceOverviewFilters(tabName = null) {
    const defaults = {
        requests: { property: '', status: '', date: '' },
        recurring: { property: '', status: 'in-progress', date: '' }
    };

    if (tabName) {
        globalMaintenanceOverviewState.filters[tabName] = { ...defaults[tabName] };
        return;
    }

    globalMaintenanceOverviewState.filters.requests = { ...defaults.requests };
    globalMaintenanceOverviewState.filters.recurring = { ...defaults.recurring };
}

function getFilteredGlobalMaintenanceOverviewItems(tabName, excludedFilter = '') {
    const filters = globalMaintenanceOverviewState.filters[tabName];
    const dateField = getMaintenanceOverviewDateField(tabName);
    return getMaintenanceOverviewDataset(tabName).filter(item => {
        if (excludedFilter !== 'property' && filters.property && getMaintenanceOverviewPropertyKey(item) !== filters.property) {
            return false;
        }
        if (excludedFilter !== 'status' && filters.status && getMaintenanceOverviewStageValue(item, tabName) !== filters.status) {
            return false;
        }
        if (excludedFilter !== 'date' && filters.date && getMaintenanceOverviewDateValue(item[dateField]) !== filters.date) {
            return false;
        }
        return true;
    });
}

function getGlobalMaintenanceOverviewPropertyOptions(tabName) {
    const options = new Map();
    getFilteredGlobalMaintenanceOverviewItems(tabName, 'property').forEach(item => {
        const key = getMaintenanceOverviewPropertyKey(item);
        const label = getMaintenanceOverviewPropertyLabel(item);
        if (key && !options.has(key)) {
            options.set(key, label);
        }
    });
    return Array.from(options.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

function getGlobalMaintenanceOverviewStatusOptions(tabName) {
    const options = Array.from(new Set(
        getFilteredGlobalMaintenanceOverviewItems(tabName, 'status').map(item => getMaintenanceOverviewStageValue(item, tabName) || 'pending')
    ));
    const preferredOrder = tabName === 'recurring'
        ? ['in-progress', 'pending', 'completed']
        : ['new', 'scheduled', 'waiting', 'in-progress', 'completed', 'closed'];
    const ordered = [
        ...preferredOrder.filter(status => options.includes(status)),
        ...options.filter(status => !preferredOrder.includes(status)).sort()
    ];
    return ordered.length ? ordered : preferredOrder;
}

function renderGlobalMaintenanceRequestsOverview(items, hasFilters) {
    if (!items.length) {
        return `<div class="empty-state" style="text-align:center;padding:24px;"><i class="fas fa-tools" style="font-size:2em;color:#3498db;margin-bottom:8px;"></i><p>${hasFilters ? 'No maintenance requests match the current filters.' : 'No open maintenance requests found.'}</p></div>`;
    }

    return `
        <div style="overflow-x:auto;">
            <table class="maintenance-table mobile-overview-table" style="width:100%;border-collapse:collapse;background:#99a0a500;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);">
                <thead>
                    <tr style="background:#99a0a500;">
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Title</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Description</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Property Address</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Unit</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Priority</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Workflow</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Assigned</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Scheduled</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Cost</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Status</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Created</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(r => {
                        const created = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                        const unitLabel = r.unitId ? `Unit ${r.unitId.number || ''}` : '—';
                        const priority = (r.priority || '').charAt(0).toUpperCase() + (r.priority || '').slice(1);
                        const rawStatus = r.status || 'pending';
                        const workflowStage = getMaintenanceWorkflowStage(r);
                        const assignedLabel = getMaintenanceOverviewAssignedLabel(r, 'requests');
                        const scheduledLabel = getMaintenanceOverviewScheduledLabel(r, 'requests');
                        const costLabel = formatMaintenanceCost(r.cost);
                        return `
                            <tr style="border-bottom:1px solid #e1e8ed;">
                                <td class="mobile-card-wide" data-label="Title" style="padding:10px 8px;font-weight:600;color:#2563eb;">
                                    <button class="maintenance-jump-link" data-project-id="${(r.projectId && r.projectId._id) || r.projectId || ''}" data-request-id="${r._id || ''}" style="background:none;border:none;color:#2563eb;padding:0;margin:0;font:inherit;text-align:left;cursor:pointer;">
                                        ${r.title || ''}
                                    </button>
                                </td>
                                <td class="maintenance-description-cell mobile-card-wide" data-label="Description" style="padding:10px 8px;cursor:pointer;" title="${(r.description || '').replace(/\"/g, '&quot;')}">
                                    <div class="maintenance-description-inner">
                                        ${DescriptionEditor.render(r.description) || '<span style="color:#888;">No description provided.</span>'}
                                    </div>
                                </td>
                                <td class="mobile-card-wide" data-label="Property">${getMaintenanceOverviewPropertyLabel(r)}</td>
                                <td data-label="Unit">${unitLabel}</td>
                                <td data-label="Priority">${priority || '—'}</td>
                                <td class="mobile-card-wide" data-label="Workflow">${getMaintenanceOverviewWorkflowControl(r)}</td>
                                <td data-label="Assigned">${assignedLabel}</td>
                                <td data-label="Scheduled">${scheduledLabel}</td>
                                <td data-label="Cost">${costLabel}</td>
                                <td data-label="Status">
                                    <span class="status-badge ${rawStatus}">${rawStatus === 'completed' ? 'Completed' : (rawStatus === 'in-progress' ? 'In Progress' : 'Pending')}</span>
                                    <div style="margin-top:4px;font-size:0.78rem;color:#64748b;">${getMaintenanceWorkflowStageLabel(workflowStage)}</div>
                                </td>
                                <td data-label="Created">${created || '—'}</td>
                                <td data-label="Actions">
                                    <button onclick="openMaintenanceEstimate('${r._id || ''}', '${(r.projectId && r.projectId._id) || r.projectId || ''}', 'overview')" class="btn-secondary" title="Open Estimate">
                                        <i class="fas fa-file-invoice-dollar"></i>
                                    </button>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderGlobalRecurringMaintenanceOverview(items, hasFilters) {
    if (!items.length) {
        return `<div class="empty-state" style="text-align:center;padding:24px;"><i class="fas fa-calendar-alt" style="font-size:2em;color:#3498db;margin-bottom:8px;"></i><p>${hasFilters ? 'No recurring maintenance matches the current filters.' : 'No recurring maintenance found.'}</p></div>`;
    }

    return `
        <div style="overflow-x:auto;">
            <table class="maintenance-table mobile-overview-table" style="width:100%;border-collapse:collapse;background:#99a0a500;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);">
                <thead>
                    <tr style="background:#99a0a500;">
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Title</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Description</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Property Address</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Frequency</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Next Scheduled</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Vendor</th>
                        <th style="padding:12px 8px;font-weight:600;color:#2980b9;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(schedule => {
                        const frequency = schedule.frequency === 'custom' && schedule.intervalDays
                            ? `Every ${schedule.intervalDays} days`
                            : ((schedule.frequency || '').charAt(0).toUpperCase() + (schedule.frequency || '').slice(1));
                        const nextScheduled = schedule.nextScheduledDate
                            ? formatDateDisplay(schedule.nextScheduledDate, 'en-US')
                            : '—';
                        const vendorName = schedule.assignedVendor?.name || '—';
                        const rawStatus = schedule.status || 'pending';
                        const status = getRecurringMaintenanceStatusLabel(rawStatus);
                        return `
                            <tr style="border-bottom:1px solid #e1e8ed;">
                                <td class="mobile-card-wide" data-label="Title" style="padding:10px 8px;font-weight:600;color:#2563eb;">
                                    <button class="maintenance-schedule-jump-link" data-project-id="${(schedule.projectId && schedule.projectId._id) || schedule.projectId || ''}" data-schedule-id="${schedule._id || ''}" style="background:none;border:none;color:#2563eb;padding:0;margin:0;font:inherit;text-align:left;cursor:pointer;">
                                        ${schedule.title || ''}
                                    </button>
                                </td>
                                <td class="mobile-card-wide" data-label="Description">${DescriptionEditor.render(schedule.description) || '<span style="color:#888;">No description provided.</span>'}</td>
                                <td class="mobile-card-wide" data-label="Property">${getMaintenanceOverviewPropertyLabel(schedule)}</td>
                                <td data-label="Frequency">${frequency || '—'}</td>
                                <td data-label="Next scheduled">${nextScheduled}</td>
                                <td data-label="Vendor">${vendorName}</td>
                                <td data-label="Status"><span class="status-badge ${rawStatus}">${status}</span></td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderGlobalMaintenanceOverviewBody() {
    const body = document.getElementById('globalOverviewBody');
    const title = document.getElementById('globalOverviewTitle');
    if (!body || !title) return;

    title.textContent = window.innerWidth <= 900 ? 'Maintenance' : 'Maintenance Overview';

    if (!globalMaintenanceOverviewState.requests.length && !globalMaintenanceOverviewState.schedules.length) {
        body.innerHTML = '<div class="empty-state" style="text-align:center;padding:24px;"><i class="fas fa-tools" style="font-size:2em;color:#3498db;margin-bottom:8px;"></i><p>No open maintenance items found.</p></div>';
        return;
    }

    const activeTab = globalMaintenanceOverviewState.activeTab;
    const activeFilters = globalMaintenanceOverviewState.filters[activeTab];
    const filteredItems = getFilteredGlobalMaintenanceOverviewItems(activeTab);
    const propertyOptions = getGlobalMaintenanceOverviewPropertyOptions(activeTab);
    const statusOptions = getGlobalMaintenanceOverviewStatusOptions(activeTab);
    const totalItems = getMaintenanceOverviewDataset(activeTab).length;
    const hasFilters = Boolean(activeFilters.property || activeFilters.status || activeFilters.date);
    const dateLabel = activeTab === 'recurring' ? 'Scheduled Date' : 'Created Date';
    const activeTitle = activeTab === 'recurring' ? 'Recurring Maintenance' : 'Maintenance Requests';
    const activeSummary = `Showing ${filteredItems.length} of ${totalItems}`;
    const activeSection = activeTab === 'recurring'
        ? renderGlobalRecurringMaintenanceOverview(filteredItems, hasFilters)
        : renderGlobalMaintenanceRequestsOverview(filteredItems, hasFilters);

    body.innerHTML = `
        <div data-global-maintenance-content style="display:grid;gap:18px;">
            <div data-maintenance-overview-tabs style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <button type="button" data-maintenance-overview-tab="requests" class="${activeTab === 'requests' ? 'active' : ''}" style="border:none;border-radius:7px;padding:10px 16px;font-weight:600;font-size:0.90rem;cursor:pointer;background:${activeTab === 'requests' ? '#217dbb' : '#ffffff3b'};color:${activeTab === 'requests' ? '#fff' : '#217dbb'};transition:background 0.18s ease,color 0.18s ease,box-shadow 0.18s ease;box-shadow:${activeTab === 'requests' ? '0 10px 22px rgba(33,125,187,0.22)' : 'none'};">
                    <span><i class="fas fa-tools" style="margin-right:8px;"></i>Maintenance</span>
                    <span style="margin-left:8px;opacity:0.85;">${globalMaintenanceOverviewState.requests.length}</span>
                </button>
                <button type="button" data-maintenance-overview-tab="recurring" class="${activeTab === 'recurring' ? 'active' : ''}" style="border:none;border-radius:7px;padding:10px 16px;font-weight:600;font-size:0.90rem;cursor:pointer;background:${activeTab === 'recurring' ? '#217dbb' : '#ffffff3b'};color:${activeTab === 'recurring' ? '#fff' : '#217dbb'};transition:background 0.18s ease,color 0.18s ease,box-shadow 0.18s ease;box-shadow:${activeTab === 'recurring' ? '0 10px 22px rgba(33,125,187,0.22)' : 'none'};">
                    <span><i class="fas fa-sync-alt" style="margin-right:8px;"></i>Recurring Maintenance</span>
                    <span style="margin-left:8px;opacity:0.85;">${globalMaintenanceOverviewState.schedules.filter(item => String(item?.status || 'pending').toLowerCase() === 'in-progress').length}</span>
                </button>
            </div>
            <div data-maintenance-overview-filters style="display:flex;gap:12px;align-items:end;padding:0px;">
                <div style="display:grid;gap:6px;">
                    
                    <select data-maintenance-overview-filter="property" style="padding:8px 8px;border-radius:10px;border:1px solid #d1d5db;background:#ffffff24;">
                        <option value="">All properties</option>
                        ${propertyOptions.map(([key, label]) => `<option value="${key}" ${activeFilters.property === key ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </div>
                <div style="display:grid;gap:6px;">
                    
                    <select data-maintenance-overview-filter="status" style="padding:8px 8px;border-radius:10px;border:1px solid #d1d5db;background:#ffffff24;">
                        <option value="">All statuses</option>
                        ${statusOptions.map(status => `<option value="${status}" ${activeFilters.status === status ? 'selected' : ''}>${getMaintenanceOverviewStatusLabel(status, activeTab)}</option>`).join('')}
                    </select>
                </div>
                <div style="display:grid;gap:6px;">
                    
                    <input type="date" data-maintenance-overview-filter="date" value="${activeFilters.date || ''}" style="padding:8px 8px;border-radius:10px;border:1px solid #d1d5db;background:#ffffff24;" />
                </div>
                <div style="display:flex;justify-content:flex-end;align-items:end;">
                    <button type="button" class="global-overview-clear" data-maintenance-overview-clear-filters style="padding:8px 8px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff82;color:#1f2937;font-weight:600;cursor:pointer;" aria-label="Clear maintenance filters" title="Clear filters"><i class="fas fa-filter-circle-xmark" aria-hidden="true"></i></button>
                </div>
            </div>
            <section>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
                    <h3 style="margin:0;color:#217dbb;"><i class="${activeTab === 'recurring' ? 'fas fa-sync-alt' : 'fas fa-tools'}"></i> ${activeTitle}</h3>
                    <span style="font-size:0.95rem;color:#6b7280;">${activeSummary}</span>
                </div>
                ${activeSection}
            </section>
        </div>`;
}

async function renderGlobalMaintenanceOverview(resetFilters = true) {
    const cacheBust = Date.now();
    const [requestsRes, schedulesRes] = await Promise.all([
        fetch('/api/properties/maintenance?status=pending,in-progress&_=' + cacheBust),
        fetch('/api/properties/maintenance-schedules?status=pending,in-progress&_=' + cacheBust)
    ]);
    if (!requestsRes.ok || !schedulesRes.ok) throw new Error('Failed to fetch maintenance overview');
    const [items, schedules] = await Promise.all([requestsRes.json(), schedulesRes.json()]);
    globalMaintenanceOverviewState.requests = Array.isArray(items) ? items : [];
    globalMaintenanceOverviewState.schedules = Array.isArray(schedules) ? schedules : [];
    if (resetFilters) {
        resetGlobalMaintenanceOverviewFilters();
        globalMaintenanceOverviewState.activeTab = 'requests';
    }
    renderGlobalMaintenanceOverviewBody();
}

// Property management: navigation properties.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Tab Management
function initializeTabs() {
    const tabs = document.querySelectorAll('#propertyDashboard .tabs .tab-btn[data-tab]');
    tabs.forEach(tab => {
        if (tab.dataset.workspaceTabBound) return;
        tab.dataset.workspaceTabBound = 'true';
        tab.addEventListener('click', () => navigateWorkspaceTab(tab.getAttribute('data-tab')));
    });
    const activeBtn = document.querySelector('#propertyDashboard .tabs .tab-btn.active');
    if (activeBtn) state.currentTab = activeBtn.getAttribute('data-tab') || 'propertyOverview';
}

function updatePropertySectionHeadings() {
    const dashboard = document.getElementById('propertyDashboard');
    if (!dashboard) return;
    const name = String(state.currentProperty?.name || '').trim();
    const labels = {'Property Overview':'Overview', 'Property Information':'Property', Units:'Units', Tenants:'Tenants', Evictions:'Evictions', Maintenance:'Maintenance', Documents:'Documents', Announcements:'Announcements', Payments:'Payments', Applications:'Applications', Invites:'Invites'};
    dashboard.querySelectorAll('.tab-pane h2').forEach(heading => {
        const original = heading.dataset.propertySectionLabel || heading.textContent.trim();
        if (!Object.prototype.hasOwnProperty.call(labels, original)) return;
        heading.dataset.propertySectionLabel = original;
        heading.textContent = name ? name + ' – ' + labels[original] : original;
        heading.classList.add('property-context-heading');
    });
    dashboard.classList.toggle('property-combined-headings', !!name);
}

function showTabContent(tabId) {
    updatePropertySectionHeadings();
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    const selectedPane = document.getElementById(tabId);
    if (selectedPane) {
        selectedPane.classList.add('active');
    }
    document.getElementById('propertyDashboard')?.classList.toggle('property-overview-active', tabId === 'propertyOverview');
}

function updateTabCounts() {
    // Units
    document.getElementById('tabCountUnits').textContent = state.units?.length || 0;
    // Tenants (only active or pending)
    const activeOrPendingTenants = (state.tenants || []).filter(
        t => t.leaseStatus === 'active' || t.leaseStatus === 'pending'
    );
    document.getElementById('tabCountTenants').textContent = activeOrPendingTenants.length;
    // Documents
    document.getElementById('tabCountDocuments').textContent = state.documents?.length || 0;
    const annBadge = document.getElementById('tabCountAnnouncements');
    if (annBadge) annBadge.textContent = state.announcements?.length || 0;
    // Payments
    document.getElementById('tabCountPayments').textContent = state.payments?.length || 0;
    // Applications
    const appsBadge = document.getElementById('tabCountApplications');
    const appsFilteredCount = getFilteredApplicationsList().length;
    if (appsBadge) appsBadge.textContent = appsFilteredCount;
    // Mirror PENDING applications count into top toolbar icon
    const pendingAppsCount = (state.applications || []).filter(a => (a.status || 'pending') === 'pending').length;
    const topApps = document.getElementById('topApplicationsCount');
    if (topApps) topApps.textContent = pendingAppsCount > 99 ? '99+' : pendingAppsCount;
    renderWorkspaceSidebar();
}

async function loadEvictions(propertyId) {
    const list = document.getElementById('evictionsList');
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><p>Loading active evictions...</p></div>';
    const response = await fetch('/api/eviction-cases');
    if (!response.ok) throw new Error('Failed to fetch eviction cases');
    const cases = (await response.json()).filter(item => item.active && String(item.projectId) === String(propertyId));
    state.evictions = cases;
    const badge = document.getElementById('tabCountEvictions');
    if (badge) badge.textContent = cases.length;
    if (!cases.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-gavel"></i><h3>No active evictions</h3><p>This property has no active eviction cases.</p></div>';
        return;
    }
    const pretty = value => String(value || '').replace(/-/g, ' ').replace(/^./, letter => letter.toUpperCase());
    const date = value => value ? new Date(value).toLocaleDateString() : '—';
    list.innerHTML = `<div class="table-responsive"><table class="payments-table"><thead><tr><th>Tenant</th><th>Stage</th><th>Case Manager</th><th>Next Action</th><th>Due</th><th>Updated</th><th></th></tr></thead><tbody>${cases.map(item => `<tr data-eviction-case="${escapeHtml(item._id)}" tabindex="0"><td>${escapeHtml(item.snapshot?.tenantName || 'Unknown tenant')}</td><td><span class="status-badge">${escapeHtml(pretty(item.stage))}</span></td><td>${escapeHtml(item.owner || '—')}</td><td>${escapeHtml(item.nextAction || '—')}</td><td>${date(item.dueAt)}</td><td>${date(item.updatedAt)}</td><td><button type="button" class="btn-secondary" data-open-eviction="${escapeHtml(item._id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`;
    const openCase = event => {
        const row = event.target.closest('[data-eviction-case]');
        if (!row || event.target.closest('button') && !event.target.closest('[data-open-eviction]')) return;
        openEvictionCase(row.dataset.evictionCase, () => navigateWorkspaceTab('evictions'));
    };
    list.onclick = openCase;
    list.onkeydown = event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-eviction-case]')) { event.preventDefault(); openEvictionCase(event.target.dataset.evictionCase, () => navigateWorkspaceTab('evictions')); } };
}

async function loadTabContent(tabId, force = false) {
    if (!state.currentProperty) return;

    try {
        switch(tabId) {
            case 'propertyOverview':
                await renderPropertyOverview(true);
                break;
            case 'propertyInfo':
                renderPropertyProfile();
                break;
            case 'units':
                await loadUnits(state.currentProperty._id, force);
                break;
            case 'tenants':
                await loadTenants(state.currentProperty._id, force);
                break;
            case 'evictions':
                await loadEvictions(state.currentProperty._id);
                break;
            case 'maintenance':
                presetPropertyMaintenanceStatusFilters('in-progress', '');
                await loadMaintenanceRequests(state.currentProperty._id, force);
                await loadMaintenanceSchedules(); 
                break;
            case 'documents':
                await loadDocuments(state.currentProperty._id, force);
                break;
            case 'announcements':
                if (force || !Array.isArray(state.tenants) || !state.tenants.length) {
                    await loadTenants(state.currentProperty._id, force);
                }
                await loadAnnouncements(state.currentProperty._id);
                break;
            case 'payments':
                await loadPayments(state.currentProperty._id, force);
                break;
            case 'applications':
                await loadApplications(force);
                await loadInvites(force);
                break;
        }
    } catch (error) {
        console.error(`Error loading ${tabId} content:`, error);
        showNotification(`Error loading ${tabId}`, 'error');
    }
}

// Universal refresh that bypasses cache for the active or specified tab
async function refreshContent(section) {
    const target = section || state.currentTab || 'propertyOverview';
    await loadTabContent(target, true);
}

// Property Management
function setPropertyListLoading(isLoading) {
    const list=document.getElementById('propertyList');if(!list)return;
    if(isLoading){list.setAttribute('aria-busy','true');list.innerHTML=Array.from({length:4},()=>'<div class="property-card portfolio-skeleton" style="min-height:92px;margin-bottom:9px">Loading property</div>').join('');}
    else list.removeAttribute('aria-busy');
}

async function loadProperties() {
    setPropertyListLoading(true);
    try {
        // Fetch property datasets in parallel
        const [response, completedRes, onMarketRes] = await Promise.all([
            fetch('/api/projects'),
            fetch('/api/completed-projects'),
            fetch('/api/on-market-projects').catch(() => ({ ok: false }))
        ]);

        if (!response.ok) throw new Error('Failed to fetch projects');
        if (!completedRes.ok) throw new Error('Failed to fetch completed projects');

        const [data, completedData] = await Promise.all([
            response.json(),
            completedRes.json()
        ]);

        // Only multifamily properties
        const activeProperties = data.projects.filter(project =>
            project.type?.toLowerCase() === 'multifamily'
        );

        const completedProperties = (completedData.projects || []).filter(project =>
            project.type?.toLowerCase() === 'multifamily'
        );

        // --- Fetch "On Market" properties ---
        if (onMarketRes && onMarketRes.ok) {
            const onMarketData = await onMarketRes.json();
            state.onMarketProperties = (onMarketData.projects || []).filter(project =>
                project.type?.toLowerCase() === 'multifamily'
            );
            console.log('On Market Properties:', state.onMarketProperties);
        } else {
            state.onMarketProperties = [];
        }

        // Combine all lists: active, completed, and on market
        state.properties = [...activeProperties, ...completedProperties, ...state.onMarketProperties];

        renderPropertyList();
        const requestedProperty=new URLSearchParams(location.search).get('property')||localStorage.getItem('pmLastProperty');
        if(requestedProperty&&state.properties.some(property=>String(property._id)===String(requestedProperty))){await selectProperty(String(requestedProperty),{history:false,silentLoader:true});}

        // Defer summary prefetching to avoid blocking first paint
        runWhenIdle(() => {
            loadAllUnitsAndTenants().catch(() => {});
        });

        // Do not auto-select a property; default landing is portfolio overview
    } catch (error) {
        console.error('Error loading properties:', error);
        showNotification('Error loading properties', 'error');
    } finally {
        setPropertyListLoading(false);
    }
}

// Update the formatAddress function


// Update renderPropertyList to handle the address properly
/* Lucide icons (ISC): Copyright (c) Lucide Contributors 2022.
Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE. */
function renderWorkspaceOutlineIcons(root) {
 const shapes={"fa-layer-group":[["path",{"d":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{"d":"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{"d":"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]],"fa-building":[["path",{"d":"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"}],["path",{"d":"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"}],["path",{"d":"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"}],["path",{"d":"M10 6h4"}],["path",{"d":"M10 10h4"}],["path",{"d":"M10 14h4"}],["path",{"d":"M10 18h4"}]],"fa-sliders":[["line",{"x1":"21","x2":"14","y1":"4","y2":"4"}],["line",{"x1":"10","x2":"3","y1":"4","y2":"4"}],["line",{"x1":"21","x2":"12","y1":"12","y2":"12"}],["line",{"x1":"8","x2":"3","y1":"12","y2":"12"}],["line",{"x1":"21","x2":"16","y1":"20","y2":"20"}],["line",{"x1":"12","x2":"3","y1":"20","y2":"20"}],["line",{"x1":"14","x2":"14","y1":"2","y2":"6"}],["line",{"x1":"8","x2":"8","y1":"10","y2":"14"}],["line",{"x1":"16","x2":"16","y1":"18","y2":"22"}]],"fa-rail-settings":[["path",{"d":"M20 7h-9"}],["path",{"d":"M14 17H5"}],["circle",{"cx":"17","cy":"17","r":"3"}],["circle",{"cx":"7","cy":"7","r":"3"}]],"fa-property-information":[["rect",{"width":"16","height":"20","x":"4","y":"2","rx":"2","ry":"2"}],["path",{"d":"M9 22v-4h6v4"}],["path",{"d":"M8 6h.01"}],["path",{"d":"M16 6h.01"}],["path",{"d":"M12 6h.01"}],["path",{"d":"M12 10h.01"}],["path",{"d":"M12 14h.01"}],["path",{"d":"M16 10h.01"}],["path",{"d":"M16 14h.01"}],["path",{"d":"M8 10h.01"}],["path",{"d":"M8 14h.01"}]],"fa-house":[["path",{"d":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"}],["path",{"d":"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}]],"fa-chart-pie":[["path",{"d":"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"}],["path",{"d":"M21.21 15.89A10 10 0 1 1 8 2.83"}]],"fa-city":[["path",{"d":"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"}],["path",{"d":"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"}],["path",{"d":"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"}],["path",{"d":"M10 6h4"}],["path",{"d":"M10 10h4"}],["path",{"d":"M10 14h4"}],["path",{"d":"M10 18h4"}]],"fa-list-check":[["path",{"d":"m3 17 2 2 4-4"}],["path",{"d":"m3 7 2 2 4-4"}],["path",{"d":"M13 6h8"}],["path",{"d":"M13 12h8"}],["path",{"d":"M13 18h8"}]],"fa-file-invoice-dollar":[["path",{"d":"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{"d":"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{"d":"M8 18v-1"}],["path",{"d":"M12 18v-6"}],["path",{"d":"M16 18v-3"}]],"fa-gauge-high":[["path",{"d":"m12 14 4-4"}],["path",{"d":"M3.34 19a10 10 0 1 1 17.32 0"}]],"fa-door-open":[["path",{"d":"M13 4h3a2 2 0 0 1 2 2v14"}],["path",{"d":"M2 20h3"}],["path",{"d":"M13 20h9"}],["path",{"d":"M10 12v.01"}],["path",{"d":"M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"}]],"fa-users":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{"cx":"9","cy":"7","r":"4"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87"}],["path",{"d":"M16 3.13a4 4 0 0 1 0 7.75"}]],"fa-money-check-dollar":[["path",{"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}],["path",{"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],"fa-screwdriver-wrench":[["path",{"d":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"}]],"fa-file-signature":[["path",{"d":"m18 5-2.414-2.414A2 2 0 0 0 14.172 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2"}],["path",{"d":"M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"}],["path",{"d":"M8 18h1"}]],"fa-folder-open":[["path",{"d":"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"}]],"fa-bullhorn":[["path",{"d":"m3 11 18-5v12L3 14v-3z"}],["path",{"d":"M11.6 16.8a3 3 0 1 1-5.8-1.6"}]],"fa-link":[["path",{"d":"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{"d":"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]],"fa-thumbtack":[["path",{"d":"M12 17v5"}],["path",{"d":"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"}]],"fa-xmark":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"fa-sort":[["path",{"d":"m7 15 5 5 5-5"}],["path",{"d":"m7 9 5-5 5 5"}]],"fa-plus":[["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],"fa-user-plus":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{"cx":"9","cy":"7","r":"4"}],["line",{"x1":"19","x2":"19","y1":"8","y2":"14"}],["line",{"x1":"22","x2":"16","y1":"11","y2":"11"}]],"fa-dollar-sign":[["line",{"x1":"12","x2":"12","y1":"2","y2":"22"}],["path",{"d":"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"}]],"fa-wrench":[["path",{"d":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"}]],"fa-file-arrow-up":[["path",{"d":"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{"d":"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{"d":"M12 12v6"}],["path",{"d":"m15 15-3-3-3 3"}]],"fa-check":[["path",{"d":"M20 6 9 17l-5-5"}]],"fa-star":[["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"}]],"fa-circle":[["circle",{"cx":"12","cy":"12","r":"10"}]],"fa-circle-check":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m9 12 2 2 4-4"}]],"fa-trash":[["path",{"d":"M3 6h18"}],["path",{"d":"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{"d":"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{"x1":"10","x2":"10","y1":"11","y2":"17"}],["line",{"x1":"14","x2":"14","y1":"11","y2":"17"}]]};
 root.querySelector('[data-rail-group=settings] i')?.setAttribute('class','fas fa-rail-settings');
 root.querySelector('[data-sidebar-destination=propertyInfo] i')?.setAttribute('class','fas fa-property-information');
 root.querySelectorAll('i.fas').forEach(icon=>{
  const key=Object.keys(shapes).find(key=>icon.classList.contains(key)); if(!key)return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:icon.className.replace(/\bfas\b/g,'br-outline')}).forEach(([k,v])=>svg.setAttribute(k,v));
  shapes[key].forEach(([tag,attrs])=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));svg.appendChild(node)});
  icon.replaceWith(svg);
 });
}

function workspaceRailState() {
    return window.pmHoverRail || (window.pmHoverRail = { group: '', location: '', open: false, pinned: localStorage.getItem('pmSidebarPinned') === '1', hovering: false });
}

function setWorkspaceRailOpen(open) {
    const rail = workspaceRailState(), sidebar = document.querySelector('.sidebar');
    rail.open = open;
    sidebar?.classList.toggle('workspace-expanded', open || rail.pinned);
    document.body.classList.toggle('workspace-rail-expanded', window.innerWidth > 900 && (open || rail.pinned));
    const panel = document.getElementById('workspaceRailPanel');
    const visible = window.innerWidth <= 900 || open || rail.pinned;
    if (panel) { panel.inert = !visible; panel.setAttribute('aria-hidden', String(!visible)); }
}

function closeWorkspaceRailSoon() {
    const rail = workspaceRailState(); clearTimeout(rail.openTimer); clearTimeout(rail.closeTimer);
    rail.closeTimer = setTimeout(() => {
        const sidebar = document.querySelector('.sidebar');
        if (!rail.hovering && !rail.pinned && !document.getElementById('workspacePropertyPicker')?.classList.contains('open') && !sidebar?.querySelector(':focus-visible')) setWorkspaceRailOpen(false);
    }, 300);
}

function selectWorkspaceRailGroup(id) {
    workspaceRailState().group = id;
    setWorkspaceRailOpen(true);
    renderWorkspaceSidebar();
}

function toggleWorkspaceSidebar() {
    if (window.innerWidth <= 900) { document.querySelector('.sidebar')?.classList.toggle('visible'); return; }
    const rail = workspaceRailState(); rail.pinned = !rail.pinned;
    localStorage.setItem('pmSidebarPinned', rail.pinned ? '1' : '0');
    setWorkspaceRailOpen(rail.pinned || rail.hovering);
    renderWorkspaceSidebar();
}

function toggleWorkspacePropertyPicker(forceOpen = false) {
    const picker = document.getElementById('workspacePropertyPicker'); if (!picker) return;
    picker.classList.toggle('open', forceOpen || !picker.classList.contains('open'));
    const open = picker.classList.contains('open');
    document.getElementById('workspacePropertySwitch')?.setAttribute('aria-expanded', String(open));
    if (open) { setWorkspaceRailOpen(true); document.getElementById('workspacePropertySearch')?.focus(); }
    else closeWorkspaceRailSoon();
}

function renderWorkspaceSidebar() {
    const root = document.getElementById('propertyList'); if (!root) return;
    const rail = workspaceRailState(), sidebar = root.closest('.sidebar');
    const location = `${state.portfolioMode === true}:${state.currentTab}:${state.sidebarPanel || ''}`;
    if (!rail.group || rail.location !== location) rail.group = state.portfolioMode === true ? 'portfolio' : 'management';
    rail.location = location;
    const group = workspaceNavigationGroups.find(g => g.id === rail.group) || workspaceNavigationGroups[0];
    const property = state.currentProperty, units = state.units || [];
    const meta = property ? `${units.length} units · ${units.filter(u => String(u.status || '').toLowerCase() === 'occupied').length} occupied` : 'Choose a property to begin';
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id, focusDestination = focused?.dataset.sidebarDestination, focusGroup = focused?.dataset.railGroup;
    const icons = { portfolio: 'fa-layer-group', management: 'fa-building', settings: 'fa-sliders' };
    sidebar.classList.add('workspace-hover-sidebar'); document.body.classList.add('workspace-hover-layout');
    root.innerHTML = `<div class="br-rail"><div class="br-mark" aria-label="Bluerain"><i class="fas fa-building" aria-hidden="true"></i></div><nav class="br-sections" aria-label="Workspace sections">${workspaceNavigationGroups.map(g => `<button type="button" data-rail-group="${g.id}" class="${g.id === 'settings' ? 'br-settings' : ''}" aria-label="${g.label}" title="${g.label}" aria-pressed="${g.id === group.id}" onclick="selectWorkspaceRailGroup('${g.id}')"><i class="fas ${icons[g.id]}" aria-hidden="true"></i></button>`).join('')}</nav></div><div class="br-panel" id="workspaceRailPanel"><header class="br-header"><div><div class="br-wordmark" aria-label="Bluerain"><span>blue</span><strong>rain</strong><b aria-hidden="true"></b></div><div class="br-section-name">${group.label}</div></div><button type="button" id="workspaceRailPin" class="br-pin" onclick="toggleWorkspaceSidebar()" aria-label="${window.innerWidth <= 900 ? 'Close sidebar' : rail.pinned ? 'Unpin sidebar' : 'Pin sidebar open'}" aria-pressed="${rail.pinned}"><i class="fas ${window.innerWidth <= 900 ? 'fa-xmark' : 'fa-thumbtack'}" aria-hidden="true"></i></button></header><div class="br-property"><button type="button" id="workspacePropertySwitch" class="br-property-switch" aria-expanded="false" aria-controls="workspacePropertyPicker" onclick="toggleWorkspacePropertyPicker()"><i class="fas fa-building br-property-icon" aria-hidden="true"></i><span><small>Current property</small><strong>${escapeHtml(property?.name || 'Select a property')}</strong><em>${escapeHtml(meta)}</em></span><i class="fas fa-sort" aria-hidden="true"></i></button><div class="workspace-property-picker" id="workspacePropertyPicker"><input type="search" id="workspacePropertySearch" aria-label="Search properties" placeholder="Search properties…" oninput="filterWorkspaceProperties(this.value)"><div id="workspacePropertyOptions">${renderWorkspacePropertyOptions('')}</div></div></div><nav class="br-destinations" aria-label="${group.label}">${group.items.map(item => {
        const count = item.badge ? workspaceBadge(item.badge) : 0;
        const active = (item.action === 'portfolio' && state.portfolioMode === true) || (!state.portfolioMode && ((item.tab && state.currentTab === item.tab) || (item.panel && state.sidebarPanel === item.panel)));
        return `<button type="button" class="workspace-nav-item ${active ? 'active' : ''}" data-sidebar-destination="${item.id}" onclick="activateWorkspaceDestination('${item.id}')" ${active ? 'aria-current="page"' : ''}><i class="fas ${item.icon}" aria-hidden="true"></i><span>${item.label}</span>${count ? `<span class="workspace-nav-badge">${count > 99 ? '99+' : count}</span>` : ''}</button>`;
    }).join('')}</nav><div class="workspace-context-action">${renderWorkspaceContextAction()}</div></div>`;
    renderWorkspaceOutlineIcons(root);
    setWorkspaceRailOpen(rail.open);
    if (!sidebar.dataset.hoverRailBound) {
        sidebar.dataset.hoverRailBound = 'true';
        sidebar.addEventListener('pointerenter', e => { if (e.pointerType === 'touch' || window.innerWidth <= 900) return; rail.hovering = true; clearTimeout(rail.closeTimer); rail.openTimer = setTimeout(() => setWorkspaceRailOpen(true), 150); });
        sidebar.addEventListener('pointerleave', () => { rail.hovering = false; closeWorkspaceRailSoon(); });
        sidebar.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) setWorkspaceRailOpen(true); });
        sidebar.addEventListener('focusout', () => closeWorkspaceRailSoon());
        sidebar.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); document.getElementById('workspacePropertyPicker')?.classList.remove('open'); document.getElementById('workspacePropertySwitch')?.setAttribute('aria-expanded', 'false'); if (window.innerWidth <= 900) sidebar.classList.remove('visible'); else { root.querySelector(`[data-rail-group="${rail.group}"]`)?.focus(); clearTimeout(rail.openTimer); setWorkspaceRailOpen(false); } } });
        document.addEventListener('pointerdown', e => { if (!sidebar.contains(e.target)) { document.getElementById('workspacePropertyPicker')?.classList.remove('open'); document.getElementById('workspacePropertySwitch')?.setAttribute('aria-expanded', 'false'); if (!rail.pinned) setWorkspaceRailOpen(false); } });
        window.addEventListener('resize', () => setWorkspaceRailOpen(rail.open));
    }
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    else if (focusDestination) root.querySelector(`[data-sidebar-destination="${focusDestination}"]`)?.focus({ preventScroll: true });
    else if (focusGroup) root.querySelector(`[data-rail-group="${focusGroup}"]`)?.focus({ preventScroll: true });
}

function workspaceBadge(key){if(key==='units')return state.units?.length||0;if(key==='tenants')return(state.tenants||[]).filter(t=>t.status!=='inactive').length;if(key==='evictions')return(state.evictions||[]).filter(item=>item.active).length;if(key==='documents')return state.documents?.length||0;if(key==='applications')return state.applications?.length||0;if(key==='payments')return Number(state.paymentWorkspace?.summary?.unmatched||0)+Number(state.paymentWorkspace?.summary?.conflicts||0);if(key==='maintenance')return(state.maintenanceRequests||[]).filter(r=>!['completed','closed'].includes(String(r.status||'').toLowerCase())).length;if(key==='delinquency')return Number(state.propertyOverviewData?.delinquency?.tenantCount||0);return 0;}

function renderWorkspacePropertyOptions(query=''){const q=String(query).trim().toLowerCase();return(state.properties||[]).filter(p=>!q||String(p.name||'').toLowerCase().includes(q)||formatAddress(p.address).toLowerCase().includes(q)).map(p=>`<button type="button" class="workspace-property-option" onclick="selectWorkspaceProperty('${p._id}', this)"><span>${escapeHtml(p.name)}</span>${state.currentProperty?._id===p._id?'<i class="fas fa-check"></i>':''}</button>`).join('')||'<div class="empty-compact">No properties found.</div>';}

function filterWorkspaceProperties(query){const root=document.getElementById('workspacePropertyOptions');if(root){root.innerHTML=renderWorkspacePropertyOptions(query);renderWorkspaceOutlineIcons(root)}}

async function selectWorkspaceProperty(id,trigger){localStorage.setItem('pmLastProperty',id);await selectProperty(id,{loaderContext:trigger})}

function findWorkspaceItem(id){for(const group of workspaceNavigationGroups){const item=group.items.find(x=>x.id===id);if(item)return item}return null}

function activateWorkspaceDestination(id){
    closeManagerProfileContainer();
const item=findWorkspaceItem(id);if(!item)return;const group=workspaceNavigationGroups.find(g=>g.items.some(x=>x.id===id));if(group?.id==='management'&&!state.currentProperty){toggleWorkspacePropertyPicker(true);showNotification('Please select a property','info');return;}if(item.action!=='portfolioTasks'&&state.portfolioTasksModalMode)closePortfolioTasksModalMode();if(item.tab)navigateWorkspaceTab(item.tab);else if(item.panel)navigateWorkspacePanel(item.panel);else if(item.action==='home')window.location.href='home.html';else if(item.action==='portfolio')openPortfolioOverview();else if(item.action==='properties')toggleWorkspacePropertyPicker();else if(item.action==='portfolioTasks')openGlobalPortfolioTasksDrawer();else if(item.action==='reports'){if(state.currentProperty)window.location.href=`project-financials.html?projectId=${encodeURIComponent(state.currentProperty._id)}&source=sidebar`;else showNotification('Select a property to open financial reports','info');}else if(item.action==='quickbooks')openQuickBooksSettings();else if(item.action==='propertySettings')openPropertyProfileEditor();if(window.innerWidth<=900&&item.action!=='properties'){document.querySelector('.sidebar')?.classList.remove('visible');document.getElementById('sidebarOverlay')?.classList.remove('visible')}}

function navigateWorkspaceTab(tabId,options={}){
    closeManagerProfileContainer();
    state.portfolioMode=false;
    state.sidebarPanel='';
    document.querySelectorAll('#propertyDashboard .tabs .tab-btn[data-tab]').forEach(button => button.classList.toggle('active',button.getAttribute('data-tab')===tabId));
    state.currentTab=tabId;
    showTabContent(tabId);
    loadTabContent(tabId);
    localStorage.setItem(`pmLastSection:${state.currentProperty?._id||'none'}`,tabId);
    if(options.history!==false)updateWorkspaceUrl(tabId);
    renderWorkspaceSidebar();
}

function navigateWorkspacePanel(panelId,options={}){state.sidebarPanel=panelId;navigateWorkspaceTab('propertyOverview',{history:false});state.sidebarPanel=panelId;if(options.history!==false)updateWorkspaceUrl('propertyOverview',panelId);renderWorkspaceSidebar();setTimeout(()=>document.getElementById(panelId)?.closest('.property-panel')?.scrollIntoView({behavior:'smooth',block:'center'}),150)}

function updateWorkspaceUrl(section=state.currentTab,panel=''){const url=new URL(window.location.href);if(state.currentProperty?._id)url.searchParams.set('property',state.currentProperty._id);if(section)url.searchParams.set('section',section);if(panel)url.searchParams.set('panel',panel);else url.searchParams.delete('panel');history.pushState({property:state.currentProperty?._id,section,panel},'',url)}

function renderWorkspaceContextAction(){const map={units:['Add unit','fa-plus','addUnitBtn'],tenants:['Add tenant','fa-user-plus','addTenantBtn'],payments:['Record payment','fa-dollar-sign','addPaymentBtn'],maintenance:['New request','fa-wrench','addMaintenanceBtn'],documents:['Upload document','fa-file-arrow-up','uploadDocumentBtn']},item=map[state.currentTab];return item?`<button type="button" onclick="triggerWorkspaceContextAction('${item[2]}')"><i class="fas ${item[1]}"></i> <span>${item[0]}</span></button>`:`<button type="button" onclick="navigateWorkspaceTab('propertyOverview')"><i class="fas fa-gauge-high"></i> <span>Property overview</span></button>`}

function triggerWorkspaceContextAction(id){const button=document.getElementById(id);if(button)button.click();else showNotification('This action is unavailable until a property is selected','info')}

function renderPropertyList() {
    renderWorkspaceSidebar();
    return;
    const propertyList = document.getElementById('propertyList');
    const overviewTile = `
        <div class="property-item property-overview-item" onclick="openPortfolioOverview()">
            <h3><i class="fas fa-chart-pie" style="margin-right:6px;"></i> Portfolio Overview</h3>
            <div class="property-address">
                <i class="fas fa-layer-group"></i>
                <div class="address-text">All properties combined</div>
            </div>
        </div>`;

    if (!state.properties.length) {
        propertyList.innerHTML = overviewTile + `
            <div class="empty-state">
                <i class="fas fa-building"></i>
                <p>No multifamily properties found</p>
            </div>`;
        return;
    }

    const propertiesHtml = state.properties.map(property => {
        const isActive = state.currentProperty && state.currentProperty._id === property._id;
        const unitsForProperty = (state.allUnits || []).filter(u => {
            const pid = u.projectId || u.propertyId || u.project; // projectId populated in loadAllUnitsAndTenants
            return pid && String(pid) === String(property._id);
        });
        const totalUnits = unitsForProperty.length;
        const vacantUnits = unitsForProperty.filter(u => u.status === 'vacant').length;
        const occupancyRate = totalUnits ? calculateOccupancyRate(unitsForProperty) : '--';
        const vacantLabel = totalUnits ? `${vacantUnits} vacant` : '--';
        
        return `
            <div class="property-item ${isActive ? 'active' : ''}" 
                 onclick="selectProperty('${property._id}')">
                <h3>${property.name}</h3>
                <div class="property-address">
                    <i class="fas fa-map-marker-alt"></i>
                    <div class="address-text">${formatAddress(property.address)}</div>
                </div>
                <div class="property-badges">
                    <span class="property-type">
                        <i class="fas fa-building"></i> ${property.type || 'Multifamily'}
                    </span>
                  <span class="property-status ${property.status?.toLowerCase().replace(/\s+/g, '-') || ''}">
                 <i class="fas fa-circle"></i> ${property.status || 'Active'}
                 </span>
                </div>
                <div class="property-stats">
                    <span class="property-stat" title="Occupancy rate for this property">
                        <i class="fas fa-user-check" aria-hidden="true"></i>
                        <span>${occupancyRate}</span>
                    </span>
                    <span class="property-stat" title="Number of vacant units for this property">
                        <i class="fas fa-door-open" aria-hidden="true"></i>
                        <span>${vacantLabel}</span>
                    </span>
                </div>
            </div>
        `;
    }).join('');

    propertyList.innerHTML = overviewTile + propertiesHtml;
}

async function selectProperty(propertyId, options = {}) {
    closeManagerProfileContainer();

    const loaderContext = options.loaderContext || (typeof window !== 'undefined' ? window.event : null);
    const shouldShowLoader = !options.silentLoader && !!loaderContext;
    if (shouldShowLoader) showLoader(loaderContext);
    try {
        state.portfolioMode = false;
        const urlParams=new URLSearchParams(location.search);
        const requestedSection=urlParams.get('property')===String(propertyId)?urlParams.get('section'):'';
        const previousSection=state.currentTab&&document.getElementById(state.currentTab)?state.currentTab:'';
        const rememberedSection=localStorage.getItem(`pmLastSection:${propertyId}`)||'';
        const targetSection=requestedSection||previousSection||rememberedSection||'propertyOverview';
        state.currentProperty = state.properties.find(p => p._id === propertyId);
        if (!state.currentProperty) throw new Error('Property not found');
        state.propertyOverviewData = null;

        const shouldRefreshApplicationsTab = state.currentTab === 'applications';

        if (Array.isArray(state.applications) && state.applications.length) {
            renderFilteredApplications();
        }
        if (Array.isArray(state.invites) && state.invites.length) {
            renderFilteredInvites();
        }

        // Ensure property dashboard is visible when a property is selected
        const dashboard = document.getElementById('propertyDashboard');
        const portfolioSection = document.getElementById('portfolioOverviewSection');
        if (dashboard) dashboard.style.display = '';
        if (portfolioSection) portfolioSection.style.display = 'none';

        document.getElementById('propertyName').textContent = state.currentProperty.name;
        updatePropertySectionHeadings();
        
        // Load critical data first for faster perceived load
        await Promise.all([
            loadUnits(propertyId),
            loadTenants(propertyId)
        ]);

        // Preserve the user's working section while switching properties.
        const validSection=document.getElementById(targetSection)?.classList.contains('tab-pane')?targetSection:'propertyOverview';
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === validSection));
        showTabContent(validSection);
        state.currentTab = validSection;
        await loadTabContent(validSection);
        localStorage.setItem('pmLastProperty',propertyId);
        localStorage.setItem(`pmLastSection:${propertyId}`,validSection);
        if(options.history!==false)updateWorkspaceUrl(validSection);

        // Defer non-critical tab data to idle time
        runWhenIdle(() => loadDocuments(propertyId).catch(() => {}));
        runWhenIdle(() => loadAnnouncements(propertyId).catch(() => {}));
        runWhenIdle(() => loadPayments(propertyId).catch(() => {}));
        runWhenIdle(() => loadMaintenanceRequests(propertyId).catch(() => {}));
        runWhenIdle(() => loadMaintenanceSchedules(propertyId).catch(() => {}));
        if (shouldRefreshApplicationsTab) {
            runWhenIdle(() => loadApplications(true).catch(() => {}));
            runWhenIdle(() => loadInvites(true).catch(() => {}));
        }
        
        showNotification('Property loaded successfully', 'success');

            // Re-render the property list to update the active class
        renderPropertyList();

                const sidebar = document.querySelector('.sidebar');
        if (window.innerWidth <= 900 && sidebar.classList.contains('visible')) {
            sidebar.classList.remove('visible');
        }
        setMobileTasksDrawerOpen(false);
        syncMobilePortfolioUi();

    } catch (error) {
        console.error('Error selecting property:', error);
        showNotification('Error loading property details', 'error');
            } finally {
        if (shouldShowLoader) hideLoader();
    }
}

// Utility Functions
function formatAddress(address) {
    if (!address) return 'No address provided';
    
    const parts = [];
    if (address.line1) parts.push(address.line1);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip) parts.push(address.zip);
    
    return parts.join(', ') || 'No address provided';
}

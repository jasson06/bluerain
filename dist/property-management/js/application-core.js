// Property management: application core.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Small utility: schedule non-critical work after first paint/idle
function runWhenIdle(fn) {
    try {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => setTimeout(fn, 0), { timeout: 1200 });
        } else {
            setTimeout(fn, 0);
        }
    } catch (_) {
        setTimeout(fn, 0);
    }
}

// 60s
function shouldUseCache(key, propertyId) {
    const entry = state._cache[key];
    return entry && entry.propertyId === propertyId && (Date.now() - entry.ts) < CACHE_TTL_MS;
}

function touchCache(key, propertyId) {
    state._cache[key] = { propertyId, ts: Date.now() };
}

// Invalidate one or more cache buckets (used after any create/update/delete)
function invalidateCache(...keys) {
    keys.forEach(k => {
        if (state._cache[k]) {
            delete state._cache[k];
        }
    });
}

// Simple auth guard: ensure a manager identifier is present before using the dashboard
function ensureManagerAuthenticated() {
    try {
        if (window.localStorage) {
            const managerId = localStorage.getItem('managerId');
            const name = localStorage.getItem('managerName') || localStorage.getItem('userName');
            if (!managerId && !name) {
                window.location.href = 'project-manager-auth.html';
                return false;
            }
        }
    } catch (_) {
        // If we cannot read storage safely, fall back to forcing login
        try { window.location.href = 'project-manager-auth.html'; } catch {}
        return false;
    }
    return true;
}

async function preloadGlobalMaintenanceCount() {
    try {
        const cacheBust = Date.now();
        const [requestsRes, schedulesRes] = await Promise.all([
            fetch('/api/properties/maintenance?status=pending,in-progress&_=' + cacheBust),
            fetch('/api/properties/maintenance-schedules?status=pending,in-progress&_=' + cacheBust)
        ]);
        if (!requestsRes.ok || !schedulesRes.ok) return;
        const [items, schedules] = await Promise.all([requestsRes.json(), schedulesRes.json()]);
        const topMaint = document.getElementById('topMaintenanceCount');
        if (topMaint && Array.isArray(items) && Array.isArray(schedules)) {
            const count = (items.length || 0) + (schedules.length || 0);
            topMaint.textContent = count > 99 ? '99+' : count;
        }
    } catch (e) {
        console.error('Error preloading global maintenance count:', e);
    }
}

// Set "Welcome, <manager>" text in the portfolio header, if available
function setPortfolioWelcomeText() {
    const el = document.getElementById('portfolioWelcomeText');
    if (!el) return;
    let name = '';
    try {
        if (window.localStorage) {
            name = localStorage.getItem('managerName') || localStorage.getItem('userName') || '';
        }
    } catch (_) {
        // Ignore storage access errors and fall back to default
    }
    if (name && typeof name === 'string') {
        el.textContent = `Welcome, ${name}`;
    } else {
        el.textContent = 'Welcome, Manager';
    }
}

// Helper: mark active portfolio overview chip
function setActivePortfolioCard(type) {
    const map = {
        rent: 'portfolioCardRent',
        tenants: 'portfolioCardTenants',
        maintenance: 'portfolioCardMaintenance',
        applications: 'portfolioCardApplications',
        leases: 'portfolioCardLeases',
        vacancy: 'portfolioCardVacancy'
    };
    const activeId = map[type];
    if (!activeId) return;
    document.querySelectorAll('.portfolio-chip').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(activeId);
    if (target) target.classList.add('active');
}

// Open the cross-portfolio overview dashboard
async function openPortfolioOverview() {
    closeManagerProfileContainer();

    state.portfolioTasksModalMode = false;
    document.getElementById('portfolioOverviewSection')?.classList.remove('portfolio-tasks-only');
    document.getElementById('portfolioTasksSidebar')?.classList.remove('desktop-open', 'mobile-open');
    document.getElementById('mobilePanelOverlay')?.classList.remove('visible');

    state.portfolioMode = true;
    state.currentProperty = null;
    state.propertyOverviewData = null;
    localStorage.removeItem('pmLastProperty');
    const url = new URL(window.location.href);
    url.searchParams.delete('property');
    url.searchParams.delete('section');
    url.searchParams.delete('panel');
    history.pushState({ property: null, section: 'portfolio', panel: '' }, '', url);
    if (!state.portfolioOverviewLoaded && !state.portfolioOverviewLoadPromise) setPortfolioInitialLoadingState();
    state.sidebarPanel = '';
    if (!state.portfolioWorkspaceMode) state.portfolioWorkspaceMode = 'properties';
    const dashboard = document.getElementById('propertyDashboard');
    const section = document.getElementById('portfolioOverviewSection');
    if (!section) return;
    if (dashboard) dashboard.style.display = 'none';
    section.style.display = 'block';
    renderWorkspaceSidebar();
    syncMobilePortfolioUi();
    // Return navigation reuses the rendered overview and its in-memory datasets.
    // Share the first load when navigation happens before it finishes.
    if (!state.portfolioOverviewLoaded) {
        if (!state.portfolioOverviewLoadPromise) {
            state.portfolioOverviewLoadPromise = renderPortfolioOverview().finally(() => {
                state.portfolioOverviewLoadPromise = null;
            });
        }
        await state.portfolioOverviewLoadPromise;
    }

    // Reuse tasks (including an empty result) when returning to the overview.
    loadPortfolioTasks().catch(() => {});
    try {
        // Default details view when opening overview (Leases & Move-ins)
        renderPortfolioDetails('leases');
        // Mark the default portfolio card as active
        setActivePortfolioCard('leases');
    } catch (e) {
        console.warn('Error rendering initial portfolio details:', e);
    }
}

// Event Listeners Setup
function initializeEventListeners() {
    // Property management
    document.getElementById('addPropertyBtn')?.addEventListener('click', () => openModal('addPropertyModal'));
    document.getElementById('addPropertyForm')?.addEventListener('submit', handleAddProperty);
    document.getElementById('editPropertyProfileBtn')?.addEventListener('click', openPropertyProfileEditor);
    document.getElementById('propertyProfileForm')?.addEventListener('submit', savePropertyProfile);
    document.getElementById('quickBooksManageBtn')?.addEventListener('click', openQuickBooksSettings);
    document.getElementById('qbSaveMappingsBtn')?.addEventListener('click', saveQuickBooksMappings);
    document.getElementById('qbDisconnectBtn')?.addEventListener('click', disconnectQuickBooks);
    document.getElementById('overviewRefreshBtn')?.addEventListener('click', () => { state.propertyOverviewData=null; renderPropertyOverview(true); });
    document.getElementById('overviewRange')?.addEventListener('change', () => { state.propertyOverviewData=null; renderPropertyOverview(true); });
    document.getElementById('overviewStatusFilter')?.addEventListener('change', () => state.propertyOverviewData && renderPropertyOverviewPanels(state.propertyOverviewData));
    document.getElementById('overviewAttentionFilter')?.addEventListener('change', () => state.propertyOverviewData && renderOverviewAttention(state.propertyOverviewData.unitsRequiringAttention||[], document.getElementById('overviewStatusFilter')?.value||'all'));
    document.getElementById('overviewExportBtn')?.addEventListener('click', exportPropertyOverview);
    document.getElementById('overviewOpenExpensesBtn')?.addEventListener('click', () => openOverviewDetailPanel('expenses'));
    document.getElementById('overviewOpenEquipmentBtn')?.addEventListener('click', () => openOverviewDetailPanel('equipment'));
    document.getElementById('overviewQuickActionBtn')?.addEventListener('click', () => { const el=document.getElementById('overviewQuickActions'); if(el) el.hidden=!el.hidden; });
    document.getElementById('overviewQuickActions')?.addEventListener('click', event => { const button=event.target.closest('[data-action]'); if(button) runOverviewAction(button.dataset.action); });
    document.getElementById('overviewAddTaskBtn')?.addEventListener('click', openOverviewTaskModal);
    document.getElementById('overviewTaskForm')?.addEventListener('submit', saveOverviewTask);
    document.querySelectorAll('[data-overview-open]').forEach(button=>button.addEventListener('click',()=>openPropertyOverviewTab(button.dataset.overviewOpen)));
    
    // Unit management
    document.getElementById('addUnitBtn')?.addEventListener('click', () => {
    resetUnitForm();
    openModal('addUnitModal');
});
    document.getElementById('addUnitForm')?.addEventListener('submit', handleAddUnit);
    document.getElementById('addUnitEquipmentBtn')?.addEventListener('click', () => addUnitEquipment());
    
    // Tenant management
        document.getElementById('addTenantBtn')?.addEventListener('click', () => {
        openAddTenantModal();
    });
    document.getElementById('addTenantForm')?.addEventListener('submit', handleAddTenant);

        // Fallback property selector inside tenant modal: repopulate units when changed
        const tenantPropertySelect = document.getElementById('tenantProperty');
        if (tenantPropertySelect && tenantPropertySelect.dataset.bound !== 'true') {
            tenantPropertySelect.addEventListener('change', () => {
                populateUnitSelect();
            });
            tenantPropertySelect.dataset.bound = 'true';
        }
    
    // Maintenance management
    document.getElementById('addMaintenanceBtn')?.addEventListener('click', () => {
    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }
    const form = document.getElementById('addMaintenanceForm');
    if (form) {
        form.dataset.context = 'property';
    }
    populateMaintenancePropertySelect(state.currentProperty && state.currentProperty._id);
    populateMaintenanceUnitSelect();
    populateMaintenanceVendorSelect('maintenanceVendor');
    openModal('addMaintenanceModal');
});
    document.getElementById('addMaintenanceForm')?.addEventListener('submit', handleAddMaintenance);

    const maintenancePropertySelect = document.getElementById('maintenanceProperty');
    if (maintenancePropertySelect && maintenancePropertySelect.dataset.bound !== 'true') {
        maintenancePropertySelect.addEventListener('change', handleMaintenancePropertyChange);
        maintenancePropertySelect.dataset.bound = 'true';
    }
    
    // Document management
    document.getElementById('uploadDocumentBtn')?.addEventListener('click', () => {
    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }
    populateDocumentTenantSelect();
    openModal('uploadDocumentModal');
});
    document.getElementById('uploadDocumentForm')?.addEventListener('submit', handleDocumentUpload);
    document.getElementById('announcementForm')?.addEventListener('submit', handleAnnouncementSubmit);
    setupAnnouncementManagerControls();
    syncAnnouncementComposerUi(false);
    syncAnnouncementAudiencePreview();

    // Add event listeners for payments tab and modal
document.getElementById('addPaymentBtn')?.addEventListener('click', () => {
    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }
    const propId = state.currentProperty?._id;
    openPaymentModalForTenantAndProperty(null, propId, true);
});
document.getElementById('addPaymentForm')?.addEventListener('submit', handleAddPayment);

    // Portfolio overview toggle
    document.getElementById('portfolioOverviewBtn')?.addEventListener('click', openPortfolioOverview);

    // Portfolio card click handlers for details + active state
    document.getElementById('portfolioCardRent')?.addEventListener('click', () => {
        setActivePortfolioCard('rent');
        renderPortfolioDetails('rent');
    });
    document.getElementById('portfolioCardTenants')?.addEventListener('click', () => {
        setActivePortfolioCard('tenants');
        renderPortfolioDetails('tenants');
    });
    document.getElementById('portfolioCardMaintenance')?.addEventListener('click', () => {
        setActivePortfolioCard('maintenance');
        renderPortfolioDetails('maintenance');
    });
    document.getElementById('portfolioCardApplications')?.addEventListener('click', () => {
        setActivePortfolioCard('applications');
        renderPortfolioDetails('applications');
    });
    document.getElementById('portfolioCardLeases')?.addEventListener('click', () => {
        setActivePortfolioCard('leases');
        renderPortfolioDetails('leases');
    });
    document.getElementById('portfolioCardVacancy')?.addEventListener('click', () => {
        setActivePortfolioCard('vacancy');
        renderPortfolioDetails('vacancy');
    });

    // One task flow handles keyboard submission, inline editing and completion.
    initPortfolioTaskFlow();

    // Modal close handlers
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target.id);
        }
    };
}

// Small utility helpers
function debounce(fn, delay) {
    let timerId;
    return function(...args) {
        if (timerId) clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

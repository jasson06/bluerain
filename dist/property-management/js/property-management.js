// Shared state, startup listeners, and existing function wrappers.
// Load the feature scripts listed in property-management.html before this file.

       // Global state management
const state = {
    currentProperty: null,
    currentTab: 'units',
    properties: [],
    vendors: [],
    units: [],
    tenants: [],
    maintenanceRequests: [],
    maintenanceSchedules: [],
    documents: [],
    allUnits: [],
    allTenants: [],
    portfolioPayments: [],
    portfolioMaintenance: [],
    portfolioRecurringMaintenance: [],
    portfolioTenantsWithBalance: [],
    portfolioExpiringLeases: [],
    portfolioUpcomingMoveIns: [],
    portfolioVacantUnits: [],
    portfolioOccupiedUnits: [],
    portfolioTasks: [],
    portfolioTasksModalMode: false,
    portfolioTenantView: 'list',
    payments: [],
    quickBooksPayments: [],
    quickBooksPaymentsConnected: false,
    quickBooksPaymentsError: '',
    applications: [],
    invites: [],
    documentSearchQuery: '',
    announcementSearchQuery: '',
    announcementStatusFilter: 'active',
    highlightMaintenanceId: null,
    highlightMaintenanceScheduleId: null,
    highlightApplicationId: null,
    portfolioRentMonth: null,
    propertyMaintenanceFilters: {
        requests: { query: '', status: '', unit: '' },
        schedules: { query: '', status: '', unit: '' }
    },
    keepPortfolioTypeFilterOnNextRender: false,
    keepPortfolioMaintenanceFiltersOnNextRender: false,
    portfolioNotesContext: null
};

const API_URL = '/api';
let propertyMaintenancePhotoHydrationStarted = false;
let propertyMaintenancePhotoHydrationComplete = false;
let portfolioMaintenancePhotoHydrationStarted = false;
let portfolioMaintenancePhotoHydrationComplete = false;
const MAINTENANCE_WORKFLOW_STAGE_OPTIONS = [
    ['new', 'New'],
    ['scheduled', 'Scheduled'],
    ['waiting', 'Waiting'],
    ['in-progress', 'In Progress'],
    ['completed', 'Completed'],
    ['closed', 'Closed']
];

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMaintenanceVendorComboboxes, { once: true });
} else {
    initializeMaintenanceVendorComboboxes();
}

const globalMaintenanceOverviewState = {
    requests: [],
    schedules: [],
    activeTab: 'requests',
    filters: {
        requests: { property: '', status: '', date: '' },
        recurring: { property: '', status: 'in-progress', date: '' }
    }
};

// Light data cache to avoid re-fetching the same property data repeatedly
state._cache = state._cache || {};
const CACHE_TTL_MS = 60 * 1000; 

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    if (!ensureManagerAuthenticated()) return;
    initializeEventListeners();
    initializeTabs();
    initializeApplicationsSubtabs();
    initializeApplicationsSearch();
    initializeInvitesSearch();
    initializeDocumentsSearch();
    initializeGlobalSearch();
    initializePropertyMaintenanceFilterBar();
    initializeMaintenanceScheduleViewToggle();
    initializeRecurringCalendarUi();
    initializeMobilePortfolioNavigation();
    initializeSendApplicationModalUi();
    initializeThemeToggle();
    renderPortfolioNotesPanel();
    setPortfolioWelcomeText();

    // Ensure properties are loaded before opening the portfolio overview
    try {
        await loadProperties();
    } catch (_) {
        // Errors are already handled inside loadProperties
    }

    const initialPropertyFromUrl = new URLSearchParams(window.location.search).get('property');
    if (!initialPropertyFromUrl) {
        state.portfolioWorkspaceMode = 'properties';
        await openPortfolioOverview();
    }

    // Preload global data so toolbar icons are ready on first click
    runWhenIdle(() => {
        loadApplications().catch(() => {});
        loadInvites().catch(() => {});
        preloadGlobalMaintenanceCount().catch(() => {});
    });

    // Preload tasks, but do not auto-open the portfolio overview.
    runWhenIdle(() => {
        loadPortfolioTasks().catch(() => {});
    });

    // Click-away: deselect portfolio rent row and hide notes when clicking outside
    document.addEventListener('click', (evt) => {
        const details = document.getElementById('portfolioDetails');
        const notesSidebar = document.getElementById('portfolioNotesSidebar');
        const target = evt.target;
        if (!details) return;
        // If click is inside the rent details area or the notes sidebar, keep selection
        if (details.contains(target) || (notesSidebar && notesSidebar.contains(target))) {
            return;
        }
        clearPortfolioSelectionAndNotes();
    });
});

// Bind portfolio sidebar notes form submit
document.getElementById('portfolioNotesForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('portfolioNotesInput');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) return;
    await savePortfolioNote(text);
});

const propertyProfileFields = [
 ['subtype','Subtype'],['operationalStatus','Operating status'],['yearBuilt','Year built'],['yearRenovated','Last renovated'],['buildingCount','Buildings'],['floorCount','Floors'],['rentableSqft','Rentable sq. ft.'],['lotSize','Lot size'],['county','County'],['parcelNumber','Parcel / APN'],
 ['legalOwner','Legal owner'],['acquisitionDate','Acquisition date'],['purchasePrice','Purchase price','money'],['estimatedValue','Estimated value','money'],['propertyManager','Property manager'],['managerPhone','Manager phone'],['managerEmail','Manager email'],['officeHours','Office hours'],
 ['lender','Lender'],['loanNumber','Loan number'],['loanBalance','Loan balance','money'],['loanMaturity','Loan maturity'],['monthlyDebt','Monthly debt payment','money'],['annualPropertyTax','Annual property tax','money'],['annualOperatingBudget','Annual operating budget','money'],['insuranceCarrier','Insurance carrier'],['insurancePolicy','Insurance policy'],['insuranceExpires','Policy expires'],['insurancePremium','Annual premium','money'],
 ['contractServicesMonthly','Contract services (monthly)','money'],['payrollMonthly','Payroll (monthly)','money'],['managementFeeRate','Management fee','percent'],['vacancyLossRate','Vacancy loss','percent'],['administrativeMonthly','Administrative (monthly)','money'],
 ['electricalMonthly','Electrical (monthly)','money'],['waterMonthly','Water (monthly)','money'],['trashSewerMonthly','Trash/Sewer (monthly)','money'],['gasMonthly','Gas (monthly)','money'],['internetMonthly','Internet (monthly)','money'],
 ['rentalLicense','Rental license'],['licenseExpires','License expires'],['certificateOfOccupancy','Certificate of occupancy'],['fireInspectionDate','Last fire inspection'],['buildingSystems','Shared building systems'],['safetyNotes','Safety & shutoffs'],['amenitiesParking','Amenities, parking & access'],['notes','Internal notes']
];

window.addEventListener('message',event=>{if(event.origin!==window.location.origin||event.data?.type!=='quickbooks-connected')return;if(String(event.data.projectId)!==String(state.currentProperty?._id))return;state.quickBooksStatus=null;setQuickBooksProgress('setup','QuickBooks connected. Loading your mapping options…');openQuickBooksSettings();showNotification('QuickBooks connected. Finish your mappings to prepare payments.','success');});

const overviewMoney=value=>`$${Number(value||0).toLocaleString(undefined,{maximumFractionDigits:0})}`;
const overviewDate=value=>value?formatDateDisplay(value):'Not scheduled';

document.getElementById('leaseType').addEventListener('change', function() {
    document.getElementById('fmrSection').style.display = this.value === 'fmr' ? 'block' : 'none';
    document.getElementById('section8Section').style.display = this.value === 'section8' ? 'flex' : 'none';
});

const workspaceNavigationGroups=[
 {id:'portfolio',label:'Portfolio',items:[{id:'home',label:'Home',icon:'fa-house',action:'home'},{id:'portfolio',label:'Portfolio Overview',icon:'fa-chart-pie',action:'portfolio'},{id:'properties',label:'Properties',icon:'fa-city',action:'properties'},{id:'portfolioTasks',label:'Global Tasks',icon:'fa-list-check',action:'portfolioTasks'},{id:'reports',label:'Reports',icon:'fa-file-invoice-dollar',action:'reports'}]},
 {id:'management',label:'Property Management',items:[{id:'propertyOverview',label:'Property Overview',icon:'fa-gauge-high',tab:'propertyOverview'},{id:'propertyInfo',label:'Property Information',icon:'fa-building',tab:'propertyInfo'},{id:'units',label:'Units',icon:'fa-door-open',tab:'units',badge:'units'},{id:'tenants',label:'Tenants',icon:'fa-users',tab:'tenants',badge:'tenants'},{id:'evictions',label:'Evictions',icon:'fa-gavel',tab:'evictions',badge:'evictions'},{id:'payments',label:'Payments',icon:'fa-money-check-dollar',tab:'payments',badge:'payments'},{id:'maintenance',label:'Maintenance',icon:'fa-screwdriver-wrench',tab:'maintenance',badge:'maintenance'},{id:'applications',label:'Applications & Invites',icon:'fa-file-signature',tab:'applications',badge:'applications'},{id:'documents',label:'Documents',icon:'fa-folder-open',tab:'documents',badge:'documents'},{id:'announcements',label:'Announcements',icon:'fa-bullhorn',tab:'announcements'}]},
 {id:'settings',label:'Settings',items:[{id:'quickbooks',label:'QuickBooks',icon:'fa-link',action:'quickbooks'},{id:'propertySettings',label:'Property Settings',icon:'fa-sliders',action:'propertySettings'}]}
];

window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search),property=params.get('property'),section=params.get('section'),panel=params.get('panel');if(property&&property!==state.currentProperty?._id)selectProperty(property,{history:false}).then(()=>panel?navigateWorkspacePanel(panel,{history:false}):navigateWorkspaceTab(section||'propertyOverview',{history:false}));else if(panel)navigateWorkspacePanel(panel,{history:false});else if(section)navigateWorkspaceTab(section,{history:false});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&window.innerWidth<=900){document.querySelector('.sidebar')?.classList.remove('visible');document.getElementById('sidebarOverlay')?.classList.remove('visible')}});
document.addEventListener('pointerdown',event=>{if(window.innerWidth<=900)return;const panel=document.getElementById('portfolioTasksSidebar');if(!panel?.classList.contains('desktop-open'))return;if(event.target.closest('#portfolioTasksSidebar')||event.target.closest('#portfolioTasksToggle'))return;togglePortfolioTasksDrawer(false);});

// Auto-capitalize each word in the tenant name input
document.getElementById('tenantName')?.addEventListener('input', function() {
    this.value = this.value
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
});

// Show/hide car details and dynamic car fields
document.getElementById('hasCar').addEventListener('change', function() {
    const carDetails = document.getElementById('carDetails');
    carDetails.style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
        updateCarFields();
    }
});

// Update car fields when car count changes
document.getElementById('carCount').addEventListener('input', updateCarFields);

// Update event listeners for pets
document.getElementById('hasPets').addEventListener('change', function() {
    document.getElementById('petDetails').style.display = this.checked ? 'block' : 'none';
    if (this.checked) updatePetFields();
});
document.getElementById('petCount').addEventListener('input', updatePetFields);

// Add tenant tab switching logic
let currentTenantTab = 'active';

document.getElementById('activeTenantsTab').addEventListener('click', function() {
    currentTenantTab = 'active';
    renderTenants();
    this.classList.add('active');
    document.getElementById('inactiveTenantsTab').classList.remove('active');
});
document.getElementById('inactiveTenantsTab').addEventListener('click', function() {
    currentTenantTab = 'inactive';
    renderTenants();
    this.classList.add('active');
    document.getElementById('activeTenantsTab').classList.remove('active');
});

let maintenanceRequestListView = false;
let scheduleListView = false;
let portfolioMaintenanceListView = false;

// Immediate temp upload on file selection with deletion confirmation
document.getElementById('maintenancePhotos')?.addEventListener('change', async function() {
    const input = this;
    const preview = document.getElementById('maintenancePhotosPreview');
    const form = document.getElementById('addMaintenanceForm');
    if (!input.files || !input.files.length || !form) return;
    try {
        const propertySelect = document.getElementById('maintenanceProperty');
        let projectId = '';
        if (propertySelect && propertySelect.value) {
            projectId = propertySelect.value;
        } else if (state.currentProperty && state.currentProperty._id) {
            projectId = state.currentProperty._id;
        }
        if (!projectId) {
            showNotification('Please select a property before uploading photos', 'error');
            return;
        }
        const fd = new FormData();
        Array.from(input.files).forEach(f => fd.append('photos', f));
        const resp = await fetch(`${API_URL}/properties/${projectId}/maintenance/temp-photos`, { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('Failed to upload photos');
        const data = await resp.json();
        const current = form.dataset.tempPhotosPaths ? JSON.parse(form.dataset.tempPhotosPaths) : [];
        const all = Array.from(new Set(current.concat(data.photos || [])));
        form.dataset.tempPhotosPaths = JSON.stringify(all);
        // Render previews with removable X
        preview.innerHTML = all.map(url => {
            return `<div class="maint-thumb" data-url="${url}" style="position:relative;width:72px;height:72px;border-radius:6px;overflow:hidden;box-shadow:0 0 4px rgba(0,0,0,0.15);">
                <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
                <button type="button" class="thumb-remove" title="Remove" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;line-height:18px;text-align:center;cursor:pointer;">×</button>
            </div>`;
        }).join('');
        preview.querySelectorAll('.thumb-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const wrap = e.currentTarget.closest('.maint-thumb');
                const url = wrap?.getAttribute('data-url');
                if (!url) return;
                // Confirm deletion
                if (!confirm('Remove this photo from the request?')) return;
                // Remove from dataset and UI; also delete temp file on server (optional)
                const list = JSON.parse(form.dataset.tempPhotosPaths || '[]').filter(p => p !== url);
                form.dataset.tempPhotosPaths = JSON.stringify(list);
                wrap.remove();
                // Attempt to delete temp file
                try {
                    // No dedicated temp delete API; rely on server cleanup or ignore
                } catch {}
            });
        });
        // Clear input so same files can be re-selected again
        input.value = '';
    } catch (err) {
        console.error('Temp upload error:', err);
        showNotification(err.message || 'Error uploading photos', 'error');
    }
});

document.getElementById('maintenanceList')?.addEventListener('change', async (event) => {
    const recurringChangedField = event.target.closest('.recurring-maintenance-inline-vendor, .recurring-maintenance-inline-start-date, .recurring-maintenance-inline-status');
    if (recurringChangedField) {
        const target = recurringChangedField.closest('[data-maint-id][data-maint-source="recurring"]');
        const projectId = target?.dataset.projectId || state.currentProperty?._id;
        if (!target || !projectId || target.dataset.isSaving === 'true') {
            showNotification('Unable to update recurring maintenance', 'error');
            return;
        }
        const vendorSelect = target.querySelector('.recurring-maintenance-inline-vendor');
        const startDateInput = target.querySelector('.recurring-maintenance-inline-start-date');
        const statusSelect = target.querySelector('.recurring-maintenance-inline-status');
        const isVendorAssignmentSave = recurringChangedField.matches('.recurring-maintenance-inline-vendor');
        try {
            target.dataset.isSaving = 'true';
            [startDateInput, statusSelect].forEach(field => {
                if (field) field.disabled = true;
            });
            setMaintenanceVendorComboboxDisabled(vendorSelect, true);
            setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
            await updatePortfolioRecurringMaintenanceSchedule(target.dataset.maintId, projectId, {
                assignedVendor: vendorSelect?.value || null,
                startDate: startDateInput?.value ? dateInputToISOAtNoon(startDateInput.value) : '',
                status: statusSelect?.value || 'pending'
            }, {
                refreshPortfolio: true
            });
            showNotification('Recurring maintenance updated', 'success');
        } catch (error) {
            console.error('Error updating recurring maintenance from list view:', error);
            showNotification('Could not update recurring maintenance', 'error');
        } finally {
            delete target.dataset.isSaving;
            [startDateInput, statusSelect].forEach(field => {
                if (field) field.disabled = false;
            });
            setMaintenanceVendorComboboxLoading(vendorSelect, false);
            setMaintenanceVendorComboboxDisabled(vendorSelect, false);
        }
        return;
    }

    const changedField = event.target.closest('.maintenance-inline-workflow, .maintenance-inline-vendor, .maintenance-inline-scheduled');
    if (!changedField) return;
    const editor = changedField.closest('.maintenance-inline-editor');
    const row = changedField.closest('tr[data-maint-id][data-maint-source="request"]');
    const requestId = editor?.getAttribute('data-request-id') || row?.dataset.maintId;
    const projectId = state.currentProperty?._id;
    const target = editor || row;
    if (!requestId || !target || !projectId) {
        showNotification('Unable to update maintenance request', 'error');
        return;
    }
    if (target.dataset.isSaving === 'true') return;

    const workflowSelect = target.querySelector('.maintenance-inline-workflow');
    const vendorSelect = target.querySelector('.maintenance-inline-vendor');
    const scheduledInput = target.querySelector('.maintenance-inline-scheduled');
    const isVendorAssignmentSave = changedField.matches('.maintenance-inline-vendor');
    const payload = {
        workflowStage: workflowSelect?.value || 'new',
        assignedVendor: vendorSelect?.value || '',
        scheduledFor: scheduledInput?.value || ''
    };

    try {
        target.dataset.isSaving = 'true';
        [workflowSelect, scheduledInput].forEach(field => {
            if (field) field.disabled = true;
        });
        setMaintenanceVendorComboboxDisabled(vendorSelect, true);
        setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
        setPropertyMaintenanceItemSaving(requestId, true);
        await updateMaintenanceInlineFields(projectId, requestId, payload, {
            refreshProperty: true,
            refreshPortfolio: true,
            refreshOverview: false
        });
        showNotification('Maintenance request updated', 'success');
    } catch (error) {
        console.error('Error updating maintenance request from card view:', error);
        showNotification('Could not update maintenance request', 'error');
    } finally {
        delete target.dataset.isSaving;
        [workflowSelect, scheduledInput].forEach(field => {
            if (field) field.disabled = false;
        });
        setMaintenanceVendorComboboxLoading(vendorSelect, false);
        setMaintenanceVendorComboboxDisabled(vendorSelect, false);
        setPropertyMaintenanceItemSaving(requestId, false);
    }
});

document.getElementById('maintenanceList')?.addEventListener('click', (event) => {
    if (event.target.closest('button, select, input, a, textarea')) return;
    const row = event.target.closest('tr[data-maint-id][data-maint-source]');
    if (!row) return;
    event.preventDefault();

    if (row.dataset.maintSource === 'recurring') {
        const schedule = (state.maintenanceSchedules || []).find(item => String(item._id) === String(row.dataset.maintId));
        if (!schedule) {
            showNotification('Unable to open recurring maintenance row editor', 'error');
            return;
        }
        enterRecurringMaintenanceRowEditMode(row, schedule, {
            projectId: state.currentProperty?._id,
            refreshPortfolio: true
        });
        return;
    }

    const request = (state.maintenanceRequests || []).find(item => String(item._id) === String(row.dataset.maintId));
    if (!request) {
        showNotification('Unable to open maintenance row editor', 'error');
        return;
    }
    enterMaintenanceRequestRowEditMode(row, request, {
        projectId: state.currentProperty?._id,
        refreshPortfolio: true,
        setSaving: (requestId, isSaving) => {
            setPropertyMaintenanceItemSaving(requestId, isSaving);
        }
    });
});

// Photo viewer modal (full-screen, next/prev)
(function setupMaintenancePhotoViewer(){
    if (!document.getElementById('maintenancePhotoViewer')) {
        const viewerHtml = `
            <div id="maintenancePhotoViewer" class="modal" style="display:none;background:rgba(0,0,0,0.8);">
                <div class="modal-content" style="max-width:900px;background:#000;color:#fff;">
                    <div id="mpvBody" style="position:relative;display:flex;align-items:center;justify-content:center;min-height:480px;">
                        <button id="mpvPrev" class="btn-secondary" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:0.9;">⟨</button>
                        <img id="mpvImage" src="" alt="Photo" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:6px;">
                        <button id="mpvNext" class="btn-secondary" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);opacity:0.9;">⟩</button>
                        <button id="mpvClose" class="btn-secondary" style="position:absolute;right:10px;top:10px;">✕</button>
                    </div>
                    <div id="mpvCaption" style="padding:8px 12px;color:#ddd;font-size:0.9em;"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', viewerHtml);
    }
    const viewer = document.getElementById('maintenancePhotoViewer');
    const img = document.getElementById('mpvImage');
    const caption = document.getElementById('mpvCaption');
    const btnPrev = document.getElementById('mpvPrev');
    const btnNext = document.getElementById('mpvNext');
    const btnClose = document.getElementById('mpvClose');
    let currentList = [];
    let currentIndex = 0;
    let currentPhotoLabel = 'Photo';

    function render() {
        if (!currentList.length) return;
        img.src = currentList[currentIndex];
        caption.textContent = `${currentPhotoLabel} ${currentIndex+1} of ${currentList.length}`;
        btnPrev.disabled = currentIndex === 0;
        btnNext.disabled = currentIndex === currentList.length - 1;
    }

    window.openMaintenancePhotoViewer = (requestId, startIdx = 0, source = 'property', photoType = 'before') => {
        const sourceItems = source === 'portfolio' ? (state.portfolioMaintenance || []) : (state.maintenanceRequests || []);
        const req = sourceItems.find(r => String(r._id) === String(requestId));
        const photos = photoType === 'after'
            ? (Array.isArray(req?.afterPhotos) ? req.afterPhotos : [])
            : (Array.isArray(req?.photos) ? req.photos : []);
        if (!photos.length) return;
        currentList = photos;
        currentPhotoLabel = photoType === 'after' ? 'After Photo' : 'Photo';
        currentIndex = Math.max(0, Math.min(startIdx, photos.length-1));
        render();
        openModal('maintenancePhotoViewer');
    };

    btnPrev.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; render(); } });
    btnNext.addEventListener('click', () => { if (currentIndex < currentList.length - 1) { currentIndex++; render(); } });
    btnClose.addEventListener('click', () => closeModal('maintenancePhotoViewer'));
})();

const completeModalHtml = `
  <div class="modal" id="completeScheduleModal" style="display:none;">
    <div class="modal-content" style="max-width:400px;">
      <h2 style="font-size:1.3em;margin-bottom:18px;">Mark Schedule as Completed</h2>
      <form id="completeScheduleForm">
        <div class="form-group">
          <label for="completedByInput">Completed By</label>
          <input type="text" id="completedByInput" required>
        </div>
        <div class="form-group">
          <label for="completedNotesInput">Notes (optional)</label>
          <textarea id="completedNotesInput" rows="2"></textarea>
        </div>
        <div class="modal-buttons" style="margin-top:18px;">
          <button type="button" class="btn-secondary" id="cancelCompleteScheduleBtn">Cancel</button>
          <button type="submit" class="btn-primary">Mark as Completed</button>
        </div>
      </form>
    </div>
  </div>
`;
if (!document.getElementById('completeScheduleModal')) {
  document.body.insertAdjacentHTML('beforeend', completeModalHtml);
}

// Move-in Readiness Checklist Modal (static markup injected once)
const moveInChecklistHtml = `
   
    <div class="modal" id="moveInChecklistModal" style="display:none;">
        <div class="modal-content" style="max-width:720px;">
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h2 style="margin:0;font-size:1.6rem;">Move-in Readiness Checklist</h2>
                <button type="button" class="btn-secondary" onclick="closeModal('moveInChecklistModal')">Close</button>
            </div>
            <div class="modal-body" style="max-height:540px;overflow:auto;font-size:0.9rem;scrollbar-width: none;">
                <p id="moveInChecklistContext" style="margin-bottom:12px;color:#4b5563;"></p>

                <h3 style="margin-top:16px;font-size:1rem;color:#217dbb;">Leasing &amp; Admin</h3>
                <ul style="list-style:none;padding-left:0;margin-top:8px;margin-bottom:12px;">
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="leasing_lease_signed"> Lease fully signed by all parties</label>
                            <button type="button" class="movein-note-toggle" data-item-id="leasing_lease_signed" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="leasing_lease_signed" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="leasing_funds_received"> Move-in funds received and cleared</label>
                            <button type="button" class="movein-note-toggle" data-item-id="leasing_funds_received" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="leasing_funds_received" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="leasing_deposit_received"> Deposit received</label>
                            <button type="button" class="movein-note-toggle" data-item-id="leasing_deposit_received" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="leasing_deposit_received" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="leasing_tenant_entered"> Tenant info entered into system</label>
                            <button type="button" class="movein-note-toggle" data-item-id="leasing_tenant_entered" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="leasing_tenant_entered" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="leasing_emergency_contacts"> Emergency contacts collected</label>
                            <button type="button" class="movein-note-toggle" data-item-id="leasing_emergency_contacts" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="leasing_emergency_contacts" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="leasing_renters_insurance"> Renter's insurance verified (if required)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="leasing_renters_insurance" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="leasing_renters_insurance" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                </ul>

                <h3 style="margin-top:16px;font-size:1rem;color:#217dbb;">Utilities &amp; Services</h3>
                <ul style="list-style:none;padding-left:0;margin-top:8px;margin-bottom:12px;">
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="utilities_electricity"> Electricity on and Transferred to tenant</label>
                            <button type="button" class="movein-note-toggle" data-item-id="utilities_electricity" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="utilities_electricity" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="utilities_water"> Water on and Transferred to tenant</label>
                            <button type="button" class="movein-note-toggle" data-item-id="utilities_water" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="utilities_water" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="utilities_gas"> Gas on and Transferred to tenant (if applicable)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="utilities_gas" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="utilities_gas" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                </ul>

                <h3 style="margin-top:16px;font-size:1rem;color:#217dbb;">Maintenance &amp; Safety</h3>
                <ul style="list-style:none;padding-left:0;margin-top:8px;margin-bottom:12px;">
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_lights"> All lights working (fixtures + bulbs)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_lights" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_lights" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_outlets"> Outlets and switches tested</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_outlets" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_outlets" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_gfci"> GFCI outlets reset and working</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_gfci" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_gfci" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_smoke_detectors"> Smoke detectors tested</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_smoke_detectors" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_smoke_detectors" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_co_detectors"> CO detectors tested (if applicable)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_co_detectors" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_co_detectors" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_locks"> Door and window locks working</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_locks" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_locks" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_deadbolts"> Deadbolts installed and re-keyed</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_deadbolts" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_deadbolts" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_screens"> Screens installed (if provided)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_screens" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_screens" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_leaks"> No active leaks (sinks, toilets, water heater)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_leaks" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_leaks" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_toilet"> Toilet secure and flushing properly</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_toilet" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_toilet" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_hot_water"> Hot water working</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_hot_water" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_hot_water" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_hvac"> HVAC working (cool + heat tested)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_hvac" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_hvac" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="safety_filters"> Filters replaced</label>
                            <button type="button" class="movein-note-toggle" data-item-id="safety_filters" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="safety_filters" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                </ul>

                <h3 style="margin-top:16px;font-size:1rem;color:#217dbb;">Cleaning &amp; Turnover</h3>
                <ul style="list-style:none;padding-left:0;margin-top:8px;margin-bottom:12px;">
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_deep_clean"> Full unit deep clean complete</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_deep_clean" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_deep_clean" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_floors"> Floors cleaned (vacuum + mop)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_floors" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_floors" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_baseboards"> Baseboards wiped</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_baseboards" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_baseboards" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_windows"> Windows cleaned (inside)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_windows" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_windows" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_blinds"> Blinds cleaned or replaced</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_blinds" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_blinds" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_trash"> Trash removed from unit &amp; exterior</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_trash" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_trash" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                    <li>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <label style="flex:1 1 auto;"><input type="checkbox" class="movein-check-item" data-item-id="clean_odor"> Odor check (no smoke, pets, or mildew)</label>
                            <button type="button" class="movein-note-toggle" data-item-id="clean_odor" title="Add note" style="cursor:pointer;">+ note</button>
                        </div>
                        <input type="text" class="movein-check-note" data-item-id="clean_odor" placeholder="Add note (optional)" style="display:none;margin-top:4px;width:100%;font-size:0.8rem;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    </li>
                </ul>
            </div>
        </div>
    </div>
`;
if (!document.getElementById('moveInChecklistModal')) {
    document.body.insertAdjacentHTML('beforeend', moveInChecklistHtml);
}

// Persist move-in checklist changes
const moveInChecklistModalEl = document.getElementById('moveInChecklistModal');
if (moveInChecklistModalEl) {
    // Toggle note field visibility when clicking the note icon
    moveInChecklistModalEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.movein-note-toggle');
        if (!btn) return;
        const itemId = btn.getAttribute('data-item-id');
        if (!itemId) return;
        const input = moveInChecklistModalEl.querySelector(`.movein-check-note[data-item-id="${itemId}"]`);
        if (!input) return;
        const currentlyHidden = !input.style.display || input.style.display === 'none';
        input.style.display = currentlyHidden ? 'block' : 'none';
        if (!currentlyHidden) return;
        try {
            input.focus();
        } catch (_) {}
    });

    moveInChecklistModalEl.addEventListener('change', async (e) => {
        const target = e.target;
        // Determine which tenant this modal is currently bound to
        const entityType = 'tenant';
        const entityId = moveInChecklistModalEl.dataset.entityId || '';
        if (!(target instanceof HTMLInputElement) || !entityId) return;

        // Recompute completed ids and notes from current UI state
        const completedIds = Array.from(moveInChecklistModalEl.querySelectorAll('.movein-check-item'))
            .filter(cb => cb.checked && cb.getAttribute('data-item-id'))
            .map(cb => cb.getAttribute('data-item-id'));

        const notes = {};
        Array.from(moveInChecklistModalEl.querySelectorAll('.movein-check-note')).forEach(input => {
            const key = input.getAttribute('data-item-id');
            const val = input.value.trim();
            if (key && val) {
                notes[key] = val;
            }
        });

        const base = 'tenants';
        try {
            const res = await fetch(`${API_URL}/${base}/${encodeURIComponent(entityId)}/move-in-checklist`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completedIds, notes })
            });
            if (!res.ok) throw new Error('Failed to save checklist');
            const data = await res.json();
            const list = Array.isArray(data.completedIds) ? data.completedIds : completedIds;
            const returnedNotes = data.notes && typeof data.notes === 'object' ? data.notes : notes;
            if (entityType === 'tenant') {
                // Update local tenants state
                if (Array.isArray(state.allTenants)) {
                    const tIdx = state.allTenants.findIndex(t => String(t._id) === String(entityId));
                    if (tIdx !== -1) {
                        state.allTenants[tIdx].moveInChecklistCompleted = list;
                        state.allTenants[tIdx].moveInChecklistNotes = returnedNotes;
                    }
                }
            } else {
                // Fallback: update applications state
                if (Array.isArray(state.applications)) {
                    const aIdx = state.applications.findIndex(a => String(a._id) === String(entityId));
                    if (aIdx !== -1) {
                        state.applications[aIdx].moveInChecklistCompleted = list;
                        state.applications[aIdx].moveInChecklistNotes = returnedNotes;
                    }
                }
            }
        } catch (err) {
            console.error('Error saving move-in checklist:', err);
            showNotification('Error saving move-in checklist', 'error');
        }
    });
}

// Make globally accessible
window.markScheduleCompleted = markScheduleCompleted;

window.syncRecurringHistorySchedule = function(updated) {
    for (const listName of ['maintenanceSchedules', 'portfolioRecurringMaintenance']) {
        state[listName] = (state[listName] || []).map(schedule => String(schedule._id) === String(updated._id)
            ? { ...schedule, ...updated, projectId: schedule.projectId || updated.projectId,
                assignedVendor: schedule.assignedVendor, unitId: schedule.unitId } : schedule);
    }
    window.lastLoadedSchedules = state.maintenanceSchedules;
    invalidateCache('maintenance');
    if (state.currentProperty && String(state.currentProperty._id) === String(updated.projectId?._id || updated.projectId)) refreshPropertyMaintenanceView();
    rerenderPortfolioMaintenanceWorkspaceItem(updated._id, 'recurring');
    rerenderPortfolioMaintenanceItem(updated._id, 'recurring');
};

window.renderRecurringMaintenanceExpandedCard = function(schedule, source) {
    return source === 'property' ? renderPropertyRecurringMaintenanceCard(schedule) : renderPortfolioRecurringMaintenanceCard(schedule);
};

document.getElementById('addScheduleBtn').addEventListener('click', async () => {
  const form = document.getElementById('addScheduleForm');
  form.reset();
  form.dataset.editMode = 'false';
  form.dataset.scheduleId = '';
  form.querySelector('button[type="submit"]').textContent = 'Create Schedule';
  document.getElementById('customIntervalGroup').style.display = 'none';
  await populateScheduleVendorSelect();
  await populateScheduleUnitSelect(); // <-- Add this line
  openModal('addScheduleModal');
});

document.getElementById('scheduleFrequency').addEventListener('change', function() {
  document.getElementById('customIntervalGroup').style.display = this.value === 'custom' ? 'block' : 'none';
});

document.getElementById('addScheduleBtn').addEventListener('click', async () => {
  const form = document.getElementById('addScheduleForm');
  form.reset();
  form.dataset.editMode = 'false';
  form.dataset.scheduleId = '';
  form.querySelector('button[type="submit"]').textContent = 'Create Schedule';
  document.getElementById('customIntervalGroup').style.display = 'none';
  await populateScheduleVendorSelect();
  await populateScheduleUnitSelect();

  // Reset form submit handler to default create logic
  form.onsubmit = async function(e) {
    e.preventDefault();
    const title = document.getElementById('scheduleTitle').value;
    const description = document.getElementById('scheduleDescription').value;
    const frequency = document.getElementById('scheduleFrequency').value;
    const intervalDays = frequency === 'custom' ? Number(document.getElementById('scheduleIntervalDays').value) : null;
    const startDateRaw = document.getElementById('scheduleStartDate').value;
    const startDate = dateInputToISOAtNoon(startDateRaw);
    const assignedVendor = document.getElementById('scheduleVendor').value;
    const unitId = document.getElementById('scheduleUnit').value || null;
    const status = document.getElementById('scheduleStatus').value;
    const cost = Number(document.getElementById('scheduleCost').value) || 0;
    const vendorValue = assignedVendor && assignedVendor !== "" ? assignedVendor : null;

    showLoader();
    try {
    const payload = { title, description, frequency, intervalDays, startDate, assignedVendor: vendorValue, unitId, status, cost };
      const res = await fetch(`/api/properties/${state.currentProperty._id}/maintenance-schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create schedule');
      closeModal('addScheduleModal');
      showNotification('Schedule created!', 'success');
      await loadMaintenanceSchedules();
      form.dataset.editMode = 'false';
      form.dataset.scheduleId = '';
      form.querySelector('button[type="submit"]').textContent = 'Create Schedule';
      form.reset();
      document.getElementById('customIntervalGroup').style.display = 'none';
    } catch (err) {
      showNotification('Error creating schedule', 'error');
    } finally {
      hideLoader();
    }
  };

  openModal('addScheduleModal');
});

// --- Export functions for global access ---
window.editMaintenanceSchedule = editMaintenanceSchedule;
window.deleteMaintenanceSchedule = deleteMaintenanceSchedule;

// Tab switching logic for maintenance section
let currentMaintenanceTab = 'requests';

document.getElementById('recurringMaintenanceTab').addEventListener('click', function() {
  currentMaintenanceTab = 'schedules';
  this.classList.add('active');
  document.getElementById('maintenanceRequestsTab').classList.remove('active');
  document.getElementById('maintenanceList').style.display = 'none';
  document.getElementById('scheduleList').style.display = '';
  document.getElementById('recurringCalendarContainer').style.display = 'none'; // <-- Always hide calendar on tab switch
        updateMaintenanceCalendarTitle();
    renderPropertyMaintenanceFilterBar();
    applyPropertyMaintenanceFilters();
    updatePropertyMaintenanceViewToggle();
});

document.getElementById('maintenanceRequestsTab').addEventListener('click', function() {
  currentMaintenanceTab = 'requests';
  this.classList.add('active');
  document.getElementById('recurringMaintenanceTab').classList.remove('active');
  document.getElementById('maintenanceList').style.display = '';
  document.getElementById('scheduleList').style.display = 'none';
  document.getElementById('recurringCalendarContainer').style.display = 'none'; // Only hide when switching to requests
        updateMaintenanceCalendarTitle();
    renderPropertyMaintenanceFilterBar();
    applyPropertyMaintenanceFilters();
    updatePropertyMaintenanceViewToggle();
});

// Optionally, show requests tab by default on load
document.getElementById('maintenanceRequestsTab').click();

// New Maintenance Dropdown Menu

const newDropdownBtn = document.getElementById('newMaintenanceDropdownBtn');
const newDropdownMenu = document.getElementById('newMaintenanceDropdownMenu');

newDropdownBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  newDropdownMenu.style.display = newDropdownMenu.style.display === 'block' ? 'none' : 'block';
});

// Hide dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!newDropdownBtn.contains(e.target)) {
    newDropdownMenu.style.display = 'none';
  }
});

window.editAnnouncement = editAnnouncement;

// Hook up invites refresh button
document.getElementById('refreshInvitesBtn')?.addEventListener('click', async () => {
    showLoader();
    try {
        state.invites = [];
        await loadInvites(true);
        showNotification('Invites refreshed', 'success');
    } catch {} finally {
        hideLoader();
    }
});

// Hook up refresh button
document.getElementById('refreshApplicationsBtn')?.addEventListener('click', async () => {
    showLoader();
    try {
        state.applications = [];
        await loadApplications(true);
        showNotification('Applications refreshed', 'success');
    } catch {} finally {
        hideLoader();
    }
});

// Top toolbar icon clicks: jump to respective tabs
document.getElementById('topToolMaintenance')?.addEventListener('click', async () => {
    try {
        document.getElementById('globalOverviewTitle').textContent = 'Maintenance Overview';
        document.getElementById('globalOverviewBody').innerHTML = '<div class="empty-compact"><i class="fas fa-spinner fa-spin"></i> Loading maintenance…</div>';
        openModal('globalOverviewModal');
        await renderGlobalMaintenanceOverview(true);
    } catch (e) {
        console.error('Error opening maintenance portfolio overview:', e);
        showNotification('Could not open maintenance overview', 'error');
    }
});

document.getElementById('topToolApplications')?.addEventListener('click', async () => {
    try {
        document.getElementById('globalOverviewTitle').textContent = 'Applications & Invites';
        document.getElementById('globalOverviewBody').innerHTML = '<div class="empty-compact"><i class="fas fa-spinner fa-spin"></i> Loading applications…</div>';
        openModal('globalOverviewModal');
        await Promise.all([loadApplications(true), loadInvites(true)]);
        renderPortfolioDetails('applications', {body: document.getElementById('globalOverviewBody'), title: document.getElementById('globalOverviewTitle')});
    } catch (e) {
        console.error('Error opening applications portfolio overview:', e);
        showNotification('Could not open applications overview', 'error');
    }
});

// When clicking a maintenance item in the global overview, jump to that property's Maintenance tab
document.getElementById('globalOverviewBody')?.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-maintenance-overview-tab]');
    if (tabBtn) {
        setGlobalMaintenanceOverviewTab(tabBtn.getAttribute('data-maintenance-overview-tab'));
        return;
    }

    const clearFiltersBtn = e.target.closest('[data-maintenance-overview-clear-filters]');
    if (clearFiltersBtn) {
        resetGlobalMaintenanceOverviewFilters(globalMaintenanceOverviewState.activeTab);
        renderGlobalMaintenanceOverviewBody();
        return;
    }

    const descCell = e.target.closest('.maintenance-description-cell');
    if (descCell) {
        const inner = descCell.querySelector('.maintenance-description-inner');
        if (!inner) return;
        const expanded = descCell.classList.contains('expanded');
        if (!expanded) {
            descCell.classList.add('expanded');
        } else {
            descCell.classList.remove('expanded');
        }
        return;
    }

    const maintBtn = e.target.closest('.maintenance-jump-link');
    if (maintBtn) {
        const projectId = maintBtn.getAttribute('data-project-id');
        const requestId = maintBtn.getAttribute('data-request-id');
        if (!projectId) return;
        if (requestId) {
            state.highlightMaintenanceId = requestId;
        }
        try {
            showLoader();
            await selectProperty(projectId);
            const maintenanceTabBtn = document.querySelector('.tab-btn[data-tab="maintenance"]');
            maintenanceTabBtn?.click();
            closeModal('globalOverviewModal');
        } catch (err) {
            console.error('Error navigating to property maintenance from global overview:', err);
            showNotification('Could not open property maintenance view', 'error');
        } finally {
            hideLoader();
        }
        return;
    }

    const scheduleBtn = e.target.closest('.maintenance-schedule-jump-link');
    if (scheduleBtn) {
        const projectId = scheduleBtn.getAttribute('data-project-id');
        const scheduleId = scheduleBtn.getAttribute('data-schedule-id');
        if (!projectId) return;
        if (scheduleId) {
            state.highlightMaintenanceScheduleId = scheduleId;
        }
        try {
            showLoader();
            await selectProperty(projectId);
            const maintenanceTabBtn = document.querySelector('.tab-btn[data-tab="maintenance"]');
            maintenanceTabBtn?.click();
            document.getElementById('recurringMaintenanceTab')?.click();
            closeModal('globalOverviewModal');
        } catch (err) {
            console.error('Error navigating to recurring maintenance from global overview:', err);
            showNotification('Could not open recurring maintenance view', 'error');
        } finally {
            hideLoader();
        }
        return;
    }

    const appBtn = e.target.closest('.application-jump-link');
    if (appBtn) {
        const appId = appBtn.getAttribute('data-app-id');
        if (!appId) return;
        state.highlightApplicationId = appId;
        try {
            const applicationsTabBtn = document.querySelector('.tab-btn[data-tab="applications"]');
            applicationsTabBtn?.click();
            closeModal('globalOverviewModal');
        } catch (err) {
            console.error('Error navigating to applications tab from global overview:', err);
            showNotification('Could not open applications view', 'error');
        }
    }
});

// Handle inline workflow changes for maintenance rows in the Global Overview modal
document.getElementById('globalOverviewBody')?.addEventListener('change', async (e) => {
    const overviewFilter = e.target.closest('[data-maintenance-overview-filter]');
    if (overviewFilter) {
        const filterKey = overviewFilter.getAttribute('data-maintenance-overview-filter');
        if (filterKey) {
            globalMaintenanceOverviewState.filters[globalMaintenanceOverviewState.activeTab][filterKey] = overviewFilter.value || '';
            renderGlobalMaintenanceOverviewBody();
        }
        return;
    }

    const select = e.target.closest('.maintenance-workflow-select');
    if (!select) return;

    const newWorkflowStage = select.value;
    const projectId = select.getAttribute('data-project-id');
    const requestId = select.getAttribute('data-request-id');
    if (!projectId || !requestId) return;

    try {
        showLoader();
        await updateMaintenanceInlineFields(projectId, requestId, {
            workflowStage: newWorkflowStage
        }, {
            refreshProperty: state.currentProperty && String(state.currentProperty._id) === String(projectId),
            refreshPortfolio: true,
            refreshOverview: true
        });
        // Also refresh the top maintenance icon count so it reflects the new status distribution
        if (typeof preloadGlobalMaintenanceCount === 'function') {
            try { await preloadGlobalMaintenanceCount(); } catch {}
        }
        showNotification('Maintenance workflow updated', 'success');
    } catch (err) {
        console.error('Error updating maintenance workflow from overview:', err);
        showNotification('Could not update maintenance workflow', 'error');
    } finally {
        hideLoader();
    }
});

document.addEventListener('click', (event) => {
    document.querySelectorAll('.document-menu[open]').forEach(menu => {
        if (!menu.contains(event.target)) {
            menu.removeAttribute('open');
        }
    });
});

document.getElementById('notesDrawerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ctx = state.notesDrawerContext;
    const { inputEl } = getNotesDrawerElements();
    if (!ctx || !inputEl) return;
    const text = (inputEl.value || '').trim();
    if (!text) return;

    let url = '';
    if (ctx.type === 'application') {
        url = `/api/rental-applications/${ctx.id}/notes`;
    } else if (ctx.type === 'invite') {
        url = `/api/application-invites/${ctx.id}/notes`;
    } else if (ctx.type === 'tenant') {
        url = `/api/tenants/${ctx.id}/notes`;
    } else {
        return;
    }

    try {
        setNotesDrawerLoading(true);
        const managerId = localStorage.getItem('managerId') || '';
        const managerName = localStorage.getItem('managerName') || localStorage.getItem('userName') || '';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                managerId,
                authorName: managerName,
                createdBy: managerName || managerId
            })
        });
        if (!res.ok) throw new Error('Failed to add note');
        const data = await res.json();
        const notes = data.notes || [];

        if (ctx.type === 'application') {
            state.applications = (state.applications || []).map(a =>
                String(a._id) === String(ctx.id) ? { ...a, notesHistory: notes } : a
            );
        } else if (ctx.type === 'invite') {
            state.invites = (state.invites || []).map(x =>
                String(x._id) === String(ctx.id) ? { ...x, notesHistory: notes } : x
            );
        } else if (ctx.type === 'tenant') {
            state.allTenants = (state.allTenants || []).map(t =>
                String(t._id) === String(ctx.id) ? { ...t, notesHistory: notes } : t
            );
        }

        inputEl.value = '';
        renderNotesDrawerMessages(notes);
    } catch (err) {
        console.error('Add note error:', err);
        showNotification('Could not add note', 'error');
    } finally {
        setNotesDrawerLoading(false);
    }
});
// Handle Edit Invite modal submit
document.getElementById('editInviteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEl = document.getElementById('editInviteId');
    const nameEl = document.getElementById('editInviteName');
    const emailEl = document.getElementById('editInviteEmail');
    const propEl = document.getElementById('editInviteProperty');
    const unitEl = document.getElementById('editInviteUnit');
    const statusEl = document.getElementById('editInviteStatus');
    const urlEl = document.getElementById('editInviteUrl');

    const id = idEl?.value;
    if (!id) return;

    const payload = {
        name: nameEl?.value?.trim() || '',
        email: emailEl?.value?.trim() || '',
        propertyName: propEl?.value?.trim() || '',
        unitNumber: unitEl?.value?.trim() || '',
        status: statusEl?.value || 'sent',
        applicationUrl: urlEl?.value?.trim() || ''
    };

    try {
        showLoader();
        const res = await fetch(`/api/application-invites/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to update invite');
        const updated = await res.json();
        const invData = updated.invite || updated;
        state.invites = (state.invites || []).map(x => String(x._id) === String(id) ? invData : x);
        closeModal('editInviteModal');
        renderInvites();
        showNotification('Invite updated', 'success');
    } catch (err) {
        console.error('Edit invite submit error:', err);
        showNotification('Could not update invite', 'error');
    } finally {
        hideLoader();
    }
});

state.paymentWorkspaceTab=state.paymentWorkspaceTab||'transactions';state.paymentWorkspace=null;

let paymentLedgerOriginalParent=null;

// Floating credit apply menu
let creditMenuEl;

document.getElementById('editMonthChargesBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openEditMonthChargesModal();
});

document.getElementById('editChargesTenant')?.addEventListener('change', async () => {
    const tenantId = document.getElementById('editChargesTenant').value;
    const period = getMonthInputValueYYYYMM('editChargesMonth');
    if (!tenantId || !period) return;
    const ov = await fetchMonthOverride(tenantId, period);
    document.getElementById('editChargesExpected').value = ov?.expectedRent ?? '';
    document.getElementById('editChargesLateFee').value = ov?.lateFee ?? '';
    const modeSel = document.getElementById('editChargesLateFeeMode');
    if (modeSel) modeSel.value = (ov?.lateFeeMode === 'percent') ? 'percent' : 'amount';
});

document.getElementById('editChargesMonth')?.addEventListener('change', async () => {
    const tenantId = document.getElementById('editChargesTenant').value;
    const period = getMonthInputValueYYYYMM('editChargesMonth');
    if (!tenantId || !period) return;
    const ov = await fetchMonthOverride(tenantId, period);
    document.getElementById('editChargesExpected').value = ov?.expectedRent ?? '';
    document.getElementById('editChargesLateFee').value = ov?.lateFee ?? '';
    const modeSel = document.getElementById('editChargesLateFeeMode');
    if (modeSel) modeSel.value = (ov?.lateFeeMode === 'percent') ? 'percent' : 'amount';
});

document.getElementById('editMonthChargesForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenantId = document.getElementById('editChargesTenant').value;
    const period = getMonthInputValueYYYYMM('editChargesMonth');
    if (!tenantId || !period) { showNotification('Select tenant and month', 'error'); return; }
    const expectedRentRaw = document.getElementById('editChargesExpected').value;
    const lateFeeRaw = document.getElementById('editChargesLateFee').value;
    const payload = {
        expectedRent: expectedRentRaw === '' ? null : Number(expectedRentRaw),
        lateFee: lateFeeRaw === '' ? null : Number(lateFeeRaw),
        lateFeeMode: document.getElementById('editChargesLateFeeMode')?.value || 'amount'
    };
    showLoader();
    try {
        const resp = await fetch(`${API_URL}/tenants/${tenantId}/monthly-overrides/${period}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Failed to save override');
        showNotification('Monthly charges saved', 'success');
        // Instant UI reflection: update local state and re-render tenants now
        upsertLocalTenantMonthlyOverride(tenantId, period, payload);
        renderTenants();
    renderPayments();
        // Refresh payments to reflect
        invalidateCache('payments');
        await refreshContent('payments');
        closeModal('editMonthChargesModal');
    } catch (err) {
        console.error(err);
        showNotification('Error saving monthly charges', 'error');
    } finally {
        hideLoader();
    }
});

document.getElementById('clearMonthChargesBtn')?.addEventListener('click', async () => {
    const tenantId = document.getElementById('editChargesTenant').value;
    const period = getMonthInputValueYYYYMM('editChargesMonth');
    if (!tenantId || !period) { showNotification('Select tenant and month', 'error'); return; }
    showLoader();
    try {
        const resp = await fetch(`${API_URL}/tenants/${tenantId}/monthly-overrides/${period}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedRent: null, lateFee: null })
        });
        if (!resp.ok) throw new Error('Failed to remove override');
    document.getElementById('editChargesExpected').value = '';
    document.getElementById('editChargesLateFee').value = '';
    const modeSel2 = document.getElementById('editChargesLateFeeMode');
    if (modeSel2) modeSel2.value = 'amount';
        showNotification('Override removed', 'success');
        // Instant UI reflection: remove locally and re-render
        upsertLocalTenantMonthlyOverride(tenantId, period, null);
        renderTenants();
    renderPayments();
        invalidateCache('payments');
        await refreshContent('payments');
    } catch (err) {
        console.error(err);
        showNotification('Error removing override', 'error');
    } finally {
        hideLoader();
    }
});

// Auto-select assigned unit when tenant is selected in payment form
document.getElementById('paymentTenant')?.addEventListener('change', function() {
    const tenantId = this.value;
    const tenantsSource = (state.allTenants && state.allTenants.length ? state.allTenants : (state.tenants || []));
    const tenant = tenantsSource.find(t => String(t._id) === String(tenantId));
    if (!tenant) return;
    // Try to get the assigned unitId (could be object or string)
    const unitId = tenant.unitId?._id || tenant.unitId;
    if (unitId) {
        document.getElementById('paymentUnit').value = unitId;
    } else {
        document.getElementById('paymentUnit').value = '';
    }
});

// Auto-select assigned tenant when unit is selected in payment form
document.getElementById('paymentUnit')?.addEventListener('change', function() {
    const unitId = this.value;
    // Find the ACTIVE tenant assigned to this unit (skip terminated/expired/inactive)
    const isActive = (t) => !['terminated','expired','inactive'].includes(String(t.leaseStatus||'').toLowerCase());
    const tenantsSource = (state.allTenants && state.allTenants.length ? state.allTenants : (state.tenants || []));
    const tenant = tenantsSource.find(t => {
        const tUnitId = t.unitId?._id || t.unitId;
        return isActive(t) && String(tUnitId) === String(unitId);
    });
    const tenantSelect = document.getElementById('paymentTenant');
    if (tenant && tenantSelect) {
        tenantSelect.value = tenant._id;
    } else if (tenantSelect) {
        // Clear selection if previously set to an inactive tenant
        if (tenantSelect.value && !isActive(state.tenants.find(tt => tt._id === tenantSelect.value))) {
            tenantSelect.value = '';
        }
    }
});

document.getElementById('paymentProperty')?.addEventListener('change', function() {
    populatePaymentTenantSelect();
    populatePaymentUnitSelect();
    const tenantSel = document.getElementById('paymentTenant');
    const unitSel = document.getElementById('paymentUnit');
    if (tenantSel) tenantSel.value = '';
    if (unitSel) unitSel.value = '';
});

// Toggle fee fields when 'Applies To' changes
document.getElementById('paymentApplyTo')?.addEventListener('change', function() {
    const val = this.value;
    const feeRow = document.getElementById('paymentFeeRow');
    const amountInput = document.getElementById('paymentAmount');
    if (val === 'fee') {
        if (feeRow) feeRow.style.display = 'flex';
        if (amountInput) amountInput.placeholder = 'Enter fee amount';
    } else {
        if (feeRow) feeRow.style.display = 'none';
        if (val === 'deposit') {
            if (amountInput) amountInput.placeholder = 'Leave blank to auto-calc remaining deposit';
        } else {
            if (amountInput) amountInput.placeholder = '';
        }
    }
});

// Toggle custom type input when payment type is 'custom'
document.getElementById('paymentType')?.addEventListener('change', function() {
    const isCustom = this.value === 'custom';
    const grp = document.getElementById('customTypeGroup');
    if (grp) grp.style.display = isCustom ? 'block' : 'none';
});

document.getElementById('paymentAmount')?.addEventListener('input', updateCarryForwardVisibility);

// Hook into modal opening to inject button
const originalOpenModalRef = openModal;
openModal = function(modalId) {
    originalOpenModalRef(modalId);
    if (modalId === 'addPaymentModal') {
        // Defer to ensure elements exist
        setTimeout(ensureProrateButton, 50);
    }
};

const propertyManagementInlineLoaderState = {
    stack: [],
    entries: new Map(),
    nextId: 0,
    overlayDepth: 0,
    allowOverlayFallback: false
};

const PROPERTY_MANAGEMENT_INLINE_LOADER_TRIGGER_SELECTOR = [
    'button',
    'input[type="submit"]',
    'input[type="button"]',
    'select',
    '.workspace-property-option',
    '.workspace-nav-item',
    '.overview-row-action',
    '.panel-link',
    '.tab-btn',
    '.tenant-tab-btn',
    '.maintenance-tab-btn',
    '.applications-tab-btn',
    '.payment-workspace-tab',
    '.mobile-nav-btn',
    '.property-card',
    '.portfolio-executive-card',
    '.maintenance-card',
    '[role="button"]',
    '[onclick]'
].join(',');

const PROPERTY_MANAGEMENT_INLINE_LOADER_SCOPE_SELECTOR = [
    '[data-maint-id]',
    '[data-schedule-id]',
    '[data-app-id]',
    '[data-invite-id]',
    '[data-payment-id]',
    '[data-document-id]',
    '.br-panel',
    '.br-property',
    '.workspace-property-picker',
    '.property-card',
    '.portfolio-executive-card',
    '.maintenance-card',
    '.tenant-card',
    '.unit-card-modern',
    '.unit-card',
    '.application-card',
    '.invite-card',
    'tr',
    'form',
    '.modal-content',
    '.portfolio-comparison-panel',
    '.portfolio-visual-card'
].join(',');

if (typeof document !== 'undefined') {
    ['pointerdown', 'keydown', 'submit'].forEach(eventName => {
        document.addEventListener(eventName, enablePropertyManagementOverlayFallback, { once: true, capture: true });
    });
}

document.addEventListener('pointerdown',event=>{const drawer=document.getElementById('portfolioRecordDrawer');if(!drawer?.classList.contains('open'))return;if(event.target.closest('#portfolioRecordDrawer')||event.target.closest('.overview-row-action')||event.target.closest('[data-portfolio-tenant-card]')||event.target.closest('tr[data-tenant-id]')||event.target.closest('tr[data-portfolio-invite-id]')||event.target.closest('.portfolio-note-count')||event.target.closest('button[onclick*="openPortfolioRecordDrawer"]'))return;closePortfolioRecordDrawer();});

const renderUnifiedPortfolioWorkspaceBase=renderUnifiedPortfolioWorkspace;

renderUnifiedPortfolioWorkspace=function(resetFilter=true){
    const mode=state.portfolioWorkspaceMode||'properties',kpis=document.getElementById('portfolioExecutiveKpis');
    if(kpis)kpis.style.display=mode==='graphics'?'none':'';
    if(mode==='graphics'){renderPortfolioGraphicsDashboard();syncPortfolioComparisonAction(mode);return;}
    if(mode==='evictions')return renderPortfolioEvictionsWorkspace(resetFilter);
    const applicationPage=state.portfolioComparisonPage||1;
    renderUnifiedPortfolioWorkspaceBase(resetFilter);
    if(mode==='maintenance')renderPortfolioMaintenanceWorkspace();
    else document.querySelector('.portfolio-comparison-panel')?.classList.remove('portfolio-maintenance-list-mode');
    if(mode==='tenants')renderPortfolioTenantsWorkspace();
    if(mode==='applications'){
        if((state.portfolioApplicationType||'application')==='invite'){addPortfolioApplicationNoteCounts();setupPortfolioInviteActions();}
        else {state.portfolioComparisonPage=applicationPage;renderPortfolioApplicationsWorkspace();}
    }
    addPortfolioPageSizeToPagination();
    syncPortfolioComparisonAction(mode);
};

renderPortfolioGraphicsDashboard = function () {
    const root = document.getElementById('portfolioComparisonTable');
    if (!root) return;
    document.querySelectorAll('[data-portfolio-view]').forEach(b => b.classList.toggle('active', b.dataset.portfolioView === 'graphics'));
    document.getElementById('portfolioWorkspaceBack').hidden = true;
    document.getElementById('portfolioWorkspaceTitle').innerHTML = '<i class="fas fa-chart-line"></i> Portfolio graphics';
    document.getElementById('portfolioWorkspaceSummary').textContent = 'Explore performance, compare properties, and follow up on what needs attention.';
    document.getElementById('portfolioWorkspaceTypeToggle').hidden = true;
    ['portfolioRecordPayment','portfolioComparisonSearch','portfolioWorkspaceFilter','portfolioComparisonSort'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.getElementById('portfolioComparisonPagination').innerHTML = '';
    const all = state.portfolioComparisonMasterRows || [];
    const selected = all.some(r => String(r.property._id) === state.graphicsProperty) ? state.graphicsProperty : 'all';
    state.graphicsProperty = selected;
    const rows = all.filter(r => selected === 'all' || String(r.property._id) === selected);
    const valid = rows.filter(r => r.overviewAvailable !== false);
    const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
    const total = key => rows.reduce((sum,r) => sum + n(r[key]), 0);
    const moneyTotal = key => valid.reduce((sum,r) => sum + n(r[key]), 0);
    const esc = v => escapeHtml(String(v ?? ''));
    const pct = v => Math.max(0, Math.min(100, n(v)));
    const rate = (a,b) => b > 0 ? a / b * 100 : null;
    const percent = v => v === null ? '—' : `${v.toFixed(1)}%`;
    const units = total('units'), occupied = total('occupied'), vacant = total('vacant');
    const expected = moneyTotal('expected'), collected = moneyTotal('collected'), expenses = moneyTotal('expenses'), noi = moneyTotal('noi'), outstanding = moneyTotal('outstanding');
    const occupancy = rate(occupied, units), collection = rate(collected, expected);
    const metric = ['collection','occupancy','outstanding','noi','maintenance'].includes(state.graphicsMetric) ? state.graphicsMetric : 'collection';
    const definitions = {
        collection: {label:'Collection rate', value:r => r.overviewAvailable === false ? null : rate(n(r.collected),n(r.expected)), format:percent, money:false},
        occupancy: {label:'Occupancy', value:r => rate(n(r.occupied),n(r.units)), format:percent, money:false},
        outstanding: {label:'Outstanding rent', value:r => r.overviewAvailable === false ? null : n(r.outstanding), format:portfolioMoney, money:true},
        noi: {label:'Estimated NOI', value:r => r.overviewAvailable === false ? null : n(r.noi), format:portfolioMoney, money:true},
        maintenance: {label:'Open maintenance', value:r => n(r.maintenance), format:v => String(v), money:false}
    };
    const def = definitions[metric], descending = state.graphicsDirection !== 'asc';
    const ranked = rows.map(r => ({row:r,value:def.value(r)})).sort((a,b) => a.value === null || b.value === null ? a.value === b.value ? 0 : a.value === null ? 1 : -1 : (a.value-b.value)*(descending?-1:1));
    const max = Math.max(...ranked.map(r => Math.abs(r.value || 0)), 1);
    const financialMax = Math.max(expected, collected, expenses, Math.abs(noi), 1);
    const vacancyRate = rate(vacant, units), exposure = rate(outstanding, expected), expenseRatio = rate(expenses, collected), noiMargin = rate(noi, collected);
    const maintenanceLoad = rate(total('maintenance'), units), delinquencyRate = rate(total('delinquent'), total('tenants'));
    const health = units && expected > 0 && collected > 0 && valid.length === rows.length ? pct(100 - (n(vacancyRate)*.28 + n(exposure)*.3 + pct(n(expenseRatio)-45)*.18 + n(maintenanceLoad)*.12 + n(delinquencyRate)*.12)) : null;
    const ring = (label,value,color,mode) => `<button type="button" class="portfolio-risk-meter pg-chart-button" data-pg-open="${mode}" title="${esc(label)}: ${percent(value)}. Open related records."><div class="ring" style="--value:${pct(value)};--color:${color}"><strong>${percent(value)}</strong></div><span>${label}</span></button>`;
    const column = (label,value,color) => `<div class="portfolio-column" title="${label}: ${valid.length?portfolioMoney(value):'No data'}"><strong>${valid.length?portfolioMoney(value):'—'}</strong><span style="height:${valid.length?Math.abs(value)/financialMax*150:0}px;background:${value<0?'linear-gradient(180deg,#fb7185,#dc2626)':color}"></span><small>${label}</small></div>`;
    const allocation = Math.max(0,collected) + Math.max(0,outstanding);
    root.innerHTML = `<div class="pg-dashboard pg-chart-led">
      <div class="pg-toolbar"><div><label for="pg-period">Period<select id="pg-period" title="3 and 6 months include the current calendar month">${[['month','This month'],['3months','3 months'],['6months','6 months'],['year','This year']].map(([value,label])=>`<option value="${value}" ${document.getElementById('portfolioExecutivePeriod').value===value?'selected':''}>${label}</option>`).join('')}</select></label></div><label>Focus property<select id="pg-property"><option value="all">All loaded properties</option>${all.map(r=>`<option value="${esc(r.property._id)}" ${String(r.property._id)===selected?'selected':''}>${esc(r.property.name||'Property')}</option>`).join('')}</select></label></div>
      ${valid.length<rows.length?`<div class="pg-notice" role="status">Financial charts cover ${valid.length} of ${rows.length} properties. Missing overviews are excluded.</div>`:''}
      ${!rows.length?'<div class="pg-empty">No properties match the portfolio filters. Adjust the property or status filter above.</div>':`
      <div class="portfolio-graphics-dashboard">
        <section class="portfolio-visual-card chart-third"><h4>Portfolio health</h4><div class="portfolio-mixed-gauge" style="--value:${pct(health)}"><div class="portfolio-mixed-gauge-ring"></div><strong>${health===null?'—':health.toFixed(0)+'%'}</strong></div><p class="pg-caption pg-center">Composite operating score</p><details class="pg-method"><summary>How this is calculated</summary><p>100 minus weighted vacancy (28%), outstanding / expected rent (30%), expense ratio above 45% (18%), maintenance per unit (12%), and delinquent tenants (12%). Score is bounded to 0–100 and requires complete financial data with positive units, expected rent and collections. This is a dashboard indicator, not a financial rating.</p></details></section>
        <section class="portfolio-visual-card chart-third"><h4>Unit occupancy</h4><button type="button" class="portfolio-visual-chart pg-chart-button" data-pg-open="vacant" aria-label="Explore unit occupancy"><span class="portfolio-donut" style="--value:${pct(occupancy)}"><strong>${percent(occupancy)}</strong></span></button><div class="portfolio-graphic-legend"><span><i style="background:#0ea5e9"></i>${occupied} occupied</span><span><i style="background:#bae6fd"></i>${vacant} vacant</span>${units-occupied-vacant>0?`<span>${units-occupied-vacant} other</span>`:''}</div><p class="pg-caption pg-center">Current status · Click the ring to explore units</p></section>
        <section class="portfolio-visual-card chart-third"><h4>Collection allocation</h4><button type="button" class="pg-chart-button pg-allocation" data-pg-open="rent" aria-label="Explore collected and outstanding rent"><span class="portfolio-stacked"><span style="width:${allocation?Math.max(0,collected)/allocation*100:0}%;background:#10b981"></span><span style="width:${allocation?Math.max(0,outstanding)/allocation*100:0}%;background:#f59e0b"></span></span><span class="portfolio-graphic-legend"><span><i style="background:#10b981"></i>${valid.length?portfolioMoney(collected):'—'} collected</span><span><i style="background:#f59e0b"></i>${valid.length?portfolioMoney(outstanding):'—'} outstanding</span></span></button><p class="pg-caption pg-center">${percent(collection)} of expected rent collected</p><p class="pg-caption pg-center">Click the chart to explore rent records</p></section>
        <section class="portfolio-visual-card chart-half"><h4>Income and operating performance</h4><div class="portfolio-column-chart">${column('Rent roll',expected,'linear-gradient(180deg,#22d3ee,#0284c7)')}${column('Collected',collected,'linear-gradient(180deg,#34d399,#059669)')}${column('Expenses',expenses,'linear-gradient(180deg,#fb923c,#ea580c)')}${column('NOI',noi,'linear-gradient(180deg,#a78bfa,#7063cf)')}</div><p class="pg-caption">${esc(getPortfolioExecutiveRange().label)} · Bar heights show magnitude; negative NOI is red.</p></section>
        <section class="portfolio-visual-card chart-half"><div class="pg-heading"><h4>Property comparison</h4><div class="pg-controls"><label class="pg-sr" for="pg-metric">Comparison metric</label><select id="pg-metric">${Object.entries(definitions).map(([key,d])=>`<option value="${key}" ${key===metric?'selected':''}>${d.label}</option>`).join('')}</select><button type="button" id="pg-direction" aria-label="Reverse comparison order">${descending?'High → low':'Low → high'}</button></div></div><div class="pg-rank-list">${ranked.map(({row:r,value})=>`<button type="button" class="pg-rank" data-pg-property="${esc(r.property._id)}" title="Open ${esc(r.property.name||'Property')} overview"><span class="pg-rank-name">${esc(r.property.name||'Property')}</span><span class="pg-track"><span style="width:${value===null?0:Math.abs(value)/max*100}%;background:${value<0?'#e45468':'linear-gradient(90deg,#0ea5e9,#22d3ee)'}"></span></span><strong>${value===null?'No data':def.format(value)}</strong></button>`).join('')}</div><p class="pg-caption">Bars scale to the largest value. Click a property to explore.</p></section>
        <section class="portfolio-visual-card full"><h4>Operational risk profile</h4><div class="portfolio-risk-grid">${ring('Vacancy',vacancyRate,'#8b5cf6','vacant')}${ring('Outstanding exposure',exposure,'#f59e0b','rent')}${ring('Expense ratio',expenseRatio,'#f97316','properties')}${ring('NOI margin',noiMargin,noi>=0?'#06b6d4':'#ef4444','properties')}${ring('Maintenance load',maintenanceLoad,'#ec4899','maintenance')}${ring('Delinquency',delinquencyRate,'#ef4444','rent')}</div><p class="pg-caption">Click a ring for related records. Financial ratios use the selected period; occupancy and maintenance reflect current records. Ring fills are capped at 100%; labels show the actual ratio.</p></section>
      </div>`}
      <p class="pg-caption">Uses loaded portfolio data. Use the portfolio period controls and Refresh for updated financials.</p>
    </div>`;

    root.querySelector('#pg-period').addEventListener('change', e => {
        const period = document.getElementById('portfolioExecutivePeriod');
        period.value = e.target.value;
        period.dispatchEvent(new Event('change', {bubbles:true}));
    });
    root.querySelector('#pg-property').addEventListener('change', e => {state.graphicsProperty=e.target.value;renderPortfolioGraphicsDashboard();});
    root.querySelector('#pg-metric')?.addEventListener('change', e => {state.graphicsMetric=e.target.value;renderPortfolioGraphicsDashboard();});
    root.querySelector('#pg-direction')?.addEventListener('click', () => {state.graphicsDirection=descending?'asc':'desc';renderPortfolioGraphicsDashboard();root.querySelector('#pg-direction')?.focus();});
    root.querySelectorAll('[data-pg-property]').forEach(button=>button.addEventListener('click',()=>openPortfolioPropertySnapshot(button.dataset.pgProperty)));
    root.querySelectorAll('[data-pg-open]').forEach(button=>button.addEventListener('click',()=>{
        const scope=button.dataset.pgScope||selected;
        const propertyFilter=document.getElementById('portfolioExecutiveProperty');
        if(propertyFilter) propertyFilter.value=scope;
        state.portfolioComparisonRows=all.filter(r=>scope==='all'||String(r.property._id)===scope);
        restorePortfolioWorkspaceControls();
        setPortfolioWorkspaceMode(button.dataset.pgOpen);
    }));
};

const renderPortfolioTenantGridCardBase=renderPortfolioTenantGridCard;
renderPortfolioTenantGridCard=function(item){
    const tenant=item?.tenant||{};
    const name=item?.name||tenant.name||'Tenant';
    const initials=escapeHtml(name.split(' ').map(part=>part[0]||'').join('').slice(0,2).toUpperCase()||'T');
    const assignedUnit=tenant.unitId&&typeof tenant.unitId==='object'?tenant.unitId:null;
    const leaseStart=portfolioDate(tenant.leaseStart);
    const leaseEnd=portfolioDate(tenant.leaseEnd);
    const leaseStatus=tenant.leaseStatus||tenant.status||'active';
    const leaseStatusText=String(leaseStatus).charAt(0).toUpperCase()+String(leaseStatus).slice(1);
    const parkingAssignment=tenant.parking||assignedUnit?.parkingLabel||assignedUnit?.parking||'Unassigned';
    const petFees=tenant.pets?.hasPets?(Number(tenant.pets.monthlyRent)||0):0;
    const additionalFees=(Number(tenant.waterFee)||0)+(Number(tenant.trashFee)||0)+(Number(tenant.adminFee)||0)+(tenant.additionalFee?.amount||0)+petFees;
    const totalRent=(Number(tenant.baseRent)||0)+additionalFees;
    const recentNotes=(Array.isArray(tenant.notesHistory)?tenant.notesHistory:[])
        .slice()
        .sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0))
        .slice(-8);
    const notesMarkup=recentNotes.length
        ? recentNotes.map(note=>{
            const noteId=note._id||'';
            return `<div class="tenant-card-note" data-note-id="${noteId}"><div class="tenant-card-note-bubble" style="border:1px solid ${note.authorRole==='tenant'?'#bfdbfe':'#bbf7d0'};background:${note.authorRole==='tenant'?'#eff6ff':'#ecfdf5'};">${noteId?`<button type="button" class="tenant-card-note-delete" data-tenant-id="${tenant._id}" data-note-id="${noteId}" title="Delete note"><i class="fas fa-trash"></i></button>`:''}<div style="font-weight:700;font-size:0.8rem;color:#0f172a;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><span>${escapeHtml(note.authorName||note.createdByName||note.managerName||note.createdBy||'Management')}</span><span style="font-weight:500;color:#64748b;">${escapeHtml(note.createdAt?new Date(note.createdAt).toLocaleString('en-US'):'')}</span></div><div style="font-size:0.84rem;color:#475569;margin-top:3px;white-space:pre-line;">${escapeHtml(note.text||note.note||note.content||'')}</div></div></div>`;
        }).join('')
        : '<div style="font-size:0.84rem;color:#64748b;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#fff;">No notes yet. Start the conversation below.</div>';
    const emergency=tenant.emergencyContact
        ? `<div class="tenant-detail-row" style="overflow-x:auto;white-space:nowrap;gap:18px;"><span><i class="fas fa-user-shield"></i> ${escapeHtml(tenant.emergencyContact.name||'N/A')}</span><span><i class="fas fa-phone"></i> ${escapeHtml(tenant.emergencyContact.phone||'N/A')}</span></div>`
        : '<span class="tenant-detail-value">N/A</span>';
    let leaseCountdownHtml='';
    if(tenant.leaseEnd){
        const today=new Date(),leaseEndDate=new Date(tenant.leaseEnd),diffDays=Math.ceil((leaseEndDate-today)/(1000*60*60*24));
        if(diffDays<=60&&diffDays>0&&(tenant.leaseStatus==='active'||tenant.leaseStatus==='pending'))leaseCountdownHtml=`<div class="tenant-detail-row" style="margin-top:8px;"><span style="color:#f39c12;font-weight:600;"><i class="fas fa-hourglass-half"></i> Lease expires in <span style="font-size:1.08em;color:#d35400;">${diffDays} day${diffDays!==1?'s':''}</span></span></div>`;
    }
    let rentStatusBadge='';
    const expectedMonthly=Math.max(0,totalRent),remainingRent=Math.max(0,Number(item.balance?.remainingRent||0)),paidThisMonth=Math.max(0,expectedMonthly-remainingRent),dueDate=new Date(new Date().getFullYear(),new Date().getMonth(),1),daysUntilDue=Math.floor((dueDate-new Date())/(1000*60*60*24));
    if(remainingRent>0){
        if(daysUntilDue<0)rentStatusBadge=`<span class="rent-badge overdue"><i class="fas fa-exclamation-circle"></i> OVERDUE • $${remainingRent.toFixed(2)}</span>`;
        else if(daysUntilDue<=3)rentStatusBadge=`<span class="rent-badge due-soon"><i class="fas fa-clock"></i> DUE IN ${daysUntilDue}d • $${remainingRent.toFixed(2)}</span>`;
        else if(paidThisMonth>0&&remainingRent>0)rentStatusBadge=`<span class="rent-badge partial"><i class="fas fa-adjust"></i> PARTIAL • ${expectedMonthly?((paidThisMonth/expectedMonthly)*100).toFixed(0):0}%</span>`;
    }
    return `<div class="tenant-card" data-portfolio-tenant-card="${tenant._id}" style="min-width:0;"><div class="tenant-header"><div class="tenant-avatar-small">${initials}</div><div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;"><h3 style="margin:0;min-width:0;">${escapeHtml(name)}</h3><span class="lease-badge ${escapeHtml(String(leaseStatus).toLowerCase())}" style="flex:0 0 auto;"><i class="fas fa-circle"></i>${escapeHtml(leaseStatusText)}</span></div><div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">${renderPortfolioTenantNotesBadge(tenant)}<button type="button" onclick="openPortfolioRecordDrawer('tenant','${tenant._id}')" class="btn-secondary"><i class="fas fa-eye"></i> Details</button><button type="button" onclick="editTenant('${tenant._id}')" class="btn-secondary"><i class="fas fa-pen"></i> Edit</button></div></div><div class="tenant-card-scroll" style="overflow:hidden;"><div class="tenant-card-layout portfolio-tenant-card-columns"><div class="tenant-card-main portfolio-tenant-card-details"><div class="tenant-info"><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-building"></i> Property</div><div class="tenant-detail-row"><span>${escapeHtml(item.propertyName||'—')}</span></div><div class="tenant-detail-row">${assignedUnit?`Unit ${escapeHtml(assignedUnit.number||'—')} (${escapeHtml(String(assignedUnit.bedrooms??'N/A'))} bed, ${escapeHtml(String(assignedUnit.bathrooms??'N/A'))} bath)`:`Unit ${escapeHtml(item.unitLabel||'—')}`}</div><div class="tenant-detail-row"><span>Parking:</span><span>${escapeHtml(parkingAssignment)}</span></div><div class="tenant-detail-row"><span>Access Code:</span><span>${escapeHtml(tenant.accessCode||'Not set')}</span></div></div><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-address-card"></i> Contact</div><div class="tenant-detail-row"><span><i class="fas fa-phone"></i> ${escapeHtml(item.phone||'—')}</span></div><div class="tenant-detail-row"><span><i class="fas fa-envelope"></i> ${escapeHtml(item.email||'—')}</span></div></div><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-calendar-alt"></i> Lease</div><div class="tenant-detail-row"><span>Lease:</span><span>${escapeHtml(leaseStart)} - ${escapeHtml(leaseEnd)}</span></div>${leaseCountdownHtml}${rentStatusBadge?`<div class="tenant-detail-row">${rentStatusBadge}</div>`:''}<div class="tenant-detail-row"><span>Deposit:</span><span>$${(Number(tenant.deposit)||0).toFixed(2)}</span></div><div class="tenant-detail-row"><span>Base Rent:</span><span>$${(Number(tenant.baseRent)||0).toFixed(2)}</span></div><div class="tenant-detail-row"><span>Total Fees:</span><span style="font-weight:600;color:#2980b9;">$${additionalFees.toFixed(2)}</span></div><div class="tenant-detail-row"><span>Total Rent:</span><span style="font-weight:700;color:#217dbb;font-size:1.08em;letter-spacing:0.5px;background:#eaf6ff;padding:3px 12px;border-radius:12px;">$${totalRent.toFixed(2)}</span></div><div class="tenant-detail-row"><span>Balance:</span><span>${portfolioMoney(item.balance?.remainingRent||0)}</span></div></div><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-user-shield"></i> Emergency</div>${emergency}</div></div></div><div class="maintenance-thread compact-maintenance-thread tenant-card-thread portfolio-tenant-card-notes"><div class="tenant-card-thread-header"><span><i class="fas fa-comments" style="color:#2563eb;margin-right:6px;"></i>Tenant Notes</span><span style="font-size:0.8rem;color:#64748b;">${item.notesCount}</span></div><div class="maintenance-thread-messages" style="display:grid;gap:6px;margin-bottom:6px;padding-right:4px;align-content:start;scrollbar-width:none;min-height:0;">${notesMarkup}</div><form onsubmit="sendTenantCardNote(event, '${tenant._id}')" class="tenant-card-thread-form"><input name="message" type="text" maxlength="1200" placeholder="Add tenant note or reply" style="border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;background:#fff;"><button type="submit" class="btn-secondary"><i class="fas fa-paper-plane"></i> Send</button></form></div></div></div></div>`;
};

const openPortfolioRecordDrawerBase=openPortfolioRecordDrawer;
openPortfolioRecordDrawer=function(kind,id){
    const drawer=document.getElementById('portfolioRecordDrawer');if(drawer)drawer.classList.toggle('tenant-drawer',kind==='tenant');
    if(kind!=='tenant'&&kind!=='invite'&&kind!=='application')return openPortfolioRecordDrawerBase(kind,id);
    const item=kind==='tenant'?(state.allTenants||[]).find(x=>String(x._id)===String(id)):(kind==='invite'?state.invites:state.applications||[]).find(x=>String(x._id)===String(id));if(!item)return;
    openPortfolioRecordDrawerBase(kind,id);
    setTimeout(()=>{const body=document.getElementById('portfolioRecordDrawerBody');if(!body)return;
        if(kind==='tenant'){
            const richTenantHtml=renderPortfolioTenantDrawerContent(id);if(richTenantHtml)body.innerHTML=richTenantHtml;
            return;
        }
        const url=item.applicationUrl||item.inviteUrl||'';
        const notes=Array.isArray(item.notesHistory)?item.notesHistory:[],notesHtml=notes.length?notes.map(note=>`<div class="portfolio-notes-bubble" style="margin-bottom:7px"><div>${escapeHtml(note.text||note.note||note.content||'')}</div><span class="portfolio-notes-timestamp">${note.createdAt?new Date(note.createdAt).toLocaleString():''}</span></div>`).join(''):'<div class="empty-compact">No notes recorded.</div>';
        body.insertAdjacentHTML('beforeend',`<section class="portfolio-drawer-section"><h4><i class="fas fa-note-sticky"></i> Notes (${notes.length})</h4>${notesHtml}</section>`);body.insertAdjacentHTML('beforeend',kind==='invite'?`<section class="portfolio-drawer-section"><h4><i class="fas fa-link"></i> Invite actions</h4><div style="display:flex;gap:8px;flex-wrap:wrap">${url?`<a class="btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> Open invite</a><button class="btn-secondary" onclick="copyPortfolioInviteUrl(decodeURIComponent('${encodeURIComponent(url)}'))"><i class="fas fa-copy"></i> Copy URL</button>`:'<span class="task-meta">No invite URL is available.</span>'}</div></section>`:`<section class="portfolio-drawer-section"><h4><i class="fas fa-file-circle-check"></i> Application action</h4><a class="btn-primary" href="/applications/review/${encodeURIComponent(id)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> Open application</a></section>`);
    },180);
};

const openPortfolioRecordDrawerRichBase=openPortfolioRecordDrawer;
openPortfolioRecordDrawer=function(kind,id){
    const drawer=document.getElementById('portfolioRecordDrawer');
    const normalizedKind=String(kind||'');
    const normalizedId=String(id||'');
    if(drawer?.classList.contains('open')&&drawer.dataset.recordKind===normalizedKind&&drawer.dataset.recordId===normalizedId){
        closePortfolioRecordDrawer();
        return;
    }
    if(drawer){
        drawer.dataset.recordKind=normalizedKind;
        drawer.dataset.recordId=normalizedId;
        drawer.classList.toggle('tenant-drawer',kind==='tenant');
    }
    if(kind!=='tenant'&&kind!=='invite'&&kind!=='application'){
        openPortfolioRecordDrawerBase(kind,id);
        return;
    }
    const item=kind==='tenant'
        ? (state.allTenants||[]).find(x=>String(x._id)===normalizedId)
        : (kind==='invite'?state.invites:state.applications||[]).find(x=>String(x._id)===normalizedId);
    if(!item)return;
    openPortfolioRecordDrawerBase(kind,id);
    setTimeout(()=>{
        const body=document.getElementById('portfolioRecordDrawerBody');
        const currentDrawer=document.getElementById('portfolioRecordDrawer');
        if(!body||!currentDrawer?.classList.contains('open')||currentDrawer.dataset.recordKind!==normalizedKind||currentDrawer.dataset.recordId!==normalizedId)return;
        if(kind==='tenant'){
            const richTenantHtml=renderPortfolioTenantDrawerContent(id);
            if(richTenantHtml)body.innerHTML=richTenantHtml;
            return;
        }
        const url=item.applicationUrl||item.inviteUrl||'';
        const notes=Array.isArray(item.notesHistory)?item.notesHistory:[];
        const notesHtml=notes.length
            ? notes.map(note=>`<div class="portfolio-notes-bubble" style="margin-bottom:7px"><div>${escapeHtml(note.text||note.note||note.content||'')}</div><span class="portfolio-notes-timestamp">${note.createdAt?new Date(note.createdAt).toLocaleString():''}</span></div>`).join('')
            : '<div class="empty-compact">No notes recorded.</div>';
        body.insertAdjacentHTML('beforeend',`<section class="portfolio-drawer-section"><h4><i class="fas fa-note-sticky"></i> Notes (${notes.length})</h4>${notesHtml}</section>`);
        body.insertAdjacentHTML('beforeend',kind==='invite'?`<section class="portfolio-drawer-section"><h4><i class="fas fa-link"></i> Invite actions</h4><div style="display:flex;gap:8px;flex-wrap:wrap">${url?`<a class="btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> Open invite</a><button class="btn-secondary" onclick="copyPortfolioInviteUrl(decodeURIComponent('${encodeURIComponent(url)}'))"><i class="fas fa-copy"></i> Copy URL</button>`:'<span class="task-meta">No invite URL is available.</span>'}</div></section>`:`<section class="portfolio-drawer-section"><h4><i class="fas fa-file-circle-check"></i> Application action</h4><a class="btn-primary" href="/applications/review/${encodeURIComponent(id)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> Open application</a></section>`);
    },180);
};

const viewTenantDetailsBase=viewTenantDetails;
viewTenantDetails=async function(tenantId){
    const content = renderPortfolioTenantDrawerContent(tenantId);
    if (!content) return viewTenantDetailsBase(tenantId);
    let modal = document.getElementById('tenantDetailsModal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'tenantDetailsModal'; modal.className = 'modal'; document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-content tenant-details-modal tenant-drawer"><div class="portfolio-record-drawer-header"><h3>Tenant details</h3><button type="button" aria-label="Close tenant details" onclick="closeModal('tenantDetailsModal')"><i class="fas fa-times"></i></button></div><div class="portfolio-record-drawer-body">${content.replaceAll('closePortfolioRecordDrawer();', "closeModal('tenantDetailsModal');")}</div></div>`;
    openModal('tenantDetailsModal');
};

const editTenantBase=editTenant;
editTenant=async function(tenantId){const tenant=getWorkspaceTenantRecord(tenantId);if(tenant&&(!(state.tenants||[]).some(item=>String(item._id)===String(tenantId))||String(portfolioPropertyId(tenant))!==String(state.currentProperty?._id||'')))await ensureWorkspaceTenantEditContext(tenantId);return editTenantBase(tenantId);};

document.getElementById('portfolioOverviewSection')?.addEventListener('click',event=>{const btn=event.target.closest('[data-maint-view]');if(!btn)return;event.stopImmediatePropagation();state.portfolioMaintenanceView=btn.dataset.maintView;state.portfolioComparisonPage=1;renderUnifiedPortfolioWorkspace(false);},true);
document.getElementById('portfolioOverviewSection')?.addEventListener('click',event=>{const btn=event.target.closest('[data-tenant-view]');if(!btn)return;event.stopImmediatePropagation();state.portfolioTenantView=btn.dataset.tenantView==='grid'?'grid':'list';state.portfolioComparisonPage=1;renderUnifiedPortfolioWorkspace(false);},true);
document.getElementById('portfolioComparisonPagination')?.addEventListener('change',event=>{if(event.target.id!=='portfolioPageSize')return;state.portfolioRowsPerPage=Number(event.target.value)||15;state.portfolioComparisonPage=1;renderUnifiedPortfolioWorkspace(false);});

document.getElementById('portfolioTasksSidebar')?.addEventListener('click',event=>{const btn=event.target.closest('[data-portfolio-task-view]');if(!btn)return;state.portfolioTaskView=btn.dataset.portfolioTaskView;renderPortfolioTasksList();});

// Show/hide additional fee fields based on selection
document.getElementById('additionalFeeType').addEventListener('change', function() {
    const type = this.value;
    document.getElementById('additionalFeeLabelGroup').style.display = type === 'other' ? 'block' : 'none';
    document.getElementById('additionalFeeAmountGroup').style.display = type ? 'block' : 'none';
    if (type !== 'other') {
        document.getElementById('additionalFeeLabel').value = '';
    }
});

// Export functions for global access
window.selectProperty = selectProperty;
window.openPortfolioOverview = openPortfolioOverview;
window.openModal = openModal;
window.closeModal = closeModal;
window.editUnit = editUnit;
window.viewUnitDetails = viewUnitDetails;
window.editTenant = editTenant;
window.viewTenantDetails = viewTenantDetails;
window.updateMaintenanceStatus = updateMaintenanceStatus;
window.viewDocument = viewDocument;
window.downloadDocument = downloadDocument;
window.deleteDocument = deleteDocument;
window.deleteTenant = deleteTenant;
window.editPayment = editPayment;
window.deletePayment = deletePayment;
// Expose tenant balance modal function after definition (added later in script)
window.openTenantBalanceModal = openTenantBalanceModal;
// Export functions for reports
window.exportTenantPaymentsReportFromModal = exportTenantPaymentsReportFromModal;


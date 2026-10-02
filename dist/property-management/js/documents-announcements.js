// Property management: documents announcements.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Document Management
async function handleDocumentUpload(event) {
    event.preventDefault();
    
    if (!state.currentProperty) {
        showNotification('Please select a property first', 'error');
        return;
    }

    const formData = new FormData();
    const fileInput = document.getElementById('documentFile');
    const nameInput = document.getElementById('documentName');
    const typeInput = document.getElementById('documentType');
    const tenantInput = document.getElementById('documentTenant');
    
    if (!fileInput.files[0]) {
        showNotification('Please select a file to upload', 'error');
        return;
    }
    showLoader();
    try {
        // Add file and metadata to FormData
        formData.append('file', fileInput.files[0]);
        formData.append('name', nameInput.value);
        formData.append('type', typeInput.value); // <-- Save the selected document type
        formData.append('propertyId', state.currentProperty._id);
        formData.append('tenantId', tenantInput?.value || '');

        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/documents`, {
            method: 'POST',
            body: formData // Don't set Content-Type header, let browser set it with boundary
        });

    if (!response.ok) throw new Error('Failed to upload document');
        
    invalidateCache('documents');
    await refreshContent('documents');
        closeModal('uploadDocumentModal');
        showNotification('Document uploaded successfully', 'success');
        event.target.reset();
    } catch (error) {
        console.error('Error uploading document:', error);
        showNotification('Error uploading document', 'error');
            } finally {
        hideLoader();
    }
}

function initializeDocumentsSearch() {
    const searchInput = document.getElementById('documentsSearchBar');
    if (!searchInput || searchInput.dataset.bound === 'true') return;

    searchInput.addEventListener('input', (event) => {
        state.documentSearchQuery = event.target.value || '';
        renderDocuments();
    });

    searchInput.dataset.bound = 'true';
}

async function loadAnnouncements(propertyId) {
    if (!propertyId) return;
    try {
        setupAnnouncementManagerControls();
        populateAnnouncementTenantSelect();
        const response = await fetch(`${API_URL}/properties/${propertyId}/announcements`);
        if (!response.ok) throw new Error('Failed to fetch announcements');
        state.announcements = await response.json();
        renderAnnouncementsManager();
        updateTabCounts();
    } catch (error) {
        console.error('Error loading announcements:', error);
        const list = document.getElementById('announcementsList');
        if (list) list.innerHTML = '<div style="font-size:0.84rem;color:#b91c1c;">Unable to load announcements.</div>';
    }
}

function formatAnnouncementDateInput(value) {
    const date = parseAnnouncementCalendarDate(value);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseAnnouncementCalendarDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (typeof value === 'string') {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
    }
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}



function getAnnouncementLifecycle(item, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startsAt = parseAnnouncementCalendarDate(item?.startsAt);
    const expiresAt = parseAnnouncementCalendarDate(item?.expiresAt);
    if (expiresAt && expiresAt < today) return 'expired';
    if (startsAt && !expiresAt && startsAt < today) return 'expired';
    if (startsAt && startsAt > today) return 'scheduled';
    return 'active';
}

function getAnnouncementStatusMeta(item) {
    const lifecycle = getAnnouncementLifecycle(item);
    if (lifecycle === 'scheduled') {
        return {
            key: 'scheduled',
            label: 'Scheduled',
            style: 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'
        };
    }
    if (lifecycle === 'expired') {
        return {
            key: 'expired',
            label: 'Expired',
            style: 'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;'
        };
    }
    return {
        key: 'active',
        label: 'Active',
        style: 'background:#ecfdf3;color:#15803d;border:1px solid #bbf7d0;'
    };
}

function getAnnouncementCategoryLabel(category) {
    const normalized = String(category || 'general').trim().toLowerCase();
    const labels = {
        general: 'General',
        notice: 'Notice',
        inspection: 'Inspection',
        utility: 'Utility',
        parking: 'Parking'
    };
    return labels[normalized] || 'General';
}

function getAnnouncementTargetNames(item) {
    const targets = Array.isArray(item?.targetTenantIds) ? item.targetTenantIds : [];
    return targets.map(target => {
        if (typeof target === 'object') {
            return target.name || target.email || 'Tenant';
        }
        return (state.tenants || []).find(tenant => String(tenant._id) === String(target))?.name || 'Tenant';
    }).filter(Boolean);
}

function getAnnouncementAudienceSummary(item) {
    const names = getAnnouncementTargetNames(item);
    if (!names.length) return 'All tenants';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(', ');
    return `${names.length} selected tenants`;
}

function getAnnouncementScheduleSummary(item) {
    const startsAt = parseAnnouncementCalendarDate(item?.startsAt);
    const expiresAt = parseAnnouncementCalendarDate(item?.expiresAt);
    if (startsAt && expiresAt) {
        const startsLabel = startsAt.toLocaleDateString();
        const expiresLabel = expiresAt.toLocaleDateString();
        return startsLabel === expiresLabel
            ? `Scheduled for ${startsLabel}`
            : `Runs ${startsLabel} to ${expiresLabel}`;
    }
    if (startsAt) return `Starts ${startsAt.toLocaleDateString()}`;
    if (expiresAt) return `Available through ${expiresAt.toLocaleDateString()}`;
    return 'Available now';
}

function setupAnnouncementManagerControls() {
    const searchInput = document.getElementById('announcementsSearchInput');
    if (searchInput && searchInput.dataset.bound !== 'true') {
        searchInput.addEventListener('input', (event) => {
            state.announcementSearchQuery = event.target.value || '';
            renderAnnouncementsManager();
        });
        searchInput.dataset.bound = 'true';
    }

    const clearSearchBtn = document.getElementById('announcementsClearSearchBtn');
    if (clearSearchBtn && clearSearchBtn.dataset.bound !== 'true') {
        clearSearchBtn.addEventListener('click', () => {
            state.announcementSearchQuery = '';
            const input = document.getElementById('announcementsSearchInput');
            if (input) input.value = '';
            renderAnnouncementsManager();
        });
        clearSearchBtn.dataset.bound = 'true';
    }

    document.querySelectorAll('.announcement-filter-btn').forEach(button => {
        if (button.dataset.bound === 'true') return;
        button.addEventListener('click', () => {
            state.announcementStatusFilter = button.getAttribute('data-filter') || 'active';
            renderAnnouncementsManager();
        });
        button.dataset.bound = 'true';
    });

    const targetsContainer = document.getElementById('announcementTargets');
    if (targetsContainer && targetsContainer.dataset.bound !== 'true') {
        targetsContainer.addEventListener('change', (event) => {
            if (event.target?.matches('input[type="checkbox"][data-announcement-tenant-id]')) {
                updateAnnouncementTargetSelectionStyles();
                syncAnnouncementAudiencePreview();
            }
        });
        targetsContainer.dataset.bound = 'true';
    }

    const allTargetsBtn = document.getElementById('announcementAllTargetsBtn');
    if (allTargetsBtn && allTargetsBtn.dataset.bound !== 'true') {
        allTargetsBtn.addEventListener('click', () => {
            const container = document.getElementById('announcementTargets');
            if (!container) return;
            container.querySelectorAll('input[type="checkbox"][data-announcement-tenant-id]').forEach(checkbox => {
                checkbox.checked = false;
            });
            updateAnnouncementTargetSelectionStyles();
            syncAnnouncementAudiencePreview();
        });
        allTargetsBtn.dataset.bound = 'true';
    }

    const selectAllTargetsBtn = document.getElementById('announcementSelectAllTargetsBtn');
    if (selectAllTargetsBtn && selectAllTargetsBtn.dataset.bound !== 'true') {
        selectAllTargetsBtn.addEventListener('click', () => {
            const container = document.getElementById('announcementTargets');
            if (!container) return;
            container.querySelectorAll('input[type="checkbox"][data-announcement-tenant-id]').forEach(checkbox => {
                checkbox.checked = true;
            });
            updateAnnouncementTargetSelectionStyles();
            syncAnnouncementAudiencePreview();
        });
        selectAllTargetsBtn.dataset.bound = 'true';
    }

    const cancelEditBtn = document.getElementById('announcementCancelEditBtn');
    if (cancelEditBtn && cancelEditBtn.dataset.bound !== 'true') {
        cancelEditBtn.addEventListener('click', resetAnnouncementForm);
        cancelEditBtn.dataset.bound = 'true';
    }
}

function updateAnnouncementTargetSelectionStyles() {
    const container = document.getElementById('announcementTargets');
    if (!container) return;
    container.querySelectorAll('[data-announcement-tenant-row]').forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"][data-announcement-tenant-id]');
        const isChecked = Boolean(checkbox?.checked);
        row.style.border = isChecked ? '1px solid #93c5fd' : '1px solid #e2e8f0';
        row.style.background = isChecked ? '#eff6ff' : '#ffffff';
    });
}

function syncAnnouncementAudiencePreview() {
    const preview = document.getElementById('announcementAudiencePreview');
    if (!preview) return;
    const selectedIds = getSelectedAnnouncementTenantIds();
    if (!selectedIds.length) {
        preview.textContent = 'This announcement will be sent to all tenants in the property.';
        return;
    }
    const names = (state.tenants || [])
        .filter(tenant => selectedIds.includes(String(tenant._id)))
        .map(tenant => tenant.unitId?.number ? `${tenant.name} - Unit ${tenant.unitId.number}` : tenant.name);
    preview.textContent = names.length <= 3
        ? `Targeted recipients: ${names.join(', ')}`
        : `Targeted recipients: ${names.slice(0, 3).join(', ')} + ${names.length - 3} more.`;
}

function syncAnnouncementComposerUi(editing = false) {
    const title = document.getElementById('announcementComposerTitle');
    const subtitle = document.getElementById('announcementComposerSubtitle');
    const submitBtn = document.getElementById('announcementSubmitBtn');
    const cancelBtn = document.getElementById('announcementCancelEditBtn');
    if (title) title.textContent = editing ? 'Edit Announcement' : 'Compose Announcement';
    if (subtitle) subtitle.textContent = editing
        ? 'Update the title, audience, timing, or message for this announcement.'
        : 'Create a notice for the whole property or a selected tenant group.';
    if (submitBtn) {
        submitBtn.innerHTML = editing
            ? '<i class="fas fa-floppy-disk"></i> Save Changes'
            : '<i class="fas fa-paper-plane"></i> Publish Announcement';
    }
    if (cancelBtn) cancelBtn.style.display = editing ? '' : 'none';
}

function resetAnnouncementForm() {
    const form = document.getElementById('announcementForm');
    if (form) form.reset();
    const idInput = document.getElementById('announcementId');
    if (idInput) idInput.value = '';
    populateAnnouncementTenantSelect();
    syncAnnouncementAudiencePreview();
    syncAnnouncementComposerUi(false);
}

function renderAnnouncementsSummaryCards(announcements) {
    const container = document.getElementById('announcementsSummaryCards');
    if (!container) return;
    const counts = {
        active: 0,
        scheduled: 0,
        expired: 0,
        targeted: 0
    };
    announcements.forEach(item => {
        const lifecycle = getAnnouncementLifecycle(item);
        counts[lifecycle] = (counts[lifecycle] || 0) + 1;
        if (Array.isArray(item?.targetTenantIds) && item.targetTenantIds.length) {
            counts.targeted += 1;
        }
    });
    const cards = [
        { label: 'Active', value: counts.active, accent: '#16a34a', bg: '#ecfdf3' },
        { label: 'Scheduled', value: counts.scheduled, accent: '#2563eb', bg: '#eff6ff' },
        { label: 'Expired', value: counts.expired, accent: '#dc2626', bg: '#fef2f2' },
        { label: 'Targeted', value: counts.targeted, accent: '#7c3aed', bg: '#f5f3ff' }
    ];
    container.innerHTML = cards.map(card => `
        <div style="padding:12px 14px;border-radius:14px;background:${card.bg};border:1px solid rgba(226,232,240,0.95);box-shadow:0 6px 18px rgba(15,23,42,0.04);">
            <div style="font-size:0.76rem;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;font-weight:800;">${card.label}</div>
            <div style="margin-top:6px;font-size:1.5rem;font-weight:800;color:${card.accent};">${card.value}</div>
        </div>
    `).join('');
}

function renderAnnouncementFilterButtons() {
    document.querySelectorAll('.announcement-filter-btn').forEach(button => {
        const filterValue = button.getAttribute('data-filter');
        const isActive = filterValue === state.announcementStatusFilter;
        button.style.background = isActive ? '#0f172a' : '#ffffff';
        button.style.color = isActive ? '#ffffff' : '#334155';
        button.style.border = isActive ? '1px solid #0f172a' : '1px solid #cbd5e1';
    });
}

function renderAnnouncementsManager() {
    const list = document.getElementById('announcementsList');
    if (!list) return;
    const allAnnouncements = state.announcements || [];
    renderAnnouncementsSummaryCards(allAnnouncements);
    renderAnnouncementFilterButtons();

    const filterValue = state.announcementStatusFilter || 'active';
    const query = String(state.announcementSearchQuery || '').trim().toLowerCase();
    const filteredAnnouncements = allAnnouncements.filter(item => {
        const lifecycle = getAnnouncementLifecycle(item);
        const isTargeted = Array.isArray(item?.targetTenantIds) && item.targetTenantIds.length > 0;
        const matchesFilter = filterValue === 'all'
            || (filterValue === 'pinned' && !!item.pinned)
            || (filterValue === 'targeted' && isTargeted)
            || lifecycle === filterValue;
        if (!matchesFilter) return false;
        if (!query) return true;
        const haystack = [
            item.title,
            item.message,
            item.category,
            item.createdBy,
            getAnnouncementAudienceSummary(item),
            getAnnouncementTargetNames(item).join(' ')
        ].join(' ').toLowerCase();
        return haystack.includes(query);
    });

    const visibleAnnouncements = propertyRecordPage('announcementsList', filteredAnnouncements, renderAnnouncementsManager);
    const meta = document.getElementById('announcementsResultsMeta');
    if (meta) {
        const filterLabel = filterValue.charAt(0).toUpperCase() + filterValue.slice(1);
        meta.innerHTML = `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#ffffff;border:1px solid #dbeafe;"><i class="fas fa-layer-group" style="color:#2563eb;"></i>${filteredAnnouncements.length} showing</span>
            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;">Filter: ${filterLabel}</span>
        `;
    }

    if (!allAnnouncements.length) {
        resetAnnouncementForm();
        list.innerHTML = '<div style="padding:18px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;font-size:0.88rem;background:#fff;">No announcements yet. Use the composer to publish your first notice.</div>';
        return;
    }

    if (!filteredAnnouncements.length) {
        list.innerHTML = '<div style="padding:18px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;font-size:0.88rem;background:#fff;">No announcements match the current filters.</div>';
        return;
    }

    list.innerHTML = visibleAnnouncements.map(item => {
        const statusMeta = getAnnouncementStatusMeta(item);
        const audienceSummary = getAnnouncementAudienceSummary(item);
        const scheduleSummary = getAnnouncementScheduleSummary(item);
        const categoryLabel = getAnnouncementCategoryLabel(item.category);
        const targetNames = getAnnouncementTargetNames(item);
        const targetPreview = targetNames.length ? targetNames.slice(0, 4).map(name => `
            <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:0.75rem;border:1px solid #bfdbfe;">${escapeHtml(name)}</span>
        `).join('') : '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:#f8fafc;color:#475569;font-size:0.75rem;border:1px solid #e2e8f0;">All tenants</span>';
        const extraTargets = targetNames.length > 4 ? `<span style="font-size:0.75rem;color:#64748b;">+${targetNames.length - 4} more</span>` : '';
        return `
            <div style="display:grid;gap:10px;padding:14px 16px;border:1px solid #dbeafe;border-radius:14px;background:#ffffff;box-shadow:0 8px 22px rgba(15,23,42,0.05);">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                    <div style="display:grid;gap:6px;min-width:0;">
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <strong style="font-size:1rem;color:#0f172a;">${item.pinned ? '<i class="fas fa-thumbtack" style="color:#2563eb;margin-right:5px;"></i>' : ''}${escapeHtml(item.title)}</strong>
                            <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:0.74rem;font-weight:700;${statusMeta.style}">${statusMeta.label}</span>
                            <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:0.74rem;font-weight:700;background:#f8fafc;color:#334155;border:1px solid #e2e8f0;">${categoryLabel}</span>
                        </div>
                        <div style="font-size:0.88rem;color:#475569;white-space:pre-line;">${escapeHtml(item.message)}</div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button type="button" class="btn-secondary" onclick="editAnnouncement('${item._id}')"><i class="fas fa-pen"></i> Edit</button>
                        <button type="button" class="btn-icon delete-btn" title="Delete announcement" onclick="deleteAnnouncement('${item._id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
                    <div style="padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
                        <div style="font-size:0.74rem;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:800;">Audience</div>
                        <div style="margin-top:6px;font-weight:700;color:#0f172a;">${escapeHtml(audienceSummary)}</div>
                        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${targetPreview}${extraTargets}</div>
                    </div>
                    <div style="padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
                        <div style="font-size:0.74rem;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:800;">Timing</div>
                        <div style="margin-top:6px;font-weight:700;color:#0f172a;">${escapeHtml(scheduleSummary)}</div>
                        <div style="margin-top:6px;font-size:0.78rem;color:#64748b;">Created by ${escapeHtml(item.createdBy || 'Management')} on ${new Date(item.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function populateAnnouncementTenantSelect(selectedTenantIds = []) {
    const container = document.getElementById('announcementTargets');
    if (!container) return;
    const tenants = state.tenants || [];
    const selectedSet = new Set((selectedTenantIds || []).map(id => String(id)));
    if (!tenants.length) {
        container.innerHTML = '<div style="padding:10px;border:1px dashed #e2e8f0;border-radius:8px;color:#64748b;font-size:0.82rem;">No tenants available for this property.</div>';
        return;
    }
    container.innerHTML = tenants.map(tenant => {
        const tenantId = String(tenant._id || '');
        const label = `${tenant.name}${tenant.unitId?.number ? ` - Unit ${tenant.unitId.number}` : ''}`;
        return `
            <label data-announcement-tenant-row="${tenantId}" style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid ${selectedSet.has(tenantId) ? '#93c5fd' : '#e2e8f0'};background:${selectedSet.has(tenantId) ? '#eff6ff' : '#ffffff'};cursor:pointer;">
                <input type="checkbox" data-announcement-tenant-id="${tenantId}" value="${tenantId}" ${selectedSet.has(tenantId) ? 'checked' : ''} style="margin-top:2px;">
                <span style="display:grid;gap:2px;">
                    <span style="font-size:0.84rem;font-weight:600;color:#0f172a;">${escapeHtml(tenant.name || 'Tenant')}</span>
                    <span style="font-size:0.75rem;color:#64748b;">${escapeHtml(tenant.unitId?.number ? `Unit ${tenant.unitId.number}` : 'No unit assigned')}</span>
                </span>
            </label>`;
    }).join('');
    updateAnnouncementTargetSelectionStyles();
}

function getSelectedAnnouncementTenantIds() {
    const container = document.getElementById('announcementTargets');
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"][data-announcement-tenant-id]:checked'))
        .map(checkbox => checkbox.value)
        .filter(Boolean);
}



function editAnnouncement(id) {
    const item = (state.announcements || []).find(entry => String(entry._id) === String(id));
    if (!item) {
        showNotification('Announcement not found', 'error');
        return;
    }
    document.getElementById('announcementId').value = item._id || '';
    document.getElementById('announcementTitle').value = item.title || '';
    document.getElementById('announcementMessage').value = item.message || '';
    document.getElementById('announcementCategory').value = item.category || 'general';
    document.getElementById('announcementPinned').checked = Boolean(item.pinned);
    document.getElementById('announcementStarts').value = formatAnnouncementDateInput(item.startsAt);
    document.getElementById('announcementExpires').value = formatAnnouncementDateInput(item.expiresAt);
    const selectedIds = Array.isArray(item.targetTenantIds)
        ? item.targetTenantIds.map(target => typeof target === 'object' ? target._id : target)
        : [];
    populateAnnouncementTenantSelect(selectedIds);
    syncAnnouncementAudiencePreview();
    syncAnnouncementComposerUi(true);
    document.getElementById('announcementTitle')?.focus();
}

async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    if (!state.currentProperty?._id) {
        showNotification('Please select a property first', 'error');
        return;
    }
    const startsAt = document.getElementById('announcementStarts')?.value || '';
    const expiresAt = document.getElementById('announcementExpires')?.value || '';
    const payload = {
        title: document.getElementById('announcementTitle')?.value?.trim() || '',
        message: document.getElementById('announcementMessage')?.value?.trim() || '',
        category: document.getElementById('announcementCategory')?.value || 'general',
        startsAt,
        expiresAt,
        pinned: Boolean(document.getElementById('announcementPinned')?.checked),
        targetTenantIds: getSelectedAnnouncementTenantIds(),
        createdBy: localStorage.getItem('managerName') || localStorage.getItem('userName') || 'Management'
    };
    if (!payload.title || !payload.message) {
        showNotification('Announcement title and message are required', 'error');
        return;
    }
    if (startsAt && expiresAt && startsAt > expiresAt) {
        showNotification('Expiration date must be after the publish date', 'error');
        return;
    }

    const announcementId = document.getElementById('announcementId')?.value || '';
    const isEditing = Boolean(announcementId);

    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/announcements${isEditing ? `/${announcementId}` : ''}`, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.message || (isEditing ? 'Failed to update announcement' : 'Failed to publish announcement'));
        }
        resetAnnouncementForm();
        await loadAnnouncements(state.currentProperty._id);
        showNotification(isEditing ? 'Announcement updated' : 'Announcement published to tenant portal', 'success');
    } catch (error) {
        console.error('Error publishing announcement:', error);
        showNotification(error.message || 'Error publishing announcement', 'error');
    }
}

async function deleteAnnouncement(id) {
    if (!state.currentProperty?._id || !id) return;
    if (!confirm('Delete this tenant announcement?')) return;
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/announcements/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete announcement');
        await loadAnnouncements(state.currentProperty._id);
        showNotification('Announcement deleted', 'success');
    } catch (error) {
        console.error('Error deleting announcement:', error);
        showNotification('Error deleting announcement', 'error');
    }
}

function populateDocumentTenantSelect(selectedTenantId = '') {
    const tenantSelect = document.getElementById('documentTenant');
    if (!tenantSelect) return;

    const selected = String(selectedTenantId || '');
    const tenantOptions = (state.tenants || []).map(tenant => `
        <option value="${tenant._id}" ${String(tenant._id) === selected ? 'selected' : ''}>${tenant.name}</option>
    `).join('');

    tenantSelect.innerHTML = `<option value="">Unassigned</option>${tenantOptions}`;
}

async function assignDocumentTenant(documentId, tenantId) {
    if (!state.currentProperty?._id) return;

    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/documents/${documentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tenantId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to assign tenant');
        }

        const updatedDocument = await response.json();
        state.documents = (state.documents || []).map(doc => doc._id === updatedDocument._id ? updatedDocument : doc);
        renderDocuments();
        showNotification('Document assignment updated', 'success');
    } catch (error) {
        console.error('Error assigning document tenant:', error);
        showNotification(error.message || 'Error updating document assignment', 'error');
        renderDocuments();
    }
}

function showRecurringDetailsModal(selectedDate, schedules) {
  // selectedDate is a JS Date object
  const events = schedules.filter(sch => {
    if (!sch.nextScheduledDate) return false;
    const schDate = new Date(sch.nextScheduledDate);
    // Compare year, month, day in local time
    return (
      schDate.getFullYear() === selectedDate.getFullYear() &&
      schDate.getMonth() === selectedDate.getMonth() &&
      schDate.getDate() === selectedDate.getDate()
    );
  });

  // Build modal HTML with all schedule fields
  let html = `
    <div class="modal-content" style="max-width:600px;">
      <h2>Recurring Maintenance for ${selectedDate.toLocaleDateString()}</h2>
      ${events.length === 0 ? '<p>No recurring maintenance scheduled for this date.</p>' : ''}
      <ul style="padding-left:0;">
        ${events.map(sch => `
          <li style="margin-bottom:18px;list-style:none;">
            <strong>${sch.title}</strong><br>
            <span style="color:#888;">${DescriptionEditor.render(sch.description) || ''}</span><br>
            <span>Frequency: ${sch.frequency}${sch.frequency === 'custom' && sch.intervalDays ? `, every ${sch.intervalDays} days` : ''}</span><br>
            <span>Vendor: ${sch.assignedVendor?.name || 'None'}</span><br>
            <span>Unit: ${sch.unitId?.number ? `Unit ${sch.unitId.number}` : (sch.unitId ? sch.unitId : 'None')}</span><br>
            <span>Status: <span class="status-badge ${sch.status}">${!sch.status || sch.status === 'pending' ? 'Up-coming' : (sch.status === 'in-progress' ? 'In-progress' : sch.status.charAt(0).toUpperCase() + sch.status.slice(1))}</span></span><br>
            <span>Cost: ${typeof sch.cost === 'number' ? `$${sch.cost.toFixed(2)}` : '$0.00'}</span><br>
            ${sch.completedAt ? `<span style="color:#27ae60;">Completed: ${new Date(sch.completedAt).toLocaleDateString()}</span><br>` : ''}
            <div style="margin-top:8px;">
              <button onclick="editMaintenanceSchedule('${sch._id}')" class="btn-secondary" style="margin-right:6px;">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button onclick="deleteMaintenanceSchedule('${sch._id}')" class="btn-icon delete-btn" style="margin-left:2px;">
                <i class="fas fa-trash"></i> Delete
              </button>
            </div>
          </li>
        `).join('')}
      </ul>
      <div style="text-align:right;margin-top:18px;">
        <button class="btn-secondary" onclick="closeModal('recurringDetailsModal')">Close</button>
      </div>
    </div>
  `;

  let modal = document.getElementById('recurringDetailsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'recurringDetailsModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = html;
  openModal('recurringDetailsModal');
}

function updateMaintenanceCalendarTitle() {
    const titleEl = document.getElementById('maintenanceCalendarTitle');
    if (!titleEl) return;
    titleEl.innerHTML = '<i class="fas fa-calendar-alt"></i> Maintenance Calendar';
}

function getMaintenanceRequestCalendarDate(request) {
    return request?.scheduledFor || request?.createdAt || '';
}

function getMaintenanceCalendarDayEvents(selectedDate, requests, schedules) {
    const isSameDay = (value) => {
        if (!value) return false;
        const date = new Date(value);
        return (
            date.getFullYear() === selectedDate.getFullYear() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getDate() === selectedDate.getDate()
        );
    };

    return {
        requests: (requests || []).filter(request => isSameDay(getMaintenanceRequestCalendarDate(request))),
        schedules: (schedules || []).filter(schedule => isSameDay(schedule?.nextScheduledDate))
    };
}

function showCombinedMaintenanceCalendarDetailsModal(selectedDate, requests, schedules) {
    const dayEvents = getMaintenanceCalendarDayEvents(selectedDate, requests, schedules);
    const requestItems = dayEvents.requests;
    const scheduleItems = dayEvents.schedules;

    const html = `
        <div class="modal-content" style="max-width:720px;">
            <h2>Maintenance Calendar for ${selectedDate.toLocaleDateString()}</h2>
            ${!requestItems.length && !scheduleItems.length ? '<p>No maintenance activity for this date.</p>' : ''}
            <div style="display:grid;gap:18px;max-height:60vh;overflow-y:auto;">
                <section>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                        <h3 style="margin:0;color:#0f172a;font-size:1rem;"><i class="fas fa-tools" style="color:#0284c7;margin-right:8px;"></i>Maintenance Requests</h3>
                        <span style="font-size:0.85rem;color:#64748b;">${requestItems.length}</span>
                    </div>
                    ${requestItems.length ? `<div style="display:grid;gap:10px;">${requestItems.map(request => {
                        const unit = typeof request.unitId === 'object'
                            ? request.unitId
                            : (state.units || []).find(u => String(u._id) === String(request.unitId));
                        const workflowStage = getMaintenanceWorkflowStage(request);
                        const workflowLabel = getMaintenanceWorkflowStageLabel(workflowStage);
                        const requestDate = getMaintenanceRequestCalendarDate(request);
                        const dateLabel = request.scheduledFor ? 'Scheduled' : 'Created';
                        return `
                            <button type="button" onclick="closeModal('recurringDetailsModal'); editMaintenance('${request._id}')" style="text-align:left;border:1px solid #dbeafe;background:#fff;border-radius:12px;padding:12px 14px;cursor:pointer;display:grid;gap:6px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
                                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                                    <strong style="color:#0f172a;font-size:1rem;">${request.title || 'Maintenance Request'}</strong>
                                    <span class="status-badge ${workflowStage}" style="white-space:nowrap;">${workflowLabel}</span>
                                </div>
                                <div style="font-size:0.9rem;color:#475569;">${DescriptionEditor.render(request.description) || 'No description provided.'}</div>
                                <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:#64748b;">
                                    <span><i class="fas fa-calendar-alt" style="margin-right:6px;color:#217dbb;"></i>${dateLabel}: ${formatMaintenanceDateTime(requestDate)}</span>
                                    <span><i class="fas fa-door-open" style="margin-right:6px;color:#217dbb;"></i>${unit ? `Unit ${unit.number}` : 'No unit'}</span>
                                    <span><i class="fas fa-user" style="margin-right:6px;color:#217dbb;"></i>${getMaintenanceVendorLabel(request)}</span>
                                </div>
                            </button>
                        `;
                    }).join('')}</div>` : '<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;background:#f8fafc;">No maintenance requests on this date.</div>'}
                </section>
                <section>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                        <h3 style="margin:0;color:#0f172a;font-size:1rem;"><i class="fas fa-sync-alt" style="color:#16a34a;margin-right:8px;"></i>Recurring Maintenance</h3>
                        <span style="font-size:0.85rem;color:#64748b;">${scheduleItems.length}</span>
                    </div>
                    ${scheduleItems.length ? `<div style="display:grid;gap:10px;">${scheduleItems.map(sch => `
                        <button type="button" onclick="closeModal('recurringDetailsModal'); editMaintenanceSchedule('${sch._id}')" style="text-align:left;border:1px solid #bbf7d0;background:#fff;border-radius:12px;padding:12px 14px;cursor:pointer;display:grid;gap:6px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
                            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                                <strong style="color:#0f172a;font-size:1rem;">${sch.title || 'Recurring Maintenance'}</strong>
                                <span class="status-badge ${sch.status || 'pending'}" style="white-space:nowrap;">${getRecurringMaintenanceStatusLabel(sch.status || 'pending')}</span>
                            </div>
                            <div style="font-size:0.9rem;color:#475569;">${DescriptionEditor.render(sch.description) || 'No description provided.'}</div>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.85rem;color:#64748b;">
                                <span><i class="fas fa-calendar-alt" style="margin-right:6px;color:#16a34a;"></i>Scheduled: ${formatDateDisplay(sch.nextScheduledDate, 'en-US')}</span>
                                <span><i class="fas fa-repeat" style="margin-right:6px;color:#16a34a;"></i>${sch.frequency || 'Recurring'}</span>
                                <span><i class="fas fa-user" style="margin-right:6px;color:#16a34a;"></i>${sch.assignedVendor?.name || 'None'}</span>
                            </div>
                        </button>
                    `).join('')}</div>` : '<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;background:#f8fafc;">No recurring maintenance on this date.</div>'}
                </section>
            </div>
            <div style="text-align:right;margin-top:18px;">
                <button class="btn-secondary" onclick="closeModal('recurringDetailsModal')">Close</button>
            </div>
        </div>
    `;

    let modal = document.getElementById('recurringDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'recurringDetailsModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    openModal('recurringDetailsModal');
}



function renderActiveMaintenanceCalendar() {
    updateMaintenanceCalendarTitle();
    const calendarEl = document.getElementById('recurringCalendarFull');
    if (!calendarEl) return;

    if (calendarEl._fullCalendar) {
        calendarEl._fullCalendar.destroy();
        calendarEl.innerHTML = '';
    }

    const requests = currentMaintenanceTab === 'requests' ? getFilteredPropertyMaintenanceItems('requests') : (state.maintenanceRequests || []);
    const schedules = currentMaintenanceTab === 'schedules' ? getFilteredPropertyMaintenanceItems('schedules') : (state.maintenanceSchedules || window.lastLoadedSchedules || []);
    const requestEvents = requests.map(request => {
        const requestDate = getMaintenanceRequestCalendarDate(request);
        const workflowStage = getMaintenanceWorkflowStage(request);
        return {
            title: request.title || 'Maintenance Request',
            start: requestDate ? new Date(requestDate) : null,
            allDay: true,
            backgroundColor: request.scheduledFor ? '#0ea5e9' : '#94a3b8',
            borderColor: request.scheduledFor ? '#0284c7' : '#64748b',
            textColor: '#ffffff',
            extendedProps: {
                itemType: 'request',
                description: request.description || '',
                workflowLabel: getMaintenanceWorkflowStageLabel(workflowStage),
                dateLabel: request.scheduledFor ? 'Scheduled' : 'Created'
            }
        };
    }).filter(event => event.start);
    const scheduleEvents = schedules.map(sch => ({
        title: sch.title + (sch.assignedVendor?.name ? ` (${sch.assignedVendor.name})` : ''),
        start: sch.nextScheduledDate ? new Date(sch.nextScheduledDate) : null,
        allDay: true,
        backgroundColor: '#22c55e',
        borderColor: '#16a34a',
        textColor: '#ffffff',
        extendedProps: {
            itemType: 'schedule',
            description: sch.description || '',
            frequency: sch.frequency || ''
        }
    })).filter(event => event.start);

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 500,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        events: [...requestEvents, ...scheduleEvents],
        eventDidMount: function(info) {
            if (info.event.extendedProps.itemType === 'request') {
                info.el.title = `${info.event.title}\n${DescriptionEditor.plain(info.event.extendedProps.description)}\n${info.event.extendedProps.dateLabel}: ${info.event.start ? info.event.start.toLocaleDateString() : ''}\nWorkflow: ${info.event.extendedProps.workflowLabel}`;
                return;
            }
            info.el.title = `${info.event.title}\n${DescriptionEditor.plain(info.event.extendedProps.description)}\nFrequency: ${info.event.extendedProps.frequency || ''}`;
        },
        dateClick: function(info) {
            showCombinedMaintenanceCalendarDetailsModal(info.date, requests, schedules);
        },
        eventClick: function(info) {
            showCombinedMaintenanceCalendarDetailsModal(info.event.start, requests, schedules);
        }
    });
    calendar.render();
    calendarEl._fullCalendar = calendar;
}

async function loadMaintenanceSchedules() {
  if (!state.currentProperty) return;
  try {
    const res = await fetch(`/api/properties/${state.currentProperty._id}/maintenance-schedules`);
    if (!res.ok) throw new Error('Failed to fetch maintenance schedules');
    const schedules = await res.json();
        state.maintenanceSchedules = schedules;
    window.lastLoadedSchedules = schedules; // Save for calendar
        renderPropertyMaintenanceFilterBar();
        applyPropertyMaintenanceFilters();
        updatePropertyMaintenanceViewToggle();
    // If recurring tab is active, render calendar
if (currentMaintenanceTab === 'schedules') {
    renderActiveMaintenanceCalendar();
}
  } catch (err) {
    console.error('Error loading maintenance schedules:', err);
    showNotification('Error loading maintenance schedules', 'error');
  }
}

function initializeRecurringCalendarUi() {
        const calContainer = document.getElementById('recurringCalendarContainer');
        if (calContainer) calContainer.style.display = 'none';

        const toggle = document.getElementById('toggleCalendarIcon');
        if (!toggle || toggle.dataset.bound === 'true') return;
        toggle.addEventListener('click', () => {
                if (calContainer?.style.display === 'none' || calContainer?.style.display === '') {
                        calContainer.style.display = 'block';
                        renderActiveMaintenanceCalendar();
                } else if (calContainer) {
                        calContainer.style.display = 'none';
                }
        });
        toggle.dataset.bound = 'true';
}

async function loadDocuments(propertyId, force = false) {
    
    try {
        if (!force && shouldUseCache('documents', propertyId)) {
            renderDocuments();
            updateTabCounts();
            return;
        }
        const response = await fetch(`${API_URL}/properties/${propertyId}/documents`);
        if (!response.ok) throw new Error('Failed to fetch documents');
        
        const documents = await response.json();
        state.documents = documents;
        console.log('Loaded documents:', state.documents);
        renderDocuments();
        updateTabCounts(); 
        touchCache('documents', propertyId);
    } catch (error) {
        console.error('Error loading documents:', error);
        showNotification('Error loading documents', 'error');

    }
}

function renderDocuments() {
    const documentsGrid = document.getElementById('documentsGrid');
    const rawSearch = String(state.documentSearchQuery || '').trim().toLowerCase();
    const documents = !rawSearch
        ? (state.documents || [])
        : (state.documents || []).filter(doc => {
            const tenantName = typeof doc.tenantId === 'object'
                ? (doc.tenantId?.name || '')
                : ((state.tenants || []).find(tenant => String(tenant._id) === String(doc.tenantId))?.name || '');
            return [doc.name, doc.type, tenantName]
                .filter(Boolean)
                .some(value => String(value).toLowerCase().includes(rawSearch));
        });
    
    const visibleDocuments = propertyRecordPage('documentsGrid', documents, renderDocuments);
    if (!state.documents?.length) {
        documentsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file"></i>
                <p>No documents found</p>
                <button onclick="openModal('uploadDocumentModal')" class="btn-primary">
                    Upload Your First Document
                </button>
            </div>`;
        return;
    }

    documentsGrid.innerHTML = `
        <div class="documents-table-wrapper">
            <table class="documents-table">
                <thead>
                    <tr>
                        <th>Document</th>
                        <th>Type</th>
                        <th>Assigned Tenant</th>
                        <th>Added</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${documents.length ? visibleDocuments.map(doc => {
                        const selectedTenantId = typeof doc.tenantId === 'object'
                            ? (doc.tenantId?._id || '')
                            : (doc.tenantId || '');
                        const tenantOptions = (state.tenants || []).map(tenant => `
                            <option value="${tenant._id}" ${String(tenant._id) === String(selectedTenantId) ? 'selected' : ''}>${tenant.name}</option>
                        `).join('');
                        const assignedTenantLabel = typeof doc.tenantId === 'object'
                            ? (doc.tenantId?.name || 'Unassigned')
                            : ((state.tenants || []).find(tenant => String(tenant._id) === String(doc.tenantId))?.name || 'Unassigned');

                        return `
                            <tr>
                                <td>
                                    <div class="documents-file-cell">
                                        <span class="documents-file-icon"><i class="fas fa-file-${getFileIcon(doc.name)}"></i></span>
                                        <div class="documents-file-meta">
                                            <button type="button" class="document-name-button" onclick="viewDocument('${doc._id}')">${doc.name}</button>
                                            <span>${assignedTenantLabel}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>${doc.type}</td>
                                <td>
                                    <select class="documents-assignment-select" onchange="assignDocumentTenant('${doc._id}', this.value)">
                                        <option value="">Unassigned</option>
                                        ${tenantOptions}
                                    </select>
                                </td>
                                <td>${new Date(doc.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <div class="document-actions">
                                        <details class="document-menu">
                                            <summary title="Document actions" aria-label="Document actions">
                                                <i class="fas fa-ellipsis-v"></i>
                                            </summary>
                                            <div class="document-menu-list">
                                                <button type="button" onclick="downloadDocument('${doc._id}'); closeDocumentMenu(this)">
                                                    <i class="fas fa-download"></i> Download
                                                </button>
                                                <button type="button" onclick="renameDocument('${doc._id}'); closeDocumentMenu(this)">
                                                    <i class="fas fa-pen"></i> Rename
                                                </button>
                                                <button type="button" onclick="deleteDocument('${doc._id}'); closeDocumentMenu(this)" class="delete-btn">
                                                    <i class="fas fa-trash"></i> Delete
                                                </button>
                                            </div>
                                        </details>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('') : `
                        <tr>
                            <td colspan="5" class="documents-empty-row">No documents match your search.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

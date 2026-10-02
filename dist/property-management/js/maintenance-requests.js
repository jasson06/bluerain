// Property management: maintenance requests.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function getMaintenanceViewToggleMeta(isListView) {
    return {
        iconClass: isListView ? 'fas fa-th-large' : 'fas fa-list',
        label: isListView ? 'Card View' : 'List View',
        title: isListView ? 'Switch to card view' : 'Switch to list view'
    };
}

function updatePropertyMaintenanceViewToggle() {
    const button = document.getElementById('toggleScheduleViewBtn');
    const icon = document.getElementById('scheduleViewIcon');
    const label = document.getElementById('scheduleViewLabel');
    if (!button || !icon || !label) return;
    const isListView = currentMaintenanceTab === 'schedules' ? scheduleListView : maintenanceRequestListView;
    const meta = getMaintenanceViewToggleMeta(isListView);
    icon.className = meta.iconClass;
    label.textContent = meta.label;
    button.title = meta.title;
}

function getPropertyMaintenanceFilterTab(tabName = currentMaintenanceTab) {
    return tabName === 'schedules' ? 'schedules' : 'requests';
}

function getPropertyMaintenanceFilterState(tabName = currentMaintenanceTab) {
    const key = getPropertyMaintenanceFilterTab(tabName);
    if (!state.propertyMaintenanceFilters) {
        state.propertyMaintenanceFilters = {
            requests: { query: '', status: '', unit: '' },
            schedules: { query: '', status: '', unit: '' }
        };
    }
    if (!state.propertyMaintenanceFilters[key]) {
        state.propertyMaintenanceFilters[key] = { query: '', status: '', unit: '' };
    }
    return state.propertyMaintenanceFilters[key];
}

function presetPropertyMaintenanceStatusFilters(requestsStatus = 'in-progress', schedulesStatus = '') {
    getPropertyMaintenanceFilterState('requests').status = requestsStatus;
    getPropertyMaintenanceFilterState('schedules').status = schedulesStatus;
}

function getPropertyMaintenanceUnitOption(item, tabName = currentMaintenanceTab) {
    if (!item) return ['', 'No unit assigned'];
    if (tabName === 'schedules') {
        if (item.unitId && typeof item.unitId === 'object' && item.unitId._id) {
            return [String(item.unitId._id), `Unit ${item.unitId.number || '—'}`];
        }
        if (item.unitId) {
            const unitObj = (state.units || []).find(u => String(u._id) === String(item.unitId));
            return [String(item.unitId), unitObj?.number ? `Unit ${unitObj.number}` : `Unit ${item.unitId}`];
        }
        return ['', 'No unit assigned'];
    }
    const unit = typeof item.unitId === 'object' ? item.unitId : (state.units || []).find(u => String(u._id) === String(item.unitId));
    if (!unit) return ['', 'No unit assigned'];
    return [String(unit._id || item.unitId), `Unit ${unit.number || '—'}`];
}

function getPropertyMaintenanceStatusValue(item, tabName = currentMaintenanceTab) {
    const rawStatus = String(item?.status || 'pending').toLowerCase();
    if (tabName === 'schedules') {
        return rawStatus;
    }
    return ['pending', 'in-progress'].includes(rawStatus) ? 'in-progress' : rawStatus;
}

function getPropertyMaintenanceStatusLabel(status, tabName = currentMaintenanceTab) {
    if (tabName === 'schedules') {
        return getRecurringMaintenanceStatusLabel(status);
    }
    if (status === 'in-progress') return 'In Progress';
    if (status === 'completed') return 'Completed';
    if (status === 'closed') return 'Closed';
    return String(status || 'pending').charAt(0).toUpperCase() + String(status || 'pending').slice(1);
}

function getPropertyMaintenanceSearchText(item, tabName = currentMaintenanceTab) {
    const [unitKey, unitLabel] = getPropertyMaintenanceUnitOption(item, tabName);
    const statusLabel = getPropertyMaintenanceStatusLabel(getPropertyMaintenanceStatusValue(item, tabName), tabName);
    const vendorLabel = tabName === 'schedules'
        ? (item?.assignedVendor?.name || '')
        : getMaintenanceVendorLabel(item);
    return [
        item?.title || item?.issue || '',
        item?.description || '',
        unitKey,
        unitLabel,
        statusLabel,
        item?.status || '',
        item?.priority || '',
        vendorLabel
    ].join(' ').toLowerCase();
}

function getFilteredPropertyMaintenanceItems(tabName = currentMaintenanceTab) {
    const key = getPropertyMaintenanceFilterTab(tabName);
    const filters = getPropertyMaintenanceFilterState(key);
    const items = key === 'schedules' ? (state.maintenanceSchedules || []) : (state.maintenanceRequests || []);
    const query = String(filters.query || '').trim().toLowerCase();
    return items.filter(item => {
        if (filters.status) {
            const statusValue = getPropertyMaintenanceStatusValue(item, key);
            if (statusValue !== filters.status) return false;
        }
        if (filters.unit) {
            const [unitKey] = getPropertyMaintenanceUnitOption(item, key);
            if (String(unitKey || '') !== String(filters.unit)) return false;
        }
        if (query && !getPropertyMaintenanceSearchText(item, key).includes(query)) return false;
        return true;
    });
}

function getPortfolioMaintenanceFilterState(type = state.portfolioMaintenanceType || 'request') {
    const key = type === 'recurring' ? 'recurring' : 'request';
    if (!state.portfolioMaintenanceFilters) {
        state.portfolioMaintenanceFilters = {
            request: { status: 'in-progress' },
            recurring: { status: 'in-progress' }
        };
    }
    if (!state.portfolioMaintenanceFilters[key]) {
        state.portfolioMaintenanceFilters[key] = { status: 'in-progress' };
    }
    return state.portfolioMaintenanceFilters[key];
}

function presetPortfolioMaintenanceStatusFilters(requestStatus = 'in-progress', recurringStatus = 'in-progress') {
    getPortfolioMaintenanceFilterState('request').status = requestStatus;
    getPortfolioMaintenanceFilterState('recurring').status = recurringStatus;
}

function getPortfolioMaintenanceStatusValue(item, type = state.portfolioMaintenanceType || 'request') {
    const rawStatus = String(item?.status || 'pending').toLowerCase();
    if (type === 'recurring') {
        return rawStatus;
    }
    return ['pending', 'in-progress'].includes(rawStatus) ? 'in-progress' : rawStatus;
}

function getPortfolioMaintenanceStatusLabel(status, type = state.portfolioMaintenanceType || 'request') {
    if (type === 'recurring') {
        return getRecurringMaintenanceStatusLabel(status);
    }
    if (status === 'in-progress') return 'In Progress';
    if (status === 'completed') return 'Completed';
    if (status === 'closed') return 'Closed';
    return String(status || 'pending').charAt(0).toUpperCase() + String(status || 'pending').slice(1);
}

function renderPortfolioMaintenanceWorkspaceFilter(filterElement, items, type = state.portfolioMaintenanceType || 'request') {
    if (!filterElement) return '';
    const filterState = getPortfolioMaintenanceFilterState(type);
    const shouldUseDefaultStatus = !!state.portfolioMaintenanceUseDefaultStatus;
    if (!shouldUseDefaultStatus) {
        const domValue = filterElement.value === 'all' ? '' : String(filterElement.value || '').trim();
        filterState.status = domValue;
    }
    state.portfolioMaintenanceUseDefaultStatus = false;
    const statuses = Array.from(new Set((items || []).map(item => getPortfolioMaintenanceStatusValue(item, type)).filter(Boolean)));
    const preferredStatuses = type === 'recurring'
        ? ['in-progress', 'pending', 'completed']
        : ['in-progress', 'completed', 'closed'];
    const orderedStatuses = [
        ...preferredStatuses.filter(value => statuses.includes(value)),
        ...statuses.filter(value => !preferredStatuses.includes(value)).sort()
    ];
    if (filterState.status && !orderedStatuses.includes(filterState.status)) {
        filterState.status = orderedStatuses.includes('in-progress') ? 'in-progress' : '';
    }
    filterElement.innerHTML = `<option value="">All statuses</option>${orderedStatuses.map(status => `<option value="${status}" ${filterState.status === status ? 'selected' : ''}>${getPortfolioMaintenanceStatusLabel(status, type)}</option>`).join('')}`;
    filterElement.value = filterState.status || '';
    return filterState.status || '';
}

function renderPropertyMaintenanceFilterBar() {
    const searchInput = document.getElementById('propertyMaintenanceSearchBar');
    const statusSelect = document.getElementById('propertyMaintenanceStatusFilter');
    const unitSelect = document.getElementById('propertyMaintenanceUnitFilter');
    if (!searchInput || !statusSelect || !unitSelect) return;
    const tabName = getPropertyMaintenanceFilterTab();
    const filters = getPropertyMaintenanceFilterState(tabName);
    const items = tabName === 'schedules' ? (state.maintenanceSchedules || []) : (state.maintenanceRequests || []);
    const statuses = Array.from(new Set(items.map(item => getPropertyMaintenanceStatusValue(item, tabName)).filter(Boolean)));
    const preferredStatuses = tabName === 'schedules'
        ? ['in-progress', 'pending', 'completed']
        : ['in-progress', 'completed', 'closed'];
    const orderedStatuses = [...preferredStatuses.filter(value => statuses.includes(value)), ...statuses.filter(value => !preferredStatuses.includes(value)).sort()];
    const unitOptions = Array.from(new Map(items.map(item => getPropertyMaintenanceUnitOption(item, tabName)).filter(([key]) => key)).entries()).map(([key, label]) => [key, label]).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    searchInput.placeholder = tabName === 'schedules'
        ? 'Search recurring maintenance by title, unit, status, vendor...'
        : 'Search maintenance by title, unit, status, vendor...';
    searchInput.value = filters.query || '';
    statusSelect.innerHTML = `<option value="">All statuses</option>${orderedStatuses.map(status => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${getPropertyMaintenanceStatusLabel(status, tabName)}</option>`).join('')}`;
    unitSelect.innerHTML = `<option value="">All units</option>${unitOptions.map(([key, label]) => `<option value="${key}" ${filters.unit === key ? 'selected' : ''}>${label}</option>`).join('')}`;
}

function applyPropertyMaintenanceFilters() {
    renderPropertyMaintenanceFilterBar();
    if (currentMaintenanceTab === 'schedules') {
        const filteredSchedules = getFilteredPropertyMaintenanceItems('schedules');
        if (scheduleListView) renderMaintenanceSchedulesList(filteredSchedules);
        else renderMaintenanceSchedules(filteredSchedules);
        if (document.getElementById('recurringCalendarContainer')?.style.display === 'block') renderActiveMaintenanceCalendar();
    } else {
        const filteredRequests = getFilteredPropertyMaintenanceItems('requests');
        if (maintenanceRequestListView) renderMaintenanceRequestsList(filteredRequests);
        else renderMaintenanceRequests(filteredRequests);
    }
}

function refreshPropertyMaintenanceView(options = {}) {
    applyPropertyMaintenanceFilters();
    updatePropertyMaintenanceViewToggle();
    updateMaintenanceTabBadge();
    renderWorkspaceSidebar();
}

function initializePropertyMaintenanceFilterBar() {
    const searchInput = document.getElementById('propertyMaintenanceSearchBar');
    const statusSelect = document.getElementById('propertyMaintenanceStatusFilter');
    const unitSelect = document.getElementById('propertyMaintenanceUnitFilter');
    const clearButton = document.getElementById('clearPropertyMaintenanceFiltersBtn');
    if (!searchInput || !statusSelect || !unitSelect || !clearButton || searchInput.dataset.bound === 'true') return;
    const updateFilters = () => {
        const filters = getPropertyMaintenanceFilterState();
        filters.query = searchInput.value || '';
        filters.status = statusSelect.value || '';
        filters.unit = unitSelect.value || '';
        applyPropertyMaintenanceFilters();
    };
    searchInput.addEventListener('input', updateFilters);
    statusSelect.addEventListener('change', updateFilters);
    unitSelect.addEventListener('change', updateFilters);
    clearButton.addEventListener('click', () => {
        const filters = getPropertyMaintenanceFilterState();
        filters.query = '';
        filters.status = '';
        filters.unit = '';
        applyPropertyMaintenanceFilters();
    });
    searchInput.dataset.bound = 'true';
    renderPropertyMaintenanceFilterBar();
}

// Maintenance Request Management
async function handleAddMaintenance(event) {
    event.preventDefault();

    const formEl = event.target;
    const propertySelect = document.getElementById('maintenanceProperty');
    let projectId = '';
    if (propertySelect && propertySelect.value) {
        projectId = propertySelect.value;
    } else if (state.currentProperty && state.currentProperty._id) {
        projectId = state.currentProperty._id;
    }

    if (!projectId) {
        showNotification('Please select a property first', 'error');
        return;
    }

    const photosInput = document.getElementById('maintenancePhotos');
    const preview = document.getElementById('maintenancePhotosPreview');
    const hasPhotos = photosInput && photosInput.files && photosInput.files.length;
    // If photos were uploaded earlier as temp, they are stored in form dataset
    const tempPhotosPaths = (event.target.dataset.tempPhotosPaths ? JSON.parse(event.target.dataset.tempPhotosPaths) : []);
    let response;
    showLoader();
    try {
        if (tempPhotosPaths.length) {
            const formData = new FormData();
            formData.append('title', document.getElementById('maintenanceTitle').value.trim());
            formData.append('description', document.getElementById('maintenanceDescription').value.trim());
            formData.append('priority', document.getElementById('maintenancePriority').value);
            formData.append('workflowStage', document.getElementById('maintenanceWorkflowStage').value);
            formData.append('unitId', document.getElementById('maintenanceUnit').value);
            formData.append('assignedVendor', document.getElementById('maintenanceVendor').value);
            formData.append('scheduledFor', document.getElementById('maintenanceScheduledFor').value);
            formData.append('cost', document.getElementById('maintenanceCost').value);
            formData.append('accessNotes', document.getElementById('maintenanceAccessNotes').value.trim());
            formData.append('status', 'pending');
            formData.append('tempPhotosPaths', JSON.stringify(tempPhotosPaths));
            response = await fetch(`${API_URL}/properties/${projectId}/maintenance`, {
                method: 'POST',
                body: formData
            });
        } else {
            const maintenanceData = {
                title: document.getElementById('maintenanceTitle').value.trim(),
                description: document.getElementById('maintenanceDescription').value.trim(),
                priority: document.getElementById('maintenancePriority').value,
                workflowStage: document.getElementById('maintenanceWorkflowStage').value,
                unitId: document.getElementById('maintenanceUnit').value,
                assignedVendor: document.getElementById('maintenanceVendor').value,
                scheduledFor: document.getElementById('maintenanceScheduledFor').value,
                cost: document.getElementById('maintenanceCost').value,
                accessNotes: document.getElementById('maintenanceAccessNotes').value.trim(),
                status: 'pending'
            };
            response = await fetch(`${API_URL}/properties/${projectId}/maintenance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(maintenanceData)
            });
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create maintenance request');
        }

        // Reset form before loading new data
        event.target.reset();
        event.target.dataset.tempPhotosPaths = JSON.stringify([]);
        if (preview) preview.innerHTML = '';
        closeModal('addMaintenanceModal');
        
        const ctx = formEl && formEl.dataset ? formEl.dataset.context || '' : '';
        if (ctx === 'portfolio') {
            try {
                await renderPortfolioOverview();
                renderPortfolioDetails('maintenance');
            } catch (e) {
                console.warn('Error refreshing portfolio maintenance after new request:', e);
            }
        } else {
            invalidateCache('maintenance');
            await refreshContent('maintenance');
        }
        showNotification('Maintenance request created successfully', 'success');
        

    } catch (error) {
        console.error('Error creating maintenance request:', error);
        showNotification(error.message || 'Error creating maintenance request', 'error');
            } finally {
        hideLoader();
    }
}

function updateMaintenanceTabBadge() {
    const badge = document.getElementById('maintenancePendingBadge');
    const pendingCount = state.maintenanceRequests.filter(r =>
        r.status === 'pending' || r.status === 'in-progress'
    ).length;
    if (pendingCount > 0) {
        badge.textContent = pendingCount > 9 ? '9+' : pendingCount;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

async function loadMaintenanceRequests(propertyId, force = false) {
    try {
        const response = await fetch(`${API_URL}/properties/${propertyId}/maintenance${force ? `?_=${Date.now()}` : ''}`);
        if (!response.ok) throw new Error('Failed to fetch maintenance requests');

        const requests = await response.json();
        try {
            await loadMaintenanceVendors();
        } catch (vendorError) {
            console.warn('Error loading vendors for maintenance requests:', vendorError);
        }
        state.maintenanceRequests = requests;
        propertyMaintenancePhotoHydrationStarted = false;
        propertyMaintenancePhotoHydrationComplete = false;
        console.log('Loaded maintenance requests:', state.maintenanceRequests);
        renderPropertyMaintenanceFilterBar();
        applyPropertyMaintenanceFilters();
        if (currentMaintenanceTab === 'requests' && document.getElementById('recurringCalendarContainer')?.style.display === 'block') {
            renderActiveMaintenanceCalendar();
        }
        updatePropertyMaintenanceViewToggle();
        updateMaintenanceTabBadge();
    } catch (error) {
        console.error('Error loading maintenance requests:', error);
        showNotification('Error loading maintenance requests', 'error');
    }
}

function openMaintenancePhotoUpload(requestId, source = 'property') {
    const items = source === 'portfolio' ? state.portfolioMaintenance : state.maintenanceRequests;
    const request = (items || []).find(item => String(item._id) === String(requestId));
    const projectId = portfolioPropertyId(request) || (source === 'property' ? state.currentProperty?._id : '');
    if (!request || !projectId) { showNotification('Could not find the property for this request', 'error'); return; }
    state.maintenancePhotoUploads = state.maintenancePhotoUploads || {};
    if (state.maintenancePhotoUploads[requestId]) { showNotification('Photos are already uploading for this request', 'info'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        if (files.length > 10) { showNotification('Select up to 10 photos at a time', 'error'); return; }
        if (files.some(file => file.type && !file.type.startsWith('image/'))) { showNotification('Please select image files only', 'error'); return; }
        if (state.maintenancePhotoUploads[requestId]) return;
        state.maintenancePhotoUploads[requestId] = true;
        showNotification('Uploading photos…', 'info');
        try {
            const body = new FormData();
            files.forEach(file => body.append('photos', file));
            const response = await fetch(`${API_URL}/properties/${encodeURIComponent(projectId)}/maintenance/${encodeURIComponent(requestId)}`, { method:'PUT', body });
            if (!response.ok) throw new Error('Could not upload photos. Please try again.');
            const updated = await response.json();
            // Preserve populated unit/vendor objects used by the cards.
            [state.maintenanceRequests, state.portfolioMaintenance].forEach(list => (list || []).forEach(item => {
                if (String(item._id) !== String(requestId)) return;
                if (Array.isArray(updated.photos)) item.photos = updated.photos;
                if (Array.isArray(updated.afterPhotos)) item.afterPhotos = updated.afterPhotos;
                if (updated.updatedAt) item.updatedAt = updated.updatedAt;
            }));
            invalidateCache('maintenance');
            if (source === 'portfolio' && state.portfolioWorkspaceMode === 'maintenance') {
                renderUnifiedPortfolioWorkspace(false);
                scheduleMaintenancePhotoHydration('portfolio');
            } else if (source === 'property' && String(state.currentProperty?._id) === String(projectId) && state.currentTab === 'maintenance') {
                applyPropertyMaintenanceFilters();
                scheduleMaintenancePhotoHydration('property');
            }
            showNotification(`${files.length} photo${files.length === 1 ? '' : 's'} uploaded`, 'success');
        } catch (error) { showNotification(error.message || 'Could not upload photos', 'error'); }
        finally { delete state.maintenancePhotoUploads[requestId]; }
    };
    input.click();
}

function renderMaintenancePhotoGallery(request, source = 'property') {
    const beforePhotos = Array.isArray(request?.photos) ? request.photos : [];
    const afterPhotos = Array.isArray(request?.afterPhotos) ? request.afterPhotos : [];

    const requestId = String(request?._id || '').trim();
    const deferPhotos = shouldDeferMaintenancePhotos(source);

    const uploadAction = requestId ? `<button type="button" class="overview-row-action" onclick="event.stopPropagation();openMaintenancePhotoUpload(decodeURIComponent('${encodeURIComponent(requestId)}'),'${source}')"><i class="fas fa-camera" aria-hidden="true"></i> + Upload photos</button>` : '';
    if (!beforePhotos.length && !afterPhotos.length) return uploadAction;
    return `
        ${uploadAction}
        <div data-maint-photo-gallery="true" data-request-id="${requestId}" data-source="${source}" style="display:grid;gap:0;">
            ${deferPhotos ? renderMaintenancePhotoGalleryLoadingState(beforePhotos, afterPhotos) : renderMaintenancePhotoGalleryContent(request, source)}
        </div>
    `;
}

function shouldDeferMaintenancePhotos(source = 'property') {
    if (source === 'portfolio') {
        return !portfolioMaintenancePhotoHydrationComplete && !portfolioMaintenanceListView;
    }

    return !propertyMaintenancePhotoHydrationComplete && !maintenanceRequestListView;
}

function renderMaintenancePhotoGalleryLoadingState(beforePhotos = [], afterPhotos = []) {
    const renderPlaceholder = (photoType, label, count) => `
        <div style="margin-top:8px;">
            <div style="font-size:0.8rem;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:${photoType === 'after' ? '#92400e' : '#334155'};margin-bottom:6px;">
                <i class="fas ${photoType === 'after' ? 'fa-flag-checkered' : 'fa-camera'}" style="margin-right:6px;"></i>${label}
            </div>
            <div style="display:flex;align-items:center;gap:10px;min-height:72px;padding:12px;border-radius:10px;background:linear-gradient(180deg, rgba(248,250,252,0.96), rgba(239,246,255,0.92));border:1px solid #dbeafe;">
                <span style="width:22px;height:22px;border:2px solid rgba(14,165,233,0.2);border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite;flex:0 0 auto;"></span>
                <span style="font-size:0.85rem;color:#475569;font-weight:600;">Loading ${count} ${label.toLowerCase()}...</span>
            </div>
        </div>
    `;

    return [
        beforePhotos.length ? renderPlaceholder('before', 'Request Photos', beforePhotos.length) : '',
        afterPhotos.length ? renderPlaceholder('after', 'After Photos', afterPhotos.length) : ''
    ].join('');
}

function renderMaintenancePhotoGalleryContent(request, source = 'property') {
    const beforePhotos = Array.isArray(request?.photos) ? request.photos : [];
    const afterPhotos = Array.isArray(request?.afterPhotos) ? request.afterPhotos : [];

    const renderThumbs = (photos, photoType, label) => `
        <div style="margin-top:8px;">
            <div style="font-size:0.8rem;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:${photoType === 'after' ? '#92400e' : '#334155'};margin-bottom:6px;">
                <i class="fas ${photoType === 'after' ? 'fa-flag-checkered' : 'fa-camera'}" style="margin-right:6px;"></i>${label}
            </div>
            <div class="maintenance-photos" style="display:flex;flex-wrap:wrap;gap:6px;">
                ${photos.map((src, idx) => `
                    <div class="photo-thumb maintenance-photo-thumb-loading" style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.12);cursor:pointer;background:linear-gradient(180deg,#eff6ff,#dbeafe);">
                        <span class="maintenance-photo-thumb-overlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg, rgba(239,246,255,0.92), rgba(219,234,254,0.88));z-index:1;pointer-events:none;">
                            <span style="width:18px;height:18px;border:2px solid rgba(14,165,233,0.22);border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite;"></span>
                        </span>
                        <img src="${src}" alt="${label} ${idx + 1}" loading="lazy" decoding="async" fetchpriority="low" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.2s ease;" onclick="openMaintenancePhotoViewer('${request._id}', ${idx}, '${source}', '${photoType}')" onload="handlePropertyManagementMaintenancePhotoLoad(this)" onerror="handlePropertyManagementMaintenancePhotoLoad(this)">
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    return [
        beforePhotos.length ? renderThumbs(beforePhotos, 'before', 'Request Photos') : '',
        afterPhotos.length ? renderThumbs(afterPhotos, 'after', 'After Photos') : ''
    ].join('');
}

function handlePropertyManagementMaintenancePhotoLoad(imageElement) {
    const thumb = imageElement?.closest('.maintenance-photo-thumb-loading');
    if (!thumb) return;
    const overlay = thumb.querySelector('.maintenance-photo-thumb-overlay');
    if (overlay) overlay.style.display = 'none';
    imageElement.style.opacity = '1';
}

function getMaintenancePhotoSourceItems(source = 'property') {
    return source === 'portfolio' ? (state.portfolioMaintenance || []) : (state.maintenanceRequests || []);
}

function hydrateMaintenancePhotoGalleries(source = 'property', startIndex = 0, batchSize = 3) {
    const galleryNodes = Array.from(document.querySelectorAll(`[data-maint-photo-gallery="true"][data-source="${source}"]`));
    const isPortfolio = source === 'portfolio';

    if (!galleryNodes.length) {
        if (isPortfolio) {
            portfolioMaintenancePhotoHydrationComplete = true;
            portfolioMaintenancePhotoHydrationStarted = false;
        } else {
            propertyMaintenancePhotoHydrationComplete = true;
            propertyMaintenancePhotoHydrationStarted = false;
        }
        return;
    }

    const itemsById = new Map(getMaintenancePhotoSourceItems(source).map(item => [String(item?._id || ''), item]));
    const currentBatch = galleryNodes.slice(startIndex, startIndex + batchSize);
    currentBatch.forEach(node => {
        const requestId = String(node.getAttribute('data-request-id') || '');
        const item = itemsById.get(requestId);
        if (item) {
            node.innerHTML = renderMaintenancePhotoGalleryContent(item, source);
        }
    });

    const nextIndex = startIndex + batchSize;
    if (nextIndex >= galleryNodes.length) {
        if (isPortfolio) {
            portfolioMaintenancePhotoHydrationComplete = true;
            portfolioMaintenancePhotoHydrationStarted = false;
        } else {
            propertyMaintenancePhotoHydrationComplete = true;
            propertyMaintenancePhotoHydrationStarted = false;
        }
        return;
    }

    window.requestAnimationFrame(() => hydrateMaintenancePhotoGalleries(source, nextIndex, batchSize));
}

function scheduleMaintenancePhotoHydration(source = 'property') {
    const isPortfolio = source === 'portfolio';
    const isStarted = isPortfolio ? portfolioMaintenancePhotoHydrationStarted : propertyMaintenancePhotoHydrationStarted;
    const isComplete = isPortfolio ? portfolioMaintenancePhotoHydrationComplete : propertyMaintenancePhotoHydrationComplete;
    const items = getMaintenancePhotoSourceItems(source);

    if (isStarted || isComplete || !Array.isArray(items) || !items.length) {
        return;
    }

    if (isPortfolio) {
        portfolioMaintenancePhotoHydrationStarted = true;
    } else {
        propertyMaintenancePhotoHydrationStarted = true;
    }

    runWhenIdle(() => {
        window.requestAnimationFrame(() => hydrateMaintenancePhotoGalleries(source, 0, 3));
    });
}

function renderMaintenanceRequestsList(requests) {
    requests = propertyRecordPage('maintenanceList', requests || [], applyPropertyMaintenanceFilters, state.highlightMaintenanceId);
  const maintenanceList = document.getElementById('maintenanceList');
  if (!maintenanceList) return;

  if (!requests.length) {
    maintenanceList.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:32px;">
        <i class="fas fa-tools" style="font-size:2.2em;color:#3498db;margin-bottom:12px;"></i>
        <p style="font-size:1.1em;color:#888;">No maintenance requests found.</p>
      </div>
    `;
    return;
  }

  maintenanceList.innerHTML = `
        <div class="maintenance-scroll-table">
            <table class="maintenance-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);margin-bottom:0;">
        <thead>
          <tr style="background:#f6fafd;">
                        <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Title</th>
                        <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Description</th>
                        <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Priority</th>
                        <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Unit</th>
                                                <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Workflow</th>
                                                <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Assigned</th>
                                                <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Scheduled</th>
                                                <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Cost</th>
                                                <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Status</th>
                        <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Created</th>
                        <th style="padding:9px 8px;font-weight:600;color:#2980b9;">Actions</th>
          </tr>
        </thead>
        <tbody>
                    ${requests.map(request => renderPropertyMaintenanceRequestListRow(request)).join('')}
        </tbody>
      </table>
    </div>
  `;

    // If we navigated here from the global overview, focus the selected request
    focusMaintenanceRequest();
}

// Update the renderMaintenanceRequests function
function renderMaintenanceRequests(requests = getFilteredPropertyMaintenanceItems('requests')) {
    requests = propertyRecordPage('maintenanceList', requests || [], applyPropertyMaintenanceFilters, state.highlightMaintenanceId);
  const maintenanceList = document.getElementById('maintenanceList');
    if (!requests?.length) {
    maintenanceList.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:32px;">
        <i class="fas fa-tools" style="font-size:2.2em;color:#3498db;margin-bottom:12px;"></i>
                <p style="font-size:1em;color:#888;">No maintenance requests match the current filters.</p>
      </div>
    `;
    return;
  }

    maintenanceList.innerHTML = requests.map(request => {
    // Find the associated unit
    const unit = typeof request.unitId === 'object' ? request.unitId : 
      state.units.find(u => u._id === request.unitId);
        const workflowStage = getMaintenanceWorkflowStage(request);
        const workflowLabel = getMaintenanceWorkflowStageLabel(workflowStage);
        const accessNotes = String(request.accessNotes || '').trim();
        const costLabel = formatMaintenanceCost(request.cost, 'Not logged');

    // Format creation date
    const createdDate = new Date(request.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    // Priority badge
    const priorityBadge = `<span class="badge badge-info" style="background:#fff3cd;color:#856404;padding:2px 10px;border-radius:10px;font-size:0.92em;">
      <i class="fas fa-exclamation-circle"></i> ${request.priority.charAt(0).toUpperCase() + request.priority.slice(1)} Priority
    </span>`;

    // Status badge with icon
    let statusIcon = '<i class="fas fa-clock"></i>';
    if (request.status === 'completed') statusIcon = '<i class="fas fa-check-circle"></i>';
    else if (request.status === 'in-progress') statusIcon = '<i class="fas fa-spinner"></i>';
    const statusBadge = `<span class="status-badge ${request.status}" style="padding:4px 12px;border-radius:15px;font-size:0.82em;font-weight:600;">
      ${statusIcon} ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
    </span>`;
        const workflowBadge = `<span class="badge badge-info" style="background:#ecfeff;color:#155e75;padding:2px 10px;border-radius:10px;font-size:0.92em;">
            <i class="fas fa-diagram-project"></i> ${workflowLabel}
        </span>`;

    // --- Make description stand out ---
        const descriptionHtml = renderMaintenanceDescriptionPanel(request.description);

        const savingIndicator = getPropertyMaintenanceSavingIndicator(request._id, 'card');
        return `
            <div class="maintenance-card compact-maintenance-card" data-maint-id="${request._id}" style="position:relative;border:1.5px solid #e1e8ed;box-shadow:0 2px 8px rgba(44,62,80,0.07);margin-bottom:12px;font-size:0.93em;border-radius:8px;">
        ${savingIndicator}
        <div class="maintenance-header" style="padding:10px 14px;border-bottom:1px solid #e1e8ed;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:1.08em;color:#2c3e50;"><i class="fas fa-tools" style="color:#217dbb;margin-right:8px;"></i>${request.title}</strong>
            <span style="margin-left:12px;">${priorityBadge}</span>
                        <span style="margin-left:8px;">${workflowBadge}</span>
          </div>
          <div class="maintenance-actions">
                        <button onclick="openMaintenanceEstimate('${request._id}', '${state.currentProperty?._id || ''}', 'property')" class="btn-secondary" style="margin-right:6px;">
                            <i class="fas fa-arrow-up-right-from-square"></i> Estimate
                        </button>
            <button onclick="editMaintenance('${request._id}')" class="btn-secondary" style="margin-right:6px;">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button onclick="deleteMaintenance('${request._id}')" class="btn-icon delete-btn" title="Delete Request" style="font-size:0.97em;">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="maintenance-content" style="padding:10px 14px;">
                <div class="compact-maintenance-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;align-items:start;">
            <div class="compact-maintenance-panel" style="max-height:400px;overflow-y:auto;padding-right:4px;">
              ${descriptionHtml}
              <div style="margin-bottom:8px;"><strong><i class="fas fa-calendar-alt"></i> Created:</strong> <span style="color:#217dbb;">${createdDate}</span></div>
              <div style="margin-bottom:8px;"><strong><i class="fas fa-dollar-sign"></i> Cost:</strong> <span style="color:#0f172a;">${costLabel}</span></div>
              <div style="margin-bottom:8px;"><strong><i class="fas fa-info-circle"></i> Status:</strong> ${statusBadge}</div>
                            ${accessNotes ? `<div style="margin-bottom:8px;"><strong><i class="fas fa-key"></i> Access:</strong> <span style="color:#475569;white-space:pre-line;">${accessNotes}</span></div>` : ''}
                            <div style="margin-bottom:8px;"> ${unit ? `<i class="fas fa-door-open"></i> Unit ${unit.number}` : '<span style="color:#888;font-size:0.97em;"><i class="fas fa-door-closed"></i> None</span>'}</div>
                            ${renderMaintenanceInlineEditor(request)}
                            
                            ${renderMaintenancePhotoGallery(request)}
            </div>
                        <div class="maintenance-thread compact-maintenance-thread" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#f8fafc;display:grid;gap:6px;">
                                <div style="font-weight:700;color:#0f172a;font-size:0.88rem;margin-bottom:6px;"><i class="fas fa-comments" style="color:#2563eb;margin-right:6px;"></i>Maintenance Chat / Updates</div>
                                <div class="maintenance-thread-messages" style="display:grid;gap:6px;margin-bottom:6px;max-height:220px;overflow-y:auto;padding-right:4px;align-content:start;scrollbar-width: none;">
                                    ${Array.isArray(request.updates) && request.updates.length ? request.updates.map(update => `
                                        <div style="padding:8px 10px;border-radius:8px;border:1px solid ${update.authorRole === 'tenant' ? '#bfdbfe' : '#d1fae5'};background:${update.authorRole === 'tenant' ? '#eff6ff' : '#ecfdf5'};">
                                            <div style="font-weight:700;font-size:0.8rem;color:#0f172a;">${update.authorName || update.authorRole || 'Update'} <span style="font-weight:500;color:#64748b;">${update.createdAt ? new Date(update.createdAt).toLocaleString() : ''}</span></div>
                                            <div style="font-size:0.84rem;color:#475569;margin-top:3px;white-space:pre-line;">${update.text || ''}</div>
                                        </div>
                                    `).join('') : '<div style="font-size:0.84rem;color:#64748b;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#fff;">No chat updates yet.</div>'}
                                </div>
                                <form onsubmit="sendManagerMaintenanceMessage(event, '${request._id}')" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;">
                                    <input name="message" type="text" maxlength="1200" placeholder="Reply to tenant or add office update" style="border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;background:#fff;">
                                    <button type="submit" class="btn-secondary"><i class="fas fa-paper-plane"></i> Send</button>
                                </form>
                        </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

    // If we navigated here from the global overview, focus the selected request
    focusMaintenanceRequest();
        scheduleMaintenancePhotoHydration('property');
}

function focusMaintenanceRequest() {
    try {
        const targetId = state.highlightMaintenanceId;
        if (!targetId) return;
        const el = document.querySelector(`[data-maint-id="${targetId}"]`);
        if (!el) {
            state.highlightMaintenanceId = null;
            return;
        }
        el.classList.add('maintenance-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            el.classList.remove('maintenance-highlight');
        }, 2200);
        state.highlightMaintenanceId = null;
    } catch (_) {
        state.highlightMaintenanceId = null;
    }
}

function focusMaintenanceSchedule() {
    try {
        const targetId = state.highlightMaintenanceScheduleId;
        if (!targetId) return;
        const el = document.querySelector(`[data-maint-schedule-id="${targetId}"]`);
        if (!el) {
            state.highlightMaintenanceScheduleId = null;
            return;
        }
        el.classList.add('maintenance-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            el.classList.remove('maintenance-highlight');
        }, 2200);
        state.highlightMaintenanceScheduleId = null;
    } catch (_) {
        state.highlightMaintenanceScheduleId = null;
    }
}

async function updateMaintenanceInlineFields(projectId, requestId, payload, options = {}) {
    const { refreshProperty = true, refreshPortfolio = true, refreshOverview = false } = options;
    const response = await fetch(`${API_URL}/properties/${projectId}/maintenance/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error('Failed to update maintenance request');
    }
    const updatedRequest = await response.json();

    if (Array.isArray(state.maintenanceRequests)) {
        state.maintenanceRequests = state.maintenanceRequests.map(item =>
            String(item._id) === String(requestId) ? updatedRequest : item
        );
    }
    if (Array.isArray(state.portfolioMaintenance)) {
        state.portfolioMaintenance = state.portfolioMaintenance.map(item =>
            String(item._id) === String(requestId) ? { ...item, ...updatedRequest } : item
        );
    }

    if (refreshProperty && state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
            refreshPropertyMaintenanceView();
    }
    if (refreshPortfolio) {
        try {
            await refreshPortfolioMaintenanceItem(requestId, 'request');
        } catch (error) {
            console.warn('Error refreshing portfolio maintenance after inline update:', error);
        }
    }
    if (refreshOverview) {
        await renderGlobalMaintenanceOverview(false);
    }

    return updatedRequest;
}

// Add before the window exports

async function deleteMaintenance(requestId) {
    if (!confirm('Are you sure you want to delete this maintenance request?')) {
        return;
    }
     showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/maintenance/${requestId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete maintenance request');

    invalidateCache('maintenance');
    await refreshContent('maintenance');
        showNotification('Maintenance request deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting maintenance request:', error);
        showNotification('Error deleting maintenance request', 'error');
            } finally {
        hideLoader();
    }
}

function openMaintenanceEstimate(requestId, projectId = '', source = 'property') {
    const sourceItems = source === 'portfolio'
        ? (state.portfolioMaintenance || [])
        : (source === 'overview' ? (globalMaintenanceOverviewState.requests || []) : (state.maintenanceRequests || []));
    const request = sourceItems.find(item => String(item._id) === String(requestId));
    const resolvedProjectId = projectId || state.currentProperty?._id || request?.projectId?._id || request?.projectId || '';
    const estimateId = request?.linkedEstimateId || '';
    const lineItemId = request?.linkedEstimateItemId || '';
    if (!resolvedProjectId || !estimateId) {
        showNotification('No linked estimate was found for this maintenance request', 'error');
        return;
    }

    const params = new URLSearchParams({ projectId: String(resolvedProjectId), estimateId: String(estimateId) });
    if (lineItemId) {
        params.set('lineItemId', String(lineItemId));
    }
    window.location.href = `/estimate-edit.html?${params.toString()}`;
}

function getRecurringMaintenanceEstimateLink(schedule, projectId = '') {
    if (!schedule) return null;
    const resolvedProjectId = projectId || schedule.projectId?._id || schedule.projectId || state.currentProperty?._id || '';
    const estimateId = schedule.linkedEstimateId || schedule.estimateId || '';
    const lineItemId = schedule.linkedEstimateItemId || schedule.lineItemId || '';
    if (!resolvedProjectId || !estimateId) return null;
    return {
        projectId: String(resolvedProjectId),
        estimateId: String(estimateId),
        lineItemId: lineItemId ? String(lineItemId) : ''
    };
}

function syncRecurringMaintenanceScheduleState(updatedSchedule) {
    if (!updatedSchedule?._id) return;
    state.maintenanceSchedules = (state.maintenanceSchedules || []).map(item =>
        String(item._id) === String(updatedSchedule._id) ? { ...item, ...updatedSchedule } : item
    );
    state.portfolioRecurringMaintenance = (state.portfolioRecurringMaintenance || []).map(item =>
        String(item._id) === String(updatedSchedule._id) ? { ...item, ...updatedSchedule } : item
    );
    window.lastLoadedSchedules = state.maintenanceSchedules;
}

async function openRecurringMaintenanceEstimate(scheduleId, projectId = '', source = 'property') {
    const sourceItems = source === 'portfolio'
        ? (state.portfolioRecurringMaintenance || [])
        : (source === 'overview' ? (globalMaintenanceOverviewState.schedules || []) : (state.maintenanceSchedules || []));
    let schedule = sourceItems.find(item => String(item._id) === String(scheduleId));
    const resolvedProjectId = projectId || schedule?.projectId?._id || schedule?.projectId || state.currentProperty?._id || '';
    let estimateLink = getRecurringMaintenanceEstimateLink(schedule, resolvedProjectId);
    if (!estimateLink) {
        if (!scheduleId || !resolvedProjectId) {
            showNotification('No linked estimate was found for this recurring maintenance item', 'error');
            return;
        }
        showLoader();
        try {
            const response = await fetch(`${API_URL}/properties/${resolvedProjectId}/maintenance-schedules/${scheduleId}/estimate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.message || 'Failed to create recurring maintenance estimate');
            }
            if (result.schedule) {
                syncRecurringMaintenanceScheduleState(result.schedule);
                schedule = result.schedule;
            }
            estimateLink = getRecurringMaintenanceEstimateLink(schedule, resolvedProjectId) || {
                projectId: String(resolvedProjectId),
                estimateId: String(result.estimateId || ''),
                lineItemId: result.lineItemId ? String(result.lineItemId) : ''
            };
        } catch (error) {
            console.error('Error creating recurring maintenance estimate:', error);
            showNotification(error.message || 'Could not create recurring maintenance estimate', 'error');
            return;
        } finally {
            hideLoader();
        }
    }

    if (!estimateLink?.estimateId) {
        showNotification('No linked estimate was found for this recurring maintenance item', 'error');
        return;
    }

    const params = new URLSearchParams({
        projectId: estimateLink.projectId,
        estimateId: estimateLink.estimateId
    });
    if (estimateLink.lineItemId) {
        params.set('lineItemId', estimateLink.lineItemId);
    }
    window.location.href = `/estimate-edit.html?${params.toString()}`;
}

async function ensureVendorInvitedToProject(vendorId, projectId) {
    const normalizedVendorId = String(vendorId || '').trim();
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedVendorId || !normalizedProjectId) return;

    const vendorFallback = window.vendorMap?.[normalizedVendorId]
        || (Array.isArray(state.vendors) ? state.vendors.find(item => String(item?._id || '') === normalizedVendorId) : null)
        || null;
    const vendorResponse = await fetch(`/api/vendors/${normalizedVendorId}`);
    const vendorDetails = vendorResponse.ok ? await vendorResponse.json() : vendorFallback;
    const vendorIsInvited = Array.isArray(vendorDetails?.assignedProjects)
        && vendorDetails.assignedProjects.some((entry) => String(entry?.projectId?._id || entry?.projectId || '') === normalizedProjectId);
    if (vendorIsInvited) return;

    const inviteResponse = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            emails: [vendorDetails?.email || vendorFallback?.email || ''],
            role: 'vendor',
            projectId: normalizedProjectId
        })
    });
    if (!inviteResponse.ok) {
        throw new Error('Failed to invite vendor to this project.');
    }
}

async function sendManagerMaintenanceMessage(event, requestId) {
    event.preventDefault();
    if (!state.currentProperty?._id || !requestId) return;
    const input = event.currentTarget.querySelector('input[name="message"]');
    const text = (input?.value || '').trim();
    if (!text) {
        showNotification('Type a maintenance update first', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/maintenance/${requestId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                authorName: localStorage.getItem('managerName') || localStorage.getItem('userName') || 'Management'
            })
        });
        if (!response.ok) throw new Error('Failed to send update');
        input.value = '';
        invalidateCache('maintenance');
        await loadMaintenanceRequests(state.currentProperty._id, true);
        showNotification('Maintenance update sent to tenant portal', 'success');
    } catch (error) {
        console.error('Error sending maintenance update:', error);
        showNotification('Error sending maintenance update', 'error');
    }
}

async function editPortfolioMaintenance(requestId, projectId) {
    if (!requestId || !projectId) return;
    try {
        const request = (state.portfolioMaintenance || []).find(item => String(item._id) === String(requestId));
        if (!request) {
            showNotification('Could not find maintenance request', 'error');
            return;
        }
        await editMaintenance(requestId, {
            projectId,
            request,
            source: 'portfolio'
        });
    } catch (error) {
        console.error('Error opening portfolio maintenance request:', error);
        showNotification('Could not open maintenance request', 'error');
    }
}

async function deletePortfolioMaintenance(requestId, projectId) {
    if (!requestId || !projectId) return;
    if (!confirm('Are you sure you want to delete this maintenance request?')) {
        return;
    }
    showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${projectId}/maintenance/${requestId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete maintenance request');

        state.portfolioMaintenance = (state.portfolioMaintenance || []).filter(item => String(item._id) !== String(requestId));
        if (state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
            invalidateCache('maintenance');
            await refreshContent('maintenance');
        }
        await renderPortfolioOverview();
        renderPortfolioDetails('maintenance');
        showNotification('Maintenance request deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting portfolio maintenance request:', error);
        showNotification('Error deleting maintenance request', 'error');
    } finally {
        hideLoader();
    }
}

async function sendPortfolioMaintenanceMessage(event, requestId, projectId) {
    event.preventDefault();
    if (!requestId || !projectId) return;
    const input = event.currentTarget.querySelector('input[name="message"]');
    const text = (input?.value || '').trim();
    if (!text) {
        showNotification('Type a maintenance update first', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/properties/${projectId}/maintenance/${requestId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                authorName: localStorage.getItem('managerName') || localStorage.getItem('userName') || 'Management'
            })
        });
        if (!response.ok) throw new Error('Failed to send update');
        const data = await response.json();
        input.value = '';
        state.portfolioMaintenance = (state.portfolioMaintenance || []).map(item =>
            String(item._id) === String(requestId)
                ? { ...item, ...(data.request || {}), updates: data.updates || data.request?.updates || item.updates }
                : item
        );
        if (state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
            invalidateCache('maintenance');
            await loadMaintenanceRequests(projectId, true);
        }
        await renderPortfolioOverview();
        renderPortfolioDetails('maintenance');
        showNotification('Maintenance update sent to tenant portal', 'success');
    } catch (error) {
        console.error('Error sending portfolio maintenance update:', error);
        showNotification('Error sending maintenance update', 'error');
    }
}

async function openPortfolioRecurringMaintenance(scheduleId, projectId) {
    if (!scheduleId || !projectId) return;
    try {
        state.highlightMaintenanceScheduleId = scheduleId;
        await selectProperty(projectId);
        document.querySelector('.tab-btn[data-tab="maintenance"]')?.click();
        document.getElementById('recurringMaintenanceTab')?.click();
    } catch (error) {
        console.error('Error opening recurring maintenance schedule:', error);
        showNotification('Could not open recurring maintenance view', 'error');
    }
}

async function editPortfolioRecurringMaintenance(scheduleId, projectId) {
    if (!scheduleId || !projectId) return;
    try {
        const schedule = (state.portfolioRecurringMaintenance || []).find(item => String(item._id) === String(scheduleId));
        if (!schedule) {
            showNotification('Could not find recurring maintenance schedule', 'error');
            return;
        }
        await editMaintenanceSchedule(scheduleId, {
            projectId,
            schedule,
            source: 'portfolio'
        });
    } catch (error) {
        console.error('Error opening recurring maintenance schedule editor:', error);
        showNotification('Could not open recurring maintenance editor', 'error');
    }
}

async function updatePortfolioRecurringMaintenanceSchedule(scheduleId, projectId, updates = {}, options = {}) {
    const schedule = (state.portfolioRecurringMaintenance || []).find(item => String(item._id) === String(scheduleId));
    if (!schedule || !projectId) {
        throw new Error('Recurring maintenance schedule not found');
    }

    const unitId = schedule.unitId && (schedule.unitId._id || schedule.unitId);
    const assignedVendorId = schedule.assignedVendor && (schedule.assignedVendor._id || schedule.assignedVendor);
    const payload = {
        title: schedule.title || '',
        description: schedule.description || '',
        frequency: schedule.frequency || 'monthly',
        intervalDays: schedule.frequency === 'custom' ? Number(schedule.intervalDays) || null : null,
        startDate: getRecurringMaintenanceDisplayDate(schedule) ? String(getRecurringMaintenanceDisplayDate(schedule)).substring(0, 10) : '',
        assignedVendor: assignedVendorId || null,
        unitId: unitId || null,
        status: schedule.status || 'pending',
        cost: Number.isFinite(Number(schedule.cost)) ? Number(schedule.cost) : 0,
        expectedNextScheduledDate: schedule.nextScheduledDate,
        ...updates
    };

    const nextAssignedVendorId = String(payload.assignedVendor || '').trim();
    const currentAssignedVendorId = String(assignedVendorId || '').trim();
    if (nextAssignedVendorId && nextAssignedVendorId !== currentAssignedVendorId) {
        await ensureVendorInvitedToProject(nextAssignedVendorId, projectId);
    }

    const response = await fetch(`${API_URL}/properties/${projectId}/maintenance-schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error('Failed to update recurring maintenance schedule');
    }

    const updatedSchedule = await response.json();
    state.portfolioRecurringMaintenance = (state.portfolioRecurringMaintenance || []).map(item =>
        String(item._id) === String(scheduleId) ? updatedSchedule : item
    );

    if (state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
            state.maintenanceSchedules = (state.maintenanceSchedules || []).map(item =>
                String(item._id) === String(scheduleId) ? updatedSchedule : item
            );
            window.lastLoadedSchedules = state.maintenanceSchedules;
            refreshPropertyMaintenanceView();
    }

    if (options.refreshPortfolio !== false) {
        await refreshPortfolioMaintenanceItem(scheduleId, 'recurring');
    }

    return updatedSchedule;
}

async function updateMaintenanceStatus(requestId) {
    try {
        const request = state.maintenanceRequests.find(r => r._id === requestId);
        if (!request) throw new Error('Maintenance request not found');

        // Wait for user to select a status (no loader here)
        const newStatus = await showStatusDialog(request.status);
        if (!newStatus) return; // User cancelled

        showLoader(); // Only show loader for the network request
        const response = await fetch(
            `${API_URL}/properties/${state.currentProperty._id}/maintenance/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            }
        );

        if (!response.ok) throw new Error('Failed to update maintenance status');
        
    invalidateCache('maintenance');
    await refreshContent('maintenance');
        showNotification('Maintenance status updated successfully', 'success');
    } catch (error) {
        console.error('Error updating maintenance status:', error);
        showNotification('Error updating maintenance status', 'error');
    } finally {
        hideLoader();
    }
}

// Full edit (all fields + photos append)
async function editMaintenance(requestId, options = {}) {
        try {
        const projectId = options.projectId || state.currentProperty?._id;
        const request = options.request || state.maintenanceRequests.find(r => r._id === requestId) || (state.portfolioMaintenance || []).find(r => r._id === requestId);
                if (!request) throw new Error('Maintenance request not found');
        if (!projectId) throw new Error('Property context is required');

                let modal = document.getElementById('editMaintenanceModal');
                if (!modal) {
                        const html = `
                        <div class="modal" id="editMaintenanceModal" style="display:none;">
                            <div class="modal-content">
                                <h2>Edit Maintenance Request</h2>
                                <form id="editMaintenanceForm">
                                    <div class="form-group">
                                        <label>Title</label>
                                        <input type="text" id="editMaintenanceTitle" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Description</label>
                                        <textarea id="editMaintenanceDescription" required style="min-height:110px;"></textarea>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label>Priority</label>
                                            <select id="editMaintenancePriority" required>
                                                <option value="urgent">Urgent</option>
                                                <option value="high">High</option>
                                                <option value="medium">Medium</option>
                                                <option value="low">Low</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label>Workflow Stage</label>
                                            <select id="editMaintenanceWorkflowStage" required>
                                                <option value="new">New</option>
                                                <option value="scheduled">Scheduled</option>
                                                <option value="waiting">Waiting</option>
                                                <option value="in-progress">In Progress</option>
                                                <option value="completed">Completed</option>
                                                <option value="closed">Closed</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label>Unit</label>
                                            <select id="editMaintenanceUnit"><option value="">None</option></select>
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label>Status</label>
                                            <select id="editMaintenanceStatus" required>
                                                <option value="pending">Pending</option>
                                                <option value="in-progress">In Progress</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label>Assign Vendor</label>
                                            <div class="maintenance-vendor-combobox" data-placeholder="Search vendor" data-empty-label="Unassigned" style="position:relative;">
                                                <input type="hidden" id="editMaintenanceVendor" value="">
                                                <input type="text" class="maintenance-vendor-search-input" placeholder="Search vendor" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;">
                                                <div class="maintenance-vendor-suggestion-box" hidden style="position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:220px;overflow-y:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,0.14);z-index:60;padding:4px;"></div>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Scheduled For</label>
                                            <input type="datetime-local" id="editMaintenanceScheduledFor">
                                        </div>
                                        <div class="form-group">
                                            <label>Cost</label>
                                            <input type="number" id="editMaintenanceCost" min="0" step="0.01" placeholder="0.00">
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label>Access Notes</label>
                                        <textarea id="editMaintenanceAccessNotes" style="min-height:82px;" placeholder="Gate codes, permission to enter, pet instructions, preferred contact window"></textarea>
                                    </div>
                                    <div class="form-group">
                                        <label>Photos (add more)</label>
                                        <input type="file" id="editMaintenancePhotos" multiple accept="image/*">
                                    </div>
                                    <div id="existingMaintenancePhotos" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;"></div>
                                    <div style="font-size:0.82rem;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:#92400e;margin:6px 0 4px;">After Photos</div>
                                    <div id="existingMaintenanceAfterPhotos" style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;"></div>
                                    <div class="modal-buttons">
                                        <button type="button" id="cancelEditMaintenanceBtn" class="btn-secondary">Cancel</button>
                                        <button type="submit" class="btn-primary">Save Changes</button>
                                    </div>
                                </form>
                            </div>
                        </div>`;
                        document.body.insertAdjacentHTML('beforeend', html);
                        modal = document.getElementById('editMaintenanceModal');
                }

                // Populate fields
                document.getElementById('editMaintenanceTitle').value = request.title || '';
                document.getElementById('editMaintenanceDescription').value = request.description || '';
                document.getElementById('editMaintenancePriority').value = request.priority || 'medium';
                document.getElementById('editMaintenanceStatus').value = request.status || 'pending';
                document.getElementById('editMaintenanceWorkflowStage').value = getMaintenanceWorkflowStage(request);
                document.getElementById('editMaintenanceScheduledFor').value = formatMaintenanceDateTimeInput(request.scheduledFor);
                document.getElementById('editMaintenanceCost').value = Number.isFinite(Number(request.cost)) ? Number(request.cost) : '';
                document.getElementById('editMaintenanceAccessNotes').value = request.accessNotes || '';
                const currentAssignedVendorId = request.assignedVendor && (request.assignedVendor._id || request.assignedVendor);
                await populateMaintenanceVendorSelect('editMaintenanceVendor', currentAssignedVendorId, {
                    emptyLabel: 'Unassigned',
                    placeholder: 'Search vendor'
                });

                // Units
                const unitSelect = document.getElementById('editMaintenanceUnit');
                if (unitSelect) {
                        const currentId = request.unitId && (request.unitId._id || request.unitId);
                    unitSelect.innerHTML = `<option value="">None</option>` + getUnitsForPropertyId(projectId)
                            .map(u => `<option value="${u._id}" ${currentId === u._id ? 'selected' : ''}>Unit ${u.number}</option>`)
                            .join('');
                }

                                // Existing photos preview with remove controls
                                const existing = document.getElementById('existingMaintenancePhotos');
                                const existingAfter = document.getElementById('existingMaintenanceAfterPhotos');
                                const photos = request.photos || [];
                                const afterPhotos = request.afterPhotos || [];
                                const thumbStyle = 'position:relative;display:inline-block;width:72px;height:72px;border-radius:6px;overflow:hidden;box-shadow:0 0 4px rgba(0,0,0,0.15);';
                                const closeStyle = 'position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;line-height:18px;text-align:center;cursor:pointer;';
                                existing.innerHTML = photos.length ? photos.map(p => `
                                    <div class="maint-thumb" data-url="${p}" style="${thumbStyle}">
                                        <img src="${p}" style="width:100%;height:100%;object-fit:cover;">
                                        <button type="button" class="thumb-remove" title="Remove" style="${closeStyle}">×</button>
                                    </div>
                                `).join('') : '<em style="color:#888;">No photos yet.</em>';
                                if (existingAfter) {
                                    existingAfter.innerHTML = afterPhotos.length ? afterPhotos.map((p, idx) => `
                                        <div class="maint-thumb" data-url="${p}" style="${thumbStyle}">
                                            <img src="${p}" alt="After photo ${idx + 1}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="openMaintenancePhotoViewer('${request._id}', ${idx}, '${options.source || 'property'}', 'after')">
                                        </div>
                                    `).join('') : '<em style="color:#888;">No after photos yet.</em>';
                                }
                                existing.querySelectorAll('.thumb-remove').forEach(btn => {
                                    btn.addEventListener('click', (e) => {
                                        const wrap = e.currentTarget.closest('.maint-thumb');
                                        const url = wrap?.getAttribute('data-url');
                                        if (!url) return;
                                        if (!confirm('Delete this photo permanently?')) return;
                                        (async () => {
                                            const useItemLoader = options.source === 'portfolio';
                                            try {
                                                if (useItemLoader) {
                                                    setPortfolioMaintenanceItemSaving(requestId, 'request', true);
                                                } else {
                                                    showLoader();
                                                }
                                                const resp = await fetch(`${API_URL}/properties/${projectId}/maintenance/${requestId}/photos`, {
                                                    method: 'DELETE',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ url })
                                                });
                                                if (!resp.ok) throw new Error('Failed to delete photo');
                                                wrap.remove();
                                                const idx = (request.photos || []).indexOf(url);
                                                if (idx >= 0) request.photos.splice(idx, 1);
                                                state.portfolioMaintenance = (state.portfolioMaintenance || []).map(item => {
                                                    if (String(item._id) !== String(requestId)) return item;
                                                    return { ...item, photos: (item.photos || []).filter(photoUrl => photoUrl !== url) };
                                                });
                                                showNotification('Photo deleted', 'success');
                                                // Refresh global list so cards reflect changes immediately
                                                try {
                                                    if (state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
                                                        invalidateCache('maintenance');
                                                        await refreshContent('maintenance');
                                                    }
                                                    if (options.source === 'portfolio') {
                                                        await refreshPortfolioMaintenanceItem(requestId, 'request');
                                                    }
                                                } catch {}
                                            } catch (err) {
                                                console.error('Photo delete error:', err);
                                                showNotification(err.message || 'Error deleting photo', 'error');
                                            } finally {
                                                if (useItemLoader) {
                                                    setPortfolioMaintenanceItemSaving(requestId, 'request', false);
                                                } else {
                                                    hideLoader();
                                                }
                                            }
                                        })();
                                    });
                                });

                // Show modal as the shared property drawer
                openModal('editMaintenanceModal');

                document.getElementById('cancelEditMaintenanceBtn').onclick = () => {
                        closeModal('editMaintenanceModal');
                };

                const form = document.getElementById('editMaintenanceForm');
                form.dataset.projectId = projectId;
                form.dataset.source = options.source || 'property';
                form.dataset.tempPhotosPaths = JSON.stringify([]);
                form.onsubmit = async (e) => {
                        e.preventDefault();
                        const useItemLoader = options.source === 'portfolio';
                        if (useItemLoader) {
                            setPortfolioMaintenanceItemSaving(requestId, 'request', true);
                        } else {
                            showLoader();
                        }
                        try {
                                const fd = new FormData();
                                fd.append('title', document.getElementById('editMaintenanceTitle').value.trim());
                                fd.append('description', document.getElementById('editMaintenanceDescription').value.trim());
                                fd.append('priority', document.getElementById('editMaintenancePriority').value);
                                fd.append('status', document.getElementById('editMaintenanceStatus').value);
                fd.append('workflowStage', document.getElementById('editMaintenanceWorkflowStage').value);
                                fd.append('unitId', document.getElementById('editMaintenanceUnit').value);
                fd.append('assignedVendor', document.getElementById('editMaintenanceVendor').value);
                fd.append('scheduledFor', document.getElementById('editMaintenanceScheduledFor').value);
                fd.append('cost', document.getElementById('editMaintenanceCost').value);
                fd.append('accessNotes', document.getElementById('editMaintenanceAccessNotes').value.trim());
                                const photoInput = document.getElementById('editMaintenancePhotos');
                                if (photoInput && photoInput.files.length) {
                                        Array.from(photoInput.files).forEach(f => fd.append('photos', f));
                                }
                        // Include any temp-uploaded new photos collected before save
                        const tempNew = form.dataset.tempPhotosPaths ? JSON.parse(form.dataset.tempPhotosPaths) : [];
                        if (tempNew.length) {
                            fd.append('tempPhotosPaths', JSON.stringify(tempNew));
                        }
                                const resp = await fetch(`${API_URL}/properties/${projectId}/maintenance/${requestId}`, {
                                        method: 'PUT',
                                        body: fd
                                });
                                if (!resp.ok) throw new Error('Failed to update maintenance request');
                                const updatedRequest = await resp.json();
                                closeModal('editMaintenanceModal');
                                state.maintenanceRequests = (state.maintenanceRequests || []).map(item => String(item._id) === String(requestId) ? updatedRequest : item);
                                state.portfolioMaintenance = (state.portfolioMaintenance || []).map(item => String(item._id) === String(requestId) ? updatedRequest : item);
                                if (state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
                                        refreshPropertyMaintenanceView();
                                }
                                if (options.source === 'portfolio') {
                                    await refreshPortfolioMaintenanceItem(requestId, 'request');
                                }
                                showNotification('Maintenance request updated', 'success');
                        } catch (err) {
                                console.error('Error updating maintenance request:', err);
                                showNotification(err.message || 'Error updating maintenance', 'error');
                        } finally {
                            if (useItemLoader) {
                                setPortfolioMaintenanceItemSaving(requestId, 'request', false);
                            } else {
                                hideLoader();
                            }
                        }
                };
                // Instant temp upload on new photo selection in edit modal
                const editInput = document.getElementById('editMaintenancePhotos');
                // Avoid attaching duplicate listeners if modal reopened
                if (!modal.dataset.photosListenerAttached && editInput) {
                modal.dataset.photosListenerAttached = 'true';
                editInput.addEventListener('change', async function() {
                    if (!this.files || !this.files.length) return;
                    try {
                        const activeForm = document.getElementById('editMaintenanceForm');
                        const activeProjectId = activeForm?.dataset.projectId || projectId;
                        if (!activeProjectId) throw new Error('Property context is required');
                        const fd = new FormData();
                        Array.from(this.files).forEach(f => fd.append('photos', f));
                        const resp = await fetch(`${API_URL}/properties/${activeProjectId}/maintenance/temp-photos`, { method: 'POST', body: fd });
                        if (!resp.ok) throw new Error('Failed to upload photos');
                        const data = await resp.json();
                        const current = activeForm?.dataset.tempPhotosPaths ? JSON.parse(activeForm.dataset.tempPhotosPaths) : [];
                        const all = Array.from(new Set(current.concat(data.photos || [])));
                        if (activeForm) {
                            activeForm.dataset.tempPhotosPaths = JSON.stringify(all);
                        }
                        // Render appended previews right in the existing section
                        const existing = document.getElementById('existingMaintenancePhotos');
                        const thumbStyle = 'position:relative;display:inline-block;width:72px;height:72px;border-radius:6px;overflow:hidden;box-shadow:0 0 4px rgba(0,0,0,0.15);';
                        const closeStyle = 'position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;line-height:18px;text-align:center;cursor:pointer;';
                        (data.photos || []).forEach(url => {
                            // If placeholder text is present, clear it before adding real thumbnails
                            if (existing && existing.textContent && existing.textContent.includes('No photos yet')) {
                                existing.innerHTML = '';
                            }
                            const wrap = document.createElement('div');
                            wrap.className = 'maint-thumb';
                            wrap.setAttribute('data-url', url);
                            wrap.style = thumbStyle;
                            wrap.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;"><button type="button" class="thumb-remove" title="Remove" style="${closeStyle}">×</button>`;
                            existing.appendChild(wrap);
                            wrap.querySelector('.thumb-remove')?.addEventListener('click', (e) => {
                                if (!confirm('Remove this photo from the update?')) return;
                                const currentForm = document.getElementById('editMaintenanceForm');
                                const list = JSON.parse(currentForm?.dataset.tempPhotosPaths || '[]').filter(p => p !== url);
                                if (currentForm) {
                                    currentForm.dataset.tempPhotosPaths = JSON.stringify(list);
                                }
                                wrap.remove();
                                // No server delete required; these are temp files not yet committed if removed
                            });
                        });
                        this.value = '';
                    } catch (err) {
                        console.error('Temp upload error:', err);
                        showNotification(err.message || 'Error uploading photos', 'error');
                    }
                });
                }
        } catch (error) {
                console.error('Error preparing maintenance edit:', error);
                showNotification('Error loading maintenance request for edit', 'error');
        }
}

// Update the showStatusDialog function
function showStatusDialog(currentStatus) {
    return new Promise(resolve => {
        const statuses = [
            { value: 'pending', icon: 'clock', label: 'Pending' },
            { value: 'in-progress', icon: 'tools', label: 'In Progress' },
            { value: 'completed', icon: 'check-circle', label: 'Completed' }
        ];

        const dialog = document.createElement('div');
        dialog.className = 'modal status-dialog';
        
        dialog.innerHTML = `
            <div class="modal-content">
                <h3>Update Maintenance Status</h3>
                <div class="status-options">
                    ${statuses.map(status => `
                        <button class="status-option ${status.value} ${status.value === currentStatus ? 'active' : ''}"
                                onclick="updateStatus('${status.value}')">
                            <i class="fas fa-${status.icon}"></i>
                            ${status.label}
                            ${status.value === currentStatus ? 
                                '<i class="fas fa-check" style="margin-left: auto"></i>' : 
                                ''}
                        </button>
                    `).join('')}
                </div>
                <div class="dialog-footer">
                    <button onclick="cancelStatusUpdate()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        dialog.classList.add('property-drawer-open');
        dialog.style.display = 'flex';
        dialog.setAttribute('aria-hidden', 'false');
        document.body.classList.add('property-drawer-lock');

        // Close dialog if clicking outside
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                cancelStatusUpdate();
            }
        });

        window.updateStatus = (status) => {
            dialog.setAttribute('aria-hidden', 'true');
            document.body.removeChild(dialog);
            document.body.classList.remove('property-drawer-lock');
            delete window.updateStatus;
            delete window.cancelStatusUpdate;
            resolve(status);
        };

        window.cancelStatusUpdate = () => {
            dialog.setAttribute('aria-hidden', 'true');
            document.body.removeChild(dialog);
            document.body.classList.remove('property-drawer-lock');
            delete window.updateStatus;
            delete window.cancelStatusUpdate;
            resolve(null);
        };
    });
}

function focusApplication() {
    try {
        const targetId = state.highlightApplicationId;
        if (!targetId) return;
        const row = document.querySelector(`[data-app-id="${targetId}"]`);
        if (!row) {
            state.highlightApplicationId = null;
            return;
        }
        row.classList.add('application-highlight');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            row.classList.remove('application-highlight');
        }, 2200);
        state.highlightApplicationId = null;
    } catch (_) {
        state.highlightApplicationId = null;
    }
}

function initializeMaintenanceScheduleViewToggle() {
        const button = document.getElementById('toggleScheduleViewBtn');
        if (!button || button.dataset.bound === 'true') return;
        button.addEventListener('click', () => {
                if (currentMaintenanceTab === 'schedules') {
                        scheduleListView = !scheduleListView;
                        updatePropertyMaintenanceViewToggle();
            applyPropertyMaintenanceFilters();
                } else {
                        maintenanceRequestListView = !maintenanceRequestListView;
                        updatePropertyMaintenanceViewToggle();
            applyPropertyMaintenanceFilters();
                }
        });
        button.dataset.bound = 'true';
}

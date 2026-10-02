// Property management: maintenance workflow.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getMaintenanceWorkflowStage(request) {
    const rawStage = String(request?.workflowStage || '').trim().toLowerCase();
    const stageMap = {
        submitted: 'new',
        acknowledged: 'new',
        triaged: 'new',
        assigned: 'scheduled',
        'waiting-on-vendor': 'waiting',
        'waiting-on-tenant': 'waiting'
    };
    if (stageMap[rawStage]) return stageMap[rawStage];
    if (rawStage && MAINTENANCE_WORKFLOW_STAGE_OPTIONS.some(([value]) => value === rawStage)) return rawStage;
    if (request && request.status === 'completed') return 'completed';
    if (request && request.status === 'in-progress') return 'in-progress';
    return 'new';
}

function getMaintenanceWorkflowStageLabel(stage) {
    return MAINTENANCE_WORKFLOW_STAGE_OPTIONS.find(([value]) => value === stage)?.[1] || 'New';
}

function formatMaintenanceCost(value, emptyLabel = '—') {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return emptyLabel;
    return amount.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function getMaintenanceVendorId(request) {
    return String(request?.assignedVendor?._id || request?.assignedVendor || '').trim();
}

function getMaintenanceVendorLabel(request) {
    return request?.assignedVendor?.name || request?.assignedTo || 'Unassigned';
}

function getMaintenanceWorkflowOptionsHtml(selectedStage = 'new') {
    return MAINTENANCE_WORKFLOW_STAGE_OPTIONS
        .map(([value, label]) => `<option value="${value}" ${value === selectedStage ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function normalizeMaintenanceVendorLabel(label = '') {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel || normalizedLabel.includes('@')) return '';
    return normalizedLabel;
}



function getMaintenanceVendorDisplayName(vendorId = '', fallbackLabel = '') {
    const normalizedVendorId = String(vendorId || '').trim();
    if (!normalizedVendorId) return '';
    const vendor = (state.vendors || []).find(item => String(item?._id || '') === normalizedVendorId);
    return vendor?.name || normalizeMaintenanceVendorLabel(fallbackLabel) || '';
}

function renderMaintenanceVendorCombobox({
    hiddenId = '',
    hiddenClass = '',
    selectedVendorId = '',
    selectedVendorLabel = '',
    placeholder = 'Search vendor',
    emptyLabel = 'Unassigned',
    inputStyle = 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;'
} = {}) {
    const normalizedVendorId = String(selectedVendorId || '').trim();
    const displayLabel = getMaintenanceVendorDisplayName(normalizedVendorId, selectedVendorLabel);
    const hiddenIdAttr = hiddenId ? ` id="${escapeHtml(hiddenId)}"` : '';
    const hiddenClassAttr = hiddenClass ? ` class="${escapeHtml(hiddenClass)}"` : '';
    return `
        <div class="maintenance-vendor-combobox" data-placeholder="${escapeHtml(placeholder)}" data-empty-label="${escapeHtml(emptyLabel)}" style="position:relative;">
            <input type="hidden"${hiddenIdAttr}${hiddenClassAttr} value="${escapeHtml(normalizedVendorId)}">
            <input type="text" class="maintenance-vendor-search-input" value="${escapeHtml(displayLabel)}" data-selected-label="${escapeHtml(displayLabel)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" style="${inputStyle}">
            <span class="maintenance-vendor-loading-indicator" hidden aria-hidden="true" style="position:absolute;top:50%;right:12px;transform:translateY(-50%);width:14px;height:14px;border:2px solid rgba(37,99,235,0.2);border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite;pointer-events:none;z-index:2;"></span>
            <div class="maintenance-vendor-suggestion-box" hidden style="position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:220px;overflow-y:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 28px rgba(15,23,42,0.14);z-index:60;padding:4px;"></div>
        </div>
    `;
}

function getMaintenanceVendorComboboxParts(target) {
    const wrapper = typeof target === 'string'
        ? document.getElementById(target)?.closest('.maintenance-vendor-combobox')
        : target?.closest?.('.maintenance-vendor-combobox');
    if (!wrapper) return { wrapper: null, hiddenInput: null, textInput: null, menu: null };
    return {
        wrapper,
        hiddenInput: wrapper.querySelector('input[type="hidden"]'),
        textInput: wrapper.querySelector('.maintenance-vendor-search-input'),
        menu: wrapper.querySelector('.maintenance-vendor-suggestion-box'),
        loader: wrapper.querySelector('.maintenance-vendor-loading-indicator')
    };
}

function closeMaintenanceVendorSuggestionBox(wrapper, restoreValue = false) {
    const { textInput, menu } = getMaintenanceVendorComboboxParts(wrapper);
    if (!textInput || !menu) return;
    menu.hidden = true;
    textInput.setAttribute('aria-expanded', 'false');
    wrapper.dataset.activeIndex = '-1';
    if (restoreValue) {
        textInput.value = textInput.dataset.selectedLabel || '';
    }
}

function setMaintenanceVendorComboboxValue(target, vendorId = '', vendorLabel = '') {
    const { wrapper, hiddenInput, textInput } = getMaintenanceVendorComboboxParts(typeof target === 'string' ? document.getElementById(target) : target);
    if (!wrapper || !hiddenInput || !textInput) return;
    const normalizedVendorId = String(vendorId || '').trim();
    const resolvedLabel = getMaintenanceVendorDisplayName(normalizedVendorId, vendorLabel);
    hiddenInput.value = normalizedVendorId;
    textInput.value = resolvedLabel;
    textInput.dataset.selectedLabel = resolvedLabel;
    closeMaintenanceVendorSuggestionBox(wrapper, false);
}

function setMaintenanceVendorComboboxDisabled(target, isDisabled) {
    const { hiddenInput, textInput } = getMaintenanceVendorComboboxParts(target);
    if (hiddenInput) hiddenInput.disabled = !!isDisabled;
    if (textInput) textInput.disabled = !!isDisabled;
}

function setMaintenanceVendorComboboxLoading(target, isLoading) {
    const { wrapper, textInput, loader } = getMaintenanceVendorComboboxParts(target);
    if (!wrapper) return;
    wrapper.dataset.loading = isLoading ? 'true' : 'false';
    if (textInput) {
        textInput.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        textInput.style.paddingRight = isLoading ? '36px' : '';
    }
    if (loader) {
        loader.hidden = !isLoading;
    }
}

function getMaintenanceVendorSuggestionItems(query = '', emptyLabel = 'Unassigned') {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const vendors = (state.vendors || [])
        .slice()
        .sort((left, right) => String(left?.name || left?.email || '').localeCompare(String(right?.name || right?.email || ''), undefined, { sensitivity: 'base' }))
        .filter(vendor => {
            if (!normalizedQuery) return true;
            const name = String(vendor?.name || '').toLowerCase();
            const email = String(vendor?.email || '').toLowerCase();
            return name.includes(normalizedQuery) || email.includes(normalizedQuery);
        })
        .map(vendor => ({
            value: String(vendor?._id || ''),
            label: vendor?.name || 'Vendor',
            meta: ''
        }));
    return [{ value: '', label: emptyLabel, meta: '' }, ...vendors];
}

async function renderMaintenanceVendorSuggestionBox(wrapper, query = '') {
    if (!wrapper) return;
    const { textInput, menu } = getMaintenanceVendorComboboxParts(wrapper);
    if (!textInput || !menu) return;
    if (!Array.isArray(state.vendors) || !state.vendors.length) {
        try {
            await loadMaintenanceVendors();
        } catch (error) {
            console.error('Error loading maintenance vendors:', error);
        }
    }

    const items = getMaintenanceVendorSuggestionItems(query, wrapper.dataset.emptyLabel || 'Unassigned');
    wrapper._maintenanceVendorItems = items;
    wrapper.dataset.activeIndex = items.length ? '0' : '-1';
    menu.innerHTML = items.length
        ? items.map((item, index) => `
            <button type="button" class="maintenance-vendor-option${index === 0 ? ' is-active' : ''}" data-vendor-id="${escapeHtml(item.value)}" data-vendor-label="${escapeHtml(item.label)}" style="width:100%;text-align:left;border:none;background:${index === 0 ? '#eff6ff' : 'transparent'};border-radius:8px;padding:8px 10px;cursor:pointer;display:grid;gap:2px;">
                <span style="font-weight:600;color:#0f172a;">${escapeHtml(item.label)}</span>
                ${item.meta ? `<span style="font-size:0.78rem;color:#64748b;">${escapeHtml(item.meta)}</span>` : ''}
            </button>
        `).join('')
        : '<div class="card-vendor-empty" style="padding:8px 10px;color:#64748b;">No matching vendors</div>';
    menu.hidden = false;
    textInput.setAttribute('aria-expanded', 'true');
}

function setMaintenanceVendorActiveOption(wrapper, nextIndex) {
    const { menu } = getMaintenanceVendorComboboxParts(wrapper);
    const options = Array.from(menu?.querySelectorAll('.maintenance-vendor-option') || []);
    if (!options.length) return;
    const boundedIndex = Math.max(0, Math.min(nextIndex, options.length - 1));
    wrapper.dataset.activeIndex = String(boundedIndex);
    options.forEach((option, index) => {
        const isActive = index === boundedIndex;
        option.classList.toggle('is-active', isActive);
        option.style.background = isActive ? '#eff6ff' : 'transparent';
    });
    options[boundedIndex]?.scrollIntoView({ block: 'nearest' });
}

function commitMaintenanceVendorSelection(wrapper, vendorId, vendorLabel) {
    const { hiddenInput, textInput } = getMaintenanceVendorComboboxParts(wrapper);
    if (!hiddenInput || !textInput) return;
    const normalizedVendorId = String(vendorId || '').trim();
    const resolvedLabel = getMaintenanceVendorDisplayName(normalizedVendorId, vendorLabel);
    const previousValue = String(hiddenInput.value || '');
    hiddenInput.value = normalizedVendorId;
    textInput.value = resolvedLabel;
    textInput.dataset.selectedLabel = resolvedLabel;
    closeMaintenanceVendorSuggestionBox(wrapper, false);
    if (previousValue !== normalizedVendorId) {
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function initializeMaintenanceVendorComboboxes() {
    if (document.body?.dataset.maintenanceVendorComboboxBound === 'true') return;
    document.body.dataset.maintenanceVendorComboboxBound = 'true';

    document.addEventListener('focusin', async (event) => {
        const input = event.target.closest('.maintenance-vendor-search-input');
        if (!input || input.disabled) return;
        await renderMaintenanceVendorSuggestionBox(input.closest('.maintenance-vendor-combobox'), input.value);
    });

    document.addEventListener('input', async (event) => {
        const input = event.target.closest('.maintenance-vendor-search-input');
        if (!input || input.disabled) return;
        await renderMaintenanceVendorSuggestionBox(input.closest('.maintenance-vendor-combobox'), input.value);
    });

    document.addEventListener('keydown', async (event) => {
        const input = event.target.closest('.maintenance-vendor-search-input');
        if (!input || input.disabled) return;
        const wrapper = input.closest('.maintenance-vendor-combobox');
        const { menu } = getMaintenanceVendorComboboxParts(wrapper);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (menu?.hidden) {
                await renderMaintenanceVendorSuggestionBox(wrapper, input.value);
            }
            const currentIndex = Number.parseInt(wrapper.dataset.activeIndex || '-1', 10);
            setMaintenanceVendorActiveOption(wrapper, currentIndex + (event.key === 'ArrowDown' ? 1 : -1));
            return;
        }
        if (event.key === 'Enter') {
            const options = Array.from(menu?.querySelectorAll('.maintenance-vendor-option') || []);
            const activeIndex = Number.parseInt(wrapper.dataset.activeIndex || '-1', 10);
            if (options[activeIndex]) {
                event.preventDefault();
                commitMaintenanceVendorSelection(wrapper, options[activeIndex].dataset.vendorId || '', options[activeIndex].dataset.vendorLabel || '');
            }
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMaintenanceVendorSuggestionBox(wrapper, true);
            input.blur();
        }
    });

    document.addEventListener('mousedown', (event) => {
        const option = event.target.closest('.maintenance-vendor-option');
        if (option) {
            event.preventDefault();
        }
    });

    document.addEventListener('click', (event) => {
        const option = event.target.closest('.maintenance-vendor-option');
        if (option) {
            commitMaintenanceVendorSelection(option.closest('.maintenance-vendor-combobox'), option.dataset.vendorId || '', option.dataset.vendorLabel || '');
            return;
        }

        document.querySelectorAll('.maintenance-vendor-combobox').forEach(wrapper => {
            if (!wrapper.contains(event.target)) {
                closeMaintenanceVendorSuggestionBox(wrapper, true);
            }
        });
    });

    document.addEventListener('focusout', (event) => {
        const input = event.target.closest('.maintenance-vendor-search-input');
        if (!input) return;
        const wrapper = input.closest('.maintenance-vendor-combobox');
        window.setTimeout(() => {
            if (wrapper && !wrapper.contains(document.activeElement)) {
                closeMaintenanceVendorSuggestionBox(wrapper, true);
            }
        }, 120);
    });
}

function renderMaintenanceInlineEditor(request, compact = false) {
    const requestId = String(request?._id || '').trim();
    const selectedStage = getMaintenanceWorkflowStage(request);
    const selectedVendorId = getMaintenanceVendorId(request);
    const selectedVendorLabel = getMaintenanceVendorLabel(request);
    const scheduledValue = formatMaintenanceDateTimeInput(request?.scheduledFor);
    if (compact) {
        return `
            <div class="maintenance-inline-editor" data-request-id="${requestId}" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;align-items:end;margin:8px 0 2px 0;">
                <label style="display:grid;gap:4px;font-size:0.78rem;color:#64748b;">
                    <span>Workflow</span>
                    <select class="maintenance-inline-workflow" style="padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;">
                        ${getMaintenanceWorkflowOptionsHtml(selectedStage)}
                    </select>
                </label>
                <label style="display:grid;gap:4px;font-size:0.78rem;color:#64748b;">
                    <span>Assigned</span>
                    ${renderMaintenanceVendorCombobox({ hiddenClass: 'maintenance-inline-vendor', selectedVendorId, selectedVendorLabel, inputStyle: 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;' })}
                </label>
                <label style="display:grid;gap:4px;font-size:0.78rem;color:#64748b;">
                    <span>Scheduled</span>
                    <input type="datetime-local" class="maintenance-inline-scheduled" value="${scheduledValue}" style="padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;">
                </label>
            </div>
        `;
    }

    return `
        <div class="maintenance-inline-editor" data-request-id="${requestId}" style="margin:10px 0 4px 0;display:grid;gap:6px;">
            <label style="display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:0;">
                <strong style="color:#0f172a;font-size:0.97em;"><i class="fas fa-route"></i> Workflow:</strong>
                <select class="maintenance-inline-workflow" style="width:min(280px,100%);padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;">
                    ${getMaintenanceWorkflowOptionsHtml(selectedStage)}
                </select>
            </label>
            <label style="display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:0;">
                <strong style="color:#0f172a;font-size:0.97em;"><i class="fas fa-user-hard-hat"></i> Assigned:</strong>
                ${renderMaintenanceVendorCombobox({ hiddenClass: 'maintenance-inline-vendor', selectedVendorId, selectedVendorLabel, inputStyle: 'width:min(280px,100%);padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;' })}
            </label>
            <label style="display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:0;">
                <strong style="color:#0f172a;font-size:0.97em;"><i class="fas fa-calendar-check"></i> Scheduled:</strong>
                <input type="datetime-local" class="maintenance-inline-scheduled" value="${scheduledValue}" style="width:min(280px,100%);padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;">
            </label>
        </div>
    `;
}

function getPortfolioMaintenanceRenderContext(item) {
    const projectId = String((item?.projectId && item.projectId._id) || item?.projectId || item?.propertyId || item?.property || '').trim();
    const propsById = (state.properties || []).reduce((map, property) => {
        if (property && property._id) {
            map[String(property._id)] = property;
        }
        return map;
    }, {});
    const unitsById = (state.allUnits || []).reduce((map, unit) => {
        if (unit && unit._id) {
            map[String(unit._id)] = unit;
        }
        return map;
    }, {});
    const propertyLabel = projectId && propsById[String(projectId)]
        ? propsById[String(projectId)].name
        : getMaintenanceOverviewPropertyLabel(item) || item?.projectId?.name || '—';
    const unitId = item?.unitId?._id || item?.unitId;
    const unit = unitId && unitsById[String(unitId)] ? unitsById[String(unitId)] : (typeof item?.unitId === 'object' ? item.unitId : null);
    const unitLabel = unit
        ? `Unit ${unit.number || unit.unitNumber || unit.label || ''}`.trim()
        : (item?.unitLabel || item?.unitNumber || item?.unit || 'None');

    return {
        projectId,
        propertyLabel,
        unitLabel
    };
}

function getPortfolioMaintenanceSavingKey(itemId, source) {
    return `${String(source || 'request')}:${String(itemId || '')}`;
}

function isPortfolioMaintenanceItemSaving(itemId, source) {
    const savingMap = state.portfolioMaintenanceSaving || {};
    return !!savingMap[getPortfolioMaintenanceSavingKey(itemId, source)];
}

function getPortfolioMaintenanceSavingIndicator(itemId, source, variant = 'card') {
    if (!isPortfolioMaintenanceItemSaving(itemId, source)) {
        return '';
    }

    const positionStyle = variant === 'row'
        ? 'position:absolute;top:50%;right:0;transform:translateY(-50%);z-index:2;pointer-events:none;'
        : 'position:absolute;top:12px;right:14px;z-index:3;pointer-events:none;';
    return `<span style="${positionStyle}display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:rgba(239,246,255,0.96);color:#1d4ed8;font-size:0.78rem;font-weight:700;box-shadow:0 6px 16px rgba(29,78,216,0.12);"><span style="width:12px;height:12px;border:2px solid rgba(29,78,216,0.25);border-top-color:#1d4ed8;border-radius:50%;animation:spin 0.8s linear infinite;"></span>Saving</span>`;
}

function getPropertyMaintenanceSavingKey(itemId) {
        return String(itemId || '').trim();
}

function isPropertyMaintenanceItemSaving(itemId) {
        const savingMap = state.propertyMaintenanceSaving || {};
        return !!savingMap[getPropertyMaintenanceSavingKey(itemId)];
}

function getPropertyMaintenanceSavingIndicator(itemId, variant = 'card') {
        if (!isPropertyMaintenanceItemSaving(itemId)) {
                return '';
        }

        const positionStyle = variant === 'row'
                ? 'position:absolute;top:50%;right:0;transform:translateY(-50%);z-index:2;pointer-events:none;'
                : 'position:absolute;top:12px;right:14px;z-index:3;pointer-events:none;';
        return `<span style="${positionStyle}display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:rgba(239,246,255,0.96);color:#1d4ed8;font-size:0.78rem;font-weight:700;box-shadow:0 6px 16px rgba(29,78,216,0.12);"><span style="width:12px;height:12px;border:2px solid rgba(29,78,216,0.25);border-top-color:#1d4ed8;border-radius:50%;animation:spin 0.8s linear infinite;"></span>Saving</span>`;
}

function rerenderPropertyMaintenanceItem(requestId) {
    if (currentMaintenanceTab !== 'requests') return;
        const container = document.getElementById('maintenanceList');
        if (!container) return;

        const existingItem = container.querySelector(`[data-maint-id="${requestId}"]`);
        if (!existingItem) {
                applyPropertyMaintenanceFilters();
                return;
        }

        const request = (state.maintenanceRequests || []).find(item => String(item._id) === String(requestId));
        if (!request) {
                applyPropertyMaintenanceFilters();
                return;
        }

        const filteredRequests = getFilteredPropertyMaintenanceItems('requests');
        if (!filteredRequests.some(item => String(item._id) === String(requestId))) {
                applyPropertyMaintenanceFilters();
                return;
        }

        if (maintenanceRequestListView) {
            const template = document.createElement('template');
            template.innerHTML = renderPropertyMaintenanceRequestListRow(request).trim();
            const replacementNode = template.content.firstElementChild;
            if (!replacementNode) {
                applyPropertyMaintenanceFilters();
                return;
            }
            existingItem.replaceWith(replacementNode);
            return;
        }

        const unit = typeof request.unitId === 'object' ? request.unitId : state.units.find(u => u._id === request.unitId);
        const workflowStage = getMaintenanceWorkflowStage(request);
        const workflowLabel = getMaintenanceWorkflowStageLabel(workflowStage);
        const accessNotes = String(request.accessNotes || '').trim();
        const costLabel = formatMaintenanceCost(request.cost, 'Not logged');
        const createdDate = new Date(request.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const priorityBadge = `<span class="badge badge-info" style="background:#fff3cd;color:#856404;padding:2px 10px;border-radius:10px;font-size:0.92em;">
            <i class="fas fa-exclamation-circle"></i> ${request.priority.charAt(0).toUpperCase() + request.priority.slice(1)} Priority
        </span>`;
        let statusIcon = '<i class="fas fa-clock"></i>';
        if (request.status === 'completed') statusIcon = '<i class="fas fa-check-circle"></i>';
        else if (request.status === 'in-progress') statusIcon = '<i class="fas fa-spinner"></i>';
        const statusBadge = `<span class="status-badge ${request.status}" style="padding:4px 12px;border-radius:15px;font-size:0.82em;font-weight:600;">
            ${statusIcon} ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </span>`;
        const workflowBadge = `<span class="badge badge-info" style="background:#ecfeff;color:#155e75;padding:2px 10px;border-radius:10px;font-size:0.92em;">
                        <i class="fas fa-diagram-project"></i> ${workflowLabel}
                </span>`;
        const descriptionHtml = `
            <div style="
                margin-bottom:12px;
                background: linear-gradient(90deg, #eaf6ff 0%, #f7f7ff 100%);
                border-left: 4px solid #3498db;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 0.97em;
                color: #217dbb;
                font-weight: 500;
                box-shadow: 0 1px 4px rgba(44,62,80,0.05);
            ">
                <i class="fas fa-align-left" style="margin-right:7px;color:#217dbb;"></i>
                ${DescriptionEditor.render(request.description) || '<span style="color:#888;">No description provided.</span>'}
            </div>
        `;
        const savingIndicator = getPropertyMaintenanceSavingIndicator(request._id, 'card');
        const replacementHtml = `
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
        const template = document.createElement('template');
        template.innerHTML = replacementHtml.trim();
        const replacementNode = template.content.firstElementChild;
        if (!replacementNode) {
                applyPropertyMaintenanceFilters();
                return;
        }

        existingItem.replaceWith(replacementNode);
        scheduleMaintenancePhotoHydration('property');
}

function setPropertyMaintenanceItemSaving(itemId, isSaving) {
        state.propertyMaintenanceSaving = state.propertyMaintenanceSaving || {};
        const key = getPropertyMaintenanceSavingKey(itemId);
        if (isSaving) {
                state.propertyMaintenanceSaving[key] = true;
        } else {
                delete state.propertyMaintenanceSaving[key];
        }

        rerenderPropertyMaintenanceItem(itemId);
}

function setPortfolioMaintenanceItemSaving(itemId, source, isSaving) {
    state.portfolioMaintenanceSaving = state.portfolioMaintenanceSaving || {};
    const key = getPortfolioMaintenanceSavingKey(itemId, source);
    if (isSaving) {
        state.portfolioMaintenanceSaving[key] = true;
    } else {
        delete state.portfolioMaintenanceSaving[key];
    }

    rerenderPortfolioMaintenanceWorkspaceItem(itemId, source);
    rerenderPortfolioMaintenanceItem(itemId, source);
}

function getRecurringMaintenanceStatusOptionsHtml(selectedStatus = 'pending') {
    const normalizedStatus = String(selectedStatus || 'pending').toLowerCase();
    return ['pending', 'in-progress', 'completed'].map(status =>
        `<option value="${status}" ${status === normalizedStatus ? 'selected' : ''}>${status === 'completed' ? 'Complete — send to QC' : getRecurringMaintenanceStatusLabel(status)}</option>`
    ).join('');
}

function getRecurringMaintenanceDisplayDate(schedule) {
    if (!schedule) return null;
    const statusRaw = String(schedule.status || '').toLowerCase();
    if (statusRaw === 'completed' && schedule.completedAt) {
        return schedule.completedAt;
    }
    return schedule.startDate || schedule.completedAt || null;
}

function getRecurringMaintenanceDateFieldLabel(schedule) {
    return String(schedule?.status || '').toLowerCase() === 'completed'
        ? 'Completion Date'
        : 'Start Date';
}

function renderRecurringMaintenanceInlineEditor(schedule, options = {}) {
    const selectedVendorId = schedule.assignedVendor?._id || schedule.assignedVendor || '';
    const selectedVendorLabel = schedule.assignedVendor?.name || '';
    const dateFieldLabel = getRecurringMaintenanceDateFieldLabel(schedule);
    const startDateValue = getRecurringMaintenanceDisplayDate(schedule) ? String(getRecurringMaintenanceDisplayDate(schedule)).substring(0, 10) : '';
    const statusRaw = String(schedule.status || 'pending').toLowerCase();
    const compact = options.compact !== false;
    const assignedControl = renderMaintenanceVendorCombobox({ hiddenClass: 'recurring-maintenance-inline-vendor', selectedVendorId, selectedVendorLabel, inputStyle: 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;' });
    const scheduledControl = `<input type="date" class="recurring-maintenance-inline-start-date" value="${startDateValue}" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;">`;
    const statusControl = `<select aria-label="Maintenance status" class="recurring-maintenance-inline-status" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;color:#0f172a;background:#fff;">${getRecurringMaintenanceStatusOptionsHtml(statusRaw)}</select>`;
    if (compact) {
        return `
            <div class="maintenance-inline-editor recurring-maintenance-inline-editor" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;align-items:end;margin:8px 0 2px 0;">
                <label style="display:grid;gap:4px;font-size:0.78rem;color:#64748b;">
                    <span>Assigned</span>
                    ${assignedControl}
                </label>
                <label style="display:grid;gap:4px;font-size:0.78rem;color:#64748b;">
                    <span>${dateFieldLabel}</span>
                    ${scheduledControl}
                </label>
                <label style="display:grid;gap:4px;font-size:0.78rem;color:#64748b;">
                    <span>Maintenance status</span>
                    ${statusControl}
                </label>
            </div>
        `;
    }

    return `
        <div class="maintenance-inline-editor recurring-maintenance-inline-editor" style="margin:10px 0 4px 0;display:grid;gap:6px;">
            <label style="display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:0;">
                <strong style="color:#0f172a;font-size:0.97em;"><i class="fas fa-user-hard-hat"></i> Assigned:</strong>
                ${assignedControl}
            </label>
            <label style="display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:0;">
                <strong style="color:#0f172a;font-size:0.97em;"><i class="fas fa-calendar-check"></i> ${dateFieldLabel}:</strong>
                ${scheduledControl}
            </label>
            <label style="display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:0;">
                <strong style="color:#0f172a;font-size:0.97em;"><i class="fas fa-info-circle"></i> Maintenance status:</strong>
                ${statusControl}
            </label>
        </div>
    `;
}

function renderMaintenanceDescriptionHtml(description, emptyHtml = '<span style="color:#888;">No description provided.</span>') {
    return DescriptionEditor.render(description) || emptyHtml;
}

function renderMaintenanceDescriptionPanel(description, emptyHtml = '<span style="color:#888;">No description provided.</span>') {
    const hasDescription = !!String(description || '').trim();
    const contentColor = hasDescription ? '#217dbb' : '#888';
    return `
        <div class="maintenance-description-card" style="color:${contentColor};">
            <i class="fas fa-align-left description-icon"></i>
            <div class="maintenance-description-content">${renderMaintenanceDescriptionHtml(description, emptyHtml)}</div>
        </div>
    `;
}

function renderMaintenanceDescriptionTable(description, emptyHtml = '<span style="color:#94a3b8;">No description provided.</span>') {
    return `<div class="maintenance-description-content maintenance-description-table">${renderMaintenanceDescriptionHtml(description, emptyHtml)}</div>`;
}

function renderPropertyMaintenanceRequestListRow(request) {
    const unit = typeof request.unitId === 'object' ? request.unitId : state.units.find(u => u._id === request.unitId);
    const createdDate = new Date(request.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const workflowStage = getMaintenanceWorkflowStage(request);
    const selectedVendorId = getMaintenanceVendorId(request);
    const scheduledValue = formatMaintenanceDateTimeInput(request?.scheduledFor);
    const costLabel = formatMaintenanceCost(request.cost);
    const priorityBadge = `<span class="priority-badge ${request.priority}">${request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}</span>`;
    const statusBadge = `<span class="status-badge ${request.status}">${request.status.charAt(0).toUpperCase() + request.status.slice(1)}</span>`;
    const savingIndicator = getPropertyMaintenanceSavingIndicator(request._id, 'row');
    const assignedControl = renderMaintenanceVendorCombobox({ hiddenClass: 'maintenance-inline-vendor', selectedVendorId, selectedVendorLabel: getMaintenanceVendorLabel(request), inputStyle: 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:148px;color:#0f172a;' });
    return `
        <tr style="border-bottom:1px solid #e1e8ed;cursor:pointer;" data-maint-id="${request._id}" data-project-id="${state.currentProperty?._id || ''}" data-maint-source="request">
            <td style="padding:8px 8px;font-weight:600;color:#217dbb;">${request.title}</td>
            <td data-maint-summary-cell="true" style="padding:8px 8px;min-width:220px;color:#555;">${renderMaintenanceDescriptionTable(request.description)}</td>
            <td style="padding:8px 8px;">${priorityBadge}</td>
            <td style="padding:8px 8px;">${unit ? `Unit ${unit.number}` : 'N/A'}</td>
            <td style="padding:8px 8px;white-space:nowrap;"><select class="maintenance-inline-workflow" style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:138px;">${getMaintenanceWorkflowOptionsHtml(workflowStage)}</select></td>
            <td style="padding:8px 8px;white-space:nowrap;">${assignedControl}</td>
            <td style="padding:8px 8px;white-space:nowrap;"><input type="datetime-local" class="maintenance-inline-scheduled" value="${scheduledValue}" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:168px;"></td>
            <td data-maint-cost-cell="true" style="padding:8px 8px;white-space:nowrap;">${costLabel}</td>
            <td style="padding:8px 8px;">${statusBadge}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${createdDate}</td>
            <td style="padding:8px 8px;white-space:nowrap;position:relative;overflow:visible;min-width:92px;">
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start;flex-wrap:wrap;position:relative;overflow:visible;">
                    <button onclick="openMaintenanceEstimate('${request._id}', '${state.currentProperty?._id || ''}', 'property')" class="btn-secondary" title="Open Estimate"><i class="fas fa-arrow-up-right-from-square"></i></button>
                    <button onclick="editMaintenance('${request._id}')" class="btn-secondary" title="Edit"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteMaintenance('${request._id}')" class="btn-icon delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
                    ${savingIndicator}
                </div>
            </td>
        </tr>`;
}

function renderPropertyRecurringMaintenanceListRow(schedule) {
    const selectedVendorId = schedule.assignedVendor?._id || schedule.assignedVendor || '';
    const selectedVendorLabel = schedule.assignedVendor?.name || '';
    const startDateValue = getRecurringMaintenanceDisplayDate(schedule) ? String(getRecurringMaintenanceDisplayDate(schedule)).substring(0, 10) : '';
    const nextDate = schedule.nextScheduledDate ? formatDateDisplay(schedule.nextScheduledDate, 'en-US') : 'N/A';
    const statusRaw = String(schedule.status || 'pending').toLowerCase();
    const costLabel = typeof schedule.cost === 'number' ? `$${schedule.cost.toFixed(2)}` : '$0.00';
    let freqLabel = schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1);
    if (schedule.frequency === 'custom' && schedule.intervalDays) {
        freqLabel = `<span style="background:#eaf6ff;color:#217dbb;padding:2px 10px;border-radius:10px;">Every ${schedule.intervalDays} days</span>`;
    }
    let unitLabel = '<span style="color:#888;">None</span>';
    if (schedule.unitId) {
        if (typeof schedule.unitId === 'object' && schedule.unitId.number) unitLabel = `Unit ${schedule.unitId.number}`;
        else if (typeof schedule.unitId === 'string') {
            const unitObj = state.units?.find(u => u._id === schedule.unitId);
            unitLabel = unitObj?.number ? `Unit ${unitObj.number}` : schedule.unitId;
        }
    }
    return `
        <tr class="schedule-row" data-maint-id="${schedule._id}" data-project-id="${state.currentProperty?._id || ''}" data-maint-source="recurring" style="border-bottom:1px solid #e1e8ed;cursor:pointer;">
            <td style="padding:10px 8px;font-weight:600;color:#2c3e50;">${schedule.title} ${window.RecurringMaintenanceHistory.qcBadge(schedule)}</td>
            <td data-maint-summary-cell="true" style="padding:10px 8px;color:#555;min-width:220px;">${renderMaintenanceDescriptionTable(schedule.description)}</td>
            <td style="padding:10px 8px;">${freqLabel}</td>
            <td style="padding:10px 8px;white-space:nowrap;"><input type="date" class="recurring-maintenance-inline-start-date" value="${startDateValue}" style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:138px;"></td>
            <td style="padding:10px 8px;color:#217dbb;font-weight:600;white-space:nowrap;">${nextDate}</td>
            <td style="padding:10px 8px;white-space:nowrap;">${renderMaintenanceVendorCombobox({ hiddenClass: 'recurring-maintenance-inline-vendor', selectedVendorId, selectedVendorLabel, inputStyle: 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:148px;color:#0f172a;' })}</td>
            <td style="padding:10px 8px;">${unitLabel}</td>
            <td style="padding:10px 8px;white-space:nowrap;"><select aria-label="Maintenance status" class="recurring-maintenance-inline-status" style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:138px;">${getRecurringMaintenanceStatusOptionsHtml(statusRaw)}</select></td>
            <td data-maint-cost-cell="true" style="padding:10px 8px;">${costLabel}</td>
            <td style="padding:10px 8px;white-space:nowrap;position:relative;overflow:visible;min-width:92px;">
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start;flex-wrap:wrap;position:relative;overflow:visible;">
                    ${window.RecurringMaintenanceHistory.historyButton({ ...schedule, projectId: schedule.projectId || state.currentProperty?._id }, 'property')}
                    <button onclick="event.stopPropagation();openRecurringMaintenanceEstimate('${schedule._id}', '${state.currentProperty ? state.currentProperty._id : ''}', 'property')" class="btn-secondary" title="Open Estimate"><i class="fas fa-arrow-up-right-from-square"></i></button>
                    <button onclick="event.stopPropagation();editMaintenanceSchedule('${schedule._id}')" class="btn-secondary" title="Edit"><i class="fas fa-edit"></i></button>
                    <button onclick="event.stopPropagation();deleteMaintenanceSchedule('${schedule._id}')" class="btn-icon delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
                    ${schedule.status !== 'pending' ? `<button onclick="event.stopPropagation();markScheduleCompleted('${schedule._id}')" class="btn-primary" title="Complete"><i class="fas fa-check"></i></button>` : ''}
                </div>
            </td>
        </tr>`;
}

function enterMaintenanceRequestRowEditMode(row, request, options = {}) {
    if (!row || !request) return;
    const requestIdStr = String(request._id || '');
    if (!requestIdStr) return;
    const editingKey = options.editingKey || 'currentEditingMaintenanceRequestId';
    if (state[editingKey] && state[editingKey] !== requestIdStr) return;
    if (row.dataset.editing === 'true') return;
    state[editingKey] = requestIdStr;
    row.dataset.editing = 'true';

    const summaryCell = row.querySelector('[data-maint-summary-cell="true"]');
    const costCell = row.querySelector('[data-maint-cost-cell="true"]');
    if (!summaryCell || !costCell) return;
    const initialAssignedVendorId = getMaintenanceVendorId(request);

    const summaryInput = document.createElement('textarea');
    summaryInput.className = 'app-inline-input';
    summaryInput.setAttribute('data-description-editor', '');
    summaryInput.style.resize = 'vertical';
    summaryInput.style.minHeight = '32px';
    summaryInput.style.overflow = 'hidden';
    summaryInput.value = request.summary || request.description || '';
    const autoResize = () => {
        summaryInput.style.height = 'auto';
        summaryInput.style.height = summaryInput.scrollHeight + 'px';
    };
    summaryInput.addEventListener('input', autoResize);
    summaryCell.innerHTML = '';
    summaryCell.appendChild(summaryInput);
    autoResize();
    summaryInput.focus();
    summaryInput.select && summaryInput.select();

    const costInput = document.createElement('input');
    costInput.type = 'number';
    costInput.step = '0.01';
    costInput.min = '0';
    costInput.className = 'app-inline-input';
    costInput.style.width = '100px';
    costInput.value = Number.isFinite(Number(request.cost)) ? Number(request.cost).toFixed(2) : '';
    costCell.innerHTML = '';
    costCell.appendChild(costInput);

    const saveChanges = async () => {
        const projectId = options.projectId || row.dataset.projectId || state.currentProperty?._id || '';
        if (!projectId) {
            state[editingKey] = null;
            delete row.dataset.editing;
            showNotification('Cannot update maintenance: missing property id', 'error');
            options.onCancel?.();
            return;
        }

        const workflowSelect = row.querySelector('.portfolio-maint-workflow-select, .maintenance-inline-workflow');
        const vendorSelect = row.querySelector('.maintenance-inline-vendor');
        const scheduledInput = row.querySelector('.maintenance-inline-scheduled');
        const isVendorAssignmentSave = String(vendorSelect?.value || '') !== String(initialAssignedVendorId || '');
        const updates = {
            description: summaryInput.value.trim(),
            cost: costInput.value === '' ? '' : Number(costInput.value),
            workflowStage: workflowSelect?.value || getMaintenanceWorkflowStage(request),
            assignedVendor: vendorSelect?.value || '',
            scheduledFor: scheduledInput?.value || ''
        };

        try {
            options.beforeSave?.();
            options.setSaving?.(requestIdStr, true);
            [workflowSelect, scheduledInput].forEach(field => {
                if (field) field.disabled = true;
            });
            setMaintenanceVendorComboboxDisabled(vendorSelect, true);
            setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
            await updateMaintenanceInlineFields(projectId, requestIdStr, updates, {
                refreshProperty: options.refreshProperty ?? (state.currentProperty && String(state.currentProperty._id) === String(projectId)),
                refreshPortfolio: options.refreshPortfolio ?? false,
                refreshOverview: false
            });
            showNotification('Maintenance request updated', 'success');
        } catch (err) {
            console.error('Inline maintenance request update error:', err);
            showNotification('Could not update maintenance request', 'error');
        } finally {
            state[editingKey] = null;
            delete row.dataset.editing;
            [workflowSelect, scheduledInput].forEach(field => {
                if (field) field.disabled = false;
            });
            setMaintenanceVendorComboboxLoading(vendorSelect, false);
            setMaintenanceVendorComboboxDisabled(vendorSelect, false);
            options.setSaving?.(requestIdStr, false);
        }
    };

    const handleDocClick = (ev) => {
        const target = ev.target;
        if (row.contains(target)) return;
        if (!document.body.contains(row)) {
            document.removeEventListener('click', handleDocClick, true);
            return;
        }
        document.removeEventListener('click', handleDocClick, true);
        saveChanges();
    };

    document.addEventListener('click', handleDocClick, true);
}

function enterRecurringMaintenanceRowEditMode(row, schedule, options = {}) {
    if (!row || !schedule) return;
    const scheduleIdStr = String(schedule._id || '');
    if (!scheduleIdStr) return;
    const editingKey = options.editingKey || 'currentEditingRecurringMaintenanceId';
    if (state[editingKey] && state[editingKey] !== scheduleIdStr) return;
    if (row.dataset.editing === 'true') return;
    state[editingKey] = scheduleIdStr;
    row.dataset.editing = 'true';

    const summaryCell = row.querySelector('[data-maint-summary-cell="true"]');
    const costCell = row.querySelector('[data-maint-cost-cell="true"]');
    if (!summaryCell || !costCell) return;
    const initialAssignedVendorId = String(schedule.assignedVendor?._id || schedule.assignedVendor || '');

    const summaryInput = document.createElement('textarea');
    summaryInput.className = 'app-inline-input';
    summaryInput.setAttribute('data-description-editor', '');
    summaryInput.style.resize = 'vertical';
    summaryInput.style.minHeight = '32px';
    summaryInput.style.overflow = 'hidden';
    summaryInput.value = schedule.description || '';
    const autoResize = () => {
        summaryInput.style.height = 'auto';
        summaryInput.style.height = summaryInput.scrollHeight + 'px';
    };
    summaryInput.addEventListener('input', autoResize);
    summaryCell.innerHTML = '';
    summaryCell.appendChild(summaryInput);
    autoResize();
    summaryInput.focus();
    summaryInput.select && summaryInput.select();

    const costInput = document.createElement('input');
    costInput.type = 'number';
    costInput.step = '0.01';
    costInput.min = '0';
    costInput.className = 'app-inline-input';
    costInput.style.width = '100px';
    costInput.value = Number.isFinite(Number(schedule.cost)) ? Number(schedule.cost).toFixed(2) : '';
    costCell.innerHTML = '';
    costCell.appendChild(costInput);

    const saveChanges = async () => {
        const projectId = options.projectId || row.dataset.projectId || state.currentProperty?._id || '';
        if (!projectId) {
            state[editingKey] = null;
            delete row.dataset.editing;
            showNotification('Cannot update recurring maintenance: missing property id', 'error');
            options.onCancel?.();
            return;
        }

        const vendorSelect = row.querySelector('.recurring-maintenance-inline-vendor');
        const startDateInput = row.querySelector('.recurring-maintenance-inline-start-date');
        const statusSelect = row.querySelector('.recurring-maintenance-inline-status');
        const isVendorAssignmentSave = String(vendorSelect?.value || '') !== String(initialAssignedVendorId || '');

        try {
            options.beforeSave?.();
            options.setSaving?.(scheduleIdStr, true);
            [startDateInput, statusSelect].forEach(field => {
                if (field) field.disabled = true;
            });
            setMaintenanceVendorComboboxDisabled(vendorSelect, true);
            setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
            await updatePortfolioRecurringMaintenanceSchedule(scheduleIdStr, projectId, {
                description: summaryInput.value.trim(),
                cost: costInput.value === '' ? 0 : Number(costInput.value),
                assignedVendor: vendorSelect?.value || null,
                startDate: startDateInput?.value ? dateInputToISOAtNoon(startDateInput.value) : '',
                status: statusSelect?.value || schedule.status || 'pending'
            }, {
                refreshPortfolio: options.refreshPortfolio ?? false
            });
            showNotification('Recurring maintenance updated', 'success');
        } catch (err) {
            console.error('Inline recurring maintenance update error:', err);
            showNotification('Could not update recurring maintenance', 'error');
        } finally {
            state[editingKey] = null;
            delete row.dataset.editing;
            [startDateInput, statusSelect].forEach(field => {
                if (field) field.disabled = false;
            });
            setMaintenanceVendorComboboxLoading(vendorSelect, false);
            setMaintenanceVendorComboboxDisabled(vendorSelect, false);
            options.setSaving?.(scheduleIdStr, false);
        }
    };

    const handleDocClick = (ev) => {
        const target = ev.target;
        if (row.contains(target)) return;
        if (!document.body.contains(row)) {
            document.removeEventListener('click', handleDocClick, true);
            return;
        }
        document.removeEventListener('click', handleDocClick, true);
        saveChanges();
    };

    document.addEventListener('click', handleDocClick, true);
}

function renderPortfolioMaintenanceRequestCard(request) {
    const { projectId, propertyLabel, unitLabel } = getPortfolioMaintenanceRenderContext(request);
    const savingIndicator = getPortfolioMaintenanceSavingIndicator(request._id, 'request', 'card');
    const workflowStage = getMaintenanceWorkflowStage(request);
    const workflowLabel = getMaintenanceWorkflowStageLabel(workflowStage);
    const accessNotes = String(request.accessNotes || '').trim();
    const createdDate = request.createdAt ? formatDateDisplay(request.createdAt, 'en-US') : '—';
    const costLabel = formatMaintenanceCost(request.cost, 'Not logged');
    const statusValue = String(request.status || 'pending').toLowerCase();
    const priorityValue = String(request.priority || 'medium');
    const priorityBadge = `<span class="badge badge-info" style="background:#fff3cd;color:#856404;padding:2px 10px;border-radius:10px;font-size:0.92em;"><i class="fas fa-exclamation-circle"></i> ${priorityValue.charAt(0).toUpperCase() + priorityValue.slice(1)} Priority</span>`;
    let statusIcon = '<i class="fas fa-clock"></i>';
    if (statusValue === 'completed') statusIcon = '<i class="fas fa-check-circle"></i>';
    else if (statusValue === 'in-progress') statusIcon = '<i class="fas fa-spinner"></i>';
    const statusBadge = `<span class="status-badge ${statusValue}" style="padding:4px 12px;border-radius:15px;font-size:0.82em;font-weight:600;">${statusIcon} ${statusValue.charAt(0).toUpperCase() + statusValue.slice(1)}</span>`;
    const workflowBadge = `<span class="badge badge-info" style="background:#ecfeff;color:#155e75;padding:2px 10px;border-radius:10px;font-size:0.92em;"><i class="fas fa-diagram-project"></i> ${workflowLabel}</span>`;
    const dataProp = String(propertyLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataStatus = workflowStage.replace(/"/g, '&quot;');
    const dataLegacyStatus = statusValue.replace(/"/g, '&quot;');
    return `
        <div class="maintenance-card compact-maintenance-card" data-portfolio-filter-item="true" data-maint-id="${request._id}" data-maint-source="request" data-project-id="${projectId}" data-property="${dataProp}" data-unit="${dataUnit}" data-type="request" data-status="${dataStatus}" data-legacy-status="${dataLegacyStatus}" style="position:relative;border:1.5px solid #e1e8ed;box-shadow:0 2px 8px rgba(44,62,80,0.07);margin-bottom:12px;font-size:0.93em;border-radius:8px;overflow:visible;">
            ${savingIndicator}
            <div class="maintenance-header" style="padding:10px 14px;border-bottom:1px solid #e1e8ed;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <div>
                    <strong style="font-size:1.08em;color:#2c3e50;"><i class="fas fa-tools" style="color:#217dbb;margin-right:8px;"></i>${request.title || 'Maintenance Request'}</strong>
                    <span style="margin-left:12px;">${priorityBadge}</span>
                    <span style="margin-left:8px;">${workflowBadge}</span>
                </div>
                <div class="maintenance-actions" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <button onclick="openMaintenanceEstimate('${request._id}', '${projectId}', 'portfolio')" class="btn-secondary" style="margin-right:6px;"><i class="fas fa-arrow-up-right-from-square"></i> Estimate</button>
                    <button onclick="editPortfolioMaintenance('${request._id}', '${projectId}')" class="btn-secondary" style="margin-right:6px;"><i class="fas fa-edit"></i> Edit</button>
                    <button onclick="deletePortfolioMaintenance('${request._id}', '${projectId}')" class="btn-icon delete-btn" title="Delete Request" style="font-size:0.97em;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="maintenance-content" style="padding:10px 14px;">
                <div class="compact-maintenance-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;align-items:start;">
                    <div class="compact-maintenance-panel" style="max-height:400px;overflow-y:auto;padding-right:4px;">
                        ${renderMaintenanceDescriptionPanel(request.description)}
                        <div style="margin-bottom:8px;"><strong><i class="fas fa-building"></i> Property:</strong> <span style="color:#217dbb;">${propertyLabel || '—'}</span></div>
                        <div style="margin-bottom:8px;"><strong><i class="fas fa-calendar-alt"></i> Created:</strong> <span style="color:#217dbb;">${createdDate}</span></div>
                        <div style="margin-bottom:8px;"><strong><i class="fas fa-dollar-sign"></i> Cost:</strong> <span style="color:#0f172a;">${costLabel}</span></div>
                        <div style="margin-bottom:8px;"><strong><i class="fas fa-info-circle"></i> Status:</strong> ${statusBadge}</div>
                        ${accessNotes ? `<div style="margin-bottom:8px;"><strong><i class="fas fa-key"></i> Access:</strong> <span style="color:#475569;white-space:pre-line;">${accessNotes}</span></div>` : ''}
                        <div style="margin-bottom:8px;">${unitLabel === 'None' ? '<span style="color:#888;font-size:0.97em;"><i class="fas fa-door-closed"></i> None</span>' : `<i class="fas fa-door-open"></i> ${unitLabel}`}</div>
                        ${renderMaintenanceInlineEditor(request)}
                        ${renderMaintenancePhotoGallery(request, 'portfolio')}
                    </div>
                    <div class="maintenance-thread compact-maintenance-thread" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#f8fafc;display:grid;gap:6px;">
                        <div style="font-weight:700;color:#0f172a;font-size:0.88rem;margin-bottom:6px;"><i class="fas fa-comments" style="color:#2563eb;margin-right:6px;"></i>Maintenance Chat / Updates</div>
                        <div class="maintenance-thread-messages" style="display:grid;gap:6px;margin-bottom:6px;max-height:220px;overflow-y:auto;padding-right:4px;align-content:start;scrollbar-width:none;">
                            ${Array.isArray(request.updates) && request.updates.length ? request.updates.map(update => `<div style="padding:8px 10px;border-radius:8px;border:1px solid ${update.authorRole === 'tenant' ? '#bfdbfe' : '#d1fae5'};background:${update.authorRole === 'tenant' ? '#eff6ff' : '#ecfdf5'};"><div style="font-weight:700;font-size:0.8rem;color:#0f172a;">${update.authorName || update.authorRole || 'Update'} <span style="font-weight:500;color:#64748b;">${update.createdAt ? new Date(update.createdAt).toLocaleString() : ''}</span></div><div style="font-size:0.84rem;color:#475569;margin-top:3px;white-space:pre-line;">${update.text || ''}</div></div>`).join('') : '<div style="font-size:0.84rem;color:#64748b;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#fff;">No chat updates yet.</div>'}
                        </div>
                        <form onsubmit="sendPortfolioMaintenanceMessage(event, '${request._id}', '${projectId}')" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;">
                            <input name="message" type="text" maxlength="1200" placeholder="Reply to tenant or add office update" style="border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;background:#fff;">
                            <button type="submit" class="btn-secondary"><i class="fas fa-paper-plane"></i> Send</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>`;
}

function renderPortfolioMaintenanceRequestRow(request) {
    const { projectId, propertyLabel, unitLabel } = getPortfolioMaintenanceRenderContext(request);
    const savingIndicator = getPortfolioMaintenanceSavingIndicator(request._id, 'request', 'row');
    const workflowStage = getMaintenanceWorkflowStage(request);
    const statusValue = String(request.status || 'pending').toLowerCase();
    const selectedVendorId = getMaintenanceVendorId(request);
    const scheduledValue = formatMaintenanceDateTimeInput(request?.scheduledFor);
    const createdDate = request.createdAt ? formatDateDisplay(request.createdAt, 'en-US') : '—';
    const costLabel = formatMaintenanceCost(request.cost);
    const statusControl = `<select class="portfolio-maint-workflow-select maintenance-inline-workflow" style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:138px;">${getMaintenanceWorkflowOptionsHtml(workflowStage)}</select>`;
    const assignedControl = renderMaintenanceVendorCombobox({ hiddenClass: 'maintenance-inline-vendor', selectedVendorId, selectedVendorLabel: getMaintenanceVendorLabel(request), inputStyle: 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:148px;color:#0f172a;' });
    const scheduledControl = `<input type="datetime-local" class="maintenance-inline-scheduled" value="${scheduledValue}" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:168px;">`;
    const dataProp = String(propertyLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataStatus = workflowStage.replace(/"/g, '&quot;');
    const dataLegacyStatus = statusValue.replace(/"/g, '&quot;');
    return `
        <tr data-maint-id="${request._id}" data-maint-source="request" data-project-id="${projectId}" data-portfolio-filter-item="true" data-property="${dataProp}" data-unit="${dataUnit}" data-type="request" data-status="${dataStatus}" data-legacy-status="${dataLegacyStatus}" style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:8px 8px;font-weight:600;color:#217dbb;">${propertyLabel || '—'}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${unitLabel || '—'}</td>
            <td style="padding:8px 8px;font-weight:600;color:#217dbb;">Request</td>
            <td data-maint-summary-cell="true" style="padding:8px 8px;min-width:220px;">
                <div style="font-weight:700;color:#0f172a;">${request.title || 'Maintenance Request'}</div>
                ${renderMaintenanceDescriptionTable(request.description)}
            </td>
            <td style="padding:8px 8px;white-space:nowrap;">${assignedControl}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${scheduledControl}</td>
            <td data-maint-cost-cell="true" style="padding:8px 8px;white-space:nowrap;">${costLabel}</td>
            <td style="padding:8px 8px;">${statusControl}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${createdDate}</td>
            <td style="padding:8px 8px;white-space:nowrap;position:relative;overflow:visible;min-width:44px;">
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start;flex-wrap:wrap;position:relative;overflow:visible;">
                    <button onclick="openMaintenanceEstimate('${request._id}', '${projectId}', 'portfolio')" class="btn-secondary" title="Open Estimate"><i class="fas fa-arrow-up-right-from-square"></i></button>
                    <button onclick="deletePortfolioMaintenance('${request._id}', '${projectId}')" class="btn-icon delete-btn" title="Delete Request"><i class="fas fa-trash"></i></button>
                    ${savingIndicator}
                </div>
            </td>
        </tr>`;
}

function renderPortfolioRecurringMaintenanceCard(schedule) {
    const { projectId, propertyLabel, unitLabel } = getPortfolioMaintenanceRenderContext(schedule);
    const savingIndicator = getPortfolioMaintenanceSavingIndicator(schedule._id, 'recurring', 'card');
    const statusRaw = String(schedule.status || 'pending').toLowerCase();
    const dataProp = String(propertyLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const scheduledLabel = schedule.nextScheduledDate ? formatDateDisplay(schedule.nextScheduledDate, 'en-US') : '—';
    const costLabel = formatMaintenanceCost(schedule.cost);
    const historyHtml = renderScheduleHistory(schedule.history, { variant: 'panel', schedule: { ...schedule, projectId: schedule.projectId || state.currentProperty?._id } });
    return `
        <div class="maintenance-card compact-maintenance-card" data-portfolio-filter-item="true" data-maint-id="${schedule._id}" data-maint-source="recurring" data-project-id="${projectId}" data-property="${dataProp}" data-unit="${dataUnit}" data-type="recurring" data-status="${statusRaw}" style="position:relative;border:1.5px solid #e1e8ed;box-shadow:0 2px 8px rgba(44,62,80,0.07);margin-bottom:12px;font-size:0.92em;border-radius:8px;overflow:visible;">
            ${savingIndicator}
            <div class="maintenance-header" style="padding:10px 14px;border-bottom:1px solid #e1e8ed;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <div>
                    <strong style="font-size:1.05em;color:#2c3e50;"><i class="fas fa-sync-alt" style="color:#217dbb;margin-right:8px;"></i>${schedule.title || 'Recurring Maintenance'} ${window.RecurringMaintenanceHistory.qcBadge(schedule)}</strong>
                    <span style="margin-left:8px;" class="portfolio-badge">Recurring</span>
                </div>
                <div class="maintenance-actions" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <button onclick="openRecurringMaintenanceEstimate('${schedule._id}', '${projectId}', 'portfolio')" class="btn-secondary"><i class="fas fa-arrow-up-right-from-square"></i> Estimate</button>
                    <button onclick="editPortfolioRecurringMaintenance('${schedule._id}', '${projectId}')" class="btn-secondary"><i class="fas fa-edit"></i> Edit</button>
                    <button onclick="openPortfolioRecurringMaintenance('${schedule._id}', '${projectId}')" class="btn-secondary"><i class="fas fa-arrow-up-right-from-square"></i> Open</button>
                </div>
            </div>
            <div class="maintenance-content" style="padding:10px 14px;">
                <div class="compact-maintenance-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;align-items:start;">
                    <div class="compact-maintenance-panel" style="max-height:400px;overflow-y:auto;padding-right:4px;">
                        ${renderMaintenanceDescriptionPanel(schedule.description, 'No description provided.')}
                        <div style="margin-bottom:8px;"><strong><i class="fas fa-building"></i> Property:</strong> <span style="color:#217dbb;">${propertyLabel || '—'}</span></div>
                        <div style="margin-bottom:8px;"><strong><i class="fas fa-calendar-check"></i> Next Date:</strong> <span style="color:#0f172a;">${scheduledLabel}</span></div>
                        ${renderRecurringMaintenanceInlineEditor(schedule)}
                        <div style="margin-bottom:8px;">${unitLabel === 'None' ? '<span style="color:#888;font-size:0.97em;"><i class="fas fa-door-closed"></i> None</span>' : `<i class="fas fa-door-open"></i> ${unitLabel}`}</div>
                        <div><strong><i class="fas fa-dollar-sign"></i> Cost:</strong> <span style="color:#0f172a;">${costLabel}</span></div>
                    </div>
                    <div class="maintenance-thread compact-maintenance-thread" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#f8fafc;display:grid;gap:6px;align-content:start;">
                        ${historyHtml}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderPortfolioRecurringMaintenanceRow(schedule) {
    const { projectId, propertyLabel, unitLabel } = getPortfolioMaintenanceRenderContext(schedule);
    const savingIndicator = getPortfolioMaintenanceSavingIndicator(schedule._id, 'recurring', 'row');
    const statusRaw = String(schedule.status || 'pending').toLowerCase();
    const selectedVendorId = schedule.assignedVendor?._id || schedule.assignedVendor || '';
    const selectedVendorLabel = schedule.assignedVendor?.name || '';
    const assignedControl = renderMaintenanceVendorCombobox({ hiddenClass: 'recurring-maintenance-inline-vendor', selectedVendorId, selectedVendorLabel, inputStyle: 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:148px;color:#0f172a;' });
    const scheduledLabel = schedule.nextScheduledDate ? formatDateDisplay(schedule.nextScheduledDate, 'en-US') : '—';
    const startDateValue = getRecurringMaintenanceDisplayDate(schedule) ? String(getRecurringMaintenanceDisplayDate(schedule)).substring(0, 10) : '';
    const scheduledControl = `<input type="date" class="recurring-maintenance-inline-start-date" value="${startDateValue}" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:148px;">`;
    const statusControl = `<select aria-label="Maintenance status" class="recurring-maintenance-inline-status" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-width:138px;">${getRecurringMaintenanceStatusOptionsHtml(statusRaw)}</select>`;
    const costLabel = formatMaintenanceCost(schedule.cost);
    const dataProp = String(propertyLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g, '&quot;');
    const dataStatus = statusRaw.replace(/"/g, '&quot;');
    return `
        <tr data-maint-id="${schedule._id}" data-maint-source="recurring" data-project-id="${projectId}" data-portfolio-filter-item="true" data-property="${dataProp}" data-unit="${dataUnit}" data-type="recurring" data-status="${dataStatus}" style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:8px 8px;font-weight:600;color:#217dbb;">${propertyLabel || '—'}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${unitLabel || '—'}</td>
            <td style="padding:8px 8px;font-weight:600;color:#217dbb;">Recurring</td>
            <td data-maint-summary-cell="true" style="padding:8px 8px;min-width:220px;">
                <div style="font-weight:700;color:#0f172a;">${schedule.title || 'Recurring Maintenance'} ${window.RecurringMaintenanceHistory.qcBadge(schedule)}</div>
                ${renderMaintenanceDescriptionTable(schedule.description)}
            </td>
            <td style="padding:8px 8px;white-space:nowrap;">${assignedControl}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${scheduledControl}</td>
            <td data-maint-cost-cell="true" style="padding:8px 8px;white-space:nowrap;">${costLabel}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${statusControl}</td>
            <td style="padding:8px 8px;white-space:nowrap;">${scheduledLabel}</td>
            <td style="padding:8px 8px;white-space:nowrap;position:relative;overflow:visible;min-width:92px;">
                <div style="display:flex;align-items:center;gap:6px;justify-content:flex-start;flex-wrap:wrap;position:relative;overflow:visible;">
                    ${window.RecurringMaintenanceHistory.historyButton({ ...schedule, projectId: schedule.projectId || projectId })}
                    <button onclick="openRecurringMaintenanceEstimate('${schedule._id}', '${projectId}', 'portfolio')" class="btn-secondary" title="Open Estimate"><i class="fas fa-arrow-up-right-from-square"></i></button>
                    <button onclick="openPortfolioRecurringMaintenance('${schedule._id}', '${projectId}')" class="btn-secondary" title="Open Recurring Maintenance"><i class="fas fa-folder-open"></i></button>
                    ${savingIndicator}
                </div>
            </td>
        </tr>`;
}

function rerenderPortfolioMaintenanceItem(itemId, source) {
    if (state.currentPortfolioDetailsType !== 'maintenance') return;

    const container = document.getElementById('portfolioDetailsTbody');
    if (!container) return;

    const existingItem = Array.from(container.querySelectorAll('[data-maint-id][data-maint-source]')).find(element =>
        String(element.getAttribute('data-maint-id')) === String(itemId)
        && String(element.getAttribute('data-maint-source')) === String(source)
    );
    if (!existingItem) {
        renderPortfolioDetails('maintenance');
        return;
    }

    const item = source === 'recurring'
        ? (state.portfolioRecurringMaintenance || []).find(entry => String(entry._id) === String(itemId))
        : (state.portfolioMaintenance || []).find(entry => String(entry._id) === String(itemId));
    if (!item) {
        renderPortfolioDetails('maintenance');
        return;
    }

    const isListView = !!document.getElementById('portfolioMaintenanceListTable');
    const replacementHtml = source === 'recurring'
        ? (isListView ? renderPortfolioRecurringMaintenanceRow(item) : renderPortfolioRecurringMaintenanceCard(item))
        : (isListView ? renderPortfolioMaintenanceRequestRow(item) : renderPortfolioMaintenanceRequestCard(item));
    const template = document.createElement('template');
    template.innerHTML = replacementHtml.trim();
    const replacementNode = template.content.firstElementChild;
    if (!replacementNode) {
        renderPortfolioDetails('maintenance');
        return;
    }

    existingItem.replaceWith(replacementNode);
    renderFilteredPortfolioDetailsRows();
}

function syncPortfolioMaintenanceOverviewSummary() {
    const elOpenMaint = document.getElementById('portfolioOpenMaintenanceCount');
    const elMaintBreakdown = document.getElementById('portfolioMaintenanceBreakdown');
    const requests = Array.isArray(state.portfolioMaintenance) ? state.portfolioMaintenance : [];
    const schedules = Array.isArray(state.portfolioRecurringMaintenance) ? state.portfolioRecurringMaintenance : [];
    const requestStageCounts = { new: 0, scheduled: 0, waiting: 0, 'in-progress': 0, completed: 0, closed: 0 };
    let pendingRequestCount = 0;
    let recurringUpcoming = 0;
    let recurringInProgress = 0;
    let openMaintCount = 0;

    requests.forEach(item => {
        const workflowStage = getMaintenanceWorkflowStage(item);
        if (requestStageCounts[workflowStage] !== undefined) {
            requestStageCounts[workflowStage]++;
        }
        if (item.status === 'pending') {
            pendingRequestCount++;
        }
        if (item.status === 'pending' || item.status === 'in-progress') {
            openMaintCount++;
        }
    });

    schedules.forEach(item => {
        const status = item.status || 'pending';
        if (status === 'pending') {
            recurringUpcoming++;
            openMaintCount++;
        } else if (status === 'in-progress') {
            recurringInProgress++;
            openMaintCount++;
        }
    });

    if (elOpenMaint) {
        elOpenMaint.textContent = String(openMaintCount);
    }
    if (elMaintBreakdown) {
        elMaintBreakdown.innerHTML = '';
        if (openMaintCount === 0) {
            const badge = document.createElement('span');
            badge.className = 'portfolio-badge';
            badge.textContent = 'No open items';
            elMaintBreakdown.appendChild(badge);
        } else {
            if (pendingRequestCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge warn';
                badge.textContent = `${pendingRequestCount} pending`;
                elMaintBreakdown.appendChild(badge);
            }
            if (requestStageCounts.scheduled > 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge';
                badge.textContent = `${requestStageCounts.scheduled} scheduled`;
                elMaintBreakdown.appendChild(badge);
            }
            if (requestStageCounts.waiting > 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge warn';
                badge.textContent = `${requestStageCounts.waiting} waiting`;
                elMaintBreakdown.appendChild(badge);
            }
            if (requestStageCounts['in-progress'] > 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge';
                badge.textContent = `${requestStageCounts['in-progress']} in progress`;
                elMaintBreakdown.appendChild(badge);
            }
            if (recurringUpcoming > 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge warn';
                badge.textContent = `${recurringUpcoming} recurring up-coming`;
                elMaintBreakdown.appendChild(badge);
            }
            if (recurringInProgress > 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge';
                badge.textContent = `${recurringInProgress} recurring in-progress`;
                elMaintBreakdown.appendChild(badge);
            }
        }
    }
}

function syncPortfolioMaintenanceComparisonRows() {
    const computeRows = rows => {
        if (!Array.isArray(rows)) return rows;
        return rows.map(row => {
            const propertyId = String(row?.property?._id || '');
            const maintenanceCount = [
                ...(state.portfolioMaintenance || []),
                ...(state.portfolioRecurringMaintenance || [])
            ].filter(item => {
                const status = String(item?.status || '').toLowerCase();
                return portfolioPropertyId(item) === propertyId && !['completed', 'closed'].includes(status);
            }).length;
            return {
                ...row,
                maintenance: maintenanceCount,
                attention: (100 - Number(row?.occupancy || 0)) / 10 + maintenanceCount * 2 + Number(row?.delinquent || 0) * 3 + (row?.qbConnected ? 0 : 2)
            };
        });
    };

    state.portfolioComparisonMasterRows = computeRows(state.portfolioComparisonMasterRows);
    state.portfolioComparisonRows = computeRows(state.portfolioComparisonRows);
}

function syncPortfolioMaintenanceExecutiveCards() {
    syncPortfolioMaintenanceComparisonRows();
    const maintenanceCard = document.querySelector('[data-portfolio-drill="maintenance"]');
    const rows = state.portfolioComparisonMasterRows || state.portfolioComparisonRows || [];
    const maintenanceTotal = rows.reduce((sum, row) => sum + (Number(row?.maintenance) || 0), 0);
    if (maintenanceCard) {
        const value = maintenanceCard.querySelector('.portfolio-executive-value');
        const trend = maintenanceCard.querySelector('.portfolio-executive-trend');
        if (value) value.textContent = String(maintenanceTotal);
        if (trend) {
            trend.textContent = 'Requests requiring action';
            trend.className = `portfolio-executive-trend ${maintenanceTotal ? 'warn' : 'good'}`;
        }
    }
    updatePortfolioUpcomingCard();
    if ((state.portfolioWorkspaceMode || 'properties') === 'graphics') {
        renderPortfolioGraphicsDashboard();
    }
}

function rerenderPortfolioMaintenanceWorkspaceItem(itemId, source) {
    if ((state.portfolioWorkspaceMode || 'properties') !== 'maintenance') return;

    const root = document.getElementById('portfolioComparisonTable');
    if (!root) return;

    if ((state.portfolioMaintenanceView || 'list') !== 'card') {
        renderUnifiedPortfolioWorkspace(false);
        return;
    }

    const existingItem = Array.from(root.querySelectorAll('[data-maint-id][data-maint-source]')).find(element =>
        String(element.getAttribute('data-maint-id')) === String(itemId)
        && String(element.getAttribute('data-maint-source')) === String(source)
    );
    if (!existingItem) {
        renderUnifiedPortfolioWorkspace(false);
        return;
    }

    const item = source === 'recurring'
        ? (state.portfolioRecurringMaintenance || []).find(entry => String(entry._id) === String(itemId))
        : (state.portfolioMaintenance || []).find(entry => String(entry._id) === String(itemId));
    if (!item) {
        renderUnifiedPortfolioWorkspace(false);
        return;
    }

    const replacementHtml = source === 'recurring'
        ? renderPortfolioRecurringMaintenanceCard(item)
        : renderPortfolioMaintenanceRequestCard(item);
    const template = document.createElement('template');
    template.innerHTML = replacementHtml.trim();
    const replacementNode = template.content.firstElementChild;
    if (!replacementNode) {
        renderUnifiedPortfolioWorkspace(false);
        return;
    }

    existingItem.replaceWith(replacementNode);
}

async function refreshPortfolioMaintenanceItem(itemId, source) {
    syncPortfolioMaintenanceOverviewSummary();
    syncPortfolioMaintenanceExecutiveCards();
    rerenderPortfolioMaintenanceWorkspaceItem(itemId, source);
    rerenderPortfolioMaintenanceItem(itemId, source);
}

function formatMaintenanceDateTime(value) {
    if (!value) return 'Not scheduled';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not scheduled';
    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatMaintenanceDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function loadMaintenanceVendors(force = false) {
    if (!force && Array.isArray(state.vendors) && state.vendors.length) {
        return state.vendors;
    }
    const response = await fetch(`${API_URL}/vendors`);
    if (!response.ok) throw new Error('Failed to fetch vendors');
    const vendors = await response.json();
    state.vendors = Array.isArray(vendors) ? vendors : [];
    return state.vendors;
}

async function populateMaintenanceVendorSelect(selectId, selectedId = '', options = {}) {
    const hiddenInput = document.getElementById(selectId);
    if (!hiddenInput) return;
    try {
        await loadMaintenanceVendors();
        const selectedVendor = (state.vendors || []).find(vendor => String(vendor?._id || '') === String(selectedId || ''));
        const wrapper = hiddenInput.closest('.maintenance-vendor-combobox');
        if (wrapper) {
            if (options.emptyLabel) wrapper.dataset.emptyLabel = options.emptyLabel;
            if (options.placeholder) wrapper.dataset.placeholder = options.placeholder;
            const textInput = wrapper.querySelector('.maintenance-vendor-search-input');
            if (textInput && options.placeholder) {
                textInput.placeholder = options.placeholder;
            }
        }
        setMaintenanceVendorComboboxValue(hiddenInput, selectedId, selectedVendor?.name || selectedVendor?.email || '');
    } catch (error) {
        console.error('Error loading maintenance vendors:', error);
        setMaintenanceVendorComboboxValue(hiddenInput, '', '');
    }
}

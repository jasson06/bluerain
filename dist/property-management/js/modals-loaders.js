// Property management: modals loaders.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function getPropertyManagementLoaderOverlay() {
    return document.getElementById('loader');
}

function enablePropertyManagementOverlayFallback() {
    propertyManagementInlineLoaderState.allowOverlayFallback = true;
}

function setPropertyManagementOverlayLoaderVisible(isVisible) {
    const loader = getPropertyManagementLoaderOverlay();
    if (loader) loader.style.display = isVisible ? 'flex' : 'none';
}

function isPropertyManagementLoaderTargetVisible(element) {
    return !!(element && element.isConnected && element.getClientRects().length);
}

function collectPropertyManagementLoaderCandidates(context) {
    const candidates = [];
    const appendCandidate = candidate => {
        if (!(candidate instanceof Element)) return;
        if (candidates.includes(candidate)) return;
        candidates.push(candidate);
    };

    if (context instanceof Element) {
        appendCandidate(context);
    } else if (context && typeof context === 'object') {
        appendCandidate(context.currentTarget);
        appendCandidate(context.target);
    }

    if (typeof window !== 'undefined' && window.event) {
        appendCandidate(window.event.currentTarget);
        appendCandidate(window.event.target);
    }

    appendCandidate(document.activeElement);
    return candidates;
}

function resolvePropertyManagementInlineLoaderTarget(context) {
    const candidates = collectPropertyManagementLoaderCandidates(context);
    for (const candidate of candidates) {
        const target = candidate.matches?.(PROPERTY_MANAGEMENT_INLINE_LOADER_TRIGGER_SELECTOR)
            ? candidate
            : candidate.closest?.(PROPERTY_MANAGEMENT_INLINE_LOADER_TRIGGER_SELECTOR);
        if (isPropertyManagementLoaderTargetVisible(target)) {
            return target;
        }
    }
    return null;
}

function resolvePropertyManagementInlineLoaderScope(target) {
    const scoped = target.closest?.(PROPERTY_MANAGEMENT_INLINE_LOADER_SCOPE_SELECTOR);
    if (!scoped) return target;
    if (/^(TABLE|THEAD|TBODY|TR)$/i.test(scoped.tagName)) {
        return target.closest('td, th, button, [role="button"], form') || target;
    }
    return scoped;
}

function getPropertyManagementInlineLoaderLabel(target) {
    const rawLabel = String(
        target?.getAttribute?.('data-loading-label') ||
        target?.getAttribute?.('aria-label') ||
        target?.innerText ||
        target?.value ||
        ''
    ).replace(/\s+/g, ' ').trim();

    if (!rawLabel) return '';
    if (rawLabel.length > 28) return 'Working';
    return rawLabel;
}

function createPropertyManagementInlineLoaderBadge(label = 'Saving') {
    const badge = document.createElement('span');
    badge.setAttribute('data-inline-loader-badge', 'true');
    badge.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:6px',
        'padding:5px 10px',
        'border-radius:999px',
        'background:rgba(239,246,255,0.96)',
        'color:#1d4ed8',
        'font-size:0.78rem',
        'font-weight:700',
        'box-shadow:0 6px 16px rgba(29,78,216,0.12)',
        'white-space:nowrap'
    ].join(';');

    const spinner = document.createElement('span');
    spinner.style.cssText = [
        'width:12px',
        'height:12px',
        'border:2px solid rgba(29,78,216,0.22)',
        'border-top-color:#1d4ed8',
        'border-radius:50%',
        'animation:spin 0.8s linear infinite',
        'flex:0 0 auto'
    ].join(';');

    const text = document.createElement('span');
    text.textContent = label;

    badge.appendChild(spinner);
    badge.appendChild(text);
    return badge;
}

function beginPropertyManagementInlineLoader(target) {
    const existingId = target.dataset.pmInlineLoaderId;
    if (existingId && propertyManagementInlineLoaderState.entries.has(existingId)) {
        const existingEntry = propertyManagementInlineLoaderState.entries.get(existingId);
        existingEntry.depth += 1;
        propertyManagementInlineLoaderState.stack.push({ kind: 'inline', id: existingId });
        return;
    }

    const entryId = `pm-inline-loader-${++propertyManagementInlineLoaderState.nextId}`;
    const entry = {
        id: entryId,
        target,
        depth: 1,
        mode: 'badge',
        previousHtml: null,
        previousValue: null,
        previousMinWidth: target.style.minWidth,
        previousPointerEvents: target.style.pointerEvents,
        previousPaddingRight: target.style.paddingRight,
        previousDisabled: 'disabled' in target ? target.disabled : null,
        previousAriaBusy: target.getAttribute('aria-busy'),
        previousAriaDisabled: target.getAttribute('aria-disabled'),
        scope: null,
        scopePreviousPosition: '',
        badge: null
    };

    target.dataset.pmInlineLoaderId = entryId;
    target.setAttribute('aria-busy', 'true');
    target.setAttribute('aria-disabled', 'true');
    target.style.pointerEvents = 'none';
    if ('disabled' in target) target.disabled = true;

    if (target.matches('button, .overview-row-action, .panel-link, .tab-btn, .tenant-tab-btn, .maintenance-tab-btn, .applications-tab-btn, .payment-workspace-tab, .mobile-nav-btn, [role="button"]')) {
        entry.mode = 'button';
        entry.previousHtml = target.innerHTML;
        const currentWidth = Math.ceil(target.getBoundingClientRect().width);
        if (currentWidth > 0) {
            target.style.minWidth = `${currentWidth}px`;
        }
        const label = getPropertyManagementInlineLoaderLabel(target);
        const textColor = getComputedStyle(target).color || '#1d4ed8';
        const spinnerMarkup = `<span style="width:12px;height:12px;border:2px solid rgba(148,163,184,0.28);border-top-color:${textColor};border-radius:50%;animation:spin 0.8s linear infinite;flex:0 0 auto;"></span>`;
        const textMarkup = label ? `<span>${escapeHtml(label)}</span>` : '';
        target.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:8px;">${spinnerMarkup}${textMarkup}</span>`;
    } else if (target.matches('input[type="submit"], input[type="button"]')) {
        entry.mode = 'input';
        entry.previousValue = target.value;
        target.value = 'Loading...';
    } else if (target.matches('select')) {
        entry.mode = 'select';
        entry.badge = createPropertyManagementInlineLoaderBadge('Saving');
        target.style.paddingRight = '34px';
        target.insertAdjacentElement('afterend', entry.badge);
    } else {
        entry.mode = 'badge';
        entry.scope = resolvePropertyManagementInlineLoaderScope(target);
        entry.badge = createPropertyManagementInlineLoaderBadge('Saving');
        if (entry.scope) {
            entry.scopePreviousPosition = entry.scope.style.position;
            if (!entry.scope.style.position || entry.scope.style.position === 'static') {
                entry.scope.style.position = 'relative';
            }
            entry.badge.style.position = 'absolute';
            entry.badge.style.top = '10px';
            entry.badge.style.right = '12px';
            entry.badge.style.zIndex = '3';
            entry.scope.appendChild(entry.badge);
        }
    }

    propertyManagementInlineLoaderState.entries.set(entryId, entry);
    propertyManagementInlineLoaderState.stack.push({ kind: 'inline', id: entryId });
}

function endPropertyManagementInlineLoader(entryId) {
    const entry = propertyManagementInlineLoaderState.entries.get(entryId);
    if (!entry) return;

    entry.depth -= 1;
    if (entry.depth > 0) return;

    const { target } = entry;
    if (entry.mode === 'button' && entry.previousHtml !== null) {
        target.innerHTML = entry.previousHtml;
        target.style.minWidth = entry.previousMinWidth;
    } else if (entry.mode === 'input' && entry.previousValue !== null) {
        target.value = entry.previousValue;
    } else if (entry.mode === 'select') {
        target.style.paddingRight = entry.previousPaddingRight;
    }

    if (entry.badge?.parentNode) {
        entry.badge.parentNode.removeChild(entry.badge);
    }
    if (entry.scope && entry.scope.style.position !== entry.scopePreviousPosition) {
        entry.scope.style.position = entry.scopePreviousPosition;
    }

    target.style.pointerEvents = entry.previousPointerEvents;
    if ('disabled' in target && entry.previousDisabled !== null) {
        target.disabled = entry.previousDisabled;
    }
    if (entry.previousAriaBusy === null) {
        target.removeAttribute('aria-busy');
    } else {
        target.setAttribute('aria-busy', entry.previousAriaBusy);
    }
    if (entry.previousAriaDisabled === null) {
        target.removeAttribute('aria-disabled');
    } else {
        target.setAttribute('aria-disabled', entry.previousAriaDisabled);
    }
    delete target.dataset.pmInlineLoaderId;
    propertyManagementInlineLoaderState.entries.delete(entryId);
}

function showLoader(context = null) {
    const inlineTarget = resolvePropertyManagementInlineLoaderTarget(context);
    if (inlineTarget) {
        beginPropertyManagementInlineLoader(inlineTarget);
        return;
    }

    if (!propertyManagementInlineLoaderState.allowOverlayFallback) {
        propertyManagementInlineLoaderState.stack.push({ kind: 'suppressed-overlay' });
        return;
    }

    propertyManagementInlineLoaderState.overlayDepth += 1;
    propertyManagementInlineLoaderState.stack.push({ kind: 'overlay' });
    setPropertyManagementOverlayLoaderVisible(true);
}

function hideLoader() {
    const nextEntry = propertyManagementInlineLoaderState.stack.pop();
    if (!nextEntry) {
        propertyManagementInlineLoaderState.overlayDepth = 0;
        setPropertyManagementOverlayLoaderVisible(false);
        return;
    }

    if (nextEntry.kind === 'inline') {
        endPropertyManagementInlineLoader(nextEntry.id);
        return;
    }

    if (nextEntry.kind === 'suppressed-overlay') {
        return;
    }

    propertyManagementInlineLoaderState.overlayDepth = Math.max(0, propertyManagementInlineLoaderState.overlayDepth - 1);
    if (propertyManagementInlineLoaderState.overlayDepth === 0) {
        setPropertyManagementOverlayLoaderVisible(false);
    }
}

// This is a completely rewritten approach to modal handling
function openModal(modalId) {
    // First verify the modal exists
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with ID "${modalId}" not found`);
        return;
    }
    
    console.log(`Opening modal: ${modalId}`);
    
    // Close all modals first
    document.querySelectorAll('.modal').forEach(m => {
        m.style.display = 'none';
        m.classList.remove('property-drawer-open');
        m.setAttribute('aria-hidden', 'true');
    });
    
    const isMobileGlobalOverview = modalId === 'globalOverviewModal' && window.innerWidth <= 900;

    // Make modal visible using basic display property
    if (!isMobileGlobalOverview) modal.classList.add('property-drawer-open');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('property-drawer-lock');
    if (isMobileGlobalOverview) {
        modal.getBoundingClientRect();
        const showDrawer = () => {
            if (modal.style.display !== 'none') modal.classList.add('property-drawer-open');
        };
        requestAnimationFrame(showDrawer);
        window.setTimeout(showDrawer, 32);
    }
    
    // Add event listener for clicks outside the modal content
    modal.onclick = function(event) {
        if (event.target === modal) {
            closeModal(modalId);
        }
    };
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        const isMobileGlobalOverview = modalId === 'globalOverviewModal' && window.innerWidth <= 900;
        if (isMobileGlobalOverview && modal.classList.contains('property-drawer-open')) {
            modal.classList.remove('property-drawer-open');
            modal.setAttribute('aria-hidden', 'true');
            window.setTimeout(() => {
                if (!modal.classList.contains('property-drawer-open')) modal.style.display = 'none';
                if (!document.querySelector('.modal.property-drawer-open')) document.body.classList.remove('property-drawer-lock');
            }, 300);
            return;
        }
        modal.style.display = 'none';
        modal.classList.remove('property-drawer-open');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal.property-drawer-open')) document.body.classList.remove('property-drawer-lock');
    }
}

async function loadAllUnitsAndTenants() {
    if (!Array.isArray(state.properties) || !state.properties.length) {
        state.allUnits = [];
        state.allTenants = [];
        renderPropertyList();
        return;
    }

    const results = await Promise.all(
        state.properties.map(async (property) => {
            let units = [];
            let tenants = [];

            // Fetch units and tenants for this property in parallel
            const unitsPromise = (async () => {
                try {
                    const unitsRes = await fetch(`${API_URL}/properties/${property._id}/units`);
                    if (unitsRes.ok) {
                        const unitsData = await unitsRes.json();
                        if (unitsData.property && Array.isArray(unitsData.property.units)) {
                            units = unitsData.property.units.map(u => {
                                u.projectId = property._id;
                                return u;
                            });
                        }
                    }
                } catch (e) {
                    console.error(`Error loading units for property ${property._id}:`, e);
                }
            })();

            const tenantsPromise = (async () => {
                try {
                    const tenantsRes = await fetch(`${API_URL}/properties/${property._id}/tenants`);
                    if (tenantsRes.ok) {
                        const tenantsData = await tenantsRes.json();
                        if (Array.isArray(tenantsData)) {
                            tenants = tenantsData;
                        }
                    }
                } catch (e) {
                    console.error(`Error loading tenants for property ${property._id}:`, e);
                }
            })();

            await Promise.all([unitsPromise, tenantsPromise]);
            return { units, tenants };
        })
    );

    const allUnits = [];
    const allTenants = [];
    results.forEach(r => {
        if (r.units && r.units.length) allUnits.push(...r.units);
        if (r.tenants && r.tenants.length) allTenants.push(...r.tenants);
    });

    state.allUnits = allUnits;
    state.allTenants = allTenants;
    // Refresh property list so per-property stats (occupancy, vacancies) are shown once data is loaded
    renderPropertyList();
}

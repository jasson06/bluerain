// Property management: portfolio details.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function renderPortfolioDetails(type, target = {}) {
    const body = target.body || document.getElementById('portfolioDetailsBody');
    const titleEl = target.title || document.getElementById('portfolioDetailsTitle');
    if (!body || !titleEl) return;

    // Track which portfolio details view is currently active so month changes can refresh it
    state.currentPortfolioDetailsType = type;

    const propsById = (state.properties || []).reduce((map, p) => {
        map[String(p._id)] = p;
        return map;
    }, {});

    const unitsById = (state.allUnits || []).reduce((map, u) => {
        if (u && u._id) {
            map[String(u._id)] = u;
        }
        return map;
    }, {});

    if (type === 'applications') {
        titleEl.textContent = body.id === 'globalOverviewBody' && window.innerWidth <= 900 ? 'Applications' : 'Applications & Invites (Portfolio)';
        const allApps = state.applications || [];
        const allInvites = state.invites || [];
        if (!allApps.length && !allInvites.length) {
            body.innerHTML = '<p style="font-size:0.86rem;color:#6b7280;">No applications or invites found.</p>';
            return;
        }

        const combined = [];
        allApps.forEach(a => {
            // Try to derive property/unit from notes JSON when available
            let propertyAddress = '';
            let unitNumber = a.unit || '';
            if (a.notes) {
                try {
                    const n = JSON.parse(a.notes);
                    propertyAddress = n.propertyAddress || propertyAddress;
                    unitNumber = n.unitNumber || unitNumber;
                } catch {}
            }
            const notesCount = Array.isArray(a.notesHistory) ? a.notesHistory.length : 0;
            combined.push({
                kind: 'Application',
                source: 'application',
                id: a._id,
                name: a.name || '',
                email: a.email || '',
                property: propertyAddress,
                unit: unitNumber,
                status: a.status || 'pending',
                date: a.submitted ? new Date(a.submitted) : null,
                notesCount
            });
        });
        allInvites.forEach(inv => {
            const notesCount = Array.isArray(inv.notesHistory) ? inv.notesHistory.length : 0;
            const openCount = typeof inv.openCount === 'number' ? inv.openCount : 0;
            const lastOpened = inv.openedAt ? new Date(inv.openedAt) : null;
            combined.push({
                kind: 'Invite',
                source: 'invite',
                id: inv._id,
                name: inv.name || '',
                email: inv.email || '',
                property: inv.propertyName || '',
                unit: inv.unitNumber || '',
                status: inv.status || 'sent',
                date: inv.sentAt ? new Date(inv.sentAt) : null,
                notesCount,
                openCount,
                lastOpened,
                applicationUrl: inv.applicationUrl || ''
            });
        });

        combined.sort((a, b) => {
            const da = a.date ? a.date.getTime() : 0;
            const db = b.date ? b.date.getTime() : 0;
            return db - da;
        });

        const rowsHtml = combined.map(item => {
            const dateStr = item.date ? item.date.toLocaleString('en-US') : '—';
            const lastOpenedStr = item.lastOpened ? item.lastOpened.toLocaleString('en-US') : '';
            const dataName = (item.name || '').toLowerCase().replace(/"/g,'&quot;');
            const dataEmail = (item.email || '').toLowerCase().replace(/"/g,'&quot;');
            const dataProp = (item.property || '').toLowerCase().replace(/"/g,'&quot;');
            const dataUnit = String(item.unit || '').toLowerCase().replace(/"/g,'&quot;');
            const dataStatus = (item.status || '').toLowerCase().replace(/"/g,'&quot;');
            const dataType = item.kind.toLowerCase();
            let dataNotes = '';
            let statusCellHtml = item.status;
            if (item.source === 'application') {
                const app = (state.applications || []).find(a => String(a._id) === String(item.id));
                if (app && app.notes) {
                    try { dataNotes = encodeURIComponent(app.notes); } catch {}
                }
                const safeName = (item.name || '').replace(/"/g,'&quot;');
                const safeEmail = (item.email || '').replace(/"/g,'&quot;');
                const safePhone = (app && app.phone ? String(app.phone) : '').replace(/"/g,'&quot;');
                const unitNumber = String(item.unit || '').replace(/"/g,'&quot;');
                const moveInIso = (app && app.moveIn) ? (() => { try { const d = new Date(app.moveIn); return !isNaN(d.getTime()) ? d.toISOString() : ''; } catch { return ''; } })() : '';
                const statusVal = (item.status || 'pending').toLowerCase();
                statusCellHtml = `
                    <select class="portfolio-app-status-select"
                            data-app-id="${item.id || ''}"
                            data-name="${safeName}"
                            data-email="${safeEmail}"
                            data-phone="${safePhone}"
                            data-unit="${unitNumber}"
                            data-movein="${moveInIso}"
                            data-notes="${dataNotes}"
                            style="padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;background:#fff;">
                        <option value="pending" ${statusVal==='pending' ? 'selected' : ''}>Pending</option>
                        <option value="approved" ${statusVal==='approved' ? 'selected' : ''}>Approved</option>
                        <option value="rejected" ${statusVal==='rejected' ? 'selected' : ''}>Rejected</option>
                    </select>`;
            }
            const notesBadge = `<button class="portfolio-notes-link" data-notes-source="${item.source}" data-notes-id="${item.id || ''}" style="background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;">
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:0.8rem;">
                        <i class="fas fa-sticky-note"></i>
                        ${item.notesCount || 0}
                    </span>
                </button>`;
            const safeLink = (item.applicationUrl || '').replace(/"/g,'&quot;');
            const copyBtn = (item.source === 'invite' && safeLink)
                ? `<button type="button" class="icon-copy-btn portfolio-invite-copy-link" data-link="${safeLink}" title="Copy invite URL"><i class="fas fa-copy"></i></button>`
                : '';
            const typeCell = item.source === 'application'
                ? `<a href="/applications/review/${item.id}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;cursor:pointer;">${item.kind}</a>`
                : (item.source === 'invite'
                    ? `<span style="display:inline-flex;align-items:center;gap:6px;">${item.kind}${copyBtn}</span>`
                    : item.kind);
            const dateCell = item.source === 'invite'
                ? `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;"><span>${dateStr}</span>${lastOpenedStr ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#ecfdf3;color:#16a34a;font-size:0.75rem;">Opens: ${typeof item.openCount === 'number' ? item.openCount : 0} • Last opened: ${lastOpenedStr}</span>` : `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#ecfdf3;color:#16a34a;font-size:0.75rem;">Opens: ${typeof item.openCount === 'number' ? item.openCount : 0}</span>`}</div>`
                : dateStr;
            return `
                <tr data-name="${dataName}" data-email="${dataEmail}" data-property="${dataProp}" data-unit="${dataUnit}" data-status="${dataStatus}" data-type="${dataType}" ${item.source === 'application' ? `data-app-id="${item.id || ''}" data-notes="${dataNotes}"` : ''}${item.source === 'invite' ? ` data-invite-id="${item.id || ''}"` : ''}>
                    <td data-label="Type">${typeCell}</td>
                    <td data-label="Name">${item.name || '—'}</td>
                    <td class="mobile-card-wide" data-label="Email">${item.email || '—'}</td>
                    <td class="mobile-card-wide" data-label="Property">${item.property || '—'}</td>
                    <td data-label="Unit">${item.unit || '—'}</td>
                    <td data-label="Status">${statusCellHtml}</td>
                    <td class="mobile-card-wide" data-label="Date">${dateCell}</td>
                    <td data-label="Notes">${notesBadge}</td>
                </tr>`;
        }).join('');

        body.innerHTML = `
            <div id="portfolioDetailsFilterBar" style="margin-bottom:8px;border-radius:12px;padding:0;display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;position:relative;">
                <div style="position:relative;flex:1 1 100%;min-width:240px;display:flex;align-items:center;gap:6px;justify-content:flex-start;">
                    <i class="fas fa-magnifying-glass" style="color:#6b7280;margin-left:4px;"></i>
                    <input id="portfolioDetailsSearchBar" type="text" placeholder="Search list by" title="Try: name:, email:, property:, unit:, status:, type:" style="flex:0 1 320px;max-width:280px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:0.9rem;" />
                    <button type="button" class="btn-secondary" id="clearPortfolioDetailsFiltersBtn" title="Clear search" aria-label="Clear application search" style="margin-right:4px;padding:6px 8px;font-size:0.7rem;"><i class="fas fa-xmark" aria-hidden="true"></i></button>
                </div>
                <div id="portfolioDetailsActiveFilterChips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 8px 0 26px;flex:1 1 100%;"></div>
                <div id="portfolioDetailsSearchSuggestions" style="position:absolute;top:40px;left:6px;right:auto;min-width:240px;max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:4px 0;display:none;z-index:1000;max-height:260px;overflow:auto;">
                    <div id="portfolioDetailsSuggestHeader" style="padding:8px 12px;font-size:.85em;color:#374151;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
                        <span id="portfolioDetailsSuggestTitle">Choose a filter</span>
                        <button id="portfolioDetailsSuggestBack" style="display:none;background:transparent;border:none;color:#217dbb;cursor:pointer;font-weight:600;">Back</button>
                    </div>
                    <ul id="portfolioDetailsSuggestList" style="list-style:none;margin:0;padding:4px 0;"></ul>
                    <ul id="portfolioDetailsSuggestValues" style="list-style:none;margin:0;padding:4px 0;display:none;"></ul>
                    <div style="border-top:1px solid #eef2f7;margin-top:4px;padding:6px 10px;font-size:.8em;color:#6b7280;">Use tokens like <strong>name:</strong> or <strong>status:</strong> for precise filters.</div>
                </div>
            </div>
            <div data-portfolio-apps-header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
                <div style="font-size:0.9rem;color:#6b7280;">Applications & invites across all properties.</div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <div id="portfolioAppsTypeTags" style="display:inline-flex;gap:6px;flex-wrap:wrap;">
                        <button type="button" class="portfolio-apps-tag-btn" data-type="application"><i class="fas fa-file-lines" aria-hidden="true"></i> Applications</button>
                        <button type="button" class="portfolio-apps-tag-btn" data-type="invite"><i class="fas fa-paper-plane" aria-hidden="true"></i> Invites</button>
                    </div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="mobile-overview-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Property</th>
                            <th>Unit</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody id="portfolioDetailsTbody">
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>`;

        // By default, start this view filtered to Applications.
        // When an inline portfolio invite edit sets
        // state.keepPortfolioTypeFilterOnNextRender, preserve whatever
        // type filter (Applications or Invites) was active.
        if (!state.keepPortfolioTypeFilterOnNextRender) {
            window.__portfolioDetailsAccumulatedQuery = 'type:application';
        } else {
            state.keepPortfolioTypeFilterOnNextRender = false;
        }
        initializePortfolioDetailsSearch();
        renderFilteredPortfolioDetailsRows();

        // Wire Applications/Invites type tags inside the portfolio view
        (function setupPortfolioAppsTypeTags() {
            const container = document.getElementById('portfolioAppsTypeTags');
            if (!container) return;
            const buttons = Array.from(container.querySelectorAll('.portfolio-apps-tag-btn'));
            if (!buttons.length) return;
            const getCurrentTypeFromQuery = () => {
                const combined = `${(window.__portfolioDetailsAccumulatedQuery || '').trim()}`.trim();
                if (!combined) return 'application';
                const { tokens } = parsePortfolioDetailsSearch(combined);
                if (tokens.typeList && tokens.typeList.length) {
                    return tokens.typeList[0];
                }
                return 'application';
            };
            const syncActiveFromFilter = () => {
                const currentType = getCurrentTypeFromQuery();
                buttons.forEach(b => {
                    const t = b.getAttribute('data-type') || '';
                    b.classList.toggle('portfolio-apps-tag-active', t === currentType);
                });
                container.classList.toggle('portfolio-apps-type-invite', currentType === 'invite');
            };
            const applyTypeFilter = (selectedType) => {
                const input = document.getElementById('portfolioDetailsSearchBar');
                const combined = `${(window.__portfolioDetailsAccumulatedQuery || '').trim()} ${(input?.value || '').trim()}`.trim();
                const { tokens } = parsePortfolioDetailsSearch(combined);
                // Replace type filter with the selected one
                tokens.typeList = selectedType ? [selectedType] : [];
                const parts = [];
                if (tokens.nameList.length) parts.push(`name:${tokens.nameList.join(',')}`);
                if (tokens.propertyList.length) parts.push(`property:${tokens.propertyList.join(',')}`);
                if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
                if (tokens.statusList.length) parts.push(`status:${tokens.statusList.join(',')}`);
                if (tokens.typeList.length) parts.push(`type:${tokens.typeList.join(',')}`);
                if (tokens.balanceFlags && tokens.balanceFlags.length) parts.push(`balance:${tokens.balanceFlags.join(',')}`);
                window.__portfolioDetailsAccumulatedQuery = parts.join(' ');
                if (input) input.value = '';
                renderFilteredPortfolioDetailsRows();
            };
            // Set initial active tag based on current type filter
            syncActiveFromFilter();
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const selected = btn.getAttribute('data-type') || '';
                    buttons.forEach(b => {
                        const isActive = b === btn;
                        b.classList.toggle('portfolio-apps-tag-active', isActive);
                    });
                    container.classList.toggle('portfolio-apps-type-invite', selected === 'invite');
                    applyTypeFilter(selected);
                });
            });
        })();

        // Wire notes badge clicks, status changes, and inline edit for applications in portfolio view
        const detailsTbody = body.querySelector('#portfolioDetailsTbody');
        if (detailsTbody) {
            detailsTbody.querySelectorAll('.portfolio-notes-link').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const src = btn.getAttribute('data-notes-source');
                    const id = btn.getAttribute('data-notes-id');
                    if (!id || !src) return;
                    if (src === 'application') {
                        openNotesDrawerForApplication(id);
                    } else if (src === 'invite') {
                        openNotesDrawerForInvite(id);
                    }
                });
            });

            detailsTbody.querySelectorAll('tr[data-app-id]').forEach(row => {
                row.addEventListener('click', (e) => {
                    const target = e.target;
                    if (target.closest('.portfolio-notes-link') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
                        return;
                    }
                    if (row.dataset.editing === 'true') return;
                    const id = row.getAttribute('data-app-id');
                    if (!id) return;
                    const app = (state.applications || []).find(a => String(a._id) === String(id));
                    if (!app) return;
                    enterPortfolioApplicationEditMode(row, app);
                });
            });

            // Change handler for application status in portfolio Applications view
            detailsTbody.addEventListener('change', async (e) => {
                const select = e.target.closest('select');
                if (!select || !select.classList.contains('portfolio-app-status-select')) return;

                const row = select.closest('tr[data-app-id]');
                if (!row) return;
                const appId = row.getAttribute('data-app-id');
                if (!appId) return;

                const newStatus = select.value;
                try {
                    if (typeof showLoader === 'function') showLoader();

                    // Save status only
                    const res = await fetch(`/api/rental-applications/${appId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    if (!res.ok) throw new Error('Failed to update application status');
                    const idx = (state.applications || []).findIndex(a => String(a._id) === String(appId));
                    if (idx >= 0) state.applications[idx].status = newStatus;
                    if (typeof showNotification === 'function') {
                        showNotification('Application status updated', 'success');
                    }

                    // On approval, map to the correct property and prefill tenant form
                    if (newStatus === 'approved' && typeof prefillTenantFromApplication === 'function') {
                        const app = (state.applications || []).find(a => String(a._id) === String(appId));
                        if (app) {
                            let unitNumber = app.unit || '';
                            let propertyAddress = '';
                            if (app.notes) {
                                try {
                                    const n = JSON.parse(app.notes);
                                    unitNumber = n.unitNumber || unitNumber;
                                    propertyAddress = n.propertyAddress || '';
                                } catch {}
                            }

                            // Try to resolve the property for this application
                            let targetProperty = null;
                            if (Array.isArray(state.properties) && state.properties.length) {
                                const addrLower = (propertyAddress || '').toLowerCase().trim();
                                if (addrLower) {
                                    targetProperty = state.properties.find(p => {
                                        const addr = p.address || {};
                                        const line1 = (addr.addressLine1 || '').toLowerCase();
                                        const full = typeof formatAddress === 'function'
                                            ? String(formatAddress(addr)).toLowerCase()
                                            : `${addr.addressLine1 || ''} ${addr.city || ''} ${addr.state || ''}`.toLowerCase();
                                        return full.includes(addrLower) || addrLower.includes(line1);
                                    }) || null;
                                }
                            }

                            // Fallback: try to match by unit number across all units
                            if (!targetProperty && Array.isArray(state.allUnits) && state.allUnits.length && unitNumber) {
                                const matchingUnits = state.allUnits.filter(u => String(u.number) === String(unitNumber));
                                if (matchingUnits.length === 1) {
                                    const mu = matchingUnits[0];
                                    const pid = mu.projectId || mu.propertyId || mu.project;
                                    if (pid && Array.isArray(state.properties)) {
                                        targetProperty = state.properties.find(p => String(p._id) === String(pid)) || null;
                                    }
                                }
                            }

                            // If we resolved a property, switch context so unit mapping works
                            if (targetProperty && typeof selectProperty === 'function') {
                                try {
                                    await selectProperty(targetProperty._id);
                                } catch (selErr) {
                                    console.warn('Error selecting property for application approval:', selErr);
                                }
                            }

                            let encodedNotes = '';
                            if (app.notes) {
                                try { encodedNotes = encodeURIComponent(app.notes); } catch {}
                            }

                            const appData = {
                                name: app.name || '',
                                phone: app.phone || '',
                                email: app.email || '',
                                unit: unitNumber,
                                moveIn: app.moveIn || '',
                                notes: encodedNotes
                            };

                            try {
                                prefillTenantFromApplication(appData);
                                if (typeof openModal === 'function') {
                                    openModal('addTenantModal');
                                }
                            } catch (err) {
                                console.warn('Error prefilling tenant from portfolio application:', err);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Portfolio application status update error:', err);
                    if (typeof showNotification === 'function') {
                        showNotification('Could not update status', 'error');
                    }
                } finally {
                    if (typeof hideLoader === 'function') hideLoader();
                }
            });

            detailsTbody.querySelectorAll('tr[data-invite-id]').forEach(row => {
                row.addEventListener('click', (e) => {
                    const target = e.target;
                    if (target.closest('.portfolio-notes-link') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
                        return;
                    }
                    if (row.dataset.editing === 'true') return;
                    const id = row.getAttribute('data-invite-id');
                    if (!id) return;
                    const invite = (state.invites || []).find(x => String(x._id) === String(id));
                    if (!invite) return;
                    enterPortfolioInviteEditMode(row, invite);
                });
            });

            // Wire copy buttons for invite rows in Applications & Invites (Portfolio)
            detailsTbody.querySelectorAll('.portfolio-invite-copy-link').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = btn.getAttribute('data-link');
                    if (!url) return;
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(url);
                        } else {
                            const tempInput = document.createElement('input');
                            tempInput.value = url;
                            document.body.appendChild(tempInput);
                            tempInput.select();
                            document.execCommand('copy');
                            document.body.removeChild(tempInput);
                        }
                        if (typeof showNotification === 'function') {
                            showNotification('Invite link copied', 'success');
                        }
                    } catch (err) {
                        console.error('Copy portfolio invite link failed', err);
                        if (typeof showNotification === 'function') {
                            showNotification('Could not copy link', 'error');
                        }
                    }
                });
            });
        }

        return;
    }

    if (type === 'tenants') {
        titleEl.textContent = 'All Tenants (Portfolio)';
        const tenants = state.allTenants || [];
        if (!tenants.length) {
            body.innerHTML = '<p style="font-size:0.86rem;color:#6b7280;">No tenants found across the portfolio.</p>';
            return;
        }

        const rowsHtml = tenants.map(t => {
            const name = t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Tenant';
            const unitId = t.unitId?._id || t.unitId;
            let unitLabel = '—';
            if (unitId && unitsById[String(unitId)]) {
                const u = unitsById[String(unitId)];
                unitLabel = u.number || u.unitNumber || u.name || u.label || '—';
            } else {
                unitLabel = t.unitNumber || t.unit || '—';
            }
            const pid = t.projectId || t.propertyId;
            const propName = pid && propsById[String(pid)] ? propsById[String(pid)].name : '—';
            const phone = t.phone || t.tenantPhone || '—';
            const email = t.email || t.tenantEmail || '—';
            const leaseStart = t.leaseStart ? new Date(t.leaseStart).toLocaleDateString() : '—';
            const leaseEnd = t.leaseEnd ? new Date(t.leaseEnd).toLocaleDateString() : '—';
            const status = t.leaseStatus || 'unknown';
            const notesCount = Array.isArray(t.notesHistory) ? t.notesHistory.length : 0;
            return `
                <tr>
                    <td>${propName}</td>
                    <td>${unitLabel}</td>
                    <td>${name}</td>
                    <td>${phone}</td>
                    <td>${email}</td>
                    <td>${leaseStart} - ${leaseEnd}</td>
                    <td>${status}</td>
                </tr>`;
        }).join('');

        body.innerHTML = `
            <div id="portfolioTenantsFilterBar" style="margin-bottom:8px;border-radius:12px;padding:0;display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;position:relative;">
                <div style="position:relative;flex:1 1 100%;min-width:240px;display:flex;align-items:center;gap:6px;justify-content:flex-start;">
                    <i class="fas fa-magnifying-glass" style="color:#6b7280;margin-left:4px;"></i>
                    <input id="portfolioTenantsSearchBar" type="text" placeholder="Search tenants by" title="Try: name:, email:, phone:, property:, unit:, status:" style="flex:0 1 320px;max-width:280px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:0.9rem;" />
                    <button class="btn-secondary" id="clearPortfolioTenantsFiltersBtn" title="Clear search" style="margin-right:4px;padding:6px 8px;font-size:0.7rem;">Clear</button>
                </div>
                <div id="portfolioTenantsActiveFilterChips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 8px 0 26px;flex:1 1 100%;"></div>
                <div id="portfolioTenantsSearchSuggestions" style="position:absolute;top:40px;left:6px;right:auto;min-width:240px;max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:4px 0;display:none;z-index:1000;max-height:260px;overflow:auto;">
                    <div id="portfolioTenantsSuggestHeader" style="padding:8px 12px;font-size:.85em;color:#374151;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
                        <span id="portfolioTenantsSuggestTitle">Choose a filter</span>
                        <button id="portfolioTenantsSuggestBack" style="display:none;background:transparent;border:none;color:#217dbb;cursor:pointer;font-weight:600;">Back</button>
                    </div>
                    <ul id="portfolioTenantsSuggestList" style="list-style:none;margin:0;padding:4px 0;"></ul>
                    <ul id="portfolioTenantsSuggestValues" style="list-style:none;margin:0;padding:4px 0;display:none;"></ul>
                    <div style="border-top:1px solid #eef2f7;margin-top:4px;padding:6px 10px;font-size:.8em;color:#6b7280;">Use tokens like <strong>name:</strong> or <strong>status:</strong> for precise filters.</div>
                </div>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Property</th>
                            <th>Unit</th>
                            <th>Tenant</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Lease Dates</th>
                            <th>Status</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody id="portfolioTenantsTbody">
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>`;

        // Initialize smart search for portfolio tenants with default status:active filter
        initializePortfolioTenantsSearch();
        window.__portfolioTenantsAccumulatedQuery = 'status:active';
        renderFilteredPortfolioTenants();
        return;
    }

    if (type === 'rent') {
        titleEl.textContent = 'Tenants with Outstanding Balance';
        const rows = state.portfolioTenantsWithBalance || [];
        if (!rows.length) {
            body.innerHTML = '<p style="font-size:0.86rem;color:#6b7280;">No tenants with outstanding balance for this month.</p>';
            return;
        }
        const htmlRows = rows.map(({ tenant, remainingRent, expectedMonthly, paidThisMonth, outOfLease }) => {
            const name = tenant.fullName || tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Tenant';
            const unitId = tenant.unitId?._id || tenant.unitId;
            let unitLabel = '—';
            if (unitId && unitsById[String(unitId)]) {
                const u = unitsById[String(unitId)];
                unitLabel = u.number || u.unitNumber || u.name || u.label || '—';
            } else {
                unitLabel = tenant.unitNumber || tenant.unit || '—';
            }
            const pid = tenant.projectId || tenant.propertyId;
            const propName = pid && propsById[String(pid)] ? propsById[String(pid)].name : '—';
            const dataProp = (propName || '').toLowerCase().replace(/"/g,'&quot;');
            const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g,'&quot;');
            const dataName = (name || '').toLowerCase().replace(/"/g,'&quot;');
            const dataStatus = (tenant.leaseStatus || '').toLowerCase().replace(/"/g,'&quot;');
            const isOutOfLease = !!outOfLease;
            const numericRemaining = Number(remainingRent) || 0;
            const dataBalance = numericRemaining > 0.01 ? 'with-balance' : 'no-balance';

            const notesCount = Array.isArray(tenant.notesHistory) ? tenant.notesHistory.length : 0;
            const notesBadge = `<button class="portfolio-tenant-notes-link" data-tenant-id="${tenant._id}" style="background:none;border:none;padding:0;margin:0;font:inherit;cursor:pointer;">\n                <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:0.8rem;">\n                    <i class=\"fas fa-sticky-note\"></i>\n                    ${notesCount}\n                </span>\n            </button>`;

            const expectedCellHtml = isOutOfLease
                ? '<span style="color:#9ca3af;">N/A</span>'
                : `$${(expectedMonthly || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

            const balanceDisplay = `$${numericRemaining.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
            let balanceCellHtml;
            if (isOutOfLease) {
                balanceCellHtml = '<span style="color:#9ca3af;">N/A</span>';
            } else if (Math.abs(numericRemaining) <= 0.01) {
                balanceCellHtml = `<span style="color:#16a34a;font-weight:600;" title="Paid in full"><i class="fas fa-circle-check" aria-hidden="true" style="margin-right:4px;"></i>${balanceDisplay}</span>`;
            } else {
                balanceCellHtml = balanceDisplay;
            }
            return `
                <tr data-property="${dataProp}" data-unit="${dataUnit}" data-name="${dataName}" data-status="${dataStatus}" data-balance="${dataBalance}" data-tenant-id="${tenant._id}" data-property-id="${pid || ''}">
                    <td>${propName}</td>
                    <td>${unitLabel}</td>
                    <td>${name}</td>
                    <td>${expectedCellHtml}</td>
                    <td>$${(paidThisMonth || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td>${balanceCellHtml}</td>
                    <td>${notesBadge}</td>
                    <td class="portfolio-rent-actions-cell"><button type="button" class="btn-secondary portfolio-record-payment-btn" style="padding:4px 8px;font-size:0.8rem;">+Payment</button></td>
                </tr>`;
        }).join('');
        body.innerHTML = `
            <div id="portfolioDetailsFilterBar" style="margin-bottom:8px;border-radius:12px;padding:0;display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;position:relative;">
                <div style="position:relative;flex:1 1 100%;min-width:240px;display:flex;align-items:center;gap:6px;justify-content:flex-start;flex-wrap:wrap;">
                    <i class="fas fa-magnifying-glass" style="color:#6b7280;margin-left:4px;"></i>
                    <input id="portfolioDetailsSearchBar" type="text" placeholder="Search list by" title="Try: name:, property:, unit:, status:, type:" style="flex:0 1 260px;max-width:260px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:0.9rem;" />
                    <input type="month" id="portfolioRentMonthPicker" style="font-size:0.8rem;border:1px solid #e5e7eb;border-radius:8px;padding:4px 8px;margin-left:4px;" title="Select month for rent metrics" />
                    <button class="btn-secondary" id="clearPortfolioDetailsFiltersBtn" title="Clear search" style="margin-right:4px;padding:6px 8px;font-size:0.7rem;">Clear</button>
                </div>
                <div id="portfolioDetailsActiveFilterChips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 8px 0 26px;flex:1 1 100%;"></div>
                <div id="portfolioDetailsSearchSuggestions" style="position:absolute;top:40px;left:6px;right:auto;min-width:240px;max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:4px 0;display:none;z-index:1000;max-height:260px;overflow:auto;">
                    <div id="portfolioDetailsSuggestHeader" style="padding:8px 12px;font-size:.85em;color:#374151;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
                        <span id="portfolioDetailsSuggestTitle">Choose a filter</span>
                        <button id="portfolioDetailsSuggestBack" style="display:none;background:transparent;border:none;color:#217dbb;cursor:pointer;font-weight:600;">Back</button>
                    </div>
                    <ul id="portfolioDetailsSuggestList" style="list-style:none;margin:0;padding:4px 0;"></ul>
                    <ul id="portfolioDetailsSuggestValues" style="list-style:none;margin:0;padding:4px 0;display:none;"></ul>
                    <div style="border-top:1px solid #eef2f7;margin-top:4px;padding:6px 10px;font-size:.8em;color:#6b7280;">Use tokens like <strong>name:</strong> or <strong>status:</strong> for precise filters.</div>
                </div>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Property</th>
                            <th>Unit</th>
                            <th>Tenant</th>
                            <th>Expected</th>
                            <th>Paid</th>
                            <th>Balance</th>
                            <th>Updates</th>
                            <th style="width:1%;"></th>
                        </tr>
                    </thead>
                    <tbody id="portfolioDetailsTbody">
                        ${htmlRows}
                    </tbody>
                </table>
            </div>`;
        // Default rent details view (no preset filters)
        window.__portfolioDetailsAccumulatedQuery = '';
        initializePortfolioDetailsSearch();
        renderFilteredPortfolioDetailsRows();

        // Initialize and wire the portfolio rent month picker beside the search bar
        (function setupPortfolioRentMonthPicker() {
            const monthInput = document.getElementById('portfolioRentMonthPicker');
            if (!monthInput) return;
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const currentVal = `${y}-${m}`;
            if (!state.portfolioRentMonth) state.portfolioRentMonth = currentVal;
            monthInput.value = state.portfolioRentMonth;
            if (monthInput.dataset.bound === 'true') return;
            monthInput.addEventListener('change', async () => {
                const v = monthInput.value;
                state.portfolioRentMonth = v || currentVal;
                try {
                    showLoader();
                    await renderPortfolioOverview();
                    // Refresh current details tab (rent or others) based on new month
                    if (state.currentPortfolioDetailsType) {
                        renderPortfolioDetails(state.currentPortfolioDetailsType);
                    }
                } finally {
                    hideLoader();
                }
            });
            monthInput.dataset.bound = 'true';
        })();

        // Inline edit for Expected rent: click the Expected column cell to edit, save on blur
        (function setupInlineExpectedRentEditing() {
            const tbody = body.querySelector('#portfolioDetailsTbody');
            if (!tbody) return;
            tbody.addEventListener('click', async (evt) => {
            const cell = evt.target.closest('td');
            if (!cell) return;
            const row = cell.closest('tr');
                if (!row) return;
            const cellIndex = Array.prototype.indexOf.call(row.children, cell);
            // Only activate edit mode when clicking the Expected column (4th column, index 3)
            if (cellIndex !== 3) return;
                const tenantId = row.getAttribute('data-tenant-id');
                if (!tenantId) return;
            const expectedCell = cell;
                if (!expectedCell || expectedCell.querySelector('input')) return;

                const currentText = (expectedCell.textContent || '').trim();
                const numericMatch = currentText.replace(/[^0-9.\-]/g, '');
                const originalValue = numericMatch || '';

                const input = document.createElement('input');
                input.type = 'number';
                input.step = '0.01';
                input.min = '0';
                input.value = originalValue;
                input.className = 'app-inline-input';

                expectedCell.textContent = '';
                expectedCell.classList.add('expected-rent-editing');
                row.dataset.editing = 'true';
                expectedCell.appendChild(input);
                input.focus();
                input.select();

                const period = (state.portfolioRentMonth && /^\d{4}-\d{2}$/.test(state.portfolioRentMonth))
                    ? state.portfolioRentMonth
                    : (() => {
                        const now = new Date();
                        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    })();

                const restoreCell = (valueStr) => {
                    const num = Number(valueStr) || 0;
                    expectedCell.textContent = `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    expectedCell.classList.remove('expected-rent-editing');
                    delete row.dataset.editing;
                };

                const handleBlur = async () => {
                    input.removeEventListener('blur', handleBlur);
                    input.removeEventListener('keydown', handleKey);
                    const newRaw = input.value.trim();
                    if (newRaw === originalValue) {
                        restoreCell(originalValue);
                        return;
                    }
                    const expectedRent = newRaw === '' ? null : Number(newRaw);
                    if (expectedRent !== null && !Number.isFinite(expectedRent)) {
                        restoreCell(originalValue);
                        showNotification('Invalid expected rent amount', 'error');
                        return;
                    }

                    showLoader();
                    try {
                        // Preserve any existing late fee override while updating expected rent
                        const existingOv = await fetchMonthOverride(tenantId, period);
                        const payload = {
                            expectedRent,
                            lateFee: existingOv?.lateFee ?? null,
                            lateFeeMode: existingOv?.lateFeeMode === 'percent' ? 'percent' : 'amount'
                        };
                        const resp = await fetch(`${API_URL}/tenants/${tenantId}/monthly-overrides/${period}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!resp.ok) throw new Error('Failed to save expected rent override');

                        upsertLocalTenantMonthlyOverride(tenantId, period, payload);
                        upsertLocalAllTenantMonthlyOverride(tenantId, period, payload);

                        showNotification('Expected rent updated', 'success');
                        await renderPortfolioOverview();
                        renderPortfolioDetails('rent');
                    } catch (err) {
                        console.error(err);
                        restoreCell(originalValue);
                        showNotification('Error saving expected rent', 'error');
                    } finally {
                        hideLoader();
                    }
                };

                const handleKey = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        input.value = originalValue;
                        input.blur();
                    }
                };

                input.addEventListener('blur', handleBlur);
                input.addEventListener('keydown', handleKey);
            });
        })();

        // +Payment button is now handled purely via CSS hover/selection transitions

        // Per-row Record Payment button for tenants with outstanding balance
        (function setupPortfolioRentRecordPayment() {
            const tbody = body.querySelector('#portfolioDetailsTbody');
            if (!tbody) return;
            tbody.addEventListener('click', (evt) => {
                const btn = evt.target.closest('.portfolio-record-payment-btn');
                if (!btn) return;
                const row = btn.closest('tr');
                if (!row) return;
                const tenantId = row.getAttribute('data-tenant-id');
                const propertyId = row.getAttribute('data-property-id') || '';
                if (!tenantId) {
                    showNotification('Unable to determine tenant for payment', 'error');
                    return;
                }
                openPaymentModalForTenantAndProperty(tenantId, propertyId || undefined, false);
            });
        })();

        // Row selection & Tenant Notes -> update sidebar notes panel
        (function setupPortfolioRentSelectionAndNotes() {
            const tbody = body.querySelector('#portfolioDetailsTbody');
            if (!tbody) return;

            function selectRow(row) {
                Array.from(tbody.querySelectorAll('tr.selected-portfolio-row')).forEach(r => r.classList.remove('selected-portfolio-row'));
                row.classList.add('selected-portfolio-row');
                const tenantId = row.getAttribute('data-tenant-id');
                if (!tenantId) return;
                state.portfolioNotesContext = { type: 'tenant', id: tenantId };
                renderPortfolioNotesPanel();
            }

            // Clicking anywhere on the row (except interactive controls) selects it
            tbody.addEventListener('click', (evt) => {
                const target = evt.target;
                if (target.closest('.portfolio-record-payment-btn') ||
                    target.closest('button') ||
                    target.closest('input') ||
                    target.closest('select') ||
                    target.closest('a')) {
                    return;
                }
                const row = target.closest('tr[data-tenant-id]');
                if (!row) return;
                selectRow(row);
            });

            // Clicking the notes badge also selects the row and focuses notes panel
            tbody.querySelectorAll('.portfolio-tenant-notes-link').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const row = btn.closest('tr[data-tenant-id]');
                    if (!row) return;
                    selectRow(row);
                });
            });
        })();
        return;
    }

    if (type === 'maintenance') {
        titleEl.textContent = 'Portfolio Maintenance';
        if (!Array.isArray(state.vendors) || !state.vendors.length) {
            const maintenanceLoadingHtml = `
                <div class="portfolio-maintenance-shell">
                    <div class="portfolio-maintenance-sticky-bar">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
                            
                        </div>
                    </div>
                    <div class="portfolio-maintenance-scroll" style="display:flex;align-items:center;justify-content:center;min-height:240px;">
                        <div style="display:grid;justify-items:center;gap:12px;padding:24px 18px;color:#475569;">
                            <div style="width:34px;height:34px;border:4px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                            <div style="font-size:0.92rem;font-weight:600;">Loading maintenance...</div>
                        </div>
                    </div>
                </div>`;
            if (!state._portfolioMaintenanceVendorsLoading) {
                state._portfolioMaintenanceVendorsLoading = true;
                body.innerHTML = maintenanceLoadingHtml;
                loadMaintenanceVendors()
                    .then(() => {
                        if (state.currentPortfolioDetailsType === 'maintenance') {
                            renderPortfolioDetails('maintenance');
                        }
                    })
                    .catch((error) => {
                        console.error('Error loading portfolio maintenance vendors:', error);
                        if (state.currentPortfolioDetailsType === 'maintenance') {
                            body.innerHTML = '<p style="font-size:0.86rem;color:#b91c1c;">Unable to load vendor options.</p>';
                        }
                    })
                    .finally(() => {
                        state._portfolioMaintenanceVendorsLoading = false;
                    });
            } else {
                body.innerHTML = maintenanceLoadingHtml;
            }
            return;
        }
        const requestItems = state.portfolioMaintenance || [];
        const recurringItems = state.portfolioRecurringMaintenance || [];
        if (!requestItems.length && !recurringItems.length) {
            body.innerHTML = '<p style="font-size:0.86rem;color:#6b7280;">No maintenance requests or recurring schedules found.</p>';
            return;
        }
        const portfolioViewMeta = getMaintenanceViewToggleMeta(portfolioMaintenanceListView);
        const requestCardsHtml = requestItems.map(request => renderPortfolioMaintenanceRequestCard(request)).join('');
        const requestRowsHtml = requestItems.map(request => renderPortfolioMaintenanceRequestRow(request)).join('');
        const recurringCardsHtml = recurringItems.map(schedule => renderPortfolioRecurringMaintenanceCard(schedule)).join('');
        const recurringRowsHtml = recurringItems.map(schedule => renderPortfolioRecurringMaintenanceRow(schedule)).join('');
        const maintenanceContentHtml = portfolioMaintenanceListView
            ? `
                <div class="table-responsive maintenance-scroll-table">
                    <table id="portfolioMaintenanceListTable" class="maintenance-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);">
                        <thead>
                            <tr style="background:#f6fafd;">
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Property</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Unit</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Type</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Summary</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Assigned</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Scheduled</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Cost</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Workflow</th>
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Created</th>
                                
                                <th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="portfolioDetailsTbody">
                            ${requestRowsHtml}
                            ${recurringRowsHtml}
                        </tbody>
                    </table>
                </div>`
            : `
                <div class="portfolio-maintenance-card-scroll">
                    <div id="portfolioDetailsTbody" class="portfolio-maintenance-card-stack">
                        ${requestCardsHtml ? `<section><div style="display:grid;gap:10px;">${requestCardsHtml}</div></section>` : ''}
                        ${recurringCardsHtml ? `<section><div style="display:grid;gap:10px;">${recurringCardsHtml}</div></section>` : ''}
                    </div>
                </div>`;

        body.innerHTML = `
            <div class="portfolio-maintenance-shell">
            <div class="portfolio-maintenance-sticky-bar">
            <div id="portfolioDetailsFilterBar" style="margin-bottom:8px;border-radius:12px;padding:0;display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;position:relative;">
                <div style="position:relative;flex:1 1 100%;min-width:240px;display:flex;align-items:center;gap:6px;justify-content:flex-start;">
                    <i class="fas fa-magnifying-glass" style="color:#6b7280;margin-left:4px;"></i>
                    <input id="portfolioDetailsSearchBar" type="text" placeholder="Search list by" title="Try: type:, property:, unit:, status:" style="flex:0 1 320px;max-width:280px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:0.9rem;" />
                    <button class="btn-secondary" id="clearPortfolioDetailsFiltersBtn" title="Clear search" style="margin-right:4px;padding:6px 8px;font-size:0.7rem;">Clear</button>
                </div>
                <div id="portfolioDetailsActiveFilterChips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 8px 0 26px;flex:1 1 100%;"></div>
                <div id="portfolioDetailsSearchSuggestions" style="position:absolute;top:40px;left:6px;right:auto;min-width:240px;max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:4px 0;display:none;z-index:1000;max-height:260px;overflow:auto;">
                    <div id="portfolioDetailsSuggestHeader" style="padding:8px 12px;font-size:.85em;color:#374151;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
                        <span id="portfolioDetailsSuggestTitle">Choose a filter</span>
                        <button id="portfolioDetailsSuggestBack" style="display:none;background:transparent;border:none;color:#217dbb;cursor:pointer;font-weight:600;">Back</button>
                    </div>
                    <ul id="portfolioDetailsSuggestList" style="list-style:none;margin:0;padding:4px 0;"></ul>
                    <ul id="portfolioDetailsSuggestValues" style="list-style:none;margin:0;padding:4px 0;display:none;"></ul>
                    <div style="border-top:1px solid #eef2f7;margin-top:4px;padding:6px 10px;font-size:.8em;color:#6b7280;">Use tokens like <strong>type:</strong> or <strong>status:</strong> for precise filters.</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
                <div style="font-size:0.9rem;color:#6b7280;">Open maintenance requests and recurring schedules across all properties.</div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                    <div id="portfolioMaintenanceTypeTags" style="display:inline-flex;gap:6px;flex-wrap:wrap;">
                        <button type="button" class="portfolio-apps-tag-btn" data-type="request"><i class="fas fa-screwdriver-wrench"></i> Requests</button>
                        <button type="button" class="portfolio-apps-tag-btn" data-type="recurring"><i class="fas fa-rotate"></i> Recurring</button>
                    </div>
                    <button class="btn-secondary" id="portfolioMaintenanceViewToggleBtn" type="button" title="${portfolioViewMeta.title}" style="display:flex;align-items:center;gap:8px;">
                        <i class="${portfolioViewMeta.iconClass}"></i>
                        <span>${portfolioViewMeta.label}</span>
                    </button>
                </div>
            </div>
            </div>
            <div class="portfolio-maintenance-scroll">
            ${maintenanceContentHtml}
            </div>
            </div>`;

        // Open Maintenance view defaults to showing only open items
        // (pending + in-progress) while still allowing filters for
        // completed via the status: token.
        if (!state.keepPortfolioMaintenanceFiltersOnNextRender) {
            window.__portfolioDetailsAccumulatedQuery = 'status:pending,in-progress type:request';
        } else {
            state.keepPortfolioMaintenanceFiltersOnNextRender = false;
        }
        initializePortfolioDetailsSearch();
        renderFilteredPortfolioDetailsRows();
        if (!portfolioMaintenanceListView) {
            scheduleMaintenancePhotoHydration('portfolio');
        }

        const portfolioMaintenanceViewToggleBtn = document.getElementById('portfolioMaintenanceViewToggleBtn');
        if (portfolioMaintenanceViewToggleBtn) {
            portfolioMaintenanceViewToggleBtn.addEventListener('click', () => {
                state.keepPortfolioMaintenanceFiltersOnNextRender = true;
                portfolioMaintenanceListView = !portfolioMaintenanceListView;
                renderPortfolioDetails('maintenance');
            });
        }

        (function setupPortfolioMaintenanceTypeTags() {
            const container = document.getElementById('portfolioMaintenanceTypeTags');
            if (!container) return;
            const buttons = Array.from(container.querySelectorAll('.portfolio-apps-tag-btn'));
            if (!buttons.length) return;
            const getCurrentTypeFromQuery = () => {
                const combined = `${(window.__portfolioDetailsAccumulatedQuery || '').trim()}`.trim();
                if (!combined) return '';
                const { tokens } = parsePortfolioDetailsSearch(combined);
                if (tokens.typeList && tokens.typeList.length) {
                    return tokens.typeList[0];
                }
                return '';
            };
            const syncActiveFromFilter = () => {
                const currentType = getCurrentTypeFromQuery();
                buttons.forEach(button => {
                    const typeValue = button.getAttribute('data-type') || '';
                    button.classList.toggle('portfolio-apps-tag-active', typeValue === currentType);
                });
                container.classList.toggle('portfolio-maintenance-type-request', currentType === 'request');
                container.classList.toggle('portfolio-maintenance-type-recurring', currentType === 'recurring');
            };
            const applyTypeFilter = (selectedType) => {
                const input = document.getElementById('portfolioDetailsSearchBar');
                const combined = `${(window.__portfolioDetailsAccumulatedQuery || '').trim()} ${(input?.value || '').trim()}`.trim();
                const { tokens } = parsePortfolioDetailsSearch(combined);
                const currentType = tokens.typeList && tokens.typeList.length ? tokens.typeList[0] : '';
                tokens.typeList = currentType === selectedType ? [] : (selectedType ? [selectedType] : []);
                const parts = [];
                if (tokens.nameList.length) parts.push(`name:${tokens.nameList.join(',')}`);
                if (tokens.propertyList.length) parts.push(`property:${tokens.propertyList.join(',')}`);
                if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
                if (tokens.statusList.length) parts.push(`status:${tokens.statusList.join(',')}`);
                if (tokens.typeList.length) parts.push(`type:${tokens.typeList.join(',')}`);
                if (tokens.balanceFlags && tokens.balanceFlags.length) parts.push(`balance:${tokens.balanceFlags.join(',')}`);
                window.__portfolioDetailsAccumulatedQuery = parts.join(' ');
                if (input) input.value = '';
                renderFilteredPortfolioDetailsRows();
                syncActiveFromFilter();
            };

            syncActiveFromFilter();
            buttons.forEach(button => {
                button.addEventListener('click', () => {
                    applyTypeFilter(button.getAttribute('data-type') || '');
                });
            });
        })();

        const portfolioMaintenanceListTable = document.getElementById('portfolioMaintenanceListTable');
        if (portfolioMaintenanceListTable) {
            portfolioMaintenanceListTable.addEventListener('click', (event) => {
                if (event.target.closest('button, select, input, a, textarea')) return;
                const row = event.target.closest('tr[data-maint-id][data-maint-source]');
                if (!row) return;
                event.preventDefault();
                if (row.dataset.maintSource === 'recurring') {
                    const schedule = (state.portfolioRecurringMaintenance || []).find(item => String(item._id) === String(row.dataset.maintId));
                    if (!schedule) {
                        showNotification('Unable to open recurring maintenance row editor', 'error');
                        return;
                    }
                    enterRecurringMaintenanceRowEditMode(row, schedule, {
                        refreshPortfolio: true,
                        editingKey: 'currentEditingPortfolioRecurringMaintenanceId',
                        beforeSave: () => {
                            state.keepPortfolioMaintenanceFiltersOnNextRender = true;
                        },
                        setSaving: (scheduleId, isSaving) => {
                            setPortfolioMaintenanceItemSaving(scheduleId, 'recurring', isSaving);
                        }
                    });
                    return;
                }
                const request = (state.portfolioMaintenance || []).find(item => String(item._id) === String(row.dataset.maintId));
                if (!request) {
                    showNotification('Unable to open maintenance row editor', 'error');
                    return;
                }
                enterPortfolioMaintenanceEditMode(row, request);
            });

            portfolioMaintenanceListTable.addEventListener('change', async (event) => {
                const changedField = event.target.closest('.portfolio-maint-workflow-select, .maintenance-inline-workflow, .maintenance-inline-vendor, .maintenance-inline-scheduled');
                const recurringChangedField = event.target.closest('.recurring-maintenance-inline-vendor, .recurring-maintenance-inline-start-date, .recurring-maintenance-inline-status');
                if (recurringChangedField) {
                    const row = recurringChangedField.closest('tr[data-maint-id][data-project-id][data-maint-source="recurring"]');
                    if (!row || row.dataset.isSaving === 'true') return;
                    const vendorSelect = row.querySelector('.recurring-maintenance-inline-vendor');
                    const startDateInput = row.querySelector('.recurring-maintenance-inline-start-date');
                    const statusSelect = row.querySelector('.recurring-maintenance-inline-status');
                    const isVendorAssignmentSave = recurringChangedField.matches('.recurring-maintenance-inline-vendor');
                    try {
                        row.dataset.isSaving = 'true';
                        [startDateInput, statusSelect].forEach(field => {
                            if (field) field.disabled = true;
                        });
                        setMaintenanceVendorComboboxDisabled(vendorSelect, true);
                        setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
                        state.keepPortfolioMaintenanceFiltersOnNextRender = true;
                        setPortfolioMaintenanceItemSaving(row.dataset.maintId, 'recurring', true);
                        await updatePortfolioRecurringMaintenanceSchedule(row.dataset.maintId, row.dataset.projectId, {
                            assignedVendor: vendorSelect?.value || null,
                            startDate: startDateInput?.value ? dateInputToISOAtNoon(startDateInput.value) : '',
                            status: statusSelect?.value || 'pending'
                        }, {
                            refreshPortfolio: true
                        });
                        showNotification('Recurring maintenance updated', 'success');
                    } catch (err) {
                        console.error('Error updating recurring maintenance from list view:', err);
                        showNotification('Could not update recurring maintenance', 'error');
                    } finally {
                        delete row.dataset.isSaving;
                        [startDateInput, statusSelect].forEach(field => {
                            if (field) field.disabled = false;
                        });
                        setMaintenanceVendorComboboxLoading(vendorSelect, false);
                        setMaintenanceVendorComboboxDisabled(vendorSelect, false);
                        setPortfolioMaintenanceItemSaving(row.dataset.maintId, 'recurring', false);
                    }
                    return;
                }

                if (!changedField) return;
                const row = changedField.closest('tr[data-maint-id][data-project-id]');
                if (!row || row.dataset.maintSource === 'recurring') return;
                if (row.dataset.isSaving === 'true') return;

                const requestId = row.dataset.maintId;
                const projectId = row.dataset.projectId;
                const workflowSelect = row.querySelector('.portfolio-maint-workflow-select, .maintenance-inline-workflow');
                const vendorSelect = row.querySelector('.maintenance-inline-vendor');
                const scheduledInput = row.querySelector('.maintenance-inline-scheduled');
                const isVendorAssignmentSave = changedField.matches('.maintenance-inline-vendor');
                const newWorkflowStage = workflowSelect?.value || 'new';
                if (!requestId || !projectId || !workflowSelect) return;

                try {
                    row.dataset.isSaving = 'true';
                    [workflowSelect, scheduledInput].forEach(field => {
                        if (field) field.disabled = true;
                    });
                    setMaintenanceVendorComboboxDisabled(vendorSelect, true);
                    setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
                    state.keepPortfolioMaintenanceFiltersOnNextRender = true;
                    setPortfolioMaintenanceItemSaving(requestId, 'request', true);
                    await updateMaintenanceInlineFields(projectId, requestId, {
                        workflowStage: newWorkflowStage,
                        assignedVendor: vendorSelect?.value || '',
                        scheduledFor: scheduledInput?.value || ''
                    }, {
                        refreshProperty: state.currentProperty && String(state.currentProperty._id) === String(projectId),
                        refreshPortfolio: true,
                        refreshOverview: false
                    });
                    showNotification('Maintenance request updated', 'success');
                } catch (err) {
                    console.error('Error updating portfolio maintenance from list view:', err);
                    showNotification('Could not update maintenance request', 'error');
                } finally {
                    delete row.dataset.isSaving;
                    [workflowSelect, scheduledInput].forEach(field => {
                        if (field) field.disabled = false;
                    });
                    setMaintenanceVendorComboboxLoading(vendorSelect, false);
                    setMaintenanceVendorComboboxDisabled(vendorSelect, false);
                    setPortfolioMaintenanceItemSaving(requestId, 'request', false);
                }
            });
        }

        const maintTbody = document.getElementById('portfolioDetailsTbody');
        if (maintTbody) {
            maintTbody.addEventListener('change', async (e) => {
                if (e.target.closest('tr[data-maint-id][data-project-id]')) {
                    return;
                }

                const recurringChangedField = e.target.closest('.recurring-maintenance-inline-vendor, .recurring-maintenance-inline-start-date, .recurring-maintenance-inline-status');
                if (recurringChangedField) {
                    const card = recurringChangedField.closest('[data-maint-id][data-project-id][data-maint-source="recurring"]');
                    if (!card || card.dataset.isSaving === 'true') return;
                    const vendorSelect = card.querySelector('.recurring-maintenance-inline-vendor');
                    const startDateInput = card.querySelector('.recurring-maintenance-inline-start-date');
                    const statusSelect = card.querySelector('.recurring-maintenance-inline-status');
                    const isVendorAssignmentSave = recurringChangedField.matches('.recurring-maintenance-inline-vendor');
                    try {
                        card.dataset.isSaving = 'true';
                        [startDateInput, statusSelect].forEach(field => {
                            if (field) field.disabled = true;
                        });
                        setMaintenanceVendorComboboxDisabled(vendorSelect, true);
                        setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
                        setPortfolioMaintenanceItemSaving(card.dataset.maintId, 'recurring', true);
                        await updatePortfolioRecurringMaintenanceSchedule(card.dataset.maintId, card.dataset.projectId, {
                            assignedVendor: vendorSelect?.value || null,
                            startDate: startDateInput?.value ? dateInputToISOAtNoon(startDateInput.value) : '',
                            status: statusSelect?.value || 'pending'
                        });
                        showNotification('Recurring maintenance updated', 'success');
                    } catch (err) {
                        console.error('Error updating recurring maintenance from card view:', err);
                        showNotification('Could not update recurring maintenance', 'error');
                    } finally {
                        delete card.dataset.isSaving;
                        [startDateInput, statusSelect].forEach(field => {
                            if (field) field.disabled = false;
                        });
                        setMaintenanceVendorComboboxLoading(vendorSelect, false);
                        setMaintenanceVendorComboboxDisabled(vendorSelect, false);
                        setPortfolioMaintenanceItemSaving(card.dataset.maintId, 'recurring', false);
                    }
                    return;
                }

                const changedField = e.target.closest('.maintenance-inline-workflow, .maintenance-inline-vendor, .maintenance-inline-scheduled');
                if (!changedField) return;
                const editor = changedField.closest('.maintenance-inline-editor');
                const card = changedField.closest('[data-maint-id][data-project-id]');
                const requestId = editor?.getAttribute('data-request-id') || card?.getAttribute('data-maint-id');
                const projectId = card?.getAttribute('data-project-id');
                if (!editor || !requestId || !projectId || card?.dataset.maintSource === 'recurring') {
                    showNotification('Unable to update maintenance request', 'error');
                    return;
                }
                if (editor.dataset.isSaving === 'true') return;

                const workflowSelect = editor.querySelector('.maintenance-inline-workflow');
                const vendorSelect = editor.querySelector('.maintenance-inline-vendor');
                const scheduledInput = editor.querySelector('.maintenance-inline-scheduled');
                const isVendorAssignmentSave = changedField.matches('.maintenance-inline-vendor');
                const payload = {
                    workflowStage: workflowSelect?.value || 'new',
                    assignedVendor: vendorSelect?.value || '',
                    scheduledFor: scheduledInput?.value || ''
                };

                try {
                    editor.dataset.isSaving = 'true';
                    state.keepPortfolioMaintenanceFiltersOnNextRender = true;
                    [workflowSelect, scheduledInput].forEach(field => {
                        if (field) field.disabled = true;
                    });
                    setMaintenanceVendorComboboxDisabled(vendorSelect, true);
                    setMaintenanceVendorComboboxLoading(vendorSelect, isVendorAssignmentSave);
                    setPortfolioMaintenanceItemSaving(requestId, 'request', true);
                    await updateMaintenanceInlineFields(projectId, requestId, payload, {
                        refreshProperty: state.currentProperty && String(state.currentProperty._id) === String(projectId),
                        refreshPortfolio: true,
                        refreshOverview: false
                    });
                    showNotification('Maintenance request updated', 'success');
                } catch (err) {
                    console.error('Error updating portfolio maintenance from card view:', err);
                    showNotification('Could not update maintenance request', 'error');
                } finally {
                    delete editor.dataset.isSaving;
                    [workflowSelect, scheduledInput].forEach(field => {
                        if (field) field.disabled = false;
                    });
                    setMaintenanceVendorComboboxLoading(vendorSelect, false);
                    setMaintenanceVendorComboboxDisabled(vendorSelect, false);
                    setPortfolioMaintenanceItemSaving(requestId, 'request', false);
                }
            });
        }
        return;
    }

    if (type === 'leases') {
        titleEl.textContent = 'Leases & Upcoming Move-ins (Next 60 Days)';
        const leaseItems = state.portfolioExpiringLeases || [];
        const moveInItems = state.portfolioUpcomingMoveIns || [];

        const rows = [
            // Expiring leases based on tenant lease end dates
            ...leaseItems.map(({ tenant, daysUntilEnd }) => {
                let leaseEndDate = '—';
                if (tenant.leaseEnd) {
                    try {
                        const d = new Date(tenant.leaseEnd);
                        if (!isNaN(d.getTime())) {
                            const y = d.getUTCFullYear();
                            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                            const day = String(d.getUTCDate()).padStart(2, '0');
                            leaseEndDate = `${m}/${day}/${y}`;
                        }
                    } catch {}
                }
                return {
                    type: 'Lease Expiring',
                    daysUntil: daysUntilEnd,
                    statusKey: 'lease-expiring',
                    name: tenant.fullName || tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Tenant',
                    unitId: tenant.unitId?._id || tenant.unitId,
                    unitFallback: tenant.unitNumber || tenant.unit || '—',
                    propertyId: tenant.projectId || tenant.propertyId,
                    date: leaseEndDate
                };
            }),
            // Upcoming / recent move-ins based on tenant lease start dates
            ...moveInItems.map(item => {
                const tenant = item.tenant || null;
                const application = item.application || null; // backwards compatibility, if any
                const daysUntilMoveIn = item.daysUntilMoveIn;
                const rawDaysUntilMoveIn = item.rawDaysUntilMoveIn;

                let moveInDate = '—';
                let name = 'Tenant';
                let unitId = null;
                let unitFallback = '—';
                let propertyId = null;
                let propertyNameOverride = '';
                let source = '';
                let sourceId = '';

                if (tenant) {
                    name = tenant.fullName || tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Tenant';
                    unitId = tenant.unitId?._id || tenant.unitId || null;
                    unitFallback = tenant.unitNumber || tenant.unit || '—';
                    propertyId = tenant.projectId || tenant.propertyId || null;
                    if (tenant.leaseStart) {
                        try {
                            const d = new Date(tenant.leaseStart);
                            if (!isNaN(d.getTime())) {
                                const y = d.getUTCFullYear();
                                const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const day = String(d.getUTCDate()).padStart(2, '0');
                                moveInDate = `${m}/${day}/${y}`;
                            }
                        } catch {}
                    }
                    source = 'tenant';
                    sourceId = tenant._id || '';
                } else if (application) {
                    // Fallback path if any legacy application-based move-ins remain
                    let propertyAddress = '';
                    let unitNumber = application.unit || '';
                    if (application.notes) {
                        try {
                            const n = JSON.parse(application.notes);
                            propertyAddress = n.propertyAddress || propertyAddress;
                            unitNumber = n.unitNumber || unitNumber;
                        } catch {}
                    }
                    if (application.moveIn) {
                        try {
                            const d = new Date(application.moveIn);
                            if (!isNaN(d.getTime())) {
                                const y = d.getUTCFullYear();
                                const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const day = String(d.getUTCDate()).padStart(2, '0');
                                moveInDate = `${m}/${day}/${y}`;
                            }
                        } catch {}
                    }
                    name = application.name || 'Applicant';
                    unitId = null;
                    unitFallback = unitNumber || '—';
                    propertyId = null;
                    propertyNameOverride = propertyAddress || '—';
                    source = 'application';
                    sourceId = application._id || '';
                }

                const rawDays = typeof rawDaysUntilMoveIn === 'number' ? rawDaysUntilMoveIn : daysUntilMoveIn;
                const statusKey = rawDays < 0 ? 'past-movein' : 'upcoming-movein';
                return {
                    type: 'Upcoming Move-in',
                    daysUntil: daysUntilMoveIn,
                    statusKey,
                    name,
                    unitId,
                    unitFallback,
                    propertyId,
                    propertyNameOverride,
                    date: moveInDate,
                    source,
                    sourceId
                };
            })
        ];

        if (!rows.length) {
            body.innerHTML = '<p style="font-size:0.86rem;color:#6b7280;">No expiring leases or upcoming move-ins in the next 60 days.</p>';
            return;
        }

        const htmlRows = rows
            .slice()
            .sort((a,b) => a.daysUntil - b.daysUntil)
            .map(row => {
                const unitId = row.unitId;
                let unitLabel = '—';
                if (unitId && unitsById[String(unitId)]) {
                    const u = unitsById[String(unitId)];
                    unitLabel = u.number || u.unitNumber || u.name || u.label || '—';
                } else {
                    unitLabel = row.unitFallback || '—';
                }
                let propName = row.propertyNameOverride || '—';
                if (!row.propertyNameOverride && row.propertyId && propsById[String(row.propertyId)]) {
                    propName = propsById[String(row.propertyId)].name;
                }
                const rowStatus = (row.statusKey || '').toLowerCase();
                const dataType = (row.type || '').toLowerCase().replace(/"/g,'&quot;');
                const dataProp = (propName || '').toLowerCase().replace(/"/g,'&quot;');
                const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g,'&quot;');
                const dataName = (row.name || '').toLowerCase().replace(/"/g,'&quot;');
                return `
                    <tr data-type="${dataType}" data-property="${dataProp}" data-unit="${dataUnit}" data-name="${dataName}" data-status="${rowStatus}">
                        <td>${row.type}</td>
                        <td>${propName}</td>
                        <td>${unitLabel}</td>
                        <td>${row.name}</td>
                        <td>${row.date}</td>
                        <td>${row.daysUntil} days</td>
                        <td>${row.type === 'Upcoming Move-in' ? `<button type="button" class="btn-secondary movein-checklist-btn" data-source="${row.source || ''}" data-source-id="${row.sourceId || ''}" data-name="${(row.name || '').replace(/"/g,'&quot;')}" data-property="${(propName || '').replace(/"/g,'&quot;')}" data-unit="${(unitLabel || '').toString().replace(/"/g,'&quot;')}" data-date="${(row.date || '').replace(/"/g,'&quot;')}">Checklist</button>` : ''}</td>
                    </tr>`;
            }).join('');

        body.innerHTML = `
            <div id="portfolioDetailsFilterBar" style="margin-bottom:8px;border-radius:12px;padding:0;display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;position:relative;">
                <div style="position:relative;flex:1 1 100%;min-width:240px;display:flex;align-items:center;gap:6px;justify-content:flex-start;">
                    <i class="fas fa-magnifying-glass" style="color:#6b7280;margin-left:4px;"></i>
                    <input id="portfolioDetailsSearchBar" type="text" placeholder="Search list by" title="Try: name:, type:, property:, unit:, status:" style="flex:0 1 320px;max-width:280px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:0.9rem;" />
                    <button class="btn-secondary" id="clearPortfolioDetailsFiltersBtn" title="Clear search" style="margin-right:4px;padding:6px 8px;font-size:0.7rem;">Clear</button>
                </div>
                <div id="portfolioDetailsActiveFilterChips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 8px 0 26px;flex:1 1 100%;"></div>
                <div id="portfolioDetailsSearchSuggestions" style="position:absolute;top:40px;left:6px;right:auto;min-width:240px;max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:4px 0;display:none;z-index:1000;max-height:260px;overflow:auto;">
                    <div id="portfolioDetailsSuggestHeader" style="padding:8px 12px;font-size:.85em;color:#374151;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
                        <span id="portfolioDetailsSuggestTitle">Choose a filter</span>
                        <button id="portfolioDetailsSuggestBack" style="display:none;background:transparent;border:none;color:#217dbb;cursor:pointer;font-weight:600;">Back</button>
                    </div>
                    <ul id="portfolioDetailsSuggestList" style="list-style:none;margin:0;padding:4px 0;"></ul>
                    <ul id="portfolioDetailsSuggestValues" style="list-style:none;margin:0;padding:4px 0;display:none;"></ul>
                    <div style="border-top:1px solid #eef2f7;margin-top:4px;padding:6px 10px;font-size:.8em;color:#6b7280;">Use tokens like <strong>name:</strong> or <strong>type:</strong> for precise filters.</div>
                </div>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Property</th>
                            <th>Unit</th>
                            <th>Name</th>
                            <th>Date</th>
                            <th>Days Left</th>
                            <th>Checklist</th>
                        </tr>
                    </thead>
                    <tbody id="portfolioDetailsTbody">
                        ${htmlRows}
                    </tbody>
                </table>
            </div>`;

        // Default Leases view to show upcoming move-ins while still
        // allowing users to switch to other statuses (e.g. moved-in).
        window.__portfolioDetailsAccumulatedQuery = 'status:upcoming-movein,lease-expiring';
        initializePortfolioDetailsSearch();
        renderFilteredPortfolioDetailsRows();

        // Wire checklist button clicks for upcoming move-ins
        const table = body.querySelector('table');
        if (table) {
            table.addEventListener('click', (e) => {
                const btn = e.target.closest('.movein-checklist-btn');
                if (!btn) return;
                const name = btn.getAttribute('data-name') || '';
                const property = btn.getAttribute('data-property') || '';
                const unit = btn.getAttribute('data-unit') || '';
                const date = btn.getAttribute('data-date') || '';
                const source = btn.getAttribute('data-source') || '';
                const sourceId = btn.getAttribute('data-source-id') || '';

                // Checklist is now tenant-only; require a tenant-backed row
                if (source !== 'tenant' || !sourceId) {
                    if (typeof showNotification === 'function') {
                        showNotification('Move-in checklist is only available for tenant-based move-ins.', 'info');
                    }
                    return;
                }
                const parts = [
                    `Move-in for ${name || 'applicant'}`,
                    property ? `Property: ${property}` : '',
                    unit ? `Unit: ${unit}` : '',
                    date ? `Move-in date: ${date}` : ''
                ].filter(Boolean);
                const ctxText = parts.join(' • ');
                const modal = document.getElementById('moveInChecklistModal');
                const ctx = document.getElementById('moveInChecklistContext');
                if (ctx) ctx.textContent = ctxText;
                if (modal) {
                    const tenant = (state.allTenants || []).find(t => String(t._id) === String(sourceId));
                    let completed = [];
                    let notesMap = {};
                    if (tenant) {
                        completed = Array.isArray(tenant.moveInChecklistCompleted)
                            ? tenant.moveInChecklistCompleted
                            : [];
                        notesMap = tenant.moveInChecklistNotes || {};
                    }

                    // store tenant metadata on modal for later saves
                    modal.dataset.entityType = 'tenant';
                    modal.dataset.entityId = sourceId;
                    delete modal.dataset.appId;
                    // set checkboxes and notes according to saved state
                    modal.querySelectorAll('.movein-check-item').forEach(cb => {
                        const key = cb.getAttribute('data-item-id');
                        cb.checked = !!(key && completed.includes(key));
                    });
                    modal.querySelectorAll('.movein-check-note').forEach(input => {
                        const key = input.getAttribute('data-item-id');
                        const val = (key && notesMap && typeof notesMap[key] === 'string') ? notesMap[key] : '';
                        input.value = val || '';
                        // Auto-show note fields that already have saved text, hide empty ones
                        input.style.display = val ? 'block' : 'none';
                    });
                    openModal('moveInChecklistModal');
                }
            });
        }
        return;
    }

    if (type === 'vacancy') {
        titleEl.textContent = 'Vacancy & Occupancy';
        const vacantUnits = state.portfolioVacantUnits || [];
        const occupiedUnits = state.portfolioOccupiedUnits || [];
        const allUnitsForView = [...vacantUnits.map(u => ({ ...u, __status: 'vacant' })), ...occupiedUnits.map(u => ({ ...u, __status: 'occupied' }))];
        if (!allUnitsForView.length) {
            body.innerHTML = '<p style="font-size:0.86rem;color:#6b7280;">No units found across the portfolio.</p>';
            return;
        }
        // Map active/pending tenants by unitId so we can show the actual rent
        const tenantsByUnitId = (state.allTenants || []).reduce((map, t) => {
            const unitId = t.unitId?._id || t.unitId;
            if (!unitId) return map;
            const status = (t.leaseStatus || '').toLowerCase();
            if (status === 'active' || status === 'pending') {
                map[String(unitId)] = t;
            }
            return map;
        }, {});
        const htmlRows = allUnitsForView.map(u => {
            const pid = u.projectId || u.propertyId || u.project;
            const propName = pid && propsById[String(pid)] ? propsById[String(pid)].name : '—';
            const unitLabel = u.number || u.unitNumber || u.name || u.label || '—';
            const beds = u.bedrooms != null ? u.bedrooms : (u.beds != null ? u.beds : '—');
            const baths = u.bathrooms != null ? u.bathrooms : (u.baths != null ? u.baths : '—');
            let rent = 0;
            if (u.__status === 'occupied' && u._id && tenantsByUnitId[String(u._id)]) {
                const tenant = tenantsByUnitId[String(u._id)];
                const petFees = (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0);
                const additionalFees =
                    (Number(tenant.waterFee) || 0) +
                    (Number(tenant.trashFee) || 0) +
                    (Number(tenant.adminFee) || 0) +
                    (tenant.additionalFee?.amount || 0) +
                    petFees;
                rent = (Number(tenant.baseRent) || 0) + additionalFees;
            } else if (u.__status === 'vacant') {
                // For vacant units, show the market/unit rent value
                rent = Number(u.rent) || 0;
            }
            const statusLabel = u.__status === 'occupied' ? 'Occupied' : 'Vacant';
            const dataProp = (propName || '').toLowerCase().replace(/"/g,'&quot;');
            const dataUnit = String(unitLabel || '').toLowerCase().replace(/"/g,'&quot;');
            const dataStatus = u.__status;
            const dataType = 'vacancy';
            return `
                <tr data-property="${dataProp}" data-unit="${dataUnit}" data-status="${dataStatus}" data-type="${dataType}">
                    <td>${propName}</td>
                    <td>${unitLabel}</td>
                    <td>${beds}</td>
                    <td>${baths}</td>
                    <td>$${rent.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</td>
                    <td>${statusLabel}</td>
                </tr>`;
        }).join('');
        body.innerHTML = `
            <div id="portfolioDetailsFilterBar" style="margin-bottom:8px;border-radius:12px;padding:0;display:flex;flex-wrap:wrap;gap:0;align-items:flex-start;position:relative;">
                <div style="position:relative;flex:1 1 100%;min-width:240px;display:flex;align-items:center;gap:6px;justify-content:flex-start;">
                    <i class="fas fa-magnifying-glass" style="color:#6b7280;margin-left:4px;"></i>
                    <input id="portfolioDetailsSearchBar" type="text" placeholder="Search list by" title="Try: property:, unit:, status:, type:" style="flex:0 1 320px;max-width:280px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:0.9rem;" />
                    <button class="btn-secondary" id="clearPortfolioDetailsFiltersBtn" title="Clear search" style="margin-right:4px;padding:6px 8px;font-size:0.7rem;">Clear</button>
                </div>
                <div id="portfolioDetailsActiveFilterChips" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 8px 0 26px;flex:1 1 100%;"></div>
                <div id="portfolioDetailsSearchSuggestions" style="position:absolute;top:40px;left:6px;right:auto;min-width:240px;max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:4px 0;display:none;z-index:1000;max-height:260px;overflow:auto;">
                    <div id="portfolioDetailsSuggestHeader" style="padding:8px 12px;font-size:.85em;color:#374151;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;align-items:center;">
                        <span id="portfolioDetailsSuggestTitle">Choose a filter</span>
                        <button id="portfolioDetailsSuggestBack" style="display:none;background:transparent;border:none;color:#217dbb;cursor:pointer;font-weight:600;">Back</button>
                    </div>
                    <ul id="portfolioDetailsSuggestList" style="list-style:none;margin:0;padding:4px 0;"></ul>
                    <ul id="portfolioDetailsSuggestValues" style="list-style:none;margin:0;padding:4px 0;display:none;"></ul>
                    <div style="border-top:1px solid #eef2f7;margin-top:4px;padding:6px 10px;font-size:.8em;color:#6b7280;">Use tokens like <strong>property:</strong> or <strong>status:</strong> for precise filters.</div>
                </div>
            </div>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Property</th>
                            <th>Unit</th>
                            <th>Beds</th>
                            <th>Baths</th>
                            <th>Rent</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="portfolioDetailsTbody">
                        ${htmlRows}
                    </tbody>
                    <tfoot id="portfolioDetailsTfoot" style="position:sticky;bottom:0;font-weight:600;">
                        <tr>
                            <td colspan="4" style="text-align:right;">Total:</td>
                            <td id="portfolioVacancyTotalRent">$0</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;

        // Default vacancy view to status:vacant while still allowing status:occupied filter
        window.__portfolioDetailsAccumulatedQuery = 'status:vacant';
        initializePortfolioDetailsSearch();
        renderFilteredPortfolioDetailsRows();
        return;
    }
}

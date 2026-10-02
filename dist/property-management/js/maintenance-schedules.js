// Property management: maintenance schedules.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// 1. Mark as Completed Handler
async function markScheduleCompleted(scheduleId) {
  // Find the schedule to get vendor info
  const schedules = window.lastLoadedSchedules || [];
  const schedule = schedules.find(s => s._id === scheduleId);
  let vendorName = '';
  if (schedule && schedule.assignedVendor) {
    vendorName = schedule.assignedVendor.name || schedule.assignedVendor.email || '';
  }

  // Show modal
  const modal = document.getElementById('completeScheduleModal');
  const form = document.getElementById('completeScheduleForm');
  const completedByInput = document.getElementById('completedByInput');
  const notesInput = document.getElementById('completedNotesInput');
  completedByInput.value = vendorName || '';
  notesInput.value = '';
  openModal('completeScheduleModal');

  // Cancel handler
  document.getElementById('cancelCompleteScheduleBtn').onclick = () => {
    closeModal('completeScheduleModal');
  };

  // Submit handler
  form.onsubmit = async function(e) {
    e.preventDefault();
    showLoader();
    try {
      const completedBy = completedByInput.value.trim() || 'System';
      const notes = notesInput.value.trim();
      const res = await fetch(`/api/properties/${state.currentProperty._id}/maintenance-schedules/${scheduleId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedBy, notes, expectedNextScheduledDate: schedule?.nextScheduledDate })
      });
      if (!res.ok) throw new Error('Failed to complete schedule');
      showNotification('Maintenance completed — awaiting QC review', 'success');
      invalidateCache('maintenance');
      closeModal('completeScheduleModal');
    // Force-refresh maintenance tab to reflect changes
    await refreshContent('maintenance');
    } catch (err) {
      showNotification('Error completing schedule', 'error');
    } finally {
      hideLoader();
    }
  };
}

// 2. Render History Helper
function renderScheduleHistory(history, options = {}) {
    return window.RecurringMaintenanceHistory.render(options.schedule);
}

// CARD VIEW
function renderMaintenanceSchedules(schedules) {
    schedules = propertyRecordPage('scheduleList', schedules || [], applyPropertyMaintenanceFilters, state.highlightMaintenanceScheduleId);
  const scheduleList = document.getElementById('scheduleList');
  if (!scheduleList) return;

  if (!schedules.length) {
    scheduleList.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:32px;">
        <i class="fas fa-calendar-alt" style="font-size:2.2em;color:#3498db;margin-bottom:12px;"></i>
        <p style="font-size:1em;color:#888;">No routine maintenance schedules found.</p>
      </div>
    `;
    return;
  }

  scheduleList.innerHTML = schedules.map(renderPropertyRecurringMaintenanceCard).join('');

    focusMaintenanceSchedule();
}

function renderPropertyRecurringMaintenanceCard(schedule) {
    const nextDate = schedule.nextScheduledDate
    ? formatDateDisplay(schedule.nextScheduledDate, 'en-US')
      : 'N/A';

        const startDateLabel = getRecurringMaintenanceDisplayDate(schedule)
        ? formatDateDisplay(getRecurringMaintenanceDisplayDate(schedule), 'en-US')
      : 'N/A';

    let freqLabel = schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1);
    if (schedule.frequency === 'custom' && schedule.intervalDays) {
      freqLabel = `<span class="badge badge-info" style="background:#eaf6ff;color:#217dbb;padding:2px 10px;border-radius:10px;font-size:0.92em;"><i class="fas fa-sync-alt"></i> Every ${schedule.intervalDays} days</span>`;
    } else {
      freqLabel = `<span class="badge badge-default" style="background:#f6fafd;color:#217dbb;padding:2px 10px;border-radius:10px;font-size:0.92em;"><i class="fas fa-clock"></i> ${freqLabel}</span>`;
    }

    let unitLabel = '<span style="color:#888;font-size:0.97em;"><i class="fas fa-door-closed"></i> No unit assigned</span>';
    if (schedule.unitId) {
      if (typeof schedule.unitId === 'object' && schedule.unitId.number) {
        unitLabel = `<i class="fas fa-door-open"></i> Unit ${schedule.unitId.number}`;
      } else if (typeof schedule.unitId === 'string') {
        const unitObj = state.units?.find(u => u._id === schedule.unitId);
        if (unitObj && unitObj.number) {
          unitLabel = `<i class="fas fa-door-open"></i> Unit ${unitObj.number}`;
        } else {
          unitLabel = `<i class="fas fa-door-open"></i> ${schedule.unitId}`;
        }
      }
    }

    const costLabel = typeof schedule.cost === 'number'
      ? `<span style="color:#217dbb;font-weight:600;font-size:0.97em;"><i class="fas fa-dollar-sign"></i> $${schedule.cost.toFixed(2)}</span>`
      : '<span style="color:#888;font-size:0.97em;"><i class="fas fa-dollar-sign"></i> $0.00</span>';

    const canComplete = schedule.status !== 'pending';
    const completeBtn = canComplete
      ? `<button onclick="markScheduleCompleted('${schedule._id}')" class="btn-primary" style="margin-top:8px;"><i class="fas fa-check"></i> Mark as Completed</button>`
      : '';

    const historyHtml = renderScheduleHistory(schedule.history, { variant: 'panel', schedule: { ...schedule, projectId: schedule.projectId || state.currentProperty?._id } });

        const descriptionHtml = renderMaintenanceDescriptionPanel(schedule.description);

    return `
                        <div class="maintenance-card compact-maintenance-card" data-maint-id="${schedule._id}" data-maint-schedule-id="${schedule._id}" data-maint-source="recurring" data-project-id="${state.currentProperty ? state.currentProperty._id : ''}" style="border:1.5px solid #e1e8ed;box-shadow:0 2px 8px rgba(44,62,80,0.07);margin-bottom:18px;font-size:0.97em;">
                <div class="maintenance-header" style="background:#f6fafd;padding:12px 18px;border-bottom:1px solid #e1e8ed;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong style="font-size:1.08em;color:#2c3e50;"><i class="fas fa-sync-alt" style="color:#217dbb;margin-right:8px;"></i>${schedule.title} ${window.RecurringMaintenanceHistory.qcBadge(schedule)}</strong>
            <span style="margin-left:12px;">${freqLabel}</span>
          </div>
          <div class="maintenance-actions">
                        <button onclick="openRecurringMaintenanceEstimate('${schedule._id}', '${state.currentProperty ? state.currentProperty._id : ''}', 'property')" class="btn-secondary" style="margin-right:6px;font-size:0.97em;">
                            <i class="fas fa-arrow-up-right-from-square"></i> Estimate
                        </button>
            <button onclick="editMaintenanceSchedule('${schedule._id}')" class="btn-secondary" style="margin-right:6px;font-size:0.97em;">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button onclick="deleteMaintenanceSchedule('${schedule._id}')" class="btn-icon delete-btn" title="Delete" style="font-size:0.97em;">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
                <div class="maintenance-content" style="padding:14px 18px;">
                    <div class="compact-maintenance-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;align-items:start;">
                        <div class="compact-maintenance-panel">
                            ${descriptionHtml}
                            <div style="margin-bottom:8px;"><strong><i class="fas fa-calendar-alt"></i> Next Date:</strong> <span style="color:#217dbb;">${nextDate}</span></div>
                            ${renderRecurringMaintenanceInlineEditor(schedule)}
                            <div style="margin-bottom:8px;">${unitLabel}</div>
                            <div style="margin-bottom:8px;"><strong><i class="fas fa-dollar-sign"></i> Cost:</strong> ${costLabel}</div>
                            ${completeBtn}
                        </div>
                        <div class="maintenance-thread compact-maintenance-thread" style="align-content:start;overflow:auto;max-height:250px;">
                            ${historyHtml}
                        </div>
                    </div>
        </div>
      </div>
    `;

}

// LIST VIEW
function renderMaintenanceSchedulesList(schedules) {
    schedules = propertyRecordPage('scheduleList', schedules || [], applyPropertyMaintenanceFilters, state.highlightMaintenanceScheduleId);
  const scheduleList = document.getElementById('scheduleList');
  if (!scheduleList) return;

  if (!schedules.length) {
    scheduleList.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:32px;">
        <i class="fas fa-calendar-alt" style="font-size:2.2em;color:#3498db;margin-bottom:12px;"></i>
        <p style="font-size:1.1em;color:#888;">No routine maintenance schedules found.</p>
      </div>
    `;
    return;
  }

  scheduleList.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="maintenance-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);margin-bottom:18px;">
        <thead>
          <tr style="background:#f6fafd;">
            <th>Title</th>
            <th>Description</th>
            <th>Frequency</th>
            <th>Service Date</th>
            <th>Next Scheduled</th>
            <th>Vendor</th>
            <th>Unit</th>
            <th>Status</th>
            <th>Cost</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
                    ${schedules.map(schedule => renderPropertyRecurringMaintenanceListRow(schedule)).join('')}
        </tbody>
      </table>
    </div>
  `;

    focusMaintenanceSchedule();
}

function getUnitsForPropertyId(propertyId) {
    if (!propertyId) return state.units || [];
    return (state.allUnits || []).filter(unit => {
        const unitPropertyId = unit.projectId || unit.propertyId || unit.project;
        return unitPropertyId && String(unitPropertyId) === String(propertyId);
    });
}

// Populate units in the schedule modal
async function populateScheduleUnitSelect(propertyId = '', selectedUnitId = '') {
    const select = document.getElementById('scheduleUnit');
    if (!select) return;
    const unitsSource = propertyId ? getUnitsForPropertyId(propertyId) : (state.units || []);
    select.innerHTML = `<option value="">None</option>` +
        unitsSource.map(unit => {
            const unitId = unit._id || unit.id || '';
            const selectedAttr = selectedUnitId && String(selectedUnitId) === String(unitId) ? ' selected' : '';
            return `<option value="${unitId}"${selectedAttr}>Unit ${unit.number}</option>`;
        }).join('');
}

async function populateScheduleVendorSelect() {
    await populateMaintenanceVendorSelect('scheduleVendor', document.getElementById('scheduleVendor')?.value || '', {
        emptyLabel: 'None',
        placeholder: 'Search vendor'
    });
}

function populateMaintenanceUnitSelect() {
    const select = document.getElementById('maintenanceUnit');
    if (!select || !state.units) return;
    select.innerHTML = `<option value="">Select a unit</option>` +
        state.units.map(unit => `<option value="${unit._id}">Unit ${unit.number}</option>`).join('');
}

function populateMaintenancePropertySelect(selectedId) {
    const select = document.getElementById('maintenanceProperty');
    if (!select) return;
    const properties = state.properties || [];
    if (!properties.length) {
        select.innerHTML = '<option value="">No properties available</option>';
        return;
    }
    const preferredId = selectedId || (state.currentProperty && state.currentProperty._id);
    let options = '<option value="">Select a property</option>';
    properties.forEach(p => {
        if (!p || !p._id) return;
        const pid = p._id;
        const name = p.name || p.projectName || p.address || 'Property';
        const selectedAttr = preferredId && String(preferredId) === String(pid) ? ' selected' : '';
        options += `<option value="${pid}"${selectedAttr}>${name}</option>`;
    });
    select.innerHTML = options;
}

async function handleMaintenancePropertyChange() {
    const select = document.getElementById('maintenanceProperty');
    if (!select) return;
    const propertyId = select.value;
    const unitSelect = document.getElementById('maintenanceUnit');
    if (!unitSelect) return;
    if (!propertyId) {
        unitSelect.innerHTML = '<option value="">Select a unit</option>';
        return;
    }
    try {
        showLoader();
        await loadUnits(propertyId, true);
        populateMaintenanceUnitSelect();
    } catch (err) {
        console.error('Error loading units for maintenance property:', err);
        showNotification('Error loading units for selected property', 'error');
    } finally {
        hideLoader();
    }
}

// Edit Maintenance Schedule
async function editMaintenanceSchedule(scheduleId, options = {}) {
  try {
        const projectId = options.projectId || state.currentProperty?._id;
        if (!projectId) {
            showNotification('Property context is required to edit this schedule', 'error');
            return;
        }
        let schedule = options.schedule || null;
        if (!schedule) {
            const res = await fetch(`/api/properties/${projectId}/maintenance-schedules`);
            const schedules = await res.json();
            schedule = schedules.find(s => s._id === scheduleId);
        }
    if (!schedule) {
      showNotification('Schedule not found', 'error');
      return;
    }

    await populateScheduleVendorSelect();
        await populateScheduleUnitSelect(projectId, schedule.unitId?._id || schedule.unitId || '');

    // Populate modal fields
    document.getElementById('scheduleTitle').value = schedule.title || '';
    document.getElementById('scheduleDescription').value = schedule.description || '';
    document.getElementById('scheduleFrequency').value = schedule.frequency || 'monthly';
    document.getElementById('customIntervalGroup').style.display = schedule.frequency === 'custom' ? 'block' : 'none';
    document.getElementById('scheduleIntervalDays').value = schedule.intervalDays || '';
    document.getElementById('scheduleStartDate').value = schedule.startDate ? (String(schedule.startDate).substring(0,10)) : '';
    setMaintenanceVendorComboboxValue('scheduleVendor', schedule.assignedVendor?._id || '', schedule.assignedVendor?.name || schedule.assignedVendor?.email || '');
    document.getElementById('scheduleUnit').value = schedule.unitId?._id || schedule.unitId || '';
    document.getElementById('scheduleStatus').value = schedule.status || 'pending';
    document.getElementById('scheduleCost').value = typeof schedule.cost === 'number' ? schedule.cost : '';

    // Set edit mode
    const form = document.getElementById('addScheduleForm');
    form.dataset.editMode = 'true';
    form.dataset.scheduleId = scheduleId;
        form.dataset.projectId = projectId;
        form.dataset.source = options.source || 'property';
    form.querySelector('button[type="submit"]').textContent = 'Update Schedule';

    openModal('addScheduleModal');

    // Remove previous submit handler and add new one for update
    form.onsubmit = async function(e) {
      e.preventDefault();
            await handleUpdateMaintenanceSchedule(scheduleId, {
                projectId,
                source: options.source || 'property'
            });
    };
  } catch (err) {
    showNotification('Error loading schedule for edit', 'error');
  }
}

// Handle Update Maintenance Schedule (send all fields)
async function handleUpdateMaintenanceSchedule(scheduleId, options = {}) {
  const title = document.getElementById('scheduleTitle').value;
  const description = document.getElementById('scheduleDescription').value;
  const frequency = document.getElementById('scheduleFrequency').value;
    const intervalDays = frequency === 'custom' ? Number(document.getElementById('scheduleIntervalDays').value) : null;
    const startDateRaw = document.getElementById('scheduleStartDate').value;
    const startDate = dateInputToISOAtNoon(startDateRaw);
  const assignedVendor = document.getElementById('scheduleVendor').value || null;
  const unitId = document.getElementById('scheduleUnit').value || null;
  const status = document.getElementById('scheduleStatus').value;
  const cost = Number(document.getElementById('scheduleCost').value) || 0;
    const projectId = options.projectId || document.getElementById('addScheduleForm')?.dataset.projectId || state.currentProperty?._id;

    if (!projectId) {
        showNotification('Property context is required to update this schedule', 'error');
        return;
    }

    const useItemLoader = options.source === 'portfolio';
    const currentSchedule = (state.maintenanceSchedules || []).find(item => String(item._id) === String(scheduleId))
        || (state.portfolioRecurringMaintenance || []).find(item => String(item._id) === String(scheduleId))
        || null;
    const currentAssignedVendorId = String(currentSchedule?.assignedVendor?._id || currentSchedule?.assignedVendor || '').trim();

  try {
        if (useItemLoader) {
            setPortfolioMaintenanceItemSaving(scheduleId, 'recurring', true);
        }
        if (assignedVendor && String(assignedVendor).trim() !== currentAssignedVendorId) {
            await ensureVendorInvitedToProject(assignedVendor, projectId);
        }
        const res = await fetch(`/api/properties/${projectId}/maintenance-schedules/${scheduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        frequency,
        intervalDays,
    startDate,
        assignedVendor,
        unitId,
        status,
        expectedNextScheduledDate: currentSchedule?.nextScheduledDate,
        cost
      })
    });
    if (!res.ok) throw new Error('Failed to update schedule');
        const updatedSchedule = await res.json();
    closeModal('addScheduleModal');
    showNotification('Schedule updated!', 'success');
        if (state.currentProperty && String(state.currentProperty._id) === String(projectId)) {
                state.maintenanceSchedules = (state.maintenanceSchedules || []).map(item =>
                    String(item._id) === String(scheduleId) ? { ...item, ...updatedSchedule } : item
                );
                window.lastLoadedSchedules = state.maintenanceSchedules;
                refreshPropertyMaintenanceView();
        }
        state.portfolioRecurringMaintenance = (state.portfolioRecurringMaintenance || []).map(item =>
            String(item._id) === String(scheduleId) ? { ...item, ...updatedSchedule } : item
        );
        if (options.source === 'portfolio') {
            await refreshPortfolioMaintenanceItem(scheduleId, 'recurring');
        }
  } catch (err) {
    showNotification('Error updating schedule', 'error');
    } finally {
                if (useItemLoader) {
                        setPortfolioMaintenanceItemSaving(scheduleId, 'recurring', false);
                }
  }
}

// Delete Maintenance Schedule
async function deleteMaintenanceSchedule(scheduleId) {
  if (!confirm('Are you sure you want to delete this schedule?')) return;
  showLoader();
  try {
    const res = await fetch(`/api/properties/${state.currentProperty._id}/maintenance-schedules/${scheduleId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete schedule');
    showNotification('Schedule deleted!', 'success');
    await refreshContent('maintenance');
  } catch (err) {
    showNotification('Error deleting schedule', 'error');
  } finally {
    hideLoader();
  }
}

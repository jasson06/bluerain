// maintenance estimates flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

function getEstimateItemStatusFromMaintenanceStatus(status) {
  if (status === 'completed') return 'completed';
  if (status === 'in-progress') return 'in-progress';
  return 'new';
}

function getMaintenanceStatusFromEstimateItemStatus(status) {
  const normalized = String(status || 'new').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'approved') return 'completed';
  if (normalized === 'in-progress' || normalized === 'rework') return 'in-progress';
  return 'pending';
}

function calculateEstimateTotal(lineItems = []) {
  return lineItems.reduce((sum, category) => {
    const categoryTotal = (category.items || []).reduce((itemSum, item) => {
      const total = Number.isFinite(Number(item.total))
        ? Number(item.total)
        : (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
      return itemSum + total;
    }, 0);
    return sum + categoryTotal;
  }, 0);
}

function getRecurringMaintenanceEstimateTitle(schedule) {
  return `Maintenance: ${String(schedule?.title || 'Recurring Maintenance').trim() || 'Recurring Maintenance'}`;
}

async function ensureVendorProjectAssignment(vendorId, projectId) {
  if (!vendorId || !projectId) return null;
  let vendor = await serverContext.Vendor.findById(vendorId);
  if (!vendor) return null;

  const projectIdStr = String(projectId);
  const alreadyAssignedProject = (vendor.assignedProjects || []).some(
    entry => entry.projectId && entry.projectId.toString() === projectIdStr
  );
  if (!alreadyAssignedProject) {
    vendor.assignedProjects.push({ projectId: projectIdStr, status: 'new' });
    await vendor.save();
    vendor = await serverContext.Vendor.findById(vendorId);
  }

  return vendor;
}

async function syncVendorAssignedEstimateItem(estimate, item, vendorId = null) {
  const itemId = item?._id ? String(item._id) : '';
  if (!itemId || !estimate?._id || !estimate?.projectId) return;

  const normalizedVendorId = vendorId ? String(vendorId) : '';
  const pullFilter = normalizedVendorId ? { _id: { $ne: normalizedVendorId } } : {};
  await serverContext.Vendor.updateMany(
    { ...pullFilter, 'assignedItems.itemId': itemId },
    { $pull: { assignedItems: { itemId } } }
  );

  if (!normalizedVendorId) return;

  const vendor = await (0, serverContext.ensureVendorProjectAssignment)(normalizedVendorId, estimate.projectId);
  if (!vendor) return;

  const payload = {
    itemId,
    projectId: estimate.projectId,
    estimateId: estimate._id,
    name: item.name,
    description: item.description || 'No description provided',
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    total: Number.isFinite(Number(item.total)) ? Number(item.total) : (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
    status: item.status || 'new',
    costCode: item.costCode || 'Maintenance',
    photos: item.photos || { before: [], after: [] },
    qualityControl: item.qualityControl || { status: 'pending' },
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    updatedAt: new Date()
  };

  const assignedItem = (vendor.assignedItems || []).find(entry => entry.itemId?.toString() === itemId);
  if (assignedItem) {
    Object.assign(assignedItem, payload);
  } else {
    vendor.assignedItems.push({
      ...payload,
      createdAt: new Date()
    });
  }
  await vendor.save();
}

async function syncMaintenanceScheduleFromEstimateItem(estimate, item, options = {}) {
  if (!estimate?._id || !item?.maintenanceScheduleId) return null;
  const schedule = await serverContext.MaintenanceSchedule.findById(item.maintenanceScheduleId);
  if (!schedule) return null;
  const entry = schedule.history.find(entry => String(entry.estimateItemId || '') === String(item._id));
  if (entry) {
    // Historical work edits do not drive QC or the current recurrence.
    return serverContext.maintenanceQC.complete(schedule, estimate, item, options);
  }
  if (schedule.linkedEstimateItemId && String(schedule.linkedEstimateItemId) !== String(item._id)) return schedule;
  schedule.linkedEstimateId = estimate._id;
  schedule.linkedEstimateItemId = item._id;
  schedule.title = item.name || schedule.title;
  schedule.description = typeof item.description === 'string' ? item.description : schedule.description;
  schedule.assignedVendor = item.assignedTo || null;
  schedule.cost = Number.isFinite(Number(item.total)) ? Number(item.total) : (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
  if (['completed', 'approved'].includes(item.status)) {
    return serverContext.maintenanceQC.complete(schedule, estimate, item, { ...options, completedAt: item.endDate || new Date() });
  }
  schedule.status = (0, serverContext.getMaintenanceStatusFromEstimateItemStatus)(item.status);
  schedule.startDate = item.startDate || schedule.startDate;
  schedule.completedAt = null;
  await schedule.save();
  await (0, serverContext.syncVendorAssignedEstimateItem)(estimate, item, schedule.assignedVendor);
  return schedule;
}

async function syncLinkedMaintenanceRecordsFromEstimateItem(estimate, item, options = {}) {
  if (!estimate?._id || !item) return null;
  const result = {};
  if (item.maintenanceRequestId) {
    result.request = await (0, serverContext.syncMaintenanceRequestFromEstimateItem)(estimate, item);
  }
  if (item.maintenanceScheduleId) {
    result.schedule = await (0, serverContext.syncMaintenanceScheduleFromEstimateItem)(estimate, item, options);
  }
  return result;
}

async function syncMaintenanceRequestFromEstimateItem(estimate, item) {
  if (!estimate?._id || !item?.maintenanceRequestId) return null;

  const request = await serverContext.MaintenanceRequest.findById(item.maintenanceRequestId);
  if (!request) return null;

  const assignedVendorId = item.assignedTo ? String(item.assignedTo) : '';
  const vendor = assignedVendorId
    ? await serverContext.Vendor.findById(assignedVendorId).select('name email')
    : null;

  request.linkedEstimateId = estimate._id;
  request.linkedEstimateItemId = item._id;
  request.title = item.name || request.title;
  request.description = typeof item.description === 'string' ? item.description : request.description;
  request.assignedVendor = vendor?._id || null;
  request.assignedTo = vendor ? (vendor.name || vendor.email || '') : '';
  request.photos = Array.from(new Set(
    Array.isArray(item.photos?.before) ? item.photos.before : []
  ));
  request.afterPhotos = Array.from(new Set(
    Array.isArray(item.photos?.after) ? item.photos.after : []
  ));
  request.cost = Number.isFinite(Number(item.total))
    ? Number(item.total)
    : (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
  request.scheduledFor = item.startDate || null;
  request.status = (0, serverContext.getMaintenanceStatusFromEstimateItemStatus)(item.status);
  request.workflowStage = (0, serverContext.normalizeMaintenanceWorkflowStage)(
    request.workflowStage,
    request.status,
    Boolean(request.assignedVendor),
    Boolean(request.scheduledFor),
    request.workflowStage || 'submitted'
  );

  if (request.status === 'completed') {
    request.completedAt = item.endDate || request.completedAt || new Date();
  } else {
    request.completedAt = null;
  }

  await request.save();
  await (0, serverContext.syncVendorAssignedEstimateItem)(estimate, item, request.assignedVendor);
  return request;
}

async function syncMaintenanceScheduleToEstimate(schedule, options = {}) {
  if (!schedule?._id || !schedule.projectId || !schedule.title) return null;

  if (schedule.assignedVendor) {
    await (0, serverContext.ensureVendorProjectAssignment)(schedule.assignedVendor, schedule.projectId);
  }

  const estimateTitle = (0, serverContext.getRecurringMaintenanceEstimateTitle)(schedule);
  let estimate = schedule.linkedEstimateId ? await serverContext.Estimate.findById(schedule.linkedEstimateId) : null;
  if (!estimate) {
    estimate = await serverContext.Estimate.findOne({
      projectId: schedule.projectId,
      title: { $regex: new RegExp(`^${(0, serverContext.escapeRegexForMaintenanceLink)(estimateTitle)}$`, 'i') }
    });
  }

  if (!estimate && options.createIfMissing === false) {
    return { schedule, estimate: null, item: null };
  }

  if (!estimate) {
    estimate = new serverContext.Estimate({
      projectId: schedule.projectId,
      invoiceNumber: `MS-${Date.now()}`,
      title: estimateTitle,
      lineItems: [],
      total: 0,
      tax: 0
    });
    await estimate.save();
    estimate = await serverContext.Estimate.findById(estimate._id);
  } else if (estimate.title !== estimateTitle) {
    estimate.title = estimateTitle;
  }

  const unitLabel = await (0, serverContext.getRecurringMaintenanceUnitLabel)(schedule);
  const unitCategoryName = unitLabel ? `Maintenance ${unitLabel}` : '';
  const itemStatus = (0, serverContext.getEstimateItemStatusFromMaintenanceStatus)(schedule.status);
  const scheduleCost = Number.isFinite(Number(schedule.cost)) ? Number(schedule.cost) : 0;

  let maintenanceCategory = estimate.lineItems.find(category => category.category === 'Maintenance');
  if (!maintenanceCategory) {
    estimate.lineItems.push({
      type: 'category',
      category: 'Maintenance',
      status: itemStatus === 'completed' ? 'completed' : 'in-progress',
      items: []
    });
    maintenanceCategory = estimate.lineItems.find(category => category.category === 'Maintenance');
  }

  let targetCategory = maintenanceCategory;
  if (unitCategoryName) {
    targetCategory = estimate.lineItems.find(category => String(category.category || '').trim().toLowerCase() === unitCategoryName.toLowerCase());
    if (!targetCategory) {
      estimate.lineItems.push({
        type: 'category',
        category: unitCategoryName,
        status: itemStatus === 'completed' ? 'completed' : 'in-progress',
        items: []
      });
      targetCategory = estimate.lineItems.find(category => String(category.category || '').trim().toLowerCase() === unitCategoryName.toLowerCase());
    }
  }

  let estimateItem = estimate.lineItems
    .flatMap(category => category.items || [])
    .find(item => {
      const matchesLink = schedule.linkedEstimateItemId && item._id?.toString() === schedule.linkedEstimateItemId.toString();
      const matchesSchedule = item.maintenanceScheduleId && item.maintenanceScheduleId.toString() === schedule._id.toString();
      const historical = (schedule.history || []).some(entry => String(entry.estimateItemId || '') === String(item._id));
      return !historical && (matchesLink || matchesSchedule);
    });
  const currentCategory = estimateItem
    ? estimate.lineItems.find(category => (category.items || []).some(item => item._id?.toString() === estimateItem._id?.toString()))
    : null;

  if (!estimateItem && options.createIfMissing === false) {
    return { schedule, estimate, item: null };
  }

  if (!estimateItem) {
    estimateItem = {
      type: 'item',
      name: schedule.title,
      description: schedule.description || '',
      costCode: 'Maintenance',
      quantity: 1,
      unitPrice: scheduleCost,
      laborCost: scheduleCost,
      total: scheduleCost,
      status: itemStatus,
      maintenanceScheduleId: schedule._id,
      assignedTo: schedule.assignedVendor || null,
      photos: { before: [], after: [] },
      startDate: schedule.startDate || schedule.nextScheduledDate || new Date(),
      endDate: schedule.status === 'completed' ? (schedule.completedAt || new Date()) : null
    };
    targetCategory.items.push(estimateItem);
  } else {
    estimateItem.name = schedule.title;
    estimateItem.description = schedule.description || '';
    estimateItem.costCode = estimateItem.costCode || 'Maintenance';
    estimateItem.quantity = 1;
    estimateItem.unitPrice = scheduleCost;
    estimateItem.laborCost = scheduleCost;
    estimateItem.total = scheduleCost;
    estimateItem.status = itemStatus;
    estimateItem.maintenanceScheduleId = schedule._id;
    estimateItem.assignedTo = schedule.assignedVendor || null;
    estimateItem.startDate = schedule.startDate || schedule.nextScheduledDate || estimateItem.startDate || new Date();
    estimateItem.endDate = schedule.status === 'completed' ? (schedule.completedAt || estimateItem.endDate || new Date()) : null;
    estimateItem.photos = estimateItem.photos && typeof estimateItem.photos === 'object'
      ? {
          before: Array.isArray(estimateItem.photos.before) ? estimateItem.photos.before : [],
          after: Array.isArray(estimateItem.photos.after) ? estimateItem.photos.after : []
        }
      : { before: [], after: [] };

    if (currentCategory && targetCategory && currentCategory !== targetCategory) {
      currentCategory.items = (currentCategory.items || []).filter(item => item._id?.toString() !== estimateItem._id?.toString());
      targetCategory.items = targetCategory.items || [];
      targetCategory.items.push(estimateItem);
    }
  }

  for (const category of estimate.lineItems) {
    const categoryItems = category.items || [];
    category.status = categoryItems.length && categoryItems.every(item => ['completed', 'approved'].includes(String(item.status || '').toLowerCase()))
      ? 'completed'
      : 'in-progress';
  }
  estimate.markModified('lineItems');
  estimate.total = (0, serverContext.calculateEstimateTotal)(estimate.lineItems);
  await estimate.save();

  const savedEstimate = await serverContext.Estimate.findById(estimate._id);
  const savedItem = savedEstimate?.lineItems
    .flatMap(category => category.items || [])
    .find(item => item.maintenanceScheduleId && item.maintenanceScheduleId.toString() === schedule._id.toString()
      && !(schedule.history || []).some(entry => String(entry.estimateItemId || '') === String(item._id)));

  if (savedItem && savedItem._id) {
    let scheduleNeedsSave = false;
    if (!schedule.linkedEstimateId || String(schedule.linkedEstimateId) !== String(savedEstimate._id)) {
      schedule.linkedEstimateId = savedEstimate._id;
      scheduleNeedsSave = true;
    }
    if (!schedule.linkedEstimateItemId || String(schedule.linkedEstimateItemId) !== String(savedItem._id)) {
      schedule.linkedEstimateItemId = savedItem._id;
      scheduleNeedsSave = true;
    }
    if (scheduleNeedsSave) {
      await schedule.save();
    }
    await (0, serverContext.syncVendorAssignedEstimateItem)(savedEstimate, savedItem, schedule.assignedVendor);
  }

  return { schedule, estimate: savedEstimate, item: savedItem || null };
}

async function syncMaintenanceRequestToEstimate(request) {
  if (!request?._id || !request.projectId || !request.title) return;

  const defaultMaintenanceEstimateTitle = 'Maintenance request';
  const rawUnitId = request.unitId && (request.unitId._id || request.unitId);
  let unitNumber = typeof request.unitId?.number === 'string' ? request.unitId.number.trim() : '';
  if (!unitNumber && rawUnitId) {
    const linkedUnit = await serverContext.Unit.findById(rawUnitId).select('number').lean().catch(() => null);
    unitNumber = String(linkedUnit?.number || '').trim();
  }
  const unitLabel = unitNumber ? `Unit ${unitNumber}` : '';
  const unitCategoryName = unitLabel ? `Maintenance ${unitLabel}` : '';
  const estimateItemName = unitLabel ? `${unitLabel} - ${request.title}` : request.title;

  // 1. Ensure the assigned vendor is linked to the project when one exists
  if (request.assignedVendor) {
    await (0, serverContext.ensureVendorProjectAssignment)(request.assignedVendor, request.projectId);
  }

  // 2. Find or create the default estimate shell for maintenance requests
  let estimate = request.linkedEstimateId ? await serverContext.Estimate.findById(request.linkedEstimateId) : null;
  if (!estimate) {
    estimate = await serverContext.Estimate.findOne({
      projectId: request.projectId,
      title: { $regex: new RegExp(`^${defaultMaintenanceEstimateTitle}$`, 'i') }
    });
  }

  if (!estimate) {
    estimate = new serverContext.Estimate({
      projectId: request.projectId,
      invoiceNumber: `MR-${Date.now()}`,
      title: defaultMaintenanceEstimateTitle,
      lineItems: [],
      total: 0,
      tax: 0
    });
    await estimate.save();
    estimate = await serverContext.Estimate.findById(estimate._id);
  } else if (estimate.title !== defaultMaintenanceEstimateTitle) {
    estimate.title = defaultMaintenanceEstimateTitle;
  }

  // 3. Add a linked line item for the maintenance request
  const itemStatus = (0, serverContext.getEstimateItemStatusFromMaintenanceStatus)(request.status);
  const requestCost = Number.isFinite(Number(request.cost)) ? Number(request.cost) : 0;
  let maintenanceCategory = estimate.lineItems.find(category => category.category === 'Maintenance');
  if (!maintenanceCategory) {
    estimate.lineItems.push({
      type: 'category',
      category: 'Maintenance',
      status: itemStatus === 'completed' ? 'completed' : 'in-progress',
      items: []
    });
    maintenanceCategory = estimate.lineItems.find(category => category.category === 'Maintenance');
  }
  let targetCategory = maintenanceCategory;
  if (unitCategoryName) {
    targetCategory = estimate.lineItems.find(
      category => String(category.category || '').trim().toLowerCase() === unitCategoryName.toLowerCase()
    );

    if (!targetCategory) {
      estimate.lineItems.push({
        type: 'category',
        category: unitCategoryName,
        status: itemStatus === 'completed' ? 'completed' : 'in-progress',
        items: []
      });
      targetCategory = estimate.lineItems.find(
        category => String(category.category || '').trim().toLowerCase() === unitCategoryName.toLowerCase()
      );
    }
  }

  let estimateItem = estimate.lineItems
    .flatMap(category => category.items || [])
    .find(item => {
      const matchesLink = request.linkedEstimateItemId && item._id?.toString() === request.linkedEstimateItemId.toString();
      const matchesRequest = item.maintenanceRequestId && item.maintenanceRequestId.toString() === request._id.toString();
      return matchesLink || matchesRequest;
    });
  const currentCategory = estimateItem
    ? estimate.lineItems.find(category => (category.items || []).some(item => item._id?.toString() === estimateItem._id?.toString()))
    : null;

  if (!estimateItem) {
    estimateItem = {
      type: 'item',
      name: estimateItemName,
      description: request.description || '',
      costCode: 'Maintenance',
      quantity: 1,
      unitPrice: requestCost,
      laborCost: requestCost,
      total: requestCost,
      status: itemStatus,
      maintenanceRequestId: request._id,
      assignedTo: request.assignedVendor || null,
      photos: {
        before: Array.isArray(request.photos) ? [...request.photos] : [],
        after: Array.isArray(request.afterPhotos) ? [...request.afterPhotos] : []
      },
      startDate: request.scheduledFor || request.createdAt || new Date(),
      endDate: request.completedAt || null
    };
    targetCategory.items.push(estimateItem);
  } else {
    estimateItem.name = estimateItemName;
    estimateItem.description = request.description || '';
    estimateItem.costCode = estimateItem.costCode || 'Maintenance';
    estimateItem.quantity = 1;
    estimateItem.unitPrice = requestCost;
    estimateItem.laborCost = requestCost;
    estimateItem.total = requestCost;
    estimateItem.status = itemStatus;
    estimateItem.maintenanceRequestId = request._id;
    estimateItem.assignedTo = request.assignedVendor || null;
    estimateItem.photos = {
      before: Array.isArray(request.photos) ? [...request.photos] : [],
      after: Array.isArray(estimateItem.photos?.after)
        ? estimateItem.photos.after
        : (Array.isArray(request.afterPhotos) ? [...request.afterPhotos] : [])
    };
    estimateItem.startDate = request.scheduledFor || request.createdAt || estimateItem.startDate || new Date();
    estimateItem.endDate = request.completedAt || null;

    if (currentCategory && targetCategory && currentCategory !== targetCategory) {
      currentCategory.items = (currentCategory.items || []).filter(item => item._id?.toString() !== estimateItem._id?.toString());
      targetCategory.items = targetCategory.items || [];
      targetCategory.items.push(estimateItem);
    }
  }

  for (const category of estimate.lineItems) {
    const categoryItems = category.items || [];
    category.status = categoryItems.length && categoryItems.every(item => ['completed', 'approved'].includes(String(item.status || '').toLowerCase()))
      ? 'completed'
      : 'in-progress';
  }
  estimate.markModified('lineItems');
  estimate.total = (0, serverContext.calculateEstimateTotal)(estimate.lineItems);
  await estimate.save();

  // 4. Mirror the line item onto the vendor assignment list when assigned
  const savedEstimate = await serverContext.Estimate.findById(estimate._id);
  const savedItem = savedEstimate.lineItems
    .flatMap(category => category.items || [])
    .find(item => item.maintenanceRequestId && item.maintenanceRequestId.toString() === request._id.toString());

  if (savedItem && savedItem._id) {
    let requestNeedsSave = false;
    if (!request.linkedEstimateId || String(request.linkedEstimateId) !== String(savedEstimate._id)) {
      request.linkedEstimateId = savedEstimate._id;
      requestNeedsSave = true;
    }
    if (!request.linkedEstimateItemId || String(request.linkedEstimateItemId) !== String(savedItem._id)) {
      request.linkedEstimateItemId = savedItem._id;
      requestNeedsSave = true;
    }
    if (requestNeedsSave) {
      await request.save();
    }

    await (0, serverContext.syncVendorAssignedEstimateItem)(savedEstimate, savedItem, request.assignedVendor);
  }
}



return {
  getEstimateItemStatusFromMaintenanceStatus,
  getMaintenanceStatusFromEstimateItemStatus,
  calculateEstimateTotal,
  getRecurringMaintenanceEstimateTitle,
  ensureVendorProjectAssignment,
  syncVendorAssignedEstimateItem,
  syncMaintenanceScheduleFromEstimateItem,
  syncLinkedMaintenanceRecordsFromEstimateItem,
  syncMaintenanceRequestFromEstimateItem,
  syncMaintenanceScheduleToEstimate,
  syncMaintenanceRequestToEstimate
};
};

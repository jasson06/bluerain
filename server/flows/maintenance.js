// maintenance flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

function deriveMaintenanceStatusFromStage(stage, fallback = 'pending') {
  if (stage === 'completed' || stage === 'closed') return 'completed';
  if (['scheduled', 'waiting', 'in-progress'].includes(stage)) {
    return 'in-progress';
  }
  if (stage === 'new') return 'pending';
  return ['pending', 'in-progress', 'completed'].includes(fallback) ? fallback : 'pending';
}

function normalizeMaintenanceWorkflowStage(workflowStage, legacyStatus, hasAssignedVendor = false, hasScheduledFor = false, fallback = 'new') {
  const normalizedInput = String(workflowStage || '').trim().toLowerCase();
  const legacyStageMap = {
    submitted: 'new',
    acknowledged: 'new',
    triaged: 'new',
    assigned: 'scheduled',
    'waiting-on-vendor': 'waiting',
    'waiting-on-tenant': 'waiting'
  };
  const collapsedStage = legacyStageMap[normalizedInput] || normalizedInput;

  if (serverContext.MAINTENANCE_WORKFLOW_STAGES.includes(collapsedStage)) {
    if (collapsedStage === 'scheduled' && !hasScheduledFor && !hasAssignedVendor) return 'new';
    return collapsedStage;
  }

  if (legacyStatus === 'completed') return 'completed';
  if (legacyStatus === 'pending') return 'new';
  if (hasScheduledFor) return 'scheduled';
  if (hasAssignedVendor) return 'scheduled';
  if (legacyStatus === 'in-progress') return 'in-progress';
  return serverContext.MAINTENANCE_WORKFLOW_STAGES.includes(fallback) ? fallback : 'new';
}

function appendMaintenanceSystemUpdate(request, text) {
  const message = String(text || '').trim();
  if (!message) return;
  request.updates = request.updates || [];
  request.updates.push({
    authorRole: 'system',
    authorName: 'System',
    text: message,
    createdAt: new Date()
  });
}

function parseMaintenanceDate(value) {
  if (value === null || typeof value === 'undefined') return undefined;
  const raw = String(value).trim();
  if (!raw) return null;
  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, year, month, day, hours, minutes, seconds] = localMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds || 0),
      0
    );
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseMaintenanceCost(value) {
  if (value === null || typeof value === 'undefined') return undefined;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/[$,\s]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100) / 100;
}

function formatMaintenanceCost(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatMaintenanceTimelineDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago'
  });
}

function maintenanceQCError(res, error) {
  return res.status(error.status || (error.name === 'VersionError' ? 409 : 500))
    .json({ message: error.name === 'VersionError' ? 'This visit changed. Refresh and try again.' : error.message });
}

function get_api_properties_maintenance() {
// [SECTION] Property management, tenants, maintenance, and resident communications

// ✅ Get ALL maintenance requests for ALL properties (optional ?status=pending,in-progress)
serverContext.app.get('/api/properties/maintenance', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      const statuses = String(status)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (statuses.length) {
        filter.status = { $in: statuses };
      }
    }

    const requests = await serverContext.MaintenanceRequest.find(filter)
      .populate('unitId')
      .populate('assignedVendor', 'name email trade specialty')
      .populate('projectId') // include project name + address so frontend can show property address
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching all maintenance requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_propertyId_maintenance() {
// Maintenance Request Routes
serverContext.app.get('/api/properties/:propertyId/maintenance', async (req, res) => {
  try {
    const requests = await serverContext.MaintenanceRequest.find({ projectId: req.params.propertyId })
      .populate('unitId')
      .populate('assignedVendor', 'name email trade specialty')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching maintenance requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_maintenance() {
// Create with optional photos (multipart or JSON)
serverContext.app.post('/api/properties/:propertyId/maintenance', serverContext.maintenancePhotoUpload.array('photos', 10), async (req, res) => {
  try {
    let photos = (req.files || []).map(f => `/uploads/maintenance/${f.filename}`);
    // Accept temp photo paths and move them to permanent
    if (req.body.tempPhotosPaths) {
      let tempPaths = [];
      try {
        tempPaths = JSON.parse(req.body.tempPhotosPaths);
      } catch {
        if (typeof req.body.tempPhotosPaths === 'string') {
          tempPaths = req.body.tempPhotosPaths.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      for (const tempUrl of tempPaths) {
        const rel = tempUrl.replace(/^\/+/, '');
        const abs = (0, serverContext.resolveStoredUploadPath)(rel);
        const permanentDir = serverContext.path.join(serverContext.uploadDir, 'maintenance');
        try {
          if (serverContext.fs.existsSync(abs)) {
            const filename = serverContext.path.basename(abs).replace(/^temp-/, '');
            const dest = serverContext.path.join(permanentDir, filename);
            serverContext.fs.renameSync(abs, dest);
            photos.push(`/uploads/maintenance/${serverContext.path.basename(dest)}`);
          }
        } catch {}
      }
    }
    const assignedVendorId = typeof req.body.assignedVendor === 'string' && req.body.assignedVendor.trim()
      ? req.body.assignedVendor.trim()
      : null;
    if (assignedVendorId && !serverContext.mongoose.Types.ObjectId.isValid(assignedVendorId)) {
      return res.status(400).json({ message: 'Invalid vendor assignment' });
    }

    const scheduledFor = (0, serverContext.parseMaintenanceDate)(req.body.scheduledFor);
    if (typeof scheduledFor === 'undefined') {
      return res.status(400).json({ message: 'Invalid scheduled date' });
    }

    const cost = (0, serverContext.parseMaintenanceCost)(req.body.cost);
    if (typeof cost === 'undefined') {
      return res.status(400).json({ message: 'Invalid maintenance cost' });
    }

    let assignedVendor = null;
    let assignedTo = '';
    if (assignedVendorId) {
      assignedVendor = await serverContext.Vendor.findById(assignedVendorId).select('name email');
      if (!assignedVendor) {
        return res.status(404).json({ message: 'Assigned vendor not found' });
      }
      assignedTo = assignedVendor.name || assignedVendor.email || '';
    }

    const workflowStage = (0, serverContext.normalizeMaintenanceWorkflowStage)(
      req.body.workflowStage,
      req.body.status || 'pending',
      Boolean(assignedVendorId),
      Boolean(scheduledFor),
      'submitted'
    );

    const request = new serverContext.MaintenanceRequest({
      projectId: req.params.propertyId,
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority,
      unitId: req.body.unitId || null,
      status: (0, serverContext.deriveMaintenanceStatusFromStage)(workflowStage, req.body.status || 'pending'),
      workflowStage,
      assignedTo,
      assignedVendor: assignedVendorId,
      cost,
      scheduledFor,
      accessNotes: String(req.body.accessNotes || '').trim(),
      photos
    });
    (0, serverContext.appendMaintenanceSystemUpdate)(request, `Request submitted`);
    if (assignedTo) {
      (0, serverContext.appendMaintenanceSystemUpdate)(request, `Assigned to ${assignedTo}.`);
    }
    if (scheduledFor) {
      (0, serverContext.appendMaintenanceSystemUpdate)(request, `Scheduled for ${(0, serverContext.formatMaintenanceTimelineDate)(scheduledFor)}.`);
    }
    await request.save();
    await (0, serverContext.syncMaintenanceRequestToEstimate)(request);
    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating maintenance request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_maintenance_temp_photos() {
// Upload temp photos before creating a request
serverContext.app.post('/api/properties/:propertyId/maintenance/temp-photos', serverContext.maintenanceTempUpload.array('photos', 10), async (req, res) => {
  try {
    const photos = (req.files || []).map(f => `/uploads/maintenance/temp/${f.filename}`);
    res.status(201).json({ photos });
  } catch (error) {
    console.error('Error uploading temp maintenance photos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function patch_api_properties_propertyId_maintenance_requestId() {
// Legacy status-only patch retained for quick status updates
serverContext.app.patch('/api/properties/:propertyId/maintenance/:requestId', async (req, res) => {
  try {
    const request = await serverContext.MaintenanceRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Maintenance request not found' });

    const nextWorkflowStage = (0, serverContext.normalizeMaintenanceWorkflowStage)(
      req.body.workflowStage,
      req.body.status || request.status,
      Boolean(request.assignedVendor),
      Boolean(request.scheduledFor),
      request.workflowStage || 'submitted'
    );
    const nextStatus = (0, serverContext.deriveMaintenanceStatusFromStage)(nextWorkflowStage, req.body.status || request.status);

    if (request.status !== nextStatus || request.workflowStage !== nextWorkflowStage) {
      request.status = nextStatus;
      request.workflowStage = nextWorkflowStage;
      (0, serverContext.appendMaintenanceSystemUpdate)(request, `Workflow moved to ${nextWorkflowStage.replace(/-/g, ' ')}.`);
    }
    if (request.status === 'completed' && !request.completedAt) request.completedAt = new Date();
    if (request.status !== 'completed') request.completedAt = null;
    await request.save();
    await (0, serverContext.syncMaintenanceRequestToEstimate)(request);
    res.json(request);
  } catch (error) {
    console.error('Error updating maintenance request status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_properties_propertyId_maintenance_requestId() {
// Full edit (all fields + append/replace photos)
serverContext.app.put('/api/properties/:propertyId/maintenance/:requestId', serverContext.maintenancePhotoUpload.array('photos', 10), async (req, res) => {
  try {
    const request = await serverContext.MaintenanceRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Maintenance request not found' });

    const previousWorkflowStage = request.workflowStage || 'submitted';
    const previousStatus = request.status || 'pending';
    const previousAssignedVendorId = request.assignedVendor ? String(request.assignedVendor) : '';
    const previousAssignedTo = request.assignedTo || '';
    const previousCost = Number.isFinite(Number(request.cost)) ? Number(request.cost) : null;
    const previousScheduledFor = request.scheduledFor ? new Date(request.scheduledFor).toISOString() : '';
    const previousAccessNotes = request.accessNotes || '';

    // Update basic fields
    ['title','description','priority','unitId','accessNotes'].forEach(f => {
      if (typeof req.body[f] !== 'undefined' && req.body[f] !== '') {
        request[f] = req.body[f];
      }
    });
    if (typeof req.body.accessNotes !== 'undefined' && req.body.accessNotes === '') {
      request.accessNotes = '';
    }

    if (typeof req.body.assignedVendor !== 'undefined') {
      const assignedVendorId = String(req.body.assignedVendor || '').trim();
      if (assignedVendorId && !serverContext.mongoose.Types.ObjectId.isValid(assignedVendorId)) {
        return res.status(400).json({ message: 'Invalid vendor assignment' });
      }
      if (!assignedVendorId) {
        request.assignedVendor = null;
        request.assignedTo = '';
      } else {
        const vendor = await serverContext.Vendor.findById(assignedVendorId).select('name email');
        if (!vendor) {
          return res.status(404).json({ message: 'Assigned vendor not found' });
        }
        request.assignedVendor = vendor._id;
        request.assignedTo = vendor.name || vendor.email || '';
      }
    }

    if (typeof req.body.scheduledFor !== 'undefined') {
      const scheduledFor = (0, serverContext.parseMaintenanceDate)(req.body.scheduledFor);
      if (typeof scheduledFor === 'undefined') {
        return res.status(400).json({ message: 'Invalid scheduled date' });
      }
      request.scheduledFor = scheduledFor;
    }

    if (typeof req.body.cost !== 'undefined') {
      const cost = (0, serverContext.parseMaintenanceCost)(req.body.cost);
      if (typeof cost === 'undefined') {
        return res.status(400).json({ message: 'Invalid maintenance cost' });
      }
      request.cost = cost;
    }

    request.workflowStage = (0, serverContext.normalizeMaintenanceWorkflowStage)(
      req.body.workflowStage,
      typeof req.body.status !== 'undefined' ? req.body.status : request.status,
      Boolean(request.assignedVendor),
      Boolean(request.scheduledFor),
      request.workflowStage || 'submitted'
    );
    request.status = (0, serverContext.deriveMaintenanceStatusFromStage)(
      request.workflowStage,
      typeof req.body.status !== 'undefined' ? req.body.status : request.status
    );

    // Completed timestamp handling
    if (request.status === 'completed' && !request.completedAt) {
      request.completedAt = new Date();
    } else if (request.status !== 'completed') {
      request.completedAt = null;
    }

    // Photos logic
    const newPhotos = (req.files || []).map(f => `/uploads/maintenance/${f.filename}`);
    // Also accept temp photos and move them to permanent
    if (req.body.tempPhotosPaths) {
      let tempPaths = [];
      try {
        tempPaths = JSON.parse(req.body.tempPhotosPaths);
      } catch {
        if (typeof req.body.tempPhotosPaths === 'string') {
          tempPaths = req.body.tempPhotosPaths.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      const permanentDir = serverContext.path.join(serverContext.uploadDir, 'maintenance');
      for (const tempUrl of tempPaths) {
        try {
          const rel = tempUrl.replace(/^\/+/, '');
          const abs = (0, serverContext.resolveStoredUploadPath)(rel);
          if (serverContext.fs.existsSync(abs)) {
            const filename = serverContext.path.basename(abs).replace(/^temp-/, '');
            const dest = serverContext.path.join(permanentDir, filename);
            serverContext.fs.renameSync(abs, dest);
            newPhotos.push(`/uploads/maintenance/${serverContext.path.basename(dest)}`);
          }
        } catch {}
      }
    }
    // Parse removal list (supports JSON array, repeated fields, or comma-separated)
    let removeList = [];
    const raw = req.body.removePhotos;
    const rawArr = req.body['removePhotos[]'];
    if (Array.isArray(rawArr)) {
      removeList = rawArr;
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) removeList = parsed;
        else removeList = raw.split(',').map(s => s.trim()).filter(Boolean);
      } catch {
        removeList = raw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Remove selected photos
    if (removeList.length && Array.isArray(request.photos)) {
      const baseDir = serverContext.path.join(serverContext.uploadDir, 'maintenance');
      request.photos = request.photos.filter(p => {
        const keep = !removeList.includes(p);
        if (!keep) {
          // Best-effort file removal if within maintenance folder
          try {
            const rel = p.replace(/^\/+/, '');
            const abs = (0, serverContext.resolveStoredUploadPath)(rel);
            if (abs.startsWith(baseDir) && serverContext.fs.existsSync(abs)) serverContext.fs.unlinkSync(abs);
          } catch {}
        }
        return keep;
      });
    }

    if (newPhotos.length) {
      if (req.body.replacePhotos === 'true') {
        request.photos = newPhotos;
      } else {
        request.photos = [...(request.photos || []), ...newPhotos];
      }
    }

    if (previousWorkflowStage !== request.workflowStage) {
      (0, serverContext.appendMaintenanceSystemUpdate)(request, `Workflow moved to ${request.workflowStage.replace(/-/g, ' ')}.`);
    } else if (previousStatus !== request.status) {
      (0, serverContext.appendMaintenanceSystemUpdate)(request, `Status updated to ${request.status.replace(/-/g, ' ')}.`);
    }

    const nextAssignedVendorId = request.assignedVendor ? String(request.assignedVendor) : '';
    if (previousAssignedVendorId !== nextAssignedVendorId) {
      if (request.assignedTo) {
        (0, serverContext.appendMaintenanceSystemUpdate)(request, `Assigned to ${request.assignedTo}.`);
      } else if (previousAssignedTo) {
        (0, serverContext.appendMaintenanceSystemUpdate)(request, 'Vendor assignment cleared.');
      }
    }

    const nextScheduledFor = request.scheduledFor ? new Date(request.scheduledFor).toISOString() : '';
    if (previousScheduledFor !== nextScheduledFor) {
      if (request.scheduledFor) {
        (0, serverContext.appendMaintenanceSystemUpdate)(request, `Scheduled for ${(0, serverContext.formatMaintenanceTimelineDate)(request.scheduledFor)}.`);
      } else if (previousScheduledFor) {
        (0, serverContext.appendMaintenanceSystemUpdate)(request, 'Scheduled time cleared.');
      }
    }

    if ((request.accessNotes || '') !== previousAccessNotes) {
      (0, serverContext.appendMaintenanceSystemUpdate)(request, request.accessNotes ? 'Access instructions updated.' : 'Access instructions cleared.');
    }

    await request.save();
    await (0, serverContext.syncMaintenanceRequestToEstimate)(request);
    res.json(request);
  } catch (error) {
    console.error('Error fully updating maintenance request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function delete_api_properties_propertyId_maintenance_requestId_photos() {
// Delete a specific photo from a maintenance request
serverContext.app.delete('/api/properties/:propertyId/maintenance/:requestId/photos', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'Photo URL required' });
    const request = await serverContext.MaintenanceRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Maintenance request not found' });
    request.photos = (request.photos || []).filter(p => p !== url);
    await request.save();
    // Attempt to delete file if under uploads/maintenance
    try {
      const rel = url.replace(/^\/+/, '');
      const abs = (0, serverContext.resolveStoredUploadPath)(rel);
      const baseDir = serverContext.path.join(serverContext.uploadDir, 'maintenance');
      if (abs.startsWith(baseDir) && serverContext.fs.existsSync(abs)) serverContext.fs.unlinkSync(abs);
    } catch {}
    res.json({ message: 'Photo deleted', request });
  } catch (error) {
    console.error('Error deleting maintenance photo:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function delete_api_properties_propertyId_maintenance_requestId() {
// Add this with your other maintenance request routes
serverContext.app.delete('/api/properties/:propertyId/maintenance/:requestId', async (req, res) => {
    try {
        const { propertyId, requestId } = req.params;

        // Validate IDs
        if (!serverContext.mongoose.Types.ObjectId.isValid(propertyId) || !serverContext.mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({ message: 'Invalid property or request ID' });
        }

        // Find and delete the maintenance request
        const deletedRequest = await serverContext.MaintenanceRequest.findOneAndDelete({
            _id: requestId,
            projectId: propertyId
        });

        if (!deletedRequest) {
            return res.status(404).json({ message: 'Maintenance request not found' });
        }

        // If the request was associated with a unit, update unit status if needed
        if (deletedRequest.unitId) {
            // Optional: Update unit status or handle any cleanup
            await serverContext.Unit.findByIdAndUpdate(deletedRequest.unitId, {
                $set: { status: 'vacant' }
            });
        }

        res.json({ message: 'Maintenance request deleted successfully' });
    } catch (error) {
        console.error('Error deleting maintenance request:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
}

function post_api_properties_propertyId_maintenance_requestId_messages() {
serverContext.app.post('/api/properties/:propertyId/maintenance/:requestId/messages', async (req, res) => {
  try {
    const { propertyId, requestId } = req.params;
    const text = String(req.body.text || '').trim();
    const authorName = String(req.body.authorName || 'Management').trim() || 'Management';
    if (!text) return res.status(400).json({ message: 'Message is required' });
    if (text.length > 1200) return res.status(400).json({ message: 'Message is too long' });

    const request = await serverContext.MaintenanceRequest.findOne({ _id: requestId, projectId: propertyId });
    if (!request) return res.status(404).json({ message: 'Maintenance request not found' });

    request.updates = request.updates || [];
    request.updates.push({
      authorRole: 'manager',
      authorName,
      text,
      createdAt: new Date()
    });
    await request.save();
    res.status(201).json({ message: 'Message added', updates: request.updates, request });
  } catch (error) {
    console.error('Property maintenance message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

return {
  deriveMaintenanceStatusFromStage,
  normalizeMaintenanceWorkflowStage,
  appendMaintenanceSystemUpdate,
  parseMaintenanceDate,
  parseMaintenanceCost,
  formatMaintenanceCost,
  formatMaintenanceTimelineDate,
  maintenanceQCError,
  get_api_properties_maintenance,
  get_api_properties_propertyId_maintenance,
  post_api_properties_propertyId_maintenance,
  post_api_properties_propertyId_maintenance_temp_photos,
  patch_api_properties_propertyId_maintenance_requestId,
  put_api_properties_propertyId_maintenance_requestId,
  delete_api_properties_propertyId_maintenance_requestId_photos,
  delete_api_properties_propertyId_maintenance_requestId,
  post_api_properties_propertyId_maintenance_requestId_messages
};
};

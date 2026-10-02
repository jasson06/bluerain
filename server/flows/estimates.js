// estimates flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function post_api_estimates() {
// Add a new estimate to a project
serverContext.app.post('/api/estimates', async (req, res) => { 
  try {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));

    const { projectId, lineItems, tax, title } = req.body;

    const normalizeStatus = (status) => {
      if (typeof status !== 'string' || !status.trim()) return 'new';
      if (status.trim().toLowerCase() === 'not started') return 'in-progress';
      return status.trim().toLowerCase().replace(/\s+/g, '-');
    };

    const normalizePhase = (phase) => {
      const phaseAliases = new Map([
        ['planning', 'pre-construction'],
        ['permits-approvals', 'permits'],
        ['site-preparation', 'demo'],
        ['rough-construction', 'structure'],
        ['finish-work', 'finishes'],
        ['final-completion', 'punch'],
        ['completed', 'punch']
      ]);
      const allowedPhases = new Set(['pre-construction', 'permits', 'demo', 'structure', 'rough-in', 'inspections', 'finishes', 'exterior', 'punch']);
      const normalizedPhase = phaseAliases.get(phase) || phase;
      return allowedPhases.has(normalizedPhase) ? normalizedPhase : 'pre-construction';
    };

    const normalizePercentComplete = (value, status = 'new') => {
      const numericValue = Number.parseFloat(value);
      if (Number.isFinite(numericValue)) {
        return Math.min(100, Math.max(0, Math.round(numericValue)));
      }
      return normalizeStatus(status) === 'completed' ? 100 : 0;
    };

    // Validate Input
    if (!projectId || !lineItems || lineItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid input: Missing required fields.' });
    }

    if (!serverContext.mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ success: false, message: 'Invalid Project ID.' });
    }
 
    // Organize Line Items into Categories and PRESERVE photos field
    const structuredLineItems = lineItems.map((category, categoryIndex) => {
      if (category.type === 'category') {
        if (!category.category) {
          throw new Error("Category name is required.");
        }

        const items = category.items.map((item, itemIndex) => {
          if (!item.name || item.quantity === undefined || item.unitPrice === undefined) {
            throw new Error("Each line item must include a name, quantity, and unit price.");
          }
 
          return {
            type: 'item',
            name: item.name,
            sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : itemIndex,
            description: item.description || '',
            costCode: item.costCode || 'Uncategorized',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total || item.quantity * item.unitPrice,
            status: normalizeStatus(item.status),
            phase: normalizePhase(item.phase),
            percentComplete: normalizePercentComplete(item.percentComplete, item.status),
            assignedTo: item.assignedTo || null,
            maintenanceRequestId: item.maintenanceRequestId,
            maintenanceScheduleId: item.maintenanceScheduleId,
            photos: item.photos && typeof item.photos === 'object'
              ? {
                  before: Array.isArray(item.photos.before) ? item.photos.before : [],
                  after: Array.isArray(item.photos.after) ? item.photos.after : []
                }
              : { before: [], after: [] }
          };
        });

        return {
          type: 'category',
          category: category.category,
          sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : categoryIndex,
          status: 'in-progress',
          items: items
        };
      } else {
        throw new Error("Unexpected structure. All entries should be categories containing items.");
      }
    });

    // Calculate Total Estimate
    const total = structuredLineItems.reduce((sum, category) => {
      return sum + category.items.reduce((catSum, item) => catSum + item.total, 0);
    }, 0);

    // Create Estimate Document
    const invoiceNumber = `INV-${Date.now()}`;
    const newEstimate = new serverContext.Estimate({
      projectId,
      invoiceNumber,
      title: title || '', 
      lineItems: structuredLineItems,
      total,
      tax
    });

    await newEstimate.save();

    // ✅ Log the estimate creation in daily logs
    await (0, serverContext.logDailyUpdate)(
      projectId,
      `A new estimate (${invoiceNumber}) was created${title ? `: "${title}"` : ""}.`
    );

    res.status(201).json({ success: true, estimate: newEstimate });

  } catch (error) {
    console.error('Error saving estimate:', error.message);
    res.status(500).json({ success: false, message: 'Failed to save estimate.' });
  }
});
}

function get_api_estimates_id() {
// Route to Get a Single Estimate by ID
serverContext.app.get('/api/estimates/:id', async (req, res) => {
  const { id } = req.params;

  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid estimate ID.' });
  }

  try {
    const estimate = await serverContext.Estimate.findById(id)
      .populate('projectId', 'name address')
      .populate('lineItems.items.assignedTo', 'name'); // Ensure 'assignedTo' is populated

    if (!estimate) {
      return res.status(404).json({ success: false, message: 'Estimate not found.' });
    }

    const sortedEstimate = estimate.toObject();
    sortedEstimate.lineItems = (sortedEstimate.lineItems || [])
      .map((category, categoryIndex) => ({
        ...category,
        items: (category.items || []).slice().sort((left, right) => {
          const leftOrder = Number.isFinite(left?.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
          const rightOrder = Number.isFinite(right?.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return 0;
        })
      }))
      .sort((left, right) => {
        const leftOrder = Number.isFinite(left?.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
        const rightOrder = Number.isFinite(right?.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return 0;
      });

    res.status(200).json({ success: true, estimate: sortedEstimate });
  } catch (error) {
    console.error('❌ Error fetching estimate:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch estimate.' });
  }
});
}

function get_api_estimates() {
// Route to Get All Estimates for a Specific Project
serverContext.app.get('/api/estimates', async (req, res) => {
  const { projectId } = req.query;

  try {
    let estimates;
    if (projectId && serverContext.mongoose.Types.ObjectId.isValid(projectId)) {
      // Return estimates for a specific project
      estimates = await serverContext.Estimate.find({ projectId }).populate('projectId', 'name address');
    } else {
      // Return all estimates
      estimates = await serverContext.Estimate.find().populate('projectId', 'name address');
    }

    res.status(200).json({ success: true, estimates });
  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch estimates.' });
  }
});
}

function delete_api_estimates_id() {
// Route to Get Estimates for a Specific Project
serverContext.app.delete('/api/estimates/:id', async (req, res) => {
  const { id } = req.params;

  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Estimate ID.' });
  }

  const estimateObjectId = new serverContext.mongoose.Types.ObjectId(id);  // Convert id to ObjectId

  try {
    // Delete the estimate
    const deletedEstimate = await serverContext.Estimate.findByIdAndDelete(estimateObjectId);
    if (!deletedEstimate) {
      return res.status(404).json({ success: false, message: 'Estimate not found.' });
    }

    // Debugging: Check vendors with assigned items linked to this estimate
    const vendorsWithItems = await serverContext.Vendor.find({ "assignedItems.estimateId": estimateObjectId });
    console.log("Vendors with assigned items for this estimate:", vendorsWithItems);

    // Remove assigned items linked to the estimate
    const updatedVendors = await serverContext.Vendor.updateMany(
      { "assignedItems.estimateId": estimateObjectId },
      { $pull: { assignedItems: { estimateId: estimateObjectId } } }
    );

    console.log("Vendors updated:", updatedVendors.modifiedCount);

    res.status(200).json({
      success: true,
      message: 'Estimate and associated line items removed from vendors successfully.',
      vendorsUpdated: updatedVendors.modifiedCount
    });
  } catch (error) {
    console.error('Error deleting estimate and assigned items:', error);
    res.status(500).json({ success: false, message: 'Failed to delete estimate and assigned items.' });
  }
});
}

function put_api_estimates_id() {
// Backend route to update the estimate
serverContext.app.put("/api/estimates/:id", async (req, res) => {
  try {
    const estimateId = req.params.id;
    const updatesPayload = req.body;

    // Defensive: Ensure title is a string
    if (typeof updatesPayload.title !== "string") {
      updatesPayload.title = "";
    }

    // Defensive: If lineItems is present, ensure it's an array
    if ("lineItems" in updatesPayload && !Array.isArray(updatesPayload.lineItems)) {
      return res.status(400).json({ message: "Missing or invalid lineItems array in request body." });
    }

    // Normalize status helper
    function normalizeStatus(status) {
      if (typeof status !== "string") return status;
      status = status.trim();
      if (status.toLowerCase() === "not started") return "in-progress";
      return status.toLowerCase().replace(/\s+/g, "-");
    }

    function normalizePhase(phase) {
      const phaseAliases = new Map([
        ["planning", "pre-construction"],
        ["permits-approvals", "permits"],
        ["site-preparation", "demo"],
        ["rough-construction", "structure"],
        ["finish-work", "finishes"],
        ["final-completion", "punch"],
        ["completed", "punch"]
      ]);
      const allowedPhases = new Set(["pre-construction", "permits", "demo", "structure", "rough-in", "inspections", "finishes", "exterior", "punch"]);
      const normalizedPhase = phaseAliases.get(phase) || phase;
      return allowedPhases.has(normalizedPhase) ? normalizedPhase : "pre-construction";
    }

    function normalizePercentComplete(value, status = "new") {
      const numericValue = Number.parseFloat(value);
      if (Number.isFinite(numericValue)) {
        return Math.min(100, Math.max(0, Math.round(numericValue)));
      }
      return normalizeStatus(status) === "completed" ? 100 : 0;
    }

    // Fetch the existing document
    const existingEstimate = await serverContext.Estimate.findById(estimateId);
    if (!existingEstimate) {
      return res.status(404).json({ message: "Estimate not found" });
    }

    // Only process lineItems if present and is an array
    if (Array.isArray(updatesPayload.lineItems)) {
      // Create a map of existing items by their _id
      const existingItemsMap = new Map();
      existingEstimate.lineItems.forEach((lineItem) => {
        lineItem.items.forEach((item) => {
          existingItemsMap.set(item._id.toString(), item);
        });
      });

      // Merge new items with existing data
      updatesPayload.lineItems.forEach((lineItem, categoryIndex) => {
        lineItem.sortOrder = Number.isFinite(lineItem.sortOrder) ? lineItem.sortOrder : categoryIndex;
        lineItem.items.forEach((item, itemIndex) => {
          item.sortOrder = Number.isFinite(item.sortOrder) ? item.sortOrder : itemIndex;
          if (item.status && item.status.trim() !== "") {
            item.status = normalizeStatus(item.status);
          }
          item.phase = normalizePhase(item.phase);
          item.percentComplete = normalizePercentComplete(item.percentComplete, item.status);

          if (item._id && existingItemsMap.has(item._id.toString())) {
            const existingItem = existingItemsMap.get(item._id.toString());

            // Preserve fields
            item.photos = existingItem.photos ?? { before: [], after: [] };
            item.assignedTo = existingItem.assignedTo ?? null;
            item.startDate = item.startDate ?? existingItem.startDate;
            item.endDate = item.endDate ?? existingItem.endDate;
            item.status = item.status || normalizeStatus(existingItem.status);
            item.phase = item.phase || existingItem.phase || "pre-construction";
            item.percentComplete = item.percentComplete ?? existingItem.percentComplete ?? normalizePercentComplete(undefined, item.status);
            item.costCode = item.costCode || existingItem.costCode || "Uncategorized";
            item.maintenanceRequestId = item.maintenanceRequestId || existingItem.maintenanceRequestId || null;
            item.maintenanceScheduleId = item.maintenanceScheduleId || existingItem.maintenanceScheduleId || null;
          } else {
            // For new items
            if (!item.status || item.status.trim() === "") {
              item.status = "in-progress";
            }
            item.phase = normalizePhase(item.phase);
            item.percentComplete = normalizePercentComplete(item.percentComplete, item.status);
            item.costCode = item.costCode || "Uncategorized";
            item.maintenanceRequestId = item.maintenanceRequestId || null;
            item.maintenanceScheduleId = item.maintenanceScheduleId || null;
          }
        });
      });

      // Recalculate the estimate total
      let newTotal = 0;
      updatesPayload.lineItems.forEach((lineItem) => {
        lineItem.items.forEach((item) => {
          newTotal += (item.quantity || 1) * (item.unitPrice || 0);
        });
      });
      updatesPayload.total = newTotal;
    }

    // If no lineItems, preserve the existing total
    if (!Array.isArray(updatesPayload.lineItems)) {
      updatesPayload.total = existingEstimate.total || 0;
    }

    // Update the document
    const updatedEstimate = await serverContext.Estimate.findByIdAndUpdate(
      estimateId,
      {
        $set: updatesPayload
      },
      { new: true, runValidators: true }
    );

    const linkedMaintenanceItems = updatedEstimate.lineItems.flatMap(category =>
      (category.items || []).filter(item => item.maintenanceRequestId || item.maintenanceScheduleId)
    );
    for (const item of linkedMaintenanceItems) {
      await (0, serverContext.syncLinkedMaintenanceRecordsFromEstimateItem)(updatedEstimate, item);
    }

    // Log the update
    await (0, serverContext.logDailyUpdate)(
      updatedEstimate.projectId,
      `Estimate ${updatedEstimate.invoiceNumber} was updated${updatedEstimate.title ? `: "${updatedEstimate.title}"` : ""}.`
    );

    res.status(200).json(updatedEstimate);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Server error", error });
  }
});
}

function patch_api_estimates_id_update_photo() {
serverContext.app.patch('/api/estimates/:id/update-photo', async (req, res) => {
  const { id } = req.params;
  const { itemId, type, photos } = req.body; // ✅ Only extract the needed fields

  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Estimate ID.' });
  }

  try {
    let estimate = await serverContext.Estimate.findById(id);
    if (!estimate) {
      return res.status(404).json({ success: false, message: 'Estimate not found.' });
    }

    let itemFound = false;
    
    estimate.lineItems.forEach(category => {
        category.items.forEach(item => {
            if (item._id.toString() === itemId) {
                item.photos[type] = photos; // ✅ Only update photos, nothing else
                itemFound = true;
            }
        });
    });

    if (!itemFound) {
      return res.status(404).json({ success: false, message: 'Item not found in estimate.' });
    }

    const updatedEstimate = await estimate.save();
    res.status(200).json({ success: true, estimate: updatedEstimate });
  } catch (error) {
    console.error('❌ Error updating estimate photo data:', error);
    res.status(500).json({ success: false, message: 'Failed to update estimate photo data.' });
  }
});
}

function get_estimate_view_html() {
// Serve the estimate-view.html file
serverContext.app.get('/estimate-view.html', (req, res) => {
  const filePath = serverContext.path.join(serverContext.__dirname, 'dist', 'estimate-view.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving estimate-view.html:', err);
      res.status(500).send('Failed to load the page.');
    }
  });
});
}

function get_api_estimates_projectId_line_items() {
// Endpoint to fetch line items by project ID
serverContext.app.get('/api/estimates/:projectId/line-items', async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!serverContext.mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }

    const estimates = await serverContext.Estimate.find({ projectId }).populate('lineItems.items.assignedTo');

    if (!estimates || estimates.length === 0) {
      return res.status(404).json({ message: 'No estimates found for this project' });
    }

    // ✅ Return the full array of estimates (each includes title and lineItems)
    res.json(estimates);
  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});
}

function put_api_estimates_line_items_lineItemId() {
// Endpoint to update a line item
serverContext.app.put('/api/estimates/line-items/:lineItemId', async (req, res) => {
  try {
    const { lineItemId } = req.params;
    const updates = req.body;
    const updateObj = {}; // Build an update object dynamically

    if (updates.status !== undefined) {
      updateObj['lineItems.$[].items.$[item].status'] = updates.status;
    }
    if (updates.startDate !== undefined) {
      updateObj['lineItems.$[].items.$[item].startDate'] = updates.startDate;
    }
    if (updates.endDate !== undefined) {
      updateObj['lineItems.$[].items.$[item].endDate'] = updates.endDate;
    }
    if (updates.description !== undefined) {
      updateObj['lineItems.$[].items.$[item].description'] = updates.description;
    }

    // ✅ Find and update the estimate
    const estimate = await serverContext.Estimate.findOneAndUpdate(
      { 'lineItems.items._id': lineItemId },
      { $set: updateObj },
      {
        arrayFilters: [{ 'item._id': lineItemId }],
        new: true
      }
    );

    if (!estimate) {
      return res.status(404).json({ message: 'Line item not found' });
    }

    // ✅ Extract projectId for logging
    const projectId = estimate.projectId;
    const lineItem = estimate.lineItems.find(li =>
      li.items.some(item => item._id.toString() === lineItemId)
    );

    const item = lineItem.items.find(item => item._id.toString() === lineItemId);
    const updatedField = Object.keys(updates).map(key => `${key}: ${updates[key]}`).join(', ');

    if (item?.maintenanceRequestId) {
      await (0, serverContext.syncMaintenanceRequestFromEstimateItem)(estimate, item);
    }

    // ✅ Log line item update in daily updates
    await (0, serverContext.logDailyUpdate)(
      projectId,
      `Line item "${item?.description || 'Unknown'}" was updated (${updatedField}).`
    );

    console.log(`✏️ Line item "${item?.description || 'Unknown'}" updated successfully.`);
    
    res.json({ message: 'Line item updated successfully', estimate });

  } catch (error) {
    console.error('❌ Error updating line item:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});
}

function patch_api_estimates_line_items_lineItemId_status() {
serverContext.app.patch('/api/estimates/line-items/:lineItemId/status', async (req, res) => {
  try {
    const { lineItemId } = req.params;
    const { status, percentComplete } = req.body;
    const allowedStatuses = ['in-progress', 'completed', 'approved', 'rework'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    const normalizePercentComplete = (value, itemStatus = 'new') => {
      const normalizedStatus = String(itemStatus || '').toLowerCase();
      if (normalizedStatus === 'in-progress') {
        return 0;
      }
      const numericValue = Number.parseFloat(value);
      if (Number.isFinite(numericValue)) {
        return Math.min(100, Math.max(0, Math.round(numericValue)));
      }
      return ['completed', 'approved'].includes(normalizedStatus) ? 100 : 0;
    };

    const normalizedPercentComplete = normalizePercentComplete(percentComplete, status);

    const previousEstimate = await serverContext.Estimate.findOne({ 'lineItems.items._id': lineItemId });
    const previousItem = serverContext.maintenanceQC.findItem(previousEstimate, lineItemId);
    if (previousItem?.maintenanceScheduleId && ['approved', 'rework'].includes(status)) {
      return res.status(403).json({ message: 'Use manager QC review to approve or request rework.' });
    }
    // Update line item status in Estimate
    const estimate = await serverContext.Estimate.findOneAndUpdate(
      { 'lineItems.items._id': lineItemId },
      {
        $set: {
          'lineItems.$[].items.$[item].status': status,
          'lineItems.$[].items.$[item].percentComplete': normalizedPercentComplete
        }
      },
      { arrayFilters: [{ 'item._id': lineItemId }], new: true }
    );

    if (!estimate) {
      return res.status(404).json({ message: 'Line item not found.' });
    }

    // Find the updated line item and get maintenance linkage
    let updatedEstimateItem = null;
    let itemName = null;
    let itemStartDate = null;
    let projectId = null;
    for (const cat of estimate.lineItems) {
      for (const item of cat.items) {
        if (item._id.toString() === lineItemId) {
          updatedEstimateItem = item;
          itemName = item.name;
          itemStartDate = item.startDate;
          projectId = estimate.projectId;
        }
      }
    }

    // Sync linked maintenance status and metadata from the estimate item
    if (updatedEstimateItem?.maintenanceRequestId || updatedEstimateItem?.maintenanceScheduleId) {
      await (0, serverContext.syncLinkedMaintenanceRecordsFromEstimateItem)(estimate, updatedEstimateItem, {
        rescheduleOnComplete: status === 'completed',
        completedBy: req.body?.completedBy,
        notes: req.body?.notes
      });
    }

    res.json({ success: true, status, estimate });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});
}

return {
  post_api_estimates,
  get_api_estimates_id,
  get_api_estimates,
  delete_api_estimates_id,
  put_api_estimates_id,
  patch_api_estimates_id_update_photo,
  get_estimate_view_html,
  get_api_estimates_projectId_line_items,
  put_api_estimates_line_items_lineItemId,
  patch_api_estimates_line_items_lineItemId_status
};
};

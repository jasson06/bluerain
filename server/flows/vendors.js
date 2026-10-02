// vendors flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function post_api_assign_vendor() {
serverContext.app.post("/api/assign-vendor", async (req, res) => {
  const { estimateId, vendorId } = req.body;

  if (!estimateId || !vendorId) {
      return res.status(400).json({ message: "Estimate ID and Vendor ID are required." });
  }

  try {
      const estimate = await serverContext.Estimate.findById(estimateId);
      if (!estimate) return res.status(404).json({ message: "Estimate not found." });

      const vendor = await serverContext.Vendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ message: "Vendor not found." });

      // Loop through all estimate items and transfer photos to vendor
      estimate.lineItems.forEach(category => {
          category.items.forEach(item => {
              const existingItem = vendor.assignedItems.find(vItem => vItem.itemId.toString() === item._id.toString());

              if (existingItem) {
                  existingItem.photos.before = item.photos.before; // Transfer before photos
                  existingItem.photos.after = item.photos.after; // Transfer after photos
              } else {
                  vendor.assignedItems.push({
                      itemId: item._id,
                      projectId: estimate.projectId,
                      name: item.name,
                      description: item.description,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      total: item.total,
                      status: "new",
                      photos: {
                          before: item.photos.before, // Transfer before photos
                          after: item.photos.after,   // Transfer after photos
                      }
                  });
              }
          });
      });

      await vendor.save();
      console.log(`✅ Photos transferred from Estimate ${estimateId} to Vendor ${vendorId}.`);
      return res.status(200).json({ message: "Vendor assigned and photos transferred successfully!" });

  } catch (error) {
      console.error("❌ Error assigning vendor:", error);
      res.status(500).json({ message: "Failed to assign vendor." });
  }
});
}

function post_api_add_vendor() {
// [SECTION] Vendors, managers, and project directory routes

// Add Vendor
serverContext.app.post('/api/add-vendor', async (req, res) => {
  try {
    const { name, email, phone, title } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Name is required." });
    }

    if (email) {
      const existing = await serverContext.Vendor.findOne({ email });
      if (existing) {
        return res.status(400).json({ success: false, message: "Vendor already exists with this email." });
      }
    }

    const newVendor = new serverContext.Vendor({ name, email, phone, title, status: 'inactive', isInvited: false, isActive: false });
    await newVendor.save();

    // Do NOT auto-invite here; invitation happens explicitly via /api/invite
    res.status(201).json({
      success: true,
      message: 'Vendor added successfully',
      vendor: newVendor
    });
  } catch (error) {
    console.error('Error adding vendor:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
}

function get_api_vendors() {
// API Endpoint to Get All Vendors
serverContext.app.get('/api/vendors', async (req, res) => {
  try {
    const vendors = await serverContext.Vendor.find();
    const estimates = await serverContext.Estimate.find({}, { lineItems: 1 });

    const laborCostMap = new Map();
    estimates.forEach(estimate => {
      (estimate.lineItems || []).forEach(category => {
        (category.items || []).forEach(item => {
          if (item && item._id && typeof item.laborCost !== 'undefined') {
            laborCostMap.set(item._id.toString(), item.laborCost);
          }
        });
      });
    });

    const syncedVendors = vendors.map(vendor => {
      const vendorObj = vendor.toObject();
      vendorObj.assignedItems = (vendorObj.assignedItems || []).map(item => {
        const itemId = item && item.itemId ? item.itemId.toString() : '';
        const syncedLaborCost = laborCostMap.get(itemId);
        return {
          ...item,
          laborCost: typeof syncedLaborCost !== 'undefined' ? syncedLaborCost : (item.laborCost || 0),
          photos: item.photos || { before: [], after: [] }
        };
      });
      return vendorObj;
    });

    res.status(200).json(syncedVendors);
  } catch (error) {
    console.error('Error fetching vendors:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch vendors' });
  }
});
}

function get_api_vendors_id() {
serverContext.app.get('/api/vendors/:id', async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid vendor ID.' });
  }

  try {
    const vendor = await serverContext.Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }

    res.status(200).json(vendor);
  } catch (error) {
    console.error('Error fetching vendor:', error.message);
    res.status(500).json({ error: 'Failed to fetch vendor.' });
  }
});
}

function delete_api_vendors_id() {
// API Endpoint to delete a vendor by ID
// DELETE /api/vendors/:id
serverContext.app.delete("/api/vendors/:id", async (req, res) => {
  const { id } = req.params;

  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid vendor ID." });
  }

  try {
    const deletedVendor = await serverContext.Vendor.findByIdAndDelete(id);

    if (!deletedVendor) {
      return res.status(404).json({ success: false, message: "Vendor not found." });
    }

    console.log(`✅ Vendor with ID ${id} deleted`);
    res.status(200).json({ success: true, message: "Vendor deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting vendor:", error.message);
    res.status(500).json({ success: false, message: "Failed to delete vendor." });
  }
});
}

function put_api_vendors_id() {
// ✅ Edit Vendor Information

serverContext.app.put("/api/vendors/:id", async (req, res) => {
  try {
    const { id } = req.params; // Get vendor ID from URL
    const updateData = req.body; // Get updated fields from request body

    if (!id) {
      return res.status(400).json({ success: false, message: "Vendor ID is required." });
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No update data provided." });
    }

    // If using MongoDB (Database)
    if (typeof serverContext.Vendor !== "undefined") {
      const updatedVendor = await serverContext.Vendor.findByIdAndUpdate(id, updateData, { 
        new: true, 
        runValidators: true 
      });

      if (!updatedVendor) {
        return res.status(404).json({ success: false, message: "Vendor not found." });
      }

      console.log(`✅ Vendor with ID ${id} updated in DB`);
      return res.status(200).json({ success: true, message: "Vendor updated successfully!", vendor: updatedVendor });
    }

    // If using in-memory array (`vendors`)
    if (typeof vendors !== "undefined" && Array.isArray(vendors)) {
      const vendorIndex = vendors.findIndex((v) => v.id === id);
      if (vendorIndex === -1) {
        return res.status(404).json({ success: false, message: "Vendor not found." });
      }

      // Update the vendor object in memory
      vendors[vendorIndex] = { ...vendors[vendorIndex], ...updateData };

      console.log(`✅ Vendor with ID ${id} updated in memory`);
      return res.status(200).json({ success: true, message: "Vendor updated successfully!", vendor: vendors[vendorIndex] });
    }

    return res.status(500).json({ success: false, message: "Vendor storage method not recognized." });

  } catch (error) {
    console.error("❌ Error updating vendor:", error);
    res.status(500).json({ success: false, message: "Failed to update vendor. Please try again." });
  }
});
}

function post_api_vendors_id_upload_w9() {
// POST /api/vendors/:id/upload-w9
serverContext.app.post('/api/vendors/:id/upload-w9', serverContext.w9Upload.single('w9'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid vendor ID.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const vendor = await serverContext.Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const publicPath = `/uploads/vendors/w9/${req.file.filename}`;
    vendor.documents = vendor.documents || {};
    vendor.documents.w9Path = publicPath;
    vendor.documents.w9UploadedAt = new Date();
    await vendor.save();

    res.status(200).json({ success: true, w9Url: publicPath, message: 'W9 uploaded successfully.' });
  } catch (error) {
    console.error('❌ Error uploading W9:', error);
    res.status(500).json({ success: false, message: 'Failed to upload W9.' });
  }
});
}

function delete_api_vendors_id_w9() {
serverContext.app.delete('/api/vendors/:id/w9', async (req, res) => {
  try {
    const { id } = req.params;
    if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid vendor ID.' });
    }

    const vendor = await serverContext.Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const w9Path = vendor.documents && vendor.documents.w9Path ? vendor.documents.w9Path : '';
    if (w9Path) {
      const rel = w9Path.startsWith('/') ? w9Path.slice(1) : w9Path;
      const normalizedRel = rel.startsWith('uploads/') ? rel.replace('uploads/', '') : rel;
      const filePath = serverContext.path.join(serverContext.uploadDir, normalizedRel);
      try {
        if (serverContext.fs.existsSync(filePath)) {
          serverContext.fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.warn('⚠️ Failed to delete W9 file from disk:', e.message);
      }
    }

    vendor.documents = vendor.documents || {};
    vendor.documents.w9Path = '';
    vendor.documents.w9UploadedAt = undefined;
    await vendor.save();

    res.status(200).json({ success: true, message: 'W9 removed.' });
  } catch (error) {
    console.error('❌ Error deleting W9:', error);
    res.status(500).json({ success: false, message: 'Failed to delete W9.' });
  }
});
}

function get_api_vendors_vendorId_debug_items() {
// Add this near your other API endpoints
serverContext.app.get("/api/vendors/:vendorId/debug-items", async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const vendor = await serverContext.Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    
    // Return all items regardless of status for debugging
    return res.status(200).json({
      totalItems: vendor.assignedItems.length,
      activeItems: vendor.assignedItems.filter(i => i.status !== "completed" && i.status !== "approved").length,
      completedItems: vendor.assignedItems.filter(i => i.status === "completed" || i.status === "approved").length,
      allStatuses: vendor.assignedItems.map(i => i.status)
    });
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});
}

function put_api_vendors_vendorId_update_item_status() {
serverContext.app.put('/api/vendors/:vendorId/update-item-status', async (req, res) => {
  const { vendorId } = req.params;
  const { itemId, status } = req.body;

  console.log("📌 Incoming Status Update:", { vendorId, itemId, status });

  if (!itemId || !status) {
    return res.status(400).json({ message: "Missing itemId or status." });
  }

  try {
    // ✅ Find Vendor
    const vendor = await serverContext.Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    // ✅ Find the assigned item
    const item = vendor.assignedItems.find(item => item.itemId.toString() === itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    // ✅ Find the project
    const project = await serverContext.Project.findById(item.projectId).select("name");
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const maintenanceEstimate = await serverContext.Estimate.findOne({ 'lineItems.items._id': itemId });
    const maintenanceItem = serverContext.maintenanceQC.findItem(maintenanceEstimate, itemId);
    if (maintenanceItem?.maintenanceScheduleId && !['new', 'in-progress', 'completed'].includes(status)) {
      return res.status(403).json({ message: 'Use manager QC review to approve or request rework.' });
    }
    // --- Set Dates Based on Status ---
    const now = new Date();
    if (status === "in-progress" && !item.startDate) {
      item.startDate = now;
    }
    if (status === "completed" && !item.endDate) {
      item.endDate = now;
    }
    // If reverting to "in-progress", clear endDate
    if (status === "in-progress" && item.endDate) {
      item.endDate = null;
    }
    // If reverting to "new", clear both dates
    if (status === "new") {
      item.startDate = null;
      item.endDate = null;
    }

    // ✅ Update status in Vendor assignedItems
    item.status = status;
    await vendor.save();
    console.log("✅ Vendor Item Status & Dates Updated Successfully:", item);

    // ✅ Update the corresponding item status and dates in the Estimate
    const estimateUpdate = {};
    estimateUpdate["lineItems.$[].items.$[elem].status"] = status;
    if (status === "in-progress") {
      estimateUpdate["lineItems.$[].items.$[elem].startDate"] = item.startDate || now;
      estimateUpdate["lineItems.$[].items.$[elem].endDate"] = null;
    }
    if (status === "completed") {
      estimateUpdate["lineItems.$[].items.$[elem].endDate"] = item.endDate || now;
    }
    if (status === "new") {
      estimateUpdate["lineItems.$[].items.$[elem].startDate"] = null;
      estimateUpdate["lineItems.$[].items.$[elem].endDate"] = null;
    }

    const estimateUpdateResult = await serverContext.Estimate.updateOne(
      { "lineItems.items._id": itemId },
      { $set: estimateUpdate },
      {
        arrayFilters: [{ "elem._id": new serverContext.mongoose.Types.ObjectId(itemId) }]
      }
    );

    const linkedEstimate = await serverContext.Estimate.findOne({ 'lineItems.items._id': itemId });
    const linkedItem = serverContext.maintenanceQC.findItem(linkedEstimate, itemId);
    if (linkedItem?.maintenanceScheduleId) {
      await (0, serverContext.syncMaintenanceScheduleFromEstimateItem)(linkedEstimate, linkedItem, {
        rescheduleOnComplete: status === 'completed', completedBy: vendor.name || 'Vendor'
      });
    }
    console.log("📊 Estimate Update Result:", estimateUpdateResult);

    // ✅ Log the status update in Daily Updates
    await (0, serverContext.logDailyUpdate)(
      item.projectId,
      `Item "${item.name}" status updated to "${status}" by Vendor "${vendor.name}" for Project "${project.name}".`
    );

    res.status(200).json({ message: "Item status and dates updated successfully in both vendor and estimate.", item });

  } catch (error) {
    console.error("❌ Error updating item status:", error);
    res.status(500).json({ message: "Failed to update item status." });
  }
});
}

function put_api_vendor_start_project() {
serverContext.app.put('/api/vendor/start-project', async (req, res) => {
  try {
      const { vendorId, projectId } = req.body;
      if (!vendorId || !projectId) {
          return res.status(400).json({ success: false, message: 'Vendor ID and Project ID are required' });
      }

      const vendor = await serverContext.Vendor.findById(vendorId);
      if (!vendor) {
          return res.status(404).json({ success: false, message: 'Vendor not found' });
      }

      const projectIndex = vendor.assignedProjects.findIndex(p => p.projectId.toString() === projectId);
      if (projectIndex === -1) {
          return res.status(404).json({ success: false, message: 'Project not assigned to vendor' });
      }

      vendor.assignedProjects[projectIndex].status = "in-progress";
      await vendor.save();

      res.status(200).json({ success: true, message: 'Project status updated to In Progress' });
  } catch (error) {
      console.error('Error updating project status:', error);
      res.status(500).json({ success: false, message: 'Failed to update project status' });
  }
});
}

function get_api_subcontractor_tasks() {
// ✅ API: Fetch Assigned Tasks (Line Items) for a Subcontractor
serverContext.app.get("/api/subcontractor/tasks", async (req, res) => {
  try {
      const { vendorId } = req.query;
      if (!vendorId) {
          return res.status(400).json({ error: "Vendor ID is required." });
      }

      const vendor = await serverContext.Vendor.findById(vendorId);
      if (!vendor) {
          return res.status(404).json({ error: "Vendor not found." });
      }

      res.status(200).json({ tasks: vendor.assignedItems || [] });
  } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks." });
  }
});
}

function get_api_vendors_vendorId_assigned_projects() {
serverContext.app.get('/api/vendors/:vendorId/assigned-projects', async (req, res) => {
  const { vendorId } = req.params;

  try {
    // Ensure population of project details
    const vendor = await serverContext.Vendor.findById(vendorId).populate({
      path: 'assignedProjects.projectId',
      model: 'Project',
      select: 'name status type address' // Ensure these fields are populated
    });

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const newJobs = vendor.assignedProjects.filter(proj => proj.status === 'new');
    const inProgress = vendor.assignedProjects.filter(proj => proj.status === 'in-progress');
    const rework = vendor.assignedProjects.filter(proj => proj.status === 'rework');
    const completed = vendor.assignedProjects.filter(proj => proj.status === 'completed');

    res.status(200).json({ success: true, newJobs, inProgress, rework, completed });
  } catch (error) {
    console.error('Error fetching assigned projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assigned projects.' });
  }
});
}

function get_api_subcontractor_projects() {
serverContext.app.get('/api/subcontractor/projects', async (req, res) => {
  try {
      const { vendorId } = req.query;
      if (!vendorId) {
          return res.status(400).json({ success: false, message: 'Vendor ID is required' });
      }

      const vendor = await serverContext.Vendor.findById(vendorId).populate({
          path: 'assignedProjects.projectId',
          model: 'Project'
      });

      if (!vendor) {
          return res.status(404).json({ success: false, message: 'Vendor not found' });
      }

      res.status(200).json({ success: true, projects: vendor.assignedProjects });
  } catch (error) {
      console.error('Error fetching assigned projects:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
});
}

function put_api_vendor_update_project_status() {
serverContext.app.put('/api/vendor/update-project-status', async (req, res) => {
  try {
      const { vendorId, projectId, status } = req.body;
      if (!vendorId || !projectId || !status) {
          return res.status(400).json({ error: "Vendor ID, Project ID, and Status are required." });
      }

      // ✅ Find vendor
      const vendor = await serverContext.Vendor.findById(vendorId);
      if (!vendor) {
          return res.status(404).json({ error: "Vendor not found." });
      }

      // ✅ Check if project is assigned to vendor
      const projectIndex = vendor.assignedProjects.findIndex(p => p.projectId.toString() === projectId);
      if (projectIndex === -1) {
          return res.status(404).json({ error: "Project not assigned to vendor." });
      }

      // ✅ Update status
      vendor.assignedProjects[projectIndex].status = status;

      await vendor.save();

      // ✅ Fetch project name for logging
      const project = await serverContext.Project.findById(projectId).select("name");
      const projectName = project ? project.name : "Unknown Project";

      // ✅ Log project status update in daily updates
      await (0, serverContext.logDailyUpdate)(
          projectId,
          `Vendor "${vendor.name}" updated project status to "${status}".`
      );

      console.log(`🔄 Vendor "${vendor.name}" updated status for project "${projectName}" to "${status}".`);
      
      res.status(200).json({ success: true, message: "Project status updated successfully." });

  } catch (error) {
      console.error("❌ Error updating project status:", error);
      res.status(500).json({ error: "Failed to update project status." });
  }
});
}

function post_api_vendors_vendorId_assign_item() {
serverContext.app.post('/api/vendors/:vendorId/assign-item', async (req, res) => {
  const { vendorId } = req.params;
  const { projectId, itemId, name, description, quantity, unitPrice, total } = req.body;

  try {
    // ✅ Find Vendor
    const vendor = await serverContext.Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    // ✅ Find Project for Logging
    const project = await serverContext.Project.findById(projectId).select("name");
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // ✅ Check if item is already assigned (prevent duplicates)
    let existingItem = vendor.assignedItems.find(i => i.itemId.toString() === itemId.toString());
    if (existingItem) {
      return res.status(400).json({ message: 'Item already assigned to this vendor.' });
    }

    // ✅ Assign the item to a specific project, always set createdAt
    vendor.assignedItems.push({
      itemId,
      projectId, // ✅ Ensure projectId is stored
      name,
      description,
      quantity,
      unitPrice,
      total,
      status: 'new',
      createdAt: new Date(), // <-- Always set date requested
      updatedAt: new Date()
    });

    await vendor.save();

    // ✅ Log the assignment in Daily Updates
    await (0, serverContext.logDailyUpdate)(
      projectId,
      `Item "${name}" assigned to vendor "${vendor.name}".`
    );

    console.log(`📦 Item "${name}" assigned to Vendor "${vendor.name}" for Project "${project.name}".`);

    res.status(201).json({ message: 'Item assigned successfully.', vendor });

  } catch (error) {
    console.error('❌ Error assigning item:', error);
    res.status(500).json({ message: 'Failed to assign item.' });
  }
});
}

function patch_api_vendors_vendorId_assigned_items_update() {
serverContext.app.patch("/api/vendors/:vendorId/assigned-items/update", async (req, res) => {
  const { vendorId } = req.params;
  const { projectId, estimateId, item } = req.body;

  if (!vendorId || !projectId || !item || !item.itemId) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Convert all IDs to strings for reliable matching
  const itemIdStr = item.itemId.toString();
  const projectIdStr = projectId.toString();
  const estimateIdStr = estimateId ? estimateId.toString() : undefined;

  try {
    // Find the vendor
    const vendor = await serverContext.Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    // Find the correct assigned item (match all IDs as strings)
    let assignedItem = vendor.assignedItems.find(ai =>
      ai.itemId.toString() === itemIdStr &&
      ai.projectId?.toString() === projectIdStr &&
      (!estimateIdStr || ai.estimateId?.toString() === estimateIdStr)
    );

    // If not found, try without estimateId (for backward compatibility)
    if (!assignedItem && estimateIdStr) {
      assignedItem = vendor.assignedItems.find(ai =>
        ai.itemId.toString() === itemIdStr &&
        ai.projectId?.toString() === projectIdStr
      );
    }

    if (!assignedItem) {
      console.warn("Assigned item not found for update:", { vendorId, projectIdStr, estimateIdStr, itemIdStr });
      return res.status(404).json({ message: "Assigned item not found." });
    }

    // Update all relevant fields
    assignedItem.name = item.name || assignedItem.name || "Unnamed";
    assignedItem.description = item.description || assignedItem.description || "";
    assignedItem.quantity = typeof item.quantity === "number" ? item.quantity : assignedItem.quantity || 1;
    assignedItem.unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : assignedItem.unitPrice || 0;
    assignedItem.laborCost = typeof item.laborCost === "number" ? item.laborCost : assignedItem.laborCost || 0;
    assignedItem.materialCost = typeof item.materialCost === "number" ? item.materialCost : assignedItem.materialCost || 0;
    assignedItem.total = typeof item.total === "number" ? item.total : assignedItem.laborCost || 0; // Use laborCost as total if not provided
    assignedItem.costCode = item.costCode || assignedItem.costCode || "Uncategorized";
    assignedItem.status = item.status || assignedItem.status || "new";
    if (Object.prototype.hasOwnProperty.call(item, 'startDate')) {
      assignedItem.startDate = item.startDate ? new Date(item.startDate) : null;
    }
    if (Object.prototype.hasOwnProperty.call(item, 'endDate')) {
      assignedItem.endDate = item.endDate ? new Date(item.endDate) : null;
    }
    
    assignedItem.photos = item.photos || assignedItem.photos || { before: [], after: [] };
    assignedItem.qualityControl = item.qualityControl || assignedItem.qualityControl || { status: "pending" };
    assignedItem.updatedAt = new Date();
    assignedItem.estimateId = estimateIdStr || assignedItem.estimateId;

    await vendor.save();

    res.json({ message: "Assigned item updated", assignedItem });
  } catch (error) {
    console.error("Error updating assigned item:", error);
    res.status(500).json({ message: "Failed to update assigned item." });
  }
});
}

function post_api_assign_items() {
serverContext.app.post("/api/assign-items", async (req, res) => {
  const { vendorId, projectId, estimateId, items } = req.body;

  if (!vendorId || !projectId || !estimateId || !items || items.length === 0) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // ✅ Find Vendor, Estimate, Project
    const vendor = await serverContext.Vendor.findById(vendorId);
    const estimate = await serverContext.Estimate.findById(estimateId);
    const project = await serverContext.Project.findById(projectId).select("name");

    if (!vendor) return res.status(404).json({ message: "Vendor not found." });
    if (!estimate) return res.status(404).json({ message: "Estimate not found." });
    if (!project) return res.status(404).json({ message: "Project not found." });

    let updatedAssignedItems = [];

    for (const item of items) {
      // 🔎 Find the item inside the estimate
      const foundCategory = estimate.lineItems.find(cat => 
        cat.items.some(i => i._id.toString() === item.itemId)
      );
      const estimateItem = foundCategory?.items.find(i => i._id.toString() === item.itemId);

      if (!estimateItem) {
        console.warn(`⚠️ Item ${item.itemId} not found in estimate.`);
        continue;
      }

   // ✅ Instead of category name, use the item's own costCode field
   const costCode = estimateItem.costCode || "Uncategorized";

      // ✅ Check if item is already assigned
      let vendorItem = vendor.assignedItems.find(i => i.itemId.toString() === item.itemId);

      if (!vendorItem) {
        // ➡️ Create new assigned item
        vendorItem = {
          itemId: item.itemId,
          projectId,
          estimateId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          laborCost: estimateItem.laborCost,
          status: "new",
          costCode, // ✅ Add the costCode
          photos: {
            before: [...(estimateItem.photos?.before || [])],
            after: [...(estimateItem.photos?.after || [])]
          }
        };
        vendor.assignedItems.push(vendorItem);
      } else {
        // ➡️ Update existing assigned item
        vendorItem.name = item.name;
        vendorItem.description = item.description;
        vendorItem.quantity = item.quantity;
        vendorItem.unitPrice = item.unitPrice;
        vendorItem.total = item.total;
        vendorItem.laborCost = estimateItem.laborCost; // <-- Add this line
        vendorItem.costCode = costCode; // ✅ Update costCode too
        vendorItem.photos.before = [...(estimateItem.photos?.before || [])];
        vendorItem.photos.after = [...(estimateItem.photos?.after || [])];
      }

      updatedAssignedItems.push(vendorItem);

      // ✅ Log the assignment
      await (0, serverContext.logDailyUpdate)(
        projectId,
        `Item "${item.name}" was assigned to Vendor "${vendor.name}" for Project "${project.name}".`
      );
    }

    // ✅ Save Vendor with updated assigned items
    await vendor.save();

    // ✅ Update assignedTo field in the estimate items
    const updateOperations = items.map(item => ({
      updateOne: {
        filter: { 
          _id: new serverContext.mongoose.Types.ObjectId(estimateId), 
          'lineItems.items._id': new serverContext.mongoose.Types.ObjectId(item.itemId) 
        },
        update: { 
          $set: { 'lineItems.$[category].items.$[item].assignedTo': new serverContext.mongoose.Types.ObjectId(vendorId) }
        },
        arrayFilters: [
          { 'category.items._id': new serverContext.mongoose.Types.ObjectId(item.itemId) },
          { 'item._id': new serverContext.mongoose.Types.ObjectId(item.itemId) }
        ]
      }
    }));

    if (updateOperations.length > 0) {
      await serverContext.Estimate.bulkWrite(updateOperations);
    }

    const refreshedEstimate = await serverContext.Estimate.findById(estimateId);
    if (refreshedEstimate) {
      for (const assignedItem of items) {
        const refreshedEstimateItem = refreshedEstimate.lineItems
          .flatMap(category => category.items || [])
          .find(entry => entry._id?.toString() === String(assignedItem.itemId));
        if (refreshedEstimateItem?.maintenanceRequestId || refreshedEstimateItem?.maintenanceScheduleId) {
          await (0, serverContext.syncLinkedMaintenanceRecordsFromEstimateItem)(refreshedEstimate, refreshedEstimateItem);
        }
      }
    }

    console.log("✅ Items assigned successfully ");

    // ✅ Send updated assignedItems back to frontend
    res.status(200).json({
      message: "Items assigned successfully!",
      assignedItems: vendor.assignedItems
    });

  } catch (error) {
    console.error("❌ Error assigning items:", error);
    res.status(500).json({ message: "Failed to assign items." });
  }
});
}

function delete_api_delete_photo_vendorId_itemId_photoUrl() {
serverContext.app.delete("/api/delete-photo/:vendorId/:itemId/:photoUrl", async (req, res) => {
  try {
      const { vendorId, itemId, photoUrl } = req.params;
      const decodedPhotoUrl = decodeURIComponent(photoUrl); // Decode the URL to match stored DB paths

      console.log(`🗑️ Deleting Photo: ${decodedPhotoUrl} for Item: ${itemId} under Vendor: ${vendorId}`);

      // ✅ Remove file from server
      const filePath = (0, serverContext.resolveStoredUploadPath)(decodedPhotoUrl);
      if (serverContext.fs.existsSync(filePath)) {
          serverContext.fs.unlinkSync(filePath);
          console.log(`✅ Deleted file from server: ${decodedPhotoUrl}`);
      } else {
          console.warn(`⚠️ File not found on server: ${decodedPhotoUrl}`);
      }

      // Unassigned estimate items use a placeholder vendor ID.
      const vendor = serverContext.mongoose.Types.ObjectId.isValid(vendorId)
        ? await serverContext.Vendor.findOneAndUpdate(
            { _id: vendorId, "assignedItems.itemId": itemId },
            {
              $pull: {
                "assignedItems.$[].photos.before": decodedPhotoUrl,
                "assignedItems.$[].photos.after": decodedPhotoUrl
              }
            },
            { new: true }
          )
        : null;

      // ✅ Remove photo from Estimate's lineItems
      const estimate = await serverContext.Estimate.findOneAndUpdate(
          { "lineItems.items._id": itemId },
          { 
              $pull: { 
                  "lineItems.$[].items.$[].photos.before": decodedPhotoUrl,
                  "lineItems.$[].items.$[].photos.after": decodedPhotoUrl 
              } 
          },
          { new: true }
      );

      // ✅ Check if deletion was successful
      const updateSuccess = vendor || estimate;
      if (updateSuccess) {
                  if (estimate) {
            const estimateItem = estimate.lineItems
              .flatMap(category => category.items || [])
              .find(entry => entry._id?.toString() === itemId);
            if (estimateItem?.maintenanceRequestId) {
              await (0, serverContext.syncMaintenanceRequestFromEstimateItem)(estimate, estimateItem);
            }
          }
          console.log(`✅ Photo deleted from database successfully.`);
          return res.status(200).json({ message: "Photo deleted successfully!" });
      } else {
          console.warn(`⚠️ Photo was not found in database.`);
          return res.status(404).json({ message: "Photo not found in database." });
      }

  } catch (error) {
      console.error("❌ Error deleting photo:", error);
      res.status(500).json({ message: "Failed to delete photo." });
  }
});
}

function get_api_vendors_vendorId_assigned_items_projectId() {
// COMBINED: Fetch Assigned Items for a Vendor by Project
serverContext.app.get('/api/vendors/:vendorId/assigned-items/:projectId', async (req, res) => {
  try {
    const { vendorId, projectId } = req.params;
    const { estimateId } = req.query; // Extract estimateId from query parameters
    
    console.log(`📌 Fetching assigned items for Vendor: ${vendorId}, Project: ${projectId}${estimateId ? `, Estimate: ${estimateId}` : ''}`);

    // Fetch vendor data
    const vendor = await serverContext.Vendor.findById(vendorId);
    if (!vendor) {
      console.error("❌ Vendor not found:", vendorId);
      return res.status(404).json({ message: "Vendor not found." });
    }

    // Ensure assigned items exist
    if (!vendor.assignedItems || vendor.assignedItems.length === 0) {
      console.warn("⚠️ No assigned items found for vendor:", vendorId);
      return res.status(200).json({ items: [] });
    }

    // Filter assigned items for the specific project and estimate
    let assignedItems = vendor.assignedItems.filter((item) => {
      const isProjectMatch = item.projectId?.toString() === projectId;
      const isEstimateMatch = estimateId ? item.estimateId?.toString() === estimateId : true;
      return isProjectMatch && isEstimateMatch;
    });

    if (assignedItems.length === 0) {
      console.warn("⚠️ No items found for this project and estimate:", projectId, estimateId);
      return res.status(200).json({ items: [] });
    }

    // Fetch all relevant estimates for this project to sync labor costs
    const estimates = await serverContext.Estimate.find({ projectId });

    // Build a map of itemId -> laborCost from all estimates
    const laborCostMap = {};
    estimates.forEach(est => {
      est.lineItems.forEach(cat => {
        cat.items.forEach(item => {
          if (item._id && typeof item.laborCost !== "undefined") {
            laborCostMap[item._id.toString()] = item.laborCost;
          }
        });
      });
    });

    // Ensure Photos Exist and Sync laborCost from Estimate
    assignedItems = assignedItems.map(item => {
      // Ensure photos object exists
      if (!item.photos) {
        item.photos = { before: [], after: [] };
      }
      
      // Always sync laborCost from estimate if available
      const laborCost = laborCostMap[item.itemId?.toString()];
      if (typeof laborCost !== "undefined") {
        item.laborCost = laborCost;
      }
      
      return item;
    });

    console.log(`✅ Found ${assignedItems.length} assigned items for Vendor ${vendorId} in Project ${projectId}`);
    
    res.status(200).json({ items: assignedItems });
  } catch (error) {
    console.error("❌ Error fetching assigned items:", error);
    res.status(500).json({ message: "Failed to fetch assigned items." });
  }
});
}

function patch_api_clear_vendor_assignment_itemId() {
// Route to clear vendor assignment
serverContext.app.patch('/api/clear-vendor-assignment/:itemId', async (req, res) => {
  const { itemId } = req.params;

  console.log(`Attempting to clear vendor assignment for item ID: ${itemId}`);

  if (!serverContext.mongoose.Types.ObjectId.isValid(itemId)) {
    console.log('Invalid Item ID format:', itemId);
    return res.status(400).json({ message: 'Invalid Item ID format.' });
  }

  try {
    // Step 1: Find and update the estimate document to clear assignedTo
    const estimate = await serverContext.Estimate.findOneAndUpdate(
      { 'lineItems.items._id': itemId },
      { $set: { 'lineItems.$[].items.$[elem].assignedTo': null } },
      {
        arrayFilters: [{ 'elem._id': new serverContext.mongoose.Types.ObjectId(itemId) }],
        new: true
      }
    );

    if (!estimate) {
      console.log(`Item ID ${itemId} not found in any estimate.`);
      return res.status(404).json({ message: 'Item not found in any estimate.' });
    }

    const estimateItem = estimate.lineItems
      .flatMap(category => category.items || [])
      .find(entry => entry._id?.toString() === itemId);

    // Step 2: Remove item from vendor's assignedItems
    const vendorUpdate = await serverContext.Vendor.updateOne(
      { 'assignedItems.itemId': itemId },
      { $pull: { assignedItems: { itemId } } }
    );

    console.log(`Vendor update result:`, vendorUpdate);

    if (vendorUpdate.modifiedCount === 0) {
      console.log(`Item ID ${itemId} not found in vendor's assignedItems.`);
      return res.status(404).json({ message: 'Item not found in vendor data.' });
    }

    if (estimateItem?.maintenanceRequestId || estimateItem?.maintenanceScheduleId) {
      await (0, serverContext.syncLinkedMaintenanceRecordsFromEstimateItem)(estimate, estimateItem);
    }

    res.status(200).json({ message: 'Vendor assignment cleared successfully.' });
  } catch (error) {
    console.error('Error clearing vendor assignment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});
}

function get_api_projects_projectId_vendors() {
// ✅ Get Assigned Vendors for a Project
serverContext.app.get("/api/projects/:projectId/vendors", async (req, res) => {
  try {
    const { projectId } = req.params;

    // Ensure projectId is a valid ObjectId if using MongoDB
    if (!projectId) {
      return res.status(400).json({ success: false, message: "Project ID is required." });
    }

    // Find vendors assigned to this project
    const vendors = await serverContext.Vendor.find({ "assignedProjects.projectId": projectId })
      .select("name email phone assignedProjects")
      .lean(); // Optimize query

    res.status(200).json({ success: true, vendors: vendors || [] }); // Always return 200 with an array
  } catch (error) {
    console.error("❌ Error fetching vendors:", error);
    res.status(500).json({ success: false, message: "Failed to fetch vendors. Please try again." });
  }
});
}

function delete_api_projects_projectId_vendors_vendorId() {
// ✅ Remove Vendor from a Project
serverContext.app.delete("/api/projects/:projectId/vendors/:vendorId", async (req, res) => {
  try {
    const { projectId, vendorId } = req.params;
    
    // Remove project from vendor's assignedProjects
    const vendor = await serverContext.Vendor.findByIdAndUpdate(
      vendorId,
      { $pull: { assignedProjects: { projectId } } },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found." });
    }

    res.status(200).json({ success: true, message: "Vendor removed from project." });
  } catch (error) {
    console.error("Error removing vendor:", error);
    res.status(500).json({ message: "Failed to remove vendor." });
  }
});
}

function get_api_vendors_login_direct_id() {
// [SECTION] QC review, folders, and field operations

serverContext.app.get('/api/vendors/login-direct/:id', async (req, res) => {
  try {
    const vendor = await serverContext.Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Optional: set session/token here

    res.json({ vendorId: vendor._id });
  } catch (err) {
    res.status(500).json({ message: "Internal error" });
  }
});
}

function get_api_vendors_vendorId_used_line_item_ids() {
// GET all previously submitted line item IDs for a vendor
serverContext.app.get('/api/vendors/:vendorId/used-line-item-ids', async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!vendorId) {
      return res.status(400).json({ message: "Missing vendorId" });
    }

    // Find all invoices for this vendor
    const invoices = await serverContext.Invoice.find({ vendorId });

    // Collect all unique line item IDs (_id or itemId)
    const usedIds = new Set();
    invoices.forEach(inv => {
      (inv.lineItems || []).forEach(item => {
        // Support both _id (ObjectId) and itemId (string)
        if (item._id) usedIds.add(item._id.toString());
        if (item.itemId) usedIds.add(item.itemId.toString());
      });
    });

    res.json({ usedIds: Array.from(usedIds) });
  } catch (err) {
    console.error("Error fetching used line item IDs:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

return {
  post_api_assign_vendor,
  post_api_add_vendor,
  get_api_vendors,
  get_api_vendors_id,
  delete_api_vendors_id,
  put_api_vendors_id,
  post_api_vendors_id_upload_w9,
  delete_api_vendors_id_w9,
  get_api_vendors_vendorId_debug_items,
  put_api_vendors_vendorId_update_item_status,
  put_api_vendor_start_project,
  get_api_subcontractor_tasks,
  get_api_vendors_vendorId_assigned_projects,
  get_api_subcontractor_projects,
  put_api_vendor_update_project_status,
  post_api_vendors_vendorId_assign_item,
  patch_api_vendors_vendorId_assigned_items_update,
  post_api_assign_items,
  delete_api_delete_photo_vendorId_itemId_photoUrl,
  get_api_vendors_vendorId_assigned_items_projectId,
  patch_api_clear_vendor_assignment_itemId,
  get_api_projects_projectId_vendors,
  delete_api_projects_projectId_vendors_vendorId,
  get_api_vendors_login_direct_id,
  get_api_vendors_vendorId_used_line_item_ids
};
};

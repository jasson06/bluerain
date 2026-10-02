// quality control flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function get_api_quality_review_items_projectId() {
// ✅ New route for items in Vendor.assignedItems
serverContext.app.get("/api/quality-review/items/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status } = req.query;

    const vendors = await serverContext.Vendor.find({ "assignedItems.projectId": projectId });
    const estimates = await serverContext.Estimate.find({ projectId });
    const managers = await serverContext.Manager.find({}, { _id: 1, name: 1 });

    // 🔹 Create manager map for name lookup
    const managerMap = {};
    managers.forEach(mgr => {
      managerMap[mgr._id.toString()] = mgr.name;
    });

    const qcItems = [];
    const addedItemIds = new Set(); // 🛡️ Avoid duplicates using item._id.toString()

    // 🔹 Vendor items
    vendors.forEach(vendor => {
      vendor.assignedItems.forEach(item => {
        const itemId = item.itemId?.toString();
        const qcStatus = item.qualityControl?.status || "pending";
        const reviewedByName = item.qualityControl?.reviewedBy
          ? managerMap[item.qualityControl.reviewedBy.toString()] || "Unknown"
          : null;

        if (
          item.projectId.toString() === projectId &&
          ["completed", "rework", "approved"].includes(item.status)
        ) {
          if (!status || qcStatus === status || status === "all") {
            // 🔹 Lookup estimate title for vendor item
            const matchingEstimate = estimates.find(est =>
              est._id.toString() === item.estimateId?.toString()
            );
            const estimateTitle =
              matchingEstimate?.title || matchingEstimate?.invoiceNumber || "Untitled Estimate";

            const uniqueKey = itemId || item._id.toString();
            if (!addedItemIds.has(uniqueKey)) {
              // Add rework photos if present
              let reworkPhotos = [];
              if (item.qualityControl && item.qualityControl.rework && Array.isArray(item.qualityControl.rework.photos)) {
                reworkPhotos = item.qualityControl.rework.photos;
              }
              // Debug log for backend: show what is being returned for this item
              console.log('[QC-API] Vendor QC item', itemId, 'reworkPhotos:', reworkPhotos, 'full rework:', item.qualityControl?.rework);
              qcItems.push({
                ...item.toObject(),
                vendorId: vendor._id,
                vendorName: vendor.name || "Unknown Vendor",
                estimateId: item.estimateId,
                estimateTitle,
                source: "vendor",
                qualityControl: {
                  ...item.qualityControl,
                  reviewedByName,
                  rework: {
                    ...(item.qualityControl?.rework || {}),
                    photos: reworkPhotos
                  }
                }
              });
              addedItemIds.add(uniqueKey);
            }
          }
        }
      });
    });

    // 🔹 Estimate items (in case some are not assigned to vendors)
    estimates.forEach(estimate => {
      const estimateTitle = estimate.title || estimate.invoiceNumber || "Untitled Estimate";

      estimate.lineItems.forEach(section => {
        section.items.forEach(item => {
          const itemId = item._id.toString();
          const qcStatus = item.qualityControl?.status || "pending";
          const reviewedByName = item.qualityControl?.reviewedBy
            ? managerMap[item.qualityControl.reviewedBy.toString()] || "Unknown"
            : null;

          if (["completed", "rework", "approved"].includes(item.status)) {
            if (!status || qcStatus === status || status === "all") {
              if (!addedItemIds.has(itemId)) {
                // Add rework photos if present
                let reworkPhotos = [];
                if (item.qualityControl && item.qualityControl.rework && Array.isArray(item.qualityControl.rework.photos)) {
                  reworkPhotos = item.qualityControl.rework.photos;
                }
                qcItems.push({
                  ...item.toObject(),
                  estimateId: estimate._id,
                  estimateTitle,
                  vendorId: item.assignedTo || null,
                  vendorName: "(from estimate)",
                  source: "estimate",
                  qualityControl: {
                    ...item.qualityControl,
                    reviewedByName,
                    rework: {
                      ...(item.qualityControl?.rework || {}),
                      photos: reworkPhotos
                    }
                  }
                });
                addedItemIds.add(itemId);
              }
            }
          }
        });
      });
    });

    res.json({ items: qcItems });
  } catch (err) {
    console.error("❌ Error fetching QC items:", err);
    res.status(500).json({ error: "Failed to fetch items for review" });
  }
});
}

function put_api_items_itemId_quality_review() {
// ✅ Unified PUT route for QC Approval or Rework (estimate or vendor)
// ✅ PUT update QC status (estimate + vendor)
// ✅ PUT update QC status on estimate AND vendor
serverContext.app.put("/api/items/:itemId/quality-review", async (req, res) => {
  try {
    const { itemId } = req.params;
    let { status, notes, reviewedBy } = req.body;

    // Normalize status to lowercase to prevent casing mismatch
    status = String(status).trim().toLowerCase();

    if (!["approved", "rework"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    let source = null;
    const reviewedAt = new Date();

    // ✅ Try Estimate First
    const estimate = await serverContext.Estimate.findOne({ "lineItems.items._id": itemId });
    if (estimate) {
      for (const section of estimate.lineItems) {
        const item = section.items.id(itemId);
        if (item) {
          if (item.maintenanceScheduleId) {
            return res.json(await serverContext.maintenanceQC.reviewItem(req, estimate, item, status, notes));
          }
          // Preserve rework info if present
          let rework = item.qualityControl && item.qualityControl.rework ? { ...item.qualityControl.rework } : undefined;
          item.status = status;
          item.qualityControl = {
            status,
            notes,
            reviewedBy,
            reviewedAt,
            ...(rework ? { rework } : {})
          };
          await estimate.save();
          return res.json({ success: true, source: "estimate" });
        }
      }
    }

    // ✅ Fallback to Vendor assignedItems
    const vendor = await serverContext.Vendor.findOne({ "assignedItems._id": itemId });
    if (vendor) {
      const item = vendor.assignedItems.id(itemId);
      if (item) {
        const linkedEstimate = item.itemId ? await serverContext.Estimate.findOne({ 'lineItems.items._id': item.itemId }) : null;
        const linkedItem = serverContext.maintenanceQC.findItem(linkedEstimate, item.itemId);
        if (linkedItem?.maintenanceScheduleId) {
          return res.json(await serverContext.maintenanceQC.reviewItem(req, linkedEstimate, linkedItem, status, notes));
        }

        // Preserve rework info if present
        let rework = item.qualityControl && item.qualityControl.rework ? { ...item.qualityControl.rework } : undefined;
        item.status = status;
        item.qualityControl = {
          status,
          notes,
          reviewedBy,
          reviewedAt,
          ...(rework ? { rework } : {})
        };
        await vendor.save();
        return res.json({ success: true, source: "vendor" });
      }
    }

    // ❌ Not found in either
    res.status(404).json({ error: "Item not found in either estimate or vendor list." });

  } catch (err) {
    console.error("❌ Error updating QC status:", err);
    (0, serverContext.maintenanceQCError)(res, err);
  }
});
}

function post_api_qc_rework_photos() {
serverContext.app.post('/api/qc/rework-photos', serverContext.qcReworkUpload.array('photos'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    // Return URLs for the uploaded files
    const urls = req.files.map(f => `/uploads/qc-rework/${f.filename}`);
    res.json({ urls });
  } catch (err) {
    console.error('Error uploading QC rework photos:', err);
    res.status(500).json({ message: 'Failed to upload rework photos' });
  }
});
}

function post_api_quality_review_rework() {
// POST endpoint for QC Rework Request (with photos and note)
serverContext.app.post("/api/quality-review/rework", async (req, res) => {
  try {
    const { itemId, managerId, note, reworkPhotos } = req.body;
    console.log("[QC REWORK] Incoming request:", { itemId, managerId, note, reworkPhotos });
    if (!itemId || !managerId) {
      return res.status(400).json({ error: "Missing required fields (itemId, managerId)." });
    }
    // Try to find the item in Estimate first
    const estimate = await serverContext.Estimate.findOne({ "lineItems.items._id": itemId });
    if (estimate) {
      for (const section of estimate.lineItems) {
        const item = section.items.id(itemId);
        if (item) {
          if (item.maintenanceScheduleId) {
            return res.json(await serverContext.maintenanceQC.reviewItem(req, estimate, item, 'rework', note, reworkPhotos));
          }
          item.status = "rework";
          if (!item.qualityControl) item.qualityControl = {};
          item.qualityControl.status = "rework";
          item.qualityControl.rework = {
            note,
            managerId,
            photos: Array.isArray(reworkPhotos) ? reworkPhotos : [],
            requestedAt: new Date(),
          };
          console.log("[QC REWORK] Saving to Estimate. item.qualityControl.rework:", item.qualityControl.rework);
          await estimate.save();
          // Fetch the updated item from DB to verify
          const updatedEstimate = await serverContext.Estimate.findOne({ "lineItems.items._id": itemId });
          let updatedItem;
          for (const section of updatedEstimate.lineItems) {
            const i = section.items.id(itemId);
            if (i) updatedItem = i;
          }
          console.log("[QC REWORK] Updated Estimate item after save:", updatedItem ? updatedItem.qualityControl : null);
          return res.json({ success: true, source: "estimate" });
        }
      }
    }
    // Fallback to Vendor assignedItems
    const vendor = await serverContext.Vendor.findOne({ "assignedItems._id": itemId });
    if (vendor) {
      const item = vendor.assignedItems.id(itemId);
      if (item) {
        const linkedEstimate = item.itemId ? await serverContext.Estimate.findOne({ 'lineItems.items._id': item.itemId }) : null;
        const linkedItem = serverContext.maintenanceQC.findItem(linkedEstimate, item.itemId);
        if (linkedItem?.maintenanceScheduleId) {
          return res.json(await serverContext.maintenanceQC.reviewItem(req, linkedEstimate, linkedItem, 'rework', note, reworkPhotos));
        }

        item.status = "rework";
        if (!item.qualityControl) item.qualityControl = {};
        item.qualityControl.status = "rework";
        item.qualityControl.rework = {
          note,
          managerId,
          photos: Array.isArray(reworkPhotos) ? reworkPhotos : [],
          requestedAt: new Date(),
        };
        console.log("[QC REWORK] Saving to Vendor. item.qualityControl.rework:", item.qualityControl.rework);
        await vendor.save();
        // Fetch the updated item from DB to verify
        const updatedVendor = await serverContext.Vendor.findOne({ "assignedItems._id": itemId });
        const updatedItem = updatedVendor ? updatedVendor.assignedItems.id(itemId) : null;
        console.log("[QC REWORK] Updated Vendor item after save:", updatedItem ? updatedItem.qualityControl : null);
        return res.json({ success: true, source: "vendor" });
      }
    }
    // Not found
    res.status(404).json({ error: "Item not found in either estimate or vendor list." });
  } catch (err) {
    console.error("❌ Error processing QC rework request:", err);
    (0, serverContext.maintenanceQCError)(res, err);
  }
});
}

function post_api_qc_delete_photo() {
// ✅ API: Delete a QC photo (before, after, or rework)
serverContext.app.post('/api/qc/delete-photo', async (req, res) => {
  try {
    const { itemId, type, url } = req.body;
    if (!itemId || !type || !url) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Try to find in Estimate first
    let found = false;
    const estimate = await serverContext.Estimate.findOne({ "lineItems.items._id": itemId });
    if (estimate) {
      for (const section of estimate.lineItems) {
        const item = section.items.id(itemId);
        if (item) {
          if (type === 'rework') {
            if (item.qualityControl && item.qualityControl.rework && Array.isArray(item.qualityControl.rework.photos)) {
              item.qualityControl.rework.photos = item.qualityControl.rework.photos.filter(photo => photo !== url);
              found = true;
            }
          } else {
            if (item.photos && Array.isArray(item.photos[type])) {
              item.photos[type] = item.photos[type].filter(photo => photo !== url);
              found = true;
            }
          }
          if (found) {
            await estimate.save();
            return res.json({ success: true, source: 'estimate' });
          }
        }
      }
    }

    // Fallback: Try in Vendor assignedItems
    const vendor = await serverContext.Vendor.findOne({ "assignedItems._id": itemId });
    if (vendor) {
      const item = vendor.assignedItems.id(itemId);
      if (item) {
        if (type === 'rework') {
          if (item.qualityControl && item.qualityControl.rework && Array.isArray(item.qualityControl.rework.photos)) {
            item.qualityControl.rework.photos = item.qualityControl.rework.photos.filter(photo => photo !== url);
            found = true;
          }
        } else {
          if (item.photos && Array.isArray(item.photos[type])) {
            item.photos[type] = item.photos[type].filter(photo => photo !== url);
            found = true;
          }
        }
        if (found) {
          await vendor.save();
          return res.json({ success: true, source: 'vendor' });
        }
      }
    }

    return res.status(404).json({ error: 'Item or photo not found.' });
  } catch (err) {
    console.error('❌ Error deleting QC photo:', err);
    res.status(500).json({ error: 'Failed to delete photo.' });
  }
});
}

return {
  get_api_quality_review_items_projectId,
  put_api_items_itemId_quality_review,
  post_api_qc_rework_photos,
  post_api_quality_review_rework,
  post_api_qc_delete_photo
};
};

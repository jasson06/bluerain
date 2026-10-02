// uploads flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function post_api_ocr() {
// ✅ OCR Endpoint
serverContext.app.post("/api/ocr", serverContext.upload.single("image"), async (req, res) => {
  try {
    const [result] = await serverContext.visionClient.documentTextDetection(req.file.path);
    const text = result.fullTextAnnotation?.text || "";
    serverContext.fs.unlinkSync(req.file.path); // cleanup
    res.json({ text });
  } catch (err) {
    console.error("❌ OCR error:", err);
    res.status(500).json({ error: "OCR failed" });
  }
});
}

function post_api_upload_photos() {
// Update photo upload handler to associate photos with a specific task

// Photo Upload Route
// Photo Upload Route (Updated to Save Photos in Both Estimate and Vendor)
serverContext.app.post("/api/upload-photos", serverContext.upload.array("photos", 10), async (req, res) => {
  try {
    const { itemId, taskId, type, estimateId, vendorId } = req.body;

    // 🚨 Validate Required Fields
    if (!req.files || req.files.length === 0 || (!itemId && !taskId && !estimateId) || !type) {
      return res.status(400).json({ message: "Missing required fields (photos, itemId/taskId/estimateId, or type)." });
    }

    // ✅ Generate File Paths for Uploaded Photos
    const photoUrls = req.files.map(file => `/uploads/${file.filename}`);
    let updateSuccess = false;

    // ✅ Handle Task Photos (Stored in Task Collection)
    if (taskId) {
      const task = await serverContext.Task.findById(taskId);
      if (!task) return res.status(404).json({ message: "Task not found." });

      if (!task.photos) task.photos = { before: [], after: [] };
      task.photos[type].push(...photoUrls);

      await task.save();
      console.log(`✅ ${photoUrls.length} Photo(s) saved for Task: ${taskId} (${type})`);
      return res.status(200).json({ message: "Photos uploaded successfully!", photoUrls });
    }

    // ✅ Handle Photos in Estimate (Always Present in Vendor Side)
    let estimate = null;
    let estimateItem = null;
    let assignedToVendorId = vendorId && vendorId !== "null" && vendorId !== "undefined" ? vendorId : null;
    if (estimateId) {
      estimate = await serverContext.Estimate.findById(estimateId);
      if (!estimate) return res.status(404).json({ message: "Estimate not found." });

      estimateItem = estimate.lineItems.flatMap(category => category.items)
        .find(item => item._id.toString() === itemId);

      if (estimateItem) {
        if (!estimateItem.photos) estimateItem.photos = { before: [], after: [] };
        photoUrls.forEach(photoUrl => {
          if (!estimateItem.photos[type].includes(photoUrl)) {
            estimateItem.photos[type].push(photoUrl);
          }
        });
        updateSuccess = true;
        // If not provided, try to get assigned vendor from estimate item
        if (!assignedToVendorId && estimateItem.assignedTo) {
          assignedToVendorId = estimateItem.assignedTo.toString();
        }
        console.log(`✅ ${photoUrls.length} Photo(s) saved for Estimate: ${estimateId}, Item: ${itemId} (${type})`);
      } else {
        console.warn(`⚠️ Item not found in estimate: ${estimateId}`);
      }
    }

    // ✅ If item is assigned, also update vendor's assignedItems
    if (assignedToVendorId) {
      const vendor = await serverContext.Vendor.findById(assignedToVendorId);
      if (vendor) {
        const vendorItem = vendor.assignedItems.find(item => item.itemId.toString() === itemId);
        if (vendorItem) {
          if (!vendorItem.photos) vendorItem.photos = { before: [], after: [] };
          photoUrls.forEach(photoUrl => {
            if (!vendorItem.photos[type].includes(photoUrl)) {
              vendorItem.photos[type].push(photoUrl);
            }
          });
          await vendor.save();
          updateSuccess = true;
          console.log(`✅ ${photoUrls.length} Photo(s) also saved for Vendor: ${assignedToVendorId}, Item: ${itemId} (${type})`);
        } else {
          console.warn(`⚠️ Item not found in vendor's assigned list. Keeping photos in estimate only.`);
        }
      } else {
        console.warn(`⚠️ Vendor not found for ID: ${assignedToVendorId}. Keeping photos in estimate only.`);
      }
    }

    // ✅ Save Estimate Changes After Vendor Upload
    if (updateSuccess && estimate) {
      await estimate.save();
      if (estimateItem?.maintenanceRequestId) {
        await (0, serverContext.syncMaintenanceRequestFromEstimateItem)(estimate, estimateItem);
      }
      return res.status(200).json({ message: "Photos uploaded successfully!", photoUrls });
    }

    return res.status(400).json({ message: "Item not found in estimate or vendor." });

  } catch (error) {
    console.error("❌ Error uploading photos:", error);
    res.status(500).json({ message: "Failed to upload photos." });
  }
});
}

function delete_api_delete_photo_id() {
// Photo Deletion Route
serverContext.app.delete('/api/delete-photo/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Find the task containing the photo and remove it from the respective array
    const task = await serverContext.Task.findOneAndUpdate(
      {
        $or: [{ 'photos.before': `/uploads/${id}` }, { 'photos.after': `/uploads/${id}` }],
      },
      {
        $pull: { 'photos.before': `/uploads/${id}`, 'photos.after': `/uploads/${id}` },
      },
      { new: true } // Return the updated task
    );

    if (!task) {
      return res.status(404).json({ success: false, message: 'Photo not found in any task.' });
    }

    // Delete the photo file from the file system
    const filePath = serverContext.path.join(serverContext.uploadDir, id);
    if (serverContext.fs.existsSync(filePath)) {
      serverContext.fs.unlinkSync(filePath); // Delete the file
    } else {
      console.warn(`File not found on disk: ${filePath}`);
    }

    res.status(200).json({ success: true, message: 'Photo deleted successfully.', task });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ success: false, message: 'Failed to delete photo.' });
  }
});
}

function get_api_photos_itemId() {
/* ==========
     📌 Fetch Photos for an Item
     ========== */
     serverContext.app.get("/api/photos/:itemId", async (req, res) => {
      const { itemId } = req.params;
  
      try {
          console.log(`📸 Fetching photos for item: ${itemId}`);
  
          let photos = { before: [], after: [] };
  
          // 🔍 First, Check if the Item is Assigned to a Vendor
          const vendor = await serverContext.Vendor.findOne({ "assignedItems.itemId": itemId });
          if (vendor) {
              const item = vendor.assignedItems.find(i => i.itemId.toString() === itemId);
              if (item && item.photos) {
                  console.log(`✅ Found item in vendor: ${vendor._id}`);
                  photos.before = [...new Set([...photos.before, ...(item.photos.before || [])])];
                  photos.after = [...new Set([...photos.after, ...(item.photos.after || [])])];
              }
          }
  
          // 🔍 Also Fetch from Estimates (Even if Assigned to Vendor)
          const estimate = await serverContext.Estimate.findOne({ "lineItems.items._id": itemId });
          if (estimate) {
              const item = estimate.lineItems.flatMap(cat => cat.items).find(i => i._id.toString() === itemId);
              if (item && item.photos) {
                  console.log(`✅ Found item in estimate: ${estimate._id}`);
                  photos.before = [...new Set([...photos.before, ...(item.photos.before || [])])];
                  photos.after = [...new Set([...photos.after, ...(item.photos.after || [])])];
              }
          }
  
          // 🚨 If No Photos Found in Both Sources
          if (photos.before.length === 0 && photos.after.length === 0) {
              console.warn(`⚠️ No photos found for item: ${itemId}`);
              return res.status(404).json({ success: false, message: "No photos found for item." });
          }
  
          // ✅ Return Merged Photos from Both Sources
          return res.status(200).json({ success: true, photos });
  
      } catch (error) {
          console.error("❌ Error fetching photos:", error);
          res.status(500).json({ success: false, message: "Failed to fetch photos" });
      }
  });
}

return {
  post_api_ocr,
  post_api_upload_photos,
  delete_api_delete_photo_id,
  get_api_photos_itemId
};
};

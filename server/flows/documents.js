// documents flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

function formatProjectDocumentLabel(project) {
  if (!project) return 'Unknown Property';

  const addressLine = [project.address?.addressLine1, project.address?.city, project.address?.state]
    .filter(Boolean)
    .join(', ');

  return [project.name, addressLine].filter(Boolean).join(' - ') || 'Unknown Property';
}

async function buildAllPropertyDocumentsFolder() {
  const [documents, projects] = await Promise.all([
    serverContext.Document.find({}).sort({ createdAt: -1 }).lean(),
    serverContext.Project.find({}, 'name address').lean()
  ]);

  const projectLabels = new Map(
    projects.map(project => [String(project._id), (0, serverContext.formatProjectDocumentLabel)(project)])
  );

  return {
    _id: serverContext.SYSTEM_FOLDER_IDS.allPropertyDocuments,
    name: 'All Property Documents',
    position: -1,
    parentId: null,
    isSystem: true,
    files: documents.map(doc => ({
      _id: String(doc._id),
      name: doc.name,
      size: doc.type ? doc.type.charAt(0).toUpperCase() + doc.type.slice(1) : 'Document',
      type: doc.type || 'other',
      displayType: projectLabels.get(String(doc.projectId)) || 'Unknown Property',
      propertyLabel: projectLabels.get(String(doc.projectId)) || 'Unknown Property',
      modified: new Date(doc.createdAt).toLocaleString(),
      url: `/api/properties/${doc.projectId}/documents/${doc._id}/view`,
      downloadUrl: `/api/properties/${doc.projectId}/documents/${doc._id}/download`,
      projectId: String(doc.projectId),
      sourceDocumentId: String(doc._id),
      uploadedBy: doc.uploadedBy || 'System'
    }))
  };
}

function post_api_projects_projectId_files() {
// API to upload files to a specific project
serverContext.app.post('/api/projects/:projectId/files', serverContext.upload.array('files'), async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = await serverContext.Project.findById(projectId);

    if (!project) {
      return res.status(404).send('Project not found');
    }

    const files = req.files.map(file => ({
      filename: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
    }));

    project.files.push(...files);
    await project.save();

  // ✅ Log the file upload in daily updates
  const fileNames = files.map(f => f.filename).join(", ");
  await (0, serverContext.logDailyUpdate)(projectId, `Files uploaded: ${fileNames}`);

    res.status(200).json({ message: 'Files uploaded successfully', files });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).send('Internal Server Error');
  }
});
}

function get_api_projects_projectId_files() {
// API to get files for a specific project
serverContext.app.get('/api/projects/:projectId/files', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    console.log(`Fetching files for project ID: ${projectId}`);  // Debug log

    const project = await serverContext.Project.findById(projectId);
    console.log('Project fetched:', project);  // Check if project is found

    if (!project) {
      console.log('Project not found!');
      return res.status(404).send('Project not found');
    }

    console.log('Files:', project.files);  // Check if files exist
    res.status(200).json(project.files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).send('Internal Server Error');
  }
});
}

function delete_api_projects_projectId_files_fileId() {
// API to delete a specific file from a project
// DELETE Route for File Deletion (Local Environment)
serverContext.app.delete('/api/projects/:projectId/files/:fileId', async (req, res) => {
  const { projectId, fileId } = req.params;

  try {
    const project = await serverContext.Project.findById(projectId);

    if (!project) {
      console.warn(`Project not found: ${projectId}`);
      return res.status(404).json({ error: 'Project not found' });
    }

    const file = project.files.find(f => f._id.toString() === fileId);
    if (!file) {
      console.warn(`File ID not found in project: ${fileId}`);
      return res.status(404).json({ error: 'File not found in project' });
    }

    // Normalize the file path for Windows compatibility
    let filePath = file.path.replace(/\\/g, '/'); // Convert backslashes to forward slashes

    // Construct the absolute path for the local server
    const absolutePath = (0, serverContext.resolveStoredUploadPath)(filePath);

    console.log(`Resolved file path for deletion: ${absolutePath}`);

    // Attempt to delete the file from the filesystem
    try {
      if (serverContext.fs.existsSync(absolutePath)) {
        serverContext.fs.unlinkSync(absolutePath);
        console.log(`File deleted from server: ${absolutePath}`);
      } else {
        console.warn(`File not found on server: ${absolutePath}`);
      }
    } catch (fsError) {
      console.error('Error deleting file from filesystem:', fsError);
      return res.status(500).json({ error: 'Error deleting file from server' });
    }

    // Remove the file entry from the project document
    await serverContext.Project.findByIdAndUpdate(
      projectId,
      { $pull: { files: { _id: fileId } } },
      { new: true }
    );

    return res.status(200).json({ message: 'File deleted successfully' });

  } catch (err) {
    console.error('Server error during file deletion:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
}

function get_api_folders() {
// GET all folders (no population to keep parentId as string)
serverContext.app.get("/api/folders", async (req, res) => {
  try {
    const [folders, leasesFolder] = await Promise.all([
      serverContext.FileSystem.find().lean(),
      (0, serverContext.buildAllPropertyDocumentsFolder)()
    ]);
    
    // Normalize ObjectId to string for comparison in frontend
    folders.forEach(f => {
      if (f.parentId && f.parentId._id) {
        f.parentId = f.parentId._id.toString();
      } else if (f.parentId) {
        f.parentId = f.parentId.toString();
      }
    });

    res.json([leasesFolder, ...folders]);
  } catch (err) {
    console.error("❌ Failed to fetch folders:", err);
    res.status(500).json({ message: "Error fetching folders." });
  }
});
}

function post_api_folders() {
// CREATE a folder
serverContext.app.post("/api/folders", async (req, res) => {
  const { name, parentId } = req.body;

  const folder = new serverContext.FileSystem({
    name,
    parentId: parentId || null, // ✅ Use parentId if provided
    position: 0,
    files: []
  });

  await folder.save();
  res.json(folder);
});
}

function put_api_folders_reorder() {
// Reorder folders (static route must come before /:id)
serverContext.app.put("/api/folders/reorder", async (req, res) => {
  const { order } = req.body; // [{_id, position}]
  for (let item of order) {
    await serverContext.FileSystem.findByIdAndUpdate(item._id, { position: item.position });
  }
  res.json({ success: true });
});
}

function put_api_folders_id() {
// Rename folder
serverContext.app.put("/api/folders/:id", async (req, res) => {
  const folder = await serverContext.FileSystem.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name },
    { new: true }
  );
  res.json(folder);
});
}

function post_api_folders_id_files() {
// ADD file to folder
serverContext.app.post('/api/folders/:id/files', serverContext.upload.single('file'), async (req, res) => {
  const folder = await serverContext.FileSystem.findById(req.params.id);
  const fileData = {
    name: req.file.originalname,
    size: (req.file.size / 1024).toFixed(0) + ' KB',
    type: req.file.mimetype,
    modified: new Date().toLocaleString(),
    url: `/uploads/${req.file.filename}` // accessible route
  };
  folder.files.push(fileData);
  await folder.save();
  res.json(fileData);
});
}

function put_api_folders_folderId_files_index() {
// RENAME a file in folder
serverContext.app.put("/api/folders/:folderId/files/:index", async (req, res) => {
  const folder = await serverContext.FileSystem.findById(req.params.folderId);
  folder.files[req.params.index].name = req.body.name;
  await folder.save();
  res.json(folder);
});
}

function delete_api_folders_id() {
// DELETE folder
serverContext.app.delete("/api/folders/:id", async (req, res) => {
  await serverContext.FileSystem.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
}

function delete_api_folders_folderId_files_index() {
// DELETE file from folder
serverContext.app.delete("/api/folders/:folderId/files/:index", async (req, res) => {
  const { folderId, index } = req.params;
  const folder = await serverContext.FileSystem.findById(folderId);
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  // Remove file by index directly
  folder.files.splice(index, 1);
  await serverContext.FileSystem.updateOne(
    { _id: folderId },
    { $set: { files: folder.files } }
  );

  const updated = await serverContext.FileSystem.findById(folderId);
  res.json(updated);
});
}

function post_api_folders_folderId_delete_files() {
// POST /api/folders/:folderId/delete-files
serverContext.app.post("/api/folders/:folderId/delete-files", async (req, res) => {
  const { folderId } = req.params;
  const { indexes } = req.body;

  try {
    const folder = await serverContext.FileSystem.findById(folderId);
    if (!folder) return res.status(404).json({ error: "Folder not found" });

    // Remove files by index in descending order
    indexes.sort((a, b) => b - a).forEach(i => folder.files.splice(i, 1));

    await folder.save({ optimisticConcurrency: false });

    res.json(folder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete selected files" });
  }
});
}

function get_api_projects_projectId_files_fileId_download() {
serverContext.app.get('/api/projects/:projectId/files/:fileId/download', async (req, res) => {
  const { projectId, fileId } = req.params;

  try {
    const project = await serverContext.Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Locate the file object
    const file = project.files.find(f => f._id.toString() === fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found in project' });
    }

    // Use the path directly as it is already the absolute path
    const filePath = (0, serverContext.resolveStoredUploadPath)(file.path);

    console.log(`✅ Resolved file path for download: ${filePath}`);

    // Verify the file exists
    if (!serverContext.fs.existsSync(filePath)) {
      console.warn(`⚠️ File not found at path: ${filePath}`);
      return res.status(404).json({ error: 'File not found on server' });
    }

    console.log(`📦 Downloading file: ${filePath}`);
    return res.download(filePath, file.filename);

  } catch (err) {
    console.error('Download Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
}

function get_api_properties_propertyId_documents() {
// Document Routes
serverContext.app.get('/api/properties/:propertyId/documents', async (req, res) => {
  try {
    const documents = await serverContext.Document.find({ projectId: req.params.propertyId })
      .populate('tenantId', 'name')
      .sort({ createdAt: -1 });
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_propertyId_documents_documentId_view() {
serverContext.app.get('/api/properties/:propertyId/documents/:documentId/view', async (req, res) => {
    try {
        const { propertyId, documentId } = req.params;
        const doc = await serverContext.Document.findOne({
            _id: documentId,
            projectId: propertyId
        });

        if (!doc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const filePath = (0, serverContext.resolveStoredUploadPath)(doc.filePath);
        console.log('📄 Resolved document view path:', { storedPath: doc.filePath, filePath });

        if (!filePath || !serverContext.fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        const ext = serverContext.path.extname(doc.name).toLowerCase();
        const contentType = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif'
        }[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', (0, serverContext.getContentDispositionHeader)('inline', doc.name));
        res.setHeader('Cache-Control', 'public, max-age=0');

        serverContext.fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        console.error('Error serving document:', error);
        res.status(500).json({ message: 'Error serving document' });
    }
});
}

function post_api_properties_propertyId_documents() {
serverContext.app.post('/api/properties/:propertyId/documents', serverContext.upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

const tenantId = String(req.body.tenantId || '').trim();
if (tenantId) {
  const tenant = await serverContext.Tenant.findOne({ _id: tenantId, projectId: req.params.propertyId }).select('_id');
  if (!tenant) {
    return res.status(400).json({ message: 'Selected tenant was not found for this property' });
  }
}

const originalName = req.file.originalname;
const ext = serverContext.path.extname(originalName);
const baseName = req.body.name ? req.body.name.replace(ext, '') : serverContext.path.basename(originalName, ext);
const displayName = baseName + ext; // Always has extension

const document = new serverContext.Document({
  projectId: req.params.propertyId,
  tenantId: tenantId || null,
  name: displayName,
  type: req.body.type,
  filePath: `/uploads/${req.file.filename}`,
  uploadedBy: req.body.uploadedBy || 'System'
});
    await document.save();
    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_properties_propertyId_documents_documentId() {
serverContext.app.put('/api/properties/:propertyId/documents/:documentId', async (req, res) => {
  try {
    const { propertyId, documentId } = req.params;
    const nextName = String(req.body.name || '').trim();
    const nextType = String(req.body.type || '').trim();
    const tenantIdRaw = typeof req.body.tenantId === 'string' ? req.body.tenantId.trim() : req.body.tenantId;

    const document = await serverContext.Document.findOne({
      _id: documentId,
      projectId: propertyId
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (nextName) {
      const currentExt = serverContext.path.extname(document.name || '');
      const requestedExt = serverContext.path.extname(nextName);
      const normalizedName = requestedExt
        ? nextName
        : `${nextName}${currentExt}`;

      document.name = normalizedName;
    }

    if (nextType) {
      document.type = nextType;
    }

    if (tenantIdRaw !== undefined) {
      if (tenantIdRaw) {
        const tenant = await serverContext.Tenant.findOne({ _id: tenantIdRaw, projectId: propertyId }).select('_id');
        if (!tenant) {
          return res.status(400).json({ message: 'Selected tenant was not found for this property' });
        }
        document.tenantId = tenant._id;
      } else {
        document.tenantId = null;
      }
    }

    await document.save();
    await document.populate('tenantId', 'name');

    res.json(document);
  } catch (error) {
    console.error('Error renaming document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function delete_api_properties_propertyId_documents_documentId() {
serverContext.app.delete('/api/properties/:propertyId/documents/:documentId', async (req, res) => {
  try {
    const document = await serverContext.Document.findOne({
      _id: req.params.documentId,
      projectId: req.params.propertyId
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Delete file from filesystem
    const filePath = (0, serverContext.resolveStoredUploadPath)(document.filePath);
    if (serverContext.fs.existsSync(filePath)) {
      serverContext.fs.unlinkSync(filePath);
    }

    // Use deleteOne instead of remove
    await serverContext.Document.deleteOne({ _id: req.params.documentId });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_propertyId_documents_documentId_download() {
serverContext.app.get('/api/properties/:propertyId/documents/:documentId/download', async (req, res) => {
    try {
        const { propertyId, documentId } = req.params;
        const doc = await serverContext.Document.findOne({
            _id: documentId,
            projectId: propertyId
        });

        if (!doc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        const filePath = (0, serverContext.resolveStoredUploadPath)(doc.filePath);
        console.log('📄 Resolved document download path:', { storedPath: doc.filePath, filePath });

        if (!filePath || !serverContext.fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        res.setHeader('Content-Disposition', (0, serverContext.getContentDispositionHeader)('attachment', doc.name));
        serverContext.fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        console.error('Error serving document:', error);
        res.status(500).json({ message: 'Error serving document' });
    }
});
}

return {
  formatProjectDocumentLabel,
  buildAllPropertyDocumentsFolder,
  post_api_projects_projectId_files,
  get_api_projects_projectId_files,
  delete_api_projects_projectId_files_fileId,
  get_api_folders,
  post_api_folders,
  put_api_folders_reorder,
  put_api_folders_id,
  post_api_folders_id_files,
  put_api_folders_folderId_files_index,
  delete_api_folders_id,
  delete_api_folders_folderId_files_index,
  post_api_folders_folderId_delete_files,
  get_api_projects_projectId_files_fileId_download,
  get_api_properties_propertyId_documents,
  get_api_properties_propertyId_documents_documentId_view,
  post_api_properties_propertyId_documents,
  put_api_properties_propertyId_documents_documentId,
  delete_api_properties_propertyId_documents_documentId,
  get_api_properties_propertyId_documents_documentId_download
};
};

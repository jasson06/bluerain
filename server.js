// Load environment variables from .env file
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();


const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const router = express.Router();
const nodemailer = require('nodemailer');





const app = express();
const PORT = process.env.PORT || 5500;
const JWT_SECRET = process.env.JWT_SECRET || '1539';


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));


// Serve static files
const buildPath = path.join(__dirname, "dist");
app.use(express.static(buildPath));


// Debugging: Log the static directory being served
console.log("Serving static files from:", buildPath);

// ✅ Serve static files from "public" and "dist"
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "dist")));

console.log("📂 Serving static files from:", path.join(__dirname, "public"));
console.log("📂 Serving static files from:", path.join(__dirname, "dist"));

// Ensure the uploads directory exists
const uploadDir = '/mnt/data/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Configure multer for file storage on Render Persistent Disk
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Save files to persistent disk
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });


app.use(
  cors({
    origin: ["http://localhost:5500", "https://bluerain.onrender.com"],
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);



app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] !== "https" && process.env.NODE_ENV === "production") {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});




// Logger Middleware
function logger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}
app.use(logger);






// Serve uploaded files
app.use('/uploads', express.static('/mnt/data/uploads'));




// Serve `details-projects.html` for project details page
app.get("/details/projects/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "details-projects.html"));
});


// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Please check your environment variables.");
  process.exit(1); // Exit the application if MONGO_URI is missing
}

const connectToDatabase = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,        // Avoid deprecation warning
      
    });
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error.message);
    process.exit(1); // Exit the application if the connection fails
  }
};

connectToDatabase();

  



app.get('/api/list-uploads', (req, res) => {
    const directoryPath = '/mnt/data/uploads';

    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).json({ message: "Unable to read upload directory.", error: err });
        }
        res.json({ uploadedFiles: files });
    });
});




// Update photo upload handler to associate photos with a specific task

// Photo Upload Route
app.post("/api/upload-photos", upload.array("photos", 10), async (req, res) => {
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
          const task = await Task.findById(taskId);
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
      if (estimateId) {
          estimate = await Estimate.findById(estimateId);
          if (!estimate) return res.status(404).json({ message: "Estimate not found." });

          estimateItem = estimate.lineItems.flatMap(category => category.items)
              .find(item => item._id.toString() === itemId);

          if (estimateItem) {
              if (!estimateItem.photos) estimateItem.photos = { before: [], after: [] };
              estimateItem.photos[type].push(...photoUrls);
              updateSuccess = true;
              console.log(`✅ ${photoUrls.length} Photo(s) saved for Estimate: ${estimateId}, Item: ${itemId} (${type})`);
          } else {
              console.warn(`⚠️ Item not found in estimate: ${estimateId}`);
          }
      }

      // ✅ Handle Photos in Vendor (Ensures Photos Stay in Estimate)
      if (vendorId && vendorId !== "null" && vendorId !== "undefined") {
          const vendor = await Vendor.findById(vendorId);
          if (!vendor) {
              console.warn(`⚠️ Vendor not found for ID: ${vendorId}. Keeping photos in estimate only.`);
          } else {
              const vendorItem = vendor.assignedItems.find(item => item.itemId.toString() === itemId);
              if (!vendorItem) {
                  console.warn(`⚠️ Item not found in vendor's assigned list. Keeping photos in estimate only.`);
              } else {
                  if (!vendorItem.photos) vendorItem.photos = { before: [], after: [] };

                  // ✅ Prevent duplicate photos in Vendor collection
                  photoUrls.forEach(photoUrl => {
                      if (!vendorItem.photos[type].includes(photoUrl)) {
                          vendorItem.photos[type].push(photoUrl);
                      }
                  });

                  await vendor.save();
                  updateSuccess = true;
                  console.log(`✅ ${photoUrls.length} Photo(s) saved for Vendor: ${vendorId}, Item: ${itemId} (${type})`);
              }
          }
      }

      // ✅ Save Estimate Changes After Vendor Upload
      if (updateSuccess && estimate) {
          await estimate.save();
          return res.status(200).json({ message: "Photos uploaded successfully!", photoUrls });
      }

      return res.status(400).json({ message: "Item not found in estimate or vendor." });

  } catch (error) {
      console.error("❌ Error uploading photos:", error);
      res.status(500).json({ message: "Failed to upload photos." });
  }
});


app.post("/api/assign-vendor", async (req, res) => {
  const { estimateId, vendorId } = req.body;

  if (!estimateId || !vendorId) {
      return res.status(400).json({ message: "Estimate ID and Vendor ID are required." });
  }

  try {
      const estimate = await Estimate.findById(estimateId);
      if (!estimate) return res.status(404).json({ message: "Estimate not found." });

      const vendor = await Vendor.findById(vendorId);
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

// Photo Deletion Route
app.delete('/api/delete-photo/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Find the task containing the photo and remove it from the respective array
    const task = await Task.findOneAndUpdate(
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
    const filePath = path.join(__dirname, 'uploads', id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); // Delete the file
    } else {
      console.warn(`File not found on disk: ${filePath}`);
    }

    res.status(200).json({ success: true, message: 'Photo deleted successfully.', task });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ success: false, message: 'Failed to delete photo.' });
  }
});



// Schemas and Models
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  quantity: { type: Number, required: false }, // Optional, for items assigned
  unitPrice: { type: Number, required: false }, // Optional, for items assigned
  total: { type: Number, required: false }, // Optional, for items assigned
  dueDate: { type: Date },
  completed: { type: Boolean, default: false },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  photos: {
    before: [{ type: String }], // Array of strings for photo paths
    after: [{ type: String }],
  },
  comments: [
    {
      text: { type: String, required: true }, // The comment text
      createdAt: { type: Date, default: Date.now }, // Timestamp for the comment
    },
  ],
  category: { type: String, enum: ['new', 'in-progress', 'punch-list'], default: 'new' }, // Workflow categories
  status: { type: String, enum: ['new', 'in-progress', 'completed'], default: 'new' }, // Task workflow status
  createdAt: { type: Date, default: Date.now },
});


const commentSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Task' },
  text: { type: String, required: true },
  managerName: { type: String, required: true },
  timestamp: { type: Date, required: true },
});


const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, trim: true },
});

const estimateSchema = new mongoose.Schema({ 
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  lineItems: [
    {
      type: {
        type: String,
        enum: ['category'],
        required: true
      },
      category: { type: String, required: true },
      status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
      items: [
        {
          type: { type: String, enum: ['item'], default: 'item' },
          name: { type: String, required: true },
          description: { type: String },
          quantity: { type: Number, required: true, min: 1 },
          unitPrice: { type: Number, required: true, min: 0 },
          total: { type: Number, required: true },
          status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
          assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            default: null // Allow null explicitly for unassigned items
          },
          photos: {
            before: [{ type: String }], // Store URLs of "before" photos
            after: [{ type: String }],  // Store URLs of "after" photos
          },
          startDate: { type: Date, default: null }, // ✅ Add Start Date
          endDate: { type: Date, default: null } // ✅ Add End Date
        }
      ]
    }
  ],
  total: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});




// Schemas and Models
const vendorSchema = new mongoose.Schema({
  name: { type: String, required: false, trim: true },  // Name is now optional
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: false },  // Password is now optional

  role: { type: String, enum: ["vendor", "project-manager"], default: "vendor" }, 

  assignedItems: [
    {
      itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
      estimateId: { type: mongoose.Schema.Types.ObjectId, ref: "Estimate" },

      name: { type: String, required: true },
      description: { type: String, default: "No description provided" },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true },
      status: { type: String, enum: ["new", "in-progress", "completed"], default: "new" },
      photos: {
        before: [{ type: String }],
        after: [{ type: String }],
      },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    }
  ],

  assignedProjects: [
    {
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
      status: { type: String, enum: ["new", "in-progress", "completed"], default: "new" },
    }
  ],

  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },

  // New fields to track invitation status
  isInvited: { type: Boolean, default: false },  // Track if the vendor was invited
  isActive: { type: Boolean, default: false },   // Becomes true when vendor activates account
},
{ timestamps: true });


// ✅ Indexing for Faster Queries
vendorSchema.index({ "assignedItems.itemId": 1 });
vendorSchema.index({ "assignedItems.projectId": 1 });


// Hash the password before saving the vendor
vendorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // Prevent rehashing if the password is already hashed
  if (this.password.startsWith('$2b$')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});




// Project schema
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: String, required: true },
  color: { type: String, default: 'blue' },
  type: { type: String, required: true },
  code: { type: String, required: true },
  address: {
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String },
  },
  description: { type: String },
  estimates: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Estimate",
    },
  ],
  files: [{
    filename: String,
    path: String,
    mimetype: String,
  }],
});


const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true },
  role: { type: String, required: true, enum: ["vendor", "project-manager"] },
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Project" },
  token: { type: String, required: true },
  invitedAt: { type: Date, default: Date.now },
  status: { type: String, default: "pending", enum: ["pending", "accepted", "declined"] }, // Tracks invitation state
  expiresAt: { type: Date, default: () => Date.now() + 3600000 }, // Token expires in 1 hour
  acceptedAt: { type: Date }, // Tracks when the invitation was accepted
  declinedAt: { type: Date }, // Tracks when the invitation was declined
  deleted: { type: Boolean, default: false }, // For soft deletion
});



// Project Manager Schema and Model
const managerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date }
}, { timestamps: true });

// Hash password before saving
managerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // Prevent rehashing if the password is already hashed
  if (this.password.startsWith('$2b$')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});




const Task = mongoose.model('Task', taskSchema);
const Comment = mongoose.model("Comment", commentSchema);
const Client = mongoose.model('Client', clientSchema);
const Estimate = mongoose.model("Estimate", estimateSchema);
const Vendor = mongoose.model('Vendor', vendorSchema);
const Project = mongoose.model('Project', projectSchema);
const Manager = mongoose.model('Manager', managerSchema);
const Invitation = mongoose.model("Invitation", invitationSchema);

module.exports = {
  Task,
  Comment,
  Client,
  Estimate,
  Vendor,
  Project,
  Manager,
  Invitation,
};




// Add Client
app.post('/api/add-client', async (req, res) => {
  try {
    const newClient = new Client(req.body);
    await newClient.save();
    res.status(201).json({ success: true, message: 'Client added successfully', client: newClient });
  } catch (error) {
    console.error('Error adding client:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add Estimate
// Add a new estimate to a project
app.post('/api/estimates', async (req, res) => { 
  try {
    console.log('Request Body:', req.body);

    const { projectId, lineItems, tax } = req.body;

    // Validate Input
    if (!projectId || !lineItems || lineItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid input: Missing required fields.' });
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ success: false, message: 'Invalid Project ID.' });
    }

    // Organize Line Items into Categories
    const structuredLineItems = lineItems.map(category => {
      if (category.type === 'category') {
        if (!category.category) {
          throw new Error("Category name is required.");
        }

        const items = category.items.map(item => {
          if (!item.name || item.quantity === undefined || item.unitPrice === undefined) {
            throw new Error("Each line item must include a name, quantity, and unit price.");
          }

          return {
            type: 'item',
            name: item.name,
            description: item.description || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total || item.quantity * item.unitPrice,
            status: item.status || 'in-progress',
            assignedTo: item.assignedTo || null
          };
        });

        return {
          type: 'category',
          category: category.category,
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
    const newEstimate = new Estimate({
      projectId,
      invoiceNumber,
      lineItems: structuredLineItems,
      total,
      tax
    });

    await newEstimate.save();
    res.status(201).json({ success: true, estimate: newEstimate });

  } catch (error) {
    console.error('Error saving estimate:', error.message);
    res.status(500).json({ success: false, message: 'Failed to save estimate.' });
  }
});




// Route to Get a Single Estimate by ID
app.get('/api/estimates/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid estimate ID.' });
  }

  try {
    const estimate = await Estimate.findById(id)
      .populate('projectId', 'name address')
      .populate('lineItems.items.assignedTo', 'name'); // Ensure 'assignedTo' is populated

    if (!estimate) {
      return res.status(404).json({ success: false, message: 'Estimate not found.' });
    }

    // 🔍 Debugging: Log the response to check if photos exist
    console.log("📸 Estimate Photos Debugging:", JSON.stringify(estimate, null, 2));

    res.status(200).json({ success: true, estimate });
  } catch (error) {
    console.error('❌ Error fetching estimate:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch estimate.' });
  }
});





// Route to Get All Estimates for a Specific Project
app.get('/api/estimates', async (req, res) => {
  const { projectId } = req.query;

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(400).json({ success: false, message: 'Invalid or missing Project ID.' });
  }

  try {
    // Find all estimates linked to the projectId
    const estimates = await Estimate.find({ projectId }).populate('projectId', 'name address');

    if (!estimates || estimates.length === 0) {
      return res.status(200).json({ success: true, estimates: [] });  // Return empty array if no estimates found
    }

    res.status(200).json({ success: true, estimates });
  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch estimates.' });
  }
});





// Route to Get Estimates for a Specific Project
app.delete('/api/estimates/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Estimate ID.' });
  }

  const estimateObjectId = new mongoose.Types.ObjectId(id);  // Convert id to ObjectId

  try {
    // Delete the estimate
    const deletedEstimate = await Estimate.findByIdAndDelete(estimateObjectId);
    if (!deletedEstimate) {
      return res.status(404).json({ success: false, message: 'Estimate not found.' });
    }

    // Debugging: Check vendors with assigned items linked to this estimate
    const vendorsWithItems = await Vendor.find({ "assignedItems.estimateId": estimateObjectId });
    console.log("Vendors with assigned items for this estimate:", vendorsWithItems);

    // Remove assigned items linked to the estimate
    const updatedVendors = await Vendor.updateMany(
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

// Backend route to update the estimate
app.put("/api/estimates/:id", async (req, res) => {
  try {
    const estimateId = req.params.id;
    const updatesPayload = req.body;

    // Helper function to normalize status values.
    function normalizeStatus(status) {
      if (typeof status !== "string") return status;
      status = status.trim();
      // Map "Not Started" to "in-progress"
      if (status.toLowerCase() === "not started") return "in-progress";
      // Otherwise, replace spaces with hyphens and lowercase
      return status.toLowerCase().replace(/\s+/g, "-");
    }

    // Fetch the existing document
    const existingEstimate = await Estimate.findById(estimateId);
    if (!existingEstimate) {
      return res.status(404).json({ message: "Estimate not found" });
    }

    // Create a map of existing items by their _id.
    const existingItemsMap = new Map();
    existingEstimate.lineItems.forEach((lineItem) => {
      lineItem.items.forEach((item) => {
        existingItemsMap.set(item._id.toString(), item);
      });
    });

    // Merge new items with existing data.
    updatesPayload.lineItems.forEach((lineItem) => {
      lineItem.items.forEach((item) => {
        // If a status is provided, normalize it.
        if (item.status && item.status.trim() !== "") {
          item.status = normalizeStatus(item.status);
        }

        // If the item exists in the database, preserve its fields if not provided.
        if (item._id && existingItemsMap.has(item._id.toString())) {
          const existingItem = existingItemsMap.get(item._id.toString());
          // Preserve existing photos and assignedTo
          item.photos = existingItem.photos ?? { before: [], after: [] };
          item.assignedTo = existingItem.assignedTo ?? null;
          // Preserve existing startDate if not provided
          if (item.startDate === undefined || item.startDate === null || item.startDate === "") {
            item.startDate = existingItem.startDate;
          }
          // Preserve existing endDate if not provided
          if (item.endDate === undefined || item.endDate === null || item.endDate === "") {
            item.endDate = existingItem.endDate;
          }
          // Even if the incoming item.status is empty, force normalization on the existing value.
          if (!item.status || item.status.trim() === "") {
            item.status = normalizeStatus(existingItem.status);
          }
        } else {
          // For new items, if status is not provided or is empty, default to "in-progress"
          if (!item.status || item.status.trim() === "") {
            item.status = "in-progress";
          }
        }
      });
    });

    // Update the document with the merged data
    const updatedEstimate = await Estimate.findByIdAndUpdate(
      estimateId,
      { $set: updatesPayload },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedEstimate);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Server error", error });
  }
});



app.patch('/api/estimates/:id/update-photo', async (req, res) => {
  const { id } = req.params;
  const { itemId, type, photos } = req.body; // ✅ Only extract the needed fields

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Estimate ID.' });
  }

  try {
    let estimate = await Estimate.findById(id);
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



// Serve the estimate-view.html file
app.get('/estimate-view.html', (req, res) => {
  const filePath = path.join(__dirname, 'dist', 'estimate-view.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving estimate-view.html:', err);
      res.status(500).send('Failed to load the page.');
    }
  });
});



// Add Task
app.post('/api/add-task', async (req, res) => {
  try {
    const newTask = new Task(req.body);
    await newTask.save();
    res.status(201).json({ success: true, message: 'Task added successfully', task: newTask });
  } catch (error) {
    console.error('Error adding task:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add Vendor
app.post('/api/add-vendor', async (req, res) => {
  try {
    const newVendor = new Vendor(req.body);
    await newVendor.save();
    res.status(201).json({ success: true, message: 'Vendor added successfully', vendor: newVendor });
  } catch (error) {
    console.error('Error adding vendor:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


// API Endpoint to Get All Vendors
app.get('/api/vendors', async (req, res) => {
  try {
    const vendors = await Vendor.find(); // Fetch all vendors from the database
    res.status(200).json(vendors); // Send vendors as a response
  } catch (error) {
    console.error('Error fetching vendors:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch vendors' });
  }
});

app.get('/api/vendors/:id', async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid vendor ID.' });
  }

  try {
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }

    res.status(200).json(vendor);
  } catch (error) {
    console.error('Error fetching vendor:', error.message);
    res.status(500).json({ error: 'Failed to fetch vendor.' });
  }
});



// API Endpoint to delete a vendor by ID
app.delete('/api/vendors/:id', (req, res) => {
  const vendorIndex = vendors.findIndex((v) => v.id === req.params.id);

  if (vendorIndex === -1) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  vendors.splice(vendorIndex, 1);
  console.log(`Vendor with ID ${req.params.id} deleted`); // Optional log for debugging
  res.status(204).send();
});

// API Endpoint to update an existing vendor
app.put('/api/vendors/:id', (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Vendor name is required for update' });
  }

  const vendor = vendors.find((v) => v.id === req.params.id);

  if (!vendor) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  vendor.name = name;
  console.log(`Vendor with ID ${req.params.id} updated`); // Optional log for debugging
  res.status(200).json(vendor);
});

  ///==================///
      // Add Project
app.post('/api/add-project', async (req, res) => {
  try {
    const newProject = new Project(req.body);
    await newProject.save();
    res.status(201).json({ success: true, message: 'Project added successfully', project: newProject });
  } catch (error) {
    console.error('Error adding project:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add project' });
  }
});


// Get All Projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find();
    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});



//Route for Editing a Project
app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, status, color, type, code, address, description } = req.body;

  // Validate Project ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Project ID.' });
  }

  // Validate required fields
  if (!name || !status || !type || !code || !address || !address.city || !address.state) {
    return res.status(400).json({
      success: false,
      message: 'Name, status, type, code, city, and state are required.',
    });
  }

  try {
    // Update project
    const updatedProject = await Project.findByIdAndUpdate(
      id,
      {
        name,
        status,
        color,
        type,
        code,
        address: {
          addressLine1: address.addressLine1 || '', // Default to empty if not provided
          addressLine2: address.addressLine2 || '',
          city: address.city,
          state: address.state,
          zip: address.zip || '',
        },
        description,
      },
      { new: true, runValidators: true } // Return updated project and enforce schema validation
    );

    if (!updatedProject) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Project updated successfully.',
      project: updatedProject,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, message: 'Failed to update project.' });
  }
});



// Serve the details-project.html file
app.get('/details/projects/:id', (req, res) => {
  const filePath = path.join(__dirname, 'dist', 'details-projects.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving details-projects.html:', err);
      res.status(500).send('Failed to load the page.');
    }
  });
});




// Get Project Details by ID
app.get('/api/details/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, project });
  } catch (error) {
    console.error('Error fetching project details:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch project details' });
  }
});



app.delete("/api/projects/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if project exists
    const project = await Project.findByIdAndDelete(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    res.status(200).json({ success: true, message: "Project deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    res.status(500).json({ success: false, message: "Failed to delete project." });
  }
});



// Fetch tasks for a specific project
app.get('/api/tasks', async (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ success: false, error: 'Project ID is required' });
  }

  try {
    const tasks = await Task.find({ projectId }).populate('assignedTo', 'name');
    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});



// Get Task Details Endpoint
app.get('/api/task/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Task ID.' });
  }

  try {
    const task = await Task.findById(id)
      .populate('assignedTo', 'name') // Populate the assignedTo field
      .select('title description dueDate completed assignedTo photos comments'); // Select the required fields

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({
      success: true,
      task: {
        id: task._id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        completed: task.completed,
        assignedTo: task.assignedTo,
        photos: task.photos,
        comments: task.comments || [], // Include comments in the response
      },
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task details' });
  }
});


app.put('/api/task/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { assignedTo } = req.body;

  try {
    const task = await Task.findByIdAndUpdate(id, { assignedTo }, { new: true });
    const vendor = await Vendor.findById(assignedTo);

    await sendNotificationEmail(vendor.email, 'Task Assignment', `You have been assigned to task: ${task.title}`);
    res.json({ success: true, message: 'Task assigned and notification sent.', task });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to assign task.' });
  }
});






// Create Task (Backend)
app.post('/api/tasks', async (req, res) => {
  try {
    const newTask = new Task(req.body);
    await newTask.save();
    res.status(201).json({ success: true, task: newTask });
  } catch (error) {
    console.error('Error adding task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add task' });
  }
});

// Delete Task (Backend)
app.delete('/api/task/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const task = await Task.findByIdAndDelete(id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});


// Get comments for a specific task
app.get('/api/comments', async (req, res) => {
  const { taskId } = req.query;

  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ success: false, message: 'Invalid Task ID.' });
  }

  try {
    const comments = await Comment.find({ taskId }).sort({ timestamp: -1 }); // Fetch from Comment collection
if (!comments.length) {
  return res.status(200).json({ success: true, comments: [] }); // No comments yet
}

res.status(200).json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch comments.' });
  }
});



// Add a new comment to a task
app.post('/api/comments', async (req, res) => {
  const { taskId, comment, managerName, timestamp } = req.body;

  if (!taskId || !comment || !managerName || !timestamp) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const newComment = new Comment({
      taskId,
      text: comment,
      managerName,
      timestamp,
    });

    await newComment.save();

    res.status(201).json({ message: 'Comment added successfully.', comment: newComment });
  } catch (error) {
    console.error('Error saving comment:', error);
    res.status(500).json({ message: 'Failed to save comment.' });
  }
});




// Update Task Endpoint
app.put('/api/task/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, dueDate, completed, assignedTo } = req.body;

  try {
    const updateFields = {};

    // Dynamically add fields to update if provided
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (dueDate) updateFields.dueDate = dueDate;
    if (typeof completed !== 'undefined') updateFields.completed = completed; // Handle boolean
    if (assignedTo) updateFields.assignedTo = assignedTo;

    const task = await Task.findByIdAndUpdate(id, updateFields, { new: true });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, task });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});



// Vendor Sign-Up
app.post("/api/signup", async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ success: false, message: "Vendor already exists." });
    }

    // Create the new vendor
    const newVendor = new Vendor({ name, email, phone, password });
    await newVendor.save();

    // Assign projects based on pending invitations
    const pendingInvitations = await Invitation.find({ email, role: "vendor", status: "pending" });

    for (const invitation of pendingInvitations) {
      newVendor.assignedProjects.push({ projectId: invitation.projectId, status: "new" });
      invitation.status = "accepted";
      await invitation.save();
    }

    await newVendor.save();

    res.status(201).json({
      success: true,
      message: "Vendor registered successfully and projects assigned.",
      vendor: newVendor,
    });
  } catch (error) {
    console.error("Error registering vendor:", error);
    res.status(500).json({ success: false, message: "Failed to register vendor." });
  }
});


// Vendor Sign-In
app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body;

  // Validate request body
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    console.log('Incoming sign-in request:', { email });

    // Find vendor by email
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      console.warn('Vendor not found:', email);
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      console.warn('Invalid credentials for vendor:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Generate JWT token
    const token = jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Vendor authenticated successfully:', email);

    // Respond with token and vendorId
    return res.status(200).json({ success: true, token, vendorId: vendor._id });
  } catch (error) {
    console.error('Error during vendor sign-in:', error);
    return res.status(500).json({ success: false, message: 'An internal error occurred. Please try again later.' });
  }
});




// Password Reset Request
app.post('/api/password-reset/request', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    vendor.passwordResetToken = resetTokenHash;
    vendor.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry
    await vendor.save();

    // Send the reset token via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: vendor.email,
      subject: 'Password Reset Request',
      text: `Your password reset token is: ${resetToken}`,
    });

    res.status(200).json({ success: true, message: 'Password reset token sent to email.' });
  } catch (error) {
    console.error('Error generating password reset token:', error);
    res.status(500).json({ success: false, message: 'Failed to generate password reset token.' });
  }
});

// Password Reset
app.post('/api/password-reset', async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    if (!vendor.passwordResetToken || vendor.passwordResetExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    const isTokenValid = await bcrypt.compare(token, vendor.passwordResetToken);
    if (!isTokenValid) {
      return res.status(400).json({ success: false, message: 'Invalid reset token.' });
    }

    const salt = await bcrypt.genSalt(10);
    vendor.password = await bcrypt.hash(newPassword, salt);
    vendor.passwordResetToken = undefined;
    vendor.passwordResetExpires = undefined;
    await vendor.save();

    res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});




app.put('/api/vendors/:vendorId/update-item-status', async (req, res) => {
  const { vendorId } = req.params;
  const { itemId, status } = req.body;

  console.log("📌 Incoming Status Update:", { vendorId, itemId, status });

  if (!itemId || !status) {
    return res.status(400).json({ message: "Missing itemId or status." });
  }

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const item = vendor.assignedItems.find(item => item.itemId.toString() === itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    // ✅ Update status in Vendor assignedItems
    item.status = status;
    await vendor.save();
    console.log("✅ Vendor Item Status Updated Successfully:", item);

    // ✅ Now, update the corresponding item status in the Estimate
    const estimateUpdateResult = await Estimate.updateOne(
      { "lineItems.items._id": itemId },
      {
        $set: {
          "lineItems.$[].items.$[elem].status": status
        }
      },
      {
        arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(itemId) }]
      }
    );

    console.log("📊 Estimate Update Result:", estimateUpdateResult);

    res.status(200).json({ message: "Item status updated successfully in both vendor and estimate.", item });

  } catch (error) {
    console.error("❌ Error updating item status:", error);
    res.status(500).json({ message: "Failed to update item status." });
  }
});







app.put('/api/vendor/start-project', async (req, res) => {
  try {
      const { vendorId, projectId } = req.body;
      if (!vendorId || !projectId) {
          return res.status(400).json({ success: false, message: 'Vendor ID and Project ID are required' });
      }

      const vendor = await Vendor.findById(vendorId);
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


// ✅ API: Fetch Assigned Tasks (Line Items) for a Subcontractor
app.get("/api/subcontractor/tasks", async (req, res) => {
  try {
      const { vendorId } = req.query;
      if (!vendorId) {
          return res.status(400).json({ error: "Vendor ID is required." });
      }

      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
          return res.status(404).json({ error: "Vendor not found." });
      }

      res.status(200).json({ tasks: vendor.assignedItems || [] });
  } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks." });
  }
});



app.get('/api/vendors/:vendorId/assigned-projects', async (req, res) => {
  const { vendorId } = req.params;

  try {
    // Ensure population of project details
    const vendor = await Vendor.findById(vendorId).populate({
      path: 'assignedProjects.projectId',
      model: 'Project',
      select: 'name status type address' // Ensure these fields are populated
    });

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const newJobs = vendor.assignedProjects.filter(proj => proj.status === 'new');
    const inProgress = vendor.assignedProjects.filter(proj => proj.status === 'in-progress');
    const completed = vendor.assignedProjects.filter(proj => proj.status === 'completed');

    res.status(200).json({ success: true, newJobs, inProgress, completed });
  } catch (error) {
    console.error('Error fetching assigned projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assigned projects.' });
  }
});






app.get('/api/subcontractor/projects', async (req, res) => {
  try {
      const { vendorId } = req.query;
      if (!vendorId) {
          return res.status(400).json({ success: false, message: 'Vendor ID is required' });
      }

      const vendor = await Vendor.findById(vendorId).populate({
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


app.put('/api/vendor/update-project-status', async (req, res) => {
  try {
      const { vendorId, projectId, status } = req.body;
      if (!vendorId || !projectId || !status) {
          return res.status(400).json({ error: "Vendor ID, Project ID, and Status are required." });
      }

      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
          return res.status(404).json({ error: "Vendor not found." });
      }

      const projectIndex = vendor.assignedProjects.findIndex(p => p.projectId.toString() === projectId);
      if (projectIndex === -1) {
          return res.status(404).json({ error: "Project not assigned to vendor." });
      }

      vendor.assignedProjects[projectIndex].status = status;
      await vendor.save();

      res.status(200).json({ success: true, message: "Project status updated successfully." });
  } catch (error) {
      console.error("Error updating project status:", error);
      res.status(500).json({ error: "Failed to update project status." });
  }
});


app.post('/api/vendors/:vendorId/assign-item', async (req, res) => {
  const { vendorId } = req.params;
  const { projectId, itemId, name, description, quantity, unitPrice, total } = req.body;

  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    // ✅ Assign the item to a specific project
    vendor.assignedItems.push({
      itemId,
      projectId, // ✅ Ensure projectId is stored
      name,
      description,
      quantity,
      unitPrice,
      total,
      status: 'new'
    });

    await vendor.save();
    res.status(201).json({ message: 'Item assigned successfully.', vendor });
  } catch (error) {
    console.error('Error assigning item:', error);
    res.status(500).json({ message: 'Failed to assign item.' });
  }
});


app.post("/api/assign-items", async (req, res) => {
  const { vendorId, projectId, estimateId, items } = req.body;

  if (!vendorId || !projectId || !estimateId || !items || items.length === 0) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // ✅ Find Vendor & Estimate
    const vendor = await Vendor.findById(vendorId);
    const estimate = await Estimate.findById(estimateId);

    if (!vendor) return res.status(404).json({ message: "Vendor not found." });
    if (!estimate) return res.status(404).json({ message: "Estimate not found." });

    let updatedAssignedItems = [];

    for (const item of items) {
      // 🔹 Find the item in the estimate
      const estimateItem = estimate.lineItems.flatMap(cat => cat.items)
        .find(i => i._id.toString() === item.itemId);

      if (!estimateItem) {
        console.warn(`⚠️ Item ${item.itemId} not found in estimate.`);
        continue;
      }

      // ✅ Check if the item is already assigned to the vendor
      let vendorItem = vendor.assignedItems.find(i => i.itemId.toString() === item.itemId);
      
      if (!vendorItem) {
        // 🔹 Create a new assigned item in the vendor's list
        vendorItem = {
          itemId: item.itemId,
          projectId,
          estimateId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          status: "new",
          photos: {
            before: [...(estimateItem.photos?.before || [])], // Copy photos from estimate
            after: [...(estimateItem.photos?.after || [])]
          }
        };
        vendor.assignedItems.push(vendorItem);
      } else {
        // ✅ Update existing assigned item in the vendor's list
        vendorItem.name = item.name;
        vendorItem.description = item.description;
        vendorItem.quantity = item.quantity;
        vendorItem.unitPrice = item.unitPrice;
        vendorItem.total = item.total;
        vendorItem.photos.before = [...(estimateItem.photos?.before || [])];
        vendorItem.photos.after = [...(estimateItem.photos?.after || [])];
      }

      updatedAssignedItems.push(vendorItem);
    }

    // ✅ Save Vendor with Updated Assigned Items
    await vendor.save();

    // ✅ Update `assignedTo` Field in Estimate
    const updateOperations = items.map(item => ({
      updateOne: {
        filter: { 
          _id: new mongoose.Types.ObjectId(estimateId), 
          'lineItems.items._id': new mongoose.Types.ObjectId(item.itemId) 
        },
        update: { 
          $set: { 'lineItems.$[category].items.$[item].assignedTo': new mongoose.Types.ObjectId(vendorId) }
        },
        arrayFilters: [
          { 'category.items._id': new mongoose.Types.ObjectId(item.itemId) },
          { 'item._id': new mongoose.Types.ObjectId(item.itemId) }
        ]
      }
    }));

    if (updateOperations.length > 0) {
      await Estimate.bulkWrite(updateOperations);
    }

    console.log("✅ Items assigned successfully & photos copied!");
    
    // ✅ Return updated assigned items so frontend updates properly
    res.status(200).json({ 
      message: "Items assigned successfully!", 
      assignedItems: vendor.assignedItems 
    });

  } catch (error) {
    console.error("❌ Error assigning items:", error);
    res.status(500).json({ message: "Failed to assign items." });
  }
});









  
  /* ==========
     📌 Delete Photo
     ========== */
 app.delete("/api/delete-photo/:vendorId/:itemId/:photoUrl", async (req, res) => {
  try {
      const { vendorId, itemId, photoUrl } = req.params;
      const decodedPhotoUrl = decodeURIComponent(photoUrl); // Decode the URL to match stored DB paths

      console.log(`🗑️ Deleting Photo: ${decodedPhotoUrl} for Item: ${itemId} under Vendor: ${vendorId}`);

      // ✅ Remove file from server
      const filePath = `./public${decodedPhotoUrl}`;
      if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`✅ Deleted file from server: ${decodedPhotoUrl}`);
      } else {
          console.warn(`⚠️ File not found on server: ${decodedPhotoUrl}`);
      }

      // ✅ Remove photo from Vendor's assignedItems
      const vendor = await Vendor.findOneAndUpdate(
          { _id: vendorId, "assignedItems.itemId": itemId },
          { 
              $pull: { 
                  "assignedItems.$[].photos.before": decodedPhotoUrl,
                  "assignedItems.$[].photos.after": decodedPhotoUrl 
              } 
          },
          { new: true }
      );

      // ✅ Remove photo from Estimate's lineItems
      const estimate = await Estimate.findOneAndUpdate(
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


  
 app.get("/api/vendors/:vendorId/assigned-items/:projectId", async (req, res) => {
  try {
      const { vendorId, projectId } = req.params;
      console.log(`📌 Fetching assigned items for Vendor: ${vendorId}, Project: ${projectId}`);

      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
          return res.status(404).json({ message: "Vendor not found." });
      }

      // ✅ Find items assigned to this vendor for this project
      const assignedItems = vendor.assignedItems.filter(item => item.projectId.toString() === projectId);

      if (assignedItems.length === 0) {
          console.warn("⚠️ No assigned items found for this project and vendor.");
          return res.status(404).json({ message: "No assigned items found." });
      }

      // ✅ Ensure Photos Exist
      assignedItems.forEach(item => {
          if (!item.photos) {
              item.photos = { before: [], after: [] };
          }
      });

      console.log("✅ Assigned Items:", assignedItems);

      res.status(200).json({ items: assignedItems });
  } catch (error) {
      console.error("❌ Error fetching assigned items:", error);
      res.status(500).json({ message: "Failed to fetch assigned items." });
  }
});


  

  /* ==========
     📌 Fetch Photos for an Item
     ========== */
     app.get("/api/photos/:itemId", async (req, res) => {
      const { itemId } = req.params;
  
      try {
          console.log(`📸 Fetching photos for item: ${itemId}`);
  
          let photos = { before: [], after: [] };
  
          // 🔍 First, Check if the Item is Assigned to a Vendor
          const vendor = await Vendor.findOne({ "assignedItems.itemId": itemId });
          if (vendor) {
              const item = vendor.assignedItems.find(i => i.itemId.toString() === itemId);
              if (item && item.photos) {
                  console.log(`✅ Found item in vendor: ${vendor._id}`);
                  photos.before = [...new Set([...photos.before, ...(item.photos.before || [])])];
                  photos.after = [...new Set([...photos.after, ...(item.photos.after || [])])];
              }
          }
  
          // 🔍 Also Fetch from Estimates (Even if Assigned to Vendor)
          const estimate = await Estimate.findOne({ "lineItems.items._id": itemId });
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
  


// Fetch Assigned Items for a Vendor by Project
app.get('/api/vendors/:vendorId/assigned-items/:projectId', async (req, res) => {
  const { vendorId, projectId } = req.params;

  try {
    // Fetch vendor data
    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      console.error("❌ Vendor not found:", vendorId);
      return res.status(404).json({ message: "Vendor not found." });
    }

    // Ensure assigned items exist
    if (!vendor.assignedItems || vendor.assignedItems.length === 0) {
      console.warn("⚠️ No assigned items found for vendor:", vendorId);
      return res.status(200).json({ items: [] });
    }

    // Filter assigned items for the specific project
    const assignedItems = vendor.assignedItems.filter(
      (item) => item.projectId && item.projectId.toString() === projectId
    );

    if (assignedItems.length === 0) {
      console.warn("⚠️ No items found for this project:", projectId);
    } else {
      console.log(
        `📌 ${assignedItems.length} assigned items found for Vendor ${vendorId} in Project ${projectId}.`
      );
    }

    res.status(200).json({ items: assignedItems });
  } catch (error) {
    console.error("❌ Error fetching assigned items:", error);
    res.status(500).json({ message: "Failed to fetch assigned items." });
  }
});




// Route to clear vendor assignment
app.patch('/api/clear-vendor-assignment/:itemId', async (req, res) => {
  const { itemId } = req.params;

  console.log(`Attempting to clear vendor assignment for item ID: ${itemId}`);

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    console.log('Invalid Item ID format:', itemId);
    return res.status(400).json({ message: 'Invalid Item ID format.' });
  }

  try {
    // Step 1: Find the estimate and clear the assignment from nested lineItems.items
    const estimate = await Estimate.findOneAndUpdate(
      { 'lineItems.items._id': itemId },  // Find item in nested structure
      { $set: { 'lineItems.$[].items.$[elem].assignedTo': null } },  // Clear the assignedTo field
      {
        arrayFilters: [{ 'elem._id': new mongoose.Types.ObjectId(itemId) }],  // Filter to match the specific item
        new: true  // Return the updated estimate
      }
    );

    if (!estimate) {
      console.log(`Item ID ${itemId} not found in any estimate.`);
      return res.status(404).json({ message: 'Item not found in any estimate.' });
    }

    // Step 2: Remove the item from the vendor's assignedItems array
    const vendorUpdate = await Vendor.updateOne(
      { 'assignedItems.itemId': itemId },
      { $pull: { assignedItems: { itemId: new mongoose.Types.ObjectId(itemId) } } }
    );

    console.log(`Vendor update result:`, vendorUpdate);

    if (vendorUpdate.modifiedCount === 0) {
      console.log(`Item ID ${itemId} not found in vendor's assignedItems.`);
      return res.status(404).json({ message: 'Item not found in vendor data.' });
    }

    res.status(200).json({ message: 'Vendor assignment cleared successfully.' });
  } catch (error) {
    console.error('Error clearing vendor assignment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// API to upload files to a specific project
app.post('/api/projects/:projectId/files', upload.array('files'), async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = await Project.findById(projectId);

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

    res.status(200).json({ message: 'Files uploaded successfully', files });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API to get files for a specific project
app.get('/api/projects/:projectId/files', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    console.log(`Fetching files for project ID: ${projectId}`);  // Debug log

    const project = await Project.findById(projectId);
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


// API to delete a specific file from a project
app.delete('/api/projects/:projectId/files/:fileId', async (req, res) => {
  const { projectId, fileId } = req.params;

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).send('Project not found');
    }

    const fileIndex = project.files.findIndex(file => file._id.toString() === fileId);
    if (fileIndex === -1) {
      return res.status(404).send('File not found');
    }

    const filePath = project.files[fileIndex].path;
    fs.unlinkSync(filePath); // Delete from filesystem

    project.files.splice(fileIndex, 1); // Remove from database
    await project.save();

    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).send('Internal Server Error');
  }
});






// Project Manager Sign-Up
app.post('/api/manager/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const existingManager = await Manager.findOne({ email });
    if (existingManager) {
      return res.status(400).json({ success: false, message: 'Project Manager already exists.' });
    }

    const newManager = new Manager({ name, email, password });
    await newManager.save();

    res.status(201).json({ success: true, message: 'Project Manager registered successfully.' });
  } catch (error) {
    console.error('Error registering project manager:', error);
    res.status(500).json({ success: false, message: 'Failed to register project manager.' });
  }
});

// Project Manager Sign-In
app.post('/api/manager/signin', async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    console.log('Missing email or password');
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log('Invalid email format:', email);
    return res.status(400).json({ success: false, message: 'Invalid email format.' });
  }

  try {
    // Check database connection
    if (!mongoose.connection.readyState) {
      console.error('Database not connected');
      return res.status(500).json({ success: false, message: 'Database connection error.' });
    }

    console.log('Email Received:', email);

    // Find manager by email
    const manager = await Manager.findOne({ email: email.toLowerCase() });
    console.log('Manager Found:', manager);

    if (!manager) {
      console.log('No manager found for email:', email);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, manager.password);
    console.log('Password Match:', isMatch);

    if (!isMatch) {
      console.log('Password mismatch for manager:', email);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { managerId: manager._id }, 
      JWT_SECRET, 
      { expiresIn: '1h' } // Token valid for 1 hour
    );

    // Send successful response
    console.log('Sign-in successful for manager:', manager.email);
    res.status(200).json({
      success: true,
      token,
      managerId: manager._id,
      managerName: manager.name,
    });
  } catch (error) {
    console.error('Error signing in project manager:', error.message);
    res.status(500).json({ success: false, message: 'Failed to sign in.' });
  }
});


// Password Reset Request
app.post('/api/manager/reset-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  try {
    const manager = await Manager.findOne({ email });
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Project Manager not found.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    manager.passwordResetToken = resetTokenHash;
    manager.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry
    await manager.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: manager.email,
      subject: 'Password Reset Request',
      text: `Your password reset token is: ${resetToken}`
    });

    res.status(200).json({ success: true, message: 'Password reset token sent to email.' });
  } catch (error) {
    console.error('Error generating password reset token:', error);
    res.status(500).json({ success: false, message: 'Failed to generate password reset token.' });
  }
});



// 📌 Configure Email Transporter
// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Helps with SSL issues
  },
});


app.post("/api/invite", async (req, res) => {
  try {
    const { emails, role, projectId } = req.body;

    if (!Array.isArray(emails) || emails.length === 0 || !role || !projectId) {
      return res.status(400).json({ success: false, message: "Emails, role, and projectId are required." });
    }

    const invitedUsers = [];

    for (const email of emails) {
      try {
        let existingUser =
          role === "vendor" ? await Vendor.findOne({ email }) : await Manager.findOne({ email });
        let token = crypto.randomBytes(32).toString("hex");

        if (existingUser) {
          if (role === "vendor") {
            const isAlreadyAssigned = existingUser.assignedProjects.some(
              (p) => p.projectId.toString() === projectId
            );
            if (!isAlreadyAssigned) {
              existingUser.assignedProjects.push({ projectId, status: "new" });
              await existingUser.save();
            }
          }

          // Save the token even for existing users
          const invitation = new Invitation({ email, role, projectId, token });
          await invitation.save();

          invitedUsers.push({ email, status: "existing-user" });
          await sendInviteEmail(email, role, projectId, token);
        } else {
          const invitation = new Invitation({ email, role, projectId, token });
          await invitation.save();
          invitedUsers.push({ email, status: "invited" });
          await sendInviteEmail(email, role, projectId, token);
        }
      } catch (error) {
        console.error(`Error processing invitation for ${email}:`, error);
        invitedUsers.push({ email, status: "error" });
      }
    }

    res.status(200).json({
      success: true,
      message: "Invitations processed successfully.",
      invitedUsers,
    });
  } catch (error) {
    console.error("Error inviting team members:", error);
    res.status(500).json({ success: false, message: "Failed to invite team members." });
  }
});








// 📩 Send Invitation Email Function
async function sendInviteEmail(email, role, projectId, token) {
  const loginURL =
    role === "project-manager"
      ? `${process.env.BASE_URL}/project-manager-auth.html`
      : `${process.env.BASE_URL}/sign-inpage.html`;

  // Set the activation URL with the token
  const activationURL = `${process.env.BASE_URL}/sign-inpage.html?email=${encodeURIComponent(
    email
  )}&projectId=${encodeURIComponent(projectId)}&role=${encodeURIComponent(
    role
  )}&token=${encodeURIComponent(token)}`;

  const mailOptions = {
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Project Invitation",
    html: `
      <h3>You're Invited to a Project</h3>
      <p>Hello,</p>
      <p>You have been invited as a <strong>${role}</strong> for project <strong>${projectId}</strong>.</p>
      <p>Click below to activate your account:</p>
      <a href="${activationURL}" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">Activate Account</a>
      <p>If you were not expecting this, please ignore this email.</p>
      <p>Best Regards,</p>
      <p><strong>BESF Team</strong></p>
    `,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log(`✅ Invitation email sent to ${email}! Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending invitation email:`, error);
    return false;
  }
}

// Serve the activation page
app.get('/sign-inpage.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'sign-inpage.html'), (err) => {
    if (err) {
      console.error('Error serving sign-inpage.html:', err);
      res.status(500).send('Failed to load the activation page.');
    }
  });
});



app.post("/api/invite/accept", async (req, res) => {
  console.log("Request body:", req.body);

  const { token, name, password } = req.body;

  if (!token || !name || !password) {
    console.log("Missing required fields:", { token, name, password });
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    // Find invitation
    const invitation = await Invitation.findOne({ token });
    if (!invitation) {
      console.log("Invalid or expired token:", token);
      return res.status(404).json({ success: false, message: "Invalid or expired token." });
    }

    // Validate projectId
    const projectExists = await Project.findById(invitation.projectId);
    if (!projectExists) {
      console.log("Invalid project ID:", invitation.projectId);
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    // Hash the password only once
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed Password During Invite Acceptance:", hashedPassword);

    // Save user based on role
    if (invitation.role === "vendor") {
      const newVendor = new Vendor({
        name,
        email: invitation.email.toLowerCase(),
        password: hashedPassword, // Ensure this is the correct hash
        assignedProjects: [{ projectId: invitation.projectId, status: "new" }],
      });
      await newVendor.save();
    } else if (invitation.role === "project-manager") {
      const newManager = new Manager({
        name,
        email: invitation.email.toLowerCase(),
        password: hashedPassword, // Ensure this is the correct hash
        assignedProjects: [{ projectId: invitation.projectId }],
      });
      await newManager.save();
    } else {
      console.log("Invalid role:", invitation.role);
      return res.status(400).json({ success: false, message: "Invalid role specified." });
    }

    // Remove invitation
    await Invitation.deleteOne({ token });

    console.log("Account activated successfully:", { role: invitation.role });
    res.status(200).json({ success: true, message: "Account activated successfully.", role: invitation.role });
  } catch (error) {
    console.error("Error in /api/invite/accept:", error);
    res.status(500).json({ success: false, message: "Failed to activate account." });
  }
});


// ✅ Get Assigned Vendors for a Project
app.get("/api/projects/:projectId/vendors", async (req, res) => {
  try {
    const { projectId } = req.params;

    // Ensure projectId is a valid ObjectId if using MongoDB
    if (!projectId) {
      return res.status(400).json({ success: false, message: "Project ID is required." });
    }

    // Find vendors assigned to this project
    const vendors = await Vendor.find({ "assignedProjects.projectId": projectId })
      .select("name email phone assignedProjects")
      .lean(); // Optimize query

    res.status(200).json({ success: true, vendors: vendors || [] }); // Always return 200 with an array
  } catch (error) {
    console.error("❌ Error fetching vendors:", error);
    res.status(500).json({ success: false, message: "Failed to fetch vendors. Please try again." });
  }
});


// ✅ Remove Vendor from a Project
app.delete("/api/projects/:projectId/vendors/:vendorId", async (req, res) => {
  try {
    const { projectId, vendorId } = req.params;
    
    // Remove project from vendor's assignedProjects
    const vendor = await Vendor.findByIdAndUpdate(
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

// ✅ Edit Vendor Information

app.put("/api/vendors/:id", async (req, res) => {
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
    if (typeof Vendor !== "undefined") {
      const updatedVendor = await Vendor.findByIdAndUpdate(id, updateData, { 
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




// Endpoint to get the current project ID
app.get('/api/projects/current', async (req, res) => { 
  try {
      // Dynamically determine project ID based on user session or database query
      const projectId = req.session.currentProjectId || req.query.projectId; 

      if (!projectId) {
          return res.status(404).json({ message: "No active project found." });
      }

      res.status(200).json({ projectId });
  } catch (error) {
      console.error("Error fetching current project:", error);
      res.status(500).json({ message: "Failed to fetch project." });
  }
});



// Endpoint to fetch line items by project ID
app.get('/api/estimates/:projectId/line-items', async (req, res) => {
  try {
    const { projectId } = req.params;
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }
    const estimate = await Estimate.findOne({ projectId }).populate('lineItems.items.assignedTo');
    if (!estimate) {
      return res.status(404).json({ message: 'Estimate not found' });
    }
    res.json(estimate.lineItems);
  } catch (error) {
    console.error('Error fetching line items:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Endpoint to update a line item
app.put('/api/estimates/line-items/:lineItemId', async (req, res) => {
  try {
    const { lineItemId } = req.params;
    const updates = req.body;

    const estimate = await Estimate.findOneAndUpdate(
      { 'lineItems.items._id': lineItemId },
      {
        $set: {

          'lineItems.$[].items.$[item].status': updates.status,
          'lineItems.$[].items.$[item].startDate': updates.startDate, // ✅ Now supports startDate
          'lineItems.$[].items.$[item].endDate': updates.endDate // ✅ Now supports endDate
        }
      },
      {
        arrayFilters: [{ 'item._id': lineItemId }],
        new: true
      }
    );

    if (!estimate) {
      return res.status(404).json({ message: 'Line item not found' });
    }

    res.json({ message: 'Line item updated successfully', estimate });
  } catch (error) {
    console.error('Error updating line item:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});



// Debugging route to check server deployment status
app.get('/api/debug', (req, res) => {
  res.json({
    success: true,
    message: 'API is working on Render!',
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
  });
});






// Root Route
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// 404 Fallback Route
app.use((req, res) => {
  res.status(404).send('Page not found.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

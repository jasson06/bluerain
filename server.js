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
const JWT_SECRET = process.env.JWT_SECRET;


async function logDailyUpdate(projectId, text, author = "System") {
  try {
    const project = await Project.findById(projectId).select("name"); // Fetch actual project name
    
    const logUpdate = new DailyUpdate({
      projectId,
      projectName: project ? project.name : "Unknown Project", // ✅ Use actual name or fallback
      author,
      text,
      timestamp: new Date(),
    });

    await logUpdate.save(); // ✅ Save the update log
    console.log("✅ Daily Update Logged:", logUpdate);
  } catch (error) {
    console.error("❌ Error logging daily update:", error);
  }
}


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

// ✅ For email attachments (e.g., PDFs) — in-memory buffer
const memoryUpload = multer({ storage: multer.memoryStorage() });



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
      let projectId = null;
      let updateText = "";

      // ✅ Handle Task Photos (Stored in Task Collection)
      if (taskId) {
          const task = await Task.findById(taskId);
          if (!task) return res.status(404).json({ message: "Task not found." });

          if (!task.photos) task.photos = { before: [], after: [] };
          task.photos[type].push(...photoUrls);
          await task.save();

          projectId = task.projectId;
          updateText = `📸 ${photoUrls.length} photo(s) uploaded for task "${task.title}" (${type}).`;
          
          console.log(`✅ ${photoUrls.length} Photo(s) saved for Task: ${taskId} (${type})`);
          await logDailyUpdate(projectId, updateText);
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
              projectId = estimate.projectId;
              updateText = `📸 ${photoUrls.length} photo(s) uploaded for estimate item "${estimateItem.name}" (${type}).`;
              
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
                  projectId = vendorItem.projectId;
                  updateText = `📸 ${photoUrls.length} photo(s) uploaded for vendor item "${vendorItem.name}" (${type}).`;

                  console.log(`✅ ${photoUrls.length} Photo(s) saved for Vendor: ${vendorId}, Item: ${itemId} (${type})`);
              }
          }
      }

      // ✅ Save Estimate Changes After Vendor Upload
      if (updateSuccess && estimate) {
          await estimate.save();
          await logDailyUpdate(projectId, updateText);
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
  assignedTo: { type: mongoose.Schema.Types.ObjectId, refPath: 'assignedToModel', default: null },
  assignedToModel: { type: String, enum: ['Vendor', 'Manager'], default: null }, // No longer required
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
  address: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, required: true, trim: true },
});

const estimateSchema = new mongoose.Schema({ 
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  title: { type: String, default: '' },

  lineItems: [
    {
      type: {
        type: String,
        enum: ['category'],
        required: true
      },
      category: { type: String, required: true },

      // ✅ Expanded to support QC statuses
      status: { 
        type: String, 
        enum: ['in-progress', 'completed', 'approved', 'rework'], 
        default: 'in-progress' 
      },

      items: [
        {
          type: { type: String, enum: ['item'], default: 'item' },
          name: { type: String, required: true },
          description: { type: String },
          costCode: { type: String, default: 'Uncategorized' }, // ✅ Added Cost Code
          quantity: { type: Number, required: true, min: 1 },
          unitPrice: { type: Number, required: true, min: 0 },
          total: { type: Number, required: true },

          // ✅ Expanded here too
          status: { 
            type: String, 
            enum: ['in-progress', 'completed', 'approved', 'rework'], 
            default: 'in-progress' 
          },

          qualityControl: {
            status: {
              type: String,
              enum: ["pending", "approved", "rework"],
              default: "pending"
            },
            notes: String,
            reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
            reviewedAt: Date
          },

          assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            default: null
          },

          photos: {
            before: [{ type: String }],
            after: [{ type: String }]
          },

          startDate: { type: Date, default: null },
          endDate: { type: Date, default: null }
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
      itemId: { type: String, required: true }, 
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
      estimateId: { type: mongoose.Schema.Types.ObjectId, ref: "Estimate" },
      costCode: { type: String, default: "Uncategorized" },
      name: { type: String, required: true },
      description: { type: String, default: "No description provided" },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true },
      status: { type: String, enum: ["new", "in-progress", "completed", "approved", "rework"], default: "new" },
      photos: {
        before: [{ type: String }],
        after: [{ type: String }],
      },

        // ✅ Quality Control Section
    qualityControl: {
      status: {
        type: String,
        enum: ["pending", "approved", "rework"],
        default: "pending"
      },
      notes: { type: String },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Manager" },
      reviewedAt: { type: Date }
    },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    }
  ],

  assignedProjects: [
    {
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
      status: { type: String, enum: ["new", "in-progress", "completed", "rework"], default: "new" },
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
  projectId: { type: mongoose.Schema.Types.ObjectId, required: false, ref: "Project" },
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


const selectionBoardSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  room: { type: String, required: true },
  selections: [
    {
      name: { type: String, required: true },
      description: { type: String, required: true },
      price: { type: Number, required: true },
      link: { type: String, required: true },
      photo: { type: String }  // Optionally store product photo.
    }
  ]
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  link: { type: String, required: true },
  photo: { type: String }  // Stores the extracted photo URL.
}, { timestamps: true });


// ✅ Ensure DailyUpdate model is defined
const DailyUpdateSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  projectName: { type: String, required: true },
  author: { type: String, required: true },
  text: { type: String, required: true },
  images: [{ type: String }],
  timestamp: { type: Date, default: Date.now }
});

const invoiceSchema = new mongoose.Schema({
  projectId: String,
  vendorId: String,
  email: String,
  header: {
    companyName: String,
    street: String,
    city: String,
    phoneFax: String
  },
  recipient: {
    name: String,
    company: String,
    street: String,
    city: String,
    phone: String
  },
  invoiceNumber: String,
  date: String,
  lineItems: [
    {
      name: String,
      description: String,
      quantity: Number,
      unitPrice: Number,
      costCode: String
    }
  ],
  total: Number,
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Overdue'],
    default: 'Pending'
  },
  createdAt: { type: Date, default: Date.now }
});

const quoteSchema = new mongoose.Schema({
  from: {
    name: String,
    address: String,
    email: String,
    phone: String,
    license: { type: String, default: "RBC-2400049" } // ✅ Added license field
  },
  to: {
    name: String,
    address: String,
    email: String,
    phone: String
  },
  quoteNumber: String,
  date: Date,
  validTill: Date,
  notes: String,
  lineItems: [{
    costCode: String, // ✅ Added costCode field
    name: String,
    description: String,
    rate: Number,
    qty: Number
  }],
  totals: {
    subtotal: Number,
    discount: Number,
    tax: Number,
    total: Number
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Approved'],
    default: 'Draft'
  }
}, { timestamps: true });

const laborCostSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  rate: { type: Number, required: true },
  costCode: { type: String } // ✅ NEW FIELD
}, { timestamps: true });


const fileSchema = new mongoose.Schema({
  name: String,
  size: String,
  type: String,
  modified: String,
  url: String
});

const folderSchema = new mongoose.Schema({
  name: String,
  position: Number,
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  files: [fileSchema]
});

const expenseSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  item: {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: String,
    costCode: String
  },
  vendor: String,
  category: String,
  description: String,
  amount: { type: Number, required: true },
  date: { type: String, required: true }
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);
const Comment = mongoose.model("Comment", commentSchema);
const Client = mongoose.model('Client', clientSchema);
const Estimate = mongoose.model("Estimate", estimateSchema);
const Vendor = mongoose.model('Vendor', vendorSchema);
const Project = mongoose.model('Project', projectSchema);
const Manager = mongoose.model('Manager', managerSchema);
const Invitation = mongoose.model("Invitation", invitationSchema);
const SelectionBoard = mongoose.model('SelectionBoard', selectionBoardSchema);
const Product = mongoose.model('Product', productSchema);
const DailyUpdate = mongoose.model("DailyUpdate", DailyUpdateSchema);
const Invoice = mongoose.model('Invoice', invoiceSchema);
const Quote = mongoose.model('Quote', quoteSchema);
const LaborCost = mongoose.model('LaborCost', laborCostSchema);
const FileSystem = mongoose.model('FileSystem', folderSchema);
const Folder = mongoose.model('Folder', folderSchema); // ✅ Add this line
const Expense = mongoose.model('Expense', expenseSchema);


module.exports = {
  Task,
  Comment,
  Client,
  Estimate,
  Vendor,
  Project,
  Manager,
  Invitation,
  Quote,
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

// GET /api/clients - Get all clients
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Client.find().sort({ name: 1 }); // optional sort by name
    res.json(clients);
  } catch (err) {
    console.error('Error fetching clients:', err);
    res.status(500).json({ error: 'Server error while fetching clients' });
  }
});

// Add Estimate
// Add a new estimate to a project
app.post('/api/estimates', async (req, res) => { 
  try {
    console.log('Request Body:', req.body);

    const { projectId, lineItems, tax, title } = req.body;

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
            costCode: item.costCode || 'Uncategorized', // ✅ Add cost code
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
      title: title || '', 
      lineItems: structuredLineItems,
      total,
      tax
    });

    await newEstimate.save();

 // ✅ Log the estimate creation in daily logs
 await logDailyUpdate(
  projectId,
  `A new estimate (${invoiceNumber}) was created${title ? `: "${title}"` : ""}.`
);

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

    // Defensive: Ensure title is a string
    if (typeof updatesPayload.title !== "string") {
      updatesPayload.title = "";
    }

    // Normalize status helper
    function normalizeStatus(status) {
      if (typeof status !== "string") return status;
      status = status.trim();
      if (status.toLowerCase() === "not started") return "in-progress";
      return status.toLowerCase().replace(/\s+/g, "-");
    }

    // Fetch the existing document
    const existingEstimate = await Estimate.findById(estimateId);
    if (!existingEstimate) {
      return res.status(404).json({ message: "Estimate not found" });
    }

    // Create a map of existing items by their _id
    const existingItemsMap = new Map();
    existingEstimate.lineItems.forEach((lineItem) => {
      lineItem.items.forEach((item) => {
        existingItemsMap.set(item._id.toString(), item);
      });
    });

    // Merge new items with existing data
    updatesPayload.lineItems.forEach((lineItem) => {
      lineItem.items.forEach((item) => {
        if (item.status && item.status.trim() !== "") {
          item.status = normalizeStatus(item.status);
        }

        if (item._id && existingItemsMap.has(item._id.toString())) {
          const existingItem = existingItemsMap.get(item._id.toString());

          // Preserve fields
          item.photos = existingItem.photos ?? { before: [], after: [] };
          item.assignedTo = existingItem.assignedTo ?? null;
          item.startDate = item.startDate ?? existingItem.startDate;
          item.endDate = item.endDate ?? existingItem.endDate;
          item.status = item.status || normalizeStatus(existingItem.status);
          item.costCode = item.costCode || existingItem.costCode || "Uncategorized"; // ✅ Preserve cost code
        } else {
          // For new items
          if (!item.status || item.status.trim() === "") {
            item.status = "in-progress";
          }
          item.costCode = item.costCode || "Uncategorized"; // ✅ Default for new items
        }
      });
    });

    // ✅ Recalculate the estimate total
    let newTotal = 0;
    updatesPayload.lineItems.forEach((lineItem) => {
      lineItem.items.forEach((item) => {
        newTotal += (item.quantity || 1) * (item.unitPrice || 0);
      });
    });

    // Update the document
    const updatedEstimate = await Estimate.findByIdAndUpdate(
      estimateId,
      {
        $set: { ...updatesPayload, total: newTotal }
      },
      { new: true, runValidators: true }
    );

    // ✅ Log the update
    await logDailyUpdate(
      updatedEstimate.projectId,
      `Estimate ${updatedEstimate.invoiceNumber} was updated${updatedEstimate.title ? `: "${updatedEstimate.title}"` : ""}.`
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





// Add Vendor
app.post('/api/add-vendor', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: "Name and email are required." });
    }

    const existing = await Vendor.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Vendor already exists with this email." });
    }

    const newVendor = new Vendor({ name, email, phone });
    await newVendor.save();

    // Create an invite token (no project)
    const token = crypto.randomBytes(32).toString("hex");
    const invite = new Invitation({ email, role: "vendor", token });
    await invite.save();

    // Send activation email
    await sendNewUserInviteEmail(email, "vendor", null, token);

    res.status(201).json({
      success: true,
      message: 'Vendor added and invited successfully',
      vendor: newVendor
    });
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
app.delete("/api/vendors/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid vendor ID." });
  }

  try {
    const deletedVendor = await Vendor.findByIdAndDelete(id);

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



app.get('/api/managers', async (req, res) => {
  try {
    const managers = await Manager.find(); // Fetch all managers from the database
    res.status(200).json(managers); // Send managers as a response
  } catch (error) {
    console.error('Error fetching managers:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch managers' });
  }
});




app.get('/api/managers/:id', async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid manager ID.' });
  }

  try {
    const manager = await Manager.findById(id);
    if (!manager) {
      return res.status(404).json({ error: 'Manager not found.' });
    }

    res.status(200).json(manager);
  } catch (error) {
    console.error('Error fetching manager:', error.message);
    res.status(500).json({ error: 'Failed to fetch manager.' });
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

 


///==================///
      // Add Project
app.post('/api/add-project', async (req, res) => {
  try {
    const payload = req.body;

    // ✅ Default status if not provided
    if (!payload.status) {
      payload.status = "Upcoming";
    }

    // ✅ Create and save the new project
    const newProject = new Project(payload);
    const savedProject = await newProject.save();

    // ✅ Log the project creation in daily logs
    await logDailyUpdate(savedProject._id, `Project "${savedProject.name}" was created.`);

    res.json({ success: true, project: savedProject });
  } catch (error) {
    console.error('Error adding project:', error);
    res.status(500).json({ success: false, error: 'Failed to add project' });
  }
});



// Get All Projects
// Get All Projects (Exclude "open" and "on-hold")
app.get('/api/projects', async (req, res) => {
  try {
    // ✅ Fetch only projects that are NOT "open" or "on-hold"
    const projects = await Project.find({
      status: { $nin: ["Upcoming", "On Market", "completed"] } // $nin = Not In
    });

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

        // ✅ Log the project update in daily logs
        await logDailyUpdate(id, `Project "${name}" was updated.`);
      
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
    // Fetch tasks first, then determine the correct population
    const tasks = await Task.find({ projectId });

    // Populate assignedTo based on assignedToModel
    for (let task of tasks) {
      if (task.assignedTo) {
        if (task.assignedToModel === 'Vendor') {
          task.assignedTo = await Vendor.findById(task.assignedTo).select('name');
        } else if (task.assignedToModel === 'Manager') {
          task.assignedTo = await Manager.findById(task.assignedTo).select('name');
        }
      }
    }

    console.log("✅ Retrieved Tasks with Correct Population:", tasks);

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
    let task = await Task.findById(id).select('title description dueDate completed assignedTo photos comments assignedToModel projectId');

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // ✅ Populate assignedTo with Email
    if (task.assignedTo) {
      if (task.assignedToModel === 'Vendor') {
        task.assignedTo = await Vendor.findById(task.assignedTo).select('name email');
      } else if (task.assignedToModel === 'Manager') {
        task.assignedTo = await Manager.findById(task.assignedTo).select('name email');
      }
    }

    console.log("✅ Task Details Retrieved with Email:", task);

    res.status(200).json({
      success: true,
      task: {
        id: task._id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        completed: task.completed,
        assignedTo: task.assignedTo, // ✅ Ensures email is included
        assignedToModel: task.assignedToModel,               
        photos: task.photos,
        comments: task.comments || [], // Include comments in the response
        projectId: task.projectId
      },
    });
  } catch (error) {
    console.error('❌ Error fetching task:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task details' });
  }
});


app.put('/api/task/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { assignedTo } = req.body;

  try {
    const task = await Task.findByIdAndUpdate(id, { assignedTo }, { new: true });

    // Ensure that the assigned user exists and has an email
    let assignedUser = null;
    if (task.assignedToModel === 'Vendor') {
      assignedUser = await Vendor.findById(assignedTo).select('email');
    } else if (task.assignedToModel === 'Manager') {
      assignedUser = await Manager.findById(assignedTo).select('email');
    }

    if (!assignedUser || !assignedUser.email) {
      return res.status(400).json({ success: false, message: "Invalid assignee or missing email." });
    }

    await sendTaskAssignmentEmail(id);
    res.json({ success: true, message: 'Task assigned and notification sent.', task });
  } catch (error) {
    console.error("❌ Error assigning task:", error);
    res.status(500).json({ success: false, message: 'Failed to assign task.' });
  }
});






// Create Task (Backend)
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, dueDate, completed, assignedTo, projectId } = req.body;

    // Validate required fields
    if (!title || !projectId) {
      return res.status(400).json({ success: false, error: 'Title and Project ID are required.' });
    }

    let assignedToModel = null;

    // Only set assignedToModel if assignedTo is provided
    if (assignedTo) {
      const vendor = await Vendor.findById(assignedTo);
      if (vendor) {
        assignedToModel = 'Vendor';
      } else {
        const manager = await Manager.findById(assignedTo);
        if (manager) {
          assignedToModel = 'Manager';
        }
      }

      // If assignedTo is provided but does not match a valid user, return an error
      if (!assignedToModel) {
        return res.status(400).json({ success: false, error: 'Invalid assignee ID' });
      }
    }

    // Create new task (assignedTo & assignedToModel are optional)
    const newTask = new Task({
      title,
      description,
      dueDate,
      completed: completed || false,
      assignedTo: assignedTo || null, // Will remain null if not provided
      assignedToModel: assignedToModel || null, // Will remain null if not provided
      projectId,
      photos: { before: [], after: [] },
      comments: [],
    });

    // Save task to database
    await newTask.save();

        // ✅ Log the new task creation in daily logs
    await logDailyUpdate(projectId, `New task "${title}" was created.`);

    console.log("✅ New Task Created:", newTask);
    res.status(201).json({ success: true, task: newTask });

  } catch (error) {
    console.error('Error adding task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add task' });
  }
});

// Delete Task Endpoint
app.delete('/api/task/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if task exists before attempting deletion
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    // Delete task
    await Task.findByIdAndDelete(id);
   
    // ✅ Log the deletion in daily updates
    await logDailyUpdate(task.projectId, `Task "${task.title}" was deleted.`, "System");


    console.log(`✅ Task ${id} deleted successfully.`);
    res.json({ success: true, message: 'Task deleted successfully.' });

  } catch (error) {
    console.error('Error deleting task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete task.' });
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



// ✅ Add a new comment to a task and log it
app.post('/api/comments', async (req, res) => {
  const { taskId, comment, managerName, timestamp } = req.body;

  if (!taskId || !comment || !managerName || !timestamp) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    // ✅ Fetch the task to get project details
    const task = await Task.findById(taskId).select("title projectId");
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    // ✅ Save the new comment
    const newComment = new Comment({
      taskId,
      text: comment,
      managerName,
      timestamp,
    });

    await newComment.save();

    // ✅ Log the comment in daily updates
    await logDailyUpdate(task.projectId, `New comment on task "${task.title}": "${comment}"`, managerName);

    console.log(`✅ Comment added to task "${task.title}".`);
    res.status(201).json({ message: "Comment added successfully.", comment: newComment });

  } catch (error) {
    console.error("❌ Error saving comment:", error);
    res.status(500).json({ message: "Failed to save comment." });
  }
});




// Update Task Endpoint with Strict Role Detection
app.put('/api/task/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, dueDate, completed, assignedTo } = req.body;

  try {
    const updateFields = {};

    // Dynamically add fields to update if provided
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (dueDate) updateFields.dueDate = dueDate;
    if (typeof completed !== 'undefined') updateFields.completed = completed;

    let assignedToModel = null;

    // Check if assignedTo exists
    if (assignedTo) {
      console.log("Checking Vendor First...");
      const vendor = await Vendor.findById(assignedTo);
      
      if (vendor) {
        assignedToModel = 'Vendor';
        console.log("✅ Assigned to Vendor:", vendor.name);
      } else {
        console.log("Checking Manager...");
        const manager = await Manager.findById(assignedTo);
        
        if (manager) {
          assignedToModel = 'Manager';
          console.log("✅ Assigned to Manager:", manager.name);
        }
      }

      if (!assignedToModel) {
        console.log("❌ Invalid Assignee ID:", assignedTo);
        return res.status(400).json({ success: false, error: 'Invalid assignee ID' });
      }

      // Add assignedTo and assignedToModel to updateFields
      updateFields.assignedTo = assignedTo;
      updateFields.assignedToModel = assignedToModel;
    }

    console.log("Final AssignedToModel Before Update:", assignedToModel);

    // Update task and enforce correct role
    const task = await Task.findByIdAndUpdate(
      id, 
      { $set: updateFields },  // Explicitly setting the update fields
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    console.log("Updated Task:", task);

        // ✅ Log the Update in Daily Updates
        await logDailyUpdate(task.projectId, `Task "${task.title}" was updated.`);


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
    // ✅ Find Vendor
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    // ✅ Find the assigned item
    const item = vendor.assignedItems.find(item => item.itemId.toString() === itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    // ✅ Find the project
    const project = await Project.findById(item.projectId).select("name");
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // ✅ Update status in Vendor assignedItems
    item.status = status;
    await vendor.save();
    console.log("✅ Vendor Item Status Updated Successfully:", item);

    // ✅ Update the corresponding item status in the Estimate
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

    // ✅ Log the status update in Daily Updates
    await logDailyUpdate(
      item.projectId,
      `Item "${item.name}" status updated to "${status}" by Vendor "${vendor.name}" for Project "${project.name}".`
    );

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
    const rework = vendor.assignedProjects.filter(proj => proj.status === 'rework');
    const completed = vendor.assignedProjects.filter(proj => proj.status === 'completed');

    res.status(200).json({ success: true, newJobs, inProgress, rework, completed });
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

      // ✅ Find vendor
      const vendor = await Vendor.findById(vendorId);
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
      const project = await Project.findById(projectId).select("name");
      const projectName = project ? project.name : "Unknown Project";

      // ✅ Log project status update in daily updates
      await logDailyUpdate(
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


app.post('/api/vendors/:vendorId/assign-item', async (req, res) => {
  const { vendorId } = req.params;
  const { projectId, itemId, name, description, quantity, unitPrice, total } = req.body;

  try {
    // ✅ Find Vendor
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    // ✅ Find Project for Logging
    const project = await Project.findById(projectId).select("name");
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
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

    // ✅ Log the assignment in Daily Updates
    await logDailyUpdate(
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
 





app.post("/api/assign-items", async (req, res) => {
  const { vendorId, projectId, estimateId, items } = req.body;

  if (!vendorId || !projectId || !estimateId || !items || items.length === 0) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // ✅ Find Vendor, Estimate, Project
    const vendor = await Vendor.findById(vendorId);
    const estimate = await Estimate.findById(estimateId);
    const project = await Project.findById(projectId).select("name");

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
        vendorItem.costCode = costCode; // ✅ Update costCode too
        vendorItem.photos.before = [...(estimateItem.photos?.before || [])];
        vendorItem.photos.after = [...(estimateItem.photos?.after || [])];
      }

      updatedAssignedItems.push(vendorItem);

      // ✅ Log the assignment
      await logDailyUpdate(
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

    console.log("✅ Items assigned successfully with cost codes!");

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

  // ✅ Log the file upload in daily updates
  const fileNames = files.map(f => f.filename).join(", ");
  await logDailyUpdate(projectId, `Files uploaded: ${fileNames}`);

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


// DELETE Route for File Deletion (Local Environment)
app.delete('/api/projects/:projectId/files/:fileId', async (req, res) => {
  const { projectId, fileId } = req.params;

  try {
    const project = await Project.findById(projectId);

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
    const absolutePath = path.join(__dirname, filePath);

    console.log(`Resolved file path for deletion: ${absolutePath}`);

    // Attempt to delete the file from the filesystem
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log(`File deleted from server: ${absolutePath}`);
      } else {
        console.warn(`File not found on server: ${absolutePath}`);
      }
    } catch (fsError) {
      console.error('Error deleting file from filesystem:', fsError);
      return res.status(500).json({ error: 'Error deleting file from server' });
    }

    // Remove the file entry from the project document
    await Project.findByIdAndUpdate(
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

// 📌 API: Invite Team Members (Vendors or Project Managers)
app.post("/api/invite", async (req, res) => {
  try {
    const { emails, role, projectId } = req.body;

    if (!Array.isArray(emails) || emails.length === 0 || !role) {
      return res.status(400).json({
        success: false,
        message: "Emails and role are required."
      });
    }

    const invitedUsers = [];

    for (const email of emails) {
      let existingUser =
        role === "vendor"
          ? await Vendor.findOne({ email })
          : await Manager.findOne({ email });

      if (existingUser) {
        if (projectId && role === "vendor") {
          const isAlreadyAssigned = existingUser.assignedProjects?.some(
            (p) => p.projectId.toString() === projectId
          );

          if (!isAlreadyAssigned) {
            existingUser.assignedProjects = existingUser.assignedProjects || [];
            existingUser.assignedProjects.push({ projectId, status: "new" });
            await existingUser.save();
          }
        }

        invitedUsers.push({ email, status: "existing-user" });
        await sendExistingUserEmail(email, role, projectId); // projectId may be null
      } else {
        const token = crypto.randomBytes(32).toString("hex");
        const invitation = new Invitation({ email, role, projectId, token });
        await invitation.save();

        invitedUsers.push({ email, status: "invited" });
        await sendNewUserInviteEmail(email, role, projectId, token); // projectId may be null
      }
    }

    res.status(200).json({
      success: true,
      message: "Invitations processed successfully.",
      invitedUsers
    });
  } catch (error) {
    console.error("Error inviting team members:", error);
    res.status(500).json({
      success: false,
      message: "Failed to invite team members."
    });
  }
});


// 📩 Send Email for Existing Users
async function sendExistingUserEmail(email, role, projectId) {
  const signInURL =
    role === "project-manager"
      ? `${process.env.BASE_URL}/project-manager-auth.html`
      : `${process.env.BASE_URL}/sign-inpage.html`;

  const mailOptions = {
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Project Assignment Notification",
    html: `
      <h3>You've Been Invited</h3>
      <p>Hello,</p>
      <p>You have been invited as a <strong>${role}</strong>${
        projectId ? ` for project <strong>${projectId}</strong>` : ""
      }.</p>
      <p>You can sign in to access your dashboard:</p>
      <a href="${signInURL}" style="padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">Sign In</a>
      <p>Best Regards,<br/><strong>BESF Team</strong></p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Notification email sent to ${email} (existing user). ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending existing user email:`, error);
    return false;
  }
}


// 📩 Send Invitation Email for New Users
async function sendNewUserInviteEmail(email, role, projectId, token) {
  const activationURL = `${process.env.BASE_URL}/sign-inpage.html?email=${encodeURIComponent(
    email
  )}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}${
    projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""
  }`;

  const mailOptions = {
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "You're Invited to Join BESF",
    html: `
      <h3>Welcome to BESF</h3>
      <p>Hello,</p>
      <p>You have been invited as a <strong>${role}</strong>${
        projectId ? ` for project <strong>${projectId}</strong>` : ""
      }.</p>
      <p>Click the button below to activate your account:</p>
      <a href="${activationURL}" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">Activate Account</a>
      <p>If you didn’t request this, please ignore the email.</p>
      <p>Best Regards,<br/><strong>BESF Team</strong></p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Invitation email sent to new user ${email}. ID: ${info.messageId}`);
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



// POST /api/invite/accept

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

    // Hash the password once
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed password:", hashedPassword);

    const userEmail = invitation.email.toLowerCase();

    // Check if user already exists
    if (invitation.role === "vendor") {
      let existingVendor = await Vendor.findOne({ email: userEmail });

      if (existingVendor) {
        // Update existing vendor's password and name if missing
        if (!existingVendor.password) {
          existingVendor.password = hashedPassword;
          existingVendor.name = name;
        }

        // Add assigned project only if it exists and is not already assigned
        if (invitation.projectId) {
          const alreadyAssigned = existingVendor.assignedProjects?.some(
            p => p.projectId.toString() === invitation.projectId.toString()
          );
          if (!alreadyAssigned) {
            existingVendor.assignedProjects.push({ projectId: invitation.projectId, status: "new" });
          }
        }

        await existingVendor.save();
      } else {
        // New vendor
        const newVendor = new Vendor({
          name,
          email: userEmail,
          password: hashedPassword,
          assignedProjects: invitation.projectId ? [{ projectId: invitation.projectId, status: "new" }] : []
        });
        await newVendor.save();
      }
    } else if (invitation.role === "project-manager") {
      let existingManager = await Manager.findOne({ email: userEmail });

      if (existingManager) {
        if (!existingManager.password) {
          existingManager.password = hashedPassword;
          existingManager.name = name;
        }
        if (invitation.projectId) {
          const alreadyAssigned = existingManager.assignedProjects?.some(
            p => p.projectId.toString() === invitation.projectId.toString()
          );
          if (!alreadyAssigned) {
            existingManager.assignedProjects.push({ projectId: invitation.projectId });
          }
        }
        await existingManager.save();
      } else {
        const newManager = new Manager({
          name,
          email: userEmail,
          password: hashedPassword,
          assignedProjects: invitation.projectId ? [{ projectId: invitation.projectId }] : []
        });
        await newManager.save();
      }
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


// ✅ API to Send Task Assignment Email
app.post('/api/send-email', async (req, res) => {
  const { to, subject, text } = req.body;

  if (!to || !subject || !text) {
      console.error("❌ Missing email parameters:", { to, subject, text });
      return res.status(400).json({ success: false, message: "Missing email parameters" });
  }

  try {
      await transporter.sendMail({
          from: `"BESF Team" <${process.env.EMAIL_USER}>`,
          to,
          subject,
          text,
      });

      console.log(`✅ Email Sent to ${to}: ${subject}`);
      res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
      console.error("❌ Error sending email:", error);
      res.status(500).json({ success: false, message: "Failed to send email" });
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

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }

    const estimates = await Estimate.find({ projectId }).populate('lineItems.items.assignedTo');

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

// Endpoint to update a line item
app.put('/api/estimates/line-items/:lineItemId', async (req, res) => {
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
    const estimate = await Estimate.findOneAndUpdate(
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

    // ✅ Log line item update in daily updates
    await logDailyUpdate(
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


// ──────────────────────────────────────────────
// Products API Endpoints
// ──────────────────────────────────────────────



// GET /api/products - Return all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/products - Add a new product
app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, link, photo } = req.body;
    if (!name || !description || !price || !link) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const newProduct = new Product({ name, description, price, link, photo });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});





// Endpoint to create or update a selection board
app.post('/api/selection-board', async (req, res) => {
  try {
    const { projectId, room, selections } = req.body;
    if (!projectId || !room || !selections || !Array.isArray(selections)) {
      return res.status(400).json({ message: "projectId, room, and selections (as an array) are required." });
    }
    
    // Ensure each selection object has a photo property.
    const sanitizedSelections = selections.map(s => ({
      name: s.name,
      description: s.description,
      price: s.price,
      link: s.link,
      photo: s.photo || ""
    }));
    
    // Check if a selection board already exists for this project and room.
    let board = await SelectionBoard.findOne({ projectId, room });
    if (board) {
      board.selections = sanitizedSelections;
      // If you're using Mongoose timestamps, updatedAt is handled automatically.
      await board.save();
      return res.status(200).json({  board });
    } else {
      board = new SelectionBoard({ projectId, room, selections: sanitizedSelections });
      await board.save();
      return res.status(201).json({ message: "Selection board created successfully", board });
    }
  } catch (error) {
    console.error("Error saving selection board:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// GET /api/selection-boards?projectId=...
app.get('/api/selection-boards', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const boards = await SelectionBoard.find({ projectId });
    // Instead of a 404, return an empty array if none found:
    res.status(200).json(boards);
  } catch (error) {
    console.error("Error fetching selection boards:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});




// --------------------- Endpoint: Proxy for External URL --------------------- //
app.get('/api/product-details', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    // Replace 'YOUR_API_KEY' with your actual Microlink API key or set it in an environment variable.
    const apiKey = process.env.MICROLINK_API_KEY || 'YOUR_API_KEY';
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&api_key=${apiKey}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return res.status(500).json({ error: 'Error fetching data from Microlink' });
    }
    const data = await response.json();
    // Microlink returns data under a "data" key
    res.json(data.data);
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/:id – Delete a product by ID.
app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const deletedProduct = await Product.findByIdAndDelete(productId);
    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({ message: "Product deleted successfully", product: deletedProduct });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Get all upcoming and on-hold projects
app.get("/api/upcoming-projects", async (req, res) => {
  try {
    // ✅ Fetch projects that have "upcoming" or "on hold" status
    const projects = await Project.find({
      status: { $in: ["Upcoming", "on-hold", "Open"] } // Matches either "upcoming" or "on hold"
    });

    res.status(200).json({ success: true, projects }); // ✅ Corrected variable name
  } catch (error) {
    console.error("Error fetching upcoming projects:", error);
    res.status(500).json({ success: false, message: "Failed to fetch upcoming projects." });
  }
});


// ✅ Get all "On Market" projects
app.get("/api/on-market-projects", async (req, res) => {
  try {
    const projects = await Project.find({ status: "On Market" });

    res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error("Error fetching 'On Market' projects:", error);
    res.status(500).json({ success: false, message: "Failed to fetch 'On Market' projects." });
  }
});


// ✅ API Endpoint to Fetch Completed Projects
app.get('/api/completed-projects', async (req, res) => {
  try {
      // Fetch only projects with status "completed"
      const completedProjects = await Project.find({ status: "completed" });

      res.status(200).json({ success: true, projects: completedProjects });
  } catch (error) {
      console.error('❌ Error fetching completed projects:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch completed projects.' });
  }
});


// ✅ GET /api/daily-updates → Fetch all daily updates (Filtered by Date)
app.get("/api/daily-updates", async (req, res) => {
  try {
      let { date } = req.query;

      if (!date) {
          return res.status(400).json({ success: false, message: "Date is required." });
      }

      // ✅ Convert to Date Object & Extract YYYY-MM-DD
      let selectedDate = new Date(date);
      let selectedDateISO = selectedDate.toISOString().split("T")[0]; // Extract YYYY-MM-DD

      console.log(`📅 Fetching updates for strict date: ${selectedDateISO}`);

      // ✅ Query for documents where the timestamp's date matches selectedDateISO
      const updates = await DailyUpdate.find({
          timestamp: { 
              $gte: new Date(`${selectedDateISO}T00:00:00.000Z`), 
              $lte: new Date(`${selectedDateISO}T23:59:59.999Z`)
          }
      }).sort({ timestamp: -1 });

      if (updates.length === 0) {
          return res.json({ success: true, message: "No updates found for this date.", updates: [] });
      }

      res.json({ success: true, updates });

  } catch (error) {
      console.error("❌ Error fetching daily updates:", error);
      res.status(500).json({ success: false, message: "Failed to fetch daily updates." });
  }
});

// ✅ POST /api/daily-updates → Add a new update (WITH Manager ID)
app.post("/api/daily-updates", async (req, res) => {
  try {
      const { projectId, text, images, managerId } = req.body;

      // ✅ Ensure required fields exist
      if (!projectId || !text || !managerId) {
          return res.status(400).json({ success: false, message: "Missing required fields (Project ID, Text, Manager ID)." });
      }

      // ✅ Validate Manager ID
      const manager = await Manager.findById(managerId).select("name");
      if (!manager) {
          return res.status(404).json({ success: false, message: "Invalid Manager ID." });
      }

      // ✅ Fetch Project Name from Database
      const project = await Project.findById(projectId).select("name"); // Only fetch name field
      if (!project) {
          return res.status(404).json({ success: false, message: "Project not found." });
      }

      // ✅ Create New Daily Update Entry
      const newUpdate = new DailyUpdate({
          projectId,
          projectName: project.name,  // ✅ Store project name directly
          author: manager.name,  // ✅ Store the actual Manager's name
          text,
          images: images || [],
          timestamp: new Date(),
      });

      await newUpdate.save();

      console.log(`✅ New daily update added by Manager: ${manager.name}`);

      res.json({ success: true, message: "Update added successfully!", update: newUpdate });

  } catch (error) {
      console.error("❌ Error adding daily update:", error);
      res.status(500).json({ success: false, message: "Failed to add daily update." });
  }
});

// Create a new invoice
app.post('/api/create', async (req, res) => {
  try {
    const {
      projectId,
      email,
      invoiceNumber,
      date,
      lineItems,
      total,
      from,
      to,
      vendorId // ✅ expecting this from frontend (set it in the body or headers)
    } = req.body;

    if (!projectId || !invoiceNumber || !lineItems?.length) {
      return res.status(400).json({ message: 'Missing required invoice fields.' });
    }

    const invoice = new Invoice({
      vendorId: vendorId ? new mongoose.Types.ObjectId(vendorId) : undefined,
      projectId: new mongoose.Types.ObjectId(projectId),
      email,
      invoiceNumber,
      date,
      from,
      to,
      lineItems,
      total
    });

    const savedInvoice = await invoice.save();
    res.status(201).json(savedInvoice);
  } catch (err) {
    console.error('❌ Error saving invoice:', err);
    res.status(500).json({ message: 'Failed to create invoice', error: err.message });
  }
});


// ✅ GET invoices filtered by projectId WITH project name
app.get('/api/invoices', async (req, res) => {
  const { projectId } = req.query;

  try {
    if (!projectId) {
      return res.status(400).json({ message: "Missing projectId" });
    }

    const invoices = await Invoice.find({ projectId })
      .populate('projectId', 'name'); // 👈 Include project name

    res.json({ invoices });
  } catch (err) {
    console.error("❌ Error fetching invoices by projectId:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// PATCH /api/invoices/:id
app.patch('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updated = await Invoice.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) return res.status(404).json({ message: "Invoice not found" });

    res.json({ success: true, invoice: updated });
  } catch (err) {
    console.error("Error updating invoice status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE invoice by ID
app.delete('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deletedInvoice = await Invoice.findByIdAndDelete(id);
    if (!deletedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({ message: 'Invoice deleted successfully', deletedInvoice });
  } catch (err) {
    console.error('❌ Error deleting invoice:', err);
    res.status(500).json({ message: 'Failed to delete invoice', error: err.message });
  }
});


// ✅ Get a single invoice by ID
app.get('/api/invoices/by-number/:invoiceNumber', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber })
      .populate('projectId'); // populate project if needed

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (err) {
    console.error('❌ Error fetching invoice:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/projects/:projectId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ project });
  } catch (err) {
    console.error("❌ Error fetching project:", err);
    res.status(500).json({ message: "Server error" });
  }
});




// Get invoice history
app.get('/history', async (req, res) => {
  const { vendorId } = req.query;

  try {
    const query = vendorId ? { vendorId } : {}; // Filter if vendorId is passed
    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invoice history', error: err });
  }
});


// ✅ Send invoice via email (PDF attached)
app.post('/api/send', memoryUpload.single('pdf'), async (req, res) => {
  const { invoiceId } = req.body;
  const pdfFile = req.file;

  // 🛡 Validation
  if (!invoiceId) {
    console.warn("⚠️ Missing invoiceId");
    return res.status(400).json({ message: "Missing invoiceId" });
  }

  if (!pdfFile || !pdfFile.buffer) {
    console.warn("⚠️ Missing or invalid PDF file");
    return res.status(400).json({ message: "Missing PDF attachment" });
  }

  try {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      console.warn(`❌ Invoice not found for ID: ${invoiceId}`);
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // ✅ Default recipients (hardcoded)
    const recipients = [
      "besf.jasson@gmail.com",
      "VonleoInc@adaptive.build"
    ];

    const mailOptions = {
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: `Invoice #${invoice.invoiceNumber}`,
      html: `
        <p>Hello,</p>
        <p>Please find attached invoice <strong>${invoice.invoiceNumber}</strong>.</p>
        <p>Thank you,<br><strong>BESF Team</strong></p>
      `,
      attachments: [
        {
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          content: pdfFile.buffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Invoice sent to: ${recipients.join(', ')} | ID: ${info.messageId}`);

    res.status(200).json({ message: `Invoice sent to: ${recipients.join(', ')}` });
  } catch (err) {
    console.error('❌ Failed to send invoice email:', err);
    res.status(500).json({ message: 'Failed to send invoice', error: err.message });
  }
});



// ✅ GET /api/notifications → Fetch recent notifications
app.get("/api/notifications", async (req, res) => {
  try {
      const notifications = await Notification.find()
          .sort({ timestamp: -1 })
          .limit(20);
      res.json({ success: true, notifications });
  } catch (error) {
      console.error("❌ Error fetching notifications:", error);
      res.status(500).json({ success: false, message: "Failed to fetch notifications." });
  }
});

// Create a new quote
app.post('/api/quotes', async (req, res) => {
  try {
    const newQuote = new Quote(req.body);
    const savedQuote = await newQuote.save();
    res.status(201).json(savedQuote);
  } catch (err) {
    console.error('Error saving quote:', err);
    res.status(500).json({ error: 'Failed to save quote' });
  }
});

// Get all quotes
app.get('/api/quotes', async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 });
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// Get quote by ID
app.get('/api/quotes/:id', async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Delete a quote by ID
app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const deletedQuote = await Quote.findByIdAndDelete(req.params.id);
    if (!deletedQuote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.status(200).json({ message: 'Quote deleted successfully' });
  } catch (err) {
    console.error('Error deleting quote:', err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});


// Update a quote
app.put('/api/quotes/:id', async (req, res) => {
  try {
    const quoteId = req.params.id;
    const {
      to,
      from,
      quoteNumber,
      date,
      validTill,
      notes,
      lineItems,
      status,
      totals // Accept tax as percentage: totals.tax (e.g., 8.25)
    } = req.body;

    if (!to?.name || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ message: 'Missing required fields: client name or line items' });
    }

    // ✅ Calculate totals using provided tax as percentage
    const subtotal = lineItems.reduce((acc, item) => acc + (item.rate * item.qty), 0);
    const discount = parseFloat(totals?.discount) || 0;
    const taxRate = parseFloat(totals?.tax) || 0;
    const taxAmount = (subtotal - discount) * (taxRate / 100);
    const total = subtotal - discount + taxAmount;

    const updateFields = {
      to,
      from,
      quoteNumber,
      date,
      validTill,
      notes,
      lineItems,
      totals: {
        subtotal,
        discount,
        tax: taxRate, // stored as percentage
        total
      }
    };

    if (status) updateFields.status = status;

    const updatedQuote = await Quote.findByIdAndUpdate(quoteId, updateFields, { new: true });

    if (!updatedQuote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.json(updatedQuote);
  } catch (err) {
    console.error('Error updating quote:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// Enhanced address parsing function to handle various address formats
function parseAddress(addressString) {
  const regex = /^(\d+\s+\w+(?:\s+\w+)*),?\s*(\w+(?:\s+\w+)*)?,?\s*([A-Z]{2})?\s*(\d{5})?$/;
  const match = addressString.match(regex);

  if (!match) {
    console.warn("Address format not recognized. Using fallback parsing.");
    const parts = addressString.split(',').map(part => part.trim());

    return applyDefaultAddressValues({
      street: parts[0] || '',
      city: parts[1] || '',
      state: parts[2]?.split(' ')[0] || 'TX',
      zip: parts[2]?.split(' ')[1] || '78109'
    });
  }

  const parsedAddress = {
    street: match[1] || '',
    city: match[2] || '',
    state: match[3] || 'TX',
    zip: match[4] || '78109'
  };

  return applyDefaultAddressValues(parsedAddress);
}

// Apply default values if state or zip are still undefined
function applyDefaultAddressValues(address) {
  address.state = address.state || 'TX';
  address.zip = address.zip || '78109';
  return address;
}

// Usage Example
const address1 = "9150 Devils River Converse Texas, 78109";
const address2 = "9150 Devils River, Converse, TX 78109";
console.log(parseAddress(address1));
console.log(parseAddress(address2));


// Updated /convert-to-job endpoint to proceed with job creation even if address data is incomplete
app.post("/api/quotes/:id/convert-to-job", async (req, res) => {
  try {
    // ✅ Get raw quote data with lean()
    const quote = await Quote.findById(req.params.id).lean();
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    const fullAddress = quote.to?.address || "";
    const parsedAddress = parseAddress(fullAddress);

    const projectName = `${parsedAddress.street.split(" ").slice(1).join(" ")} ${parsedAddress.street.split(" ")[0] || ""}`.trim() || "Unnamed Project";

    // Proceed even with incomplete address data
    const project = await Project.create({
      name: projectName,
      code: "1111",
      type: "residential",
      status: "in-progress",
      address: {
        addressLine1: parsedAddress.street,
        addressLine2: '',
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip
      },
      client: {
        name: quote.to?.name || "Client",
        email: quote.to?.email || "",
        phone: quote.to?.phone || "",
      },
      fromQuoteId: quote._id
    });

       // ✅ Helper to capitalize each word
       function capitalizeWords(str) {
        return str.replace(/\b\w/g, char => char.toUpperCase());
      }
  
      // ✅ Group line items by extracted room name
      const groupedByRoom = {};
  
      quote.lineItems.forEach(item => {
        let category = "General"; // Default category if no room detected
        let cleanedName = item.name.trim();
  
        if (item.name.includes("-")) {
          const parts = item.name.split("-");
          if (parts.length > 1) {
            category = capitalizeWords(parts[1].trim().toLowerCase());
            cleanedName = parts[0].trim(); // ✅ Remove room part from item name
          }
        }
  
        if (!groupedByRoom[category]) groupedByRoom[category] = [];
  
        groupedByRoom[category].push({
          type: "item",
          name: cleanedName, // ✅ Save cleaned name here
          description: item.description || "",
          costCode: item.costCode || "Uncategorized",
          quantity: item.qty || 1,
          unitPrice: item.rate || 0,
          total: (item.qty || 1) * (item.rate || 0),
          status: "in-progress",
          assignedTo: null,
          photos: {},
          startDate: null,
          endDate: null
        });
      });
  
      // ✅ Format nicely to save to estimate
      const formattedLineItems = Object.entries(groupedByRoom)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, items]) => ({
          type: "category",
          category, // Keep category as nicely formatted room name
          status: "in-progress",
          items
        }));
  


    // ✅ Create Estimate
    const estimate = await Estimate.create({
      projectId: project._id,
      invoiceNumber: `INV-${Date.now()}`,
      title: `Estimate from Quote ${quote.quoteNumber || 'N/A'}`,
      total: quote.totals?.total || 0,
      tax: quote.totals?.tax || 0,
      status: "draft",
      lineItems: formattedLineItems,
      createdFromQuote: quote._id
    });

    // ✅ Return success
    res.status(200).json({
      success: true,
      message: "Quote converted to project and estimate",
      projectId: project._id,
      estimateId: estimate._id,
      redirectUrl: `/details/projects/${project._id}`
    });

  } catch (err) {
    console.error("Error converting quote:", err);
    res.status(500).json({ error: "Failed to convert quote" });
  }
});


// Get all labor cost suggestions
app.get('/api/labor-costs', async (req, res) => {
  try {
    const items = await LaborCost.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error('Error fetching labor costs:', err);
    res.status(500).json({ error: 'Failed to fetch labor costs' });
  }
});

// Create a new labor item
app.post('/api/labor-costs', async (req, res) => {
  try {
    const newItem = new LaborCost(req.body);
    const saved = await newItem.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Error saving labor cost:', err);
    res.status(500).json({ error: 'Failed to save labor cost' });
  }
});

// Update a labor item
app.put('/api/labor-costs/:id', async (req, res) => {
  try {
    const updated = await LaborCost.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Labor item not found' });
    res.json(updated);
  } catch (err) {
    console.error('Error updating labor cost:', err);
    res.status(500).json({ error: 'Failed to update labor cost' });
  }
});

// Delete a labor item
app.delete('/api/labor-costs/:id', async (req, res) => {
  try {
    const deleted = await LaborCost.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Labor item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting labor cost:', err);
    res.status(500).json({ error: 'Failed to delete labor cost' });
  }
});



app.get('/api/vendors/login-direct/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Optional: set session/token here

    res.json({ vendorId: vendor._id });
  } catch (err) {
    res.status(500).json({ message: "Internal error" });
  }
});



// ✅ New route for items in Vendor.assignedItems
app.get("/api/quality-review/items/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status } = req.query;

    const vendors = await Vendor.find({ "assignedItems.projectId": projectId });
    const estimates = await Estimate.find({ projectId });
    const managers = await Manager.find({}, { _id: 1, name: 1 });

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
              qcItems.push({
                ...item.toObject(),
                vendorId: vendor._id,
                vendorName: vendor.name || "Unknown Vendor",
                estimateId: item.estimateId,
                estimateTitle,
                source: "vendor",
                qualityControl: {
                  ...item.qualityControl,
                  reviewedByName
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
                qcItems.push({
                  ...item.toObject(),
                  estimateId: estimate._id,
                  estimateTitle,
                  vendorId: item.assignedTo || null,
                  vendorName: "(from estimate)",
                  source: "estimate",
                  qualityControl: {
                    ...item.qualityControl,
                    reviewedByName
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








// ✅ Unified PUT route for QC Approval or Rework (estimate or vendor)
// ✅ PUT update QC status (estimate + vendor)
// ✅ PUT update QC status on estimate AND vendor
app.put("/api/items/:itemId/quality-review", async (req, res) => {
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
    const estimate = await Estimate.findOne({ "lineItems.items._id": itemId });
    if (estimate) {
      for (const section of estimate.lineItems) {
        const item = section.items.id(itemId);
        if (item) {
          // Update both status and qualityControl block
          item.status = status;
          item.qualityControl = {
            status,
            notes,
            reviewedBy,
            reviewedAt
          };
          await estimate.save();
          return res.json({ success: true, source: "estimate" });
        }
      }
    }

    // ✅ Fallback to Vendor assignedItems
    const vendor = await Vendor.findOne({ "assignedItems._id": itemId });
    if (vendor) {
      const item = vendor.assignedItems.id(itemId);
      if (item) {
        item.status = status;
        item.qualityControl = {
          status,
          notes,
          reviewedBy,
          reviewedAt
        };
        await vendor.save();
        return res.json({ success: true, source: "vendor" });
      }
    }

    // ❌ Not found in either
    res.status(404).json({ error: "Item not found in either estimate or vendor list." });

  } catch (err) {
    console.error("❌ Error updating QC status:", err);
    res.status(500).json({ error: "Failed to update QC status" });
  }
});

// GET all folders (no population to keep parentId as string)
app.get("/api/folders", async (req, res) => {
  try {
    const folders = await FileSystem.find().lean();
    
    // Normalize ObjectId to string for comparison in frontend
    folders.forEach(f => {
      if (f.parentId && f.parentId._id) {
        f.parentId = f.parentId._id.toString();
      } else if (f.parentId) {
        f.parentId = f.parentId.toString();
      }
    });

    res.json(folders);
  } catch (err) {
    console.error("❌ Failed to fetch folders:", err);
    res.status(500).json({ message: "Error fetching folders." });
  }
});


// CREATE a folder
app.post("/api/folders", async (req, res) => {
  const { name, parentId } = req.body;

  const folder = new FileSystem({
    name,
    parentId: parentId || null, // ✅ Use parentId if provided
    position: 0,
    files: []
  });

  await folder.save();
  res.json(folder);
});



// Reorder folders (static route must come before /:id)
app.put("/api/folders/reorder", async (req, res) => {
  const { order } = req.body; // [{_id, position}]
  for (let item of order) {
    await FileSystem.findByIdAndUpdate(item._id, { position: item.position });
  }
  res.json({ success: true });
});

// Rename folder
app.put("/api/folders/:id", async (req, res) => {
  const folder = await FileSystem.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name },
    { new: true }
  );
  res.json(folder);
});


// ADD file to folder
app.post('/api/folders/:id/files', upload.single('file'), async (req, res) => {
  const folder = await FileSystem.findById(req.params.id);
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


// RENAME a file in folder
app.put("/api/folders/:folderId/files/:index", async (req, res) => {
  const folder = await FileSystem.findById(req.params.folderId);
  folder.files[req.params.index].name = req.body.name;
  await folder.save();
  res.json(folder);
});

// DELETE folder
app.delete("/api/folders/:id", async (req, res) => {
  await FileSystem.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// DELETE file from folder
app.delete("/api/folders/:folderId/files/:index", async (req, res) => {
  const { folderId, index } = req.params;
  const folder = await FileSystem.findById(folderId);
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  // Remove file by index directly
  folder.files.splice(index, 1);
  await FileSystem.updateOne(
    { _id: folderId },
    { $set: { files: folder.files } }
  );

  const updated = await FileSystem.findById(folderId);
  res.json(updated);
});

// POST /api/folders/:folderId/delete-files
app.post("/api/folders/:folderId/delete-files", async (req, res) => {
  const { folderId } = req.params;
  const { indexes } = req.body;

  try {
    const folder = await FileSystem.findById(folderId);
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



// POST /api/expenses
app.post("/api/expenses", async (req, res) => {
  try {
    const { projectId, item, date, vendor, category, description, amount } = req.body;

    if (!projectId || !item?.itemId || !item?.name || !date || !vendor || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const expense = await Expense.create({
      projectId,
      item,
      date,
      vendor,
      category,
      description,
      amount
    });

    res.status(201).json({ success: true, expense });
  } catch (err) {
    console.error("Error creating expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/expenses?projectId=123
app.get("/api/expenses", async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ message: "Missing projectId" });

    const expenses = await Expense.find({ projectId }).sort({ date: -1 });
    res.json({ expenses });
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/expenses/:id", async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    res.json({ success: true, expense });
  } catch (err) {
    console.error("Error fetching expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/expenses/:id", async (req, res) => {
  try {
    const { projectId, item, date, vendor, category, description, amount } = req.body;

    if (!projectId || !item?.itemId || !item?.name || !date || !vendor || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const updated = await Expense.findByIdAndUpdate(
      req.params.id,
      { projectId, item, date, vendor, category, description, amount },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Expense not found" });

    res.json({ success: true, expense: updated });
  } catch (err) {
    console.error("Error updating expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Expense not found" });

    res.json({ success: true, message: "Expense deleted" });
  } catch (err) {
    console.error("Error deleting expense:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Download File Route
app.get('/api/projects/:projectId/files/:fileId/download', async (req, res) => {
  const { projectId, fileId } = req.params;

  try {
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Locate the file object
    const file = project.files.find(f => f._id.toString() === fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found in project' });
    }

    // Use the path directly as it is already the absolute path
    const filePath = file.path;

    console.log(`✅ Resolved file path for download: ${filePath}`);

    // Verify the file exists
    if (!fs.existsSync(filePath)) {
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

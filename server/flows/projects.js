// projects flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

async function logDailyUpdate(projectId, text, author = "System") {
  try {
    const project = await serverContext.Project.findById(projectId).select("name"); // Fetch actual project name
    
    const logUpdate = new serverContext.DailyUpdate({
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

// Enhanced address parsing function to handle various address formats
function parseAddress(addressString) {
  const regex = /^(\d+\s+\w+(?:\s+\w+)*),?\s*(\w+(?:\s+\w+)*)?,?\s*([A-Z]{2})?\s*(\d{5})?$/;
  const match = addressString.match(regex);

  if (!match) {
    console.warn("Address format not recognized. Using fallback parsing.");
    const parts = addressString.split(',').map(part => part.trim());

    return (0, serverContext.applyDefaultAddressValues)({
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

  return (0, serverContext.applyDefaultAddressValues)(parsedAddress);
}

// Apply default values if state or zip are still undefined
function applyDefaultAddressValues(address) {
  address.state = address.state || 'TX';
  address.zip = address.zip || '78109';
  return address;
}

function get_details_projects_id() {
// Serve `details-projects.html` for project details page
serverContext.app.get("/details/projects/:id", (req, res) => {
  res.sendFile(serverContext.path.join(serverContext.__dirname, "dist", "details-projects.html"));
});
}

function post_api_add_project() {
///==================///
      // Add Project
      serverContext.app.post('/api/add-project', async (req, res) => {
        try {
          const payload = req.body;
      
          // ✅ Default status if not provided
          if (!payload.status) {
            payload.status = "Upcoming";
          }
      
          // ✅ Create and save the new project
          const newProject = new serverContext.Project(payload);
          const savedProject = await newProject.save();
      
          // ✅ Log the project creation in daily logs
          await (0, serverContext.logDailyUpdate)(savedProject._id, `Project "${savedProject.name}" was created.`);
      
          res.json({ success: true, project: savedProject });
        } catch (error) {
          console.error('Error adding project:', error);
          res.status(500).json({ success: false, error: 'Failed to add project' });
        }
      });
}

function get_api_projects() {
// Get All Projects (Exclude "open" and "on-hold")
serverContext.app.get('/api/projects', async (req, res) => {
  try {
    // ✅ Fetch only projects that are NOT "open" or "on-hold"
    const projects = await serverContext.Project.find({
      status: { $nin: ["Upcoming", "On Market",  "completed"] } // $nin = Not In
    });

    res.json({ success: true, projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});
}

function put_api_projects_id() {
//Route for Editing a Project
serverContext.app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { name, status, color, type, code, address, description } = req.body;

  // Validate Project ID
  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
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
    const updatedProject = await serverContext.Project.findByIdAndUpdate(
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
        await (0, serverContext.logDailyUpdate)(id, `Project "${name}" was updated.`);

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
}

function get_details_projects_id_2() {
// Serve the details-project.html file
serverContext.app.get('/details/projects/:id', (req, res) => {
  const filePath = serverContext.path.join(serverContext.__dirname, 'dist', 'details-projects.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving details-projects.html:', err);
      res.status(500).send('Failed to load the page.');
    }
  });
});
}

function get_api_details_projects_id() {
// Get Project Details by ID
serverContext.app.get('/api/details/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const project = await serverContext.Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, project });
  } catch (error) {
    console.error('Error fetching project details:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch project details' });
  }
});
}

function delete_api_projects_projectId() {
serverContext.app.delete("/api/projects/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if project exists
    const project = await serverContext.Project.findByIdAndDelete(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    res.status(200).json({ success: true, message: "Project deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    res.status(500).json({ success: false, message: "Failed to delete project." });
  }
});
}

function get_api_projects_current() {
// Endpoint to get the current project ID
serverContext.app.get('/api/projects/current', async (req, res) => { 
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
}

function get_api_on_market_projects() {
// ✅ Get all "On Market" projects
serverContext.app.get("/api/on-market-projects", async (req, res) => {
  try {
    const projects = await serverContext.Project.find({ status: "On Market" });

    res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error("Error fetching 'On Market' projects:", error);
    res.status(500).json({ success: false, message: "Failed to fetch 'On Market' projects." });
  }
});
}

function get_api_upcoming_projects() {
// ✅ Get all upcoming and on-hold projects
serverContext.app.get("/api/upcoming-projects", async (req, res) => {
  try {
    // ✅ Fetch projects that have "upcoming" or "on hold" status
    const projects = await serverContext.Project.find({
      status: { $in: ["Upcoming", "on-hold", "Open"] } // Matches either "upcoming" or "on hold"
    });

    res.status(200).json({ success: true, projects }); // ✅ Corrected variable name
  } catch (error) {
    console.error("Error fetching upcoming projects:", error);
    res.status(500).json({ success: false, message: "Failed to fetch upcoming projects." });
  }
});
}

function get_api_completed_projects() {
// ✅ API Endpoint to Fetch Completed Projects
serverContext.app.get('/api/completed-projects', async (req, res) => {
  try {
      // Fetch only projects with status "completed"
      const completedProjects = await serverContext.Project.find({ status: "completed" });

      res.status(200).json({ success: true, projects: completedProjects });
  } catch (error) {
      console.error('❌ Error fetching completed projects:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch completed projects.' });
  }
});
}

function get_api_daily_updates() {
// ✅ GET /api/daily-updates → Fetch all daily updates (Filtered by Date)
serverContext.app.get("/api/daily-updates", async (req, res) => {
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
      const updates = await serverContext.DailyUpdate.find({
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
}

function post_api_daily_updates() {
// ✅ POST /api/daily-updates → Add a new update (WITH Manager ID)
serverContext.app.post("/api/daily-updates", async (req, res) => {
  try {
      const { projectId, text, images, managerId } = req.body;

      // ✅ Ensure required fields exist
      if (!projectId || !text || !managerId) {
          return res.status(400).json({ success: false, message: "Missing required fields (Project ID, Text, Manager ID)." });
      }

      // ✅ Validate Manager ID
      const manager = await serverContext.Manager.findById(managerId).select("name");
      if (!manager) {
          return res.status(404).json({ success: false, message: "Invalid Manager ID." });
      }

      // ✅ Fetch Project Name from Database
      const project = await serverContext.Project.findById(projectId).select("name"); // Only fetch name field
      if (!project) {
          return res.status(404).json({ success: false, message: "Project not found." });
      }

      // ✅ Create New Daily Update Entry
      const newUpdate = new serverContext.DailyUpdate({
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
}

function get_api_notifications() {
// ✅ GET /api/notifications → Fetch recent notifications
serverContext.app.get("/api/notifications", async (req, res) => {
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
}

function get_api_projects_projectId_utilities() {
// GET utilities for a project
serverContext.app.get('/api/projects/:projectId/utilities', async (req, res) => {
  try {
    const project = await serverContext.Project.findById(req.params.projectId).select('utilityAccounts');
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ utilityAccounts: project.utilityAccounts });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
}

function put_api_projects_projectId_utilities() {
// PUT update utilities for a project
serverContext.app.put('/api/projects/:projectId/utilities', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { utilityAccounts } = req.body;
    if (!utilityAccounts) {
      return res.status(400).json({ message: "Missing utilityAccounts in request body" });
    }
    const project = await serverContext.Project.findByIdAndUpdate(
      projectId,
      { $set: { utilityAccounts } },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ success: true, utilityAccounts: project.utilityAccounts });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
}

function get_api_projects_projectId() {
serverContext.app.get('/api/projects/:projectId', async (req, res) => {
  try {
    const project = await serverContext.Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ project });
  } catch (err) {
    console.error("❌ Error fetching project:", err);
    res.status(500).json({ message: "Server error" });
  }
});
}

return {
  logDailyUpdate,
  get_details_projects_id,
  post_api_add_project,
  get_api_projects,
  put_api_projects_id,
  get_details_projects_id_2,
  get_api_details_projects_id,
  delete_api_projects_projectId,
  get_api_projects_current,
  get_api_on_market_projects,
  get_api_upcoming_projects,
  get_api_completed_projects,
  get_api_daily_updates,
  post_api_daily_updates,
  get_api_notifications,
  parseAddress,
  applyDefaultAddressValues,
  get_api_projects_projectId_utilities,
  put_api_projects_projectId_utilities,
  get_api_projects_projectId
};
};

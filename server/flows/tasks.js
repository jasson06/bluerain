// tasks flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function get_api_tasks() {
// --- GET /api/tasks: Return all tasks with project name ---
serverContext.app.get('/api/tasks', async (req, res) => {
  try {
    const { projectId } = req.query;

    // Branch: project-specific tasks with assignedTo population
    if (projectId) {
      let tasks = await serverContext.Task.find({ projectId }).lean();

      // Populate assignedTo name based on assignedToModel
      tasks = await Promise.all(
        tasks.map(async (t) => {
          if (!t.assignedTo) return t;

          try {
            if (t.assignedToModel === 'Vendor') {
              const v = await serverContext.Vendor.findById(t.assignedTo).select('name').lean();
              return { ...t, assignedTo: v ? { _id: v._id, name: v.name } : null };
            } else if (t.assignedToModel === 'Manager') {
              const m = await serverContext.Manager.findById(t.assignedTo).select('name').lean();
              return { ...t, assignedTo: m ? { _id: m._id, name: m.name } : null };
            }
          } catch {
            // ignore population errors per item
          }
          return t;
        })
      );

      
      return res.json({ success: true, tasks });
    }

    // Branch: all tasks with projectName mapping
    const tasks = await serverContext.Task.find({})
      .select('title description dueDate completed assignedTo assignedToModel comments projectId createdAt updatedAt')
      .populate({ path: 'projectId', select: 'name' })
      .populate({ path: 'assignedTo', select: 'name' }) // uses refPath: 'assignedToModel'
      .lean();

    const tasksWithProject = tasks.map((task) => ({
      _id: task._id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      completed: task.completed,
      comments: task.comments || [],
      assignedTo: task.assignedTo
        ? { _id: task.assignedTo._id, name: task.assignedTo.name }
        : null,
      assignedToModel: task.assignedToModel || null,
      projectId: task.projectId?._id || task.projectId,
      projectName: task.projectId?.name || String(task.projectId),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }));

    return res.json({ tasks: tasksWithProject });
  } catch (err) {
    console.error('Error fetching tasks:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});
}

function get_api_task_id() {
// Get Task Details Endpoint
serverContext.app.get('/api/task/:id', async (req, res) => {
  const { id } = req.params;
  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid Task ID.' });
  }

  try {
    let task = await serverContext.Task.findById(id).select('title description dueDate completed assignedTo photos comments assignedToModel projectId createdAt updatedAt');

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // ✅ Populate assignedTo with Email
    if (task.assignedTo) {
      if (task.assignedToModel === 'Vendor') {
        task.assignedTo = await serverContext.Vendor.findById(task.assignedTo).select('name email');
      } else if (task.assignedToModel === 'Manager') {
        task.assignedTo = await serverContext.Manager.findById(task.assignedTo).select('name email');
      }
    }

    

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
        projectId: task.projectId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      },
    });
  } catch (error) {
    console.error('❌ Error fetching task:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task details' });
  }
});
}

function put_api_task_id_assign() {
serverContext.app.put('/api/task/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { assignedTo } = req.body;

  try {
    const task = await serverContext.Task.findByIdAndUpdate(id, { assignedTo }, { new: true });

    // Ensure that the assigned user exists and has an email
    let assignedUser = null;
    if (task.assignedToModel === 'Vendor') {
      assignedUser = await serverContext.Vendor.findById(assignedTo).select('email');
    } else if (task.assignedToModel === 'Manager') {
      assignedUser = await serverContext.Manager.findById(assignedTo).select('email');
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
}

function get_api_portfolio_tasks() {
// ===== Portfolio Tasks (Dashboard-level) =====

// GET /api/portfolio-tasks
serverContext.app.get('/api/portfolio-tasks', async (req, res) => {
  try {
    const projectId = String(req.query.projectId || '').trim();
    if (projectId && !serverContext.mongoose.Types.ObjectId.isValid(projectId)) return res.status(400).json({ error: 'Invalid property id' });
    const filter = projectId ? { projectId } : req.query.scope === 'all' ? {} : { projectId: null };
    const tasks = await serverContext.PortfolioTask.find(filter)
      .sort({ pinned: -1, createdAt: -1 })
      .lean();
    return res.json({ tasks });
  } catch (err) {
    console.error('Error fetching portfolio tasks:', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch portfolio tasks' });
  }
});
}

function post_api_portfolio_tasks() {
// POST /api/portfolio-tasks
serverContext.app.post('/api/portfolio-tasks', async (req, res) => {
  try {
    const { projectId, title, description, status, dueDate, pinned, priority, category, relatedType, relatedId, assignedTo } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (projectId && (!serverContext.mongoose.Types.ObjectId.isValid(projectId) || !(await serverContext.Project.exists({ _id: projectId })))) return res.status(400).json({ error: 'Invalid property' });
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) return res.status(400).json({ error: 'Invalid due date' });
    const task = new serverContext.PortfolioTask({
      projectId: projectId && serverContext.mongoose.Types.ObjectId.isValid(projectId) ? projectId : null,
      title: title.trim(),
      description: description || '',
      status: status && ['new','in-progress','completed'].includes(status) ? status : 'new',
      priority: ['low','medium','high','urgent'].includes(priority) ? priority : 'medium',
      category: String(category || 'general'),
      relatedType: String(relatedType || ''),
      relatedId: String(relatedId || ''),
      assignedTo: String(assignedTo || ''),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      pinned: !!pinned
    });
    await task.save();
    return res.status(201).json({ task });
  } catch (err) {
    console.error('Error creating portfolio task:', err.message || err);
    return res.status(500).json({ error: 'Failed to create portfolio task' });
  }
});
}

function put_api_portfolio_tasks_id() {
// PUT /api/portfolio-tasks/:id
serverContext.app.put('/api/portfolio-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    const updates = {};
    const { projectId, title, description, status, dueDate, pinned, completed, priority, category, assignedTo } = req.body || {};
    if (projectId !== undefined) {
      if (projectId !== null && projectId !== '' && (!serverContext.mongoose.Types.ObjectId.isValid(projectId) || !(await serverContext.Project.exists({ _id: projectId })))) return res.status(400).json({ error: 'Invalid property' });
      updates.projectId = projectId || null;
    }
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title is required' });
      updates.title = title.trim();
    }
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) return res.status(400).json({ error: 'Invalid due date' });
    if (description !== undefined) updates.description = description;
    if (priority && ['low','medium','high','urgent'].includes(priority)) updates.priority = priority;
    if (category !== undefined) updates.category = String(category);
    if (assignedTo !== undefined) updates.assignedTo = String(assignedTo);
    if (status && ['new','in-progress','completed'].includes(status)) updates.status = status;
    if (typeof pinned === 'boolean') updates.pinned = pinned;
    if (typeof completed === 'boolean') updates.status = completed ? 'completed' : 'new';
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    updates.updatedAt = new Date();

    const task = await serverContext.PortfolioTask.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json({ task });
  } catch (err) {
    console.error('Error updating portfolio task:', err.message || err);
    return res.status(500).json({ error: 'Failed to update portfolio task' });
  }
});
}

function delete_api_portfolio_tasks_id() {
// DELETE /api/portfolio-tasks/:id
serverContext.app.delete('/api/portfolio-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    const deleted = await serverContext.PortfolioTask.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting portfolio task:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete portfolio task' });
  }
});
}

function post_api_tasks() {
// Create Task (Backend)
serverContext.app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, dueDate, completed, assignedTo, projectId } = req.body;

    // Validate required fields
    if (!title || !projectId) {
      return res.status(400).json({ success: false, error: 'Title and Project ID are required.' });
    }

    let assignedToModel = null;

    // Only set assignedToModel if assignedTo is provided
    if (assignedTo) {
      const vendor = await serverContext.Vendor.findById(assignedTo);
      if (vendor) {
        assignedToModel = 'Vendor';
      } else {
        const manager = await serverContext.Manager.findById(assignedTo);
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
    const newTask = new serverContext.Task({
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
    await (0, serverContext.logDailyUpdate)(projectId, `New task "${title}" was created.`);

    
    res.status(201).json({ success: true, task: newTask });

  } catch (error) {
    console.error('Error adding task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add task' });
  }
});
}

function put_api_task_id() {
// Update Task Endpoint with Strict Role Detection
serverContext.app.put('/api/task/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, dueDate, completed, assignedTo, projectId } = req.body;

  try {
    const updateFields = {};

    // Dynamically add fields to update if provided
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (dueDate) updateFields.dueDate = dueDate;
    if (projectId) updateFields.projectId = projectId;
    if (typeof completed !== 'undefined') updateFields.completed = completed;
    
    let assignedToModel = null;

    // Check if assignedTo exists
    if (assignedTo) {
      console.log("Checking Vendor First...");
      const vendor = await serverContext.Vendor.findById(assignedTo);
      
      if (vendor) {
        assignedToModel = 'Vendor';
        
      } else {
        console.log("Checking Manager...");
        const manager = await serverContext.Manager.findById(assignedTo);
        
        if (manager) {
          assignedToModel = 'Manager';
          
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

    

    // Update task and enforce correct role
    const task = await serverContext.Task.findByIdAndUpdate(
      id, 
      { $set: updateFields },  // Explicitly setting the update fields
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    

        // ✅ Log the Update in Daily Updates
        await (0, serverContext.logDailyUpdate)(task.projectId, `Task "${task.title}" was updated.`);


    res.json({ success: true, task });

  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});
}

function delete_api_task_id() {
// Delete Task (Backend)
// Delete Task Endpoint
serverContext.app.delete('/api/task/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if task exists before attempting deletion
    const task = await serverContext.Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    // Delete task
    await serverContext.Task.findByIdAndDelete(id);
   
    // ✅ Log the deletion in daily updates
    await (0, serverContext.logDailyUpdate)(task.projectId, `Task "${task.title}" was deleted.`, "System");


    console.log(`✅ Task ${id} deleted successfully.`);
    res.json({ success: true, message: 'Task deleted successfully.' });

  } catch (error) {
    console.error('Error deleting task:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete task.' });
  }
});
}

function get_api_comments() {
// Get comments for a specific task
serverContext.app.get('/api/comments', async (req, res) => {
  const { taskId } = req.query;

  if (!taskId || !serverContext.mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ success: false, message: 'Invalid Task ID.' });
  }

  try {
    const comments = await serverContext.Comment.find({ taskId }).sort({ timestamp: -1 }); // Fetch from Comment collection
if (!comments.length) {
  return res.status(200).json({ success: true, comments: [] }); // No comments yet
}

res.status(200).json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch comments.' });
  }
});
}

function post_api_comments() {
// ✅ Add a new comment to a task and log it
serverContext.app.post('/api/comments', async (req, res) => {
  const { taskId, comment, managerName, timestamp } = req.body;

  if (!taskId || !comment || !managerName || !timestamp) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    // ✅ Fetch the task to get project details
    const task = await serverContext.Task.findById(taskId).select("title projectId");
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    // ✅ Save the new comment
    const newComment = new serverContext.Comment({
      taskId,
      text: comment,
      managerName,
      timestamp,
    });

    await newComment.save();

    // ✅ Log the comment in daily updates
    await (0, serverContext.logDailyUpdate)(task.projectId, `New comment on task "${task.title}": "${comment}"`, managerName);

    
    res.status(201).json({ message: "Comment added successfully.", comment: newComment });

  } catch (error) {
    console.error("❌ Error saving comment:", error);
    res.status(500).json({ message: "Failed to save comment." });
  }
});
}

function get_api_todos() {
//to-do list functions 

// Get all tasks
serverContext.app.get('/api/todos', async (req, res) => {
  const todos = await serverContext.Todo.find().sort({ createdAt: -1 });
  res.json(todos);
});
}

function post_api_todos() {
// Create task
serverContext.app.post('/api/todos', async (req, res) => {
  const { text, priority } = req.body;
  const todo = new serverContext.Todo({ text, priority });
  await todo.save();
  res.json(todo);
});
}

function put_api_todos_id() {
// Update task
serverContext.app.put('/api/todos/:id', async (req, res) => {
  const updated = await serverContext.Todo.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});
}

function delete_api_todos_id() {
// Delete task
serverContext.app.delete('/api/todos/:id', async (req, res) => {
  await serverContext.Todo.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
}

return {
  get_api_tasks,
  get_api_task_id,
  put_api_task_id_assign,
  get_api_portfolio_tasks,
  post_api_portfolio_tasks,
  put_api_portfolio_tasks_id,
  delete_api_portfolio_tasks_id,
  post_api_tasks,
  put_api_task_id,
  delete_api_task_id,
  get_api_comments,
  post_api_comments,
  get_api_todos,
  post_api_todos,
  put_api_todos_id,
  delete_api_todos_id
};
};

console.log("details-project.js is loaded");

// Helper function to consistently extract projectId from URL
function getProjectId() {
  const pathSegments = window.location.pathname.split('/');
  return pathSegments[pathSegments.length - 1];
}



// Reload Project Details, Tasks, and Estimates
function refreshProjectPage() {
  const projectId = getProjectId();
  loadProjectDetails(projectId);
  loadTasks(projectId);
  loadEstimates(projectId);
}




// Function to load project details and make it a clickable tag with a dropdown icon
async function loadProjectDetails(id) {
  const projectDetailsContainer = document.getElementById('project-details');
  const projectTitle = document.getElementById('project-title');

  try {
    const response = await fetch(`/api/details/projects/${id}`);
    if (!response.ok) throw new Error('Failed to fetch project details');

    const { project } = await response.json();

    // Set project title with dropdown icon
    projectTitle.innerHTML = `
      <div class="project-tag">
        <span>${project.name || 'No Project Name'}</span>
        <i class="fas fa-chevron-down dropdown-icon"></i>
      </div>
    `;

    // Populate project details with Edit Project button
    projectDetailsContainer.innerHTML = `
      <div id="project-details-content" class="project-details-content">
        <p><strong>Status:</strong> ${project.status || 'N/A'}</p>
        <p><strong>Address:</strong> ${project.address.addressLine1 || ''}, ${project.address.city || 'N/A'}, ${project.address.state || 'N/A'}</p>
        <p><strong>Description:</strong> ${project.description || 'No description available.'}</p>
        <p><strong>Lockbox Code:</strong> ${project.code || 'N/A'}</p>
        <p><strong>Type:</strong> ${project.type || 'N/A'}</p>
        <p><strong>Color:</strong> 
          <span style="background-color: ${project.color || '#ccc'};"></span>${project.color || 'N/A'}
        </p>
        <p><strong>Zip Code:</strong> ${project.address.zip || 'N/A'}</p>
        <!-- Add Edit Project Button -->
        <button id="edit-project-button" onclick="openEditProjectModal()">Edit Project</button>
      </div>
    `;

    // Add click event to toggle project details
    const projectTag = document.querySelector('.project-tag');
    const detailsContent = document.getElementById('project-details-content');
    const dropdownIcon = document.querySelector('.dropdown-icon');

    projectTag.addEventListener('click', () => {
      const isOpen = detailsContent.classList.toggle('open');
      dropdownIcon.classList.toggle('rotated', isOpen);
    });

    // Ensure details are hidden by default
    detailsContent.classList.remove('open');
    dropdownIcon.classList.remove('rotated');
  } catch (error) {
    console.error('Error loading project details:', error);
    projectTitle.textContent = 'Error Loading Project Details';
    projectDetailsContainer.innerHTML =
      '<p>An error occurred while loading project details.</p>';
  }
}


document.addEventListener("DOMContentLoaded", function() {
  function extractProjectIdFromUrl() {
      const urlParts = window.location.pathname.split('/');
      const projectIndex = urlParts.indexOf("projects");
      return projectIndex !== -1 ? urlParts[projectIndex + 1] : null;
  }

  const projectId = extractProjectIdFromUrl();

  if (projectId) {
      localStorage.setItem("currentProjectId", projectId);
      console.log("Stored Project ID:", projectId);
  } else {
      console.warn("Project ID not found in URL.");
  }
});


// Open Edit Project Modal
function openEditProjectModal() {
  const modal = document.getElementById('edit-project-modal');
  modal.style.display = 'flex';

  const projectId = getProjectId();;
  fetch(`/api/details/projects/${projectId}`)
    .then((response) => response.json())
    .then(({ project }) => {
      if (project) {
        document.getElementById('edit-project-name').value = project.name || '';
        document.getElementById('edit-project-status').value = project.status || 'active';
        document.getElementById('edit-project-color').value = project.color || '#000000';
        document.getElementById('edit-project-type').value = project.type || '';
        document.getElementById('edit-project-code').value = project.code || '';
        document.getElementById('edit-project-description').value = project.description || '';

        // Populate individual address fields
        document.getElementById('edit-project-addressLine1').value = project.address?.addressLine1 || '';
        document.getElementById('edit-project-addressLine2').value = project.address?.addressLine2 || '';
        document.getElementById('edit-project-city').value = project.address?.city || '';
        document.getElementById('edit-project-state').value = project.address?.state || '';
        document.getElementById('edit-project-zip').value = project.address?.zip || '';
      }
    })
    .catch((error) => console.error('Error fetching project details:', error));
}



// Submit Edited Project
function submitEditProject() {
  const projectId = getProjectId();

  const updatedProject = {
    name: document.getElementById('edit-project-name').value,
    status: document.getElementById('edit-project-status').value,
    color: document.getElementById('edit-project-color').value,
    type: document.getElementById('edit-project-type').value,
    code: document.getElementById('edit-project-code').value,
    description: document.getElementById('edit-project-description').value,
    address: {
      addressLine1: document.getElementById('edit-project-addressLine1').value,
      addressLine2: document.getElementById('edit-project-addressLine2').value,
      city: document.getElementById('edit-project-city').value,
      state: document.getElementById('edit-project-state').value,
      zip: document.getElementById('edit-project-zip').value,
    },
  };

  fetch(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedProject),
  })
    .then((response) => {
      if (!response.ok) throw new Error('Failed to update project');
      return response.json();
    })
    .then(() => {
      closeEditProjectModal();
      location.reload(); // Reload the page to reflect changes
    })
    .catch((error) => console.error('Error updating project:', error));
}


// Function to delete the project
async function deleteProject() {
  const projectId = getProjectId(); // Ensure this function gets the project ID
  if (!projectId) {
    alert("Project ID is missing. Cannot delete.");
    return;
  }

  if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
    return;
  }

  try {
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });

    if (!response.ok) {
      throw new Error("Failed to delete project.");
    }

    alert("✅ Project deleted successfully.");
    closeEditProjectModal();
    window.location.href = "/"; // Redirect to the main dashboard
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    alert("An error occurred while deleting the project. Please try again.");
  }
}



// Close Edit Project Modal
function closeEditProjectModal() {
  const modal = document.getElementById('edit-project-modal');
  modal.style.display = 'none';
}

// Optional: Close modal on Escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeEditProjectModal();
  }
});


// Open Invite Modal
function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  modal.style.display = 'flex';
}


// Open Invite Modal and Populate Vendors and Managers
function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  modal.style.display = 'flex';

  const vendorDropdown = document.getElementById('existing-vendor');
  const managerDropdown = document.getElementById('existing-manager'); // New dropdown for managers
  vendorDropdown.innerHTML = '';
  managerDropdown.innerHTML = '';

  // Common function to populate dropdowns
  function populateDropdown(dropdown, data, role) {
    // Add "Select Existing" and "Add New" options
    const selectOption = document.createElement('option');
    selectOption.value = '';
    selectOption.textContent = `Select an existing ${role}`;
    dropdown.appendChild(selectOption);

    const newOption = document.createElement('option');
    newOption.value = 'new';
    newOption.textContent = `Add New ${role}`;
    dropdown.appendChild(newOption);

    // Populate the dropdown with fetched data
    if (data.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = `No ${role}s available`;
      option.disabled = true;
      dropdown.appendChild(option);
    } else {
      data.forEach((user) => {
        const option = document.createElement('option');
        option.value = user._id;
        option.textContent = `${user.name} (${user.email})`;
        dropdown.appendChild(option);
      });
    }
  }

  // Fetch vendors
  fetch('/api/vendors')
    .then((response) => response.json())
    .then((vendors) => populateDropdown(vendorDropdown, vendors, 'vendor'))
    .catch((error) => {
      console.error('Error fetching vendors:', error);
      vendorDropdown.innerHTML = '<option value="">Error loading vendors</option>';
    });

  // Fetch managers
  fetch('/api/managers')
    .then((response) => response.json())
    .then((managers) => populateDropdown(managerDropdown, managers, 'manager'))
    .catch((error) => {
      console.error('Error fetching managers:', error);
      managerDropdown.innerHTML = '<option value="">Error loading managers</option>';
    });

  // Autofill email when an existing vendor or manager is selected
  function handleDropdownChange(event, role) {
    const selectedValue = event.target.value;
    const emailInput = document.getElementById('invite-email');

    if (selectedValue === 'new') {
      emailInput.value = '';
      emailInput.readOnly = false;
    } else if (selectedValue) {
      fetch(`/api/${role}s/${selectedValue}`)
        .then((response) => response.json())
        .then((user) => {
          emailInput.value = user.email || '';
          emailInput.readOnly = true;
        })
        .catch((error) => {
          console.error(`Error fetching ${role}:`, error);
          emailInput.value = '';
          alert(`Error fetching ${role} details. Please try again.`);
        });
    } else {
      emailInput.value = '';
      emailInput.readOnly = true;
    }
  }

  // Event listeners for both dropdowns
  vendorDropdown.addEventListener('change', (event) => handleDropdownChange(event, 'vendor'));
  managerDropdown.addEventListener('change', (event) => handleDropdownChange(event, 'manager'));
}

// Close the modal (optional additional functionality)
function closeInviteModal() {
  const modal = document.getElementById('invite-modal');
  modal.style.display = 'none';

  document.getElementById('existing-vendor').innerHTML = '<option value="">Select an existing vendor</option>';
  document.getElementById('existing-manager').innerHTML = '<option value="">Select an existing manager</option>'; // Clear manager dropdown
  document.getElementById('invite-email').value = '';
}


async function sendInvite() {
  const emails = document
    .getElementById("invite-email")
    .value.split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  const role = document.getElementById("invite-role").value;

  const pathArray = window.location.pathname.split("/");
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("projectId") || pathArray[pathArray.indexOf("projects") + 1];

  if (emails.length === 0 || !role || !projectId) {
    alert("All fields are required.");
    return;
  }

  try {
    const response = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, role, projectId }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to send invites.");
    }

    const message = result.invitedUsers
      .map((user) => `${user.email}: ${user.status}`)
      .join("\n");
    alert(`Invitations sent successfully:\n${message}`);
    closeInviteModal();
  } catch (error) {
    console.error("Error sending invites:", error);
    alert(`Error sending invites: ${error.message}`);
  }
}




// Close Invite Modal
function closeInviteModal() {
  document.getElementById('invite-modal').style.display = 'none';
}


// ✅ Assign Task and Send Email Notification
async function assignTask(taskId, assigneeId, assignedToModel) {
  try {
      if (!taskId) {
          console.error("❌ Task ID is undefined. Cannot assign task.");
          return;
      }

      console.log(`🔹 Assigning Task ID: ${taskId} to ${assigneeId} (Model: ${assignedToModel})`);

      const response = await fetch(`/api/task/${taskId}/assign`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedTo: assigneeId, assignedToModel })
      });

      const data = await response.json();
      if (!response.ok) {
          throw new Error(data.message || 'Failed to assign task.');
      }

      console.log("✅ Task assigned successfully. Calling sendTaskAssignmentEmail...");

      // ✅ Ensure Task ID is correctly passed
      await sendTaskAssignmentEmail(taskId);

  } catch (error) {
      console.error("❌ Error assigning task:", error);
  }
}





// ✅ Function to Send Email Notification
async function sendTaskAssignmentEmail(taskId) {
  try {
    if (!taskId) {
      console.error("❌ Task ID is missing. Cannot fetch task details.");
      return;
    }

    console.log("📩 Fetching task details for Task ID:", taskId);

    const taskResponse = await fetch(`/api/task/${taskId}`);
    if (!taskResponse.ok) {
      throw new Error("Failed to fetch task details.");
    }

    const { task } = await taskResponse.json();
    if (!task || !task.assignedTo || !task.assignedTo.email || !task.projectId || !task.assignedToModel) {
      console.error("❌ Missing email parameters:", {
        assigneeEmail: task?.assignedTo?.email,
        taskTitle: task?.title,
        projectId: task?.projectId,
        assignedToModel: task?.assignedToModel
      });
      return;
    }

    console.log("🏗️ Fetching project details for Project ID:", task.projectId);

    // Fetch project details to get the project name and address
    const projectResponse = await fetch(`/api/details/projects/${task.projectId}`);
    if (!projectResponse.ok) {
      throw new Error("Failed to fetch project details.");
    }

    const { project } = await projectResponse.json();
    if (!project || !project.address) {
      console.error("❌ Missing project details:", project);
      return;
    }

    const projectAddress = `${project.address.addressLine1 || ''}, ${project.address.city}, ${project.address.state} ${project.address.zip || ''}`.trim();

    // ✅ Corrected: Assign the right sign-in URL based on the assignee's role
    const isVendor = task.assignedToModel.toLowerCase() === "vendor"; // Ensure case-insensitive check
    const signInLink = isVendor
      ? `https://node-mongodb-api-1h93.onrender.com/sign-inpage.html` // Vendor Login
      : `https://node-mongodb-api-1h93.onrender.com/project-manager-auth.html`; // Manager Login

    console.log(`📨 Sending email to: ${task.assignedTo.email} | Role: ${task.assignedToModel} | Sign-in URL: ${signInLink}`);

    const emailResponse = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: task.assignedTo.email,
        subject: `New Task Assigned: ${task.title}`,
        text: `You have been assigned a new task: "${task.title}" in the project: "${project.name}" (${projectAddress}).

Please check your dashboard for more details.

🔗 Sign in here: ${signInLink}`
      })
    });

    if (!emailResponse.ok) throw new Error("Failed to send email notification.");
    console.log("✅ Email notification sent successfully.");

  } catch (error) {
    console.error("❌ Error sending email notification:", error);
  }
}








// Function to load tasks and display their statuses
async function loadTasks(projectId) {
  const taskList = document.getElementById('task-list');
  const taskCountElement = document.getElementById('task-count');
  taskList.innerHTML = '<p>Loading tasks...</p>';

  try {
    const response = await fetch(`/api/tasks?projectId=${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch tasks');

    const { tasks } = await response.json();

    // Update the task count
    taskCountElement.textContent = `(${tasks.length})`;

    if (tasks.length === 0) {
      taskList.innerHTML = '<p>No tasks found for this project.</p>';
    } else {
      taskList.innerHTML = tasks
        .map((task) => {
          const taskStatusClass = task.completed ? 'status-completed' : 'status-pending';
          const taskStatusText = task.completed ? 'Completed' : 'Pending';
          const assignedTo = task.assignedTo || { name: 'Unassigned', initials: 'NA' };

          // Extract initials from assigned user's name
          const initials = assignedTo.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .toUpperCase();

          const dueDate = task.dueDate
            ? new Date(task.dueDate).toLocaleDateString()
            : 'Not Set';

          return `
            <li class="task-item" data-task-id="${task._id}">
              <div class="task-info">
                <span class="task-title">${task.title}</span>
                <div class="task-assigned-to ${assignedTo.name === 'Unassigned' ? 'unassigned' : ''}" title="${assignedTo.name}">
                  <div class="task-assigned-circle">${initials}</div>
                </div>
                <div class="task-actions">
                  <span class="delete-icon" onclick="deleteTask('${task._id}')">
                    <i class="fas fa-trash"></i>
                  </span>
                  <button class="edit-task-button" data-task-id="${task._id}">Edit</button>
                </div>
              </div>
              <div class="task-meta">
                <span class="task-status ${taskStatusClass}">${taskStatusText}</span>
              </div>
              <div class="task-extra-actions">
                <button class="assign-to-button" onclick="openAssignModal('${task._id}')" title="Assign">
                  <i class="fas fa-user-plus"></i>
                </button>
                <button class="add-due-date-button" onclick="openDueDateModal('${task._id}')" title="Add Due Date">
                  <i class="fas fa-calendar"></i>
                </button>
                <span class="task-due-date">Due: ${dueDate}</span>
              </div>
            </li>`;
        })
        .join('');

      // Add click event listeners for tasks
      addTaskClickListeners();

      // Add event listeners for edit buttons
      document.querySelectorAll('.edit-task-button').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const taskId = button.dataset.taskId;
          if (taskId) {
            openEditTaskModal(taskId);
          } else {
            console.error('Task ID is missing for edit button');
          }
        });
      });

      // Add event listeners for delete icons
      document.querySelectorAll('.delete-icon').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const taskId = button.closest('.task-item').dataset.taskId;
          deleteTask(taskId);
        });
      });

      // Add event listeners for assign-to buttons
      document.querySelectorAll('.assign-to-button').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const taskId = button.closest('.task-item').dataset.taskId;
          openAssignModal(taskId);
        });
      });

      // Add event listeners for add-due-date buttons
      document.querySelectorAll(".add-due-date-button").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const taskId = button.closest(".task-item").dataset.taskId;
          openDueDatePicker(taskId, button);
        });
      });    
    }
  } catch (error) {
    console.error(error);
    taskList.innerHTML = '<p>An error occurred while loading tasks.</p>';
  }
}


// Function to open the "Assign To" modal
async function openAssignModal(taskId) {
  console.log(`Assign modal triggered for Task ID: ${taskId}`); // Debugging log

  // Create or reference the modal container
  let modal = document.getElementById('assign-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'assign-modal';
    modal.className = 'modal-container';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Assign Task</h3>
        <select id="assignee-select">
          <option value="">Loading...</option>
        </select>
        <button id="assign-btn">Assign</button>
        <button id="close-assign-modal">Cancel</button>
      </div>`;
    document.body.appendChild(modal);
  }

  modal.style.display = 'flex';

  // Fetch vendors and managers from the API
  const assigneeSelect = document.getElementById('assignee-select');
  try {
    const [vendorsResponse, managersResponse] = await Promise.all([
      fetch('/api/vendors'),
      fetch('/api/managers')
    ]);

    if (!vendorsResponse.ok || !managersResponse.ok) throw new Error('Failed to fetch data');

    const vendors = await vendorsResponse.json();
    const managers = await managersResponse.json();

    // Populate dropdown
    assigneeSelect.innerHTML = '<option value="">Select an assignee</option>';

    // Add Vendors
    if (vendors.length) {
      const vendorGroup = document.createElement('optgroup');
      vendorGroup.label = 'Vendors';
      vendors.forEach((vendor) => {
        const option = document.createElement('option');
        option.value = vendor._id;
        option.textContent = vendor.name;
        vendorGroup.appendChild(option);
      });
      assigneeSelect.appendChild(vendorGroup);
    }

    // Add Managers
    if (managers.length) {
      const managerGroup = document.createElement('optgroup');
      managerGroup.label = 'Managers';
      managers.forEach((manager) => {
        const option = document.createElement('option');
        option.value = manager._id;
        option.textContent = manager.name;
        managerGroup.appendChild(option);
      });
      assigneeSelect.appendChild(managerGroup);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    assigneeSelect.innerHTML = '<option value="">Failed to load assignees</option>';
  }

  // Add click event to assign vendor/manager
  document.getElementById('assign-btn').onclick = async () => {
    const assigneeId = assigneeSelect.value;
    if (!assigneeId) {
      alert('Please select an assignee.');
      return;
    }

    try {
      const response = await fetch(`/api/task/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: assigneeId }),
      });

      const data = await response.json();
      if (data.success) {
         // Send email notification
         sendTaskAssignmentEmail(taskId);  
        modal.style.display = 'none'; // Close the modal
        loadTasks(window.location.pathname.split('/').pop()); // Reload tasks
      } else {
        throw new Error(data.error || 'Failed to assign task');
      }
    } catch (error) {
      console.error('Error assigning task:', error);
      alert('An error occurred while assigning the task.');
    }
  };

  // Add click event to close the modal
  document.getElementById('close-assign-modal').onclick = () => {
    modal.style.display = 'none';
  };
}





// Function to open the "Add Due Date" modal
function openDueDatePicker(taskId, buttonElement) {
  console.log(`openDueDatePicker called for taskId: ${taskId}`); // Debugging log

  // Remove any existing date pickers
  const existingPicker = document.querySelector(".flatpickr-calendar");
  if (existingPicker) {
    existingPicker.remove();
  }

  // Create the Flatpickr input element
  const rect = buttonElement.getBoundingClientRect();
  const dateInput = document.createElement("input");
  dateInput.type = "text";
  dateInput.classList.add("inline-date-picker");

  dateInput.style.position = "absolute";
  dateInput.style.top = `${rect.top + window.scrollY + buttonElement.offsetHeight}px`;
  dateInput.style.left = `${rect.left}px`;
  dateInput.style.zIndex = "1000";

  document.body.appendChild(dateInput);

  // Initialize Flatpickr on the input
  flatpickr(dateInput, {
    defaultDate: new Date(),
    onChange: async (selectedDates, dateStr) => {
      console.log(`Selected Date: ${dateStr}`); // Debug log
      try {
        const response = await fetch(`/api/task/${taskId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dueDate: dateStr }),
        });

        if (!response.ok) throw new Error("Failed to update due date");

        // Update the displayed due date
        const dueDateElement = buttonElement
          .closest(".task-extra-actions")
          .querySelector(".task-due-date");
        dueDateElement.textContent = `Due: ${dateStr}`;
      } catch (error) {
        console.error(error);
        alert("Failed to update due date.");
      }

      // Remove the date picker after selection
      dateInput.remove();
    },
  });

  // Automatically focus the Flatpickr input
  dateInput.focus();

  // Remove the date picker if the user clicks elsewhere
  dateInput.addEventListener("blur", () => {
    setTimeout(() => dateInput.remove(), 200); // Delay removal to allow Flatpickr actions
  });
}




// Example: Update due date dynamically after setting
function updateTaskDueDate(taskId, newDueDate) {
  const taskItem = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
  const dueDateElement = taskItem.querySelector('.task-due-date');
  dueDateElement.textContent = `Due: ${newDueDate}`;
}


// Function to open the edit task modal and prefill the form
async function openEditTaskModal(taskId) {
  if (!taskId) {
    console.error('Task ID is missing in openEditTaskModal.');
    alert('Task ID is missing. Please try again.');
    return;
  }

  const modal = document.getElementById('edit-task-modal');
  modal.style.display = 'flex';

  await populateVendorsDropdown();

  try {
    const response = await fetch(`/api/task/${taskId}`);
    if (!response.ok) throw new Error('Failed to fetch task details');

    const { task } = await response.json();
    document.getElementById('edit-task-title').value = task.title || '';
    document.getElementById('edit-task-description').value = task.description || '';
    document.getElementById('edit-task-due-date').value = task.dueDate
      ? new Date(task.dueDate).toISOString().split('T')[0]
      : '';
    document.getElementById('edit-task-completed').checked = !!task.completed;
    document.getElementById('edit-task-assigned-to').value = task.assignedTo?._id || '';

    document.getElementById('save-task-button').onclick = () => updateTask(taskId);
  } catch (error) {
    console.error('Error loading task for editing:', error);
  }
}



// Function to update a task
async function updateTask(taskId) {
  const title = document.getElementById('edit-task-title').value;
  const description = document.getElementById('edit-task-description').value;
  const dueDate = document.getElementById('edit-task-due-date').value;
  const completed = document.getElementById('edit-task-completed').checked;
  const assignedTo = document.getElementById('edit-task-assigned-to').value;

  try {
    const response = await fetch(`/api/task/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, dueDate, completed, assignedTo }),
    });

    const data = await response.json();
    if (data.success) {
      const projectId = getProjectId();
      loadTasks(projectId);
      closeEditTaskModal();
    } else {
      throw new Error(data.error || 'Failed to update task');
    }
  } catch (error) {
    console.error('Error updating task:', error);
    alert('An error occurred while updating the task.');
  }
}


// Function to close the edit task modal
function closeEditTaskModal() {
  document.getElementById('edit-task-modal').style.display = 'none';
}





// Function to delete task
async function deleteTask(taskId) {
  if (!taskId) {
    console.error("❌ Error: Task ID is missing.");
    alert("Task ID is missing. Please try again.");
    return;
  }

  if (!confirm("Are you sure you want to delete this task?")) {
    return; // Exit if the user cancels the confirmation
  }

  try {
    // Perform the API call to delete the task
    const response = await fetch(`/api/task/${taskId}`, { method: "DELETE" });

    // Handle different response cases
    if (!response.ok) {
      if (response.status === 404) {
       
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete task.");
      }
    } else {
      const result = await response.json();

      if (result.success) {
        
        const projectId = getProjectId();

        // Reload tasks to update the UI
        loadTasks(projectId);
      } else {
        throw new Error(result.message || "Failed to delete the task.");
      }
    }
  } catch (error) {
    console.error("❌ Error deleting task:", error);
    alert(`An error occurred while deleting the task: ${error.message}`);
  }
}






// Toggle task completion status
async function toggleTaskStatus() {
  const taskId = document.getElementById('task-details').dataset.taskId; // Get task ID
  const statusButton = document.getElementById('task-status-toggle'); // Get button

  try {
    // Fetch current task details to get current status
    const response = await fetch(`/api/task/${taskId}`);
    if (!response.ok) throw new Error('Failed to fetch task details');
    const { task } = await response.json();

    // Toggle the status
    const updatedStatus = !task.completed;

    // Update the status in the backend
    const updateResponse = await fetch(`/api/task/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: updatedStatus }),
    });
    if (!updateResponse.ok) throw new Error('Failed to update task status');

    // Update the button text and styling
    if (updatedStatus) {
      statusButton.textContent = 'Completed';
      statusButton.classList.add('completed');
    } else {
      statusButton.textContent = 'Mark as Completed';
      statusButton.classList.remove('completed');
    }

    // Optionally, reload task list or update task section
    const projectId = getProjectId();
    loadTasks(projectId); // Reload task list to reflect updated status
  } catch (error) {
    console.error('Error toggling task status:', error);
  }
}






// Add photo to the preview section
function addPhotoToPreview(photoUrl, photoId, type) {
  const previewContainer =
    type === 'before'
      ? document.getElementById('before-photo-preview')
      : document.getElementById('after-photo-preview');

  const photoElement = document.createElement('div');
  photoElement.classList.add('photo-item');
  photoElement.dataset.photoId = photoId;

  photoElement.innerHTML = `
    <img src="${photoUrl}" alt="${type} photo" onclick="displayPhotoModal('${photoUrl}')">
    <button class="delete-photo-btn" onclick="deletePhoto('${photoId}', '${type}')">×</button>
  `;

  previewContainer.appendChild(photoElement);
}



// Function to delete a photo

async function deletePhoto(photoId, type) {
  // Extract filename if the photoId includes a path
  const filename = photoId.includes('/uploads/') ? photoId.split('/uploads/')[1] : photoId;

  

  try {
    const response = await fetch(`/api/delete-photo/${filename}`, { method: 'DELETE' });

    if (!response.ok) throw new Error('Failed to delete photo');

    

    // Reload task details to reflect changes
    const taskId = document.getElementById('task-details').dataset.taskId;
    displayTaskDetails(taskId);
  } catch (error) {
    console.error('Error deleting photo:', error);
    alert('An error occurred while deleting the photo.');
  }
}



// Function to display task details

async function displayTaskDetails(taskId) {
  if (!taskId) {
    console.error("Task ID is undefined in displayTaskDetails");
    alert("Task ID is missing. Please try again.");
    return;
  }

  const taskDetailsContainer = document.getElementById("task-details");
  taskDetailsContainer.dataset.taskId = taskId; // Store the task ID
  taskDetailsContainer.style.display = "block";

  try {
    // Fetch task details
    const response = await fetch(`/api/task/${taskId}`);
    if (!response.ok) throw new Error("Failed to fetch task details");

    const { task } = await response.json();

    // Populate task details in the UI
    document.getElementById("task-title").textContent = task.title || "No Title";
    document.getElementById("task-description").textContent = task.description || "No Description";
    document.getElementById("task-due-date").textContent = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString()
      : "No Due Date";
    document.getElementById("task-assigned-to").textContent = task.assignedTo?.name || "Unassigned";

    document.getElementById("task-comments-section").dataset.taskId = taskId;

    
    // Update task status button
    const statusButton = document.querySelector(".mark-completed-button");
    if (task.completed) {
      statusButton.textContent = "Completed";
      statusButton.classList.add("completed");
    } else {
      statusButton.textContent = "Mark as Completed";
      statusButton.classList.remove("completed");
    }

    // Populate photos
    populatePhotos(task.photos?.before || [], "before");
    populatePhotos(task.photos?.after || [], "after");

    // Attach event listeners for the edit and delete buttons
    const editButton = document.getElementById("edit-task-btn");
    const deleteButton = document.getElementById("delete-task-btn");

    editButton.onclick = () => {
      console.log(`Editing task with ID: ${taskId}`);
      openEditTaskModal(taskId);
    };

    deleteButton.onclick = () => {
      console.log(`Deleting task with ID: ${taskId}`);
      deleteTask(taskId);
    };

    // Add click event listener to toggle status
    statusButton.onclick = async () => {
      try {
        const updatedStatus = !task.completed;

        const updateResponse = await fetch(`/api/task/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: updatedStatus }),
        });

        if (!updateResponse.ok) throw new Error("Failed to update task status");

        displayTaskDetails(taskId);
        const projectId = getProjectId();
        loadTasks(projectId);
      } catch (error) {
        console.error("Error updating task status:", error);
      }
    };



    

    // Load comments for the task
    loadComments(taskId);

    // Attach comment submission functionality
    document.getElementById("add-comment-button").onclick = () => {
      const taskId = document.getElementById("task-comments-section").dataset.taskId;
      const commentText = document.getElementById("new-comment").value.trim();
      if (commentText) {
        addComment(taskId, commentText);
      } else {
        alert("Please write a comment before submitting.");
      }
    };
  } catch (error) {
    console.error("Error loading task details:", error);
    taskDetailsContainer.innerHTML = "<p>Error loading task details.</p>";
  }
}




// Function to add a comment with manager name and timestamp
async function addComment(taskId, commentText) {
  const managerName = localStorage.getItem('managerName'); // Retrieve the name of the logged-in user
  const managerId = localStorage.getItem('managerId'); // Retrieve the ID of the logged-in user

  if (!managerName || !managerId) {
    alert('Manager information is not available. Please log in again.');
    return;
  }

  const commentData = {
    taskId,
    comment: commentText,
    managerName,
    managerId, // Include the user ID
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentData),
    });

    if (response.ok) {
      document.getElementById('new-comment').value = ''; // Clear the comment input
      loadComments(taskId); // Reload comments
    } else {
      throw new Error('Failed to add comment');
    }
  } catch (error) {
    console.error('Error adding comment:', error);
    alert('An error occurred while adding the comment.');
  }
}


  

// Function to load comments with manager's name and timestamp
async function loadComments(taskId) {
  try {
    const response = await fetch(`/api/comments?taskId=${taskId}`);
    if (response.ok) {
      const { comments } = await response.json();
      const commentsList = document.getElementById("comments-list");

      if (comments.length) {
        commentsList.innerHTML = comments.map((comment) => {
          const date = new Date(comment.timestamp).toLocaleString();  // Format timestamp

          return `
            <div class="comment-item">
              <p>${comment.text}</p>
              <small>By: ${comment.managerName} on ${date}</small>
            </div>
          `;
        }).join("");
      } else {
        commentsList.innerHTML = "<p>No comments yet.</p>";
      }
    } else {
      throw new Error("Failed to load comments");
    }
  } catch (error) {
    console.error("Error loading comments:", error);
    document.getElementById("comments-list").innerHTML = "<p>Error loading comments.</p>";
  }
}




//function to handle empty or missing photos gracefully
function populatePhotos(photos = [], type) {
  const previewContainer =
    type === 'before'
      ? document.getElementById('before-photo-preview')
      : document.getElementById('after-photo-preview');

  if (!previewContainer) {
    console.error(`Photo preview container not found for type: ${type}`);
    return;
  }

  previewContainer.innerHTML = ''; // Clear any existing content

  if (!photos.length) {
    previewContainer.innerHTML = `<p>No ${type} photos available.</p>`;
    return;
  }

  photos.forEach((photoUrl) => {
    const photoElement = document.createElement('div');
    photoElement.classList.add('photo-item');

    photoElement.innerHTML = `
      <img src="${photoUrl}" alt="${type} photo" onclick="displayPhotoModal('${photoUrl}')">
      <button class="delete-photo-btn" onclick="deletePhoto('${photoUrl}', '${type}')">×</button>
    `;

    previewContainer.appendChild(photoElement);
  });
}


//Function to Display Photo in Larger View

function displayPhotoModal(photoUrl) {
  if (!photoUrl) {
    console.error('Photo URL is missing.');
    alert('Error: Unable to display the photo.');
    return;
  }

  let modal = document.getElementById('photo-modal');
  if (!modal) {
    // Create modal dynamically if it doesn't exist
    modal = document.createElement('div');
    modal.id = 'photo-modal';
    modal.classList.add('modal');

    modal.innerHTML = `
      <span id="close-photo-modal" class="close-button" onclick="closePhotoModal()">&times;</span>
      <img id="photo-modal-img" class="modal-content" alt="Large Photo" />
    `;

    document.body.appendChild(modal);
  }

  const modalImg = document.getElementById('photo-modal-img');
  modalImg.src = photoUrl;
  modal.style.display = 'block';
}


//function to ensure the displayTaskDetails
async function handlePhotoUpload(event, type) {
  const files = event.target.files;
  const taskId = document.getElementById('task-details').dataset.taskId;

  if (!taskId) {
    alert('Task ID is missing. Cannot upload photos.');
    return;
  }

  const uploadButton = event.target;
  uploadButton.disabled = true; // Disable the button during upload

  const uploadedFiles = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append('photos', file);
    formData.append('type', type);
    formData.append('taskId', taskId);

    try {
      const response = await fetch('/api/upload-photos', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        uploadedFiles.push(result.photoUrl); // Assuming your API returns the uploaded photo URL
      } else {
        console.error('Failed to upload photo:', await response.text());
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
    }
  }

  uploadButton.disabled = false; // Re-enable the button

  // Refresh the task details to show updated photos
  if (uploadedFiles.length > 0) {
    displayTaskDetails(taskId);
  }
}


//Function to Close the Modal photo 

function closePhotoModal() {
  const modal = document.getElementById('photo-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}


// Function to load vendors and populate the "Assigned To" dropdown
async function populateVendorsDropdown() {
  const dropdown = document.getElementById('edit-task-assigned-to');
  dropdown.innerHTML = '<option value="">Select a vendor</option>'; // Reset options

  try {
    const [vendorsResponse, managersResponse] = await Promise.all([
      fetch('/api/vendors'),
      fetch('/api/managers')
    ]);

    if (!vendorsResponse.ok || !managersResponse.ok) throw new Error('Failed to fetch data');

    const vendors = await vendorsResponse.json();
    const managers = await managersResponse.json();

    // Add Vendors to Dropdown
    if (vendors.length) {
      const vendorGroup = document.createElement('optgroup');
      vendorGroup.label = 'Vendors';
      vendors.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor._id;
        option.textContent = vendor.name;
        vendorGroup.appendChild(option);
      });
      dropdown.appendChild(vendorGroup);
    }

    // Add Managers to Dropdown
    if (managers.length) {
      const managerGroup = document.createElement('optgroup');
      managerGroup.label = 'Managers';
      managers.forEach(manager => {
        const option = document.createElement('option');
        option.value = manager._id;
        option.textContent = manager.name;
        managerGroup.appendChild(option);
      });
      dropdown.appendChild(managerGroup);
    }
  } catch (error) {
    console.error('Error populating dropdown:', error);
    dropdown.innerHTML = '<option value="">Error loading data</option>';
  }
}


// Ensure the modal is hidden on page load
document.addEventListener('DOMContentLoaded', () => {
  const projectId = getProjectId();
  loadProjectDetails(projectId);
  loadTasks(projectId);

  // Ensure edit task modal and task details container are hidden initially
  const editTaskModal = document.getElementById('edit-task-modal');
  const taskDetailsContainer = document.getElementById('task-details');

  if (editTaskModal) editTaskModal.style.display = 'none';
  if (taskDetailsContainer) taskDetailsContainer.style.display = 'none';

  document.querySelector('.close-task-details').onclick = () => {
    taskDetailsContainer.style.display = 'none';
  };
});


// Customizing the "Close" button in the task details section
document.getElementById('task-details').querySelector('.close-task-details').onclick =
  () => {
    document.getElementById('task-details').style.display = 'none';
  };


// Add click event listeners for tasks
function addTaskClickListeners() {
  const taskItems = document.querySelectorAll('.task-item');
  taskItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      const taskId = event.currentTarget.dataset.taskId;
      displayTaskDetails(taskId);
    });
  });
}


// Function to create a new task
function createNewTask() {
  const projectId = getProjectId();
  window.location.href = `/create-task.html?projectId=${projectId}`;
}


// Enable drag-and-drop functionality for sections
function enableDragAndDrop() {
  const sections = document.querySelectorAll('.details-section');

  sections.forEach((section) => {
    section.setAttribute('draggable', true);

    section.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', section.id);
      section.style.opacity = '0.5';
    });

    section.addEventListener('dragend', () => {
      section.style.opacity = '1';
    });

    section.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    section.addEventListener('drop', (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData('text/plain');
      const draggedElement = document.getElementById(draggedId);

      if (draggedElement && section !== draggedElement) {
        const container = document.querySelector('.container');
        container.insertBefore(draggedElement, section.nextSibling);
      }
    });
  });
}

// Dynamically load projects into the sidebar
async function loadSidebarProjects() {
  const sidebarProjectsList = document.getElementById('sidebar-projects-list');
  sidebarProjectsList.innerHTML = '<li>Loading Projects...</li>';

  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to fetch projects');

    const data = await response.json();
    sidebarProjectsList.innerHTML = '';

    if (data.projects.length === 0) {
      sidebarProjectsList.innerHTML = '<li>No projects found</li>';
    } else {
      data.projects.forEach((project) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<a href="/details/projects/${project._id}">${project.name}</a>`;
        sidebarProjectsList.appendChild(listItem);
      });
    }
  } catch (error) {
    console.error('Error loading projects:', error);
    sidebarProjectsList.innerHTML = '<li>Error loading projects</li>';
  }
}

  // Placeholder functions for interactive elements

  
  function createSchedule() {
   
    window.location.href = `/schedule.html`;
  }
  
 

// Function to load estimates for the current project with edit and assignment options
async function loadEstimates(projectId) {
  const estimatesList = document.getElementById("estimates-list");
  const estimatesCount = document.getElementById("estimates-count");

  try {
    const response = await fetch(`/api/estimates?projectId=${projectId}`);
    if (!response.ok) throw new Error("Failed to fetch estimates");

    const { estimates } = await response.json();

    if (!estimates || estimates.length === 0) {
      estimatesList.innerHTML = "<p>No estimates found.</p>";
      estimatesCount.textContent = "(0)";
    } else {
      estimatesCount.textContent = `(${estimates.length})`;
      estimatesList.innerHTML = estimates
        .map((estimate) => `
          <div class="estimate-item">
          ${estimate.title ? `<h3 class="estimate-title">${estimate.title}</h3>` : ""}
            <p><strong>Invoice #:</strong> ${estimate.invoiceNumber}</p>
            <p><strong>Total:</strong> $${estimate.total.toFixed(2)}</p>

            <!-- View, Edit, and Delete Buttons -->
            <button class="view-estimate-button" onclick="viewEstimate('${estimate._id}')">View</button>
            <button class="edit-estimate-button" onclick="editEstimate('${projectId}', '${estimate._id}')">Edit</button>
            <button class="delete-estimate-button" onclick="deleteEstimate('${estimate._id}')">Delete</button>

           
          </div>
        `).join("");
    }
     // Reload tasks to update the UI
     loadTasks(projectId);
  } catch (error) {
    console.error("Error loading estimates:", error);
    estimatesList.innerHTML = "<p>An error occurred while loading estimates.</p>";
  }
}

// Function to navigate to the edit estimate page
function editEstimate(projectId, estimateId) {
  window.location.href = `/estimate-edit.html?projectId=${projectId}&estimateId=${estimateId}`;
}


// Function to navigate to "Estimate Edit" page for creating a new estimate
function startFromScratch() {
  // Retrieve the project ID from the current page URL
  const projectId = getProjectId();

  if (!projectId || projectId === "undefined" || projectId === "") {
    alert("Project ID is missing from the URL");
    console.error("Project ID is missing from the URL");
    return;
  }

  // Navigate to the estimate-edit page with the projectId as a query parameter
  window.location.href = `/estimate-edit.html?projectId=${projectId}`;
}


// Function to view an existing estimate
function viewEstimate(estimateId) {
  if (!estimateId) {
    alert("Estimate ID is missing!");
    return;
  }
  window.location.href = `/estimate-view.html?estimateId=${estimateId}`;
}

// Function to delete an estimate
async function deleteEstimate(estimateId) {
  if (!confirm("Are you sure you want to delete this estimate?")) return;

  try {
    const response = await fetch(`/api/estimates/${estimateId}`, { method: "DELETE" });

    if (!response.ok) throw new Error("Failed to delete estimate");

    alert("Estimate deleted successfully!");

    const projectId = getProjectId(); // Use the helper function
    loadEstimates(projectId); // Refresh the estimates after deletion
  } catch (error) {
    console.error("Error deleting estimate:", error);
    alert("Failed to delete estimate. Please try again.");
  }
}


// Initialize the Estimates Section
document.addEventListener("DOMContentLoaded", () => {
  const projectId = getProjectId();
  if (projectId) {
    loadEstimates(projectId);
  } else {
    console.error("Project ID is missing from the URL");
  }
});



// Placeholder for importing an estimate
async function importEstimate() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".xlsx, .xls"; // ✅ Accept Excel files

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        // ✅ Extract data from the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // ✅ Convert sheet data to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        console.log("✅ Imported Estimate Data:", jsonData); // Debugging

        // ✅ Validate extracted data
        if (!jsonData.length || !jsonData[0].Category || !jsonData[0].Name) {
          alert("Invalid Excel file. Please ensure it follows the correct format.");
          return;
        }

        // ✅ Convert extracted Excel data into the required format
        const formattedEstimate = formatEstimateFromExcel(jsonData);

        // ✅ Get the current project ID
        const projectId = getProjectId();
        if (!projectId) {
          alert("Error: No project ID found.");
          return;
        }

        // ✅ Create a new estimate with extracted data
        const newEstimate = {
          projectId,
          lineItems: formattedEstimate.lineItems,
          tax: formattedEstimate.tax || 0,
        };
        console.log("🛠️ Sending Data to Backend:", JSON.stringify(newEstimate, null, 2));
        const response = await fetch("/api/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newEstimate),
        });

        if (!response.ok) {
          throw new Error("Failed to import estimate.");
        }

        const result = await response.json();
        console.log("✅ Created New Estimate:", result);

        alert("Estimate imported and created successfully!");

        // ✅ Update the UI with the new estimate
        loadEstimates(projectId);
        updateSummary();

        // ✅ Redirect to the newly created estimate for editing
        if (result.estimate && result.estimate._id) {
          window.location.href = `/estimate-edit.html?projectId=${projectId}&estimateId=${result.estimate._id}`;
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("❌ Error importing estimate:", error);
      alert("Error importing estimate. Please check the file and try again.");
    }
  });

  fileInput.click(); // ✅ Open file dialog
}

// ✅ Convert Excel JSON into required estimate format
function formatEstimateFromExcel(data) {
  const lineItemsMap = new Map();

  data.forEach((row) => {
    if (!row.Category || !row.Name || !row.Quantity || !row["Unit Price"]) {
      console.error("⚠️ Skipping row due to missing required fields:", row);
      return; // Skip invalid rows
    }

    const categoryName = row.Category.trim();
    const item = {
      name: row.Name.trim(),
      description: row.Description ? row.Description.trim() : "",
      quantity: parseInt(row.Quantity, 10) || 1,
      unitPrice: parseFloat(row["Unit Price"]) || 0,
      total: (parseInt(row.Quantity, 10) || 1) * (parseFloat(row["Unit Price"]) || 0)
    };

    if (!lineItemsMap.has(categoryName)) {
      lineItemsMap.set(categoryName, {
        type: "category", // ✅ Backend expects this
        category: categoryName,
        status: "in-progress", // ✅ Backend expects this
        items: []
      });
    }

    lineItemsMap.get(categoryName).items.push(item);
  });

  const lineItems = Array.from(lineItemsMap.values()).filter(category => category.items.length > 0);

  return {
    lineItems,
    tax: 0 // Default tax to 0 if not provided
  };
}

// Placeholder for using a template
function useTemplate() {
  alert("Template Estimate functionality coming soon!");
}

// Initialize the Estimates Section
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname; // Example: "/details/projects/6786e1f79dd13d8bd5533d12"
  const pathSegments = path.split("/"); // Split the path into segments
  const projectId = pathSegments[pathSegments.length - 1]; // Get the last segment (projectId)

  console.log("Extracted projectId:", projectId);

  if (!projectId) {
    alert("Project ID is missing. Redirecting to the project list.");
    window.location.href = "/dashboard"; // Redirect to a safe page
    return;
  }

  // Load tasks or estimates for the project
  loadTasks(projectId);
  loadEstimates(projectId);
});



  
  function useTemplate() {
    alert('Choose a template for estimates.');
  }

  document.addEventListener("DOMContentLoaded", () => { 
    const pathSegments = window.location.pathname.split('/');
    const projectId = pathSegments.includes('projects') ? pathSegments[pathSegments.indexOf('projects') + 1] : null;
  
    if (projectId) {
      fetch(`/api/projects/${projectId}/files`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch files');
          }
          return response.json();
        })
        .then(files => {
          console.log('Fetched files:', files);
          displayFiles(files);  // Ensure this function is accessible
        })
        .catch(error => {
          console.error('Error fetching files:', error);
        });
    } else {
      console.error("Project ID is missing from the URL");
    }
  
    // Upload Files Functionality
    function uploadFiles() {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,application/pdf'; 
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      
      fileInput.addEventListener('change', handleFiles);
      
      document.body.appendChild(fileInput);
      fileInput.click();
    }
  
    async function handleFiles(event) {
      const files = event.target.files;
      
      if (!projectId) {
        console.error("Project ID is missing from the URL");
        alert("Project ID is missing. Please refresh the page or navigate properly.");
        return;
      }
      
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));
      
      try {
        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Failed to upload files');
        
        const uploadedFiles = await response.json();
        displayFiles(uploadedFiles.files);  // Make sure this points to the correct array
      } catch (error) {
        console.error('Error uploading files:', error);
        alert('Failed to upload files. Please check the console for more details.');
      }
    }
  
    

// ✅ Display Files Function (Ensures Correct URL Format for Render)
function displayFiles(files) {
    const filesContainer = document.getElementById('uploaded-files-container');
    filesContainer.innerHTML = '';  // Clear previous content

    if (!Array.isArray(files)) {
        console.error('Expected an array but got:', files);
        return;
    }

    // ✅ Base URL for uploaded files on Render
    const BASE_URL = "https://node-mongodb-api-1h93.onrender.com/uploads/";

    files.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.classList.add('file-item');

        // ✅ Ensure the correct filename format (with timestamp prefix)
        let correctFilename = file.path.split('/').pop();  // Extracts full filename with timestamp

        if (!correctFilename.includes('-')) {
            console.warn(`⚠️ Potentially incorrect filename format: ${correctFilename}`);
        }

        // ✅ Construct the correct file URL
        const fileUrl = `${BASE_URL}${encodeURIComponent(correctFilename)}`;

        if (file.mimetype.startsWith('image/')) {
            // ✅ Display Image
            const img = document.createElement('img');
            img.src = fileUrl;
            img.style.width = '150px';
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => window.open(fileUrl, '_blank'));
            fileElement.appendChild(img);
        } else {
            // ✅ Display Other Files as Links
            const fileLink = document.createElement('a');
            fileLink.href = fileUrl;
            fileLink.target = '_blank';
            fileLink.textContent = correctFilename;

            const fileIcon = document.createElement('i');
            fileIcon.className = 'fas fa-file-alt'; // FontAwesome file icon
            fileLink.prepend(fileIcon);

            fileElement.appendChild(fileLink);
        }

        // ✅ Add Delete Icon
        const removeIcon = document.createElement('i');
        removeIcon.className = 'fas fa-times'; // FontAwesome "x" icon
        removeIcon.style.cursor = 'pointer';
        removeIcon.style.marginLeft = '10px';
        removeIcon.addEventListener('click', () => deleteFile(file._id, fileElement));

        fileElement.appendChild(removeIcon);
        filesContainer.appendChild(fileElement);
    });
}



  
    // Delete File Function
    async function deleteFile(fileId, fileElement) {
      try {
        const response = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete file');
        
        fileElement.remove();
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }
  
    // Expose the uploadFiles function globally
    window.uploadFiles = uploadFiles;
  });

  
  
  
  
  function customizeSelection() {
    window.location.href = `/Selection-Board.html`;
  }
  
  
  async function sendNotificationEmail(to, subject, text) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
    }
  }
  
  

 // Consolidated event listener for page initialization
document.addEventListener('DOMContentLoaded', () => {
  const projectId = getProjectId();
  loadProjectDetails(projectId);
  loadTasks(projectId);
  loadEstimates(projectId);
  enableDragAndDrop();
  loadSidebarProjects();
  setupManageTeamModal();

  // Sidebar toggle functionality
  const sidebar = document.querySelector('.sidebar');
  const toggleButton = document.createElement('button');
  toggleButton.textContent = '☰';
  toggleButton.className = 'sidebar-toggle';
  document.body.insertBefore(toggleButton, document.body.firstChild);

  toggleButton.addEventListener('click', () => {
    
    sidebar.classList.toggle('open');
  });

  

  // Redirect to Home/Dashboard
  const homeLink = document.querySelector('.home-option a');
  if (homeLink) {
    homeLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/'; // Adjust the route for the BESF dashboard
    });
  }
});



/** 
 * Setup Manage Team Modal (Ensures correct placement)
 */
function setupManageTeamModal() {
  const modal = document.createElement("div");
  modal.id = "manageTeamModal";
  modal.className = "modal-container";
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Manage Team</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="vendorList"></tbody>
      </table>
      <button onclick="closeModal()">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  // Add click event to open modal button
  document.addEventListener("click", function (event) {
    if (event.target.matches("#manage-team-btn")) {
      openModal();
    }
  });

  // Close modal event listener
  document.addEventListener("click", function (event) {
    if (event.target.matches(".modal-container")) {
      closeModal();
    }
  });
}

/** 
 * Open Manage Team Modal and Load Vendors
 */
function openModal() {
  const modal = document.getElementById("manageTeamModal");
  modal.style.display = "block";
  fetchVendors();
}

/** 
 * Close Manage Team Modal
 */
function closeModal() {
  const modal = document.getElementById("manageTeamModal");
  modal.style.display = "none";
}

/** 
 * Fetch Vendors and Populate Table
 */
async function fetchVendors() {
  try {
    const response = await fetch(`/api/projects/${getProjectId()}/vendors`);
    const data = await response.json();
    if (!data.success) throw new Error(data.message);

    const vendorList = document.getElementById("vendorList");
    vendorList.innerHTML = "";

    data.vendors.forEach((vendor) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${vendor.name}</td>
        <td>${vendor.email}</td>
        <td>${vendor.phone}</td>
        <td>
          <button onclick="editVendor('${vendor._id}', '${vendor.name}', '${vendor.email}', '${vendor.phone}')">Edit</button>
          <button onclick="removeVendor('${vendor._id}')">Remove</button>
        </td>
      `;
      vendorList.appendChild(row);
    });
  } catch (error) {
    console.error("Error fetching vendors:", error);
  }
}

/** 
 * Remove Vendor
 */
async function removeVendor(vendorId) {
  try {
    await fetch(`/api/projects/${getProjectId()}/vendors/${vendorId}`, { method: "DELETE" });
    alert("Vendor removed!");
    fetchVendors();
  } catch (error) {
    console.error("Error removing vendor:", error);
  }
}

/** 
 * Edit Vendor
 */
function editVendor(vendorId, name, email, phone) {
  const newName = prompt("Enter new name:", name);
  const newEmail = prompt("Enter new email:", email);
  const newPhone = prompt("Enter new phone:", phone);

  if (newName && newEmail && newPhone) {
    updateVendor(vendorId, newName, newEmail, newPhone);
  }
}

/** 
 * Update Vendor
 */
async function updateVendor(vendorId, name, email, phone) {
  try {
    await fetch(`/api/vendors/${vendorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone }),
    });
    alert("Vendor updated!");
    fetchVendors();
  } catch (error) {
    console.error("Error updating vendor:", error);
  }
}

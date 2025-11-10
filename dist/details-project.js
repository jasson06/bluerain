/* Production hardening: disable console.log in the UI bundle */
if (typeof window !== 'undefined' && window.console && typeof window.console.log === 'function') {
  try { window.console.log = function(){}; } catch (e) {}
}

// Ensure mobile-friendly viewport meta is present
(function ensureViewportMeta(){
  try {
    if (!document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement('meta');
      m.name = 'viewport';
      m.content = 'width=device-width, initial-scale=1, maximum-scale=1';
      document.head.appendChild(m);
    }
  } catch {}
})();

// Helper function to consistently extract projectId from URL
function getProjectId() {
  try {
    const url = new URL(window.location.href);
    // 1) Prefer explicit query param
    const fromQuery = url.searchParams.get('projectId');
    if (fromQuery) return fromQuery;

    // 2) Handle pretty route: /details/projects/:id
    const segments = url.pathname.split('/').filter(Boolean);
    const idx = segments.indexOf('projects');
    if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];

    // 3) Fallback: last segment if it looks like an ObjectId
    const last = segments[segments.length - 1] || '';
    const objectIdRegex = /^[a-fA-F0-9]{24}$/;
    if (objectIdRegex.test(last)) return last;
  } catch (e) {
    console.warn('getProjectId parse error:', e);
  }
  return null;
}

// Organize estimates by title (case-insensitive)
function organizeEstimatesByTitle(list = [], dir = 'asc') {
  try {
    const mul = (String(dir).toLowerCase() === 'desc') ? -1 : 1;
    return [...list].sort((a, b) => {
      const ta = (a?.title || '').toString().trim().toLowerCase();
      const tb = (b?.title || '').toString().trim().toLowerCase();
      if (ta < tb) return -1 * mul;
      if (ta > tb) return 1 * mul;
      return 0;
    });
  } catch {
    return Array.isArray(list) ? list : [];
  }
}



// Reload Project Details, Tasks, and Estimates
function refreshProjectPage() {
  const projectId = getProjectId();
  loadProjectDetails(projectId);
  loadTasks(projectId);
  setupLazyEstimates(projectId);
  // Prefetch non-critical data during idle time
  onIdle(() => { try { ensureVendorsList(); } catch {} });
  onIdle(() => { try { ensureLaborCostList(); } catch {} });
}

// Run a callback when the browser is idle (with safe fallback)
function onIdle(cb) {
  try {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(cb, { timeout: 1200 });
    } else {
      setTimeout(cb, 0);
    }
  } catch { setTimeout(cb, 0); }
}

// Defer initial estimates load until the section is visible
function setupLazyEstimates(projectId) {
  try {
    const target = document.getElementById('estimates-list') || document.getElementById('estimates-section');
    if (!target) {
      // Fallback: load shortly after to avoid blocking first paint
      setTimeout(() => loadEstimates(projectId), 200);
      return;
    }
    showEstimatesSkeleton();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        const vis = entries.some(e => e.isIntersecting);
        if (vis) {
          io.disconnect();
          loadEstimates(projectId);
        }
      }, { root: null, threshold: 0.15 });
      io.observe(target);
    } else {
      // Older browsers: defer a bit but still load
      setTimeout(() => loadEstimates(projectId), 200);
    }
  } catch {
    setTimeout(() => loadEstimates(projectId), 200);
  }
}

// Lightweight skeleton for estimates section
function showEstimatesSkeleton() {
  try {
    const existing = document.getElementById('skeleton-styles');
    const css = `
      :root { --sk-bg:#f1f5f9; --sk-shimmer:rgba(255,255,255,0.65); --sk-card:#ffffff; --sk-border:#e5e7eb; }
      .sk-animate { position: relative; overflow: hidden; background: var(--sk-bg); }
      .sk-animate::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, var(--sk-shimmer), transparent); animation: sk 1.1s infinite; }
      @keyframes sk { to { transform: translateX(100%); } }
      .sk-card { border: 1px solid var(--sk-border); border-radius: 14px; padding: 16px; box-shadow: 0 6px 20px rgba(2,6,23,0.06); background: var(--sk-card); }
      .sk-header { display:flex; gap:14px; align-items:center; }
      .sk-circle { width: 90px; height: 90px; border-radius: 50%; position: relative; background: radial-gradient(circle at 50% 50%, #e2e8f0 40%, #cbd5e1 41%, #e2e8f0 60%); }
      .sk-circle::after { content:""; position:absolute; inset: 12px; border-radius:50%; background: var(--sk-card); }
      .sk-stats { display:flex; flex-direction:column; gap:8px; flex:1; }
      .sk-row { height: 12px; border-radius: 999px; }
      .sk-row.w40 { width:40%; } .sk-row.w50 { width:50%; } .sk-row.w60 { width:60%; } .sk-row.w70 { width:70%; } .sk-row.w80 { width:80%; }
      .sk-table { margin-top: 14px; border-top:1px solid var(--sk-border); padding-top: 12px; }
      .sk-thead { display:grid; grid-template-columns: 1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 0.6fr; gap:12px; align-items:center; margin-bottom: 8px; }
      .sk-th { height: 18px; border-radius: 8px; }
      .sk-rows { display:flex; flex-direction:column; gap:10px; }
      .sk-tr { display:grid; grid-template-columns: 1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 0.6fr; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--sk-border); }
      .sk-cell { height: 16px; border-radius: 8px; }
      .sk-title { display:flex; align-items:center; gap:10px; }
      .sk-caret { width:18px; height:18px; border-radius:50%; }
      .sk-badge { width: 26px; height: 26px; border-radius: 50%; display: inline-block; }
      .sk-progress { height: 10px; border-radius: 999px; }
      @media (max-width: 640px) {
        .sk-thead, .sk-tr { grid-template-columns: 1.6fr 1fr 0.9fr 0.9fr 0.9fr; }
        .sk-hide-sm { display:none; }
      }
    `;
    if (!existing) {
      const st = document.createElement('style');
      st.id = 'skeleton-styles';
      st.innerHTML = css;
      document.head.appendChild(st);
    } else {
      existing.innerHTML = css;
    }

    const el = document.getElementById('estimates-list');
    if (!el) return;
    const rows = Array.from({length: 5}).map(() => `
      <div class="sk-tr" role="row" aria-hidden="true">
        <div class="sk-title" role="cell">
          <span class="sk-animate sk-caret" aria-hidden="true"></span>
          <span class="sk-animate sk-cell" style="width: 70%"></span>
        </div>
        <span class="sk-animate sk-cell w50" role="cell"></span>
        <span class="sk-animate sk-cell w40" role="cell"></span>
        <span class="sk-animate sk-cell w60" role="cell"></span>
        <span class="sk-animate sk-cell w40" role="cell"></span>
        <span class="sk-animate sk-progress" role="cell"></span>
        <span class="sk-animate sk-cell w40 sk-hide-sm" role="cell"></span>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="sk-card" aria-busy="true" aria-live="polite">
        <div class="sk-header">
          <div class="sk-circle" aria-hidden="true"></div>
          <div class="sk-stats">
            <div class="sk-animate sk-row w80"></div>
            <div class="sk-animate sk-row w60"></div>
            <div class="sk-animate sk-row w50"></div>
          </div>
        </div>
        <div class="sk-table">
          <div class="sk-thead" role="row">
            <span class="sk-animate sk-th w60" role="columnheader"></span>
            <span class="sk-animate sk-th w40" role="columnheader"></span>
            <span class="sk-animate sk-th w40" role="columnheader"></span>
            <span class="sk-animate sk-th w40" role="columnheader"></span>
            <span class="sk-animate sk-th w40" role="columnheader"></span>
            <span class="sk-animate sk-th w60" role="columnheader"></span>
            <span class="sk-animate sk-th w30 sk-hide-sm" role="columnheader"></span>
          </div>
          <div class="sk-rows" role="rowgroup">${rows}</div>
        </div>
      </div>
    `;
  } catch {}
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function showLoader() {
  document.getElementById('loader').style.display = 'flex';
}

function hideLoader() {
  document.getElementById('loader').style.display = 'none';
}


// Function to load project details and make it a clickable tag with a dropdown icon
async function loadProjectDetails(id) {
  const projectDetailsContainer = document.getElementById('project-details');
  const projectTitle = document.getElementById('project-title');

  showLoader(); // 👈 START

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
    } finally {
      hideLoader(); // 👈 END  
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

  // Frontend validation for required fields
  const missing = [];
  if (!updatedProject.name) missing.push('Name');
  if (!updatedProject.status) missing.push('Status');
  if (!updatedProject.type) missing.push('Type');
  if (!updatedProject.code) missing.push('Code');
  if (!updatedProject.address.city) missing.push('City');
  if (!updatedProject.address.state) missing.push('State');
  if (!updatedProject.address.addressLine1) missing.push('Address Line 1');

  if (missing.length) {
    showToast(`Please fill in: ${missing.join(', ')}`);
    return;
  }

  fetch(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedProject),
  })
    .then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const msg = data.message || "Failed to update project";
        showToast(msg);
        throw new Error(msg);
      }
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

  showLoader(); // 👈 START

  try {
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });

    if (!response.ok) {
      throw new Error("Failed to delete project.");
    }

   
    closeEditProjectModal();
    window.location.href = "/"; // Redirect to the main dashboard
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    showToast("An error occurred while deleting the project. Please try again.");
  } finally {
    hideLoader(); // 👈 END
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
    showToast("All fields are required.");
    return;
  }
  showLoader(); // 👈 START
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
      showToast(`Invitations sent successfully:\n${message}`);
    closeInviteModal();
  } catch (error) {
    console.error("Error sending invites:", error);
    showToast(`Error sending invites: ${error.message}`);
  } finally {
    hideLoader(); // 👈 END
  }
}




// Close Invite Modal
function closeInviteModal() {
  document.getElementById('invite-modal').style.display = 'none';
}


// ✅ Assign Task and Send Email Notification
async function assignTask(taskId, assigneeId, assignedToModel) {

  showLoader(); // 👈 START

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

      showToast("✅ Task assigned successfully.");

      // ✅ Ensure Task ID is correctly passed
      await sendTaskAssignmentEmail(taskId);

  } catch (error) {
    showToast("❌ Error assigning task:", error);
    } finally {
      hideLoader(); // 👈 END
  }
}





// ✅ Function to Send Email Notification
async function sendTaskAssignmentEmail(taskId) {
  showLoader();
  try {
    if (!taskId) {
      console.error("❌ Task ID is missing. Cannot fetch task details.");
      return;
    }

    // Fetch task details
    const taskResponse = await fetch(`/api/task/${taskId}`);
    if (!taskResponse.ok) throw new Error("Failed to fetch task details.");
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

    // Fetch project details
    const projectResponse = await fetch(`/api/details/projects/${task.projectId}`);
    if (!projectResponse.ok) throw new Error("Failed to fetch project details.");
    const { project } = await projectResponse.json();

    if (!project || !project.address) {
      console.error("❌ Missing project details:", project);
      return;
    }

    const projectAddress = `${project.address.addressLine1 || ''}, ${project.address.city}, ${project.address.state} ${project.address.zip || ''}`.trim();
    const isVendor = task.assignedToModel.toLowerCase() === "vendor";
    const signInLink = isVendor
      ? `https://node-mongodb-api-1h93.onrender.com/sign-inpage.html`
      : `https://node-mongodb-api-1h93.onrender.com/project-manager-auth.html`;

    // Modern HTML email structure (inline styles, table layout)
    const emailHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
        <tr>
          <td align="center">
            <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px #2563eb22;margin:32px 0;">
              <tr>
                <td style="padding:32px;">
                  <h2 style="color:#2563eb;font-size:2em;margin-bottom:18px;">New Task Assigned</h2>
                  <p style="font-size:1.08em;color:#334155;margin:0 0 18px 0;">
                    <b>Hello ${task.assignedTo.name || ''},</b>
                  </p>
                  <p style="margin:0 0 18px 0;font-size:1.05em;">
                    You have been assigned a new task in the project:<br>
                    <b style="color:#2563eb;">${project.name}</b>
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                    <tr>
                      <td style="color:#64748b;padding:8px 0;width:120px;">Task:</td>
                      <td style="padding:8px 0;"><b>${task.title}</b></td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;padding:8px 0;">Project Address:</td>
                      <td style="padding:8px 0;">${projectAddress}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;padding:8px 0;">Due Date:</td>
                      <td style="padding:8px 0;">${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;padding:8px 0;">Description:</td>
                      <td style="padding:8px 0;">${task.description || 'No description provided.'}</td>
                    </tr>
                  </table>
                  <p style="margin:24px 0;">
                    <a href="${signInLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:1.08em;">
                      Sign In to View Task
                    </a>
                  </p>
                  <hr style="border-top:1px solid #e5e7eb;margin:32px 0 18px 0;">
                  <p style="color:#64748b;font-size:0.98em;margin:0;">
                    If you have any questions, please contact your manager.<br>
                    <span style="color:#2563eb;">Thank you!</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    const emailSubject = `New Task Assigned: ${task.title}`;
    const emailText = `
Hello ${task.assignedTo.name || ''},

You have been assigned a new task in the project: ${project.name}

Task: ${task.title}
Project Address: ${projectAddress}
Due Date: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}
Description: ${task.description || 'No description provided.'}

Sign in to view your task: ${signInLink}

If you have any questions, please contact your manager.

Thank you!
    `.trim();

    // Send email via backend
    const emailResponse = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: task.assignedTo.email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      })
    });

    if (!emailResponse.ok) throw new Error("Failed to send email notification.");
    showToast("✅ Email notification sent successfully.");

  } catch (error) {
    showToast("❌ Error sending email notification.");
    console.error(error);
  } finally {
    hideLoader();
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
      showToast('Please select an assignee.');
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
      showToast('An error occurred while assigning the task.');
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
        showToast("Failed to update due date.");
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
    showToast('Task ID is missing. Please try again.');
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
  showLoader(); // 👈 START
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
    showToast('An error occurred while updating the task.');
  } finally {
    hideLoader(); // 👈 END
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
    showToast("Task ID is missing. Please try again.");
    return;
  }

  if (!confirm("Are you sure you want to delete this task?")) {
    return; // Exit if the user cancels the confirmation
  }
  showLoader(); // 👈 START
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
    showToast(`An error occurred while deleting the task: ${error.message}`);
  } finally {
    hideLoader(); // 👈 END
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

  
  showLoader(); // 👈 START
  try {
    const response = await fetch(`/api/delete-photo/${filename}`, { method: 'DELETE' });

    if (!response.ok) throw new Error('Failed to delete photo');

    

    // Reload task details to reflect changes
    const taskId = document.getElementById('task-details').dataset.taskId;
    displayTaskDetails(taskId);
  } catch (error) {
    console.error('Error deleting photo:', error);
    showToast('An error occurred while deleting the photo.');
  } finally {
    hideLoader(); // 👈 END
  }
}



// Function to display task details

async function displayTaskDetails(taskId) {
  if (!taskId) {
    console.error("Task ID is undefined in displayTaskDetails");
    showToast("Task ID is missing. Please try again.");
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
        showToast("An error occurred while updating the task status.");
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
        showToast("Please write a comment before submitting.");
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
    showToast('Manager information is not available. Please log in again.');
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
    showToast('An error occurred while adding the comment.');
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
    showToast('Error: Unable to display the photo.');
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
    showToast('Task ID is missing. Cannot upload photos.');
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
    showLoader(); // 👈 START
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
    } finally {
      hideLoader(); // 👈 END
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

// Smooth-scroll and focus a section from sidebar links
function scrollToSection(sectionId) {
  try {
    const section = document.getElementById(sectionId);
    if (!section) return;

    // Smooth scroll to section
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Temporary focus/highlight
    section.classList.add('focus-highlight');
    setTimeout(() => section.classList.remove('focus-highlight'), 1600);

    // Update active link state
    document.querySelectorAll('.sidebar-nav-link').forEach(a => {
      if ((a.dataset.section || '').toLowerCase() === sectionId.toLowerCase()) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  } catch (e) {
    console.error('scrollToSection error:', e);
  }
}

// Wire sidebar nav links
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.sidebar-nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      // Allow external links to navigate normally
      if (link.dataset.external === 'true') return;
      e.preventDefault();
      const target = link.dataset.section || (link.getAttribute('href') || '').replace('#','');
      if (target) scrollToSection(target);
    });
  });
  // Jobs nav link toggle (dropdown)
  const jobsLink = document.getElementById('jobs-nav-link');
  if (jobsLink) {
    jobsLink.addEventListener('click', (e) => {
      e.preventDefault();
      toggleJobsFlyout();
    });

    // Close on outside click
    document.addEventListener('mousedown', (ev) => {
      const flyout = document.getElementById('jobs-flyout');
      if (!flyout) return;
      const clickedInside = flyout.contains(ev.target) || jobsLink.contains(ev.target);
      if (!clickedInside) {
        flyout.style.display = 'none';
        jobsLink.classList.remove('active');
      }
    });

    // Close on Esc
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const flyout = document.getElementById('jobs-flyout');
        if (flyout) {
          flyout.style.display = 'none';
          jobsLink.classList.remove('active');
        }
      }
    });
  }
});

// Toggle Jobs flyout visibility and load content on first open
let jobsLoadedOnce = false;
function toggleJobsFlyout() {
  const link = document.getElementById('jobs-nav-link');
  if (!link) return;

  let flyout = document.getElementById('jobs-flyout');
  if (!flyout) {
    flyout = document.createElement('div');
    flyout.id = 'jobs-flyout';
    flyout.className = 'jobs-flyout';
    flyout.style.display = 'none';
    flyout.innerHTML = `
      <div class="jobs-flyout-search">
        <input id="jobs-flyout-search" class="search-input" type="text" placeholder="Search jobs" />
      </div>
      <div id="jobs-flyout-content"><div class="jobs-loading">Loading...</div></div>
      <div id="jobs-flyout-empty" style="display:none; color:#94a3b8; font-size:0.9em; padding:6px;">No matching jobs</div>
    `;
    document.body.appendChild(flyout);
  }

  const opening = flyout.style.display === 'none' || flyout.style.display === '';
  flyout.style.display = opening ? 'block' : 'none';

  // Active link styling
  document.querySelectorAll('.sidebar-nav-link').forEach(a => a.classList.remove('active'));
  if (opening) link.classList.add('active');

  // Position the flyout next to the Jobs link (outside sidebar)
  if (opening) {
    positionJobsFlyout();
    if (!jobsLoadedOnce) {
      loadJobsFlyout();
      jobsLoadedOnce = true;
    }
  }
}

function positionJobsFlyout() {
  const link = document.getElementById('jobs-nav-link');
  const flyout = document.getElementById('jobs-flyout');
  if (!link || !flyout) return;
  const rect = link.getBoundingClientRect();
  const isMobile = window.innerWidth <= 640;
  if (isMobile) {
    // Full-width-ish drawer near the trigger for mobile
    flyout.style.left = `12px`;
    // Try placing just under the Jobs link; clamp to viewport
    const desiredTop = rect.bottom + 8;
    const maxTop = Math.max(12, window.innerHeight - flyout.offsetHeight - 12);
    const safeTop = Math.max(12, Math.min(desiredTop, maxTop));
    flyout.style.top = `${safeTop}px`;
  } else {
    // Place to the right with a slight vertical offset on desktop
    const left = rect.right + 10; // outside sidebar, next to the button
    const top = rect.top + 2;     // slight down offset
    flyout.style.left = `${left}px`;
    flyout.style.top = `${top}px`;
  }

  // Reposition on resize and scroll while open
  const handler = () => {
    if (flyout.style.display !== 'none') {
      const r = link.getBoundingClientRect();
      const isMobile = window.innerWidth <= 640;
      if (isMobile) {
        flyout.style.left = `12px`;
        const desiredTop = r.bottom + 8;
        const maxTop = Math.max(12, window.innerHeight - flyout.offsetHeight - 12);
        const safeTop = Math.max(12, Math.min(desiredTop, maxTop));
        flyout.style.top = `${safeTop}px`;
      } else {
        flyout.style.left = `${r.right + 10}px`;
        flyout.style.top = `${r.top + 2}px`;
      }
    }
  };
  window.addEventListener('resize', handler, { passive: true });
  window.addEventListener('scroll', handler, { passive: true });
}

// Load and render jobs grouped by status in flyout
async function loadJobsFlyout() {
  const content = document.getElementById('jobs-flyout-content');
  if (!content) return;
  content.innerHTML = '<div class="jobs-loading">Loading...</div>';

  try {
    const [upcomingRes, onMarketRes, completedRes, inProgressRes] = await Promise.all([
      fetch('/api/upcoming-projects'),
      fetch('/api/on-market-projects'),
      fetch('/api/completed-projects'),
      fetch('/api/projects') // In Progress
    ]);

    const upcoming = (await upcomingRes.json()).projects || [];
    const onMarket = (await onMarketRes.json()).projects || [];
    const completed = (await completedRes.json()).projects || [];
    const inProgress = (await inProgressRes.json()).projects || [];

    // Helper to render a status group
    const renderGroup = (title, emoji, items, badgeColor = '#e5e7eb') => {
      const count = items.length;
      const listHtml = count
        ? items.map(p => {
            const name = p.name || 'Untitled';
            const letter = name.trim().charAt(0).toUpperCase() || '?';
            const color = p.color || '#3b82f6';
            const client = p.clientName || p.ownerName || '';
            return `
              <li class="job-item" data-id="${p._id}">
                <div class="job-avatar" style="background:${color};">${letter}</div>
                <div class="job-meta">
                  <div class="job-name">${name}</div>
                  <div class="job-sub">${client}</div>
                </div>
              </li>
            `;
          }).join('')
        : `<div class="jobs-loading">No projects</div>`;

      return `
        <div class="jobs-status-group">
          <div class="jobs-status-header">
            <span>${emoji} ${title}</span>
            <span style="background:${badgeColor}; padding:2px 8px; border-radius:999px; font-size:0.85em; color:#334155;">${count}</span>
          </div>
          <ul class="jobs-list">${listHtml}</ul>
        </div>
      `;
    };

    content.innerHTML = [
      renderGroup('Upcoming', '⏳', upcoming, '#fde68a'),
      renderGroup('In Progress', '🚧', inProgress, '#bae6fd'),
      renderGroup('On Market', '🏷️', onMarket, '#c7f9cc'),
      renderGroup('Completed', '✅', completed, '#e9d5ff')
    ].join('');

    // Wire click handlers to navigate to selected project
    content.querySelectorAll('.job-item').forEach(li => {
      li.addEventListener('click', () => {
        const id = li.getAttribute('data-id');
        if (!id) return;
        // Navigate to pretty route expected by the backend
        window.location.href = `/details/projects/${id}`;
      });
    });

    setupJobsSearch();
  } catch (err) {
    console.error('Failed to load jobs:', err);
    content.innerHTML = '<div class="jobs-loading">Error loading jobs</div>';
  }
}

function setupJobsSearch() {
  const input = document.getElementById('jobs-flyout-search');
  if (!input) return;

  const runFilter = () => {
    const q = (input.value || '').trim().toLowerCase();
    filterJobsFlyout(q);
  };

  input.addEventListener('input', runFilter);
}

function filterJobsFlyout(query) {
  const content = document.getElementById('jobs-flyout-content');
  const emptyState = document.getElementById('jobs-flyout-empty');
  if (!content) return;

  const groups = content.querySelectorAll('.jobs-status-group');
  let totalVisible = 0;

  groups.forEach(group => {
    const items = Array.from(group.querySelectorAll('.job-item'));
    let visibleCount = 0;
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      const match = !query || text.includes(query);
      item.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    // Update header badge count
    const header = group.querySelector('.jobs-status-header');
    if (header) {
      const badges = header.querySelectorAll('span');
      if (badges.length > 1) badges[1].textContent = visibleCount;
    }

    // Show/hide group based on visibility
    group.style.display = visibleCount > 0 ? '' : 'none';
    totalVisible += visibleCount;
  });

  if (emptyState) emptyState.style.display = totalVisible > 0 ? 'none' : 'block';
}


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
  // Show the modal instead of redirecting
  const addModal = document.getElementById('addTaskModal');
  const addForm = document.getElementById('addTaskForm');
  const closeModal = document.getElementById('closeAddTaskModal');
  const projectSelect = document.getElementById('newTaskProject');
  const assignSelect = document.getElementById('newTaskAssignedTo');
  const submitBtn = addForm ? addForm.querySelector('button[type="submit"]') : null;

  // Helper to populate project dropdown (only current project)
  async function populateProjectDropdown(selectedProjectId = '') {
    const projectId = getProjectId();
    const res = await fetch(`/api/details/projects/${projectId}`);
    const { project } = await res.json();
    projectSelect.innerHTML = `<option value="${project._id}" selected>${project.name}</option>`;
  }

  // Helper to populate assign dropdown with Managers and Vendors
  async function populateAssignDropdown() {
    const [vendorsRes, managersRes] = await Promise.all([
      fetch('/api/vendors'),
      fetch('/api/managers')
    ]);
    const vendors = await vendorsRes.json();
    const managers = await managersRes.json();

    let options = `<option value="">-- Select --</option>`;
    if (managers.length) {
      options += `<optgroup label="Managers">`;
      options += managers.map(m => `<option value="${m._id}">${m.name} (Manager)</option>`).join('');
      options += `</optgroup>`;
    }
    if (vendors.length) {
      options += `<optgroup label="Vendors">`;
      options += vendors.map(v => `<option value="${v._id}">${v.name} (Vendor)</option>`).join('');
      options += `</optgroup>`;
    }
    assignSelect.innerHTML = options;
  }

  // Show modal and reset form
  addModal.style.display = 'flex';
  addForm.reset();
  if (submitBtn) submitBtn.textContent = 'Add Task';
  populateProjectDropdown();
  populateAssignDropdown();

  // Close modal logic
  closeModal.onclick = () => {
    addModal.style.display = 'none';
    addForm.reset();
    if (submitBtn) submitBtn.textContent = 'Add Task';
  };
  window.onclick = (e) => {
    if (e.target === addModal) {
      addModal.style.display = 'none';
      addForm.reset();
      if (submitBtn) submitBtn.textContent = 'Add Task';
    }
  };

  // Handle form submit
 addForm.onsubmit = async function(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('newTaskTitle').value,
    description: document.getElementById('newTaskDesc').value,
    dueDate: document.getElementById('newTaskDueDate').value,
    projectId: document.getElementById('newTaskProject').value,
    assignedTo: document.getElementById('newTaskAssignedTo').value // This can be empty
  };

  // Only validate required fields
  if (!payload.title || !payload.projectId) {
    showToast('Please fill in all required fields.');
    return;
  }

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      showToast('Task added!');
      addForm.reset();
      addModal.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Add Task';
      loadTasks(getProjectId());
      // Only send email if assignedTo is present
      if (payload.assignedTo) {
        await sendTaskAssignmentEmail(data.task._id);
      }
    } else {
      showToast('Error saving task.');
    }
  } catch {
    showToast('Error saving task.');
  }
};
}



// Dynamically load projects into the sidebar
async function loadSidebarProjects() {
  const upcomingList = document.getElementById('upcoming-list');
  const inProgressList = document.getElementById('inprogress-list');
  const onMarketList = document.getElementById('onmarket-list');
  const completedList = document.getElementById('completed-list');

  // Helper to render each expandable section
  function renderExpandableSection(listElement, projects, label, status) {
    if (!listElement) return;
    listElement.innerHTML = '';

    // Section header with toggle
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'sidebar-section-header';
    sectionHeader.innerHTML = `
      <span class="sidebar-section-title">${label} <span class="sidebar-section-count">(${projects.length})
      <span  class="sidebar-section-toggle" aria-label="Toggle ${label}">
        <i class="fas fa-chevron-down"></i>
      </span></span></span>
    `;
    listElement.appendChild(sectionHeader);

    // Section content (project list)
    const sectionContent = document.createElement('ul');
    sectionContent.className = 'sidebar-section-content';
    sectionContent.style.display = 'none';

    if (!projects.length) {
      sectionContent.innerHTML = `<li class="sidebar-empty">None</li>`;
    } else {
      projects.forEach(project => {
        const li = document.createElement('li');
        li.className = `sidebar-project-item sidebar-${status}`;
        li.innerHTML = `
          <a href="/details/projects/${project._id}" class="sidebar-project-link">
            <span class="sidebar-project-dot" style="background:${project.color || '#3b82f6'}"></span>
            <span class="sidebar-project-name">${project.name}</span>
          
          </a>
        `;
        sectionContent.appendChild(li);
      });
    }
    listElement.appendChild(sectionContent);

    // Toggle logic
  const toggleSection = () => {
    const isOpen = sectionContent.style.display === 'block';
    sectionContent.style.display = isOpen ? 'none' : 'block';
    sectionHeader.querySelector('i').classList.toggle('rotated', !isOpen);
  };

sectionHeader.onclick = toggleSection;
}

  // Show loading state
  const loadingMarkup = '<li class="sidebar-loading">Loading...</li>';
  [upcomingList, inProgressList, onMarketList, completedList].forEach(list => {
    if (list) list.innerHTML = loadingMarkup;
  });
  showLoader();

  try {
    const [upcomingRes, onMarketRes, completedRes, inProgressRes] = await Promise.all([
      fetch('/api/upcoming-projects'),
      fetch('/api/on-market-projects'),
      fetch('/api/completed-projects'),
      fetch('/api/projects')
    ]);

    const upcoming = (await upcomingRes.json()).projects || [];
    const onMarket = (await onMarketRes.json()).projects || [];
    const completed = (await completedRes.json()).projects || [];
    const inProgress = (await inProgressRes.json()).projects || [];

    renderExpandableSection(upcomingList, upcoming, 'Upcoming', 'upcoming');
    renderExpandableSection(onMarketList, onMarket, 'On Market', 'on-market');
    renderExpandableSection(completedList, completed, 'Completed', 'completed');
    renderExpandableSection(inProgressList, inProgress, 'In Progress', 'in-progress');

  } catch (error) {
    console.error('Error loading projects:', error);
    [upcomingList, inProgressList, onMarketList, completedList].forEach(list => {
      if (list) list.innerHTML = '<li class="sidebar-error">Error loading</li>';
    });
  } finally {
    hideLoader();
  }
}





  // Placeholder functions for interactive elements

  
  function createSchedule() {
   
    window.location.href = `/schedule.html`;
  }
  
 
// Function to load estimates for the current project with edit and assignment options
let _estFetchController = null;
async function loadEstimates(projectId) {
  const estimatesList = document.getElementById("estimates-list");
  const estimatesCount = document.getElementById("estimates-count");
  const totalBudgetEl = document.getElementById("total-budget");
  showLoader();

  try {
    if (_estFetchController) { try { _estFetchController.abort(); } catch {} }
    _estFetchController = new AbortController();
    const response = await fetch(`/api/estimates?projectId=${projectId}`,{ signal: _estFetchController.signal });
    if (!response.ok) throw new Error("Failed to fetch estimates");

  const { estimates } = await response.json();

  const sortDir = localStorage.getItem('estSortDir') || 'asc';
  const sortedEstimates = organizeEstimatesByTitle(estimates || [], sortDir);

    // --- Stats for Graph ---
let totalLineItems = 0;
let completedItems = 0;
let inProgressItems = 0;
let latestEndDate = null;

// Track latest endDate for both completed and in-progress items
if (estimates && estimates.length) {
  estimates.forEach(est => {
    est.lineItems?.forEach(cat => {
      cat.items?.forEach(item => {
        totalLineItems++;
        if (item.status === "completed" || item.status === "approved") {
          completedItems++;
          if (item.endDate) {
            const itemEndDate = new Date(item.endDate);
            if (!latestEndDate || itemEndDate > latestEndDate) {
              latestEndDate = itemEndDate;
            }
          }
        } else {
          inProgressItems++;
          if (item.endDate) {
            const itemEndDate = new Date(item.endDate);
            if (!latestEndDate || itemEndDate > latestEndDate) {
              latestEndDate = itemEndDate;
            }
          }
        }
      });
    });
  });
}

    // --- Calculate % completed ---
    const percentCompleted = totalLineItems ? Math.round((completedItems / totalLineItems) * 100) : 0;

    // --- Estimate Completion Date Calculation ---
    let estimatedCompletionDate = "N/A";
    if (latestEndDate) {
      estimatedCompletionDate = latestEndDate.toLocaleDateString();
    } else if (estimates && estimates.length) {
      // If no completed items, use latest planned endDate among all items
      let plannedEndDate = null;
      estimates.forEach(est => {
        est.lineItems?.forEach(cat => {
          cat.items?.forEach(item => {
            if (item.endDate) {
              const itemEndDate = new Date(item.endDate);
              if (!plannedEndDate || itemEndDate > plannedEndDate) {
                plannedEndDate = itemEndDate;
              }
            }
          });
        });
      });
      if (plannedEndDate) {
        estimatedCompletionDate = plannedEndDate.toLocaleDateString();
      }
    }

    // --- Modern Graph HTML ---
    let graphHtml = `
      <div id="alt-estimate-graph" class="alt-estimate-graph" data-total="${totalLineItems}" data-completed="${completedItems}" data-inprogress="${inProgressItems}">
        <div class="alt-graph-circle">
          <svg width="90" height="90">
            <circle cx="45" cy="45" r="40" stroke="#e5e7eb" stroke-width="8" fill="none"/>
            <circle id="alt-graph-circle-progress" cx="45" cy="45" r="40" stroke="#3b82f6" stroke-width="8" fill="none"
              stroke-dasharray="${2 * Math.PI * 40}"
              stroke-dashoffset="${2 * Math.PI * 40 * (1 - percentCompleted / 100)}"
              style="transition: stroke-dashoffset 0.6s;"/>
            <text id="alt-graph-percent-text" x="50%" y="54%" text-anchor="middle" fill="#0f172a" font-size="1.5em" font-weight="bold" dy=".3em">${percentCompleted}%</text>
          </svg>
        </div>
        <div class="alt-graph-details">
          <div class="alt-graph-row">
            <span class="alt-graph-label">Total Items</span>
            <span id="alt-graph-total" class="alt-graph-value">${totalLineItems}</span>
          </div>
          <div class="alt-graph-row">
            <span class="alt-graph-label">Completed</span>
            <span id="alt-graph-completed" class="alt-graph-value" style="color:#10b981;">${completedItems}</span>
          </div>
          <div class="alt-graph-row">
            <span class="alt-graph-label">In Progress</span>
            <span id="alt-graph-inprogress" class="alt-graph-value" style="color:#f59e42;">${inProgressItems}</span>
          </div>
          <div class="alt-graph-row">
            <span class="alt-graph-label">Estimated Completion</span>
            <span id="alt-graph-date" class="alt-graph-value" style="color:#2563eb;">${estimatedCompletionDate}</span>
          </div>
        </div>
      </div>
    `;

    // persist last estimates for add-item modal
    window._lastEstimates = sortedEstimates;

    if (!sortedEstimates || sortedEstimates.length === 0) {
      estimatesList.innerHTML = `
        ${graphHtml}
        <div class="empty-estimates modern-card">
          <i class="fas fa-file-invoice-dollar" style="font-size: 2.5rem; color: #3b82f6;"></i>
          <p style="margin-top: 10px; color: #64748b;">No estimates found for this project.</p>
        </div>
      `;
      estimatesCount.textContent = "(0)";
      totalBudgetEl.textContent = "$0.00";
    } else {
  estimatesCount.textContent = `(${sortedEstimates.length})`;

      let totalBudget = 0;
      // Prepare vendor map for initials/name display in preview
      let vendorMap = {};
      try {
        const vendors = await (typeof ensureVendorsList === 'function' ? ensureVendorsList() : []);
        (vendors || []).forEach(v => { if (v && v._id) vendorMap[String(v._id)] = v; });
      } catch {}
      const getInitials = (full = '') => {
        try {
          const base = String(full || '').trim() || '';
          if (!base) return 'VN';
          const parts = base.split(/\s+/).filter(Boolean);
          const init = parts.slice(0,2).map(s => s[0].toUpperCase()).join('');
          return init || 'VN';
        } catch { return 'VN'; }
      };

      // Build a compact table list instead of grid cards
  const rowsHtml = sortedEstimates.map((estimate, idx) => {
        totalBudget += estimate.total || 0;
        // Per-estimate progress
        let estTotal = 0, estCompleted = 0;
        estimate.lineItems?.forEach(cat => {
          cat.items?.forEach(item => {
            estTotal++;
            if (item.status === 'completed' || item.status === 'approved') estCompleted++;
          });
        });
        const estPercent = estTotal ? Math.round((estCompleted / estTotal) * 100) : 0;
        const createdDate = estimate.createdAt ? new Date(estimate.createdAt).toLocaleDateString() : 'N/A';

        // Line items preview used in an expandable row (with inline status edit)
        let previewInner = '';
        if (estimate.lineItems && estimate.lineItems.length) {
          previewInner = `
            <div class="estimate-line-items-preview">
              ${estimate.lineItems.map((cat, ci) => `
                <div class="estimate-category">
                  <div class="estimate-category-title">${cat.category || 'Category'}</div>
                  <ul class="estimate-items-list">
                    ${(cat.items || []).map((item, ii) => {
                      const v = item.assignedTo ? vendorMap[String(item.assignedTo)] : null;
                      const vTitle = v ? (v.name || v.email || 'Assigned') : '';
                      const vInit = v ? getInitials(v.name || v.email || '') : '';
                      const vendorBadge = v ? `<span class=\"vendor-badge\" title=\"${escapeHtml(vTitle)}\" data-fullname=\"${escapeHtml(vTitle)}\" aria-label=\"${escapeHtml(vTitle)}\">${escapeHtml(vInit)}</span>` : '';
                      const labor = Number(item.laborCost || 0);
                      const material = Number(item.materialCost || 0);
                      return `
                      <li class=\"estimate-item-row\" title=\"Click for description\" data-description=\"${item.description || ''}\">
                        <span class=\"estimate-item-name\">${item.name}</span>
                        ${vendorBadge}
                        <select class=\"estimate-item-status-select\" data-estimate-id=\"${estimate._id}\" data-cat-index=\"${ci}\" data-item-index=\"${ii}\" data-item-id=\"${item._id || ''}\"> 
                          <option value="in-progress" ${((item.status || 'in-progress') === 'in-progress') ? 'selected' : ''}>In Progress</option>
                          <option value="approved" ${((item.status || '') === 'approved') ? 'selected' : ''}>Approved</option>
                          <option value="completed" ${((item.status || '') === 'completed') ? 'selected' : ''}>Completed</option>
                        </select>
                        <span class=\"estimate-item-qty\">Qty: ${item.quantity || 1}</span>
                        <span class=\"estimate-item-labor\">Labor: $${labor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span class=\"estimate-item-material\">Material: $${material.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span class=\"estimate-item-total\">$${(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </li>`;
                    }).join('')}
                  </ul>
                </div>
              `).join('')}
            </div>
          `;
        }

        return `
          <tr class="estimate-row-toggle" data-estimate-id="${estimate._id}" title="Click to expand">
            <td class="est-title-cell">
              <button class="row-caret" aria-label="Toggle details"><i class="fas fa-chevron-right"></i></button>
              <div class="estimate-title">
                <span class="estimate-title-text" data-estimate-id="${estimate._id}">${estimate.title || ''}</span>
                <button class="edit-title-btn" title="Edit Title" style="margin-left:6px; background:none; border:none; color:#3b82f6; cursor:pointer; font-size:0.85em;">
                  <i class="fas fa-edit"></i>
                </button>
              </div>
            </td>
            <td>${createdDate}</td>
            <td class="mono"><a href="#" class="invoice-link" data-estimate-id="${estimate._id}" title="Open estimate">${estimate.invoiceNumber || ''}</a></td>
            <td class="mono" style="color:#0f4c75; font-weight:600;">$${(estimate.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>${estCompleted} / ${estTotal}</td>
            <td class="progress-cell">
              <div class="progress-bar-bg mini"><div class="progress-bar-fill" style="width:${estPercent}%;"></div></div>
              <span class="progress-percent">${estPercent}%</span>
            </td>
            <td class="est-actions">
              <button class="smart-btn danger" onclick="deleteEstimate('${estimate._id}');event.stopPropagation();"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
          <tr class="estimate-preview-row" id="preview-row-${estimate._id}" style="display:none;">
            <td colspan="7">${previewInner || '<div class="jobs-loading">No line items</div>'}</td>
          </tr>
        `;
      }).join('');

      estimatesList.innerHTML = `
        ${graphHtml}
        <div class="estimate-table-wrapper">
          <table class="estimate-table">
            <thead>
              <tr>
                <th id="est-title-header" class="est-sort-cell">Title <span class="sort-indicator">${sortDir === 'asc' ? '▲' : '▼'}</span></th>
                <th>Created</th>
                <th>Invoice #</th>
                <th>Total</th>
                <th>Completed</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;

      totalBudgetEl.textContent = `$${totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }

    // --- Add click event listeners for expanding/collapsing line items ---
   setTimeout(() => {


    
    
  // Row click toggles expansion (not open edit)
  document.querySelectorAll('.estimate-row-toggle').forEach(row => {
    row.addEventListener('click', function () {
      const estimateId = row.getAttribute('data-estimate-id');
      if (!estimateId) return;
      const previewRow = document.getElementById(`preview-row-${estimateId}`);
      if (!previewRow) return;
      const isOpen = previewRow.style.display !== 'none';
      // close all
      document.querySelectorAll('.estimate-preview-row').forEach(r => r.style.display = 'none');
      document.querySelectorAll('.row-caret i').forEach(i => i.style.transform = 'rotate(0deg)');
      // open this if it was closed
      if (!isOpen) {
        previewRow.style.display = 'table-row';
        const caret = row.querySelector('.row-caret i');
        if (caret) caret.style.transform = 'rotate(90deg)';
      }
    });
  });

  // Clicking Invoice # opens the estimate editor
  document.querySelectorAll('.invoice-link').forEach(a => {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const estimateId = this.getAttribute('data-estimate-id');
      if (estimateId) editEstimate(projectId, estimateId);
    });
  });

  // Caret click toggles expansion only
  document.querySelectorAll('.row-caret').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const row = btn.closest('.estimate-row-toggle');
      if (!row) return;
      const estimateId = row.getAttribute('data-estimate-id');
      const previewRow = document.getElementById(`preview-row-${estimateId}`);
      if (!previewRow) return;
      const isOpen = previewRow.style.display !== 'none';
      document.querySelectorAll('.estimate-preview-row').forEach(r => r.style.display = 'none');
      document.querySelectorAll('.row-caret i').forEach(i => i.style.transform = 'rotate(0deg)');
      if (!isOpen) {
        previewRow.style.display = 'table-row';
        const caret = row.querySelector('.row-caret i');
        if (caret) caret.style.transform = 'rotate(90deg)';
      }
    });
  });

  // Hover and click for line item descriptions
  document.querySelectorAll('.estimate-item-row').forEach(row => {
    row.addEventListener('mouseenter', function () {
      row.style.background = "#eaf6ff";
      row.style.cursor = "pointer";
    });
    row.addEventListener('mouseleave', function () {
      row.style.background = "";
      row.style.cursor = "";
    });
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      const desc = row.getAttribute('data-description');
      if (desc) {
        showLineItemDescription(desc, row);
      }
    });
  });

  // Inline status change for line items (in preview)
  document.querySelectorAll('.estimate-item-status-select').forEach(sel => {
    // Prevent row toggle or edit navigation when interacting with the select
    sel.addEventListener('click', e => e.stopPropagation());
    sel.dataset.prev = sel.value;
    // Apply initial color class based on current value
    applyStatusSelectClass(sel);
    sel.addEventListener('change', async function(e) {
      e.stopPropagation();
      const estimateId = this.dataset.estimateId; // used to recalc row UI
      const itemId = this.dataset.itemId;
      const newStatus = this.value;
      const previous = this.dataset.prev;
      this.disabled = true;
      // Optimistically update color class
      applyStatusSelectClass(this);
      // Show a tiny loader on the estimate row while updating
      const row = estimateId ? document.querySelector(`.estimate-row-toggle[data-estimate-id="${estimateId}"]`) : null;
      if (row) showRowLoader(row);
      try {
        if (itemId) {
          await updateLineItemStatus(itemId, newStatus, projectId);
          if (estimateId) {
            recalcEstimateRowFromPreview(estimateId);
          }
          // Update top graph live (percent and counters)
          updateTopGraphLive(previous, newStatus);
        } else {
          throw new Error('Missing item ID');
        }
        this.dataset.prev = newStatus;
      } catch (err) {
        console.error('Failed updating line item status:', err);
        this.value = previous;
        applyStatusSelectClass(this);
      } finally {
        if (row) hideRowLoader(row);
        this.disabled = false;
      }
    });
  });


  // Inline edit for estimate title
  document.querySelectorAll('.edit-title-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const titleSpan = btn.closest('.estimate-title').querySelector('.estimate-title-text');
      const estimateId = titleSpan.getAttribute('data-estimate-id');
      const currentTitle = titleSpan.textContent;
      // Replace span with input
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentTitle;
      input.className = 'inline-title-input';
  input.style.fontSize = '1em';
      input.style.width = '80%';
      titleSpan.replaceWith(input);
      input.focus();

      // Save on blur or Enter
      input.addEventListener('blur', saveTitle);
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          saveTitle();
        }
      });

      function saveTitle() {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
          fetch(`/api/estimates/${estimateId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
          })
          .then(res => {
            if (!res.ok) throw new Error('Failed to update title');
            return res.json();
          })
          .then(() => {
            showToast('Title updated!');
            input.replaceWith(titleSpan);
            titleSpan.textContent = newTitle;
          })
          .catch(() => {
            showToast('Error updating title');
            input.replaceWith(titleSpan);
          });
        } else {
          input.replaceWith(titleSpan);
        }
      }
    });
  });

  // Add sort click handler for Title header
  const th = document.getElementById('est-title-header');
  if (th) {
    th.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = localStorage.getItem('estSortDir') || 'asc';
      const next = cur === 'asc' ? 'desc' : 'asc';
      localStorage.setItem('estSortDir', next);
      loadEstimates(projectId);
    });
  }

  // Ensure 'Add Line Item' is present in Create New dropdown
  installAddLineItemMenuEntry(projectId);

}, 0);

    loadTasks(projectId);
  } catch (error) {
    if (error && error.name === 'AbortError') { return; }
    console.error("Error loading estimates:", error);
    estimatesList.innerHTML = "<p>An error occurred while loading estimates.</p>";
    totalBudgetEl.textContent = "$0.00";
  } finally {
    hideLoader();
  }
}

// Update a single line item's status for an estimate
async function updateLineItemStatus(itemId, status, projectId) {
  if (!itemId) {
    showToast('Missing item ID to update status.');
    return;
  }
  try {
    const res = await fetch(`/api/estimates/line-items/${itemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update line item status');
    showToast('Status updated');
  } catch (err) {
    console.error('Error updating line item status:', err);
    showToast('Error updating status');
    throw err;
  } finally {
  }
}

// Recalculate and update a single estimate row's Completed and Progress cells from the preview DOM
function recalcEstimateRowFromPreview(estimateId) {
  try {
    const previewRow = document.getElementById(`preview-row-${estimateId}`);
    if (!previewRow) return;
    const selects = Array.from(previewRow.querySelectorAll('.estimate-item-status-select'));
    const total = selects.length;
    let completed = 0;
    selects.forEach(s => {
      const v = (s.value || '').toLowerCase();
      if (v === 'completed' || v === 'approved') completed++;
    });
    const percent = total ? Math.round((completed / total) * 100) : 0;

    const row = document.querySelector(`.estimate-row-toggle[data-estimate-id="${estimateId}"]`);
    if (!row) return;
    const cells = row.querySelectorAll('td');
    // Completed column (5th column, index 4)
    if (cells[4]) cells[4].textContent = `${completed} / ${total}`;
    // Progress column
    const progressCell = row.querySelector('.progress-cell');
    if (progressCell) {
      const fill = progressCell.querySelector('.progress-bar-fill');
      const pct = progressCell.querySelector('.progress-percent');
      if (fill) fill.style.width = `${percent}%`;
      if (pct) pct.textContent = `${percent}%`;
    }
  } catch (e) {
    console.warn('Failed to recalc estimate row UI:', e);
  }
}

// Apply color class to status <select> based on its current value
function applyStatusSelectClass(sel) {
  try {
    sel.classList.remove('status-in-progress', 'status-approved', 'status-completed');
    const v = (sel.value || 'in-progress').toLowerCase();
    const cls = v === 'completed' ? 'status-completed' : v === 'approved' ? 'status-approved' : 'status-in-progress';
    sel.classList.add(cls);
  } catch {}
}

// Live-update the top summary graph counts and percentage based on a single item status change
function updateTopGraphLive(prevStatus, newStatus) {
  try {
    const container = document.getElementById('alt-estimate-graph');
    if (!container) return;
    const total = parseInt(container.dataset.total || '0', 10);
    let completed = parseInt(container.dataset.completed || '0', 10);
    let inprogress = parseInt(container.dataset.inprogress || '0', 10);

    const wasCompleted = (prevStatus || '').toLowerCase() === 'completed' || (prevStatus || '').toLowerCase() === 'approved';
    const isCompleted = (newStatus || '').toLowerCase() === 'completed' || (newStatus || '').toLowerCase() === 'approved';
    const wasInProgress = (prevStatus || '').toLowerCase() === 'in-progress';
    const isInProgress = (newStatus || '').toLowerCase() === 'in-progress';

    // Adjust counters based on transition
    if (wasInProgress && isCompleted) {
      completed += 1; inprogress = Math.max(0, inprogress - 1);
    } else if (wasCompleted && isInProgress) {
      completed = Math.max(0, completed - 1); inprogress += 1;
    }
    // No change for approved <-> completed as both count as completed

    container.dataset.completed = String(completed);
    container.dataset.inprogress = String(inprogress);

    const percent = total ? Math.round((completed / total) * 100) : 0;

    const percentText = document.getElementById('alt-graph-percent-text');
    const completedEl = document.getElementById('alt-graph-completed');
    const inprogressEl = document.getElementById('alt-graph-inprogress');
    const circle = document.getElementById('alt-graph-circle-progress');

    if (percentText) percentText.textContent = `${percent}%`;
    if (completedEl) completedEl.textContent = `${completed}`;
    if (inprogressEl) inprogressEl.textContent = `${inprogress}`;
    if (circle) {
      const r = 40; const c = 2 * Math.PI * r;
      circle.style.strokeDashoffset = String(c * (1 - percent / 100));
    }

    // Estimated completion date remains unchanged here; recomputation would require item dates across all estimates.
  } catch (e) {
    console.warn('Failed to update top graph live:', e);
  }
}

// Row-level tiny loader helpers
function showRowLoader(row) {
  try {
    row.classList.add('row-updating');
    const cell = row.querySelector('.progress-cell') || row.lastElementChild;
    if (cell && !cell.querySelector('.row-spinner')) {
      const sp = document.createElement('span');
      sp.className = 'row-spinner';
      sp.setAttribute('aria-label', 'Updating…');
      cell.appendChild(sp);
    }
  } catch {}
}

function hideRowLoader(row) {
  try {
    row.classList.remove('row-updating');
    const sp = row.querySelector('.row-spinner');
    if (sp) sp.remove();
  } catch {}
}

// Install an 'Add Line Item…' entry into the Create New dropdown (if present)
function installAddLineItemMenuEntry(projectId) {
  try {
    const menu = document.getElementById('estimateDropdown');
    if (!menu) return;
    if (document.getElementById('add-line-item-menu')) return; // avoid dup

    const item = document.createElement('div');
    item.id = 'add-line-item-menu';
    item.style.padding = '8px 22px';
    item.style.cursor = 'pointer';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.innerHTML = `<i class="fas fa-plus" style="margin-right:8px; color:#3b82f6;"></i> Add Line Item…`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddLineItemModal(projectId);
      // close the dropdown if possible
      const dd = document.getElementById('estimateDropdown');
      if (dd) dd.style.display = 'none';
    });
    menu.appendChild(item);
  } catch {}
}

// ===== Add Line Item to Estimate(s) Modal and Logic =====
function openAddLineItemModal(projectId) {
  const modal = ensureAddLineItemModal();
  // Populate estimates checkbox list when opening
  const box = document.getElementById('ali-estimates-box');
  const selAll = document.getElementById('ali-select-all');
  // Preload labor cost suggestions in background
  try { ensureLaborCostList(); } catch {}
  if (box) {
    const list = Array.isArray(window._lastEstimates) ? window._lastEstimates : [];
    const safe = (s) => (s || 'Untitled').toString().replace(/</g,'&lt;');
    box.innerHTML = list.map(e => `
      <label class="ali-estimate-item">
        <input type="checkbox" class="ali-estimate-chk" value="${e._id}">
        <span class="ali-estimate-title" title="${safe(e.title)}">${safe(e.title)}</span>
      </label>
    `).join('');
    // Delegate change events to keep selected chips in sync
    box.onchange = () => aliSyncSelectedChips();
  }
  if (selAll) selAll.checked = false;
  // Reset selected chips on open
  aliSyncSelectedChips();
  modal.style.display = 'flex';
  // Reset the multi-row table each time we open
  try { aliInitMultiItemTable(); } catch {}
  // Wire submit
  const submit = document.getElementById('ali-submit-btn');
  submit.onclick = () => handleAddLineItemSubmit(projectId);
  // Enter key handling is per-row suggestion now (no global Enter-to-submit)
}

// Keep the Selected area in sync with checked estimates
function aliSyncSelectedChips() {
  try {
    const chipsBox = document.getElementById('ali-selected-chips');
    const listBox = document.getElementById('ali-estimates-box');
    if (!chipsBox || !listBox) return;

    // Clear existing chips
    chipsBox.innerHTML = '';

    const checks = Array.from(document.querySelectorAll('.ali-estimate-chk'));
    const selected = checks.filter(cb => cb.checked);
    if (!selected.length) return; // nothing selected

    selected.forEach(cb => {
      const wrap = cb.closest('.ali-estimate-item');
      const title = (wrap?.querySelector('.ali-estimate-title')?.textContent || 'Untitled').trim();
      const id = cb.value;
      const chip = document.createElement('span');
      chip.className = 'ali-chip';
      chip.dataset.id = id;
      // escape minimal for title in attribute
      const safeTitle = title.replace(/</g, '&lt;');
      chip.innerHTML = `<span class="ali-chip-text" title="${safeTitle}">${safeTitle}</span><span class="ali-chip-x" title="Remove">×</span>`;
      chipsBox.appendChild(chip);
    });

    // Removal handler (delegate)
    chipsBox.onclick = (e) => {
      const x = e.target && e.target.classList && e.target.classList.contains('ali-chip-x') ? e.target : null;
      if (x) {
        const chip = x.parentElement;
        const id = chip?.dataset?.id;
        if (id) {
          const all = document.querySelectorAll('.ali-estimate-chk');
          for (const cb of all) {
            if (cb.value === id) { cb.checked = false; break; }
          }
          aliSyncSelectedChips();
        }
      }
    };
  } catch {}
}

// Fetch and cache labor cost list (shared with estimate-edit.js contract)
async function ensureLaborCostList() {
  if (Array.isArray(window.laborCostList) && window.laborCostList.length) return window.laborCostList;
  try {
    const res = await fetch('/api/labor-costs');
    if (!res.ok) throw new Error('Failed loading labor costs');
    const list = await res.json();
    window.laborCostList = Array.isArray(list) ? list : [];
    return window.laborCostList;
  } catch (e) {
    console.warn('Labor cost suggestions unavailable:', e);
    window.laborCostList = window.laborCostList || [];
    return window.laborCostList;
  }
}

// Fetch and cache vendors list for assignment in Add Line Item modal
async function ensureVendorsList() {
  if (Array.isArray(window._vendorsList) && window._vendorsList.length) return window._vendorsList;
  try {
    const res = await fetch('/api/vendors');
    if (!res.ok) throw new Error('Failed to fetch vendors');
    const list = await res.json();
    window._vendorsList = Array.isArray(list) ? list : [];
    return window._vendorsList;
  } catch (e) {
    console.warn('Vendor list unavailable:', e);
    window._vendorsList = window._vendorsList || [];
    return window._vendorsList;
  }
}

async function aliPopulateVendorSelect(selectEl) {
  if (!selectEl) return;
  const vendors = await ensureVendorsList();
  const current = selectEl.value;
  // Reset and add default
  selectEl.innerHTML = '<option value="">Unassigned</option>';
  vendors.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v._id || '';
    opt.textContent = v.name ? String(v.name) : (v.email || 'Vendor');
    selectEl.appendChild(opt);
  });
  if (current) selectEl.value = current;
}

// Wire up item name suggestions to auto-fill cost code and price
function aliWireItemSuggestions() {
  const input = document.getElementById('ali-name');
  const box = document.getElementById('ali-suggest-box');
  if (!input || !box) return;

  const hideBox = () => { box.style.display = 'none'; box.innerHTML = ''; };
  let activeIndex = -1;
  const setActive = (idx) => {
    const items = Array.from(box.children);
    items.forEach((el, i) => {
      if (i === idx) el.classList.add('active'); else el.classList.remove('active');
    });
    if (idx >= 0 && items[idx] && items[idx].scrollIntoView) {
      const el = items[idx];
      const boxRect = box.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < boxRect.top) el.scrollIntoView({ block: 'nearest' });
      if (elRect.bottom > boxRect.bottom) el.scrollIntoView({ block: 'nearest' });
    }
  };

  const render = (matches) => {
    if (!matches || !matches.length) { hideBox(); return; }
    box.innerHTML = '';
    matches.slice(0, 30).forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = 'ali-suggest-item';
      item.dataset.index = String(idx);
      const name = (m.name || m.title || '').toString();
      const code = (m.costCode || '').toString();
      const rate = parseFloat(m.rate);
      const labor = (m.laborCost != null) ? parseFloat(m.laborCost) : (m.totalCost != null ? parseFloat(m.totalCost) : NaN);
      const material = (m.materialCost != null) ? parseFloat(m.materialCost) : NaN;
      const descText = (m.description || '').toString();

      const metaParts = [];
      if (code) metaParts.push(`<span>Code: ${escapeHtml(code)}</span>`);
      if (!isNaN(rate)) metaParts.push(`<span>Rate: $${rate.toFixed(2)}</span>`);
      if (!isNaN(labor)) metaParts.push(`<span>Labor: $${labor.toFixed(2)}</span>`);
      if (!isNaN(material)) metaParts.push(`<span>Material: $${material.toFixed(2)}</span>`);

      item.innerHTML = `
        <div class="ali-sg-title">${escapeHtml(name)}</div>
        <div class="ali-sg-meta">${metaParts.join(' ')}</div>
        ${descText ? `<div class="ali-sg-desc">${escapeHtml(descText)}</div>` : ''}`;
      item.addEventListener('click', () => {
        try {
          input.value = name;
          const costEl = document.getElementById('ali-cost');
          const priceEl = document.getElementById('ali-price');
          const descEl = document.getElementById('ali-desc');
          const laborEl = document.getElementById('ali-labor');
          const materialEl = document.getElementById('ali-material');
          if (costEl && code) costEl.value = code;
          if (priceEl) {
            const r = parseFloat(m.rate);
            const total = !isNaN(parseFloat(m.totalCost)) ? parseFloat(m.totalCost) : ( (!isNaN(labor) || !isNaN(material)) ? ((isNaN(labor)?0:labor) + (isNaN(material)?0:material)) : 0 );
            const unit = !isNaN(r) ? r : total;
            priceEl.value = (unit || 0).toFixed(2);
          }
          if (laborEl && !isNaN(labor)) laborEl.value = labor.toFixed(2);
          if (materialEl && !isNaN(material)) materialEl.value = material.toFixed(2);
          if (descEl) descEl.value = descText || '';
          // default qty to 1 if empty
          const qtyEl = document.getElementById('ali-qty');
          if (qtyEl && (!qtyEl.value || parseInt(qtyEl.value, 10) <= 0)) qtyEl.value = '1';
        } finally { hideBox(); }
      });
      box.appendChild(item);
    });
    // position already absolute under input; just show
    box.style.display = 'block';
    activeIndex = 0;
    setActive(activeIndex);
  };

  const onInput = async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { hideBox(); return; }
    const list = await ensureLaborCostList();
    const matches = list.filter(m => {
      const name = (m.name || m.title || '').toString().toLowerCase();
      const code = (m.costCode || '').toString().toLowerCase();
      return name.includes(q) || (!!code && code.includes(q));
    });
    render(matches);
  };

  input.addEventListener('input', onInput);
  input.addEventListener('focus', onInput);
  input.addEventListener('keydown', (e) => {
    const visible = box.style.display !== 'none' && box.childElementCount > 0;
    const len = box.childElementCount;
    if (!visible && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      // open suggestions on first arrow
      onInput();
      e.preventDefault();
      return;
    }
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % len;
      setActive(activeIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + len) % len;
      setActive(activeIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < len) {
        const el = box.children[activeIndex];
        if (el) el.dispatchEvent(new Event('click', { bubbles: true }));
      }
    } else if (e.key === 'Escape') {
      hideBox();
    }
  });
  // Close on outside click
  document.addEventListener('mousedown', (e) => {
    if (!box.contains(e.target) && e.target !== input) hideBox();
  });
}

function escapeHtml(s) {
  return (s || '').toString().replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Escape value for safe placement in HTML attributes
function escapeHtmlAttr(s) {
  return (s || '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Wire up category suggestions based on selected estimates
function aliWireCategorySuggestions() {
  const input = document.getElementById('ali-category');
  const box = document.getElementById('ali-cat-suggest-box');
  if (!input || !box) return;

  const hide = () => { box.style.display = 'none'; box.innerHTML = ''; };
  let activeIndex = -1;
  const setActive = (idx) => {
    const items = Array.from(box.children);
    items.forEach((el, i) => {
      if (i === idx) el.classList.add('active'); else el.classList.remove('active');
    });
    if (idx >= 0 && items[idx] && items[idx].scrollIntoView) {
      const el = items[idx];
      const boxRect = box.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < boxRect.top) el.scrollIntoView({ block: 'nearest' });
      if (elRect.bottom > boxRect.bottom) el.scrollIntoView({ block: 'nearest' });
    }
  };

  const getSelectedIds = () => Array.from(document.querySelectorAll('.ali-estimate-chk'))
      .filter(cb => cb.checked).map(cb => cb.value);

  const collectCategories = () => {
    const ids = getSelectedIds();
    const all = Array.isArray(window._lastEstimates) ? window._lastEstimates : [];
    const pool = ids.length ? all.filter(e => ids.includes(e._id)) : all;
    const set = new Set();
    pool.forEach(e => {
      (e.lineItems || []).forEach(cat => {
        const name = (cat.category || '').toString().trim();
        if (name) set.add(name);
      });
    });
    return Array.from(set).sort((a,b) => a.localeCompare(b));
  };

  const render = (cats, q) => {
    const list = cats.filter(c => !q || c.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    if (!list.length) { hide(); return; }
    box.innerHTML = '';
    list.forEach((c, idx) => {
      const div = document.createElement('div');
      div.className = 'ali-cat-item';
      div.dataset.index = String(idx);
      div.textContent = c;
      div.title = c;
      div.addEventListener('click', () => { input.value = c; hide(); });
      box.appendChild(div);
    });
    box.style.display = 'block';
    activeIndex = 0;
    setActive(activeIndex);
  };

  const onInput = () => {
    const q = input.value.trim();
    const cats = collectCategories();
    render(cats, q);
  };

  input.addEventListener('focus', onInput);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    const visible = box.style.display !== 'none' && box.childElementCount > 0;
    const len = box.childElementCount;
    if (!visible && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      onInput();
      e.preventDefault();
      return;
    }
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % len;
      setActive(activeIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + len) % len;
      setActive(activeIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < len) {
        const el = box.children[activeIndex];
        if (el) el.dispatchEvent(new Event('click', { bubbles: true }));
      }
    } else if (e.key === 'Escape') {
      hide();
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!box.contains(e.target) && e.target !== input) hide();
  });

  // Also refresh when estimate selection changes
  const listBox = document.getElementById('ali-estimates-box');
  if (listBox) {
    listBox.addEventListener('change', () => {
      if (document.activeElement === input) onInput();
    });
  }
}

function ensureAddLineItemModal() {
  let modal = document.getElementById('add-lineitem-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'add-lineitem-modal';
  modal.className = 'modal-container';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-content" style="min-width: 320px; max-width: 1000px; padding:25px 12px;">
      <h3 style="margin-top:0;">Add Line Items</h3>
      <div class="ali-form">
        <div class="ali-row" id="ali-estimates-row" style="align-items:flex-start;">
          <div class="ali-multibox" style="display:flex; flex-direction:column; gap:6px; flex:1;">
            <div class="ali-section-title">Estimates</div>
            <label style="font-size:0.92em; color:#64748b;"><input type="checkbox" id="ali-select-all"> Select all</label>
            <div id="ali-selected-chips" class="ali-selected-chips" style="display:flex; flex-wrap:wrap; gap:6px; min-height:28px;"></div>
            <div id="ali-estimates-box" class="ali-estimates-box" style="flex:1; max-height:220px; overflow:auto; border:1px solid #e5e7eb; border-radius:8px; padding:6px 8px; display:flex; flex-wrap:wrap; gap:6px 8px;"></div>
          </div>
        </div>
        <div class="ali-row" style="align-items:flex-start;">
          <div style="flex:1;">

            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <div class="ali-section-title">Items</div>
              <button id="ali-add-row-btn" class="smart-btn" type="button"><i class="fas fa-plus"></i>&nbsp;Add Row</button>
            </div>
            <div class="ali-table-wrap">
              <table class="ali-table" style="width:100%; border-collapse:separate; border-spacing:0;">
                <thead>
                  <tr>
                    <th style="width:180px;">Category</th>
                    <th style="width:240px;">Item</th>
                    <th style="width:240px;">Description</th>
                    <th style="width:60px;">Qty</th>
                    <th style="width:90px;">Unit</th>
                    <th style="width:90px;">Labor</th>
                    <th style="width:90px;">Material</th>
                    <th style="width:140px;">Cost Code</th>
                    <th style="width:180px;">Vendor</th>
                    <th style="width:140px;">Status</th>
                    <th style="width:50px;"></th>
                  </tr>
                </thead>
                <tbody id="ali-items-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="ali-actions" style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
        <button id="ali-cancel-btn">Cancel</button>
  <button id="ali-submit-btn" class="smart-btn"><i class="fas fa-plus"></i>&nbsp;Add All</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Behavior: select all toggle
  const selAll = modal.querySelector('#ali-select-all');
  selAll.addEventListener('change', () => {
    const checked = selAll.checked;
    document.querySelectorAll('.ali-estimate-chk').forEach((cb) => { cb.checked = checked; });
    aliSyncSelectedChips();
  });

  // Initialize multi-row table
  try { aliInitMultiItemTable(); } catch {}

  // Cancel button
  modal.querySelector('#ali-cancel-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close on outside click
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  // Inline styles for rows (minimal)
  const style = document.createElement('style');
  style.innerHTML = `
    /* Base form row + inputs */
    #add-lineitem-modal .ali-form .ali-row { display:flex; align-items:center; gap:6px; padding:4px ; }
    #add-lineitem-modal .ali-form label { color:#334155; font-size:0.9em; }
    #add-lineitem-modal .ali-form input[type=text],
    #add-lineitem-modal .ali-form input[type=number],
    #add-lineitem-modal .ali-form textarea,
    #add-lineitem-modal .ali-form select { border:1px solid #e5e7eb; border-radius:8px; padding:3px 3px; font-size:0.9em; }

    /* Override aggressive modal defaults for our checkboxes */
    #add-lineitem-modal .modal-content input[type="checkbox"] {
      width: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      height: auto !important;
    }

    /* Compact checkbox list container */
    #add-lineitem-modal #ali-estimates-box {
      background:#fff;
      display:flex !important;
      flex-wrap:wrap !important;
      gap:6px 8px !important;
      align-items:center;
    }

    /* Individual estimate pill */
    #add-lineitem-modal .ali-estimate-item {
      display:inline-flex !important;
      align-items:center; gap:6px;
      background:#f8fafc; border:1px solid #e5e7eb; border-radius:14px;
      padding:4px 8px; font-size:0.9em; white-space:nowrap;
      margin:0 !important; cursor:pointer;
    }
    #add-lineitem-modal .ali-estimate-item input { margin:0 !important; }
    #add-lineitem-modal .ali-estimate-title { max-width:260px; overflow:hidden; text-overflow:ellipsis; display:inline-block; }

    /* Selected chips */
    #add-lineitem-modal .ali-selected-chips { color:#334155; }
    #add-lineitem-modal .ali-chip { display:inline-flex; align-items:center; gap:6px; background:#e0f2fe; color:#075985; border:1px solid #bae6fd; border-radius:999px; padding:4px 10px; font-size:0.85em; }
    #add-lineitem-modal .ali-chip .ali-chip-x { cursor:pointer; font-weight:600; padding-left:2px; }

    /* Multi-row table styles (compact) */
    #add-lineitem-modal .ali-table { font-size:12px; }
    #add-lineitem-modal .ali-table-wrap { border:1px solid #e5e7eb; border-radius:8px; overflow:auto; }
    #add-lineitem-modal .ali-table th, #add-lineitem-modal .ali-table td { border-bottom:1px solid #f1f5f9; padding:4px 6px; text-align:left; vertical-align:top; }
    #add-lineitem-modal .ali-table thead th { position:sticky; top:0; background:#f8fafc; z-index:1; font-weight:600; font-size:0.9em; color:#334155; }
    #add-lineitem-modal .ali-table tr:last-child td { border-bottom:none; }
    #add-lineitem-modal .ali-cell { position:relative; }
    #add-lineitem-modal .ali-input, #add-lineitem-modal .ali-textarea, #add-lineitem-modal .ali-select { width:100%; border:1px solid #e5e7eb; border-radius:6px; padding:4px 6px; font-size:0.86em; }
    #add-lineitem-modal .ali-input, #add-lineitem-modal .ali-select { height:28px; }
    #add-lineitem-modal .ali-textarea { min-height:28px; resize:vertical; line-height:1.25; }
    #add-lineitem-modal .ali-remove-btn { color:#ef4444; background:#fee2e2; border:1px solid #fecaca; border-radius:6px; padding:4px 6px; font-size:12px; }
    #add-lineitem-modal .ali-remove-btn:hover { background:#fecaca; }
    #add-lineitem-modal #ali-add-row-btn { padding:4px 8px; font-size:12px; }

    /* Make numeric fields a bit smaller to free space for Category/Item */
    #add-lineitem-modal .ali-input.ali-i-qty,
    #add-lineitem-modal .ali-input.ali-i-price,
    #add-lineitem-modal .ali-input.ali-i-labor,
    #add-lineitem-modal .ali-input.ali-i-material {
      font-size: 0.8em;
      padding: 3px 4px;
      height: 26px;
      text-align: right;
    }

    /* Suggestion dropdowns per-row */
    #add-lineitem-modal .ali-suggest-box { position:relative; left:0; right:0; top:100%; background:#fff; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 6px 16px rgba(2,6,23,0.12); max-height:220px; overflow:auto; z-index:10000; display:none; -ms-overflow-style:none; scrollbar-width:thin; }
    #add-lineitem-modal .ali-suggest-item { padding:6px 8px; display:flex; flex-direction:column; cursor:pointer; border-bottom:1px solid #f1f5f9; }
    #add-lineitem-modal .ali-suggest-item:last-child { border-bottom:none; }
    #add-lineitem-modal .ali-suggest-item:hover { background:#f8fafc; }
    #add-lineitem-modal .ali-suggest-item.active { background:#eef2ff; }
    #add-lineitem-modal .ali-sg-title { font-weight:600; color:#0f172a; font-size:0.88em; }
    #add-lineitem-modal .ali-sg-meta { display:flex; gap:10px; font-size:0.76em; color:#475569; }
    #add-lineitem-modal .ali-sg-desc { margin-top:4px; font-size:0.74em; color:#6b7280; line-height:1.25; }

    /* Section titles */
    #add-lineitem-modal .ali-section-title {
      font-weight:700; color:#334155; font-size:0.95em; margin:2px 0 6px 0;
    }
  `;
  document.head.appendChild(style);

  return modal;
}

// Initialize the multi-row items table
function aliInitMultiItemTable() {
  const tbody = document.getElementById('ali-items-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const addBtn = document.getElementById('ali-add-row-btn');
  const addRow = (prefill) => {
    const tr = aliCreateItemRow(prefill);
    tbody.appendChild(tr);
    // Focus first empty input
    setTimeout(() => { tr.querySelector('.ali-i-name')?.focus(); }, 0);
  };
  if (addBtn) addBtn.onclick = () => addRow();
  // Start with one blank row
  addRow();
}

// Create a table row for an item with suggestion wiring
function aliCreateItemRow(prefill) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="ali-cell">
      <div style="position:relative;">
        <input type="text" class="ali-input ali-i-cat" placeholder="Category" />
        <div class="ali-suggest-box ali-cat-box"></div>
      </div>
    </td>
    <td class="ali-cell">
      <div style="position:relative;">
        <input type="text" class="ali-input ali-i-name" placeholder="Item name" />
        <div class="ali-suggest-box ali-name-box"></div>
      </div>
    </td>
    <td><textarea class="ali-textarea ali-i-desc" placeholder="Optional"></textarea></td>
    <td><input type="number" min="1" step="1" value="1" class="ali-input ali-i-qty" /></td>
    <td><input type="number" min="0" step="0.01" value="0" class="ali-input ali-i-price" /></td>
    <td><input type="number" min="0" step="0.01" value="0" class="ali-input ali-i-labor" /></td>
    <td><input type="number" min="0" step="0.01" value="0" class="ali-input ali-i-material" /></td>
    <td><input type="text" class="ali-input ali-i-cost" placeholder="Code" /></td>
    <td>
      <select class="ali-select ali-i-vendor">
        <option value="">Unassigned</option>
      </select>
    </td>
    <td>
      <select class="ali-select ali-i-status">
        <option value="in-progress" selected>In Progress</option>
        <option value="approved">Approved</option>
        <option value="completed">Completed</option>
      </select>
    </td>
    <td style="text-align:right;">
      <button type="button" class="ali-remove-btn" title="Remove">✕</button>
    </td>
  `;

  const catInput = tr.querySelector('.ali-i-cat');
  const catBox = tr.querySelector('.ali-cat-box');
  const nameInput = tr.querySelector('.ali-i-name');
  const nameBox = tr.querySelector('.ali-name-box');
  const descEl = tr.querySelector('.ali-i-desc');
  const qtyEl = tr.querySelector('.ali-i-qty');
  const priceEl = tr.querySelector('.ali-i-price');
  const laborEl = tr.querySelector('.ali-i-labor');
  const materialEl = tr.querySelector('.ali-i-material');
  const costEl = tr.querySelector('.ali-i-cost');
  const vendorSel = tr.querySelector('.ali-i-vendor');
  const statusEl = tr.querySelector('.ali-i-status');

  // Prefill if provided
  if (prefill && typeof prefill === 'object') {
    if (prefill.categoryName) catInput.value = prefill.categoryName;
    if (prefill.name) nameInput.value = prefill.name;
    if (prefill.description) descEl.value = prefill.description;
    if (Number.isFinite(prefill.quantity)) qtyEl.value = prefill.quantity;
    if (Number.isFinite(prefill.unitPrice)) priceEl.value = prefill.unitPrice;
    if (Number.isFinite(prefill.labor)) laborEl.value = prefill.labor;
    if (Number.isFinite(prefill.material)) materialEl.value = prefill.material;
    if (prefill.costCode) costEl.value = prefill.costCode;
    if (prefill.assignedTo) vendorSel.value = prefill.assignedTo;
    if (prefill.status) statusEl.value = prefill.status;
  }

  // Remove row
  tr.querySelector('.ali-remove-btn').onclick = () => {
    const tbody = tr.parentElement;
    tr.remove();
    // Always keep at least one row
    if (tbody && tbody.children.length === 0) {
      tbody.appendChild(aliCreateItemRow());
    }
  };

  // Wire category suggestions per-row
  aliWireCategorySuggest(catInput, catBox);
  // Wire item suggestions per-row
  aliWireNameSuggest(nameInput, nameBox, { descEl, qtyEl, priceEl, laborEl, materialEl, costEl });

  // Populate vendor select
  try { aliPopulateVendorSelect(vendorSel); } catch {}

  return tr;
}

function aliWireCategorySuggest(input, box) {
  if (!input || !box) return;
  const hide = () => { box.style.display = 'none'; box.innerHTML = ''; };
  let activeIndex = -1;
  const setActive = (idx) => {
    const items = Array.from(box.children);
    items.forEach((el, i) => { if (i === idx) el.classList.add('active'); else el.classList.remove('active'); });
    if (idx >= 0 && items[idx] && items[idx].scrollIntoView) {
      const el = items[idx];
      const boxRect = box.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < boxRect.top) el.scrollIntoView({ block: 'nearest' });
      if (elRect.bottom > boxRect.bottom) el.scrollIntoView({ block: 'nearest' });
    }
  };
  const collectCategories = () => {
    const ids = Array.from(document.querySelectorAll('.ali-estimate-chk')).filter(cb => cb.checked).map(cb => cb.value);
    const all = Array.isArray(window._lastEstimates) ? window._lastEstimates : [];
    const pool = ids.length ? all.filter(e => ids.includes(e._id)) : all;
    const set = new Set();
    pool.forEach(e => { (e.lineItems || []).forEach(cat => { const name = (cat.category || '').toString().trim(); if (name) set.add(name); }); });
    return Array.from(set).sort((a,b) => a.localeCompare(b));
  };
  const render = (cats, q) => {
    const list = cats.filter(c => !q || c.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    if (!list.length) { hide(); return; }
    box.innerHTML = '';
    list.forEach((c, idx) => {
      const div = document.createElement('div');
      div.className = 'ali-suggest-item';
      div.dataset.index = String(idx);
      div.textContent = c;
      div.title = c;
      div.addEventListener('click', () => { input.value = c; hide(); });
      box.appendChild(div);
    });
    activeIndex = 0; setActive(activeIndex); box.style.display = 'block';
  };
  const onInput = () => { const q = input.value.trim(); render(collectCategories(), q); };
  input.addEventListener('focus', onInput);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    const visible = box.style.display !== 'none' && box.childElementCount > 0;
    const len = box.childElementCount;
    if (!visible && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { onInput(); e.preventDefault(); return; }
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = (activeIndex + 1) % len; setActive(activeIndex); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = (activeIndex - 1 + len) % len; setActive(activeIndex); }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0 && activeIndex < len) { const el = box.children[activeIndex]; if (el) el.dispatchEvent(new Event('click', { bubbles:true })); } }
    else if (e.key === 'Escape') { hide(); }
  });
  document.addEventListener('mousedown', (e) => { if (!box.contains(e.target) && e.target !== input) hide(); });
}

function aliWireNameSuggest(input, box, refs) {
  if (!input || !box) return;
  const hideBox = () => { box.style.display = 'none'; box.innerHTML = ''; };
  let activeIndex = -1;
  const setActive = (idx) => {
    const items = Array.from(box.children);
    items.forEach((el, i) => { if (i === idx) el.classList.add('active'); else el.classList.remove('active'); });
    if (idx >= 0 && items[idx] && items[idx].scrollIntoView) {
      const el = items[idx];
      const boxRect = box.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < boxRect.top) el.scrollIntoView({ block:'nearest' });
      if (elRect.bottom > boxRect.bottom) el.scrollIntoView({ block:'nearest' });
    }
  };
  const render = (matches) => {
    if (!matches || !matches.length) { hideBox(); return; }
    box.innerHTML='';
    matches.slice(0,30).forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = 'ali-suggest-item';
      item.dataset.index = String(idx);
      const name = (m.name || m.title || '').toString();
      const code = (m.costCode || '').toString();
      const rate = parseFloat(m.rate);
      const labor = (m.laborCost != null) ? parseFloat(m.laborCost) : (m.totalCost != null ? parseFloat(m.totalCost) : NaN);
      const material = (m.materialCost != null) ? parseFloat(m.materialCost) : NaN;
      const descText = (m.description || '').toString();
      const metaParts = [];
      if (code) metaParts.push(`<span>Code: ${escapeHtml(code)}</span>`);
      if (!isNaN(rate)) metaParts.push(`<span>Rate: $${rate.toFixed(2)}</span>`);
      if (!isNaN(labor)) metaParts.push(`<span>Labor: $${labor.toFixed(2)}</span>`);
      if (!isNaN(material)) metaParts.push(`<span>Material: $${material.toFixed(2)}</span>`);
      item.innerHTML = `
        <div class="ali-sg-title">${escapeHtml(name)}</div>
        <div class="ali-sg-meta">${metaParts.join(' ')}</div>
        ${descText ? `<div class="ali-sg-desc">${escapeHtml(descText)}</div>` : ''}`;
      item.addEventListener('click', () => {
        try {
          input.value = name;
          if (refs?.costEl && code) refs.costEl.value = code;
          if (refs?.priceEl) {
            const r = parseFloat(m.rate);
            const total = !isNaN(parseFloat(m.totalCost)) ? parseFloat(m.totalCost) : ((!isNaN(labor) || !isNaN(material)) ? ((isNaN(labor)?0:labor) + (isNaN(material)?0:material)) : 0);
            const unit = !isNaN(r) ? r : total;
            refs.priceEl.value = (unit || 0).toFixed(2);
          }
          if (refs?.laborEl && !isNaN(labor)) refs.laborEl.value = labor.toFixed(2);
          if (refs?.materialEl && !isNaN(material)) refs.materialEl.value = material.toFixed(2);
          if (refs?.descEl) refs.descEl.value = descText || '';
          if (refs?.qtyEl && (!refs.qtyEl.value || parseInt(refs.qtyEl.value,10) <= 0)) refs.qtyEl.value = '1';
        } finally { hideBox(); }
      });
      box.appendChild(item);
    });
    activeIndex = 0; setActive(activeIndex); box.style.display = 'block';
  };
  const onInput = async () => {
    const q = input.value.trim().toLowerCase(); if (!q) { hideBox(); return; }
    const list = await ensureLaborCostList();
    const matches = list.filter(m => {
      const name = (m.name || m.title || '').toString().toLowerCase();
      const code = (m.costCode || '').toString().toLowerCase();
      return name.includes(q) || (!!code && code.includes(q));
    });
    render(matches);
  };
  input.addEventListener('input', onInput);
  input.addEventListener('focus', onInput);
  input.addEventListener('keydown', (e) => {
    const visible = box.style.display !== 'none' && box.childElementCount > 0;
    const len = box.childElementCount;
    if (!visible && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { onInput(); e.preventDefault(); return; }
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = (activeIndex + 1) % len; setActive(activeIndex); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = (activeIndex - 1 + len) % len; setActive(activeIndex); }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0 && activeIndex < len) { const el = box.children[activeIndex]; if (el) el.dispatchEvent(new Event('click', { bubbles:true })); } }
    else if (e.key === 'Escape') { hideBox(); }
  });
  document.addEventListener('mousedown', (e) => { if (!box.contains(e.target) && e.target !== input) hideBox(); });
}

async function handleAddLineItemSubmit(projectId) {
  try {
  const selAll = document.getElementById('ali-select-all');
    let targetIds = [];
    const checks = Array.from(document.querySelectorAll('.ali-estimate-chk'));
    if (selAll && selAll.checked) {
      targetIds = checks.map(c => c.value);
    } else {
      targetIds = checks.filter(c => c.checked).map(c => c.value);
    }
    if (!targetIds.length) return showToast('Select at least one estimate');

    // Collect rows
    const tbody = document.getElementById('ali-items-tbody');
    const rows = Array.from(tbody?.querySelectorAll('tr') || []);
    if (!rows.length) return showToast('Add at least one item row');

    const payloadRows = [];
    let skipped = 0;
    for (const tr of rows) {
      const cat = (tr.querySelector('.ali-i-cat')?.value || '').trim();
      const name = (tr.querySelector('.ali-i-name')?.value || '').trim();
      const desc = (tr.querySelector('.ali-i-desc')?.value || '').trim();
      let qty = Math.max(1, parseInt(tr.querySelector('.ali-i-qty')?.value || '1', 10));
      const price = Math.max(0, parseFloat(tr.querySelector('.ali-i-price')?.value || '0'));
      const laborRate = Math.max(0, parseFloat(tr.querySelector('.ali-i-labor')?.value || '0'));
      const materialRate = Math.max(0, parseFloat(tr.querySelector('.ali-i-material')?.value || '0'));
  const costCode = (tr.querySelector('.ali-i-cost')?.value || '').trim();
  const vendorId = (tr.querySelector('.ali-i-vendor')?.value || '').trim();
      const status = tr.querySelector('.ali-i-status')?.value || 'in-progress';
      if (!name) { skipped++; continue; }
      if (!Number.isFinite(qty) || qty <= 0) qty = 1;
      const item = { name, description: desc, quantity: qty, unitPrice: price, total: qty * price, status };
      // Multiply labor/material by qty like estimate-edit flow (inputs treated as per-unit rates)
      if (!isNaN(laborRate)) item.laborCost = qty * laborRate;
      if (!isNaN(materialRate)) item.materialCost = qty * materialRate;
      if (costCode) item.costCode = costCode;
  if (vendorId) { item.assignedTo = vendorId; item.assignedToModel = 'vendor'; }
      payloadRows.push({ categoryName: cat, item });
    }
    if (!payloadRows.length) return showToast('All rows are empty. Please enter at least one item name.');

    showLoader();
    let success = 0, failed = 0;
    for (const id of targetIds) {
      try { await aliAddLineItemsToEstimate(id, payloadRows); success++; } catch { failed++; }
    }

    const skippedMsg = skipped ? ` (${skipped} row${skipped===1?'':'s'} skipped)` : '';
    showToast(`Added to ${success} estimate(s)${failed ? `, ${failed} failed` : ''}.${skippedMsg}`);
    document.getElementById('add-lineitem-modal').style.display = 'none';
    if (projectId) loadEstimates(projectId);
  } catch (e) {
    console.error('Add line item error:', e);
    showToast('Failed to add line item');
  } finally {
    hideLoader();
  }
}

async function aliAddLineItemToEstimate(estimateId, categoryName, item) {
  // Fetch estimate
  const res = await fetch(`/api/estimates/${estimateId}`);
  if (!res.ok) throw new Error('Failed to load estimate');
  const { estimate } = await res.json();
  const lineItems = Array.isArray(estimate.lineItems) ? JSON.parse(JSON.stringify(estimate.lineItems)) : [];

  // Sanitize any malformed items coming from previous data (e.g., description objects)
  function sanitizeLineItems(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(cat => {
      const cleanCat = {
        type: cat.type === 'category' ? 'category' : (cat.type || 'category'),
        category: (cat.category || '').toString(),
        status: (cat.status || 'in-progress').toString(),
        items: []
      };
      const items = Array.isArray(cat.items) ? cat.items : [];
      cleanCat.items = items.map(it => {
        const out = { ...it };
        // Ensure required string fields are strings
        out.name = (out.name || '').toString();
        if (out.description && typeof out.description === 'object') {
          // If description is an object, try to pull a sensible string
          const obj = out.description || {};
          const fromField = typeof obj.description === 'string' ? obj.description
                            : (typeof obj.name === 'string' ? obj.name : '');
          out.description = fromField;
        } else {
          out.description = (out.description || '').toString();
        }
        if (out.costCode != null) out.costCode = out.costCode.toString();
  // Numeric coercions
        out.quantity = isNaN(parseFloat(out.quantity)) ? 0 : parseFloat(out.quantity);
        out.unitPrice = isNaN(parseFloat(out.unitPrice)) ? 0 : parseFloat(out.unitPrice);
  if (out.laborCost != null) out.laborCost = isNaN(parseFloat(out.laborCost)) ? 0 : parseFloat(out.laborCost);
  if (out.materialCost != null) out.materialCost = isNaN(parseFloat(out.materialCost)) ? 0 : parseFloat(out.materialCost);
        out.total = (out.quantity || 0) * (out.unitPrice || 0);
        // Normalize type/status
        out.type = out.type === 'item' ? 'item' : 'item';
        out.status = (out.status || 'in-progress').toString();
        return out;
      });
      return cleanCat;
    });
  }

  // Work on a sanitized copy to avoid schema cast errors when saving
  let clean = sanitizeLineItems(lineItems);

  // Choose target category:
  // - If a categoryName was provided, use a matching one (case-insensitive) or create it.
  // - Otherwise, add to the first existing category; if none exists, create a default 'General'.
  let cat = null;
  const desired = (categoryName || '').trim();
  if (desired) {
    const key = desired.toLowerCase();
    cat = clean.find(c => (c.category || '').toString().toLowerCase() === key) || null;
    if (!cat) {
      cat = { type: 'category', category: desired, status: 'in-progress', items: [] };
      clean.push(cat);
    }
  } else {
    cat = Array.isArray(clean) && clean.length ? clean[0] : null;
    if (!cat) {
      cat = { type: 'category', category: 'General', status: 'in-progress', items: [] };
      clean.push(cat);
    }
  }
  // Sanitize the new item to avoid schema cast errors
  const newItem = (() => {
    const out = { ...item };
    out.type = 'item';
    out.name = (out.name || '').toString();
    if (out.description && typeof out.description === 'object') {
      const obj = out.description || {};
      out.description = typeof obj.description === 'string' ? obj.description
                        : (typeof obj.name === 'string' ? obj.name : '');
    } else {
      out.description = (out.description || '').toString();
    }
    if (out.costCode != null) out.costCode = out.costCode.toString();
  out.quantity = isNaN(parseFloat(out.quantity)) ? 0 : parseFloat(out.quantity);
  out.unitPrice = isNaN(parseFloat(out.unitPrice)) ? 0 : parseFloat(out.unitPrice);
  if (out.laborCost != null) out.laborCost = isNaN(parseFloat(out.laborCost)) ? 0 : parseFloat(out.laborCost);
  if (out.materialCost != null) out.materialCost = isNaN(parseFloat(out.materialCost)) ? 0 : parseFloat(out.materialCost);
    out.total = (out.quantity || 0) * (out.unitPrice || 0);
    out.status = (out.status || 'in-progress').toString();
    return out;
  })();
  cat.items = Array.isArray(cat.items) ? cat.items : [];
  cat.items.push(newItem);

  const payload = {
    projectId: estimate.projectId,
    title: estimate.title,
    lineItems: clean,
    tax: estimate.tax || 0
  };

  const put = await fetch(`/api/estimates/${estimateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!put.ok) throw new Error('Failed to update estimate');
  return put.json();
}

// Batch: add multiple line items across categories, single PUT per estimate
async function aliAddLineItemsToEstimate(estimateId, rows) {
  if (!estimateId || !Array.isArray(rows) || !rows.length) return;
  const res = await fetch(`/api/estimates/${estimateId}`);
  if (!res.ok) throw new Error('Failed to load estimate');
  const dto = await res.json();
  const estimate = dto?.estimate || dto;
  const projectId = estimate?.projectId || (dto?.projectId);
  const title = estimate?.title || (dto?.title) || '';
  const tax = estimate?.tax || 0;
  let lineItems = Array.isArray(estimate?.lineItems) ? JSON.parse(JSON.stringify(estimate.lineItems)) : [];

  function sanitizeLineItems(arr) {
    return (Array.isArray(arr) ? arr : []).map(cat => {
      const name = (cat?.category || '').toString() || 'General';
      const items = Array.isArray(cat?.items) ? cat.items : [];
      const cleanCat = { type: 'category', category: name, status: (cat?.status || 'in-progress').toString(), items: [] };
      cleanCat.items = items.map(obj => {
        const out = Object.assign({}, obj);
        out.type = 'item';
        if (out.description && typeof out.description === 'object') {
          const obj = out.description;
          out.description = (obj.text != null) ? String(obj.text)
            : (obj.value != null) ? String(obj.value)
            : (typeof obj.name === 'string' ? obj.name : '');
        } else {
          out.description = (out.description || '').toString();
        }
        if (out.costCode != null) out.costCode = out.costCode.toString();
        // Numeric coercions
        out.quantity = isNaN(parseFloat(out.quantity)) ? 0 : parseFloat(out.quantity);
        out.unitPrice = isNaN(parseFloat(out.unitPrice)) ? 0 : parseFloat(out.unitPrice);
        if (out.laborCost != null) out.laborCost = isNaN(parseFloat(out.laborCost)) ? 0 : parseFloat(out.laborCost);
        if (out.materialCost != null) out.materialCost = isNaN(parseFloat(out.materialCost)) ? 0 : parseFloat(out.materialCost);
        out.total = (out.quantity || 0) * (out.unitPrice || 0);
        out.status = (out.status || 'in-progress').toString();
        return out;
      });
      return cleanCat;
    });
  }

  // Ensure there is at least one category to target if rows omit category
  let clean = sanitizeLineItems(lineItems);

  // Track original counts per category (case-insensitive key) to identify newly appended items later
  const catKey = (n) => (n || 'General').toString().trim().toLowerCase() || 'general';
  const beforeCounts = new Map();
  clean.forEach(c => { beforeCounts.set(catKey(c.category), Array.isArray(c.items) ? c.items.length : 0); });

  // Group incoming rows by category key for stable pairing later
  const rowsByCat = new Map();
  rows.forEach(r => {
    const k = catKey(r.categoryName);
    if (!rowsByCat.has(k)) rowsByCat.set(k, []);
    rowsByCat.get(k).push(r);
  });

  // Helper: get or create category by name (case-insensitive)
  const getCategory = (name) => {
    let targetName = (name || '').trim();
    if (!targetName) {
      targetName = clean.length ? (clean[0]?.category || 'General') : 'General';
    }
    let found = clean.find(c => (c.category || '').toLowerCase() === targetName.toLowerCase());
    if (!found) { found = { type: 'category', category: targetName, status: 'in-progress', items: [] }; clean.push(found); }
    return found;
  };

  // Append items per row
  for (const row of rows) {
    const cat = getCategory(row.categoryName);
    // Sanitize new item similarly
    const obj = Object.assign({ type: 'item' }, row.item);
    if (obj.description && typeof obj.description === 'object') {
      const o = obj.description;
      obj.description = (o.text != null) ? String(o.text)
        : (o.value != null) ? String(o.value)
        : (typeof o.name === 'string' ? o.name : '');
    } else {
      obj.description = (obj.description || '').toString();
    }
    if (obj.costCode != null) obj.costCode = obj.costCode.toString();
    obj.quantity = isNaN(parseFloat(obj.quantity)) ? 0 : parseFloat(obj.quantity);
    obj.unitPrice = isNaN(parseFloat(obj.unitPrice)) ? 0 : parseFloat(obj.unitPrice);
    if (obj.laborCost != null) obj.laborCost = isNaN(parseFloat(obj.laborCost)) ? 0 : parseFloat(obj.laborCost);
    if (obj.materialCost != null) obj.materialCost = isNaN(parseFloat(obj.materialCost)) ? 0 : parseFloat(obj.materialCost);
    obj.total = (obj.quantity || 0) * (obj.unitPrice || 0);
    obj.status = (obj.status || 'in-progress').toString();
    cat.items.push(obj);
  }

  const payload = { projectId, title, lineItems: sanitizeLineItems(clean), tax };
  const putRes = await fetch(`/api/estimates/${estimateId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!putRes.ok) throw new Error('Failed to update estimate');
  const updated = await putRes.json().catch(() => ({}));

  // Attempt vendor assignment via POST /api/assign-items for rows that chose a vendor
  try {
    const updatedEstimate = updated?.estimate || updated;
    const updatedLineItems = Array.isArray(updatedEstimate?.lineItems) ? updatedEstimate.lineItems : [];
    const itemsToAssignByVendor = new Map(); // vendorId -> array of {item}

    // Build pairing of newly added items per category with original rows
    updatedLineItems.forEach(cat => {
      const k = catKey(cat.category);
      const prior = beforeCounts.get(k) || 0;
      const newItems = (cat.items || []).slice(prior);
      const srcRows = rowsByCat.get(k) || [];
      const len = Math.min(newItems.length, srcRows.length);
      for (let i = 0; i < len; i++) {
        const row = srcRows[i];
        const vendorId = row?.item?.assignedTo || row?.assignedTo;
        if (vendorId) {
          const ni = newItems[i];
          if (!itemsToAssignByVendor.has(vendorId)) itemsToAssignByVendor.set(vendorId, []);
          itemsToAssignByVendor.get(vendorId).push({ item: ni });
        }
      }
    });

    // Execute assignments per vendor
    const vendorIds = Array.from(itemsToAssignByVendor.keys());
    for (const vId of vendorIds) {
      const pack = itemsToAssignByVendor.get(vId) || [];
      if (!pack.length) continue;
      const itemsPayload = pack.map(({ item }) => ({
        itemId: String(item?._id || ''),
        name: item?.name || '',
        description: item?.description || '',
        quantity: Number(item?.quantity || 0),
        unitPrice: Number(item?.unitPrice || 0),
        laborCost: Number(item?.laborCost || 0),
        materialCost: Number(item?.materialCost || 0),
        total: Number(item?.laborCost || 0), // server derives laborCost; align with estimate-edit behavior
        costCode: item?.costCode || 'Uncategorized'
      })).filter(x => x.itemId);
      if (!itemsPayload.length) continue;
      try {
        await fetch('/api/assign-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorId: vId, projectId: updatedEstimate.projectId, estimateId: updatedEstimate._id, items: itemsPayload })
        });
      } catch (e) {
        console.warn('assign-items failed for vendor', vId, e);
      }
    }
  } catch (e) {
    console.warn('Post-append vendor assignment skipped/error:', e);
  }

  return updated;
}

// Add this helper function:
function showLineItemDescription(desc, row) {
  // Remove any existing popup
  document.querySelectorAll('.line-item-desc-popup').forEach(el => el.remove());
  // Create popup
  const popup = document.createElement('div');
  popup.className = 'line-item-desc-popup';
  popup.textContent = desc;
  popup.style.position = 'absolute';
  popup.style.background = '#fff';
  popup.style.border = '1px solid #3b82f6';
  popup.style.borderRadius = '8px';
  popup.style.boxShadow = '0 2px 8px #e5e7eb';
  popup.style.padding = '12px 18px';
  popup.style.color = '#334155';
  popup.style.fontSize = '1em';
  popup.style.zIndex = '9999';
  popup.style.maxWidth = '320px';
  popup.style.left = (row.getBoundingClientRect().left + window.scrollX + 20) + 'px';
  popup.style.top = (row.getBoundingClientRect().top + window.scrollY + 28) + 'px';

  document.body.appendChild(popup);

  // Remove popup on click outside or mouseleave
  setTimeout(() => {
    document.addEventListener('mousedown', function handler(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 0);
}

// Add CSS for hover and popup
if (!document.getElementById("estimate-line-item-hover-styles")) {
  const style = document.createElement("style");
  style.id = "estimate-line-item-hover-styles";
  style.innerHTML = `
    .estimate-item-row:hover {
      background: #eaf6ff !important;
      cursor: pointer;
      transition: background 0.18s;
    }
    .line-item-desc-popup {
      animation: fadeIn 0.2s;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px);}
      to { opacity: 1; transform: translateY(0);}
    }
  `;
  document.head.appendChild(style);
}

// Ensure vendor-badge styles are loaded last with higher precedence
if (!document.getElementById('vendor-badge-styles')) {
  const style = document.createElement('style');
  style.id = 'vendor-badge-styles';
  style.innerHTML = `
    /* Vendor badge enhanced styles (high specificity and important flags) */
    .estimate-items-list .estimate-item-row .vendor-badge {
      position: relative !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 25px !important;
      height: 25px !important;
      border-radius: 50% !important;
      background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%) !important;
      color: #fff !important;
      font-weight: 700 !important;
      font-size: 0.80em !important;
      line-height: 1 !important;
      margin-left: 6px !important;
      box-shadow: 0 4px 10px rgba(2,6,23,0.12), inset 0 0 0 2px rgba(255,255,255,0.85) !important;
      transition: transform 160ms ease, box-shadow 180ms ease, filter 180ms ease !important;
      user-select: none !important;
    }
    .estimate-items-list .estimate-item-row .vendor-badge:hover {
      transform: translateY(-1px) scale(1.07) !important;
      box-shadow: 0 6px 14px rgba(2,6,23,0.18), inset 0 0 0 2px rgba(255,255,255,0.95) !important;
      filter: brightness(1.03) !important;
    }
    .estimate-items-list .estimate-item-row .vendor-badge[data-fullname]:hover::after {
      content: attr(data-fullname);
      position: absolute;
      left: 50%;
      top: -6px;
      transform: translate(-50%, -100%) scale(0.98);
      background: #0f172a;
      color: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.78em;
      white-space: nowrap;
      box-shadow: 0 8px 24px rgba(15,23,42,0.22);
      opacity: 0.98;
      pointer-events: none;
      z-index: 9999;
    }
    .estimate-items-list .estimate-item-row .vendor-badge[data-fullname]:hover::before {
      content: "";
      position: absolute;
      left: 50%;
      top: -6px;
      transform: translate(-50%, -50%);
      width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid #0f172a;
      pointer-events: none;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);
}

// Styles for Jobs flyout (desktop + mobile responsive)
if (!document.getElementById('jobs-flyout-styles')) {
  const style = document.createElement('style');
  style.id = 'jobs-flyout-styles';
  style.innerHTML = `
    .jobs-flyout {
      position: fixed;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
      width: 380px;
      max-height: 70vh;
      overflow: hidden;
      z-index: 9999;
    }
    .jobs-flyout-search { position: sticky; top: 0; background: #fff; padding: 10px; border-bottom: 1px solid #eef2f7; }
    .jobs-flyout .search-input { width: 100%; padding: 9px 11px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 0.96em; }
    #jobs-flyout-content { max-height: calc(70vh - 54px); overflow-y: auto; padding: 8px 10px; }
    #jobs-flyout-content::-webkit-scrollbar { width: 0; height: 0; }
    #jobs-flyout-content { scrollbar-width: none; }
    .jobs-loading { color: #64748b; padding: 8px; font-size: 0.95em; }
    .jobs-status-group { margin-bottom: 12px; }
    .jobs-status-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; color: #0f172a; font-weight: 700; }
    .jobs-list { list-style: none; padding: 0; margin: 4px 0 0 0; }
    .job-item { display: flex; gap: 10px; align-items: center; padding: 8px 6px; border-radius: 8px; cursor: pointer; }
    .job-item:hover { background: #f8fafc; }
    .job-avatar { width: 28px; height: 28px; border-radius: 50%; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 0.95em; }
    .job-meta { display: flex; flex-direction: column; min-width: 0; }
    .job-meta .job-name { font-weight: 600; color: #0f172a; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
    .job-meta .job-sub { font-size: 0.85em; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }

    @media (max-width: 640px) {
      .jobs-flyout { width: calc(100vw - 24px) !important; left: 12px !important; max-height: 80vh; border-radius: 12px; }
      #jobs-flyout-content { max-height: calc(80vh - 54px); padding: 6px 8px; }
      .jobs-flyout .search-input { padding: 10px 12px; }
      .job-item { padding: 10px 8px; gap: 12px; }
      .job-avatar { width: 32px; height: 32px; font-size: 1em; }
      .job-meta .job-name, .job-meta .job-sub { max-width: calc(100vw - 120px); }
    }
  `;
  document.head.appendChild(style);
}

// Add styles for the estimate progress bar and preview
if (!document.getElementById("estimate-progress-bar-styles")) {
  const style = document.createElement("style");
  style.id = "estimate-progress-bar-styles";
  style.innerHTML = `
    .estimate-progress-bar {
      margin: 12px 0 0 0;
      padding: 0 2px 2px 2px;
    }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.98em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .progress-bar-bg {
      width: 100%;
      background: #e5e7eb;
      border-radius: 8px;
      height: 14px;
      position: relative;
      overflow: hidden;
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, #3b82f6 60%, #0ea5e9 100%);
      height: 100%;
      border-radius: 8px;
      transition: width 0.4s;
      position: absolute;
      left: 0; top: 0;
    }
    .estimate-line-items-preview {
      background: #ffffffff;
      border-radius: 8px;
      margin: 14px 0 0 0;
      padding: 14px 18px;
      box-shadow: 0 1px 6px #e5e7eb;
      animation: fadeIn 0.3s;
    }
    .estimate-category-title {
      font-weight: 600;
      color: #0f4c75;
      margin-bottom: 6px;
      font-size: 1.08em;
    }
    .estimate-items-list {
      list-style: none;
      padding: 0;
      margin: 0 0 10px 0;
    }
    .estimate-item-row {
      display: flex;
      gap: 18px;
      align-items: center;
      font-size: 0.98em;
      padding: 4px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .estimate-item-row:last-child {
      border-bottom: none;
    }
    .estimate-item-name {
      flex: 1;
    .estimate-item-row .vendor-badge {
      position: relative;
      display:inline-flex; align-items:center; justify-content:center;
      width:20px; height:20px; border-radius:50%;
      background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%);
      color:#fff; font-weight:700; font-size:0.72em;
      line-height:1; margin-left:6px;
      box-shadow: 0 4px 10px rgba(2,6,23,0.12), inset 0 0 0 2px rgba(255,255,255,0.85);
      transition: transform 160ms ease, box-shadow 180ms ease, filter 180ms ease;
      user-select: none;
    }
    .estimate-item-row .vendor-badge:hover {
      transform: translateY(-1px) scale(1.07);
      box-shadow: 0 6px 14px rgba(2,6,23,0.18), inset 0 0 0 2px rgba(255,255,255,0.95);
      filter: brightness(1.03);
    }
    /* Modern tooltip for vendor full name */
    .estimate-item-row .vendor-badge[data-fullname]:hover::after {
      content: attr(data-fullname);
      position: absolute;
      left: 50%;
      top: -6px;
      transform: translate(-50%, -100%) scale(0.98);
      background: #0f172a;
      color: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.78em;
      white-space: nowrap;
      box-shadow: 0 8px 24px rgba(15,23,42,0.22);
      opacity: 0.98;
      pointer-events: none;
    }
    .estimate-item-row .vendor-badge[data-fullname]:hover::before {
      content: "";
      position: absolute;
      left: 50%;
      top: -6px;
      transform: translate(-50%, -50%);
      width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid #0f172a;
      pointer-events: none;
    }
    .estimate-item-labor, .estimate-item-material { color:#475569; font-size:0.9em; }
      font-weight: 500;
      color: #334155;
    }
    .estimate-item-status-select {
      font-size: 0.9em;
      padding: 2px 6px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #ffffff;
      color: #334155;
    }
    /* Color the select based on status */
    .estimate-item-status-select.status-in-progress { color: #f59e42; background: #fffbeb; border-color: #fde68a; }
    .estimate-item-status-select.status-approved { color: #3b82f6; background: #eff6ff; border-color: #bfdbfe; }
    .estimate-item-status-select.status-completed { color: #10b981; background: #ecfdf5; border-color: #bbf7d0; }

    .estimate-item-status.approved {
      color: #3b82f6;
      font-weight: 600;
    }

    .estimate-item-status.completed {
      color: #10b981;
      font-weight: 600;
    }
    .estimate-item-status.in-progress {
      color: #f59e42;
      font-weight: 600;
    }
    .estimate-item-qty, .estimate-item-material, .estimate-item-labor {
      color: #64748b;
      font-size: 0.97em;
    }
      .estimate-item-total {
      color: #0f4c75;
      font-weight: 600;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px);}
      to { opacity: 1; transform: translateY(0);}
    }
  `;
  document.head.appendChild(style);
}

// Add styles for the estimates table view
if (!document.getElementById("estimate-table-styles")) {
  const style = document.createElement("style");
  style.id = "estimate-table-styles";
  style.innerHTML = `
    .estimate-table-wrapper { margin-top: 10px; }
    .estimate-table { width: 100%; border-collapse: collapse; font-size: 0.95em; }
  .estimate-table thead th { text-align: left; background: #f8fafc; color: #334155; font-weight: 600; padding: 9px 10px; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; z-index: 1; }
  .estimate-table tbody td { padding: 8px 10px; border-bottom: 1px solid #eef2f7; vertical-align: middle; }
    .estimate-table tbody tr:hover { background: #f9fbff; }
  .est-title-cell { display: flex; align-items: center; gap: 4px; }
  .row-caret { background: none; border: none; cursor: pointer; color: #64748b; font-size: 0.8em; padding: 2px; }
    .row-caret i { transition: transform 0.18s ease; }
    .est-actions { white-space: nowrap; }
    .est-actions .smart-btn { background: #f1f5f9; border: 1px solid #e5e7eb; padding: 6px 8px; margin-right: 6px; border-radius: 6px; color: #334155; cursor: pointer; }
    .est-actions .smart-btn:hover { background: #e2e8f0; }
    .est-actions .smart-btn.danger { color: #64748b; }
    .progress-bar-bg.mini { height: 10px; }

    /* Sortable header */
    .estimate-table .est-sort-cell { cursor: pointer; user-select: none; }
    .estimate-table .est-sort-cell .sort-indicator { font-size: 0.85em; color: #64748b; margin-left: 6px; }

    /* Make estimate title smaller and more compact inside the table */
    .estimate-table .estimate-title { display: flex; align-items: center; gap: 4px; margin: 0; line-height: 1.05; }
    .estimate-table .estimate-title-text { font-size: inherit; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 32ch; }
    .estimate-table .edit-title-btn { font-size: 0.75em !important; margin-left: 4px !important; }

    /* Progress cell layout and percentage label */
    .estimate-table .progress-cell { display: flex; align-items: center; gap: 8px; }
    .estimate-table .progress-percent { font-size: 0.9em; color: #475569; min-width: 3ch; text-align: right; }

    /* Row-level tiny spinner when updating */
    .estimate-table .row-spinner {
      width: 14px; height: 14px; margin-left: 6px; display: inline-block;
      border: 2px solid #cbd5e1; border-top-color: #3b82f6; border-radius: 50%;
      animation: rowspin 0.8s linear infinite;
    }
    .estimate-table .row-updating .progress-bar-fill { opacity: 0.5; }
    @keyframes rowspin { to { transform: rotate(360deg); } }

    /* Mobile responsiveness */
    .estimate-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    @media (max-width: 640px) {
      .estimate-table { font-size: 0.92em; min-width: 760px; }
      .estimate-table thead th, .estimate-table tbody td { padding: 8px 8px; }
      /* Show all columns on mobile; horizontal scroll enabled via wrapper */
      .est-title-cell { align-items: center; }
      .estimate-table .estimate-title-text { max-width: 22ch; }
      .estimate-table .progress-percent { font-size: 0.85em; }
      .row-caret { padding: 4px; }
    }
  `;
  document.head.appendChild(style);
}

// Add styles for the estimate progress bar
if (!document.getElementById("estimate-progress-bar-styles")) {
  const style = document.createElement("style");
  style.id = "estimate-progress-bar-styles";
  style.innerHTML = `
    .estimate-progress-bar {
      margin: 12px 0 0 0;
      padding: 0 2px 2px 2px;
    }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.80em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .progress-bar-bg {
      width: 100%;
      background: #e5e7eb;
      border-radius: 8px;
      height: 14px;
      position: relative;
      overflow: hidden;
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, #3b82f6 60%, #0ea5e9 100%);
      height: 100%;
      border-radius: 8px;
      transition: width 0.4s;
      position: absolute;
      left: 0; top: 0;
    }
    /* Mobile tweaks for preview list */
    @media (max-width: 640px) {
      .estimate-line-items-preview { padding: 10px 12px; }
      .estimate-item-row { flex-wrap: wrap; gap: 8px; padding: 6px 0; }
      .estimate-item-name { flex: 1 1 100%; }
      .estimate-item-status-select, .estimate-item-qty, .estimate-item-total { font-size: 0.9em; }
    }
  `;
  document.head.appendChild(style);
}


// Add modern styles for the estimates section and graph
if (!document.getElementById("modern-estimate-styles")) {
  const style = document.createElement("style");
  style.id = "modern-estimate-styles";
  style.innerHTML = `
    .modern-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(59,130,246,0.07), 0 1.5px 6px rgba(0,0,0,0.04);
      margin-bottom: 18px;
      padding: 0px 28px;
      transition: box-shadow 0.2s;
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .modern-card:hover {
      box-shadow: 0 4px 24px rgba(59,130,246,0.13), 0 3px 12px rgba(0,0,0,0.08);
      border-color: #3b82f6;
    }
    .estimate-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .estimate-date {
      font-size: 0.95rem;
      color: #64748b;
      margin-top: 2px;
      display: inline-block;
    }
    .estimate-actions {
      display: flex;
      gap: 8px;
    }
    .smart-btn {
      background: #f3f4f6;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 0.98rem;
      color: #007bff;
      cursor: pointer;
      transition: background 0.18s, color 0.18s;
      display: flex;
      align-items: center;
      gap: 0px;
    }
    .smart-btn:hover {
      background: #e0e7ff;
      color: #0063f7ff;
    }
    .smart-btn.danger {
      color: #ef4444;
      background: #ffffffff;
    }
    .smart-btn.danger:hover {
      background: #fee2e2;
      color: #b91c1c;
    }
    .estimate-details {
      display: flex;
      gap: 32px;
      font-size: 1.05rem;
      color: #334155;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .mono {
      font-family: 'Roboto Mono', 'Menlo', 'Consolas', monospace;
      font-size: 0.95em;
      letter-spacing: 0.5px;
    }
    .empty-estimates {
      text-align: center;
      padding: 40px 0;
      color: #64748b;
      font-size: 1.1rem;
    }

@media (max-width: 600px) {
  .estimate-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 0 0 0;
  }
  .estimate-actions {
    width: 100%;
    justify-content: flex-start;
    gap: 6px;
    margin-top: 6px;
  }
  .estimate-title {
    font-size: 1.08rem;
  }
}

    /* --- Modern Graph Styles --- */
     .alt-estimate-graph {
      display: flex;
      align-items: center;
      gap: 32px;
      background: #f8fafc;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(59,130,246,0.07);
      padding: 22px 18px;
      margin-bottom: 18px;
      border: 1px solid #e5e7eb;
      flex-wrap: wrap;
    }
    .alt-graph-circle {
      width: 90px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #eaf6ff;
      border-radius: 50%;
      box-shadow: 0 1px 8px #e5e7eb;
      margin-right: 18px;
      position: relative;
    }
    .alt-graph-circle svg {
      display: block;
      margin: auto;
    }
    .alt-graph-details {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 120px;
    }
    .alt-graph-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1.08em;
      padding: 2px 0;
    }
    .alt-graph-label {
      color: #64748b;
      font-weight: 500;
    }
    .alt-graph-value {
      font-weight: 700;
      color: #0f172a;
      margin-left: 18px;
    }
    @media (max-width: 600px) {
      .alt-estimate-graph {
        flex-direction: column;
        gap: 12px;
        padding: 12px 6px;
        border-radius: 10px;
      }
      .alt-graph-circle {
        margin-right: 0;
        margin-bottom: 10px;
        width: 95px; height: 72px;
      }
      .alt-graph-details {
        min-width: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
  
  function openFinancialReport(projectId) {
    if (!projectId) {
      alert("Project ID is missing!");
      return;
    }
    window.location.href = `/project-financials.html?projectId=${projectId}`;
  }
  
  
  function toggleDropdownt() {
    const dropdown = document.getElementById("estimateDropdown");
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  }

  function closeDropdownt() {
    document.getElementById("estimateDropdown").style.display = "none";
  }
  function closeDropdown() {
    document.getElementById("estimateDropdown").style.display = "none";
  }
  
  // Close dropdown if clicked outside
  window.addEventListener('click', function(e) {
    const toggle = document.querySelector('.dropdown-togglet');
    const menu = document.getElementById("estimateDropdown");
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });



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
  showLoader(); // 👈 START
  try {
    const response = await fetch(`/api/estimates/${estimateId}`, { method: "DELETE" });

    if (!response.ok) throw new Error("Failed to delete estimate");

    showToast("Estimate deleted successfully!");
    
    const projectId = getProjectId(); // Use the helper function
    loadEstimates(projectId); // Refresh the estimates after deletion
  } catch (error) {
    console.error("Error deleting estimate:", error);
    showToast("Failed to delete estimate. Please try again.");
  } finally {
    hideLoader(); // 👈 END
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
    showLoader(); // 👈 START
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
        const requiredFields = ["Category", "Name", "Quantity",];
        const optionalFields = ["Cost Code"];
        const firstRow = jsonData[0] || {};
        const missingFields = requiredFields.filter(
          (field) => !(field in firstRow) || !firstRow[field]
        );
        
        if (missingFields.length) {
          showToast(`Invalid Excel file. Missing required fields: ${missingFields.join(", ")}`);
          return;
        }
        

        // ✅ Convert extracted Excel data into the required format
        const formattedEstimate = formatEstimateFromExcel(jsonData);

        // ✅ Get the current project ID
        const projectId = getProjectId();
        if (!projectId) {
          showToast("Error: No project ID found.");
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

        showToast("Estimate imported and created successfully!");

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
      showToast("Error importing estimate. Please check the file and try again.");
    } finally {
      hideLoader(); // 👈 END
    }
  });

  fileInput.click(); // ✅ Open file dialog
}

// ✅ Convert Excel JSON into required estimate format
function formatEstimateFromExcel(data) {
  const lineItemsMap = new Map();

  data.forEach((row) => {
    const hasAllRequiredFields =
      typeof row.Category === "string" &&
      typeof row.Name === "string" &&
      row.Category.trim() !== "" &&
      row.Name.trim() !== "" &&
      (row.Quantity !== undefined && row.Quantity !== null) &&
      (row["Unit Price"] !== undefined && row["Unit Price"] !== null);

    if (!hasAllRequiredFields) {
      console.warn("⚠️ Skipping row due to missing required fields:", row);
      return;
    }

    const categoryName = row.Category.trim();
    const item = {
      name: row.Name.trim(),
      description: row.Description ? row.Description.trim() : "",
      quantity: parseInt(row.Quantity, 10) || 1,
      unitPrice: parseFloat(row["Unit Price"]) || 0,
      total: (parseInt(row.Quantity, 10) || 1) * (parseFloat(row["Unit Price"]) || 0),
      costCode: row["Cost Code"] ? String(row["Cost Code"]).trim() : "" // ✅ NEW FIELD
    };

    if (!lineItemsMap.has(categoryName)) {
      lineItemsMap.set(categoryName, {
        type: "category",
        category: categoryName,
        status: "in-progress",
        items: []
      });
    }

    lineItemsMap.get(categoryName).items.push(item);
  });

  const lineItems = Array.from(lineItemsMap.values()).filter(category => category.items.length > 0);

  return {
    lineItems,
    tax: 0
  };
}



 


// Placeholder for using a template
function downloadTemplate() {
  const link = document.createElement("a");
  link.href = "/files/EstimateTemplate3.xlsx"; // Adjust this path based on your server setup
  link.download = "EstimateTemplate3.xlsx";
  document.body.appendChild(link); // Needed for Firefox
  link.click();
  document.body.removeChild(link);
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

function showFileSectionLoader() {
  document.getElementById('file-loader').style.display = 'flex';
}
function hideFileSectionLoader() {
  document.getElementById('file-loader').style.display = 'none';
}

document.addEventListener("DOMContentLoaded", () => {
  const BASE_URL = "https://node-mongodb-api-1h93.onrender.com";
  const UPLOADS_PATH = `${BASE_URL}/uploads/`;

  const projectId = getProjectId();
  if (projectId) {
    fetchFiles(projectId);
  }




  // ✅ Unified File Upload Function (Click & Drop)
  function uploadFiles() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,application/pdf';
    fileInput.multiple = true;
    fileInput.addEventListener('change', handleFileUpload);
    fileInput.click();
  }

  // ✅ Drag and Drop Implementation
  const dropzone = document.getElementById('dropzone');

  dropzone.addEventListener('click', uploadFiles);
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleDrop(e);
  });

  function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length) {
      handleFileUpload({ target: { files } });
    }
  }

  // ✅ Handle File Upload
async function handleFileUpload(event) {
  const files = event.target.files;
  if (!files.length) return;

  const formData = new FormData();
  Array.from(files).forEach(file => formData.append('files', file));

  showFileSectionLoader();

  try {
    const response = await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error("File upload failed");

    showToast("✅ Files uploaded successfully.");

    // Refresh file list
    await fetchFiles(projectId);
  } catch (error) {
    console.error("Error uploading files:", error);
  } finally {
    hideFileSectionLoader();
  }
}

function fetchFiles(projectId) {
  showFileSectionLoader();
  fetch(`${BASE_URL}/api/projects/${projectId}/files`)
    .then(response => response.json())
    .then(files => displayFiles(files))
    .catch(err => console.error('Error fetching files:', err))
    .finally(() => hideFileSectionLoader());
}

// ✅ Display Files with Updated Preview Function
function displayFiles(files) {
  const container = document.getElementById('uploaded-files-container');
  container.innerHTML = '';

  // Add file count styled like the estimate section
  let fileCountEl = document.getElementById('files-count');
  if (!fileCountEl) {
    fileCountEl = document.createElement('span');
    fileCountEl.id = 'files-count';
    fileCountEl.style.fontWeight = 'bold';
    fileCountEl.style.color = '#0f4c75';
    fileCountEl.style.marginLeft = '8px';
    // Try to insert after the section title if available
    const sectionTitle = document.querySelector('#files-section h2');
    if (sectionTitle) {
      sectionTitle.appendChild(fileCountEl);
    } else if (container.parentNode) {
      container.parentNode.insertBefore(fileCountEl, container);
    }
  }
  fileCountEl.textContent = `(${files.length})`;
  

  // Enable scroll if more than 10 files
  if (files.length > 10) {
    container.style.maxHeight = '440px';
    container.style.overflowY = 'auto';
  } else {
    container.style.maxHeight = '';
    container.style.overflowY = '';
  }


  files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    // Extract the filename for display (remove any timestamp prefix)
    // Example: "1753712159161-WEBB FIRE PLAN.pdf" → "WEBB FIRE PLAN.pdf"
    let filename = file.filename || file.path.split('/').pop();
    if (/^\d{10,}-/.test(filename)) {
      filename = filename.replace(/^\d{10,}-/, '');
    }

    const fileUrl = `${UPLOADS_PATH}${encodeURIComponent(file.path.split('/').pop())}`;

    // Checkbox for Selection
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-checkbox';
    checkbox.dataset.fileId = file._id;
    checkbox.addEventListener('change', toggleActionDropdown);

    // File Icon
    const fileIcon = document.createElement('span');
    fileIcon.className = 'file-icon';
    fileIcon.textContent = getFileIcon(file.mimetype);

    // File Name (Clickable to Open in New Tab)
    const fileName = document.createElement('a');
    fileName.href = fileUrl;
    fileName.textContent = filename; // Show cleaned filename
    fileName.className = 'file-name';
    fileName.target = '_blank';
    fileName.style.cursor = 'pointer';

    // Download Icon
    const downloadIcon = document.createElement('i');
    downloadIcon.className = 'fas fa-download file-action-icon';
    downloadIcon.title = 'Download';
    downloadIcon.addEventListener('click', () => downloadFile(file._id));

    // Delete Icon
    const deleteIcon = document.createElement('i');
    deleteIcon.className = 'fas fa-trash-alt file-action-icon';
    deleteIcon.title = 'Delete';
    deleteIcon.addEventListener('click', () => deleteFile(file._id, fileItem));

    // --- Preview on Hover ---
    fileItem.addEventListener('mouseenter', (e) => showFilePreview(e, fileUrl, file.mimetype));
    fileItem.addEventListener('mousemove', (e) => {
      if (!isMouseOverPopup) moveFilePreview(e);
    });
    fileItem.addEventListener('mouseleave', hideFilePreview);

    fileItem.appendChild(checkbox);
    fileItem.appendChild(fileIcon);
    fileItem.appendChild(fileName);
    fileItem.appendChild(downloadIcon);
    fileItem.appendChild(deleteIcon);

    container.appendChild(fileItem);
  });

  toggleActionDropdown();
}

// --- File Preview Functions ---
let isMouseOverPopup = false;
let isMouseOverFileItem = false;

function showFilePreview(e, fileUrl, mimetype) {
  const popup = document.getElementById('file-preview-popup');
  if (!popup) return;

  if (mimetype.startsWith('image')) {
    popup.innerHTML = `<img src="${fileUrl}" alt="Preview" />`;
  } else if (mimetype === 'application/pdf') {
    popup.innerHTML = `<embed src="${fileUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" width="300" height="300" />`;
  } else {
    popup.innerHTML = `<div style="padding:20px 10px; color:#64748b;">No preview available</div>`;
  }
  popup.style.display = 'block';
  // Do NOT call moveFilePreview here!
}

function moveFilePreview(e) {
  const popup = document.getElementById('file-preview-popup');
  if (!popup || isMouseOverPopup) return;
  popup.style.left = (e.clientX + 20) + 'px';
  popup.style.top = (e.clientY + 10) + 'px';
}

function hideFilePreview() {
  const popup = document.getElementById('file-preview-popup');
  if (popup) popup.style.display = 'none';
}



// Add these listeners ONCE after DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = document.getElementById('file-preview-popup');
  if (popup) {
    popup.addEventListener('mouseenter', () => {
      isMouseOverPopup = true;
      popup.style.display = 'block';
    });
    popup.addEventListener('mouseleave', () => {
      isMouseOverPopup = false;
      setTimeout(() => {
        if (!isMouseOverFileItem) hideFilePreview();
      }, 80);
    });
  }
});

  // ✅ Toggle Action Dropdown
  function toggleActionDropdown() {
    const selectedFiles = document.querySelectorAll('.file-checkbox:checked').length;
    const actionDropdown = document.getElementById('file-actions');
    actionDropdown.style.display = selectedFiles > 0 ? 'block' : 'none';


      // Clear the dropdown selection when no files are selected
  if (selectedFiles === 0) {
    document.getElementById('file-action-select').value = "";
  }
  }

  // ✅ Select All / Deselect All Function
  function selectAllFiles() {
    const selectAllCheckbox = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.file-checkbox');

    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllCheckbox.checked;
    });

    toggleActionDropdown();
  }

  // ✅ Perform File Action (Delete or Download)
  function performFileAction() {
    const action = document.getElementById('file-action-select').value;
    const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked'))
      .map(cb => cb.dataset.fileId);

    if (!selectedFiles.length) {
      alert("No files selected.");
      return;
    }

    if (action === 'delete') {
      deleteMultipleFiles(selectedFiles);
    } else if (action === 'download') {
      selectedFiles.forEach(id => downloadFile(id));
    }

    document.getElementById('select-all').checked = false;
    toggleActionDropdown();
  }

  // ✅ Download File
  function downloadFile(fileId) {
    const projectId = getProjectId();
    if (!projectId) return;

    const downloadUrl = `${BASE_URL}/api/projects/${projectId}/files/${fileId}/download`;
    window.open(downloadUrl, '_blank');
  }

// ✅ Delete Multiple Files with Confirmation
async function deleteMultipleFiles(fileIds) {
  const projectId = getProjectId();
  if (!projectId) {
    showToast("❌ Project ID is missing.", "error");
    return;
  }

  if (!fileIds.length) {
    showToast("❌ No files selected for deletion.", "error");
    return;
  }

  // ✅ Confirmation Prompt
  const confirmation = confirm(`Are you sure you want to delete ${fileIds.length} file(s)?`);
  if (!confirmation) {
    showToast("File deletion cancelled.");
    return;
  }

  const deletionPromises = fileIds.map(id => deleteFile(id));
  const results = await Promise.allSettled(deletionPromises);

  let successCount = 0;
  let errorCount = 0;

  results.forEach(result => {
    if (result.status === "fulfilled") {
      successCount++;
    } else {
      errorCount++;
    }
  });

  // ✅ Show toast based on success/failure counts
  if (successCount > 0) {
    showToast(`✅ ${successCount} file(s) deleted successfully.`);
  }
  if (errorCount > 0) {
    showToast(`❌ Failed to delete ${errorCount} file(s).`, "error");
  }

  // Refresh the file list
  fetchFiles(projectId);
}


  // ✅ Delete Single File
// ✅ Delete Single File with Confirmation and Toast Notification
async function deleteFile(fileId, fileElement) {
  const projectId = getProjectId();
  if (!projectId) {
    showToast("❌ Project ID is missing.", "error");
    return;
  }

  // ✅ Confirmation Prompt
  const confirmation = confirm("Are you sure you want to delete this file?");
  if (!confirmation) {
    showToast("File deletion cancelled.");
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/projects/${projectId}/files/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error("File deletion failed");
    }

    // ✅ Remove file element from DOM
    if (fileElement) {
      fileElement.remove();
    }

    showToast("✅ File deleted successfully.");

  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    showToast("❌ Error deleting file. Please try again.", "error");
  }
}


  // ✅ Get File Icon
  function getFileIcon(mimetype) {
    if (mimetype.startsWith('image')) return '📷';
    if (mimetype === 'application/pdf') return '📄';
    return '📁';
  }

// ✅ Preview File - Open in a New Tab Instead of Modal
function previewFile(fileUrl, mimetype) {
  if (!fileUrl) {
    showToast("❌ File URL is missing.", "error");
    return;
  }

  try {
    window.open(fileUrl, '_blank');
    showToast("✅ File opened in a new tab.");
  } catch (error) {
    console.error("Error opening file:", error);
    showToast("❌ Error opening file.", "error");
  }
}


  // ✅ Expose Global Functions
  window.uploadFiles = uploadFiles;
  window.selectAllFiles = selectAllFiles;
  window.performFileAction = performFileAction;
 
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
  
  loadSidebarProjects();
  setupManageTeamModal();
  renderQualityControlItems(projectId);
  



// After DOM loads or within your init function:
const financialBtn = document.getElementById("financial-report-button");
if (financialBtn && projectId) {
  financialBtn.onclick = () => openFinancialReport(projectId);
}


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
        <td>${vendor.phone || "—"}</td>
        <td>
          <div class="dropdown">
            <button class="dropbtn">⋮</button>
            <div class="dropdown-content">
              <a href="#" onclick="editVendor('${vendor._id}', '${vendor.name}', '${vendor.email}', '${vendor.phone || ''}')">Edit</a>
              <a href="#" onclick="removeVendor('${vendor._id}')">Remove</a>
            </div>
          </div>
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
    showToast("Vendor removed!");
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
    showToast("Vendor updated!");
    fetchVendors();
  } catch (error) {
    console.error("Error updating vendor:", error);
  }
}








// ✅ Fetch and Render Quality Control Summary Only
async function renderQualityControlItems(projectId) {
  const container = document.getElementById("quality-review-items");
  container.innerHTML = "<p style='color:#aaa;'>Loading summary...</p>";

  try {
    const res = await fetch(`/api/quality-review/items/${projectId}`);
    const { items } = await res.json();
    container.innerHTML = "";

    if (!items || items.length === 0) {
      container.innerHTML = "<p style='color:#999;'>No items currently pending review.</p>";
      return;
    }

    // 🔢 Summary counts
    const reworkCount = items.filter(i => i.qualityControl?.status === "rework").length;
    const approvedCount = items.filter(i => i.qualityControl?.status === "approved").length;
    const pendingCount = items.filter(i => !i.qualityControl?.status || i.qualityControl?.status === "pending").length;

    // 🔹 Navigation Button
    container.innerHTML += `
      <div class="qc-nav">
        <button class="qc-control-btn" onclick="navigateToQCControl('${projectId}')">Go to QC Control</button>
      </div>
    `;

    // 🔹 Summary Tags
    container.innerHTML += `
      <div class="qc-tabs sticky-tabs">
        <button class="qc-tab active" data-status="all">All (${items.length})</button>
        <button class="qc-tab" data-status="approved">✅ Approved (${approvedCount})</button>
        <button class="qc-tab" data-status="rework">🛠 Rework (${reworkCount})</button>
        <button class="qc-tab" data-status="pending">⏳ Pending (${pendingCount})</button>
      </div>
    `;

  } catch (err) {
    console.error("❌ Error loading QC summary:", err);
    container.innerHTML = "<p style='color: red;'>Failed to load quality control summary.</p>";
  }
}

// ✅ Navigation to QC Control Page
function navigateToQCControl(projectId) {
  window.location.href = `/qccontrol.html?projectId=${projectId}`;
}







// Add/replace these functions near your notification logic

async function fetchMaintenanceNotifications(projectId) {
    try {
        const res = await fetch(`/api/properties/${projectId}/maintenance`);
        if (!res.ok) return [];
        const requests = await res.json();
        // Only show pending or new requests
        return requests.filter(r => r.status === 'pending' || r.status === 'new');
    } catch (err) {
        console.error('Error fetching maintenance notifications:', err);
        return [];
    }
}

// Add this function globally
window.createOrderFromMaintenance = async function(unitNumber, description, projectId, maintenanceRequestId) {
    showLoader();
    try {
        const estimatePayload = {
            projectId,
            title: `Unit ${unitNumber}`,
            lineItems: [
                {
                    type: "category",
                    category: "Maintenance Requests",
                    status: "in-progress",
                    items: [
                        {
                            type: "item",
                            name: unitNumber,
                            description: description || "",
                            quantity: 1,
                            unitPrice: 0,
                            total: 0,
                            costCode: "12-200 Property Maintenance",
                            status: "in-progress",
                            maintenanceRequestId // <-- Pass the request ID here
                        }
                    ]
                }
            ],
            tax: 0
        };

        const response = await fetch("/api/estimates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(estimatePayload)
        });

        if (!response.ok) throw new Error("Failed to create order/estimate.");

        const result = await response.json();
        showToast("Order created successfully!");

        if (result.estimate && result.estimate._id) {
            window.location.href = `/estimate-edit.html?projectId=${projectId}&estimateId=${result.estimate._id}`;
        }
    } catch (error) {
        console.error("Error creating order:", error);
        showToast("Error creating order. Please try again.");
    } finally {
        hideLoader();
    }
};


function renderMaintenanceNotifDropdown(requests) {
    const notifCount = document.getElementById('maintenanceNotifCount');
    const notifDropdown = document.getElementById('maintenanceNotifDropdown');
    const notifList = document.getElementById('maintenanceNotifList');
    if (!notifCount || !notifDropdown || !notifList) return;

    notifCount.textContent = requests.length;
    notifCount.style.display = requests.length ? '' : 'none';

    if (!requests.length) {
        notifList.innerHTML = `<div style="padding:24px; color:#888; text-align:center;">
            <i class="fas fa-check-circle" style="color:#27ae60; font-size:1.7em;"></i>
            <div style="margin-top:8px;">No pending maintenance requests.</div>
        </div>`;
        return;
    }

    const projectId = window.currentProjectId || getProjectIdFromPage();

    notifList.innerHTML = requests.map((r, idx) => `
        <div class="notif-list-item modern-notif-item">
            <div class="notif-list-row">
                <div class="notif-title">
                    <i class="fas fa-tools"></i> ${r.title}
                </div>
                <span class="notif-priority">
                    Priority: ${r.priority}
                </span>
                <span class="notif-status">
                    Status: ${r.status}
                </span>
            </div>
            <div class="notif-desc">
                ${r.description}
            </div>
            <div class="notif-meta">
                <span class="notif-unit"><i class="fas fa-door-open"></i> Unit: ${r.unitId?.number || 'N/A'}</span>
                <span><i class="far fa-calendar-alt"></i> Requested: ${new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <div style="margin-top:10px; text-align:right; position:relative;">
            <button type="button" class="btn-primary create-order-btn" 
                style="padding:7px 18px; font-size:0.97em; border-radius:7px;"
                data-idx="${idx}">
                    <i class="fas fa-file-invoice-dollar"></i> Create Order
                </button>
                <div class="order-dropdown" id="orderDropdown-${idx}" style="display:none; position:absolute; right:0; top:50px;">
              <button type="button" class="order-dropdown-btn order-create-new-btn"
                data-unit="${escapeHtmlAttr(r.unitId?.number || '')}"
                data-desc="${escapeHtmlAttr(r.description || '')}"
                data-project="${escapeHtmlAttr(projectId)}"
                data-maint="${escapeHtmlAttr(r._id)}">Create New Estimate</button>
              <button type="button" class="order-dropdown-btn order-add-existing-btn"
                data-unit="${escapeHtmlAttr(r.unitId?.number || '')}"
                data-desc="${escapeHtmlAttr(r.description || '')}"
                data-project="${escapeHtmlAttr(projectId)}"
                data-maint="${escapeHtmlAttr(r._id)}">Add Line Item to Existing Estimate</button>
                </div>
            </div>
        </div>
    `).join('');

    // Wire delegated handlers for maintenance actions to avoid inline JS issues
    // Toggle dropdown button
    notifList.querySelectorAll('.create-order-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = btn.getAttribute('data-idx');
        if (typeof window.toggleOrderDropdown === 'function') window.toggleOrderDropdown(parseInt(idx, 10));
      });
    });
    // Create new estimate
    notifList.querySelectorAll('.order-create-new-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const unit = btn.getAttribute('data-unit') || '';
        const desc = btn.getAttribute('data-desc') || '';
        const proj = btn.getAttribute('data-project') || '';
        const maint = btn.getAttribute('data-maint') || '';
        if (typeof window.createOrderFromMaintenance === 'function') {
          window.createOrderFromMaintenance(unit, desc, proj, maint);
        }
      });
    });
    // Add to existing estimate
    notifList.querySelectorAll('.order-add-existing-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const unit = btn.getAttribute('data-unit') || '';
        const desc = btn.getAttribute('data-desc') || '';
        const proj = btn.getAttribute('data-project') || '';
        const maint = btn.getAttribute('data-maint') || '';
        if (typeof window.showEstimateSelectModal === 'function') {
          window.showEstimateSelectModal(unit, desc, proj, maint);
        }
      });
    });
}

// Toggle dropdown for each request
window.toggleOrderDropdown = function(idx) {
    // Hide all other dropdowns except the one clicked
    document.querySelectorAll('.order-dropdown').forEach((d, i) => {
        if (i !== idx) d.style.display = 'none';
    });
    const dropdown = document.getElementById(`orderDropdown-${idx}`);
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' || !dropdown.style.display ? 'block' : 'none';
    }
    // Prevent event bubbling to document click
    if (window.event) window.event.stopPropagation();
};

// Hide all order dropdowns when clicking outside
document.addEventListener('click', function(e) {
    // Only close if not clicking inside any order-dropdown or on a create-order-btn
    if (!e.target.closest('.order-dropdown') && !e.target.closest('.create-order-btn')) {
        document.querySelectorAll('.order-dropdown').forEach(d => d.style.display = 'none');
    }
});

// Prevent clicks inside the dropdown from closing it
document.querySelectorAll('.order-dropdown').forEach(dropdown => {
    dropdown.addEventListener('click', function(e) {
        e.stopPropagation();
    });
});

// Show modal to select estimate
window.showEstimateSelectModal = async function(unitNumber, description, projectId, maintenanceRequestId) {
    showLoader();
    try {
        const response = await fetch(`/api/estimates?projectId=${projectId}`);
        if (!response.ok) throw new Error("Failed to fetch estimates");
        const { estimates } = await response.json();

        // Create modal if not exists
        let modal = document.getElementById('selectEstimateModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'selectEstimateModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:420px;">
                    <h3>Select Estimate</h3>
                    <div id="estimateSelectList"></div>
                    <button onclick="closeSelectEstimateModal()" style="margin-top:18px;" class="btn-secondary">Cancel</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        const list = modal.querySelector('#estimateSelectList');
        list.innerHTML = estimates.length ? estimates.map(e => `
            <div style="margin-bottom:10px;">
                <button type="button" class="btn-primary add-to-estimate-btn" style="width:100%; text-align:left;"
                  data-estimate="${escapeHtmlAttr(e._id)}"
                  data-unit="${escapeHtmlAttr(unitNumber)}"
                  data-desc="${escapeHtmlAttr(description || '')}"
                  data-project="${escapeHtmlAttr(projectId)}"
                  data-maint="${escapeHtmlAttr(maintenanceRequestId)}">
                    ${e.title || 'Untitled'} <span style="float:right; color:#888;">${new Date(e.createdAt).toLocaleDateString()}</span>
                </button>
            </div>
        `).join('') : `<div style="color:#888; padding:12px;">No estimates found.</div>`;
        // Wire delegated action for add to estimate
        list.querySelectorAll('.add-to-estimate-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const est = btn.getAttribute('data-estimate') || '';
            const unit = btn.getAttribute('data-unit') || '';
            const desc = btn.getAttribute('data-desc') || '';
            const proj = btn.getAttribute('data-project') || '';
            const maint = btn.getAttribute('data-maint') || '';
            if (typeof window.addLineItemToEstimate === 'function') {
              window.addLineItemToEstimate(est, unit, desc, proj, maint);
            }
          });
        });
        modal.style.display = 'flex';
    } catch (error) {
        showToast("Error loading estimates.");
    } finally {
        hideLoader();
    }
};

window.closeSelectEstimateModal = function() {
    const modal = document.getElementById('selectEstimateModal');
    if (modal) modal.style.display = 'none';
};

// Add line item to selected estimate
window.addLineItemToEstimate = async function(estimateId, unitNumber, description, projectId, maintenanceRequestId) {
    showLoader();
    try {
        const newItem = {
            type: "item",
            name: unitNumber,
            description: description || "",
            quantity: 1,
            unitPrice: 0,
            total: 0,
            costCode: "12-200 Property Maintenance",
            status: "in-progress",
            maintenanceRequestId // <-- Pass it here
        };

        // Fetch the estimate to get its categories and title
        const response = await fetch(`/api/estimates/${estimateId}`);
        if (!response.ok) throw new Error("Failed to fetch estimate");
        const { estimate } = await response.json();

        // Preserve the existing title
        const preservedTitle = estimate.title;

        // Add to first category or create new if none
        let updatedLineItems = estimate.lineItems && estimate.lineItems.length
            ? [...estimate.lineItems]
            : [{
                type: "category",
                category: "Maintenance Requests",
                status: "in-progress",
                items: []
            }];

        // Add to first category (or you can prompt for category selection)
        updatedLineItems[0].items.push(newItem);

    // Sanitize categories/items to avoid schema cast errors
    const sanitizeForSave = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(cat => {
        const cleanCat = {
          type: 'category',
          category: (cat?.category || '').toString(),
          status: (cat?.status || 'in-progress').toString(),
          items: []
        };
        const items = Array.isArray(cat?.items) ? cat.items : [];
        cleanCat.items = items.map(it => {
          const out = { ...it };
          out.type = 'item';
          out.name = (out.name || '').toString();
          if (out.description && typeof out.description === 'object') {
            const obj = out.description || {};
            out.description = typeof obj.description === 'string' ? obj.description
                    : (typeof obj.name === 'string' ? obj.name : '');
          } else {
            out.description = (out.description || '').toString();
          }
          if (out.costCode != null) out.costCode = out.costCode.toString();
          const qty = isNaN(parseFloat(out.quantity)) ? 0 : parseFloat(out.quantity);
          const price = isNaN(parseFloat(out.unitPrice)) ? 0 : parseFloat(out.unitPrice);
          out.quantity = qty; out.unitPrice = price; out.total = qty * price;
          out.status = (out.status || 'in-progress').toString();
          return out;
        });
        return cleanCat;
      });
    };

    const safeLineItems = sanitizeForSave(updatedLineItems);

    // Update estimate, preserving the title
    const updateRes = await fetch(`/api/estimates/${estimateId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: preservedTitle, lineItems: safeLineItems })
        });

        if (!updateRes.ok) throw new Error("Failed to update estimate");

        showToast("Line item added to estimate!");
        closeSelectEstimateModal();
        // Optionally, redirect to edit page
       
    } catch (error) {
        showToast("Error adding line item.");
    } finally {
        hideLoader();
    }
};

// Add styles for dropdown and modal
if (!document.getElementById('order-dropdown-styles')) {
    const style = document.createElement('style');
    style.id = 'order-dropdown-styles';
    style.innerHTML = `
    .order-dropdown {
        min-width: 220px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(59,130,246,0.07);
        padding: 6px 0;
        z-index: 100;
    }
    .order-dropdown-btn {
        background: none;
        border: none;
        width: 90%;
        text-align: left;
        padding: 8px 10px;
        font-size: 1em;
        color: #2980b9;
        cursor: pointer;
        transition: background 0.18s, color 0.18s;
        border-radius: 6px;
    }
    .order-dropdown-btn:hover {
        background: #2980b9;
        color: #ffffffff;
    }
    .modal {
        display: none;
        position: fixed;
        z-index: 9999;
        left: 0; top: 0; width: 100vw; height: 100vh;
        background: rgba(44,62,80,0.18);
        align-items: center; justify-content: center;
    }
    .modal-content {
        background: #fff;
        border-radius: 12px;
        padding: 32px 28px;
        box-shadow: 0 4px 24px rgba(59,130,246,0.13);
        min-width: 320px;
        max-width: 420px;
        margin: auto;
    }
    .btn-primary {
        background: #0f4c75;
        color: #fff;
        border: none;
        border-radius: 7px;
        padding: 8px 18px;
        font-size: 1em;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.18s;
    }
    .btn-primary:hover {
        background: #217dbb;
    }
    .btn-secondary {
        background: #f3f4f6;
        color: #0f4c75;
        border: none;
        border-radius: 7px;
        padding: 8px 18px;
        font-size: 1em;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.18s;
    }
    .btn-secondary:hover {
        background: #eaf6ff;
        color: #217dbb;
    }
    `;
    document.head.appendChild(style);
}



// Add this to your CSS or <style> block
if (!document.getElementById('modern-notif-styles')) {
    const style = document.createElement('style');
    style.id = 'modern-notif-styles';
    style.innerHTML = `
    .modern-notif-item {
        background: #fff;
        border-radius: 12px;
        margin-bottom: 10px;
        box-shadow: 0 2px 8px rgba(241,196,15,0.07);
        padding: 16px 18px;
        transition: box-shadow 0.18s, background 0.18s;
        border: 1px solid #217dbb;
        cursor: pointer;
    }
    .modern-notif-item:hover {
        background: #f3f6fbff;
        box-shadow: 0 4px 16px rgba(52,152,219,0.10);
        border-color: #569ff7;
    }
    .notif-list-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 4px;
    }
    .notif-title {
        font-weight: 700;
        color: #000000ff;
        font-size: 1.08em;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .notif-priority {
        background: #ffe066;
        color: #e67e22;
        font-weight: 600;
        border-radius: 6px;
        padding: 2px 10px;
        font-size: 0.97em;
    }
    .notif-status {
        background: #eaf6ff;
        color: #2980b9;
        font-weight: 600;
        border-radius: 6px;
        padding: 2px 10px;
        font-size: 0.97em;
    }
    .notif-desc {
        margin: 8px 0 4px 0;
        color: #444;
        font-size: 0.98em;
    }
    .notif-meta {
        font-size: 0.93em;
        color: #888;
        display: flex;
        gap: 18px;
        margin-top: 4px;
    }
    .notif-unit {
        color: #217dbb;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    `;
    document.head.appendChild(style);
}

async function updateMaintenanceNotificationBar() {
    const projectId = window.currentProjectId || getProjectIdFromPage();
    if (!projectId) return;
    const requests = await fetchMaintenanceNotifications(projectId);
    renderMaintenanceNotifDropdown(requests);
}

// Toggle dropdown on icon click
document.addEventListener('DOMContentLoaded', () => {
    updateMaintenanceNotificationBar();

    const notifBtn = document.getElementById('maintenanceNotifBtn');
    const notifDropdown = document.getElementById('maintenanceNotifDropdown');
    if (notifBtn && notifDropdown) {
        notifBtn.onclick = (e) => {
            e.stopPropagation();
            notifDropdown.style.display = notifDropdown.style.display === 'none' || !notifDropdown.style.display ? 'block' : 'none';
        };
        // Hide dropdown when clicking outside
        document.body.addEventListener('click', () => {
            notifDropdown.style.display = 'none';
        });
        notifDropdown.addEventListener('click', (e) => e.stopPropagation());
    }
});

// Helper to get projectId from page (customize as needed)
function getProjectIdFromPage() {
    const match = window.location.pathname.match(/\/details\/projects\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

// Run on page load
document.addEventListener('DOMContentLoaded', updateMaintenanceNotificationBar);




// Auto-open task details from URL (?taskId=...)
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const openTaskId = params.get('taskId');
  if (!openTaskId) return;

  // Ensure DOM is ready, then open the task details panel
  const tryOpen = () => {
    try {
      displayTaskDetails(openTaskId);
      const panel = document.getElementById('task-details');
      if (panel) {
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (_) {
      // retry shortly if functions not ready yet
      return setTimeout(tryOpen, 150);
    }
  };
  setTimeout(tryOpen, 150);
});

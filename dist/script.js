    function showToast(message) {
      let toast = document.getElementById('toast');
      
      // If toast element doesn't exist, create it dynamically
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
          position: fixed;
          top: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(to right, #0ea5e9, #3b82f6);
          color: white;
          padding: 14px 24px;
          border-radius: 8px;
          display: none;
          z-index: 9999;
          font-weight: 500;
          font-size: 15px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: opacity 0.3s ease, transform 0.3s ease;
          pointer-events: none;
        `;
        document.body.appendChild(toast);
      }
      
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



document.addEventListener('DOMContentLoaded', () => {
    // ✅ Check if managerId is in localStorage, if not, redirect to login page
    const managerId = localStorage.getItem("managerId");
    if (!managerId) {
        console.warn("❌ No Manager ID found. Redirecting to login...");
        window.location.href = "/project-manager-auth.html"; // Redirect to login page
        return;
    }

    console.log(`✅ Manager ID Found: ${managerId}`); // Debugging
        
    setTimeout(() => {
        updateProjectCounts(); // Give time for API responses
    }, 500);
    
    // Tab Navigation
    const tabs = document.querySelectorAll('.tab');
    const columns = document.querySelectorAll('.column');

    if (tabs && columns) {
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => {
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) activeTab.classList.remove('active');

                tab.classList.add('active');

                columns.forEach((column, colIndex) => {
                    column.style.display = colIndex === index ? 'block' : 'none';
                });
            });
        });

        // ✅ Find the "Active Projects" tab (typically index 1)
        let activeProjectsIndex = 0; // Default to first tab
        
        // Look for tab with text containing "Active" or "In Progress"
        tabs.forEach((tab, index) => {
            if (tab.textContent.includes('Active') || 
                tab.textContent.includes('In Progress')) {
                activeProjectsIndex = index;
            }
        });

        // Initialize to show Active Projects tab
        tabs.forEach((tab, index) => {
            if (index === activeProjectsIndex) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        columns.forEach((column, index) => {
            column.style.display = index === activeProjectsIndex ? 'block' : 'none';
        });
        
        console.log(`✅ Initialized page to Active Projects tab (index: ${activeProjectsIndex})`);
    }

    // Drag and Drop for Columns
    let draggedCard = null;

    document.querySelectorAll('.card').forEach((card) => {
        card.addEventListener('dragstart', () => {
            draggedCard = card;
        });

        card.addEventListener('dragend', () => {
            draggedCard = null; // Clear after drag ends
        });
    });

    document.querySelectorAll('.column').forEach((column) => {
        column.addEventListener('dragover', (e) => e.preventDefault());

        column.addEventListener('drop', async () => {
            if (draggedCard) {
                const taskId = draggedCard.dataset.id;
                const newStatus = column.dataset.status;

                if (!taskId || !newStatus) {
                    console.error('Missing task ID or column status.');
                    return;
                }

                try {
                    const response = await fetch(`/api/update-task/${taskId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus }),
                    });

                    if (response.ok) {
                        column.appendChild(draggedCard);
                    } else {
                        const errorData = await response.json();
                        console.error('Error updating task:', errorData.error);
                        alert('Failed to update task status!');
                    }
                } catch (error) {
                    console.error('Error updating task status:', error);
                }
            }
        });
    });



    let map;
let markers = [];
let markerCluster;
const geocodeCache = new Map();
const projectFilters = {
  active: true,
  upcoming: true,
  completed: true,
  onMarket: true
};

    
    // Form Submissions
    const formConfigurations = [
        { formId: 'add-project-form', apiEndpoint: '/api/add-project' },
        { formId: 'add-client-form', apiEndpoint: '/api/add-client' },
        { formId: 'add-estimate-form', apiEndpoint: '/api/add-estimate' },
        { formId: 'add-task-form', apiEndpoint: '/api/add-task' },
        { formId: 'add-vendor-form', apiEndpoint: '/api/add-vendor' },
    ];

    formConfigurations.forEach(({ formId, apiEndpoint }) => {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();

                const formData = new FormData(form);
                const payload = Object.fromEntries(formData.entries());

                // Handle specific payload restructuring
                if (formId === 'add-project-form') {
                    payload.address = {
                        addressLine1: payload.addressLine1 || '',
                        addressLine2: payload.addressLine2 || '',
                        city: payload.city || '',
                        state: payload.state || '',
                        zip: payload.zip || '',
                    };
                    delete payload.addressLine1;
                    delete payload.addressLine2;
                    delete payload.city;
                    delete payload.state;
                    delete payload.zip;
                }

                // Validate form data before submission
                if (!validatePayload(payload, formId)) return;

                try {
                    const response = await fetch(`${apiEndpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (response.ok) {
                        showToast(`${formId.replace('-', ' ')} submitted successfully!`);
                        form.reset();
                    } else {
                        const error = await response.json();
                        showToast(`Error: ${error.error || 'An unexpected error occurred.'}`);
                    }
                } catch (error) {
                    console.error(`Error submitting form ${formId}:`, error);
                    showToast('An error occurred while submitting the form. Please try again.');
                }
            });
        }
    });

    /**
     * Validate the form payload before sending it to the server.
     * @param {Object} payload - The form data.
     * @param {string} formId - The ID of the form being validated.
     * @returns {boolean} - Returns true if valid, false otherwise.
     */
    function validatePayload(payload, formId) {
        const errors = [];

        if (formId === 'add-project-form') {
            if (!payload.name) errors.push('Project name is required.');
            if (!payload.type) errors.push('Project type is required.');
        
        }

        if (formId === 'add-client-form') {
          payload.address = payload.address || '';
      
          if (!payload.name) errors.push('Client name is required.');
          if (!payload.email) errors.push('Client email is required.');
          if (!payload.phone) errors.push('Client phone is required.');
          if (!payload.address) errors.push('Client address is required.');
      }

        if (formId === 'add-estimate-form') {
            if (!payload.name) errors.push('Estimate name is required.');
            if (!payload.amount || isNaN(payload.amount)) errors.push('A valid amount is required.');
        }

        if (formId === 'add-task-form') {
            if (!payload.title) errors.push('Task title is required.');
        }

        if (formId === 'add-vendor-form') {
            if (!payload.name) errors.push('Vendor name is required.');
            if (!payload.email) errors.push('Vendor email is required.');
        }

        if (errors.length > 0) {
            alert(`Please fix the following errors:\n- ${errors.join('\n- ')}`);
            return false;
        }

        return true;
    }

    


function renderUtilityIconsForProject(project) {
  // Example: expects project.utilityAccounts = { water: {status}, gas: {status}, electricity: {status} }
  if (!project.utilityAccounts) return '';
  const utilities = [
    { key: 'water', icon: 'fa-tint', label: 'Water' },
    { key: 'gas', icon: 'fa-fire', label: 'Gas' },
    { key: 'electricity', icon: 'fa-bolt', label: 'Electricity' }
  ];
  return `
    <span class="project-utilities-icons" style="display:inline-flex;gap:8px;vertical-align:middle;">
      ${utilities.map(util => {
        const acc = project.utilityAccounts[util.key] || {};
        let color = '#bdbdbd'; // default gray
        if (acc.status === 'active' || acc.status === 'on') color = '#27ae60'; // green
        else if (acc.status === 'disconnected' || acc.status === 'off') color = '#e74c3c'; // red
        return `<i class="fas ${util.icon}" title="${util.label}" style="color:${color};font-size:1.2em;"></i>`;
      }).join('')}
    </span>
  `;
}



// Function to navigate to the details page
function navigateToDetails(section, id) {
    const baseURL = window.location.origin; // Automatically detects the current base URL
    const fullURL = `${baseURL}/details/${section}/${id}`;
    console.log('Navigating to:', fullURL); // Log the full URL for debugging
    window.location.href = fullURL; // Navigate to the constructed URL
  }
  
  // Function to load projects dynamically
async function loadProjects() {
    const projectsList = document.getElementById('projects-list');
    projectsList.innerHTML = '<p>Loading...</p>';
  
    // 📅 Get today's date in YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];
    
    showLoader(); // 👈 START

    try {
      // Fetch both projects and today's updates
      const [projectsRes, updatesRes] = await Promise.all([
        fetch('/api/projects'),
        fetch(`/api/daily-updates?date=${today}`)
      ]);
  
      if (!projectsRes.ok || !updatesRes.ok) throw new Error('Failed to fetch data');
  
      const projectsData = await projectsRes.json();
      const updatesData = await updatesRes.json();
  
      // 🧮 Count updates by projectId
      const updateCounts = {};
      updatesData.updates.forEach(update => {
        const id = update.projectId;
        updateCounts[id] = (updateCounts[id] || 0) + 1;
      });
  
      projectsList.innerHTML = '';
  
      if (projectsData.projects.length === 0) {
        projectsList.innerHTML = '<p>No projects found.</p>';
      } else {
        projectsData.projects.forEach((project) => {
          const count = updateCounts[project._id] || 0;
  
          const itemDiv = document.createElement('div');
          itemDiv.className = 'item';
          itemDiv.addEventListener('click', () => navigateToDetails('projects', project._id));
  
          itemDiv.innerHTML = `
            <div class="project-item-header">
              <p>${project.name} ${renderUtilityIconsForProject(project)}</p>
    ${count > 0 ? `
      <span class="activity-badge" style="position:absolute;top:10px;right:55px;z-index:2;" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
        ${count}
      </span>` : ''
    }
            </div>
            <small>${project.address.addressLine1}, ${project.address.city}, ${project.address.state}, ${project.address.zip}</small>
            <small>Lockbox Code: ${project.code || 'N/A'}</small>
          `;

          addEditIconToProjectCard(itemDiv, project);
          projectsList.appendChild(itemDiv);
        });
  
        // ✅ Enable mobile tap support for tooltips
        document.addEventListener('click', (e) => {
          const allBadges = document.querySelectorAll('.activity-badge');
          allBadges.forEach(badge => badge.classList.remove('tooltip-visible'));
  
          const isBadge = e.target.classList.contains('activity-badge');
          if (isBadge) {
            e.stopPropagation(); // ✅ Prevent triggering project click
            e.target.classList.add('tooltip-visible');
            setTimeout(() => {
              e.target.classList.remove('tooltip-visible');
            }, 2000);
          }
        });
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      projectsList.innerHTML = '<p>Error loading projects. Please try again later.</p>';
    } finally {
      hideLoader(); // 👈 END
    }
  }
  
  
  



  
// ✅ Function to load upcoming and on-hold projects dynamically
async function loadUpcomingProjects() {
    const projectsList = document.getElementById("Upcoming-projects-list");
    projectsList.innerHTML = "<p>Loading...</p>";
  
    const today = new Date().toISOString().split("T")[0];
  
    showLoader(); // 👈 START

    try {
      // Fetch upcoming projects and today's updates
      const [projectsRes, updatesRes] = await Promise.all([
        fetch("/api/upcoming-projects"),
        fetch(`/api/daily-updates?date=${today}`)
      ]);
  
      if (!projectsRes.ok || !updatesRes.ok) throw new Error("Failed to fetch data");
  
      const { projects } = await projectsRes.json();
      const { updates } = await updatesRes.json();
  
      // Count updates by projectId
      const updateCounts = {};
      updates.forEach(update => {
        const id = update.projectId;
        updateCounts[id] = (updateCounts[id] || 0) + 1;
      });
  
      projectsList.innerHTML = "";
  
      if (!projects || projects.length === 0) {
        projectsList.innerHTML = "<p>No upcoming or on-hold projects found.</p>";
        return;
      }
  
      projects.forEach((project) => {
        const count = updateCounts[project._id] || 0;
  
        const itemDiv = document.createElement("div");
        itemDiv.className = "item";
        itemDiv.addEventListener("click", () => navigateToDetails("projects", project._id));
  
        const fullAddress = `${project.address.addressLine1 || ""} ${project.address.addressLine2 || ""}, ${project.address.city}, ${project.address.state} ${project.address.zip || ""}`;
  
        itemDiv.innerHTML = `
          <div class="project-item-header">
            <p>${project.name}</p>
    ${count > 0 ? `
      <span class="activity-badge" style="position:absolute;top:10px;right:55px;z-index:2;" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
        ${count}
      </span>` : ''
    }
          </div>
          <small>${fullAddress}</small>
          <small>Lockbox Code: ${project.code || 'N/A'}</small>
        `;
        
        addEditIconToProjectCard(itemDiv, project);
        projectsList.appendChild(itemDiv);
      });
  
      // Reuse tooltip tap support
      document.addEventListener("click", (e) => {
        const allBadges = document.querySelectorAll(".activity-badge");
        allBadges.forEach(badge => badge.classList.remove("tooltip-visible"));
  
        if (e.target.classList.contains("activity-badge")) {
          e.stopPropagation();
          e.target.classList.add("tooltip-visible");
          setTimeout(() => {
            e.target.classList.remove("tooltip-visible");
          }, 2000);
        }
      });
  
    } catch (error) {
      console.error("❌ Error loading upcoming projects:", error);
      projectsList.innerHTML = "<p>Error loading upcoming projects. Please try again later.</p>";
    } finally {
      hideLoader(); // 👈 END
    }
  }
  
  
  // ✅ Function to Load on market Projects Dynamically
  async function loadOnMarketProjects() {
    const projectsList = document.getElementById("on-market-projects-list");
    projectsList.innerHTML = "<p>Loading...</p>";
  
    const today = new Date().toISOString().split("T")[0];
  
    showLoader(); // 👈 START

    try {
      const [projectsRes, updatesRes] = await Promise.all([
        fetch("/api/on-market-projects"),
        fetch(`/api/daily-updates?date=${today}`)
      ]);
  
      if (!projectsRes.ok || !updatesRes.ok) throw new Error("Failed to fetch data");
  
      const { projects } = await projectsRes.json();
      const { updates } = await updatesRes.json();
  
      // Count updates by projectId
      const updateCounts = {};
      updates.forEach(update => {
        const id = update.projectId;
        updateCounts[id] = (updateCounts[id] || 0) + 1;
      });
  
      projectsList.innerHTML = "";
  
      if (!projects || projects.length === 0) {
        projectsList.innerHTML = "<p>No 'On Market' projects found.</p>";
        return;
      }
  
      projects.forEach((project) => {
        const count = updateCounts[project._id] || 0;
  
        const itemDiv = document.createElement("div");
        itemDiv.className = "item";
        itemDiv.addEventListener("click", () => navigateToDetails("projects", project._id));
  
        const fullAddress = `${project.address.addressLine1 || ""} ${project.address.addressLine2 || ""}, ${project.address.city}, ${project.address.state} ${project.address.zip || ""}`;
  
        itemDiv.innerHTML = `
          <div class="project-item-header">
            <p>${project.name} ${renderUtilityIconsForProject(project)}</p>
    ${count > 0 ? `
      <span class="activity-badge" style="position:absolute;top:10px;right:55px;z-index:2;" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
        ${count}
      </span>` : ''
    }
          </div>
          <small>${fullAddress}</small>
          <small>Lockbox Code: ${project.code || 'N/A'}</small>
        `;
        
        addEditIconToProjectCard(itemDiv, project);
        projectsList.appendChild(itemDiv);
      });
  
      // Tooltip tap support
      document.addEventListener("click", (e) => {
        const allBadges = document.querySelectorAll(".activity-badge");
        allBadges.forEach(badge => badge.classList.remove("tooltip-visible"));
  
        if (e.target.classList.contains("activity-badge")) {
          e.stopPropagation();
          e.target.classList.add("tooltip-visible");
          setTimeout(() => {
            e.target.classList.remove("tooltip-visible");
          }, 2000);
        }
      });
  
    } catch (error) {
      console.error("❌ Error loading 'On Market' projects:", error);
      projectsList.innerHTML = "<p>Error loading 'On Market' projects. Please try again later.</p>";
    } finally {
      hideLoader(); // 👈 END
    }
  }
  


  // ✅ Function to Load Completed Projects Dynamically
  async function loadCompletedProjects() {
    const projectsList = document.getElementById("completed-projects-list");
    projectsList.innerHTML = "<p>Loading...</p>"; // Show loading message
  
    const today = new Date().toISOString().split("T")[0];
  
    showLoader(); // 👈 START

    try {
      // Fetch completed projects and today's updates
      const [projectsRes, updatesRes] = await Promise.all([
        fetch("/api/completed-projects"),
        fetch(`/api/daily-updates?date=${today}`)
      ]);
  
      if (!projectsRes.ok || !updatesRes.ok) throw new Error("Failed to fetch data");
  
      const { projects } = await projectsRes.json();
      const { updates } = await updatesRes.json();
  
      // Count updates by projectId
      const updateCounts = {};
      updates.forEach(update => {
        const id = update.projectId;
        updateCounts[id] = (updateCounts[id] || 0) + 1;
      });
  
      projectsList.innerHTML = "";
  
      if (!projects || projects.length === 0) {
        projectsList.innerHTML = "<p>No completed projects found.</p>";
      } else {
        projects.forEach((project) => {
          const count = updateCounts[project._id] || 0;
  
          const itemDiv = document.createElement("div");
          itemDiv.className = "item";
          itemDiv.addEventListener("click", () => navigateToDetails("projects", project._id));
  
          itemDiv.innerHTML = `
            <div class="project-item-header">
              <p>${project.name} ${renderUtilityIconsForProject(project)}</p>
    ${count > 0 ? `
      <span class="activity-badge" style="position:absolute;top:10px;right:55px;z-index:2;" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
        ${count}
      </span>` : ''
    }
            </div>
            <small>${project.address.addressLine1}, ${project.address.city}, ${project.address.state}, ${project.address.zip}</small>
            <small>Lockbox Code: ${project.code || 'N/A'}</small>
            <span class="status">✔ Completed</span>
          `;

          addEditIconToProjectCard(itemDiv, project);
          projectsList.appendChild(itemDiv);
        });
  
        // Enable mobile tap support for tooltips
        document.addEventListener("click", (e) => {
          const allBadges = document.querySelectorAll(".activity-badge");
          allBadges.forEach(badge => badge.classList.remove("tooltip-visible"));
  
          if (e.target.classList.contains("activity-badge")) {
            e.stopPropagation();
            e.target.classList.add("tooltip-visible");
            setTimeout(() => {
              e.target.classList.remove("tooltip-visible");
            }, 2000);
          }
        });
      }
    } catch (error) {
      console.error("❌ Error loading completed projects:", error);
      projectsList.innerHTML = "<p>Error loading completed projects. Please try again later.</p>";
    } finally {
      hideLoader(); // 👈 END
    }
  }
  

// ✅ Call function on page load
document.addEventListener("DOMContentLoaded", () => {
    loadCompletedProjects();
});



// --- Add this function to open the edit modal ---
function openProjectEditModal(project) {
  // Use the same modal and form IDs as before
  let modal = document.getElementById('projectEditModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'projectEditModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:850px;">
        <span class="close" id="closeProjectEditModal" style="position:absolute;top:12px;right:18px;font-size:1.5rem;cursor:pointer;">&times;</span>
        <h3>Edit Project & Utilities</h3>
        <form id="projectEditForm">
          <label for="editProjectName">Name:</label>
          <input id="editProjectName" type="text" required />

          <label for="editProjectStatus">Status:</label>
          <select id="editProjectStatus" required>
            <option value="Upcoming">Upcoming</option>
            <option value="In Progress">In Progress</option>
            <option value="On Market">On Market</option>
            <option value="completed">Completed</option>
          </select>

          <label for="editProjectColor">Color:</label>
          <input id="editProjectColor" type="color" />

          <div class="form-group">
            <label for="editProjectType"><strong>Project Type</strong></label>
            <select id="editProjectType" class="form-control" required>
              <option value="Residential">Residential</option>
              <option value="Multifamily">Multifamily</option>
            </select>
          </div>

          <label for="editProjectCode">Lockbox Code:</label>
          <input id="editProjectCode" type="text" required />

          <label for="editProjectAddressLine1">Address Line 1:</label>
          <input id="editProjectAddressLine1" type="text" />

          <label for="editProjectAddressLine2">Address Line 2:</label>
          <input id="editProjectAddressLine2" type="text" />

          <label for="editProjectCity">City:</label>
          <input id="editProjectCity" type="text" required />

          <label for="editProjectState">State:</label>
          <input id="editProjectState" type="text" required />

          <label for="editProjectZip">Zip Code:</label>
          <input id="editProjectZip" type="text" />

          <label for="editProjectDescription">Description:</label>
          <textarea id="editProjectDescription"></textarea>

          <hr>
          <label>Water Status:
            <select id="editWaterStatus">
              <option value="unknown">Unknown</option>
              <option value="active">Active</option>

              <option value="disconnected">Disconnected</option>
            </select>
          </label>
          <label>Gas Status:
            <select id="editGasStatus">
              <option value="unknown">Unknown</option>
              <option value="active">Active</option>

              <option value="disconnected">Disconnected</option>
            </select>
          </label>
          <label>Electricity Status:
            <select id="editElectricityStatus">
              <option value="unknown">Unknown</option>
              <option value="active">Active</option>

              <option value="disconnected">Disconnected</option>
            </select>
          </label>
          <br><br>
          <button type="submit" class="btn-primary">Save</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    // Close logic
    document.getElementById('closeProjectEditModal').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  }

  // Populate form with project data
  document.getElementById('editProjectName').value = project.name || '';
  document.getElementById('editProjectStatus').value = project.status || 'Upcoming';
  document.getElementById('editProjectColor').value = project.color || '#2563eb';
  document.getElementById('editProjectType').value = project.type || 'Residential';
  document.getElementById('editProjectCode').value = project.code || '';
  document.getElementById('editProjectAddressLine1').value = project.address?.addressLine1 || '';
  document.getElementById('editProjectAddressLine2').value = project.address?.addressLine2 || '';
  document.getElementById('editProjectCity').value = project.address?.city || '';
  document.getElementById('editProjectState').value = project.address?.state || '';
  document.getElementById('editProjectZip').value = project.address?.zip || '';
  document.getElementById('editProjectDescription').value = project.description || '';
  document.getElementById('editWaterStatus').value = project.utilityAccounts?.water?.status || 'unknown';
  document.getElementById('editGasStatus').value = project.utilityAccounts?.gas?.status || 'unknown';
  document.getElementById('editElectricityStatus').value = project.utilityAccounts?.electricity?.status || 'unknown';

  // Submit handler
  document.getElementById('projectEditForm').onsubmit = async function(e) {
    e.preventDefault();
    const updatedProject = {
      name: document.getElementById('editProjectName').value,
      status: document.getElementById('editProjectStatus').value,
      color: document.getElementById('editProjectColor').value,
      type: document.getElementById('editProjectType').value,
      code: document.getElementById('editProjectCode').value,
      address: {
        addressLine1: document.getElementById('editProjectAddressLine1').value,
        addressLine2: document.getElementById('editProjectAddressLine2').value,
        city: document.getElementById('editProjectCity').value,
        state: document.getElementById('editProjectState').value,
        zip: document.getElementById('editProjectZip').value
      },
      description: document.getElementById('editProjectDescription').value,
      utilityAccounts: {
        water: { ...project.utilityAccounts?.water, status: document.getElementById('editWaterStatus').value },
        gas: { ...project.utilityAccounts?.gas, status: document.getElementById('editGasStatus').value },
        electricity: { ...project.utilityAccounts?.electricity, status: document.getElementById('editElectricityStatus').value }
      }
    };
    try {
      await fetch(`/api/projects/${project._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProject)
      });
      // Optionally update only utilityAccounts (if you have a dedicated endpoint)
      await fetch(`/api/projects/${project._id}/utilities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utilityAccounts: updatedProject.utilityAccounts })
      });
      modal.style.display = 'none';
      showToast('Project updated!');
      loadProjects();
      loadUpcomingProjects();
      loadOnMarketProjects();
      loadCompletedProjects();
    } catch (err) {
      showToast('Failed to update project.');
    }
  };

  modal.style.display = 'block';
}

// --- Add the edit icon to each project card (upper right corner) ---
// Example for main projects list (repeat for other lists as needed)
function addEditIconToProjectCard(itemDiv, project) {
  const editIcon = document.createElement('span');
  editIcon.innerHTML = '<i class="fas fa-edit"></i>';
  editIcon.title = 'Edit Project & Utilities';
  editIcon.style.cssText = `
    position: absolute; top: 10px; right: 14px; color: #2563eb; font-size: 1.3em; cursor: pointer; z-index: 2;
    background: #fff; border-radius: 50%; padding: 4px 7px; box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  `;
  editIcon.onclick = (e) => {
    e.stopPropagation();
    openProjectEditModal(project);
  };
  itemDiv.style.position = 'relative';
  itemDiv.appendChild(editIcon);
}



// 📍 Marker Icon Based on Type
function getMarkerIcon(type) {
  const colors = {
    active: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
    upcoming: "http://maps.google.com/mapfiles/ms/icons/orange-dot.png",
    completed: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    onMarket: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
  };
  return colors[type] || null;
}

// 🧽 Clear Existing Markers
function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
  if (markerCluster) markerCluster.clearMarkers();
}

// 📍 Create Marker + InfoWindow
function createMarker(lat, lng, title, markerType) {
  const marker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title,
    icon: getMarkerIcon(markerType)
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `
      <div style="
        font-size: 10px;
        font-weight: bold;
        color: #ffffff;
        background: #0f4c75;
        padding: 6px 16px;
        border-radius: 6px;
        text-align: center;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        backdrop-filter: blur(2px);
      ">
        📍 ${title}
      </div>`,
    maxWidth: 140
  });

  marker.addListener("click", () => {
    infoWindow.open(map, marker);
    const destination = `${lat},${lng}`;
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
    setTimeout(() => {
      if (confirm("🧭 Open directions?")) {
        const url = isAppleDevice
          ? `https://maps.apple.com/?daddr=${destination}`
          : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
        window.open(url, "_blank");
      }
    }, 500);
  });

  return marker;
}

// 🗺️ Convert Address → Lat/Lng (with cache)
async function getLatLngFromAddress(address) {
  if (geocodeCache.has(address)) return geocodeCache.get(address);

  const apiKey = "AIzaSyCvzkKpCkAY2PHwU8I8zZiM_FLMzMj1bbg";
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "OK") {
    const location = data.results[0].geometry.location;
    geocodeCache.set(address, location);
    return location;
  } else {
    console.warn(`Geocode failed: ${data.status} for ${address}`);
    return null;
  }
}

// ✅ Load All Project Locations
async function loadProjectLocations() {
  showLoader();
  

  try {
    const [activeRes, upcomingRes, completedRes, onMarketRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/upcoming-projects"),
      fetch("/api/completed-projects"),
      fetch("/api/on-market-projects")
    ]);

    if (![activeRes, upcomingRes, completedRes, onMarketRes].every(r => r.ok)) {
      throw new Error("Failed to fetch one or more project groups.");
    }

    const [active, upcoming, completed, onMarket] = await Promise.all([
      activeRes.json(),
      upcomingRes.json(),
      completedRes.json(),
      onMarketRes.json()
    ]);

    const allProjects = [
      ...active.projects.map(p => ({ ...p, markerType: "active" })),
      ...upcoming.projects.map(p => ({ ...p, markerType: "upcoming" })),
      ...completed.projects.map(p => ({ ...p, markerType: "completed" })),
      ...onMarket.projects.map(p => ({ ...p, markerType: "onMarket" }))
    ].filter(p => projectFilters[p.markerType]);

    if (allProjects.length === 0) {
      showToast("⚠️ No project locations available.");
      clearMarkers();
      return;
    }

    clearMarkers();

    for (const project of allProjects) {
      if (!project.address?.addressLine1) continue;

      const fullAddress = `${project.address.addressLine1}, ${project.address.city}, ${project.address.state} ${project.address.zip}`;

      try {
        const coords = await getLatLngFromAddress(fullAddress);
        if (coords) {
          const marker = createMarker(coords.lat, coords.lng, project.name, project.markerType);
          markers.push(marker);
        } else {
          console.warn(`No geocode result for: ${fullAddress}`);
        }
      } catch (err) {
        console.error(`Geocoding failed for: ${fullAddress}`, err);
      }
    }

    // ✅ Modern MarkerClusterer instantiation
    if (markerCluster) markerCluster.clearMarkers();
    markerCluster = new markerClusterer.MarkerClusterer({ map, markers });

    
  } catch (err) {
    console.error("Error loading project locations:", err);
    showToast("❌ Error loading locations.");
  } finally {
    hideLoader();
  }
}


// ✅ Init Map
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 29.4241, lng: -98.4936 },
    zoom: 10,
    gestureHandling: "greedy",
    zoomControl: true,
    streetViewControl: false,
    fullscreenControl: false
  });

  loadProjectLocations();
  setupFilterCheckboxes();
}

// ✅ Setup Filter Checkboxes
function setupFilterCheckboxes() {
  document.querySelectorAll("#projectFilters input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      projectFilters[cb.value] = cb.checked;
      loadProjectLocations();
    });
  });
}

// ✅ Expose to Google Maps loader
window.initMap = initMap;

// ✅ Load once DOM is ready
document.addEventListener("DOMContentLoaded", initMap);


    

    
  
  // Sidebar Toggle with Hamburger
  const hamburger = document.querySelector('.hamburger');
  const sidebar = document.querySelector('.sidebar');
  const dropdownButton = document.querySelector('.dropdown-button');
  const dropdownContent = document.querySelector('.dropdown-content');

  // Hamburger button functionality
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Dropdown functionality
  dropdownButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing dropdown when clicking inside it
    dropdownContent.classList.toggle('show');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdownContent.classList.remove('show');
  });

  // Prevent sidebar collapse when clicking inside the dropdown
  dropdownContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  
  async function updateProjectCounts() {
    try {
      console.log("Fetching project counts...");
  
      const timestamp = new Date().getTime(); // Prevent caching
  
      // ✅ Fetch Upcoming and On-Hold Projects
      const upcomingResponse = await fetch(`/api/upcoming-projects?t=${timestamp}`);
      if (!upcomingResponse.ok) throw new Error("Failed to fetch upcoming projects");
      const upcomingData = await upcomingResponse.json();
      const upcomingCount = upcomingData.projects.length || 0;
  
      // ✅ Fetch In-Progress Projects
      const inProgressResponse = await fetch(`/api/projects?t=${timestamp}`);
      if (!inProgressResponse.ok) throw new Error("Failed to fetch in-progress projects");
      const inProgressData = await inProgressResponse.json();
      const inProgressCount = inProgressData.projects.length || 0;
  
      // ✅ Fetch Completed Projects
      const completedResponse = await fetch(`/api/completed-projects?t=${timestamp}`);
      if (!completedResponse.ok) throw new Error("Failed to fetch completed projects");
      const completedData = await completedResponse.json();
      const completedCount = completedData.projects.length || 0;
  
      // ✅ Fetch On Market Projects
      const onMarketResponse = await fetch(`/api/on-market-projects?t=${timestamp}`);
      if (!onMarketResponse.ok) throw new Error("Failed to fetch on-market projects");
      const onMarketData = await onMarketResponse.json();
      const onMarketCount = onMarketData.projects.length || 0;
  
      console.log("✅ Counts:", { 
        upcomingCount, 
        inProgressCount, 
        completedCount, 
        onMarketCount 
      });
  
      // ✅ Update DOM Elements
      const upcomingElement = document.getElementById("upcoming-count");
      const inProgressElement = document.getElementById("in-progress-count");
      const completedElement = document.getElementById("completed-count");
      const onMarketElement = document.getElementById("on-market-count");
  
      if (upcomingElement) upcomingElement.textContent = upcomingCount;
      if (inProgressElement) inProgressElement.textContent = inProgressCount;
      if (completedElement) completedElement.textContent = completedCount;
      if (onMarketElement) onMarketElement.textContent = onMarketCount;
  
    } catch (error) {
      console.error("❌ Error updating project counts:", error);
    }
  }


        
// ✅ Function to Load Daily Updates from Multiple Projects (with Manager ID)
async function loadTeamDailyUpdates(selectedDate = null) {
    const updatesFeed = document.getElementById("daily-updates-feed");
    updatesFeed.innerHTML = "<p>Loading updates...</p>";

    try {
        const managerId = localStorage.getItem("managerId"); // ✅ Retrieve Manager ID
        if (!managerId) {
            console.error("❌ No Manager ID found in localStorage.");
            updatesFeed.innerHTML = "<p>Error: Manager ID is required to fetch updates.</p>";
            return;
        }

        let formattedDate = selectedDate || new Date().toISOString().split("T")[0]; // Default to today

        // ✅ Fetch updates with managerId included
        let response = await fetch(`/api/daily-updates?date=${formattedDate}&managerId=${managerId}`);
        if (!response.ok) throw new Error("Failed to fetch daily updates");

        const { updates } = await response.json();
        updatesFeed.innerHTML = "";

        if (!updates || updates.length === 0) {
            updatesFeed.innerHTML = `<p>No updates for ${formattedDate}.</p>`;
            return;
        }

        // ✅ Sort updates by latest timestamp
        updates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // ✅ Display updates with corrected local time
        updates.forEach((update) => {
            const updateItem = document.createElement("div");
            updateItem.classList.add("daily-update-item");

            // ✅ Convert UTC timestamp to Local Time
            let localTime = new Date(update.timestamp).toLocaleString();

            // ✅ Ensure 'update.timestamp' is properly defined
            const formattedDate = update.timestamp ? new Date(update.timestamp).toLocaleString() : "Unknown Date";

            // ✅ Ensure project name is properly formatted
            const projectName = update.projectName ? update.projectName : "Unknown Project";
            
            // ✅ Fix the author display issue
            const authorName = update.author && update.author.trim() !== "" ? update.author : "System Update"; 

            updateItem.innerHTML = `
            <div class="update-card">

                <p class="update-text">📌 ${update.text}</p>
                <p class="update-project">
                    🔗 <strong>Project:</strong> 
                    <a href="/details/projects/${update.projectId}" class="project-link">${projectName}</a>
                </p>
                <p class="update-timestamp">🕒 ${formattedDate}</p>
            </div>
        `;
        

            updatesFeed.appendChild(updateItem);
        });

    } catch (error) {
        console.error("❌ Error loading team updates:", error);
        updatesFeed.innerHTML = "<p>Error loading updates.</p>";
    }
}



// ✅ Event Listener for Date Picker
document.getElementById("date-picker").addEventListener("change", function() {
    const selectedDate = this.value; // Get selected date from input (YYYY-MM-DD)
    console.log(`📅 Fetching updates for date: ${selectedDate}`);
    loadTeamDailyUpdates(selectedDate); // Fetch updates for selected date
});

// ✅ Load Updates on Page Load (Default: Today)
document.addEventListener("DOMContentLoaded", () => {
    const today = new Date().toISOString().split("T")[0]; // Get YYYY-MM-DD
    loadTeamDailyUpdates(today);
});


// ✅ Refresh Updates Periodically Every 90 Seconds (Only for Today's Date)
setInterval(() => {
    const today = new Date().toISOString().split("T")[0];
    loadTeamDailyUpdates(today);
}, 300000);


  // Expose the function globally
  window.navigateToDetails = navigateToDetails;
      // Call loadProjects to populate the Projects column on page load
      loadProjects();
      loadUpcomingProjects();
      loadOnMarketProjects();
      loadCompletedProjects();
      initMap();
      updateProjectCounts();
});


function signInAsVendor(vendorId) {
  if (!vendorId) {
    alert("Vendor ID missing.");
    return;
  }

  fetch(`/api/vendors/login-direct/${vendorId}`)
    .then(res => res.json())
    .then(data => {
      if (!data.vendorId) throw new Error("Invalid response from server.");
      localStorage.setItem("vendorId", data.vendorId);
      window.location.href = "/Subcontractor%20Page.html";
    })
    .catch(err => {
      console.error("Sign-in error:", err);
      alert("Unable to sign in as this vendor.");
    });
}

// Subcontractor modal elements
const subModal = document.getElementById("subcontractorsModal");
const closeSubModal = document.getElementById("closeSubModal");
const addVendorForm = document.getElementById("addVendorForm");
const vendorList = document.getElementById("vendorList");

// ✅ NEW: Detail display section
const vendorDetails = document.getElementById("vendorDetails");

// Open modal and load vendors
function openSubcontractorsModal() {
  subModal.style.display = "block";
  fetchVendors();
}

// Close modal logic
closeSubModal.onclick = () => subModal.style.display = "none";
window.onclick = (e) => { if (e.target === subModal) subModal.style.display = "none"; };

// Fetch vendors and render the list
async function fetchVendors() {
  try {
    const res = await fetch('/api/vendors');
    const vendors = await res.json();
    vendorList.innerHTML = '';
    if (vendorDetails) vendorDetails.style.display = 'none';

    vendors.forEach(vendor => {
      const li = document.createElement('li');
      li.style.position = 'relative'; // to position dropdown
    
      li.innerHTML = `
        <span style="cursor: pointer;" onclick="showVendorDetails(${JSON.stringify(vendor).replace(/"/g, '&quot;')})">
          ${vendor.name}
        </span>
        <span class="vendor-menu-toggle" onclick="toggleVendorMenu(event, '${vendor._id}')">⋮</span>
        <div class="vendor-dropdown-menu" id="vendor-menu-${vendor._id}">
          <button onclick="event.stopPropagation(); editVendor('${vendor._id}', '${vendor.name}', '${vendor.email}', '${vendor.phone}')">✏️ Edit</button>
          <button onclick="event.stopPropagation(); deleteVendor('${vendor._id}')">🗑️ Delete</button>
          <button onclick="event.stopPropagation(); signInAsVendor('${vendor._id}')">🔐 Sign In</button>

        </div>
      `;
    
      vendorList.appendChild(li);
    });
  } catch (err) {
    console.error("Error fetching vendors:", err);
  }
}

// Handle form submission to add vendor
addVendorForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const vendor = {
    name: document.getElementById("vendorName").value,
    email: document.getElementById("vendorEmail").value,
    phone: document.getElementById("vendorPhone").value
  };
showLoader(); // 👈 START
  try {
    // Step 1: Add the vendor
    const addRes = await fetch('/api/add-vendor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendor)
    });

    const addedVendor = await addRes.json();

    // Step 2: Send invite (without projectId)
    if (addedVendor.vendor && addedVendor.vendor.email) {
      await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: [addedVendor.vendor.email],
          role: "vendor",         // 👈 Make sure your backend handles "vendor" role
          projectId: null         // No project attached to this invite
        })
      });

      showToast("✅ Invite sent to new vendor");
    }

    addVendorForm.reset();
    fetchVendors();
  } catch (error) {
    console.error("❌ Error adding vendor or sending invite:", error);
    showToast("Failed to add vendor or send invite.");
              } finally {
      hideLoader(); // 👈 END
  }
});


function toggleVendorMenu(event, id) {
  event.stopPropagation();
  document.querySelectorAll('.vendor-dropdown-menu').forEach(menu => {
    if (menu.id !== `vendor-menu-${id}`) menu.style.display = 'none';
  });

  const menu = document.getElementById(`vendor-menu-${id}`);
  menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
}

document.addEventListener('click', () => {
  document.querySelectorAll('.vendor-dropdown-menu').forEach(menu => {
    menu.style.display = 'none';
  });
});



// Delete vendor by ID with confirmation
async function deleteVendor(id) {
  const confirmDelete = confirm("Are you sure you want to delete this vendor? This action cannot be undone.");
  
  if (confirmDelete) {
    try {
      const response = await fetch(`/api/vendors/${id}`, { method: 'DELETE' });
      
      if (response.ok) {
       showToast("Vendor deleted successfully.");
        fetchVendors();
      } else {
        const errorData = await response.json();
        console.error("Error deleting vendor:", errorData.message);
        alert(`Error: ${errorData.message}`);
      }

    } catch (error) {
      console.error("Error:", error);
      showToast("An error occurred while deleting the vendor.");
    }
  }
}


// Edit vendor info
async function editVendor(id, name, email, phone) {
  const newName = prompt("Update name:", name);
  const newEmail = prompt("Update email:", email);
  const newPhone = prompt("Update phone:", phone);
  if (newName) {
    await fetch(`/api/vendors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, phone: newPhone })
    });
    fetchVendors();
  }
}

// ✅ NEW: Show vendor details in the modal
function showVendorDetails(vendor) {
  if (!vendorDetails) return;
  vendorDetails.style.display = "block";
  vendorDetails.innerHTML = `
    <h3>${vendor.name}</h3>
    <p><strong>Email:</strong> ${vendor.email || "N/A"}</p>
    <p><strong>Phone:</strong> ${vendor.phone || "N/A"}</p>

  `;
}


// --- Assignments Section Logic ---

const sidebarNav = document.querySelector('.sidebar nav ul');
if (sidebarNav && !document.getElementById('assignment-nav-item')) {
  const assignmentLi = document.createElement('li');
  assignmentLi.id = 'assignment-nav-item';
  assignmentLi.innerHTML = `<a href="#" id="open-assignment-section"><i class="fas fa-tasks"></i> Assignments</a>`;
  sidebarNav.insertBefore(assignmentLi, sidebarNav.lastElementChild);
}

  // --- Assignment Section Show/Hide Logic ---
  const mainContent = document.querySelector('.main-content');
  const assignmentSection = document.getElementById('assignments-section');
  const columnsContainer = document.querySelector('.columns-container');
  const mapSection = document.getElementById('map-section');
  const dailyUpdatesPanel = document.getElementById('daily-updates-panel');

  // Hide assignment section by default
  if (assignmentSection) assignmentSection.style.display = 'none';

  // Show assignments and hide main dashboard when clicked
document.getElementById('open-assignment-section').addEventListener('click', (e) => {
    e.preventDefault();
    // Hide dashboard columns and other main sections
    if (columnsContainer) columnsContainer.style.display = 'none';
    if (mapSection) mapSection.style.display = 'none';
    if (dailyUpdatesPanel) dailyUpdatesPanel.style.display = 'none';
    // Hide project tabs and map filter tab
    const tabContainer = document.querySelector('.tab-container');
    if (tabContainer) tabContainer.style.display = 'none';
    const mapFilter = document.getElementById('projectFilters');
    if (mapFilter) mapFilter.style.display = 'none';
    // Show assignments
    if (assignmentSection) assignmentSection.style.display = 'block';
    // Optionally reload assignments
    loadAssignments();
});

// Optionally, add a way to go back to dashboard (e.g., clicking "Home" or another tab)
document.querySelectorAll('.sidebar nav ul li a').forEach(link => {
    if (link.id !== 'open-assignment-section') {
      link.addEventListener('click', () => {
        // Show dashboard columns and other main sections
        if (columnsContainer) columnsContainer.style.display = '';
        if (mapSection) mapSection.style.display = '';
        if (dailyUpdatesPanel) dailyUpdatesPanel.style.display = '';
        // Show project tabs and map filter tab
        const tabContainer = document.querySelector('.tab-container');
        if (tabContainer) tabContainer.style.display = '';
        const mapFilter = document.getElementById('projectFilters');
        if (mapFilter) mapFilter.style.display = '';
        // Hide assignments
        if (assignmentSection) assignmentSection.style.display = 'none';
      });
    }
});


document.getElementById('filter-assignment-name').addEventListener('input', filterAssignmentsTable);
document.getElementById('filter-assignment-address').addEventListener('input', filterAssignmentsTable);
document.getElementById('filter-assignment-estimate').addEventListener('input', filterAssignmentsTable);

function filterAssignmentsTable() {
  const nameVal = document.getElementById('filter-assignment-name').value.toLowerCase();
  const addressVal = document.getElementById('filter-assignment-address').value.toLowerCase();
  const estimateVal = document.getElementById('filter-assignment-estimate').value.toLowerCase();
  const rows = document.querySelectorAll('#assignments-table tbody tr');
  rows.forEach(row => {
    const name = row.children[0]?.textContent.toLowerCase() || '';
    const address = row.children[1]?.textContent.toLowerCase() || '';
    const estimate = row.children[2]?.textContent.toLowerCase() || '';
    if (
      name.includes(nameVal) &&
      address.includes(addressVal) &&
      estimate.includes(estimateVal)
    ) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

async function loadAssignments() {
  const tableBody = document.querySelector("#assignments-table tbody");
  tableBody.innerHTML = `<tr><td colspan="8">Loading...</td></tr>`;
  showLoader();

  try {
    // Fetch all vendors with their assigned projects/items
    const res = await fetch('/api/vendors');
    const vendors = await res.json();

    // Fetch all projects for address lookup
    const projectsRes = await fetch('/api/projects');
    const projectsData = await projectsRes.json();
    const projects = projectsData.projects || [];

    // Fetch all estimates for lookup
    const estimatesRes = await fetch('/api/estimates');
    const estimatesData = await estimatesRes.json();
    const estimates = estimatesData.estimates || [];

    // Build lookup maps
const projectMap = {};
projects.forEach(p => projectMap[p._id.toString()] = p);

const estimateMap = {};
estimates.forEach(e => estimateMap[e._id.toString()] = e);

    let rows = [];

    vendors.forEach(vendor => {
      if (!vendor.assignedItems || vendor.assignedItems.length === 0) return;

      // Group assigned items by estimateId
      const itemsByEstimate = {};
      vendor.assignedItems.forEach(item => {
        if (!item.estimateId) return;
        const key = item.estimateId.toString();
        if (!itemsByEstimate[key]) itemsByEstimate[key] = [];
        itemsByEstimate[key].push(item);
      });

        // Debug: log what is found
  console.log('Vendor:', vendor.name, 'Items by Estimate:', itemsByEstimate);

Object.entries(itemsByEstimate).forEach(([estimateId, items]) => {
  const estimate = estimateMap[estimateId.toString()];
  if (!estimate) return;

  // Handle populated projectId or plain ObjectId
  let projectId = '';
  if (estimate.projectId && typeof estimate.projectId === 'object' && estimate.projectId._id) {
    projectId = estimate.projectId._id.toString();
  } else if (estimate.projectId) {
    projectId = estimate.projectId.toString();
  }
  const project = projectMap[projectId];
  if (!project) return;

        const totalAssignment = items.reduce((sum, i) => sum + (i.total || 0), 0);

        // Assignment-level dates (across all items in this estimate)
        const requestedDates = items.map(i => i.createdAt).filter(Boolean).map(d => new Date(d));
        const startDates = items.map(i => i.startDate).filter(Boolean).map(d => new Date(d));
        const endDates = items.map(i => i.endDate).filter(Boolean).map(d => new Date(d));

        const assignmentRequestedDate = requestedDates.length
          ? new Date(Math.min(...requestedDates)).toLocaleDateString()
          : '';
        const assignmentStartDate = startDates.length
          ? new Date(Math.min(...startDates)).toLocaleDateString()
          : '';
        const assignmentEndDate = endDates.length
          ? new Date(Math.max(...endDates)).toLocaleDateString()
          : '';

        // Assignment duration in days (if both start and end exist)
        let duration = '';
        if (startDates.length && endDates.length) {
          const minStart = Math.min(...startDates);
          const maxEnd = Math.max(...endDates);
          duration = Math.max(1, Math.ceil((maxEnd - minStart) / (1000 * 60 * 60 * 24)));
        }

        rows.push(`
          <tr>
            <td>${vendor.name}</td>
            <td>${project.address?.addressLine1 || ''}, ${project.address?.city || ''}, ${project.address?.state || ''}</td>
            <td>${estimate.title || estimate.invoiceNumber || 'Untitled Estimate'}</td>
            <td>
              <a href="#" class="line-items-link" data-vendor="${vendor._id}" data-project="${project._id}" data-estimate="${estimate._id}">
                ${items.length}
              </a>
            </td>
            <td>${assignmentRequestedDate}</td>
            <td>${assignmentStartDate}</td>
            <td>${assignmentEndDate}</td>
            <td>${duration}</td>
            <td>$${totalAssignment.toFixed(2)}</td>
          </tr>
        `);
      });
    });

    tableBody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="9">No assignments found.</td></tr>`;

    // Add click listeners for line items
    document.querySelectorAll('.line-items-link').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        showLineItemsModal(this.dataset.vendor, this.dataset.project, this.dataset.estimate);
      });
    });

  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="9">Error loading assignments.</td></tr>`;
    console.error(err);
  } finally {
    hideLoader();
  }
}

// Modal logic for line item details
function showLineItemsModal(vendorId, projectId, estimateId) {
  const modal = document.getElementById('lineItemsModal');
  const table = document.getElementById('lineItemsDetailsTable').querySelector('tbody');
  table.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  modal.style.display = 'block';

  fetch(`/api/vendors/${vendorId}`)
    .then(res => res.json())
    .then(vendor => {
      // Filter items by both projectId and estimateId
      const items = (vendor.assignedItems || []).filter(i =>
        i.projectId?.toString() === projectId?.toString() &&
        i.estimateId?.toString() === estimateId?.toString()
      );
      if (!items.length) {
        table.innerHTML = `<tr><td colspan="7">No line items found.</td></tr>`;
        return;
      }
      table.innerHTML = items.map((item, idx) => {
        // Calculate duration in days if both dates exist
        let duration = '';
        if (item.startDate && item.endDate) {
          const start = new Date(item.startDate);
          const end = new Date(item.endDate);
          duration = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        }
        // Prepare photos HTML
        let photosHtml = '';
        if (item.photos && (item.photos.before?.length || item.photos.after?.length)) {
          photosHtml += '<div class="lineitem-photos">';
          if (item.photos.before?.length) {
            photosHtml += `<div><strong>Before:</strong> ${item.photos.before.map(url => `<img src="${url}" class="lineitem-photo-thumb" />`).join(' ')}</div>`;
          }
          if (item.photos.after?.length) {
            photosHtml += `<div><strong>After:</strong> ${item.photos.after.map(url => `<img src="${url}" class="lineitem-photo-thumb" />`).join(' ')}</div>`;
          }
          photosHtml += '</div>';
        }
        // Details row (hidden by default)
        const detailsRow = `
          <tr class="lineitem-details-row" id="details-row-${idx}" style="display:none;">
            <td colspan="7" style="background:#f8fafc;">
              <div style="padding:10px 8px;">
                <strong>Description:</strong> ${item.description || 'No description.'}<br>
                ${photosHtml}
              </div>
            </td>
          </tr>
        `;
        // Main row with hover/click
        return `
          <tr class="lineitem-main-row" data-details-row="details-row-${idx}" style="cursor:pointer;">
            <td>${item.name || ''}</td>
            <td>${item.status || ''}</td>
            <td>${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</td>
            <td>${item.startDate ? new Date(item.startDate).toLocaleDateString() : ''}</td>
            <td>${item.endDate ? new Date(item.endDate).toLocaleDateString() : ''}</td>
            <td>${duration}</td>
            <td>$${item.total?.toFixed(2) || '0.00'}</td>
          </tr>
          ${detailsRow}
        `;
      }).join('');

      // Add hover and click events for slide down details
      document.querySelectorAll('.lineitem-main-row').forEach(row => {
        row.addEventListener('mouseenter', function() {
          this.style.background = '#e0e7ef';
        });
        row.addEventListener('mouseleave', function() {
          this.style.background = '';
        });
        row.addEventListener('click', function() {
          const detailsId = this.getAttribute('data-details-row');
          const detailsRow = document.getElementById(detailsId);
          if (detailsRow) {
            if (detailsRow.style.display === 'none') {
              detailsRow.style.display = '';
              detailsRow.style.animation = 'slideDown 0.2s';
            } else {
              detailsRow.style.display = 'none';
            }
          }
        });
      });

      // Add click event for photo thumbs to open full view modal
      document.querySelectorAll('.lineitem-photo-thumb').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', function(e) {
          e.stopPropagation();
          openPhotoFullView(this.src);
        });
      });

    })
    .catch(() => {
      table.innerHTML = `<tr><td colspan="7">Error loading line items.</td></tr>`;
    });
}

// --- Add this function at the end of your script.js ---
function openPhotoFullView(src) {
  // Create modal if not exists
  let photoModal = document.getElementById('photoFullViewModal');
  if (!photoModal) {
    photoModal = document.createElement('div');
    photoModal.id = 'photoFullViewModal';
    photoModal.style.cssText = `
      position: fixed; z-index: 99999; left: 0; top: 0; width: 100vw; height: 100vh;
      background: rgba(30,41,59,0.85); display: flex; align-items: center; justify-content: center;
    `;
    photoModal.innerHTML = `
      <img id="photoFullViewImg" src="" style="max-width:90vw; max-height:90vh; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.25);" />
      <span id="photoFullViewClose" style="position:absolute;top:24px;right:40px;font-size:2.5rem;color:#fff;cursor:pointer;font-weight:bold;z-index:2;">&times;</span>
    `;
    document.body.appendChild(photoModal);
    // Close logic
    document.getElementById('photoFullViewClose').onclick = () => photoModal.style.display = 'none';
    photoModal.onclick = (e) => {
      if (e.target === photoModal) photoModal.style.display = 'none';
    };
  }
  document.getElementById('photoFullViewImg').src = src;
  photoModal.style.display = 'flex';
}


// Modal close logic
document.getElementById('closeLineItemsModal').onclick = function() {
  document.getElementById('lineItemsModal').style.display = 'none';
};
window.onclick = function(event) {
  if (event.target == document.getElementById('lineItemsModal')) {
    document.getElementById('lineItemsModal').style.display = 'none';
  }
};

// Load assignments on page load
document.addEventListener('DOMContentLoaded', loadAssignments);



// --- Custom Report Modal Logic ---
const customReportModal = document.getElementById('customReportModal');
const closeCustomReportModal = document.getElementById('closeCustomReportModal');
const openCustomReportBtn = document.getElementById('openCustomReport');
const reportProjectSelect = document.getElementById('reportProjectSelect');
const customReportForm = document.getElementById('customReportForm');
const customReportResult = document.getElementById('customReportResult');

// Open modal
openCustomReportBtn.onclick = async function() {
  customReportModal.style.display = 'block';
  customReportResult.innerHTML = '';
  // Load projects
  reportProjectSelect.innerHTML = `<option value="">-- Select Project --</option>`;
  const res = await fetch('/api/projects');
  const data = await res.json();
  (data.projects || []).forEach(p => {
    reportProjectSelect.innerHTML += `<option value="${p._id}">${p.name}</option>`;
  });
};

// Close modal
closeCustomReportModal.onclick = () => customReportModal.style.display = 'none';
window.onclick = (e) => { if (e.target === customReportModal) customReportModal.style.display = 'none'; };

// Handle report form submit
customReportForm.onsubmit = async function(e) {
  e.preventDefault();
  customReportResult.innerHTML = 'Loading...';
  const projectId = reportProjectSelect.value;
  if (!projectId) return customReportResult.innerHTML = 'Please select a project.';
  // Get selected columns
  const columns = Array.from(customReportForm.querySelectorAll('input[name="columns"]:checked')).map(cb => cb.value);

  // Fetch all estimates for this project
  const res = await fetch(`/api/estimates?projectId=${projectId}`);
  const data = await res.json();
  const estimates = data.estimates || [];
  let lineItems = [];
  let totalBudget = 0;

  // Flatten all line items
  estimates.forEach(est => {
    est.lineItems.forEach(cat => {
      (cat.items || []).forEach(item => {
        lineItems.push(item);
        totalBudget += Number(item.total) || 0;
      });
    });
  });

  // Summary calculations
  const completed = lineItems.filter(i => i.status === 'completed' || i.status === 'approved');
  const inProgress = lineItems.filter(i => i.status === 'in-progress');
  const completedCount = completed.length;
  const inProgressCount = inProgress.length;
  const percentComplete = lineItems.length ? Math.round((completedCount / lineItems.length) * 100) : 0;
  const actualCost = completed.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const budgetRemaining = totalBudget - actualCost;
  const laborCostToDate = completed.reduce((sum, i) => sum + (Number(i.laborCost) || 0), 0);
  const materialCostToDate = completed.reduce((sum, i) => sum + (Number(i.materialCost) || 0), 0);
  const totalProfit = completed.reduce((sum, i) =>
    sum + ((Number(i.total) || 0) - (Number(i.laborCost) || 0) - (Number(i.materialCost) || 0)), 0);

  // Fetch all vendors for lookup
  const vendorsRes = await fetch('/api/vendors');
  let vendorsData = await vendorsRes.json();
  let vendors = vendorsData.vendors || vendorsData || [];
  const vendorMap = {};
  vendors.forEach(v => {
    vendorMap[String(v._id)] = v.name;
  });

  // Group line items by estimate
  const estimateMap = {};
  estimates.forEach(est => {
    estimateMap[est._id] = est;
  });

  let table = `<table border="1" style="border-collapse:collapse;width:100%;margin-top:12px;">
    <thead>
      <tr>${
  columns.map(col => {
    if (col === 'laborCost') return `<th>Labor AC</th>`;
    if (col === 'materialCost') return `<th>Material AC</th>`;
    return `<th>${col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1').trim()}</th>`;
  }).join('')
}</tr>
    </thead>
    <tbody>
      ${
        estimates.map(est => {
          const items = [];
          est.lineItems.forEach(cat => {
            (cat.items || []).forEach(item => items.push(item));
          });
          if (!items.length) return '';
          let estimateHeader = `<tr style="background:#e0e7ef;">
            <td colspan="${columns.length}" style="font-weight:bold;color:#2563eb;font-size:1.08rem;">
              EST: ${est.title || est.name || est.invoiceNumber || est._id}
            </td>
          </tr>`;
          let itemRows = items.map(item => {
            const profit = (Number(item.total || 0) - Number(item.laborCost || 0) - Number(item.materialCost || 0));
            return `<tr>
              ${columns.includes('name') ? `<td>${item.name || ''}</td>` : ''}
              ${columns.includes('description') ? `<td>${item.description || ''}</td>` : ''}
              ${columns.includes('status') ? `<td>${item.status || ''}</td>` : ''}
              ${columns.includes('subcontractor') ? `<td>${
                item.assignedTo
                  ? vendorMap[
                      typeof item.assignedTo === 'object' && item.assignedTo._id
                        ? String(item.assignedTo._id)
                        : String(item.assignedTo)
                    ] || ''
                  : ''
              }</td>` : ''}
              ${columns.includes('laborCost') ? `<td>$${Number(item.laborCost || 0).toFixed(2)}</td>` : ''}
              ${columns.includes('materialCost') ? `<td>$${Number(item.materialCost || 0).toFixed(2)}</td>` : ''}
              ${columns.includes('total') ? `<td>$${Number(item.total || 0).toFixed(2)}</td>` : ''}
              ${columns.includes('profit') ? `<td>$${profit.toFixed(2)}</td>` : ''}
            </tr>`;
          }).join('');
          return estimateHeader + itemRows;
        }).join('')
      }
    </tbody>
  </table>`;

  // Fetch all projects to get the selected project's address
  const projectsRes = await fetch('/api/projects');
  const projectsData = await projectsRes.json();
  const selectedProject = (projectsData.projects || []).find(p => p._id === projectId);
  const projectAddress = selectedProject && selectedProject.address
    ? `${selectedProject.address.addressLine1 || ''} ${selectedProject.address.addressLine2 || ''}, ${selectedProject.address.city || ''}, ${selectedProject.address.state || ''} ${selectedProject.address.zip || ''}`
    : '';

  // Summary
  let summary = `
    <div class="summary">
      <div class="summary-address">
        <span class="summary-address-label"><i class="fas fa-map-marker-alt"></i> Project Address:</span>
        <span class="summary-address-value">${projectAddress}</span>
      </div>
      <div class="summary-metric">
        <span class="metric-icon"><i class="fas fa-tasks"></i></span>
        <span class="metric-value">${lineItems.length.toLocaleString()}</span>
        <span class="metric-label">Total Items</span>
      </div>
      <div class="summary-metric">
        <span class="metric-icon" style="color:#22c55e;background:#e7fbe9;"><i class="fas fa-check-circle"></i></span>
        <span class="metric-value" style="color:#22c55e;">${completedCount.toLocaleString()}</span>
        <span class="metric-label">Completed</span>
      </div>
      <div class="summary-metric">
        <span class="metric-icon" style="color:#f59e42;background:#fff7e6;"><i class="fas fa-spinner"></i></span>
        <span class="metric-value" style="color:#f59e42;">${inProgressCount.toLocaleString()}</span>
        <span class="metric-label">In Progress</span>
      </div>
      ${columns.includes('laborCost') ? `
      <div class="summary-metric">
        <span class="metric-icon" style="color:#0ea5e9;background:#e0f7fa;"><i class="fas fa-user-cog"></i></span>
        <span class="metric-value">$${laborCostToDate.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
        <span class="metric-label">Total Labor Cost to Date</span>
      </div>
      ` : ''}
      ${columns.includes('materialCost') ? `
      <div class="summary-metric">
        <span class="metric-icon" style="color:#f59e42;background:#fff7e6;"><i class="fas fa-cubes"></i></span>
        <span class="metric-value">$${materialCostToDate.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
        <span class="metric-label">Total Material Cost to Date</span>
      </div>
      ` : ''}
      ${columns.includes('profit') ? `
      <div class="summary-metric">
        <span class="metric-icon" style="color:#22c55e;background:#e7fbe9;"><i class="fas fa-chart-line"></i></span>
        <span class="metric-value">$${totalProfit.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
        <span class="metric-label">Total Profit</span>
      </div>
      ` : ''}
      <div class="summary-metric">
        <span class="metric-icon" style="color:#0284c7;background:#e0f2fe;"><i class="fas fa-dollar-sign"></i></span>
        <span class="metric-value">$${actualCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
        <span class="metric-label">Completed Budget to Date</span>
      </div>
      <div class="summary-metric">
        <span class="metric-icon" style="color:#6366f1;background:#e0e7ff;"><i class="fas fa-coins"></i></span>
        <span class="metric-value">$${totalBudget.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
        <span class="metric-label">Estimate At Completion</span>
      </div>
      <div class="summary-metric">
        <span class="metric-icon" style="color:#ef4444;background:#fee2e2;"><i class="fas fa-wallet"></i></span>
        <span class="metric-value">$${budgetRemaining.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
        <span class="metric-label">Budget Remaining</span>
      </div>
      <div class="summary-progress">
        <div class="summary-progress-bar">
          <div class="summary-progress-bar-inner" style="width:${percentComplete}%;"></div>
        </div>
        <span class="summary-progress-label">${percentComplete}% Completed</span>
      </div>
    </div>
  `;

  // Add Download PDF button
  let pdfBtn = `<button id="downloadReportPdf" style="margin-bottom:12px;">Download PDF</button>`;

  customReportResult.innerHTML = pdfBtn + summary + table;

  // PDF generation logic
 document.getElementById('downloadReportPdf').onclick = async function() {
  const { jsPDF } = window.jspdf;

  // 1. Render summary as image (for the header)
  const summaryNode = customReportResult.querySelector('.summary');
  const summaryClone = summaryNode.cloneNode(true);
  const summaryWrapper = document.createElement('div');
  summaryWrapper.style.background = '#fff';
  summaryWrapper.style.padding = '24px';
  summaryWrapper.style.width = '800px';
  summaryWrapper.appendChild(summaryClone);
  document.body.appendChild(summaryWrapper);
  summaryWrapper.style.position = 'fixed';
  summaryWrapper.style.left = '-9999px';
  const summaryCanvas = await html2canvas(summaryWrapper, { scale: 2, useCORS: true });
  const summaryImg = summaryCanvas.toDataURL('image/png');
  document.body.removeChild(summaryWrapper);

  // 2. Prepare table data for AutoTable
  const tableNode = customReportResult.querySelector('table');
  const headers = Array.from(tableNode.querySelectorAll('thead th')).map(th => th.textContent);
  const rows = Array.from(tableNode.querySelectorAll('tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent)
  );

  // 3. Create PDF and add summary (first page)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  const pageWidth = pdf.internal.pageSize.getWidth();

  // Add summary image at the top
  const summaryImgWidth = pageWidth - 40;
  const summaryImgHeight = summaryCanvas.height * summaryImgWidth / summaryCanvas.width;
  pdf.addImage(summaryImg, 'PNG', 20, 20, summaryImgWidth, summaryImgHeight);

  // Add table using autoTable
  pdf.autoTable({
    head: [headers],
    body: rows,
    startY: 40 + summaryImgHeight,
    margin: { left: 20, right: 20 },
    styles: {
      fontSize: 10,
      cellPadding: 4,
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: { fillColor: [243, 246, 250] },
    tableLineColor: [224, 231, 235],
    tableLineWidth: 0.5,
    theme: 'striped' ,
    showHead: 'firstPage'
  });

  const safeProjectName = (selectedProject?.name || "project").replace(/[^a-z0-9_\-]+/gi, "_");
pdf.save(`project-report-${safeProjectName}.pdf`);
};
};


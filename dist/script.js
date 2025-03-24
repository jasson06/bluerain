
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

        // Initialize to show the first tab content
        columns.forEach((column, index) => {
            column.style.display = index === 0 ? 'block' : 'none';
        });
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
                        alert(`${formId.replace('-', ' ')} submitted successfully!`);
                        form.reset();
                    } else {
                        const error = await response.json();
                        alert(`Error: ${error.error || 'An unexpected error occurred.'}`);
                    }
                } catch (error) {
                    console.error(`Error submitting form ${formId}:`, error);
                    alert('An error occurred while submitting the form. Please try again.');
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
            if (!payload.name) errors.push('Client name is required.');
            if (!payload.email) errors.push('Client email is required.');
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
              <p>${project.name}</p>
              ${count > 0 ? `
                <span class="activity-badge" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
                  ${count}
                </span>` : ''
              }
            </div>
            <small>${project.address.addressLine1}, ${project.address.city}, ${project.address.state}, ${project.address.zip}</small>
            <small>Lockbox Code: ${project.code || 'N/A'}</small>
          `;
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
    }
  }
  



  
// ✅ Function to load upcoming and on-hold projects dynamically
async function loadUpcomingProjects() {
    const projectsList = document.getElementById("Upcoming-projects-list");
    projectsList.innerHTML = "<p>Loading...</p>";
  
    const today = new Date().toISOString().split("T")[0];
  
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
              <span class="activity-badge" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
                ${count}
              </span>` : ''
            }
          </div>
          <small>${fullAddress}</small>
          <small>Lockbox Code: ${project.code || 'N/A'}</small>
        `;
  
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
    }
  }
  
  



  // ✅ Function to Load Completed Projects Dynamically
  async function loadCompletedProjects() {
    const projectsList = document.getElementById("completed-projects-list");
    projectsList.innerHTML = "<p>Loading...</p>"; // Show loading message
  
    const today = new Date().toISOString().split("T")[0];
  
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
              <p>${project.name}</p>
              ${count > 0 ? `
                <span class="activity-badge" data-tooltip="${count} update${count > 1 ? 's' : ''} today">
                  ${count}
                </span>` : ''
              }
            </div>
            <small>${project.address.addressLine1}, ${project.address.city}, ${project.address.state}, ${project.address.zip}</small>
            <small>Lockbox Code: ${project.code || 'N/A'}</small>
            <span class="status">✔ Completed</span>
          `;
  
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
    }
  }

// ✅ Call function on page load
document.addEventListener("DOMContentLoaded", () => {
    loadCompletedProjects();
});





    
let map;

function initMap() {
 map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 29.4241, lng: -98.4936 }, // Default to San Antonio
        zoom: 10,
        gestureHandling: "greedy", // Enables better pinch-to-zoom
        zoomControl: true, // Ensures zoom control buttons are available
        streetViewControl: false, // Hides Street View button for a cleaner UI
        fullscreenControl: false, // Hides full-screen option on mobile
    });

    loadProjectLocations(); // Load markers
}

// ✅ Make initMap globally accessible
window.initMap = initMap;

// ✅ Load project locations
async function loadProjectLocations() {
    try {
        const response = await fetch("/api/projects");
        if (!response.ok) throw new Error("Failed to fetch project locations");

        const data = await response.json();
        if (!data.projects || data.projects.length === 0) {
            console.warn("No project locations found.");
            return;
        }

        data.projects.forEach(async (project) => {
            if (!project.address || !project.address.addressLine1) return;

            const fullAddress = `${project.address.addressLine1}, ${project.address.city}, ${project.address.state} ${project.address.zip}`;

            try {
                const geoResponse = await fetch(
                    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=AIzaSyCvzkKpCkAY2PHwU8I8zZiM_FLMzMj1bbg`
                );
                const geoData = await geoResponse.json();

                if (geoData.status === "OK") {
                    const { lat, lng } = geoData.results[0].geometry.location;
                    addMarker(lat, lng, project.name);
                } else {
                    console.warn(`Skipping ${project.name}: No coordinates available.`);
                }
            } catch (geoError) {
                console.error("Error geocoding address:", geoError);
            }
        });
    } catch (error) {
        console.error("Error loading project locations:", error);
    }
}

// ✅ Add Markers & Open Google Maps Navigation
function addMarker(lat, lng, title) {
    const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title,
    });


    const infoWindow = new google.maps.InfoWindow({
        content: `
            <div style="
                font-size: 11px;
                font-weight: bold;
                color: #ffffff;
                background: #0f4c75; 
                padding: 3px 8px;
                border-radius: 4px;
                text-align: center;
                white-space: nowrap;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                max-width: 120px;
                max-height: 40px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                📍 ${title}
            </div>
        `,
        maxWidth: 120,  // Controls the white box width
        maxHeight: 50,  // Controls the white box height
    });
    



    // Open label by default (so it's always visible)
    infoWindow.open(map, marker);

    
// Open Apple Maps on iOS, Google Maps on others
marker.addListener("click", () => {
    const destination = `${lat},${lng}`;
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);

    if (isAppleDevice) {
        // Open in Apple Maps
        window.open(`https://maps.apple.com/?daddr=${destination}`, "_blank");
    } else {
        // Open in Google Maps
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, "_blank");
    }
});

}



// Ensure `initMap` is called when the page loads
document.addEventListener("DOMContentLoaded", () => {
    initMap();
});
    
  
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
        console.log("Fetching project counts..."); // Debugging

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

        console.log("✅ Counts:", { upcomingCount, inProgressCount, completedCount }); // Debugging

        // ✅ Ensure Elements Exist Before Updating UI
        const upcomingElement = document.getElementById("upcoming-count");
        const inProgressElement = document.getElementById("in-progress-count");
        const completedElement = document.getElementById("completed-count");

        if (upcomingElement) upcomingElement.textContent = upcomingCount;
        if (inProgressElement) inProgressElement.textContent = inProgressCount;
        if (completedElement) completedElement.textContent = completedCount;

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
      loadCompletedProjects();
      initMap();
      updateProjectCounts();
});
 
 




document.addEventListener('DOMContentLoaded', () => {
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
            if (!payload.status) errors.push('Project status is required.');
            if (!payload.type) errors.push('Project type is required.');
            if (!payload.color) errors.push('Project color is required.');
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
  
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
  
      const data = await response.json();
      projectsList.innerHTML = '';
  
      if (data.projects.length === 0) {
        projectsList.innerHTML = '<p>No projects found.</p>';
      } else {
        data.projects.forEach((project) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'item';
  
          // Attach the navigateToDetails function to the onclick event
          itemDiv.addEventListener('click', () => navigateToDetails('projects', project._id));
          itemDiv.innerHTML = `
            <p>${project.name}</p>
            <small>${project.address.addressLine1}, ${project.address.city}, ${project.address.state}, ${project.address.zip} </small>
          `;
          projectsList.appendChild(itemDiv);
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
    projectsList.innerHTML = "<p>Loading...</p>"; // Placeholder text
  
    try {
      // ✅ Fetch upcoming and on-hold projects
      const response = await fetch("/api/upcoming-projects");
      if (!response.ok) throw new Error("Failed to fetch upcoming projects");
  
      const { projects } = await response.json();
      projectsList.innerHTML = ""; // Clear loading message
  
      if (!projects || projects.length === 0) {
        projectsList.innerHTML = "<p>No upcoming or on-hold projects found.</p>";
        return;
      }
  
      // ✅ Generate project items dynamically (matching loadProjects style)
      projects.forEach((project) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "item"; // Keep the same class as loadProjects
  
        // 🔹 Determine status display: If "Open" or "on-hold", show "Upcoming"
        const displayedStatus = ["Open", "on-hold"].includes(project.status) ? "Upcoming" : project.status;
  
        // 🔹 Full Address Formatting
        const fullAddress = `${project.address.addressLine1 || ""} ${project.address.addressLine2 || ""}, ${project.address.city}, ${project.address.state} ${project.address.zip || ""}`;
  
        // Attach the navigateToDetails function to the onclick event
        itemDiv.addEventListener("click", () => navigateToDetails("projects", project._id));
  
        // ✅ Include modified status label and full address
        itemDiv.innerHTML = `
          <p>${project.name}</p>
          <small>${fullAddress}</small>
        `;
  
        projectsList.appendChild(itemDiv);
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

    try {
        const response = await fetch("/api/completed-projects");
        if (!response.ok) throw new Error("Failed to fetch completed projects");

        const data = await response.json();
        projectsList.innerHTML = ""; // Clear loading message

        if (data.projects.length === 0) {
            projectsList.innerHTML = "<p>No completed projects found.</p>";
        } else {
            data.projects.forEach((project) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "item";

                // Attach the navigateToDetails function to the onclick event
                itemDiv.addEventListener("click", () => navigateToDetails("projects", project._id));

                itemDiv.innerHTML = `
                    <p>${project.name}</p>
                    <small>${project.address.addressLine1}, ${project.address.city}, ${project.address.state}, ${project.address.zip}</small>
                    <span class="status">✔ Completed</span>
                `;

                projectsList.appendChild(itemDiv);
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
  
  
  // Expose the function globally
  window.navigateToDetails = navigateToDetails;
      // Call loadProjects to populate the Projects column on page load
      loadProjects();
      loadUpcomingProjects();
      loadCompletedProjects();
      initMap();
});
 



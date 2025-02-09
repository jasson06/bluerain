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
    const fullURL = `${baseURL}/details-projects.html?id=${id}`;
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
            <small>${project.address.city}, ${project.address.state}</small>
          `;
          projectsList.appendChild(itemDiv);
        });
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      projectsList.innerHTML = '<p>Error loading projects. Please try again later.</p>';
    }
  }
  


  
  
  // Expose the function globally
  window.navigateToDetails = navigateToDetails;
      // Call loadProjects to populate the Projects column on page load
      loadProjects();
      
});


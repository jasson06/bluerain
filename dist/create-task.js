// Listen for form submission
document.getElementById('create-task-form').addEventListener('submit', async (event) => {
  event.preventDefault(); // Prevent default form submission

  // Get project ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId');

  if (!projectId) {
    alert('Project ID is missing. Please try again.');
    return;
  }

  // Collect task data from the form
  const task = {
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim(),
    dueDate: document.getElementById('task-due-date').value,
    projectId,
  };

  // Validate task title
  if (!task.title) {
    alert('Task title is required.');
    return;
  }

  try {
    // Send POST request to create the task
    const response = await fetch('/api/add-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });

    const data = await response.json();

    if (data.success) {
      alert('Task created successfully!');
      // Redirect back to project details page
      window.location.href = `/details/projects/${projectId}`;
    } else {
      throw new Error(data.error || 'Failed to create task');
    }
  } catch (error) {
    console.error('Error creating task:', error);
    alert('An error occurred while creating the task.');
  }
});

// Populate project title in the page
async function loadProjectTitle() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId');

  if (!projectId) {
    document.getElementById('project-title').textContent = 'Error: Missing Project ID';
    return;
  }

  try {
    const response = await fetch(`/api/details/projects/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch project details');

    const { project } = await response.json();
    document.getElementById('project-title').textContent = `Create Task for ${project.name}`;
  } catch (error) {
    console.error('Error loading project title:', error);
    document.getElementById('project-title').textContent = 'Error Loading Project Title';
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', loadProjectTitle);

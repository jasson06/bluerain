// Fetch assigned items for the vendor
async function fetchAssignedItems(vendorId) {
  try {
    const response = await fetch(`/api/vendors/${vendorId}/assigned-items`);
    if (!response.ok) throw new Error('Failed to fetch assigned items.');

    const { newJobs, inProgress, completed } = await response.json();

    renderItems('new-jobs-container', newJobs, 'Start Job', 'startItem');
    renderItems('in-progress-container', inProgress, 'Mark as Completed', 'completeItem');
    renderItems('completed-container', completed); // No buttons for completed jobs
  } catch (error) {
    console.error('Error fetching assigned items:', error);
    alert('Unable to fetch assigned items. Please try again later.');
  }
}

// Render items in a specific section
function renderItems(containerId, items, buttonText, buttonAction) {
  const container = document.getElementById(containerId);
  if (!items || items.length === 0) {
    container.innerHTML = '<p>No items available.</p>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
      <div class="item-card">
        <h4>${item.name}</h4>
        <p><strong>Description:</strong> ${item.description || 'N/A'}</p>
        <p><strong>Quantity:</strong> ${item.quantity}</p>
        <p><strong>Unit Price:</strong> $${item.unitPrice.toFixed(2)}</p>
        <p><strong>Total:</strong> $${item.total.toFixed(2)}</p>
        ${
          buttonText && buttonAction
            ? `<button onclick="${buttonAction}('${item.itemId}')">${buttonText}</button>`
            : ''
        }
      </div>
    `
    )
    .join('');
}

// Start a job (move to "In Progress")
async function startItem(itemId) {
  await updateItemStatus(itemId, 'in-progress');
  fetchAssignedItems(localStorage.getItem('vendorId')); // Refresh the page
}

// Complete a job (move to "Completed")
async function completeItem(itemId) {
  await updateItemStatus(itemId, 'completed');
  fetchAssignedItems(localStorage.getItem('vendorId')); // Refresh the page
}

// Update item status
async function updateItemStatus(itemId, status) {
  try {
    const vendorId = localStorage.getItem('vendorId');
    const response = await fetch(`/api/vendors/${vendorId}/update-item-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, status }),
    });

    if (!response.ok) throw new Error('Failed to update item status.');
    alert('Item status updated successfully.');
  } catch (error) {
    console.error('Error updating item status:', error);
    alert('Unable to update item status. Please try again later.');
  }
}

// Logout functionality
function logout() {
  localStorage.removeItem('vendorId'); // Clear vendor ID
  window.location.href = '/sign-inpage.html'; // Redirect to sign-in page
}

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  const vendorId = localStorage.getItem('vendorId'); // Retrieve vendor ID
  if (!vendorId) {
    alert('Vendor not authenticated.');
    window.location.href = '/sign-inpage.html'; // Redirect to sign-in page
    return;
  }

  fetchAssignedItems(vendorId);
});

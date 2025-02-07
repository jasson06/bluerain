document.addEventListener("DOMContentLoaded", async () => {
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  let estimateId = new URLSearchParams(window.location.search).get("estimateId");

  const assignButton = document.getElementById("assign-items-button");
  const addCategoryButton = document.getElementById("add-category-header");

  if (!projectId) {
    alert("Project ID is missing!");
    return;
  }

  if (!estimateId) {
    assignButton.disabled = true;
    assignButton.title = "Save the estimate before assigning items.";
  } else {
    assignButton.disabled = false;
    assignButton.title = "";
  }

  async function loadEstimateDetails() {
    if (!estimateId) return;
    try {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch estimate details.");
      const { estimate } = await response.json();

      console.log("Loaded Estimate with Nested Items:", JSON.stringify(estimate, null, 2));

      refreshLineItems(estimate.lineItems);
      document.getElementById("tax-input").value = estimate.tax || 0;
      updateSummary();
    } catch (error) {
      console.error("Error loading estimate details:", error);
    }
  }

  function refreshLineItems(categories) {
    const lineItemsBody = document.getElementById("line-items-body");
    lineItemsBody.innerHTML = "";

    categories.forEach(category => {
      const categoryRow = addCategoryHeader(category);
      if (Array.isArray(category.items)) {
        category.items.forEach(item => {
          addLineItemToTable(item, categoryRow);
        });
      } else {
        console.warn(`No items found for category: ${category.category}`);
      }
    });
  }

  async function loadAssignedVendors() {
    try {
      const response = await fetch(`/api/vendors`);
      if (!response.ok) throw new Error("Failed to fetch vendors.");
      const vendors = await response.json();
      window.vendorMap = vendors.reduce((map, vendor) => {
        map[vendor._id] = vendor;
        return map;
      }, {});
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  }

  function getVendorInitials(assignedTo) {
    if (!assignedTo || !window.vendorMap) return 'Unassigned';
    if (typeof assignedTo === 'string' && window.vendorMap[assignedTo]) {
      const vendor = window.vendorMap[assignedTo];
      return vendor.name.split(' ').map(word => word[0]).join('').toUpperCase();
    }
    if (assignedTo.name) {
      return assignedTo.name.split(' ').map(word => word[0]).join('').toUpperCase();
    }
    return 'Unassigned';
  }

  function addLineItemToTable(item = {}, categoryRow = null) {
    const row = document.createElement("tr");
    row.classList.add("line-item");
    row.setAttribute("data-item-id", item._id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
    row.setAttribute("data-assigned-to", item.assignedTo || '');

    row.innerHTML = `
      <td><input type="checkbox" class="line-item-select" ${item.assignedTo ? 'disabled' : ''}></td>
      <td><input type="text" class="item-name" value="${item.name || ''}" placeholder="Name" ${item.assignedTo ? 'readonly' : ''}></td>
      <td><textarea class="item-description" placeholder="Description" ${item.assignedTo ? 'readonly' : ''}>${item.description || ''}</textarea></td>
      <td><input type="number" class="item-quantity" value="${item.quantity || 1}" min="1" ${item.assignedTo ? 'readonly' : ''}></td>
      <td><input type="number" class="item-price" value="${item.unitPrice || 0}" min="0" step="0.01" ${item.assignedTo ? 'readonly' : ''}></td>
      <td class="item-total">$${((item.quantity || 1) * (item.unitPrice || 0)).toFixed(2)}</td>
      <td>${getVendorInitials(item.assignedTo)}</td>
      <td>
        <button class="btn delete-line-item" ${item.assignedTo ? 'disabled' : ''}>Delete</button>
        ${item.assignedTo ? '<button class="btn unassign-item">Unassign</button>' : ''}
      </td>
    `;

    const unassignButton = row.querySelector(".unassign-item");
    if (unassignButton) {
      unassignButton.addEventListener("click", () => unassignItem(row));
    }

    row.querySelectorAll(".item-quantity, .item-price").forEach(input => {
      input.addEventListener("input", () => {
        const quantity = parseInt(row.querySelector(".item-quantity").value, 10) || 0;
        const price = parseFloat(row.querySelector(".item-price").value) || 0;
        const total = quantity * price;
        row.querySelector(".item-total").textContent = `$${total.toFixed(2)}`;
        updateSummary();
      });
    });

    row.querySelector(".delete-line-item").addEventListener("click", () => {
      row.remove();
      updateSummary();
    });

    if (categoryRow && categoryRow.nextSibling) {
      categoryRow.parentNode.insertBefore(row, categoryRow.nextSibling);
    } else {
      document.getElementById("line-items-body").appendChild(row);
    }
  }

  function addCategoryHeader(category = { category: "New Category", status: 'in-progress', items: [] }) {
    const lineItemsBody = document.getElementById("line-items-body");
    const headerRow = document.createElement("tr");
    headerRow.classList.add("category-header");
    headerRow.innerHTML = `
      <td colspan="8" class="category-title">
        <span contenteditable="true">${category.category}</span>
        <button class="btn add-line-item" style="margin-left: 10px;">+</button> <!-- Add "+" icon -->
        <button class="btn remove-category" style="float: right;">&times;</button>
      </td>
    `;
  
    // Event listener to add a line item under this category
    headerRow.querySelector(".add-line-item").addEventListener("click", () => {
      addLineItemToTable({}, headerRow);  // Add an empty line item under this specific category
    });
  
    // Event listener to remove the category and its associated line items
    headerRow.querySelector(".remove-category").addEventListener("click", () => {
      let nextRow = headerRow.nextElementSibling;
      while (nextRow && nextRow.classList.contains('line-item')) {
        const tempRow = nextRow.nextElementSibling;
        nextRow.remove();
        nextRow = tempRow;
      }
      headerRow.remove();
    });

    lineItemsBody.appendChild(headerRow);
    return headerRow;
  }

  addCategoryButton.addEventListener("click", () => {
    const categoryName = prompt("Enter the category name:");
    if (categoryName) {
      addCategoryHeader({ category: categoryName });
    }
  });

  function unassignItem(row) {
    const itemId = row.getAttribute("data-item-id");
    console.log(`Unassigning item with ID: ${itemId}`);
    row.removeAttribute("data-assigned-to");
    row.querySelector(".line-item-select").disabled = false;
    row.querySelector(".item-name").readOnly = false;
    row.querySelector(".item-description").readOnly = false;
    row.querySelector(".item-quantity").readOnly = false;
    row.querySelector(".item-price").readOnly = false;
    row.querySelector(".delete-line-item").disabled = false;
    const vendorCell = row.querySelector("td:nth-child(7)");
    vendorCell.textContent = 'Unassigned';
    if (row.querySelector(".unassign-item")) {
      row.querySelector(".unassign-item").remove();
    }
    clearVendorAssignment(itemId);
  }

  async function clearVendorAssignment(itemId) {
    try {
      const response = await fetch(`/api/clear-vendor-assignment/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }
      });

      const result = await response.json();
      console.log('Server Response:', result);

      if (!response.ok) throw new Error(result.message || "Failed to clear vendor assignment.");

      console.log(`Vendor assignment for item ${itemId} successfully cleared.`);
      await loadAssignedVendors();
      loadEstimateDetails();
    } catch (error) {
      console.error("Error clearing vendor assignment:", error);
    }
  }

  async function loadProjectDetails() {
    try {
      const response = await fetch(`/api/details/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project details.");
      
      const { project } = await response.json();
      
      // Display Project Name
      document.getElementById("project-title").textContent = `Project Name: ${project.name}`;
  
      // Display Project Code
      document.getElementById("project-code").textContent = `Project Code: ${project.code}`;
  
      // Display Project Status
      document.getElementById("project-status").textContent = `Status: ${project.status || "N/A"}`;
  
      // Display Project Type
      document.getElementById("project-type").textContent = `Type: ${project.type || "N/A"}`;
  
      // Display Project Description
      document.getElementById("project-description").textContent = `Description: ${project.description || "No description provided."}`;
  
      // Display Full Address with handling for missing values
      const addressLine1 = project.address?.addressLine1 || "N/A";
      const addressLine2 = project.address?.addressLine2 || "";
      const city = project.address?.city || "N/A";
      const state = project.address?.state || "N/A";
      const zip = project.address?.zip || "N/A";
  
      document.getElementById("project-address").innerText = 
        `${addressLine1}${addressLine2 ? ', ' + addressLine2 : ''}, ${city}, ${state}, ${zip}`;
  
    } catch (error) {
      console.error("Error loading project details:", error);
    }
  }
  


  async function loadVendors() {
    try {
      const response = await fetch("/api/vendors");
      if (!response.ok) throw new Error("Failed to fetch vendors.");
      const vendors = await response.json();
      const vendorSelect = document.getElementById("vendor-select");
      vendors.forEach((vendor) => {
        const option = document.createElement("option");
        option.value = vendor._id;
        option.textContent = vendor.name;
        vendorSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  }

  function generateObjectId() {
    return Math.floor(Date.now() / 1000).toString(16) + 'xxxxxxxxxxxxxxxx'
      .replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16));
  }

  function updateSummary() {
    const lineItems = document.querySelectorAll(".line-item");
    let subtotal = 0;
    lineItems.forEach((item) => {
      const quantity = parseInt(item.querySelector(".item-quantity").value, 10) || 0;
      const price = parseFloat(item.querySelector(".item-price").value) || 0;
      subtotal += quantity * price;
    });
    const taxRate = parseFloat(document.getElementById("tax-input").value) || 0;
    const total = subtotal + (subtotal * taxRate) / 100;
    document.getElementById("subtotal").textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById("total").textContent = `$${total.toFixed(2)}`;
  }

  async function assignItemsToVendor() { 
    const vendorId = document.getElementById("vendor-select").value;
  
    if (!vendorId) {
      alert("Please select a vendor.");
      return;
    }
  
    if (!projectId || !estimateId) {
      alert("Missing project or estimate ID!");
      return;
    }
  
    const selectedItems = Array.from(document.querySelectorAll(".line-item-select:checked")).map((checkbox) => {
      const row = checkbox.closest(".line-item");
      const itemId = row.getAttribute("data-item-id");
      const name = row.querySelector(".item-name").value.trim();
      const description = row.querySelector(".item-description").value.trim() || "No description provided";
      const quantity = parseInt(row.querySelector(".item-quantity").value, 10);
      const unitPrice = parseFloat(row.querySelector(".item-price").value);
      const total = quantity * unitPrice;
  
      // Check if the item is already assigned
      const assignedTo = row.getAttribute("data-assigned-to");
      if (assignedTo && assignedTo !== "null") {
        alert(`Item "${name}" is already assigned to a vendor and cannot be reassigned unless unassigned.`);
        return null;  // Skip this item
      }
  
      // Set the assignment visually in the table for immediate feedback
      row.setAttribute("data-assigned-to", vendorId);
  
      return { 
        itemId, 
        projectId, 
        name, 
        description, 
        quantity, 
        unitPrice, 
        total, 
        assignedTo: vendorId  // Ensure assignedTo is a string (vendorId)
      };
    }).filter(item => item !== null);  // Filter out any null values
  
    if (selectedItems.length === 0) {
      alert("No valid items to assign.");
      return;
    }
  
    try {
      const response = await fetch("/api/assign-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, projectId, estimateId, items: selectedItems }),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to assign items.");
      }
  
      const result = await response.json();
      alert(result.message || "Items assigned successfully!");
  
      // Refresh the page data to reflect changes
      refreshPageData();
  
    } catch (error) {
      console.error("Error assigning items:", error);
      alert(`Error assigning items: ${error.message}`);
    }
  }
  

  async function saveEstimate() {
    const lineItems = [];
    let currentCategory = null;
  
    document.querySelectorAll("#line-items-body > tr").forEach(row => {
      if (row.classList.contains('category-header')) {
        currentCategory = {
          type: 'category',
          category: row.querySelector('.category-title span').textContent.trim(),
          status: 'in-progress',
          items: []
        };
        lineItems.push(currentCategory);
      } else if (row.classList.contains('line-item')) {
        let assignedTo = row.getAttribute("data-assigned-to");
  
        // Sanitize the assignedTo field: convert to null if empty or not a valid ObjectId string
        if (!assignedTo || assignedTo === 'null' || assignedTo === '[object Object]') {
          assignedTo = null;
        }
  
        const item = {
          type: 'item',
          name: row.querySelector(".item-name").value,
          description: row.querySelector(".item-description").value,
          quantity: parseInt(row.querySelector(".item-quantity").value, 10) || 1,
          unitPrice: parseFloat(row.querySelector(".item-price").value) || 0,
          total: (parseInt(row.querySelector(".item-quantity").value, 10) || 1) * 
                 (parseFloat(row.querySelector(".item-price").value) || 0),
          assignedTo: assignedTo  // Ensure assignedTo is null or a valid ObjectId string
        };
  
        if (currentCategory) {
          currentCategory.items.push(item);
        } else {
          alert("Item found without a category. Please add a category before adding items.");
        }
      }
    });
  
    const tax = parseFloat(document.getElementById("tax-input").value) || 0;
    const estimate = { projectId, lineItems, tax };
  
    try {
      const method = estimateId ? "PUT" : "POST";  // Use PUT if estimateId exists, otherwise POST
      const url = estimateId ? `/api/estimates/${estimateId}` : "/api/estimates";
  
      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estimate)
      });
  
      if (!response.ok) throw new Error(`Failed to ${method === "POST" ? "create" : "update"} estimate.`);
      const result = await response.json();
  
      alert(`Estimate ${method === "POST" ? "created" : "updated"} successfully!`);
  
      if (!estimateId && result.estimate && result.estimate._id) {
        estimateId = result.estimate._id;  // Update the estimateId after creating
        window.history.pushState({}, '', `?projectId=${projectId}&estimateId=${estimateId}`);
      }
  
      loadEstimateDetails();  // Reload details to reflect changes
  
    } catch (error) {
      console.error(`Error ${estimateId ? "updating" : "creating"} estimate:`, error);
    }
  }
  
  

  function refreshPageData() {
    loadAssignedVendors();
    loadEstimateDetails();
    loadProjectDetails();
    loadVendors();
  }

  document.getElementById("assign-items-button").addEventListener("click", assignItemsToVendor);
  document.getElementById("tax-input").addEventListener("input", updateSummary);
  document.getElementById("save-estimate").addEventListener("click", saveEstimate);
  document.getElementById("add-line-item").addEventListener("click", () => addLineItemToTable());

  await loadAssignedVendors();
  loadProjectDetails();
  loadVendors();
  loadEstimateDetails();
});

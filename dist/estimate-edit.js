document.addEventListener("DOMContentLoaded", async () => {
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  let estimateId = new URLSearchParams(window.location.search).get("estimateId");

  const assignButton = document.getElementById("assign-items-button");
  const addCategoryButton = document.getElementById("add-category-header");
  const addLineItemButton = document.getElementById("add-line-item");
  if (!projectId) {
    alert("Project ID is missing!");
    return;
  }

  // Enable/Disable Assign Button Based on Estimate ID
  if (!estimateId) {
    assignButton.disabled = true;
    assignButton.title = "Save the estimate before assigning items.";
  } else {
    assignButton.disabled = false;
    assignButton.title = "";
  }

  // Load Project Details
  async function loadProjectDetails() {
    try {
      const response = await fetch(`/api/details/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project details.");
      const { project } = await response.json();

      document.getElementById("project-title").textContent = `Project Name: ${project.name}`;
      document.getElementById("project-code").textContent = `Project Code: ${project.code}`;
      document.getElementById("project-status").textContent = `Status: ${project.status || "N/A"}`;
      document.getElementById("project-type").textContent = `Type: ${project.type || "N/A"}`;
      document.getElementById("project-description").textContent = `Description: ${project.description || "No description provided."}`;
      document.getElementById("project-address").textContent = `${project.address?.addressLine1 || "N/A"}, ${project.address?.city || "N/A"}, ${project.address?.state || "N/A"}, ${project.address?.zip || "N/A"}`;
    } catch (error) {
      console.error("Error loading project details:", error);
    }
  }

  // Load Estimate Details
  async function loadEstimateDetails() {
    if (!estimateId) return;
    try {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch estimate details.");
      const { estimate } = await response.json();

      refreshLineItems(estimate.lineItems);
      document.getElementById("tax-input").value = estimate.tax || 0;
      updateSummary();
    } catch (error) {
      console.error("Error loading estimate details:", error);
    }
  }

  // Refresh Line Items
  function refreshLineItems(categories) {
    const lineItemsContainer = document.getElementById("line-items-cards");
    lineItemsContainer.innerHTML = "";

    categories.forEach((category) => {
      const categoryHeader = addCategoryHeader(category);
      if (Array.isArray(category.items)) {
        category.items.forEach((item) => {
          addLineItemCard(item, categoryHeader);
        });
      }
    });
  }

  // Add Category Header
  function addCategoryHeader(category = { category: "New Category", status: "in-progress", items: [] }) {
    const lineItemsContainer = document.getElementById("line-items-cards");
    const header = document.createElement("div");
    header.classList.add("category-header");
    header.innerHTML = `
      <div class="category-title">
        <span contenteditable="true">${category.category}</span>
        <button class="btn add-line-item">+</button>
        <button class="btn remove-category">&times;</button>
      </div>
    `;

    header.querySelector(".add-line-item").addEventListener("click", () => {
      addLineItemCard({}, header);
    });

    header.querySelector(".remove-category").addEventListener("click", () => {
      let nextSibling = header.nextSibling;
      while (nextSibling && nextSibling.classList.contains("line-item-card")) {
        const temp = nextSibling.nextSibling;
        nextSibling.remove();
        nextSibling = temp;
      }
      header.remove();
    });

    lineItemsContainer.appendChild(header);
    return header;
  }

 // Add Line Item Card Function
 function addLineItemCard(item = {}, categoryHeader = null) {
  const card = document.createElement("div");
  card.classList.add("line-item-card");
  card.setAttribute("data-item-id", item._id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  card.setAttribute("data-assigned-to", item.assignedTo || "");

  const assignedTo = item.assignedTo ? getVendorInitials(item.assignedTo) : "Unassigned";

  card.innerHTML = `
    <div class="card-header">
      <input type="checkbox" class="line-item-select" ${item.assignedTo ? "disabled" : ""}>
      <input type="text" class="item-name" value="${item.name || ""}" placeholder="Item Name">
      <button class="btn delete-line-item">Delete</button>
      ${item.assignedTo ? `<button class="btn unassign-item">Unassign</button>` : ""}
    </div>
    <div class="card-details">
      <div class="detail">
        <label>Description</label>
        <textarea class="item-description" placeholder="Description">${item.description || ""}</textarea>
      </div>
      <div class="detail">
        <label>Quantity</label>
        <input type="number" class="item-quantity" value="${item.quantity || 1}" min="1">
      </div>
      <div class="detail">
        <label>Unit Price</label>
        <input type="number" class="item-price" value="${item.unitPrice || 0}" min="0" step="0.01">
      </div>
    </div>
    <div class="card-footer">
      <span>Assigned to: <span class="vendor-name">${assignedTo}</span></span>
      <span class="item-total">$${((item.quantity || 1) * (item.unitPrice || 0)).toFixed(2)}</span>
    </div>
  `;

  // Add functionality for the "Unassign" button
  const unassignButton = card.querySelector(".unassign-item");
  if (unassignButton) {
    unassignButton.addEventListener("click", () => unassignItem(card));
  }

  // Delete Line Item
  card.querySelector(".delete-line-item").addEventListener("click", () => {
    card.remove();
    updateSummary();
  });

   // Update Item Total on Quantity or Price Change
   const quantityInput = card.querySelector(".item-quantity");
   const priceInput = card.querySelector(".item-price");

   function updateCardTotal() {
     const quantity = parseInt(quantityInput.value, 10) || 0;
     const price = parseFloat(priceInput.value) || 0;
     const total = quantity * price;
     card.querySelector(".item-total").textContent = `$${total.toFixed(2)}`;
     updateSummary();
   }

   quantityInput.addEventListener("input", updateCardTotal);
   priceInput.addEventListener("input", updateCardTotal);

   const lineItemsContainer = document.getElementById("line-items-cards");

   // Append Card to the Line Items Container
   if (categoryHeader && categoryHeader.nextSibling) {
     categoryHeader.parentNode.insertBefore(card, categoryHeader.nextSibling);
   } else {
     lineItemsContainer.appendChild(card);
   }
 }
  // Update Summary Function
  function updateSummary() {
    const lineItems = document.querySelectorAll(".line-item-card");
    let subtotal = 0;
  
    lineItems.forEach((card) => {
      const quantity = parseInt(card.querySelector(".item-quantity").value, 10) || 0;
      const price = parseFloat(card.querySelector(".item-price").value) || 0;
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
      const card = checkbox.closest(".line-item-card");
      const itemId = card.getAttribute("data-item-id");
      const name = card.querySelector(".item-name").value.trim();
      const description = card.querySelector(".item-description").value.trim() || "No description provided";
      const quantity = parseInt(card.querySelector(".item-quantity").value, 10) || 1;
      const unitPrice = parseFloat(card.querySelector(".item-price").value) || 0;
      const total = quantity * unitPrice;
  
      return { itemId, name, description, quantity, unitPrice, total, assignedTo: vendorId };
    });
  
    if (selectedItems.length === 0) {
      alert("No items selected for assignment.");
      return;
    }
  
    try {
      // Send API Request
      const response = await fetch("/api/assign-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, projectId, estimateId, items: selectedItems }),
      });
  
      if (!response.ok) throw new Error("Failed to assign items.");
  
      // Update the UI for Assigned Items
      selectedItems.forEach((item) => {
        const card = document.querySelector(`.line-item-card[data-item-id="${item.itemId}"]`);
        if (card) {
        // Update the "Assigned to" field
        card.setAttribute("data-assigned-to", vendorId);
        card.querySelector(".vendor-name").textContent = getVendorInitials(vendorId);
  
          // Uncheck the item after assignment
          const checkbox = card.querySelector(".line-item-select");
          checkbox.checked = false;
  
          // Disable the checkbox to prevent reassignment
          checkbox.disabled = true;
        }
      });
  
      alert("Items assigned successfully!");
      updatePage(); // Reflect the changes immediately
    } catch (error) {
      console.error("Error assigning items:", error);
      alert("Error assigning items. Please try again.");
    }
  }

  
  function unassignItem(card) {
    const itemId = card.getAttribute("data-item-id");
  
    // Clear the "Assigned to" field in the UI
    card.setAttribute("data-assigned-to", "");
    card.querySelector(".vendor-name").textContent = "Unassigned";
  
    // Re-enable the checkbox for the item
    const checkbox = card.querySelector(".line-item-select");
    checkbox.disabled = false;
    checkbox.checked = false;
  
    // Send API Request to unassign the item
    clearVendorAssignment(itemId);
  }
  
  async function clearVendorAssignment(itemId) {
    try {
      const response = await fetch(`/api/clear-vendor-assignment/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to clear vendor assignment.");
      }
  
      console.log(`Vendor assignment cleared for item: ${itemId}`);
    } catch (error) {
      console.error("Error clearing vendor assignment:", error);
      alert("Failed to unassign item. Please try again.");
    }
  }
  
  


// Save Estimate
async function saveEstimate() {
  const lineItems = [];
  let currentCategory = null;

  document.querySelectorAll("#line-items-cards > div").forEach((element) => {
    if (element.classList.contains("category-header")) {
      currentCategory = {
        _id: element.getAttribute("data-category-id") || undefined,
        type: "category",
        category: element.querySelector(".category-title span").textContent.trim(),
        status: "in-progress",
        items: [],
      };
      lineItems.push(currentCategory);
    } else if (element.classList.contains("line-item-card")) {
      const assignedToValue = element.getAttribute("data-assigned-to");
      const assignedTo =
        assignedToValue && /^[a-f\d]{24}$/i.test(assignedToValue) ? assignedToValue : null;

      const item = {
        _id: element.getAttribute("data-item-id") || undefined,
        type: "item",
        name: element.querySelector(".item-name").value.trim(),
        description: element.querySelector(".item-description").value.trim() || "",
        quantity: parseInt(element.querySelector(".item-quantity").value, 10) || 1,
        unitPrice: parseFloat(element.querySelector(".item-price").value) || 0,
        total:
          (parseInt(element.querySelector(".item-quantity").value, 10) || 1) *
          (parseFloat(element.querySelector(".item-price").value) || 0),
        assignedTo, // Preserve assignedTo
      };

      if (!item._id || item._id.startsWith("item-")) {
        delete item._id; // Remove temporary IDs for new items
      }

      if (currentCategory) {
        currentCategory.items.push(item);
      } else {
        console.error("Item without a category:", item);
        alert("Item found without a category. Please add a category before saving.");
      }
    }
  });

  const tax = parseFloat(document.getElementById("tax-input").value) || 0;
  const estimate = { projectId, lineItems, tax };

  try {
    const method = estimateId ? "PUT" : "POST";
    const url = estimateId ? `/api/estimates/${estimateId}` : "/api/estimates";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(estimate),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to ${method === "POST" ? "create" : "update"} estimate.`);
    }

    const result = await response.json();
    alert(`Estimate ${method === "POST" ? "created" : "updated"} successfully!`, result);

    if (!estimateId && result.estimate && result.estimate._id) {
      estimateId = result.estimate._id;
      window.history.pushState({}, "", `?projectId=${projectId}&estimateId=${estimateId}`);
    }

    await loadEstimateDetails();
    updatePage();
  } catch (error) {
    console.error("Error saving estimate:", error);
    alert("Error saving the estimate. Please try again.");
  }
}






function updatePage() {
  // Update the summary totals
  updateSummary();

  // Add any other dynamic UI updates here if necessary
}



  async function loadVendors() {
    try {
      const response = await fetch("/api/vendors");
      if (!response.ok) throw new Error("Failed to fetch vendors.");
      const vendors = await response.json();
  
      // Populate the vendor dropdown
      const vendorSelect = document.getElementById("vendor-select");
      vendorSelect.innerHTML = '<option value="">Select a Vendor</option>'; // Reset the dropdown
      vendors.forEach((vendor) => {
        const option = document.createElement("option");
        option.value = vendor._id;
        option.textContent = vendor.name;
        vendorSelect.appendChild(option);
      });
  
      // Populate the global vendor map
      window.vendorMap = vendors.reduce((map, vendor) => {
        map[vendor._id] = vendor;
        return map;
      }, {});
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  }
  

  // Get Vendor Initials
  function getVendorInitials(assignedTo) {
    if (!assignedTo || !window.vendorMap) return "Unassigned";
    if (typeof assignedTo === "string" && window.vendorMap[assignedTo]) {
      const vendor = window.vendorMap[assignedTo];
      return vendor.name.split(" ").map((word) => word[0]).join("").toUpperCase();
    }
    if (assignedTo.name) {
      return assignedTo.name.split(" ").map((word) => word[0]).join("").toUpperCase();
    }
    return "Unassigned";
  }


  // Load All Data
  await loadProjectDetails();
  await loadVendors();
  await loadEstimateDetails();
  

  // Add Event Listeners
  document.getElementById("add-line-item").addEventListener("click", () => addLineItemCard());
  document.getElementById("add-category-header").addEventListener("click", () => {
    const categoryName = prompt("Enter the category name:");
    if (categoryName) addCategoryHeader({ category: categoryName });
  });
  document.getElementById("assign-items-button").addEventListener("click", assignItemsToVendor);
  document.getElementById("tax-input").addEventListener("input", updateSummary);
  document.getElementById("save-estimate").addEventListener("click", saveEstimate);
});


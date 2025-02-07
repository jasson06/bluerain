document.addEventListener("DOMContentLoaded", async () => {   
  const estimateId = new URLSearchParams(window.location.search).get("estimateId");

  if (!estimateId) {
    alert("Estimate ID is missing!");
    return;
  }

  async function loadEstimateDetails() {
    try {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch estimate details");

      const { estimate } = await response.json();

      if (!estimate) {
        document.body.innerHTML = "<p>Estimate not found.</p>";
        return;
      }

      // Populate Header
      document.getElementById("invoice-number").textContent = `Invoice #: ${estimate.invoiceNumber || "N/A"}`;
      document.getElementById("project-name").textContent = `Project: ${estimate.projectId?.name || "Unknown"}`;
      document.getElementById("project-address").textContent = 
        `Address: ${estimate.projectId?.address?.addressLine1 || "Unknown"}, 
                  ${estimate.projectId?.address?.addressLine2 || ""}, 
                  ${estimate.projectId?.address?.city || "Unknown"}, 
                  ${estimate.projectId?.address?.state || ""}, 
                  ${estimate.projectId?.address?.zip || ""}`.replace(/, ,/g, ',').trim();
      document.getElementById("total-amount").textContent = `Total: $${estimate.total.toFixed(2)}`;

      // Populate Line Items (with Categories, Status & Assigned Vendor)
      const lineItemsBody = document.getElementById("line-items-body");
      if (estimate.lineItems?.length) {
        lineItemsBody.innerHTML = estimate.lineItems.map(lineItem => {
          const categoryRow = `
            <tr class="category-row">
              <td colspan="6"><strong>Category: ${lineItem.category}</strong></td>
            </tr>
          `;

          const itemsRows = lineItem.items.map(item => {
            // Extract vendor initials (First letter of first & last name)
            let vendorInitials = "Unassigned";
            if (item.assignedTo && typeof item.assignedTo === "object") {
              const nameParts = item.assignedTo.name?.split(" ") || [];
              vendorInitials = nameParts.length > 1 
                ? nameParts[0][0] + nameParts[1][0] // First letter of first & last name
                : nameParts[0]?.slice(0, 2) || "NA"; // First 2 letters if only one name
            }

            return `
              <tr data-item-id="${item._id}">
                <td>${item.name || "N/A"}</td>
                <td>${item.description || "N/A"}</td>
                <td>${item.quantity || "N/A"}</td>
                <td>$${(item.unitPrice || 0).toFixed(2)}</td>
                <td>$${(item.total || 0).toFixed(2)}</td>
                <td>${item.status || "N/A"}</td>
                <td>${vendorInitials}</td>
              </tr>
            `;
          }).join("");

          return categoryRow + itemsRows;
        }).join("");
      } else {
        lineItemsBody.innerHTML = `<tr><td colspan="7">No line items found.</td></tr>`;
      }

      // Populate Summary
      document.getElementById("subtotal").textContent = estimate.total.toFixed(2);
      document.getElementById("tax").textContent = ((estimate.total * (estimate.tax || 0)) / 100).toFixed(2);
      document.getElementById("total").textContent = 
        (estimate.total + (estimate.total * (estimate.tax || 0)) / 100).toFixed(2);

      // Back to Project Button
      document.getElementById("back-to-project").addEventListener("click", () => {
        window.location.href = `/details/projects/${estimate.projectId._id}`;
      });

    } catch (error) {
      console.error("Error loading estimate details:", error);
      alert("Failed to load estimate details.");
    }
  }

  document.getElementById("print-estimate").addEventListener("click", () => {
    window.print();
  });

  document.getElementById("delete-estimate").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this estimate?")) return;

    try {
      const response = await fetch(`/api/estimates/${estimateId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete estimate.");
      alert("Estimate deleted successfully!");
      window.location.href = `/details/projects/${estimate.projectId?._id}`;
    } catch (error) {
      console.error("Error deleting estimate:", error);
      alert("Failed to delete estimate.");
    }
  });

  // Load the estimate details when the page loads
  loadEstimateDetails();
});




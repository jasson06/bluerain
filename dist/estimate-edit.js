document.addEventListener("DOMContentLoaded", async () => {
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  let estimateId = new URLSearchParams(window.location.search).get("estimateId");

  const assignButton = document.getElementById("assign-items-button");
  const addCategoryButton = document.getElementById("add-category-header");
  const addLineItemButton = document.getElementById("add-line-item");
  if (!projectId) {
    showToast("Project ID is missing!");
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
  updatePage();

  let fullScreenPhotos = [];
  let fullScreenIndex = 0;
  
 let laborCostList = [];

async function fetchLaborCostList() {
  
  try {
    const res = await fetch("/api/labor-costs");
    laborCostList = await res.json();
  } catch (error) {
    console.error("Failed to fetch labor cost suggestions", error);
  } finally {
   
  }
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
  
 function generatePhotoPreview(photos, itemId, type) {
    if (!photos || photos.length === 0) {
        return `<p class="placeholder">No photos</p>`;
    }

    return `
        <div class="photo-container">
            <!-- Left Navigation Button -->
            <button class="nav-button left" onclick="changePhoto('${itemId}', '${type}', -1)">&#10094;</button>

            <!-- Photo Wrapper for Sliding -->
            <div class="photo-wrapper" id="photo-wrapper-${type}-${itemId}" data-index="0">
                ${photos.map((photo, index) => `
                    <div class="photo-slide">
                        <img src="${photo}" draggable="false" onclick="openPhotoViewer('${photo.replace(/'/g, "\\'")}', ${JSON.stringify(photos).replace(/"/g, '&quot;')})">
                        <button class="delete-photo" onclick="deletePhoto('${itemId}', '${photo.replace(/'/g, "\\'")}', '${type}')">✖</button>
                    </div>
                `).join("")}
            </div>

            <!-- Right Navigation Button -->
            <button class="nav-button right" onclick="changePhoto('${itemId}', '${type}', 1)">&#10095;</button>

            <!-- Navigation Dots -->
            <div class="photo-dots" id="dots-${type}-${itemId}">
                ${photos.map((_, index) => `
                    <span class="dot" data-index="${index}" onclick="jumpToPhoto('${itemId}', '${type}', ${index})"></span>
                `).join("")}
            </div>
        </div>
    `;
}

/* ✅ Change Photo Function */
function changePhoto(itemId, type, direction) {
    const wrapper = document.getElementById(`photo-wrapper-${type}-${itemId}`);
    const dotsContainer = document.getElementById(`dots-${type}-${itemId}`);
    const slides = wrapper.children;
    const totalSlides = slides.length;

    let currentIndex = parseInt(wrapper.dataset.index, 10);
    currentIndex += direction;

    // ✅ Loop back around
    if (currentIndex < 0) {
        currentIndex = totalSlides - 1;
    } else if (currentIndex >= totalSlides) {
        currentIndex = 0;
    }

    // ✅ Apply smooth transition
    wrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
    wrapper.dataset.index = currentIndex;

    // ✅ Update active dot
    updateActiveDot(dotsContainer, currentIndex);
}

/* ✅ Jump to Specific Photo */
function jumpToPhoto(itemId, type, index) {
    const wrapper = document.getElementById(`photo-wrapper-${type}-${itemId}`);
    const dotsContainer = document.getElementById(`dots-${type}-${itemId}`);

    wrapper.style.transform = `translateX(-${index * 100}%)`;
    wrapper.dataset.index = index;

    // ✅ Update active dot
    updateActiveDot(dotsContainer, index);
}

/* ✅ Update Active Navigation Dot */
function updateActiveDot(dotsContainer, activeIndex) {
    if (!dotsContainer) return;
    Array.from(dotsContainer.children).forEach((dot, index) => {
        dot.classList.toggle("active", index === activeIndex);
    });
}


/* ✅ Enable Swipe Support (Mobile) */
function enableSwipe(itemId, type) {
  const wrapper = document.getElementById(`photo-wrapper-${type}-${itemId}`);
  if (!wrapper) {
      console.warn(`⚠️ Swipe not enabled: Wrapper element not found for ${type}-${itemId}`);
      return;
  }

  let startX = 0;
  let moveX = 0;
  let isSwiping = false;

  // ✅ Remove previous event listeners to prevent duplication
  wrapper.removeEventListener("touchstart", handleTouchStart);
  wrapper.removeEventListener("touchmove", handleTouchMove);
  wrapper.removeEventListener("touchend", handleTouchEnd);

  function handleTouchStart(e) {
      // ✅ Prevent swipe if touching a button
      if (e.target.closest(".nav-button")) {
          return;
      }

      startX = e.touches[0].clientX;
      isSwiping = true;
  }

  function handleTouchMove(e) {
      if (!isSwiping) return;
      moveX = e.touches[0].clientX;
  }

  function handleTouchEnd() {
      if (!isSwiping) return;
      let diff = startX - moveX;
      isSwiping = false;

      // ✅ Ensure a proper swipe length
      if (Math.abs(diff) > 50) {
          if (diff > 0) {
              changePhoto(itemId, type, 1); // Swipe Left (Next)
          } else {
              changePhoto(itemId, type, -1); // Swipe Right (Previous)
          }
      }
  }

  // ✅ Attach event listeners
  wrapper.addEventListener("touchstart", handleTouchStart);
  wrapper.addEventListener("touchmove", handleTouchMove);
  wrapper.addEventListener("touchend", handleTouchEnd);

  console.log(`✅ Swipe enabled for ${type}-${itemId}`);
}




// ✅ Open Full-Screen Viewer with Swipe Support
function openPhotoViewer(photoUrl, photosList) {
  console.log("🟢 Open Viewer Called - Photo:", photoUrl, " | List:", photosList);

  const viewer = document.getElementById("photo-viewer");
  const fullPhoto = document.getElementById("full-photo");

  if (!viewer || !fullPhoto) {
      console.error("❌ Fullscreen viewer elements not found!");
      return;
  }

  // ✅ Store the full list of photos and set current index
  fullScreenPhotos = [...photosList]; // Fresh copy of the array
  fullScreenIndex = fullScreenPhotos.indexOf(photoUrl);

  if (fullScreenIndex === -1) {
      console.error("❌ Photo not found in list:", photoUrl);
      return;
  }

  // ✅ Display the correct image
  fullPhoto.src = fullScreenPhotos[fullScreenIndex];

  // ✅ Show the viewer
  viewer.style.display = "flex";

  // ✅ Enable Swipe Support for Full-Screen Viewer
  enableFullScreenSwipe();
}

// ✅ Navigate Fullscreen Viewer
function navigateFullScreen(direction) {
  if (!fullScreenPhotos.length) return;

  // ✅ Update Index
  fullScreenIndex += direction;

  // ✅ Loop Around if Reaching Ends
  if (fullScreenIndex < 0) fullScreenIndex = fullScreenPhotos.length - 1;
  if (fullScreenIndex >= fullScreenPhotos.length) fullScreenIndex = 0;

  // ✅ Update Image
  document.getElementById("full-photo").src = fullScreenPhotos[fullScreenIndex];
}

// ✅ Close Full-Screen Viewer
function closePhotoViewer() {
  document.getElementById("photo-viewer").style.display = "none";
}

// ✅ Enable Swipe Support for Full-Screen Viewer
function enableFullScreenSwipe() {
  const viewer = document.getElementById("photo-viewer");
  let startX = 0;
  let endX = 0;

  if (!viewer) return;

  viewer.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
  });

  viewer.addEventListener("touchmove", (e) => {
      endX = e.touches[0].clientX;
  });

  viewer.addEventListener("touchend", () => {
      let diff = startX - endX;
      if (diff > 50) {
          navigateFullScreen(1); // Swipe Left (Next)
      } else if (diff < -50) {
          navigateFullScreen(-1); // Swipe Right (Previous)
      }
  });


  
  console.log("✅ Swipe enabled for full-screen viewer");
}

  
// ✅ Ensure functions are globally accessible
window.openPhotoViewer = openPhotoViewer;
window.navigateFullScreen = navigateFullScreen;
window.closePhotoViewer = closePhotoViewer;






// ✅ Upload Photo (Supports Before & After)
function uploadPhoto(event, itemId, type) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const estimateId = new URLSearchParams(window.location.search).get("estimateId");
    const vendorId = localStorage.getItem("vendorId"); // This might be null if the item is unassigned

    if (!estimateId) {
        showToast("Estimate ID is missing! Please save the estimate first.");
        return;
    }

    const formData = new FormData();
    for (let file of files) {
        formData.append("photos", file);
    }
    formData.append("estimateId", estimateId);
    formData.append("itemId", itemId);
    formData.append("type", type);

    if (vendorId && vendorId !== "null" && vendorId !== "undefined") {
        formData.append("vendorId", vendorId);
    }

    // ✅ Show inline loader in the photo section
    const containerId = `${type}-photos-${itemId}`;
    const photoContainer = document.getElementById(containerId);
    if (photoContainer) {
        photoContainer.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 100px;">
                <div style="border: 4px solid #f3f3f3; border-top: 4px solid #0ea5e9; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
            </div>
        `;
    }

    fetch("/api/upload-photos", { method: "POST", body: formData })
        .then(response => response.json())
        .then(result => {
            if (!result || !result.photoUrls) {
                throw new Error(result.message || "Invalid server response.");
            }

            console.log(`✅ Uploaded ${files.length} Photo(s):`, result.photoUrls);
            showToast(`✅ ${files.length} Photo(s) uploaded successfully!`);

            // ✅ Immediately refresh the photos
            setTimeout(() => updatePhotoSection(itemId, type), 500);
        })
        .catch(error => {
            console.error("❌ Photo Upload Error:", error);
            showToast("Failed to upload photos.");
            // Clear loader on error
            if (photoContainer) {
                photoContainer.innerHTML = `<p class="placeholder">Error uploading photos.</p>`;
            }
        });
}



  window.uploadPhoto = uploadPhoto;

 // ✅ Update Photo Section After Upload
async function updatePhotoSection(itemId, type) {

  showLoader(); // 👈 START
    try {
        const estimateId = new URLSearchParams(window.location.search).get("estimateId");
        const vendorId = localStorage.getItem("vendorId");

        let response;

        // ✅ First, check the estimate for photos
        response = await fetch(`/api/estimates/${estimateId}`);
        if (response.ok) {
            const { estimate } = await response.json();
            const item = estimate.lineItems.flatMap(cat => cat.items).find(i => i._id === itemId);
            if (item && item.photos) {
                document.getElementById(`${type}-photos-${itemId}`).innerHTML = generatePhotoPreview(item.photos[type], itemId, type);

                // ✅ Ensure Swipe is Enabled After Photos Are Rendered
                setTimeout(() => enableSwipe(itemId, type), 100);
                return;
            }
        }

        // ✅ If vendor has photos, check vendor API
        if (vendorId && vendorId !== "null" && vendorId !== "undefined") {
            response = await fetch(`/api/vendors/${vendorId}/items/${itemId}/photos`);
            if (response.ok) {
                const { photos } = await response.json();
                document.getElementById(`${type}-photos-${itemId}`).innerHTML = generatePhotoPreview(photos[type], itemId, type);

                // ✅ Ensure Swipe is Enabled After Photos Are Rendered
                setTimeout(() => enableSwipe(itemId, type), 100);
                return;
            }
        }

        console.warn("⚠️ No photos found for item:", itemId);
    } catch (error) {
        console.error("❌ Error updating photo section:", error);
      } finally {
        hideLoader(); // 👈 END

    }
}





  

async function updatePhotoSection(itemId, type) {
  const containerId = `${type}-photos-${itemId}`;
  let retries = 10;

  // ⏳ Wait for the DOM element to exist
  while (retries-- > 0 && !document.getElementById(containerId)) {
    await new Promise(r => setTimeout(r, 50));
  }

  const photoContainer = document.getElementById(containerId);
  if (!photoContainer) {
    console.warn(`❌ Photo container not found: ${containerId}`);
    return;
  }

  // ✅ Show inline loader
  photoContainer.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; min-height: 100px;">
      <div style="border: 4px solid #f3f3f3; border-top: 4px solid #0ea5e9; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
    </div>
  `;

  let contentHTML = "";

  try {
    const estimateId = new URLSearchParams(window.location.search).get("estimateId");
    const vendorId = localStorage.getItem("vendorId");

    const res = await fetch(`/api/estimates/${estimateId}`);
    if (res.ok) {
      const { estimate } = await res.json();
      const item = estimate.lineItems.flatMap(cat => cat.items).find(i => i._id === itemId);
      if (item?.photos?.[type]) {
        contentHTML = generatePhotoPreview(item.photos[type], itemId, type);
      }
    }

    if (!contentHTML && vendorId && vendorId !== "null" && vendorId !== "undefined") {
      const res = await fetch(`/api/vendors/${vendorId}/items/${itemId}/photos`);
      if (res.ok) {
        const { photos } = await res.json();
        if (photos?.[type]) {
          contentHTML = generatePhotoPreview(photos[type], itemId, type);
        }
      }
    }

    if (!contentHTML) {
      contentHTML = `<p class="placeholder">No ${type} photos found.</p>`;
    }

  } catch (error) {
    console.error("❌ Photo fetch error:", error);
    contentHTML = `<p class="placeholder">Error loading ${type} photos.</p>`;
  }

  // ✅ Replace loader with actual content
  photoContainer.innerHTML = contentHTML;

  // ✅ Swipe re-init
  setTimeout(() => enableSwipe(itemId, type), 100);
}






// ✅ Function to Slide Between Photos
function changePhoto(itemId, type, direction) {
  const wrapper = document.getElementById(`photo-wrapper-${type}-${itemId}`);
  const dots = document.querySelectorAll(`#dots-${type}-${itemId} span`);

  if (!wrapper || dots.length === 0) return;

  let index = parseInt(wrapper.getAttribute("data-index")) || 0;
  const photos = wrapper.querySelectorAll(".photo-slide");

  // Update Index Based on Direction
  index += direction;
  if (index < 0) index = photos.length - 1;
  if (index >= photos.length) index = 0;

  wrapper.setAttribute("data-index", index);

  // ✅ Move Wrapper Horizontally
  wrapper.style.transform = `translateX(-${index * 100}%)`;
  wrapper.style.transition = "transform 0.5s ease-in-out"; // Smooth animation

  // ✅ Update Active Dot
  dots.forEach(dot => dot.classList.remove("active"));
  dots[index].classList.add("active");
}

// ✅ Make it Accessible in Global Scope
window.changePhoto = changePhoto;
window.jumpToPhoto = changePhoto;


// ✅ Jump to a Specific Photo (When Clicking Dots)
function jumpToPhoto(itemId, type, index) {
  const wrapper = document.getElementById(`photo-wrapper-${type}-${itemId}`);
  const dots = document.querySelectorAll(`#dots-${type}-${itemId} span`);

  if (!wrapper || !dots.length) return;

  wrapper.style.transform = `translateX(-${index * 100}%)`;
  wrapper.setAttribute("data-index", index);

  // Update active dot
  dots.forEach(dot => dot.classList.remove("active"));
  dots[index].classList.add("active");
}


// ✅ Auto-Initialize Sliding When DOM Loads
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".photo-dots span").forEach(dot => {
      dot.addEventListener("click", function () {
          const itemId = this.closest(".photo-dots").id.split("-")[2];
          const type = this.closest(".photo-dots").id.split("-")[1];
          const index = parseInt(this.getAttribute("data-index"), 10);
          jumpToPhoto(itemId, type, index);
      });
  });
});


// ✅ Make it Accessible in Global Scope
window.jumpToPhoto = jumpToPhoto;






// ✅ Updated Delete Photo Function for Render
async function deletePhoto(itemId, photoUrl, type) {
  showLoader(); // 👈 START
    try {
        // Ensure vendorId is correctly retrieved and not null/undefined
        const vendorId = localStorage.getItem("vendorId") || "default";

        if (!itemId || !photoUrl || !type) {
            alert("❌ Missing required parameters for deleting photo.");
            return;
        }

        // Construct absolute URL (Ensure correct Render API path)
        const apiUrl = `${window.location.origin}/api/delete-photo/${vendorId}/${itemId}/${encodeURIComponent(photoUrl)}`;

        console.log(`🗑️ Deleting photo from: ${apiUrl}`);

        // Send DELETE request
        const response = await fetch(apiUrl, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorMessage = await response.text();
            throw new Error(`Failed to delete photo. Server Response: ${errorMessage}`);
        }

       

        // ✅ Force Refresh the UI after deletion
        updatePhotoSection(itemId, type);
        showToast("🗑️ Photo deleted successfully!");

    } catch (error) {
        console.error("❌ Error deleting photo:", error);
        showToast("Failed to delete photo.");
      } finally {
        hideLoader(); // 👈 END
    }
}

// Expose function globally (if used in inline HTML events)
window.deletePhoto = deletePhoto;


  // Load Project Details
  async function loadProjectDetails() {
    showLoader(); // 👈 START
    try {
      const response = await fetch(`/api/details/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project details.");
      const { project } = await response.json();

      document.getElementById("project-title").textContent = `Project Name: ${project.name}`;
      document.getElementById("project-code").textContent = `Lockbox Code: ${project.code}`;
      document.getElementById("project-status").textContent = `Status: ${project.status || "N/A"}`;
      document.getElementById("project-type").textContent = `Type: ${project.type || "N/A"}`;
      document.getElementById("project-description").textContent = `Description: ${project.description || "No description provided."}`;
      document.getElementById("project-address").textContent = `${project.address?.addressLine1 || "N/A"}, ${project.address?.city || "N/A"}, ${project.address?.state || "N/A"}, ${project.address?.zip || "N/A"}`;
    } catch (error) {
      console.error("Error loading project details:", error);
    } finally {
      hideLoader(); // 👈 END
    }
  }

// ✅ Load Estimate Details (Ensure Photos Load)
async function loadEstimateDetails() {
  if (!estimateId) return;
  showLoader(); // 👈 START
  try {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch estimate details.");
      const { estimate } = await response.json();

      console.log("✅ Loaded Estimate:", estimate); // Debugging

      refreshLineItems(estimate.lineItems);
      document.getElementById("tax-input").value = estimate.tax || 0;
      document.getElementById("estimate-title").value = estimate.title || "";

      // ✅ Ensure photos are displayed correctly
      estimate.lineItems.forEach(category => {
          category.items.forEach(item => {
              updatePhotoSection(item._id, "before");
              updatePhotoSection(item._id, "after");


        // ✅ Enable Swipe for All Photos on Load
           setTimeout(() => {
            enableSwipe(item._id, "before");
            enableSwipe(item._id, "after");
            }, 100);
          });
      });


    // ✅ Update the summary to reflect the latest totals
           updateSummary();

  } catch (error) {
      console.error("❌ Error loading estimate details:", error);
    } finally {
      hideLoader(); // 👈 END
  }
}

// ✅ Refresh Line Items with Photos
function refreshLineItems(categories) {
  const lineItemsContainer = document.getElementById("line-items-cards");
  lineItemsContainer.innerHTML = "";

  categories.forEach(category => {
      const categoryHeader = addCategoryHeader(category);
      category.items.forEach(item => {
          addLineItemCard(item, categoryHeader);

          // ✅ Debugging: Check if photos exist
          console.log("📸 Item Photos Debug:", item);

          // ✅ Ensure photos are displayed
          if (item.photos) {
              updatePhotoSection(item._id, "before");
              updatePhotoSection(item._id, "after");


            // ✅ Ensure swipe is enabled for all items
              enableSwipe(item._id, "before");
              enableSwipe(item._id, "after");
          }
      });
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

    
 // ✅ Scroll to and focus new category
 setTimeout(() => {
  header.scrollIntoView({ behavior: "smooth", block: "center" });
  const editableSpan = header.querySelector("span[contenteditable]");
  if (editableSpan) {
    editableSpan.focus();
    const range = document.createRange();
    range.selectNodeContents(editableSpan);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}, 100);

    return header;
  }

// Add Line Item Card Function
function addLineItemCard(item = {}, categoryHeader = null) {
  const card = document.createElement("div");
  card.classList.add("line-item-card");
  card.setAttribute("data-item-id", item._id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  card.setAttribute("data-assigned-to", item.assignedTo || "");

  const assignedToName = item.assignedTo?.name || "Unassigned";
  const assignedToInitials = item.assignedTo?.name
    ? item.assignedTo.name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : "NA";

  // ✅ Define possible statuses
  const status = item.status || "new";
  const statusClass = getStatusClass(status);

  // Ensure photos object exists
  if (!item.photos) {
    item.photos = { before: [], after: [] };
  }

  card.innerHTML = `
    <div class="card-header">
      <input type="checkbox" class="line-item-select" ${item.assignedTo ? "disabled" : ""}>
      <input type="text" class="item-name" value="${item.name || ""}" placeholder="Item Name">
      <div class="suggestion-box" style="display:none; position:absolute; background:#fff; border:1px solid #ccc; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); max-height:150px; overflow-y:auto; z-index:1000;"></div>
      <button class="btn delete-line-item">Delete</button>
      ${item.assignedTo ? `<button class="btn unassign-item">Unassign</button>` : ""}
    </div>

    <div class="card-details">
 <div class="detail">
  <label>Cost Code</label>
  <input type="text" class="item-cost-code" value="${item.costCode || ''}" placeholder="Cost Code">
</div>

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

                      <div class="detail">
        <label>Labor Cost</label>
        <input type="text" class="item-labor-cost" value="$${((item.quantity || 1) * (item.unitPrice || 0) * 0.37).toFixed(2)}" readonly>
      </div>
    

          <div class="detail">
        <label>Material Cost</label>
        <input type="text" class="item-material-cost" value="$${((item.quantity || 1) * (item.unitPrice || 0) * 0.4).toFixed(2)}" readonly>
      </div>
    </div>



    <div class="photo-section">
      <div class="photo-preview">
        <h5>Before Photos</h5>
        <div id="before-photos-${card.getAttribute("data-item-id")}">
          ${generatePhotoPreview(item.photos.before, card.getAttribute("data-item-id"), "before")}
        </div>
        <label class="upload-btn">
          <input type="file" accept="image/*" multiple onchange="uploadPhoto(event, '${card.getAttribute("data-item-id")}', 'before')">
          +
        </label>
      </div>

      <div class="photo-preview">
        <h5>After Photos</h5>
        <div id="after-photos-${card.getAttribute("data-item-id")}">
          ${generatePhotoPreview(item.photos.after, card.getAttribute("data-item-id"), "after")}
        </div>
        <label class="upload-btn">
          <input type="file" accept="image/*" multiple onchange="uploadPhoto(event, '${card.getAttribute("data-item-id")}', 'after')">
          +
        </label>
      </div>
    </div>

    <div class="status-container">
      <span>Status:<span class="item-status ${statusClass}">${status.toUpperCase()}</span></span>
    </div>

    <div class="card-footer">
      <span>
        Assigned to:
        <span class="vendor-name tooltip-click" data-fullname="${assignedToName}">
          ${assignedToInitials}
        </span>
      </span>
      <span class="item-total">
        $${((item.quantity || 1) * (item.unitPrice || 0)).toFixed(2)}
      </span>
    </div>
  `;
  
// Suggestion Box Logic
const itemNameInput = card.querySelector(".item-name");
const suggestionBox = card.querySelector(".suggestion-box");

itemNameInput.addEventListener("input", () => {
  const value = itemNameInput.value.toLowerCase();
  suggestionBox.innerHTML = "";

  if (!value) return (suggestionBox.style.display = "none");

  const matches = laborCostList.filter(item =>
    item.name.toLowerCase().includes(value)
  );

  if (matches.length === 0) return (suggestionBox.style.display = "none");

  matches.forEach(match => {
    const option = document.createElement("div");
    option.innerHTML = `
    <div style="font-weight:600;">${match.name}</div>
    <div style="font-size: 11px; color: #555; margin-top: 2px;">
      ${match.description || "No description"}
    </div>
    <div style="font-size: 11px; color: #007bff; margin-top: 2px;">
      $${(match.rate || 0).toFixed(2)}
    </div>
  `;
  option.style.padding = "8px";
  option.style.cursor = "pointer";
  option.style.borderBottom = "1px solid #eee";
    option.onmouseenter = () => (option.style.background = "#f0f0f0");
    option.onmouseleave = () => (option.style.background = "#fff");
    option.onclick = () => {
      itemNameInput.value = match.name;
      card.querySelector(".item-description").value = match.description;
      card.querySelector(".item-price").value = match.rate;
      card.querySelector(".item-cost-code").value = match.costCode || "Uncategorized";
      suggestionBox.style.display = "none";
    };
    suggestionBox.appendChild(option);
  });

  const rect = itemNameInput.getBoundingClientRect();
  suggestionBox.style.top = `${itemNameInput.offsetTop + itemNameInput.offsetHeight}px`;
  suggestionBox.style.left = `${itemNameInput.offsetLeft}px`;
  suggestionBox.style.width = `${itemNameInput.offsetWidth}px`;
  suggestionBox.style.display = "block";
  updateSummary();
  updateSelectedLaborCost();

});

// Close suggestion box if clicking outside the input or the box itself
document.addEventListener("click", function handleOutsideClick(e) {
  const isInsideInput = itemNameInput.contains(e.target);
  const isInsideBox = suggestionBox.contains(e.target);

  if (!isInsideInput && !isInsideBox) {
    suggestionBox.style.display = "none";
  }
});



 

// ✅ Enable vendor name 
  document.querySelectorAll(".vendor-name").forEach((el) => {
    el.removeAttribute("title"); // ❌ Remove default tooltip behavior
  
    el.addEventListener("click", function (e) {
      const fullName = el.getAttribute("data-fullname");
  
      // Remove any existing tooltips
      document.querySelectorAll(".custom-tooltip").forEach((tooltip) => tooltip.remove());
  
      // Create new tooltip
      const tooltip = document.createElement("div");
      tooltip.className = "custom-tooltip";
      tooltip.textContent = fullName;
  
      document.body.appendChild(tooltip);
  
      // Position the tooltip near the element
      const rect = el.getBoundingClientRect();
      tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
      tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
  
      // Remove tooltip when tapping elsewhere
      setTimeout(() => tooltip.remove(), 2500); // Auto-hide after 2.5s
  
      e.stopPropagation(); // Prevent event bubbling
    });
  
    // Hide tooltip if tapping outside
    document.addEventListener("click", function () {
      document.querySelectorAll(".custom-tooltip").forEach((tooltip) => tooltip.remove());
    });
  });
   

    // ✅ Enable swipe gestures for newly added items
    setTimeout(() => {
        enableSwipe(card.getAttribute("data-item-id"), "before");
        enableSwipe(card.getAttribute("data-item-id"), "after");
    }, 100);
   
  // Add functionality for the "Unassign" button
  const unassignButton = card.querySelector(".unassign-item");
  if (unassignButton) {
    unassignButton.addEventListener("click", () => unassignItem(card));
  }

  // Delete Line Item
  card.querySelector(".delete-line-item").addEventListener("click", () => {
    card.remove();
    updateSummary();
    updateSelectedLaborCost();

  });

   // Update Item Total on Quantity or Price Change
   const quantityInput = card.querySelector(".item-quantity");
  const priceInput = card.querySelector(".item-price");
  const laborCostInput = card.querySelector(".item-labor-cost");
  const materialCostInput = card.querySelector(".item-material-cost");
  const totalDisplay = card.querySelector(".item-total");
  const checkbox = card.querySelector(".line-item-select");
  checkbox.addEventListener("change", updateSelectedLaborCost);
  
  function updateCardValues() {
    const quantity = parseInt(quantityInput.value, 10) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const total = quantity * price;
    const laborCost = total * 0.37;
    const materialCost = total * 0.4;

    totalDisplay.textContent = `$${total.toFixed(2)}`;
    laborCostInput.value = `$${laborCost.toFixed(2)}`;
    materialCostInput.value = `$${materialCost.toFixed(2)}`;
    updateSelectedLaborCost();

    updateSummary();
  }

  quantityInput.addEventListener("input", updateCardValues);
  priceInput.addEventListener("input", updateCardValues);

  // Append the card to the container
  const lineItemsContainer = document.getElementById("line-items-cards");
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
  

// ✅ Function to Calculate and Display Selected Labor Cost
function updateSelectedLaborCost() {
  const selectedItems = document.querySelectorAll(".line-item-select:checked");
  let totalLaborCost = 0;

  selectedItems.forEach(item => {
    const card = item.closest(".line-item-card");
    const laborCost = parseFloat(card.querySelector(".item-labor-cost").value.replace("$", ""));
    totalLaborCost += isNaN(laborCost) ? 0 : laborCost;
  });

  let floatingLaborCost = document.getElementById("floating-labor-cost");

  if (!floatingLaborCost) {
    floatingLaborCost = document.createElement("div");
    floatingLaborCost.id = "floating-labor-cost";
    floatingLaborCost.style.position = "fixed";
    floatingLaborCost.style.bottom = "20px";
    floatingLaborCost.style.right = "20px";
    floatingLaborCost.style.backgroundColor = "#007bff";
    floatingLaborCost.style.color = "#fff";
    floatingLaborCost.style.padding = "10px 20px";
    floatingLaborCost.style.borderRadius = "6px";
    floatingLaborCost.style.zIndex = "9999";
    document.body.appendChild(floatingLaborCost);
  }

  if (totalLaborCost > 0) {
    floatingLaborCost.style.display = "block";
    floatingLaborCost.textContent = `Selected Labor Cost: $${totalLaborCost.toFixed(2)}`;
  } else {
    floatingLaborCost.style.display = "none";
  }
}

  

  async function assignItemsToVendor() {
    const vendorId = document.getElementById("vendor-select").value;
  
    if (!vendorId) {
      showToast("Please select a vendor.");
      return;
    }
  
    if (!projectId || !estimateId) {
      showToast("Missing project or estimate ID!");
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
  
      // ✅ Calculate Labor Cost (40% of Total)
      const laborCost = total * 0.37;
  
      // ✅ If cost code exists on the card, grab it
      let costCode = card.querySelector(".item-cost-code")?.value.trim() || "Uncategorized";
  
      // 🔥 If cost code is missing, fallback to category name
      if (!costCode || costCode === "Uncategorized") {
        const categoryHeader = card.previousElementSibling?.classList.contains("category-header")
          ? card.previousElementSibling
          : card.closest(".category-header");
        costCode = categoryHeader?.querySelector(".category-title span")?.textContent?.trim() || "Uncategorized";
      }
  
      return {
        itemId,
        name,
        description,
        quantity,
        unitPrice,
        total: laborCost, // ✅ Assign Labor Cost as the new "total"
        assignedTo: vendorId,
        costCode
      };
    });
  
    if (selectedItems.length === 0) {
      showToast("No items selected for assignment.");
      return;
    }
  
    showLoader(); // 👈 START
    try {
      // ✅ Send API Request with cost code included
      const response = await fetch("/api/assign-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, projectId, estimateId, items: selectedItems }),
      });
  
      if (!response.ok) throw new Error("Failed to assign items.");
  
      // ✅ Update UI for assigned items
      selectedItems.forEach((item) => {
        const card = document.querySelector(`.line-item-card[data-item-id="${item.itemId}"]`);
        if (card) {
          card.setAttribute("data-assigned-to", vendorId);
          card.querySelector(".vendor-name").textContent = getVendorInitials(vendorId);
  
          const checkbox = card.querySelector(".line-item-select");
          if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = true;
          }
        }
      });
  
      showToast("✅ Items assigned successfully!");
      updatePage(); // Refresh totals and page
    } catch (error) {
      console.error("❌ Error assigning items:", error);
      showToast("Error assigning items. Please try again.");
    } finally {
      hideLoader();
    }
  }
  



  function getStatusClass(status) {
    switch (status.toLowerCase()) {
        case "pending":
            return "status-pending"; // Gray
        case "in-progress":
            return "status-in-progress"; // Yellow
        case "completed":
            return "status-completed"; // Green
        case "on-hold":
            return "status-on-hold"; // Orange
        case "cancelled":
            return "status-new"; // Red
        default:
            return "status-pending"; // Default to pending
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
    showLoader(); // 👈 START
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
      showToast("Failed to unassign item. Please try again.");
    } finally {
      hideLoader();
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
      const assignedTo = assignedToValue && /^[a-f\d]{24}$/i.test(assignedToValue) ? assignedToValue : undefined;

      const item = {
        _id: element.getAttribute("data-item-id") || undefined,
        type: "item",
        name: element.querySelector(".item-name").value.trim(),
        description: element.querySelector(".item-description").value.trim() || "",
        quantity: parseInt(element.querySelector(".item-quantity").value, 10) || 1,
        unitPrice: parseFloat(element.querySelector(".item-price").value) || 0,
        total: (
          (parseInt(element.querySelector(".item-quantity").value, 10) || 1) *
          (parseFloat(element.querySelector(".item-price").value) || 0)
        ),
        assignedTo,
        costCode: element.querySelector(".item-cost-code")?.value.trim() || "Uncategorized" // ✅ NEW: Capture cost code
      };

      const beforePhotos = Array.from(element.querySelectorAll(".photo-before")).map(img => img.src);
      const afterPhotos = Array.from(element.querySelectorAll(".photo-after")).map(img => img.src);

      if (beforePhotos.length > 0 || afterPhotos.length > 0) {
        item.photos = {
          before: beforePhotos.length > 0 ? beforePhotos : undefined,
          after: afterPhotos.length > 0 ? afterPhotos : undefined,
        };
      }

      if (!item._id || item._id.startsWith("item-")) {
        delete item._id; // Remove temporary IDs
      }

      if (currentCategory) {
        currentCategory.items.push(item);
      } else {
        console.error("Item without a category:", item);
        showToast("Item found without a category. Please add a category before saving.");
      }
    }
  });

  const tax = parseFloat(document.getElementById("tax-input").value) || 0;
  showLoader(); // 👈 START
  try {
    let existingEstimate = null;
    if (estimateId) {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch existing estimate.");
      existingEstimate = await response.json();
    }

    const mergedLineItems = lineItems.map((category) => {
      const existingCategory = existingEstimate?.lineItems?.find((cat) => cat._id === category._id);

      return {
        ...category,
        items: category.items.map((item) => {
          const existingItem = existingCategory?.items?.find((exItem) => exItem._id === item._id);

          return {
            ...existingItem, // Retain all old data
            ...item, // Overwrite with new data
            total: item.quantity * item.unitPrice,
            photos: item.photos ?? existingItem?.photos,
            assignedTo: item.assignedTo || existingItem?.assignedTo,
            costCode: item.costCode || existingItem?.costCode || "Uncategorized" // ✅ Merge or fallback
          };
        }),
      };
    });

    const title = document.getElementById("estimate-title").value.trim();
    const updatedEstimate = { projectId, title, lineItems: mergedLineItems, tax };

    const method = estimateId ? "PUT" : "POST";
    const url = estimateId ? `/api/estimates/${estimateId}` : "/api/estimates";

    const saveResponse = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedEstimate),
    });

    if (!saveResponse.ok) {
      const error = await saveResponse.json();
      throw new Error(error.message || `Failed to ${method === "POST" ? "create" : "update"} estimate.`);
    }

    console.log("🔍 Saving Estimate Data:", JSON.stringify(updatedEstimate, null, 2));

    const result = await saveResponse.json();
    showToast(`Estimate ${method === "POST" ? "created" : "updated"} successfully!`, result);

    if (!estimateId && result.estimate && result.estimate._id) {
      estimateId = result.estimate._id;
      window.history.pushState({}, "", `?projectId=${projectId}&estimateId=${estimateId}`);
    }

    await loadEstimateDetails();
    updatePage();
  } catch (error) {
    console.error("Error saving estimate:", error);
    showToast("Error saving the estimate. Please try again.");
  } finally {
    hideLoader(); // 👈 END
  }
}








function updatePage() {
  // Update the summary totals
  updateSummary();

  // Add any other dynamic UI updates here if necessary
}



  async function loadVendors() {
    showLoader(); // 👈 START
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
    } finally {
      hideLoader(); // 👈 END
    }
  }


   async function exportEstimateToExcel() {
    showLoader(); // 👈 START
    try {
      if (!estimateId) {
        showToast("Please save the estimate before exporting.");
        return;
      }
  
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch estimate.");
      const { estimate } = await response.json();
  
      // Flatten estimate line items
      const rows = [];
      estimate.lineItems.forEach(category => {
        category.items.forEach(item => {
          rows.push({
            Category: category.category,
            costCode: item.costCode,
            Name: item.name,
            Description: item.description,
            Quantity: item.quantity,
            UnitPrice: item.unitPrice,
            Total: item.quantity * item.unitPrice,
            Status: item.status || "N/A",
            AssignedTo: item.assignedTo?.name || "Unassigned"
          });
        });
      });
  
      // Create a worksheet
      const worksheet = XLSX.utils.json_to_sheet(rows);
  
      // Create a workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Estimate");
  
      // Generate Excel file
      const fileName = `${estimate.title?.replace(/\s+/g, "_") || "estimate"}_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      console.log("✅ Estimate exported to Excel");
    } catch (error) {
      console.error("❌ Error exporting to Excel:", error);
      showToast("Failed to export estimate to Excel.");
    } finally {
      hideLoader(); // 👈 END
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


  showLoader(); // global loader ON

  try {
    await loadProjectDetails();
    await loadVendors();
    await loadEstimateDetails();
    await fetchLaborCostList();
  } catch (error) {
    console.error("Initial load failed:", error);
    showToast("⚠️ Failed to load some data");
  } finally {
    hideLoader(); // global loader OFF
  }
  
  



  // Add Event Listeners
  document.getElementById("export-estimate-excel").addEventListener("click", exportEstimateToExcel);
  document.getElementById("add-line-item").addEventListener("click", () => addLineItemCard());
  document.getElementById("add-category-header").addEventListener("click", () => {
    const categoryName = prompt("Enter Room/Area Name:");
    if (categoryName) addCategoryHeader({ category: categoryName });
  });
  document.getElementById("assign-items-button").addEventListener("click", assignItemsToVendor);
  document.getElementById("tax-input").addEventListener("input", updateSummary);
  document.getElementById("save-estimate").addEventListener("click", saveEstimate);
 });

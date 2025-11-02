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

 let isDeletingLineItem = false;

async function fetchLaborCostList() {
  
  try {
    const res = await fetch("/api/labor-costs");
    laborCostList = await res.json();
    // Expose globally for list-view modules defined outside this closure
    try { window.laborCostList = laborCostList; } catch (_) { /* no-op */ }
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

}




// ✅ Open Full-Screen Viewer with Swipe Support
function openPhotoViewer(photoUrl, photosList) {

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


    try {
        // Ensure vendorId is correctly retrieved and not null/undefined
        const vendorId = localStorage.getItem("vendorId") || "default";

        if (!itemId || !photoUrl || !type) {
            alert("❌ Missing required parameters for deleting photo.");
            return;
        }

        // Construct absolute URL (Ensure correct Render API path)
        const apiUrl = `${window.location.origin}/api/delete-photo/${vendorId}/${itemId}/${encodeURIComponent(photoUrl)}`;

        

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
          // Clear loader on error
          if (photoContainer) {
              photoContainer.innerHTML = `<p class="placeholder">Error uploading photos.</p>`;
          }

    }
}

// Expose function globally (if used in inline HTML events)
window.deletePhoto = deletePhoto;
window.expenses = await fetch('/api/expenses?projectId=' + projectId).then(r => r.json()).then(d => d.expenses || []);
window.invoices = await fetch('/api/invoices?projectId=' + projectId).then(r => r.json()).then(d => d.invoices || []);

  // Load Project Details
  async function loadProjectDetails() {
    showLoader(); // 👈 START
    try {
      const response = await fetch(`/api/details/projects/${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch project details.");
      const { project } = await response.json();

      // Gracefully handle missing elements (UI is now compact)
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      // Optional legacy fields (will no-op if not present)
      setText("project-title", `Project Name: ${project.name}`);
      setText("project-code", `Lockbox Code: ${project.code}`);
      setText("project-status", `Status: ${project.status || "N/A"}`);
      setText("project-type", `Type: ${project.type || "N/A"}`);
      setText("project-description", `Description: ${project.description || "No description provided."}`);

      // Address: only show available parts, avoid N/A spam
      const addrParts = [
        project.address?.addressLine1,
        project.address?.city,
        project.address?.state,
        project.address?.zip
      ].filter(Boolean);
      const addressStr = addrParts.join(", ");
      setText("project-address", addressStr);
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

      

      refreshLineItems(estimate.lineItems);
      document.getElementById("tax-input").value = estimate.tax || 0;
      document.getElementById("estimate-title").value = estimate.title || "";

      // ✅ Populate start and end date fields
      const startDateInput = document.getElementById("estimate-start-date");
      const endDateInput = document.getElementById("estimate-end-date");
      if (startDateInput) startDateInput.value = estimate.startDate ? estimate.startDate.substring(0, 10) : "";
      if (endDateInput) endDateInput.value = estimate.endDate ? estimate.endDate.substring(0, 10) : "";

      // ✅ Defer initial photo setup to idle time for faster first paint
      try {
        const onIdle = window.requestIdleCallback || function(cb){ return setTimeout(() => cb({ timeRemaining: () => 0 }), 50); };
        const ids = [];
        estimate.lineItems.forEach(category => { category.items.forEach(item => ids.push(item._id)); });
        let i = 0;
        onIdle(function step(deadline){
          let processed = 0;
          while (i < ids.length && (deadline.timeRemaining ? deadline.timeRemaining() > 8 : processed < 3)) {
            const id = ids[i++];
            try {
              updatePhotoSection(id, 'before');
              updatePhotoSection(id, 'after');
              enableSwipe(id, 'before');
              enableSwipe(id, 'after');
            } catch (_) {}
            processed++;
          }
          if (i < ids.length) onIdle(step);
        });
      } catch (_) {}

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

  const pendingPhotoItems = [];
  categories.forEach(category => {
    const categoryHeader = addCategoryHeader(category);
    category.items.forEach(item => {
      addLineItemCard(item, categoryHeader);
      // Defer photo setup to idle time to speed initial render
      pendingPhotoItems.push(item._id);
    });
  });

  // Update filters after rendering
  populateFilterOptions();
  applyFilters();

  // Utility: schedule work during idle periods
  const onIdle = window.requestIdleCallback || function(cb){ return setTimeout(() => cb({ timeRemaining: () => 0 }), 50); };

  // Batch setup of photos and swipe in idle time to avoid blocking first paint
  try {
    let idx = 0;
    onIdle(function step(deadline){
      // Process a few items per idle period
      let count = 0;
      while (idx < pendingPhotoItems.length && (deadline.timeRemaining ? deadline.timeRemaining() > 8 : count < 3)) {
        const id = pendingPhotoItems[idx++];
        try {
          updatePhotoSection(id, "before");
          updatePhotoSection(id, "after");
          enableSwipe(id, "before");
          enableSwipe(id, "after");
        } catch (_) {}
        count++;
      }
      if (idx < pendingPhotoItems.length) onIdle(step);
    });
  } catch (_) {}

  // Auto-resize textareas after rendering, but do it lazily during idle
  onIdle(() => {
    lineItemsContainer.querySelectorAll('.item-description').forEach(autoResizeTextarea);
  });

  // Focus the first line item's name input (first in DOM, always first in first category)
  const firstItemInput = lineItemsContainer.querySelector('.line-item-card .item-name');
  if (firstItemInput) {
    // Delay focus until idle so it doesn't block paint
    onIdle(() => {
      try {
        firstItemInput.focus();
        if (firstItemInput.select) firstItemInput.select();
        firstItemInput.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_) {}
    });
  }
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
  const categoryName = header.querySelector(".category-title span")?.textContent?.trim() || "this category";
  if (!confirm(`Are you sure you want to remove "${categoryName}" and all its line items? This cannot be undone.`)) {
    return;
  }
      let nextSibling = header.nextSibling;
      while (nextSibling && nextSibling.classList.contains("line-item-card")) {
        const temp = nextSibling.nextSibling;
        nextSibling.remove();
        nextSibling = temp;
      }
      header.remove();
      autoSaveEstimate(); // Auto-save when a category is removed
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

    // ✅ If list view is active, immediately rebuild so the new category appears
    try {
      if (typeof isListViewActive === 'function' && isListViewActive()) {
        // Small delay to ensure DOM is updated before measuring widths
        setTimeout(() => {
          try { if (typeof buildListViewFromCards === 'function') buildListViewFromCards(); } catch(_) {}
          try { if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false); } catch(_) {}
          try { if (typeof syncSeparatedListHeader === 'function') syncSeparatedListHeader(); } catch(_) {}
        }, 50);
      }
    } catch (_) {}

    // ✅ Refresh filter dropdowns and counts to include the new category
    try { if (typeof populateFilterOptions === 'function') populateFilterOptions(); } catch(_) {}
    try { if (typeof updateFilterCounts === 'function') updateFilterCounts(); } catch(_) {}

    return header;
  }


// Add this near the top, after showToast/hideLoader etc.

function autoSaveEstimate() {
  saveEstimate();
  showToast("Auto-saved!");
}
// Expose to global for blur handlers defined outside this scope
try { window.autoSaveEstimate = autoSaveEstimate; } catch (_) {}

// Debounced autosave for card view edits (when user types but doesn't blur)
let __cardAutoSaveTimer = null;
function queueCardAutoSave(delay = 600) {
  try { clearTimeout(__cardAutoSaveTimer); } catch (_) {}
  __cardAutoSaveTimer = setTimeout(() => {
    try { if (typeof autoSaveEstimate === 'function') autoSaveEstimate(); } catch (e) { console.warn('Auto-save (card view) failed', e); }
  }, delay);
}


function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}
// Expose globally so list/card view utilities outside the initial closure can call it
try { window.autoResizeTextarea = autoResizeTextarea; } catch (_) {}


// Add Line Item Card Function
function addLineItemCard(item = {}, categoryHeader = null, insertAfter = null) {
  const card = document.createElement("div");
  card.classList.add("line-item-card");
  card.setAttribute("data-item-id", item._id || `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  card.setAttribute("data-assigned-to", (item.assignedTo && item.assignedTo._id) ? item.assignedTo._id : (typeof item.assignedTo === "string" ? item.assignedTo : ""));

  const assignedToName = item.assignedTo?.name || "Unassigned";
  const assignedToInitials = item.assignedTo?.name
    ? item.assignedTo.name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : "NA";

  // Status dropdown options
  const statusOptions = [
    { value: "in-progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "approved", label: "Approved" },
    { value: "rework", label: "Rework" }
  ];
  const status = item.status || "new";
  const statusClass = getStatusClass(status);

  // Ensure photos object exists
  if (!item.photos) {
    item.photos = { before: [], after: [] };
  }

  // Calculation mode: each, sqft, lnft
  const calcMode = item.calcMode || "each";
  const area = item.area || "";
  const length = item.length || "";
  const quantity = item.quantity || 1;
  const unitPrice = item.unitPrice || 0;

  // Start/End Date values
  const startDateValue = item.startDate ? new Date(item.startDate).toISOString().substring(0, 10) : "";
  const endDateValue = item.endDate ? new Date(item.endDate).toISOString().substring(0, 10) : "";

card.innerHTML = `
  <div class="card-header">
    <input type="checkbox" class="line-item-select" ${item.assignedTo ? "disabled" : ""}>
    <input type="text" class="item-name" value="${item.name || ""}" placeholder="Item Name">
    <div class="suggestion-box" style="display:none; position:absolute; background:#fff; border:1px solid #ccc; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); max-height:350px; overflow-y:auto; z-index:1000;"></div>
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
      <textarea class="item-description" placeholder="Description" style="min-width:350px; overflow:hidden;">${item.description || ""}</textarea>
    </div>
    <div class="detail">
      <label>Calculation Mode</label>
      <select class="item-calc-mode">
        <option value="each" ${calcMode === "each" ? "selected" : ""}>Each</option>
        <option value="sqft" ${calcMode === "sqft" ? "selected" : ""}>Sq Ft</option>
        <option value="lnft" ${calcMode === "lnft" ? "selected" : ""}>Ln Ft</option>
      </select>
    </div>
    <div class="detail sqft-detail" style="display:${calcMode === "sqft" ? "block" : "none"}">
      <label>Area (Sq Ft)</label>
      <input type="number" class="item-area" value="${area}" min="0" step="0.01">
    </div>
    <div class="detail lnft-detail" style="display:${calcMode === "lnft" ? "block" : "none"}">
      <label>Length (Ln Ft)</label>
      <input type="number" class="item-length" value="${length}" min="0" step="0.01">
    </div>
    <div class="detail quantity-detail" style="display:${calcMode === "each" ? "block" : "none"}">
      <label>Quantity</label>
      <input type="number" class="item-quantity" value="${quantity}" min="1" step="1">
    </div>
    <div class="detail">
      <label>Unit Price</label>
      <input type="number" class="item-price" value="${unitPrice}" min="0" step="0.01">
    </div>
    <div class="detail">
      <label>Labor Cost</label>
      <input type="number" class="item-labor-cost" value="${item.laborCost !== undefined ? item.laborCost : 0}" min="0" step="0.01">
      <div class="calc-hint" style="margin-top:6px; font-size:12px; color:#475569; display:flex; align-items:center; gap:8px;">
        <span style="background:#eef2ff; color:#4f46e5; border:1px solid #e0e7ff; padding:2px 8px; border-radius:999px; font-weight:600;">Rate</span>
        <span class="item-labor-rate" style="font-variant-numeric:tabular-nums; color:#111827;">$0.00</span>
      </div>
    </div>
    <div class="detail">
      <label>Material Cost</label>
      <input type="number" class="item-material-cost" value="${item.materialCost !== undefined ? item.materialCost : 0}" min="0" step="0.01">
      <div class="calc-hint" style="margin-top:6px; font-size:12px; color:#475569; display:flex; align-items:center; gap:8px;">
        <span style="background:#ecfeff; color:#0e7490; border:1px solid #cffafe; padding:2px 8px; border-radius:999px; font-weight:600;">Rate</span>
        <span class="item-material-rate" style="font-variant-numeric:tabular-nums; color:#111827;">$0.00</span>
      </div>
    </div>

  </div>
  <!-- Collapsible Photo Section -->
  <div class="photo-toggle-section-modern">
    <button class="toggle-photos-btn-modern">📸 Show Photos</button>
      <span class="photo-count" style="margin-left:10px; font-weight:500; color:#2563eb;">
  ${
    (() => {
      const beforeCount = Array.isArray(item.photos?.before) ? item.photos.before.length : 0;
      const afterCount = Array.isArray(item.photos?.after) ? item.photos.after.length : 0;
      const total = beforeCount + afterCount;
      return `${total} photo${total === 1 ? '' : 's'} (${beforeCount} before, ${afterCount} after)`;
    })()
  }
</span>
    <div class="photo-section-modern" style="display: none;">
      <div class="photo-preview-modern">
        <h5>Before Photos</h5>
        <div id="before-photos-${card.getAttribute("data-item-id")}"></div>
        <label class="upload-btn-modern">
          <input type="file" accept="image/*" multiple onchange="uploadPhoto(event, '${card.getAttribute("data-item-id")}', 'before')">
          <span>＋ Add</span>
        </label>
      </div>
      <div class="photo-preview-modern">
        <h5>After Photos</h5>
        <div id="after-photos-${card.getAttribute("data-item-id")}"></div>
        <label class="upload-btn-modern">
          <input type="file" accept="image/*" multiple onchange="uploadPhoto(event, '${card.getAttribute("data-item-id")}', 'after')">
          <span>＋ Add</span>
        </label>
      </div>
    </div>
  </div>
  <div class="card-footer" style="
    
    border-top: 1px solid #e5e7eb;
    padding: 6px 24px;
    border-radius: 0 0 12px 12px;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.04);
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: center;
    justify-content: space-between;
  ">
    <div class="footer-dates" style="display:flex; gap:18px; align-items:center;">
      <div style="display:flex; flex-direction:column;">
        <label for="start-date-${card.getAttribute("data-item-id")}" style="font-weight:500; color:#2563eb; margin-bottom:2px;">Start Date</label>
        <input type="date" class="item-start-date" id="start-date-${card.getAttribute("data-item-id")}" value="${startDateValue}" style="padding:7px 12px; border-radius:6px; border:1px solid #d1d5db; background:#fff;">
      </div>
      <div style="display:flex; flex-direction:column;">
        <label for="end-date-${card.getAttribute("data-item-id")}" style="font-weight:500; color:#2563eb; margin-bottom:2px;">End Date</label>
        <input type="date" class="item-end-date" id="end-date-${card.getAttribute("data-item-id")}" value="${endDateValue}" style="padding:7px 12px; border-radius:6px; border:1px solid #d1d5db; background:#fff;">
      </div>
    </div>
    <div class="status-assigned-container" style="display:flex; align-items:center; gap:24px;">
      <span>
        Status:
        <select class="item-status-dropdown ${statusClass}" style="margin-left:8px; padding:4px 10px; border-radius:6px; border:1px solid #ccc; font-weight:600;">
          ${statusOptions.map(opt => `<option value="${opt.value}" ${status === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
        </select>
      </span>
      <span>
        Assigned to:
        <span class="vendor-name tooltip-click" data-fullname="${assignedToName}">
          ${assignedToInitials}
        </span>
      </span>
    </div>
    <span class="item-total" style="font-size:1.15em; font-weight:600; color:#2563eb; margin-left:auto;">
      $0.00
    </span>
  </div>
`;

  // Status dropdown handler
  const statusDropdown = card.querySelector(".item-status-dropdown");
  statusDropdown.className = "item-status-dropdown " + getStatusClass(status);

  statusDropdown.addEventListener("change", async function () {
    const newStatus = statusDropdown.value;
    const lineItemId = card.getAttribute("data-item-id");
    const vendorId = card.getAttribute("data-assigned-to");
    const estimateId = new URLSearchParams(window.location.search).get("estimateId");

    // 1. Update estimate line item status
    try {
      const response = await fetch(`/api/estimates/line-items/${lineItemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) {
        showToast("Failed to update estimate status");
        return;
      }
    } catch (err) {
      showToast("Error updating estimate status");
      return;
    }
    // 2. Update vendor assigned item status (if assigned)
    if (vendorId && /^[a-f\d]{24}$/i.test(vendorId)) {
      try {
        const vendorRes = await fetch(`/api/vendors/${vendorId}/update-item-status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: lineItemId,
            status: newStatus,
            estimateId: estimateId
          })
        });
        if (!vendorRes.ok) {
          showToast("Vendor status update failed");
        }
      } catch (err) {
        showToast("Error updating vendor status");
      }
    }
    // Update dropdown color
    const newClass = getStatusClass(newStatus);
    statusDropdown.className = "item-status-dropdown " + newClass;
    showToast("Status updated!");
  });

  // Start/End Date update handlers
  const startDateInput = card.querySelector(".item-start-date");
  const endDateInput = card.querySelector(".item-end-date");
  const lineItemId = card.getAttribute("data-item-id");

  if (startDateInput) {
    startDateInput.addEventListener("change", async () => {
      await fetch(`/api/estimates/line-items/${lineItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: startDateInput.value })
      });
      showToast("Start date updated!");
    });
  }
  if (endDateInput) {
    endDateInput.addEventListener("change", async () => {
      await fetch(`/api/estimates/line-items/${lineItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: endDateInput.value })
      });
      showToast("End date updated!");
    });
  }
  

  // Inside addLineItemCard, after defining laborCostInput and materialCostInput:
  let laborCostFromBackend = item.laborCost !== undefined;
  let materialCostFromBackend = item.materialCost !== undefined;

  
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
    // compute display values
    const laborVal = typeof match.laborCost !== 'undefined' ? parseFloat(match.laborCost) : 0;
    const materialVal = typeof match.materialCost !== 'undefined' ? parseFloat(match.materialCost) : 0;
    const rateVal = typeof match.rate !== 'undefined' ? parseFloat(match.rate) : 0;
    // totalCost field from labor-cost record; if missing, fall back to rate
    const recTotal = typeof match.totalCost !== 'undefined' ? parseFloat(match.totalCost) : rateVal;
    option.innerHTML = `
    <div style="font-weight:600;">${match.name}</div>
    <div style="font-size: 11px; color: #555; margin-top: 2px;">${match.description || "No description"}</div>
    <div style="display:flex; gap:10px; align-items:center; margin-top:6px;">
      
      <div style="font-size:11px; color:#065f46;">Labor: $${laborVal.toFixed(2)}</div>
      <div style="font-size:11px; color:#92400e;">Material: $${materialVal.toFixed(2)}</div>
      <div style="font-size:11px; color:#007bff; font-weight:600;">Rate: $${recTotal.toFixed(2)}</div>
    </div>
  `;
    option.style.padding = "8px";
    option.style.cursor = "pointer";
    option.style.borderBottom = "1px solid #eee";
    option.onmouseenter = () => (option.style.background = "#f0f0f0");
    option.onmouseleave = () => (option.style.background = "#fff");

    option.onclick = () => {
      itemNameInput.value = match.name;
      card.querySelector(".item-description").value = match.description || "";
      // Push the labor-cost record's totalCost as the item price; fall back to rate
      card.querySelector(".item-price").value = (typeof match.totalCost !== 'undefined' ? parseFloat(match.totalCost) : rateVal).toFixed(2);
      card.querySelector(".item-cost-code").value = match.costCode || "Uncategorized";

      // Force quantity to 1 so displayed total equals the pushed price
      const qtyInput = card.querySelector(".item-quantity");
      if (qtyInput) qtyInput.value = 1;

      // If the suggestion contains saved labor/material costs, push those values
      const laborInput = card.querySelector('.item-labor-cost');
      const materialInput = card.querySelector('.item-material-cost');
      // Determine effective quantity for rate calculations
      const modeVal = (card.querySelector('.item-calc-mode')?.value || 'each');
      const effQty = modeVal === 'sqft' ? (parseFloat(card.querySelector('.item-area')?.value) || 0)
                    : modeVal === 'lnft' ? (parseFloat(card.querySelector('.item-length')?.value) || 0)
                    : (parseFloat(card.querySelector('.item-quantity')?.value) || 0);

      if (laborInput) {
        if (typeof match.laborCost !== 'undefined') {
          const laborTotal = parseFloat(match.laborCost) || 0;
          laborInput.value = laborTotal.toFixed(2);
          // Store rate for consistent recompute on qty changes
          const lr = effQty > 0 ? (laborTotal / effQty) : laborTotal;
          laborInput.dataset.rate = String(lr || 0);
          laborCostFromBackend = true;
          laborInput.removeAttribute('data-manual');
        } else {
          laborCostFromBackend = false;
          delete laborInput.dataset.rate;
        }
        laborInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (materialInput) {
        if (typeof match.materialCost !== 'undefined') {
          const materialTotal = parseFloat(match.materialCost) || 0;
          materialInput.value = materialTotal.toFixed(2);
          const mr = effQty > 0 ? (materialTotal / effQty) : materialTotal;
          materialInput.dataset.rate = String(mr || 0);
          materialCostFromBackend = true;
          materialInput.removeAttribute('data-manual');
        } else {
          materialCostFromBackend = false;
          delete materialInput.dataset.rate;
        }
        materialInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      suggestionBox.style.display = "none";
      updateCardValues();
      autoSaveEstimate();
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

  // Collapsible photo section logic
const toggleBtn = card.querySelector('.toggle-photos-btn-modern');
const photoSection = card.querySelector('.photo-section-modern');
  let photosLoaded = false;

  toggleBtn.addEventListener('click', async () => {
    if (photoSection.style.display === "none") {
      photoSection.style.display = "flex";
      toggleBtn.textContent = "Hide Photos";
      if (!photosLoaded) {
        // Load photos only when first opened
        await updatePhotoSection(card.getAttribute("data-item-id"), "before");
        await updatePhotoSection(card.getAttribute("data-item-id"), "after");
        photosLoaded = true;
      }
    } else {
      photoSection.style.display = "none";
      toggleBtn.textContent = "Show Photos";
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
  const assignedTo = card.getAttribute("data-assigned-to");
  if (assignedTo && /^[a-f\d]{24}$/i.test(assignedTo)) {
    showToast("Unassign line item before deleting.");
    return;
  }
  isDeletingLineItem = true;
  try { window.__isDeletingLineItem = true; } catch (_) {}
  // Blur any focused input inside the card to prevent late blur events
  const focused = card.querySelector(":focus");
  if (focused) focused.blur();

  card.remove();
  updateSummary();
  updateSelectedLaborCost();
  setTimeout(() => {
    autoSaveEstimate(); // Auto-save after DOM is updated
    isDeletingLineItem = false;
    try { window.__isDeletingLineItem = false; } catch (_) {}
  }, 50); // Short delay ensures DOM is updated
});



  
  // Calculation logic for total
  const calcModeSelect = card.querySelector(".item-calc-mode");
  const areaInput = card.querySelector(".item-area");
  const lengthInput = card.querySelector(".item-length");
  const quantityInput = card.querySelector(".item-quantity");
  const priceInput = card.querySelector(".item-price");
  const laborCostInput = card.querySelector(".item-labor-cost");
  const materialCostInput = card.querySelector(".item-material-cost");
  const totalDisplay = card.querySelector(".item-total");
  const checkbox = card.querySelector(".line-item-select");
  checkbox.addEventListener("change", updateSelectedLaborCost);

  // Enforce integer-only quantity for 'each' mode
  if (quantityInput) {
    // Prevent typing of non-integer characters when in 'each' mode
    quantityInput.addEventListener('keydown', (e) => {
      if (calcModeSelect.value !== 'each') return;
      if (e.key === '.' || e.key === 'e' || e.key === 'E' || e.key === '-' || e.key === '+') {
        e.preventDefault();
      }
    });
    quantityInput.addEventListener('input', () => {
      if (calcModeSelect.value !== 'each') return;
      const n = parseInt(quantityInput.value || '');
      quantityInput.value = Number.isFinite(n) ? String(Math.max(1, n)) : '';
    });
    quantityInput.addEventListener('blur', () => {
      if (calcModeSelect.value !== 'each') return;
      let n = parseInt(quantityInput.value || '');
      if (!Number.isFinite(n) || n < 1) n = 1;
      quantityInput.value = String(n);
    });
  }

  // UX: auto-clear price on focus if currently zero, so it's ready for a new value
  if (priceInput) {
    priceInput.addEventListener('focus', () => {
      const v = parseFloat(priceInput.value);
      if (isNaN(v) || v === 0) priceInput.value = '';
    });
  }

function updateCardValues() {
  let total = 0;
  const unitPrice = parseFloat(priceInput.value) || 0;
  if (calcModeSelect.value === "sqft") {
    const area = parseFloat(areaInput.value) || 0;
    total = area * unitPrice;
  } else if (calcModeSelect.value === "lnft") {
    const length = parseFloat(lengthInput.value) || 0;
    total = length * unitPrice;
  } else {
    // qty is integer-only in 'each' mode
    const qty = Math.max(1, Math.round(parseFloat(quantityInput.value) || 1));
    total = qty * unitPrice;
  }

  // Treat inputs as TOTALS = rate * effective quantity; show rate under inputs and keep totals synced on qty changes.
  // Determine effective quantity
  let effQty = 0;
  if (calcModeSelect.value === "sqft") {
    effQty = parseFloat(areaInput.value) || 0;
  } else if (calcModeSelect.value === "lnft") {
    effQty = parseFloat(lengthInput.value) || 0;
  } else {
    effQty = parseFloat(quantityInput.value) || 0;
  }

  // LABOR
  const laborRateEl = card.querySelector('.item-labor-rate');
  let laborTotalVal = parseFloat(laborCostInput.value) || 0;
  let laborRate = parseFloat(laborCostInput.dataset.rate || "");
  if (isNaN(laborRate)) laborRate = 0;
  if (effQty > 0) {
    if (document.activeElement === laborCostInput && laborCostInput.dataset.editMode === 'rate') {
      // User is editing RATE directly; keep input value as rate and update stored rate only
      const inputRate = parseFloat(laborCostInput.value) || 0;
      laborCostInput.dataset.rate = String(inputRate);
      laborRate = inputRate;
      // Do NOT change input value here (it's showing rate). Total will be recomputed on blur.
    } else if (document.activeElement === laborCostInput) {
      // User editing TOTAL -> update rate from total/qty
      laborRate = laborTotalVal / effQty;
      laborCostInput.dataset.rate = String(laborRate);
    } else {
      // Qty changed or other field -> recompute total from stored rate
      if (!laborCostInput.dataset.rate && laborTotalVal > 0) {
        laborRate = laborTotalVal / effQty;
        laborCostInput.dataset.rate = String(laborRate);
      }
      if (laborCostInput.dataset.rate) {
        const newTotal = (parseFloat(laborCostInput.dataset.rate) || 0) * effQty;
        if (Math.abs(newTotal - laborTotalVal) > 0.005) {
          laborCostInput.value = newTotal.toFixed(2);
          laborTotalVal = newTotal;
        }
      }
    }
  } else {
    // effQty == 0; don't change total; set default rate if missing
    if (!laborCostInput.dataset.rate && laborTotalVal > 0) {
      laborCostInput.dataset.rate = String(laborTotalVal); // assume qty 1 initially
      laborRate = laborTotalVal;
    }
  }
  if (laborRateEl) laborRateEl.textContent = `$${(parseFloat(laborCostInput.dataset.rate || '0') || 0).toFixed(2)}`;

  // MATERIAL
  const materialRateEl = card.querySelector('.item-material-rate');
  let materialTotalVal = parseFloat(materialCostInput.value) || 0;
  let materialRate = parseFloat(materialCostInput.dataset.rate || "");
  if (isNaN(materialRate)) materialRate = 0;
  if (effQty > 0) {
    if (document.activeElement === materialCostInput && materialCostInput.dataset.editMode === 'rate') {
      const inputRate = parseFloat(materialCostInput.value) || 0;
      materialCostInput.dataset.rate = String(inputRate);
      materialRate = inputRate;
      // Do NOT change input value here (it's showing rate). Total will be recomputed on blur.
    } else if (document.activeElement === materialCostInput) {
      materialRate = materialTotalVal / effQty;
      materialCostInput.dataset.rate = String(materialRate);
    } else {
      if (!materialCostInput.dataset.rate && materialTotalVal > 0) {
        materialRate = materialTotalVal / effQty;
        materialCostInput.dataset.rate = String(materialRate);
      }
      if (materialCostInput.dataset.rate) {
        const newTotal = (parseFloat(materialCostInput.dataset.rate) || 0) * effQty;
        if (Math.abs(newTotal - materialTotalVal) > 0.005) {
          materialCostInput.value = newTotal.toFixed(2);
          materialTotalVal = newTotal;
        }
      }
    }
  } else {
    if (!materialCostInput.dataset.rate && materialTotalVal > 0) {
      materialCostInput.dataset.rate = String(materialTotalVal);
      materialRate = materialTotalVal;
    }
  }
  if (materialRateEl) materialRateEl.textContent = `$${(parseFloat(materialCostInput.dataset.rate || '0') || 0).toFixed(2)}`;

  totalDisplay.textContent = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  updateSelectedLaborCost();
  updateSummary();
}

// Expose so list-view (outside this closure) can call it
try { window.addLineItemCard = addLineItemCard; } catch (_) {}

  // Show/hide fields based on calculation mode
  calcModeSelect.addEventListener("change", () => {
    card.querySelector(".sqft-detail").style.display = calcModeSelect.value === "sqft" ? "block" : "none";
    card.querySelector(".lnft-detail").style.display = calcModeSelect.value === "lnft" ? "block" : "none";
    card.querySelector(".quantity-detail").style.display = calcModeSelect.value === "each" ? "block" : "none";
    updateCardValues();
  });

  [areaInput, lengthInput, quantityInput, priceInput].forEach(input => {
    if (input) input.addEventListener("input", updateCardValues);
  });
  // Also queue a debounced autosave on numeric inputs while typing
  // Note: autosave only on blur; no autosave while typing

  // Recalculate when user edits totals (update rate display and keep totals consistent)
  laborCostInput.addEventListener("input", updateCardValues);
  materialCostInput.addEventListener("input", updateCardValues);

  // Allow editing RATE via focusing the total input
  function getEffQty() {
    if (calcModeSelect.value === "sqft") {
      return parseFloat(areaInput.value) || 0;
    } else if (calcModeSelect.value === "lnft") {
      return parseFloat(lengthInput.value) || 0;
    }
    const q = Math.round(parseFloat(quantityInput.value) || 1);
    return q < 1 ? 1 : q;
  }

  laborCostInput.addEventListener('focus', () => {
    // Capture stable total before we switch to rate view for smart-blur compare
    try { laborCostInput.dataset.smartOrig = String(parseFloat(laborCostInput.value) || 0); } catch (_) {}
    laborCostInput.dataset.editMode = 'rate';
    const effQty = getEffQty();
    let rate = parseFloat(laborCostInput.dataset.rate || '');
    if (isNaN(rate)) {
      const totalVal = parseFloat(laborCostInput.value) || 0;
      rate = effQty > 0 ? (totalVal / effQty) : totalVal;
    }
    laborCostInput.value = (rate || 0).toFixed(2);
    // Auto-clear if zero to ease entering a new value; otherwise select content
    const v = parseFloat(laborCostInput.value);
    if (isNaN(v) || v === 0) {
      laborCostInput.value = '';
    } else {
      setTimeout(() => laborCostInput.select && laborCostInput.select(), 0);
    }
  });

  laborCostInput.addEventListener('blur', () => {
    const effQty = getEffQty();
    const rate = parseFloat(laborCostInput.value) || 0;
    laborCostInput.dataset.rate = String(rate);
    const newTotal = rate * (effQty || 0);
    laborCostInput.dataset.editMode = '';
    laborCostInput.value = newTotal.toFixed(2);
    updateCardValues();
  });

  materialCostInput.addEventListener('focus', () => {
    // Capture stable total before we switch to rate view for smart-blur compare
    try { materialCostInput.dataset.smartOrig = String(parseFloat(materialCostInput.value) || 0); } catch (_) {}
    materialCostInput.dataset.editMode = 'rate';
    const effQty = getEffQty();
    let rate = parseFloat(materialCostInput.dataset.rate || '');
    if (isNaN(rate)) {
      const totalVal = parseFloat(materialCostInput.value) || 0;
      rate = effQty > 0 ? (totalVal / effQty) : totalVal;
    }
    materialCostInput.value = (rate || 0).toFixed(2);
    // Auto-clear if zero to ease entering a new value; otherwise select content
    const v = parseFloat(materialCostInput.value);
    if (isNaN(v) || v === 0) {
      materialCostInput.value = '';
    } else {
      setTimeout(() => materialCostInput.select && materialCostInput.select(), 0);
    }
  });

  materialCostInput.addEventListener('blur', () => {
    const effQty = getEffQty();
    const rate = parseFloat(materialCostInput.value) || 0;
    materialCostInput.dataset.rate = String(rate);
    const newTotal = rate * (effQty || 0);
    materialCostInput.dataset.editMode = '';
    materialCostInput.value = newTotal.toFixed(2);
    updateCardValues();
  });

  // Optional: mark manual edits (not used for logic but kept for compatibility)
  laborCostInput.addEventListener("input", () => {
    laborCostInput.setAttribute("data-manual", "true");
  });
  materialCostInput.addEventListener("input", () => {
    materialCostInput.setAttribute("data-manual", "true");
  });

  // Initialize totals/rates display
  updateCardValues();



// (moved to global scope) smart blur autosave is defined below globally

// In addLineItemCard, replace the previous blur listeners with:
[
    card.querySelector(".item-name"),
    card.querySelector(".item-description"),
    card.querySelector(".item-cost-code"),
    quantityInput,
    priceInput,
    laborCostInput,
    materialCostInput,
    areaInput,
    lengthInput,
    calcModeSelect

  ].forEach(input => addSmartBlurAutoSave(input));

// Bind static fields once
if (!window.__staticAutoSaveBound) {
  try {
    if (typeof addSmartBlurAutoSave === 'function') {
      addSmartBlurAutoSave(document.getElementById("estimate-title"));
      document.querySelectorAll(".category-title span[contenteditable]").forEach(span => addSmartBlurAutoSave(span));
    }
  } catch (_) {}
  window.__staticAutoSaveBound = true;
}




  // Initial calculation
  updateCardValues();

  // Append the card to the container
  const lineItemsContainer = document.getElementById("line-items-cards");
  if (insertAfter && insertAfter.parentNode) {
    insertAfter.parentNode.insertBefore(card, insertAfter.nextSibling);
  } else if (categoryHeader && categoryHeader.nextSibling) {
    categoryHeader.parentNode.insertBefore(card, categoryHeader.nextSibling);
  } else {
    lineItemsContainer.appendChild(card);
  }
      // ✅ Scroll to and focus new line item
setTimeout(() => {
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  const nameInput = card.querySelector(".item-name");
  if (nameInput) {
    nameInput.focus();
    nameInput.select && nameInput.select();
  }
}, 100);
}



  // Update Summary Function
function updateSummary() {
  const lineItems = document.querySelectorAll(".line-item-card");
  let subtotal = 0;
  let totalLabor = 0;
  let totalMaterial = 0;

  lineItems.forEach((card) => {
    // Calculation mode support
    const calcMode = card.querySelector(".item-calc-mode")?.value || "each";
    const price = parseFloat(card.querySelector(".item-price").value) || 0;
    let qty = 0;
    if (calcMode === "sqft") {
      qty = parseFloat(card.querySelector(".item-area")?.value) || 0;
    } else if (calcMode === "lnft") {
      qty = parseFloat(card.querySelector(".item-length")?.value) || 0;
    } else {
      qty = parseFloat(card.querySelector(".item-quantity")?.value) || 0;
    }
    subtotal += qty * price;

    totalLabor += parseFloat(card.querySelector(".item-labor-cost").value) || 0;
    totalMaterial += parseFloat(card.querySelector(".item-material-cost").value) || 0;
  });

  const taxRate = parseFloat(document.getElementById("tax-input").value) || 0;
  const total = subtotal + (subtotal * taxRate) / 100;
  const projectedProfit = total - totalLabor - totalMaterial;

  document.getElementById("subtotal").textContent = `$${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("total").textContent = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("total-labor-cost").textContent = `$${totalLabor.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("total-material-cost").textContent = `$${totalMaterial.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("projected-profit").textContent = `$${projectedProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  // Keep list view in sync if visible (debounced to avoid destroying focused input)
  if (isListViewActive && isListViewActive()) {
    if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
    scheduleListViewRebuild(600);
  }
}
  

// ✅ Function to Calculate and Display Selected Labor Cost
function updateSelectedLaborCost() {
  // Only count checkboxes that are enabled (not assigned)
  const selectedItems = Array.from(document.querySelectorAll(".line-item-select:checked"))
    .filter(cb => !cb.disabled);

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

  // Hide if no assignable items are selected
  if (totalLaborCost > 0 && selectedItems.length > 0) {
    floatingLaborCost.style.display = "block";
    floatingLaborCost.textContent = `Selected Labor Cost: $${totalLaborCost.toFixed(2)}`;
  } else {
    floatingLaborCost.style.display = "none";
  }
}

// Expose for external callers (e.g., list view actions)
try { window.updateSelectedLaborCost = updateSelectedLaborCost; } catch (_) {}

  

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

  // ✅ Check if vendor is already invited to the project
  let vendorIsInvited = false;
  try {
    // Fetch vendor details
    const vendorRes = await fetch(`/api/vendors/${vendorId}`);
    if (vendorRes.ok) {
      const vendor = await vendorRes.json();
      // Check assignedProjects for this project
      vendorIsInvited = Array.isArray(vendor.assignedProjects) &&
        vendor.assignedProjects.some(p => p.projectId?.toString() === projectId);
    }
  } catch (err) {
    console.warn("Error checking vendor invitation:", err);
  }

  // If not invited, send invite first
  if (!vendorIsInvited) {
    try {
      showToast("Inviting vendor to project...");
      const inviteRes = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: [window.vendorMap[vendorId]?.email || ""],
          role: "vendor",
          projectId
        })
      });
      if (!inviteRes.ok) {
        showToast("Failed to invite vendor. Please try again.");
        return;
      }
      showToast("Vendor invited! Proceeding to assign item...");
      // Optionally wait for backend to update vendor assignment
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error("Error sending invite:", err);
      showToast("Error inviting vendor.");
      return;
    }
  }

  const selectedItems = Array.from(document.querySelectorAll(".line-item-select:checked")).map((checkbox) => {
    const card = checkbox.closest(".line-item-card");
    const itemId = card.getAttribute("data-item-id");

    const name = card.querySelector(".item-name").value.trim();
    const description = card.querySelector(".item-description").value.trim() || "No description provided";
    const quantity = parseInt(card.querySelector(".item-quantity").value, 10) || 1;
    const unitPrice = parseFloat(card.querySelector(".item-price").value) || 0;
    const laborCost = parseFloat(card.querySelector(".item-labor-cost").value) || 0;
    const materialCost = parseFloat(card.querySelector(".item-material-cost").value) || 0;
    const calcMode = card.querySelector(".item-calc-mode")?.value || "each"; // <-- Add this line
    const area = parseFloat(card.querySelector(".item-area")?.value) || 0;    // <-- Add this line
    const length = parseFloat(card.querySelector(".item-length")?.value) || 0; // <-- Add this line
    const total = laborCost; // total sent to vendor is now labor cost

    let costCode = card.querySelector(".item-cost-code")?.value.trim() || "Uncategorized";
    if (!costCode || costCode === "Uncategorized") {
      const categoryHeader = card.previousElementSibling?.classList.contains("category-header")
        ? card.previousElementSibling
        : card.closest(".category-header");
      costCode = categoryHeader?.querySelector(".category-title span")?.textContent?.trim() || "Uncategorized";
    }

    const itemObj = {
      itemId,
      name,
      description,
      quantity,
      unitPrice,
      laborCost,
      materialCost,
      calcMode, // <-- Include calculation mode
      area,     // <-- Include area
      length,   // <-- Include length
      total,        // Now total is the labor cost
      assignedTo: vendorId,
      costCode
    };

    return itemObj;
  });

  if (selectedItems.length === 0) {
    showToast("No items selected for assignment.");
    return;
  }

  // Show small loaders on each selected card's Assigned area instead of global loader
  const affectedCards = [];
  try { selectedItems.forEach(it => { const c = document.querySelector(`.line-item-card[data-item-id="${it.itemId}"]`); if (c) affectedCards.push(c); }); } catch (_) {}
  ensureAssignSpinnerStyles();
  affectedCards.forEach(c => { try { setAssignLoading(c, true); } catch (_) {} });
  if (isListViewActive && isListViewActive()) {
    selectedItems.forEach(it => { try { setListAssignedLoading(it.itemId, true); } catch (_) {} });
  }
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
        const vendor = (window.vendorMap && window.vendorMap[vendorId]) || null;
        const vendorFullName = vendor ? vendor.name : 'Assigned';
        const vendorInitials = getVendorInitials(vendorId);
        const vendorEl = card.querySelector(".vendor-name");
        if (vendorEl) {
          vendorEl.textContent = vendorInitials;
          vendorEl.setAttribute('data-fullname', vendorFullName);
        }

        // Disable and uncheck the checkbox
        const checkbox = card.querySelector(".line-item-select");
        if (checkbox) {
          checkbox.checked = false;
          checkbox.disabled = true;
        }

        // If Unassign button doesn't exist, add it
        if (!card.querySelector(".unassign-item")) {
          const unassignBtn = document.createElement("button");
          unassignBtn.className = "btn unassign-item";
          unassignBtn.textContent = "Unassign";
          unassignBtn.addEventListener("click", () => unassignItem(card));
          card.querySelector(".card-header").appendChild(unassignBtn);
        }
      }
    });
    // 👇 Add this line after the forEach block
    updateSelectedLaborCost();

    // Rebuild list view if visible so Assigned column and unassign icon update
    try {
      if (typeof scheduleListViewRebuild === 'function') {
        scheduleListViewRebuild(120);
      } else if (isListViewActive && isListViewActive()) {
        buildListViewFromCards();
        if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
      }
    } catch (_) {}

    showToast("✅ Items assigned successfully!");
    updatePage(); // Refresh totals and page
  } catch (error) {
    console.error("❌ Error assigning items:", error);
    showToast("Error assigning items. Please try again.");
  } finally {
    // Remove small loaders
    affectedCards.forEach(c => { try { setAssignLoading(c, false); } catch (_) {} });
    if (isListViewActive && isListViewActive()) {
      selectedItems.forEach(it => { try { setListAssignedLoading(it.itemId, false); } catch (_) {} });
    }
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

  // Remove the Unassign button
  const unassignBtn = card.querySelector(".unassign-item");
  if (unassignBtn) unassignBtn.remove();

  // If the Assign checkbox is missing, add it back (if needed)
  if (!checkbox) {
    const header = card.querySelector(".card-header");
    const assignCheckbox = document.createElement("input");
    assignCheckbox.type = "checkbox";
    assignCheckbox.className = "line-item-select";
    header.insertBefore(assignCheckbox, header.firstChild);
    assignCheckbox.addEventListener("change", updateSelectedLaborCost);
  }

  // Send API Request to unassign the item (show small loader in assigned area)
  clearVendorAssignment(itemId, card);
}
  
  async function clearVendorAssignment(itemId, card = null) {
    // Small, inline loader instead of global loader
    try { ensureAssignSpinnerStyles(); } catch (_) {}
    if (card) { try { setAssignLoading(card, true); } catch (_) {} }
    if (isListViewActive && isListViewActive()) { try { setListAssignedLoading(itemId, true); } catch (_) {} }
    try {
      const response = await fetch(`/api/clear-vendor-assignment/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to clear vendor assignment.");
      }
  
      
    } catch (error) {
      console.error("Error clearing vendor assignment:", error);
      showToast("Failed to unassign item. Please try again.");
    } finally {
      if (card) { try { setAssignLoading(card, false); } catch (_) {} }
      if (isListViewActive && isListViewActive()) { try { setListAssignedLoading(itemId, false); } catch (_) {} }
    }
  }
  
  
function refreshLineItemCard(updatedItem) {
  // Find the card by data-item-id
  const card = document.querySelector(`.line-item-card[data-item-id="${updatedItem._id}"]`);
  if (!card) return;

  // Update fields (add more as needed)
  card.querySelector(".item-name").value = updatedItem.name || "";
  card.querySelector(".item-description").value = updatedItem.description || "";
  card.querySelector(".item-quantity").value = updatedItem.quantity || 1;
  card.querySelector(".item-price").value = updatedItem.unitPrice || 0;
  card.querySelector(".item-labor-cost").value = updatedItem.laborCost !== undefined ? updatedItem.laborCost : 0;
  card.querySelector(".item-material-cost").value = updatedItem.materialCost !== undefined ? updatedItem.materialCost : 0;
  card.querySelector(".item-cost-code").value = updatedItem.costCode || "";
  card.querySelector(".item-total").textContent = `$${((updatedItem.quantity || 1) * (updatedItem.unitPrice || 0)).toFixed(2)}`;
  // Optionally update status, assignedTo, etc.
  
}



// Save Estimate
async function saveEstimate() {
  const lineItems = [];
  let currentCategory = null;
  let skippedDraftNewItems = false; // Track unnamed brand-new items we intentionally skip

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

      const tmpId = element.getAttribute("data-item-id") || undefined;
      const nameVal = element.querySelector(".item-name").value.trim();

      // Skip brand-new, unnamed items during save to avoid server validation errors
      if ((tmpId && tmpId.startsWith("item-")) && nameVal.length === 0) {
        skippedDraftNewItems = true;
        return; // do not include this draft item in payload
      }

      const item = {
        _id: tmpId,
        type: "item",
        name: nameVal,
        description: element.querySelector(".item-description").value.trim() || "",
        quantity: parseInt(element.querySelector(".item-quantity").value, 10) || 1,
        unitPrice: parseFloat(element.querySelector(".item-price").value) || 0,
        laborCost: parseFloat(element.querySelector(".item-labor-cost").value) || 0,
        materialCost: parseFloat(element.querySelector(".item-material-cost").value) || 0,
        calcMode: element.querySelector(".item-calc-mode")?.value || "each",
        area: parseFloat(element.querySelector(".item-area")?.value) || 0,
        length: parseFloat(element.querySelector(".item-length")?.value) || 0,
        total: (
          (parseInt(element.querySelector(".item-quantity").value, 10) || 1) *
          (parseFloat(element.querySelector(".item-price").value) || 0)
        ),
        assignedTo,
        costCode: element.querySelector(".item-cost-code")?.value.trim() || "Uncategorized"
      };

      // Remove temporary IDs so server can assign proper ObjectIds for new items
      if (!item._id || (typeof item._id === 'string' && item._id.startsWith('item-'))) {
        delete item._id;
      }

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

  // Remove any empty categories to avoid clearing server-side data accidentally
  const cleanedLineItems = lineItems.filter(cat => cat && cat.type === 'category' && Array.isArray(cat.items) && cat.items.length > 0);

  try {
    let existingEstimate = null;
    if (estimateId) {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch existing estimate.");
      const dto = await response.json();
      existingEstimate = dto?.estimate || null; // API returns { success, estimate }
    }

    const mergedLineItems = cleanedLineItems.map((category) => {
      const existingCategory = existingEstimate?.lineItems?.find((cat) => (cat._id?.toString?.() || cat._id) === category._id);

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
            costCode: item.costCode || existingItem?.costCode || "Uncategorized",
            maintenanceRequestId: item.maintenanceRequestId || existingItem?.maintenanceRequestId || null
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
      let serverMsg = '';
      try { const error = await saveResponse.json(); serverMsg = error?.message || ''; } catch (_) {}
      throw new Error(serverMsg || `Failed to ${method === "POST" ? "create" : "update"} estimate.`);
    }

    

  const result = await saveResponse.json();
    // Inform about skipped drafts if any
    if (skippedDraftNewItems) {
      showToast("Note: Unnamed new line items were not saved. Add a name to include them.");
    }
    showToast(`Estimate ${method === "POST" ? "created" : "updated"} successfully!`, result);

    if (!estimateId && result.estimate && result.estimate._id) {
      estimateId = result.estimate._id;
      window.history.pushState({}, "", `?projectId=${projectId}&estimateId=${estimateId}`);
      await loadEstimateDetails(); // For new estimates, load everything
      updatePage();
      return;
    }

  // --- After a successful save, update vendor assignments using DOM values ---
    const patchPromises = [];
    document.querySelectorAll(".line-item-card").forEach(card => {
      const assignedTo = card.getAttribute("data-assigned-to");
      if (assignedTo && /^[a-f\d]{24}$/i.test(assignedTo)) {
        const itemId = card.getAttribute("data-item-id");
        const name = card.querySelector(".item-name").value.trim();
        const description = card.querySelector(".item-description").value.trim() || "";
        const quantity = parseInt(card.querySelector(".item-quantity").value, 10) || 1;
        const unitPrice = parseFloat(card.querySelector(".item-price").value) || 0;
        const laborCost = parseFloat(card.querySelector(".item-labor-cost").value) || 0;
        const materialCost = parseFloat(card.querySelector(".item-material-cost").value) || 0;
        const costCode = card.querySelector(".item-cost-code")?.value.trim() || "Uncategorized";
        const status = "new";
        const photos = undefined;
        const qualityControl = undefined;

        patchPromises.push(
          fetch(`/api/vendors/${assignedTo}/assigned-items/update`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              "Pragma": "no-cache"
            },
body: JSON.stringify({
  projectId: String(projectId),
  estimateId: estimateId ? String(estimateId) : undefined,
  item: {
    itemId: String(itemId),
                name,
                description,
                quantity,
                unitPrice,
                laborCost,
                materialCost,
                total: laborCost, // Always use laborCost as total for vendor
                costCode,
                status,
                photos,
                qualityControl
              }
            })
          }).then(res => {
            if (!res.ok) {
              console.warn("Failed to update assigned item for vendor:", assignedTo, itemId);
            }
            return res.json().catch(() => ({}));
          }).catch(err => {
            console.warn("Failed to update assigned item for vendor:", err);
          })
        );
      }
    });
    await Promise.all(patchPromises);

    // Reconcile only newly added items to avoid refreshing the entire page
    try {
      const tempCards = Array.from(document.querySelectorAll('.line-item-card'))
        .filter(c => (c.getAttribute('data-item-id') || '').startsWith('item-'))
        // Exclude unnamed drafts we skipped
        .filter(c => (c.querySelector('.item-name')?.value?.trim() || '').length > 0);

      if (tempCards.length > 0) {
        // Show small spinners on affected cards
        tempCards.forEach(c => { try { setCardSaving(c, true); } catch (_) {} });

        // Build signatures from current DOM state to match with server response
        const cardSigs = new Map();
        tempCards.forEach(c => {
          const sig = buildCardItemSignature(c);
          if (sig) cardSigs.set(c, sig);
        });

        // Use response estimate if available, else fetch fresh one
        let serverEstimate = (result && result.estimate) ? result.estimate : null;
        if (!serverEstimate || !Array.isArray(serverEstimate.lineItems)) {
          try {
            const fres = await fetch(`/api/estimates/${estimateId}`);
            if (fres.ok) {
              const dto = await fres.json();
              serverEstimate = dto?.estimate || null;
            }
          } catch (_) {}
        }

        if (serverEstimate && Array.isArray(serverEstimate.lineItems)) {
          const serverPool = [];
          serverEstimate.lineItems.forEach(cat => {
            const cn = cat?.category || '';
            (cat?.items || []).forEach(it => {
              serverPool.push({ _id: String(it._id), sig: buildServerItemSignature(cn, it) });
            });
          });
          const used = new Set();
          tempCards.forEach(card => {
            const oldId = card.getAttribute('data-item-id');
            const sig = cardSigs.get(card);
            if (!sig) return;
            let match = serverPool.find(en => !used.has(en._id) && signaturesEqual(sig, en.sig));
            if (!match) {
              match = serverPool.find(en => !used.has(en._id) && en.sig.name === sig.name && en.sig.costCode === sig.costCode);
            }
            if (match) {
              used.add(match._id);
              rewireCardItemId(card, oldId, match._id);
              // Refresh photo sections so inline handlers reference new ids
              try { updatePhotoSection(match._id, 'before'); } catch (_) {}
              try { updatePhotoSection(match._id, 'after'); } catch (_) {}
            }
          });
        }

        // Remove spinners
        tempCards.forEach(c => { try { setCardSaving(c, false); } catch (_) {} });
      }

      // Keep UI totals in sync and lightly refresh list view if visible
      try { updateSummary(); } catch (_) {}
      try { if (isListViewActive && isListViewActive()) scheduleListViewRebuild(300); } catch (_) {}
    } catch (_) {
      // Non-fatal: if reconcile fails silently, leave the page as-is
    }
  } catch (error) {
    console.error("Error saving estimate:", error);
    showToast(`Error saving the estimate${error?.message ? ": " + error.message : ". Please try again."}`);
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
    // Speed up first paint by parallelizing independent loads
    const projectPromise = loadProjectDetails();
    const vendorsPromise = loadVendors();
    const estimatePromise = loadEstimateDetails();
    const laborPromise = fetchLaborCostList(); // suggestions can load in background

    // Ensure estimate and core project details render ASAP
    await Promise.all([projectPromise, estimatePromise]);

    // Build filters and view toggle after core content is on screen
    createFilterUI();

    // When vendors arrive, refresh vendor filter options without blocking UI
    vendorsPromise.then(() => {
      try { if (typeof populateFilterOptions === 'function') populateFilterOptions(); } catch (_) {}
    });

    // Allow remaining background tasks to finish without blocking
    await Promise.allSettled([vendorsPromise, laborPromise]);
  } catch (error) {
    console.error("Initial load failed:", error);
    showToast("⚠️ Failed to load some data");
  } finally {
    hideLoader(); // global loader OFF
  }
  
  
// --- Floating Vendor Select Menu ---
(function() {
  // Create the floating menu HTML and add to body
  const floatingMenu = document.createElement("div");
  floatingMenu.id = "floating-vendor-select";
  floatingMenu.style.display = "none";
  floatingMenu.style.position = "fixed";
  floatingMenu.style.bottom = "80px";
  floatingMenu.style.right = "20px";
  floatingMenu.style.background = "#fff";
  floatingMenu.style.border = "1px solid #ccc";
  floatingMenu.style.borderRadius = "8px";
  floatingMenu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
  floatingMenu.style.padding = "16px";
  floatingMenu.style.zIndex = "10000";
floatingMenu.innerHTML = `
  <label for="floating-vendor-dropdown" style="font-weight:600; margin-bottom:8px; display:block;">Assign to Vendor:</label>
  <select id="floating-vendor-dropdown" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ccc; margin-bottom:16px;"></select>
  <div style="display:flex; gap:10px; justify-content:flex-end;">
    <button id="assign-vendor-btn" class="btn" style="
      background: linear-gradient(90deg, #007bff 60%, #0056b3 100%) !important;
      color: #fff !important;
      border: none !important;
      border-radius: 5px !important;
      padding: 8px 20px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: background 0.2s !important;
      box-shadow: 0 2px 6px rgba(0,0,0,0.07) !important;
    ">Assign</button>
    <button id="cancel-vendor-btn" class="btn" style="
      background: #f3f3f3 !important;
      color: #333 !important;
      border: 1px solid #ccc !important;
      border-radius: 5px !important;
      padding: 8px 20px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: background 0.2s !important;
    ">Cancel</button>
  </div>
`;
  document.body.appendChild(floatingMenu);

  let selectedCardForVendor = null;

  // Show menu when a line-item-select is checked
  document.body.addEventListener("change", function(e) {
    if (e.target.classList.contains("line-item-select")) {
      if (e.target.checked) {
        selectedCardForVendor = e.target.closest(".line-item-card");
        showFloatingVendorSelect();
      }
    }
  });

  function showFloatingVendorSelect() {
    const menu = document.getElementById("floating-vendor-select");
    const dropdown = document.getElementById("floating-vendor-dropdown");
    dropdown.innerHTML = '<option value="">Select a Vendor</option>';
    if (window.vendorMap) {
      Object.values(window.vendorMap).forEach(vendor => {
        const option = document.createElement("option");
        option.value = vendor._id;
        option.textContent = vendor.name;
        dropdown.appendChild(option);
      });
    }
    menu.style.display = "block";
  }

  function hideFloatingVendorSelect() {
    document.getElementById("floating-vendor-select").style.display = "none";
    if (selectedCardForVendor) {
      // Uncheck the checkbox if cancelled
      const checkbox = selectedCardForVendor.querySelector(".line-item-select");
      if (checkbox) checkbox.checked = false;
      selectedCardForVendor = null;
    }
  }

  // Assign vendor when button clicked
document.getElementById("assign-vendor-btn").onclick = async function() {
  const vendorId = document.getElementById("floating-vendor-dropdown").value;
  if (!vendorId) {
    showToast("Please select a vendor.");
    return;
  }
  if (!selectedCardForVendor) return;

  // Set the vendor dropdown to the selected vendor
  document.getElementById("vendor-select").value = vendorId;

  // Check the checkbox for this card (if not already checked)
  const checkbox = selectedCardForVendor.querySelector(".line-item-select");
  if (checkbox) {
    checkbox.checked = true;
  }

  // Call the existing assignItemsToVendor function
  await assignItemsToVendor();

  // Hide the floating menu and reset
  hideFloatingVendorSelect();
};

  document.getElementById("cancel-vendor-btn").onclick = hideFloatingVendorSelect;
})();




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




 // Add this right after the document.addEventListener("DOMContentLoaded", async () => {
// After all your initial variable declarations

// ✅ Create Filter UI - Card View Only
function createFilterUI() {
  const filterContainer = document.createElement('div');
  // Render compact when inline within topbar; class applied just before insert
  filterContainer.className = 'filters-container';
  filterContainer.innerHTML = `
    <div class="filter-panel">
      <div class="filter-header">
        <h3 style="display:flex; align-items:center; gap:10px;">Filters</h3> 
      </div>

      <div class="filter-options">
        <div class="filter-group">
          <label for="filter-item-name">Item Name</label>
          <input type="text" id="filter-item-name" class="filter-input" placeholder="Search by item name">
        </div>
        <div class="filter-group">
          <label for="filter-category">Category</label>
          <select id="filter-category" class="filter-select">
            <option value="">All Categories</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="filter-status">Status</label>
          <select id="filter-status" class="filter-select">
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="approved">Approved</option>
            <option value="rework">Rework</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="filter-vendor">Assigned To</label>
          <select id="filter-vendor" class="filter-select">
            <option value="">All Vendors</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <button id="clear-filters" class="btn-secondary">Clear Filters</button>
         <button id="toggle-view-btn" title="Toggle list/card view" aria-pressed="false" style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#ffffff; cursor:pointer; color:#0f172a; margin-top:11px; font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,0.04); transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease; width:34px; height:34px; padding:0; justify-content:center;">
            <span id="toggle-view-icon" class="tvi-icon" aria-hidden="true" data-mode="card">
              <!-- List icon (shown when in card mode to switch to list) -->
              <svg class="icon-list" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <circle cx="4" cy="6" r="1"></circle>
                <circle cx="4" cy="12" r="1"></circle>
                <circle cx="4" cy="18" r="1"></circle>
              </svg>
              <!-- Grid icon (shown when in list mode to switch to card/grid) -->
              <svg class="icon-grid" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <rect x="3" y="3" width="7" height="7" rx="1" ry="1"></rect>
                <rect x="14" y="3" width="7" height="7" rx="1" ry="1"></rect>
                <rect x="3" y="14" width="7" height="7" rx="1" ry="1"></rect>
                <rect x="14" y="14" width="7" height="7" rx="1" ry="1"></rect>
              </svg>
            </span>
            <span id="toggle-view-label" class="tvi-label sr-only">Toggle View</span>
          </button>
      </div>
    </div>
  `;

  // Prefer placing inside the topbar host if present; fallback to original location
  const topbarHost = document.getElementById('topbar-filters-host');
  if (topbarHost) {
    filterContainer.classList.add('topbar-inline');
    topbarHost.appendChild(filterContainer);
  } else {
    const lineItemsContainer = document.getElementById('line-items-cards');
    if (lineItemsContainer && lineItemsContainer.parentNode) {
      lineItemsContainer.parentNode.insertBefore(filterContainer, lineItemsContainer);
    } else {
      console.error("Line items container not found");
    }
  }

  initializeFilterListeners();
  wireToggleViewButton();
  // Restore last view mode (lazy-init list view only if needed)
  const mode = (localStorage.getItem('estimateViewMode') || 'card');
  if (mode === 'list') {
    showListView();
  } else {
    showCardView();
  }

  // After rendering filters, update sticky offset to actual topbar height
  try { if (typeof updateTopbarHeight === 'function') updateTopbarHeight(); } catch (_) {}
}

// Dynamically set CSS variable for sticky offsets based on actual topbar height
function updateTopbarHeight() {
  // Fixed offset to match sticky top bar height
  document.documentElement.style.setProperty('--topbar-height', `148px`);
}

// Keep the value current on resize (debounced)
let __topbarHeightTimer;
window.addEventListener('resize', () => {
  clearTimeout(__topbarHeightTimer);
  __topbarHeightTimer = setTimeout(() => {
    try { updateTopbarHeight(); } catch(_) {}
  }, 150);
});

// Initialize on DOM ready if possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateTopbarHeight);
} else {
  updateTopbarHeight();
}

// Create the list view container and table scaffold if missing
function ensureListViewContainer() {
  if (document.getElementById('line-items-table-container')) return;
  const cards = document.getElementById('line-items-cards');
  if (!cards || !cards.parentNode) return;
  const container = document.createElement('div');
  container.id = 'line-items-table-container';
  container.style.display = 'none';
  container.style.marginTop = '10px';
  container.innerHTML = `
    <style>
      /* Sticky header handled separately in HTML */
      #line-items-table-container { position: relative; }
      #line-items-table-container > .table-scroll { overflow-x: auto; overflow-y: visible; width: 100%; }
      #line-items-table-container .estimate-table { border-collapse: separate; border-spacing: 0; }
      #line-items-table-container .estimate-table thead { display: none; }

      

      /* List view row hover */
      #line-items-table-container .estimate-table tbody tr:hover {
        background-color: #e4f0fcff; /* slate-50 */
      }
      /* Inputs look consistent */
      #line-items-table-container .estimate-table input,
      #line-items-table-container .estimate-table select {
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 6px 6px;
        outline: none;
      }
      #line-items-table-container .estimate-table input:focus,
      #line-items-table-container .estimate-table select:focus {
        border-color: #93c5fd; /* blue-300 */
        box-shadow: 0 0 0 3px rgba(59,130,246,0.15); /* blue ring */
      }
      /* Delete button styles */
      #line-items-table-container .lv-delete-btn {
        background: #ffffffff; /* red-100 */
        color: #b91c1c;      /* red-700 */
        border: 1px solid #ffffffff; /* red-200 */
        border-radius: 8px;
        padding: 4px 4px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, transform 0.08s ease, box-shadow 0.15s ease;
      }
      #line-items-table-container .lv-delete-btn:hover {
        background: #fecaca; /* red-200 */
        color: #7f1d1d;      /* red-900 */
        box-shadow: 0 1px 6px rgba(0,0,0,0.08);
      }
      #line-items-table-container .lv-delete-btn:active {
        transform: translateY(1px);
      }
      /* Unassign icon button (only shows when assigned) */
      #line-items-table-container .lv-unassign-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px; height: 22px;
        margin-left: 1px;
        border-radius: 999px;
        border: 1px solid #e5e7eb; /* slate-200 */
        background: #ffffff;
        color: #6b7280; /* slate-500 */
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease;
      }
      #line-items-table-container .lv-unassign-btn:hover {
        background: #fee2e2; /* red-100 */
        color: #b91c1c;      /* red-700 */
        box-shadow: 0 1px 6px rgba(0,0,0,0.06);
      }
      #line-items-table-container .lv-unassign-btn:active {
        transform: translateY(1px);
      }
      /* Detail row for per-line collapse */
      #line-items-table-container .lv-detail-row td {
        background: #f9fafb; /* slate-50 */
        padding: 14px 16px;
        border-top: 1px solid #e5e7eb; /* slate-200 */
        border-bottom: 1px solid #e5e7eb; /* slate-200 */
      }
      #line-items-table-container .lv-detail-content {
        display: flex;
        gap: 18px;
        align-items: flex-start;
        flex-wrap: nowrap;
      }
      #line-items-table-container .lv-detail-desc {
        flex: 1 1 320px;
        max-width: 460px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
      }
      #line-items-table-container .lv-detail-desc h5,
      #line-items-table-container .lv-detail-photos h5 {
        margin: 0 0 8px 0;
        font-size: 13px;
        color: #374151; /* slate-700 */
      }
      #line-items-table-container .lv-detail-photos {
        flex: 2 1 640px;
        display: flex;
        gap: 18px;
      }
      #line-items-table-container .lv-thumb-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #line-items-table-container .lv-thumb-row img {
        width: 128px;
        height: 96px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
        background: #fff;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      }
      #line-items-table-container .lv-detail-desc textarea {
        width: 100%;
        min-height: 72px;
        resize: vertical;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 13px;
        color: #111827; /* slate-900 */
        outline: none;
      }
      #line-items-table-container .lv-detail-desc textarea:focus {
        border-color: #93c5fd; /* blue-300 */
        box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
      }
      /* Toggle arrow next to category */
      #line-items-table-container .lv-toggle-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px; height: 24px;
        border: 1px solid #e5e7eb; /* slate-200 */
        background: #ffffff;
        color: #111827; /* slate-900 */
        border-radius: 999px;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        padding: 0;
        transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease;
        margin-right: 0;
      }
      #line-items-table-container .lv-toggle-btn:hover {
        background: #f3f4f6; /* slate-100 */
        box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      }
      #line-items-table-container .lv-cat-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #line-items-table-container .lv-icon-group {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-right: 0px;
      }
      #line-items-table-container .lv-toggle-btn svg {
        transition: transform 0.18s ease;
        transform: rotate(0deg);
        display: block;
      }
      #line-items-table-container .lv-toggle-btn[aria-expanded="true"] svg {
        transform: rotate(90deg);
      }
      /* Add line item button */
      #line-items-table-container .lv-add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px; height: 26px;
        border: 1px solid #e5e7eb; /* slate-200 */
        background: #ffffff;
        color: #727376; /* green-600 */
        border-radius: 999px;
        cursor: pointer;
        font-weight: 700;
        line-height: 1;
        padding: 0;
        transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease, color 0.15s ease;
      }
      #line-items-table-container .lv-add-btn:hover {
        background: #f3f4f6; /* emerald-50 */
        color: #154780ff; /* green-700 */
        box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      }
      #line-items-table-container .lv-add-btn:active { transform: translateY(1px); }
      /* Editable category label */
      #line-items-table-container .lv-cat-label[contenteditable="true"] {
        outline: none;
        border-radius: 6px;
        padding: 2px 4px;
        transition: box-shadow 0.15s ease, background 0.15s ease;
      }
      #line-items-table-container .lv-cat-label[contenteditable="true"]:focus {
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
      }
      /* Status dropdown styling to match card view */
      #line-items-table-container .item-status-dropdown {
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid #d1d5db; /* slate-300 */
        padding: 6px 8px;
        background: #ffffff;
        color: #111827; /* slate-900 */
      }
      #line-items-table-container .item-status-dropdown.status-pending {
        background: #f3f4f6; /* slate-100 */
        border-color: #d1d5db; /* slate-300 */
        color: #374151; /* slate-700 */
      }
      #line-items-table-container .item-status-dropdown.status-in-progress {
        background: #fef3c7; /* amber-100 */
        border-color: #f59e0b; /* amber-500 */
        color: #92400e; /* amber-800 */
      }
      #line-items-table-container .item-status-dropdown.status-completed {
        background: #dcfce7; /* green-100 */
        border-color: #22c55e; /* green-500 */
        color: #065f46; /* emerald-800 */
      }
      #line-items-table-container .item-status-dropdown.status-on-hold {
        background: #ffedd5; /* orange-100 */
        border-color: #f97316; /* orange-500 */
        color: #7c2d12; /* orange-900 */
      }
      #line-items-table-container .item-status-dropdown.status-new {
        background: #fee2e2; /* red-100 */
        border-color: #ef4444; /* red-500 */
        color: #991b1b; /* red-800 */
      }
    </style>
    <div class="table-scroll" style="border:1px solid #e5e7eb; border-radius:8px;">
      <table class="estimate-table" style="width:100%; min-width:1040px; border-collapse:separate; border-spacing:0; table-layout:auto;">
        <!-- No header here; header lives in HTML -->
        <tbody></tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="padding:10px; border-top:1px solid #e5e7eb; text-align:right; font-weight:600;">TOTALS:</td>
            <td style="padding:10px; border-top:1px solid #e5e7eb; text-align:right;">$0.00</td>
            <td style="padding:10px; border-top:1px solid #e5e7eb; text-align:right;">$0.00</td>
            <td style="padding:10px; border-top:1px solid #e5e7eb; text-align:right;">$0.00</td>
            <td colspan="3" style="border-top:1px solid #e5e7eb;"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
  cards.parentNode.insertBefore(container, cards.nextSibling);
}

// Sync the separate HTML header with the body table (widths + horizontal scroll)
function syncSeparatedListHeader() {
  const header = document.getElementById('list-view-header');
  const scroller = document.querySelector('#line-items-table-container .table-scroll');
  const bodyTable = document.querySelector('#line-items-table-container .estimate-table');
  if (!header || !scroller || !bodyTable) return;
  const headerTable = header.querySelector('table');
  if (!headerTable) return;

  // Measure header column widths
  const ths = headerTable.querySelectorAll('thead th');
  if (!ths.length) return;
  const widths = Array.from(ths).map(th => th.offsetWidth);

  // Create/replace colgroups so columns lock to same widths
  const colgroupHTML = widths.map(w => `<col style="width:${w}px">`).join('');
  let hg = headerTable.querySelector('colgroup');
  if (!hg) { hg = document.createElement('colgroup'); headerTable.insertBefore(hg, headerTable.firstChild); }
  hg.innerHTML = colgroupHTML;
  let bg = bodyTable.querySelector('colgroup');
  if (!bg) { bg = document.createElement('colgroup'); bodyTable.insertBefore(bg, bodyTable.firstChild); }
  bg.innerHTML = colgroupHTML;

  // Sync horizontal scroll position
  const inner = header.querySelector('.lvh-inner');
  if (inner) {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
    if (isMobile) {
      // In mobile mode, let the header inner scroll natively and mirror scrollLeft
      inner.style.transform = '';
      try { inner.scrollLeft = scroller.scrollLeft; } catch(_) {}
    } else {
      inner.style.transform = `translateX(${-scroller.scrollLeft}px)`;
    }
  }
}

function initSeparatedListHeader() {
  const header = document.getElementById('list-view-header');
  const scroller = document.querySelector('#line-items-table-container .table-scroll');
  if (!header || !scroller) return;

  syncSeparatedListHeader();
  const inner = header.querySelector('.lvh-inner');
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
  if (isMobile && inner) {
    // Two-way scroll sync for mobile: scrolling header scrolls body and vice-versa
    if (!scroller.__lvhMobileBound) {
      let syncing = false;
      const syncFromScroller = () => {
        if (syncing) return; syncing = true;
        try { inner.scrollLeft = scroller.scrollLeft; } catch(_) {}
        syncing = false;
      };
      const syncFromHeader = () => {
        if (syncing) return; syncing = true;
        try { scroller.scrollLeft = inner.scrollLeft; } catch(_) {}
        syncing = false;
      };
      scroller.addEventListener('scroll', syncFromScroller, { passive: true });
      inner.addEventListener('scroll', syncFromHeader, { passive: true });
      scroller.__lvhMobileBound = true;
      scroller.__lvhMobileSyncFrom = syncFromScroller;
      inner.__lvhMobileSyncFrom = syncFromHeader;
    }
  } else {
    // Desktop/tablet: translate header to mirror scroller X
    if (!scroller.__lvhBound) {
      scroller.addEventListener('scroll', () => {
        const inner2 = header.querySelector('.lvh-inner');
        if (inner2) inner2.style.transform = `translateX(${-scroller.scrollLeft}px)`;
      }, { passive: true });
      scroller.__lvhBound = true;
    }
  }
  if (!window.__lvhResizeBound) {
    window.addEventListener('resize', () => { try { syncSeparatedListHeader(); } catch(_) {} });
    window.__lvhResizeBound = true;
  }
}

// Utility: show/hide the summary panel
function toggleSummaryVisibility(show) {
  // Try to find a shared container holding the summary fields
  const ids = ['subtotal','total','total-labor-cost','total-material-cost','projected-profit'];
  const els = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (els.length === 0) return; // nothing to toggle

  // Find an ancestor of the first element that contains all the others
  let candidate = els[0];
  for (let i = 0; i < 8 && candidate; i++) {
    if (els.every(e => candidate.contains(e))) break;
    candidate = candidate.parentElement;
  }
  let container = candidate && els.every(e => candidate.contains(e)) ? candidate : els[0].parentElement;
  if (!container) return;
  container.style.display = show ? '' : 'none';
}

// Inject spinner keyframes once
function ensureAssignSpinnerStyles() {
  if (document.getElementById('assign-spinner-style')) return;
  const style = document.createElement('style');
  style.id = 'assign-spinner-style';
  style.textContent = `@keyframes assignSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);
}

// Show/hide small loader in a card's Assigned area
function setAssignLoading(card, isLoading) {
  if (!card) return;
  const vendorNameEl = card.querySelector('.vendor-name');
  if (!vendorNameEl || !vendorNameEl.parentElement) return;
  let loader = card.querySelector('.assign-loading');
  if (isLoading) {
    if (!loader) {
      loader = document.createElement('span');
      loader.className = 'assign-loading';
      loader.title = 'Assigning…';
      loader.style.cssText = 'display:inline-block;width:14px;height:14px;margin-left:8px;border:2px solid #cbd5e1;border-top-color:#3b82f6;border-radius:50%;animation:assignSpin .8s linear infinite;vertical-align:middle;';
      vendorNameEl.parentElement.appendChild(loader);
    }
  } else {
    if (loader) loader.remove();
  }
}

// Show/hide small loader in list view Assigned column
function setListAssignedLoading(itemId, isLoading) {
  const row = document.querySelector(`#line-items-table-container tr[data-card-id="${itemId}"]`);
  if (!row) return;
  const cell = row.querySelector('td.lv-assigned');
  if (!cell) return;
  let loader = cell.querySelector('.assign-loading');
  if (isLoading) {
    if (!loader) {
      loader = document.createElement('span');
      loader.className = 'assign-loading';
      loader.title = 'Assigning…';
      loader.style.cssText = 'display:inline-block;width:14px;height:14px;margin-left:8px;border:2px solid #cbd5e1;border-top-color:#3b82f6;border-radius:50%;animation:assignSpin .8s linear infinite;vertical-align:middle;';
      // If there is a wrapper, append spinner to it; else append to cell
      const wrap = cell.firstElementChild && cell.firstElementChild.tagName === 'DIV' ? cell.firstElementChild : cell;
      wrap.appendChild(loader);
    }
  } else {
    if (loader) loader.remove();
  }
}

// Small per-line-item saving spinner next to the item name (card view)
function setCardSaving(card, isSaving) {
  if (!card) return;
  try { ensureAssignSpinnerStyles(); } catch (_) {}
  const header = card.querySelector('.card-header');
  if (!header) return;
  let spinner = card.querySelector('.li-saving');
  if (isSaving) {
    if (!spinner) {
      spinner = document.createElement('span');
      spinner.className = 'li-saving';
      spinner.title = 'Saving…';
      spinner.style.cssText = 'display:inline-block;width:14px;height:14px;margin-left:8px;border:2px solid #cbd5e1;border-top-color:#3b82f6;border-radius:50%;animation:assignSpin .8s linear infinite;vertical-align:middle;';
      const nameInput = header.querySelector('.item-name');
      if (nameInput && nameInput.nextSibling) {
        nameInput.parentNode.insertBefore(spinner, nameInput.nextSibling);
      } else if (nameInput) {
        nameInput.parentNode.appendChild(spinner);
      } else {
        header.appendChild(spinner);
      }
    }
  } else {
    if (spinner) spinner.remove();
  }
}

// Update one card's temporary ID to the real server ID without rebuilding the page
function rewireCardItemId(card, oldId, newId) {
  if (!card || !oldId || !newId || oldId === newId) return;
  card.setAttribute('data-item-id', newId);
  // Update any element IDs containing the old id
  card.querySelectorAll('[id]').forEach(el => {
    const id = el.getAttribute('id');
    if (id && id.indexOf(oldId) !== -1) {
      el.setAttribute('id', id.split(oldId).join(newId));
    }
  });
  // Update label 'for' attributes
  card.querySelectorAll('label[for]').forEach(el => {
    const f = el.getAttribute('for');
    if (f && f.indexOf(oldId) !== -1) {
      el.setAttribute('for', f.split(oldId).join(newId));
    }
  });
  // Update inline handler attributes that reference the old id
  ['onchange','onclick','oninput','onblur'].forEach(attr => {
    card.querySelectorAll(`[${attr}]`).forEach(node => {
      const v = node.getAttribute(attr);
      if (v && v.indexOf(oldId) !== -1) {
        node.setAttribute(attr, v.split(oldId).join(newId));
      }
    });
  });
  // Update list view linkage if present
  try {
    const row = document.querySelector(`#line-items-table-container tr[data-card-id="${oldId}"]`);
    if (row) row.setAttribute('data-card-id', newId);
    const detail = document.querySelector(`#line-items-table-container tr.lv-detail-row[data-for-id="${oldId}"]`);
    if (detail) detail.setAttribute('data-for-id', newId);
  } catch (_) {}
}

// Build a stable signature for a card item for server reconciliation
function buildCardItemSignature(card) {
  if (!card) return null;
  let header = card.previousElementSibling;
  while (header && !header.classList.contains('category-header')) {
    header = header.previousElementSibling;
  }
  const categoryName = header ? (header.querySelector('.category-title span')?.textContent?.trim() || '') : '';
  const name = card.querySelector('.item-name')?.value?.trim() || '';
  const description = card.querySelector('.item-description')?.value?.trim() || '';
  const unitPrice = Number.parseFloat(card.querySelector('.item-price')?.value || '0') || 0;
  const quantity = Number.parseFloat(card.querySelector('.item-quantity')?.value || '1') || 1;
  const calcMode = card.querySelector('.item-calc-mode')?.value || 'each';
  const area = Number.parseFloat(card.querySelector('.item-area')?.value || '0') || 0;
  const length = Number.parseFloat(card.querySelector('.item-length')?.value || '0') || 0;
  const costCode = card.querySelector('.item-cost-code')?.value?.trim() || 'Uncategorized';
  return { categoryName, name, description, unitPrice: +unitPrice.toFixed(2), quantity, calcMode, area: +area.toFixed(2), length: +length.toFixed(2), costCode };
}

// Build a signature for a server-side item using its parent category name
function buildServerItemSignature(categoryName, item) {
  return {
    categoryName: categoryName || '',
    name: (item?.name || '').trim(),
    description: (item?.description || '').trim(),
    unitPrice: +((Number(item?.unitPrice) || 0).toFixed(2)),
    quantity: Number(item?.quantity) || 1,
    calcMode: (item?.calcMode || 'each'),
    area: +((Number(item?.area) || 0).toFixed(2)),
    length: +((Number(item?.length) || 0).toFixed(2)),
    costCode: (item?.costCode || 'Uncategorized')
  };
}

function signaturesEqual(a, b) {
  if (!a || !b) return false;
  return a.categoryName === b.categoryName &&
         a.name === b.name &&
         a.description === b.description &&
         a.unitPrice === b.unitPrice &&
         a.quantity === b.quantity &&
         a.calcMode === b.calcMode &&
         a.area === b.area &&
         a.length === b.length &&
         a.costCode === b.costCode;
}

function wireToggleViewButton() {
  const btn = document.getElementById('toggle-view-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isList = isListViewActive();
    if (isList) {
      showCardView();
      localStorage.setItem('estimateViewMode', 'card');
    } else {
      showListView();
      localStorage.setItem('estimateViewMode', 'list');
    }
    // Reflect pressed state and styling
    const nowList = isListViewActive();
    btn.setAttribute('aria-pressed', nowList ? 'true' : 'false');
    if (nowList) btn.classList.add('is-list'); else btn.classList.remove('is-list');
  });
}

function isListViewActive() {
  const tableContainer = document.getElementById('line-items-table-container');
  return tableContainer && tableContainer.style.display !== 'none';
}

function showCardView() {
  const cards = document.getElementById('line-items-cards');
  const tableContainer = document.getElementById('line-items-table-container');
  const header = document.getElementById('list-view-header');
  if (cards) cards.style.display = '';
  if (tableContainer) tableContainer.style.display = 'none';
  if (header) header.style.display = 'none';
  const icon = document.getElementById('toggle-view-icon');
  const label = document.getElementById('toggle-view-label');
  if (icon) icon.setAttribute('data-mode', 'card');
  if (label) label.textContent = 'List View';
  // Ensure summary box is visible in card view
  try { toggleSummaryVisibility(true); } catch (_) {}
  const btn = document.getElementById('toggle-view-btn');
  if (btn) { btn.setAttribute('aria-pressed','false'); btn.classList.remove('is-list'); }
  // When switching back to card view, auto-resize all visible item description textareas
  try {
    const onIdle = window.requestIdleCallback || function(cb){ return setTimeout(() => cb({ timeRemaining: () => 0 }), 50); };
    onIdle(() => {
      if (!cards) return;
      const areas = cards.querySelectorAll('.item-description');
      areas.forEach((ta) => { try { (window.autoResizeTextarea || autoResizeTextarea)(ta); } catch (_) {} });
    });
  } catch (_) {}
}

function showListView() {
  ensureListViewContainer();
  buildListViewFromCards();
  const cards = document.getElementById('line-items-cards');
  const tableContainer = document.getElementById('line-items-table-container');
  const header = document.getElementById('list-view-header');
  if (cards) cards.style.display = 'none';
  if (tableContainer) tableContainer.style.display = '';
  if (header) header.style.display = '';
  const icon = document.getElementById('toggle-view-icon');
  const label = document.getElementById('toggle-view-label');
  if (icon) icon.setAttribute('data-mode', 'list');
  if (label) label.textContent = 'Card View';
  // Hide summary box in list view
  try { toggleSummaryVisibility(false); } catch (_) {}
  const btn = document.getElementById('toggle-view-btn');
  if (btn) { btn.setAttribute('aria-pressed','true'); btn.classList.add('is-list'); }
  // Update footer totals
  if (typeof updateTableFooterTotals === 'function') {
    updateTableFooterTotals(false);
  }
  try { initSeparatedListHeader(); } catch(_) {}
  try { updateTopbarHeight(); } catch(_) {}
}

// Debounced autosave helper for list-view edits
let __listViewSaveTimer = null;
function queueListAutoSave(delay = 400) {
  try { clearTimeout(__listViewSaveTimer); } catch (_) {}
  __listViewSaveTimer = setTimeout(() => {
    try { if (typeof autoSaveEstimate === 'function') autoSaveEstimate(); } catch (e) { console.warn('Auto-save (list view) failed', e); }
  }, delay);
}

// Debounced list-view rebuild (avoid destroying the input the user is typing into)
let __listViewRebuildTimer = null;
function scheduleListViewRebuild(delay = 600) {
  try { clearTimeout(__listViewRebuildTimer); } catch (_) {}
  __listViewRebuildTimer = setTimeout(() => {
    if (!(isListViewActive && isListViewActive())) return;
    // If the user is actively typing inside the list view, delay rebuild further
    const active = document.activeElement;
    const tableContainer = document.getElementById('line-items-table-container');
    if (active && tableContainer && tableContainer.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.hasAttribute('contenteditable'))) {
      scheduleListViewRebuild(delay); // re-arm until idle
      return;
    }
    try {
      buildListViewFromCards();
      if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
    } catch (e) {
      console.warn('List view rebuild failed', e);
    }
  }, delay);
}

// Render the list-view table headers inside the topbar so they appear as a single sticky section
// (Reverted) Combined header integration removed; using native sticky thead below topbar.

// Build the list-view table rows by reading current card DOM (respects filters)
function buildListViewFromCards() {
  const tbody = document.querySelector('#line-items-table-container .estimate-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const formatter = (n) => `$${(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
  // Helpers for numeric formatting/parsing (inputs show commas; calculations use raw numbers)
  const fmtNum = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseNum = (s) => {
    const v = parseFloat(String(s ?? '').replace(/[$,\s]/g, ''));
    return isNaN(v) ? 0 : v;
  };

  const headers = document.querySelectorAll('.category-header');
  // Use a document fragment to minimize reflows during table construction
  const frag = document.createDocumentFragment();

  headers.forEach(header => {
    // Skip hidden categories
    if (header.style.display === 'none') return;
    const categoryName = header.querySelector('.category-title span')?.textContent?.trim() || '';
    let nextEl = header.nextElementSibling;
    let rowsForThisCategory = 0;
    while (nextEl && !nextEl.classList.contains('category-header')) {
      if (nextEl.classList.contains('line-item-card') && nextEl.style.display !== 'none') {
        const card = nextEl;
        const name = card.querySelector('.item-name')?.value || '';
        const mode = card.querySelector('.item-calc-mode')?.value || 'each';
        const qty = parseFloat(card.querySelector('.item-quantity')?.value) || 0;
        const area = parseFloat(card.querySelector('.item-area')?.value) || 0;
        const length = parseFloat(card.querySelector('.item-length')?.value) || 0;
        const unitPrice = parseFloat(card.querySelector('.item-price')?.value) || 0;
        const laborTotal = parseFloat(card.querySelector('.item-labor-cost')?.value) || 0;
        const materialTotal = parseFloat(card.querySelector('.item-material-cost')?.value) || 0;
        let effQty = 0; let qtyLabel = '';
        if (mode === 'sqft') { effQty = area; qtyLabel = `${effQty} sqft`; }
        else if (mode === 'lnft') { effQty = length; qtyLabel = `${effQty} lnft`; }
        else { effQty = qty; qtyLabel = `${effQty}`; }
        const amount = (effQty * unitPrice) || 0;
        const status = card.querySelector('.item-status-dropdown')?.value || '';
        const assigned = card.getAttribute('data-assigned-to') ? (card.querySelector('.vendor-name')?.getAttribute('data-fullname') || 'Assigned') : 'Unassigned';

        const tr = document.createElement('tr');
        tr.setAttribute('data-card-id', card.getAttribute('data-item-id'));

        // Helpers to find the matching card elements
        const getCardInput = (selector) => card.querySelector(selector);
        const syncAndRebuild = () => {
          // Light-touch: update footer now and schedule a rebuild when user pauses typing
          if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
          scheduleListViewRebuild(600);
        };
        const setAndDispatch = (el, value, eventName='input') => {
          if (!el) return;
          el.value = value;
          const evt = new Event(eventName, { bubbles: true });
          el.dispatchEvent(evt);
        };

        // Select checkbox
  const tdSelect = document.createElement('td');
  tdSelect.style.cssText = 'padding:4px 2px; font-size:15px; border-bottom:1px solid #f1f5f9; width:26px; min-width:26px;';
        const selectCb = document.createElement('input');
        selectCb.type = 'checkbox';
  // Remove default checkbox margins and center compactly
  selectCb.style.display = 'block';
  selectCb.style.margin = '0 auto';
        const cardCb = getCardInput('.line-item-select');
        if (cardCb) {
          selectCb.checked = cardCb.checked;
          selectCb.disabled = cardCb.disabled;
        }
        selectCb.addEventListener('change', () => {
          if (cardCb) {
            cardCb.checked = selectCb.checked;
            cardCb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        tdSelect.appendChild(selectCb);
        tr.appendChild(tdSelect);

  // Category with toggle arrow
  const tdCat = document.createElement('td');
  tdCat.style.cssText = 'padding:4px 0px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:130px;';
  const catWrap = document.createElement('div');
  catWrap.className = 'lv-cat-wrap';
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'lv-toggle-btn';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.title = 'Show details';
  toggleBtn.innerHTML = '<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"></path></svg>';
  const catLabel = document.createElement('span');
  catLabel.className = 'lv-cat-label';
  catLabel.textContent = categoryName;
  catLabel.setAttribute('contenteditable', 'true');
  // Category inline edit behavior
  catLabel.addEventListener('focus', () => {
    catLabel.dataset.orig = catLabel.textContent || '';
    // Select all text for quick overwrite
    try {
      const range = document.createRange();
      range.selectNodeContents(catLabel);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  });
  catLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); catLabel.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); catLabel.textContent = catLabel.dataset.orig || categoryName; catLabel.blur(); }
  });
  catLabel.addEventListener('blur', () => {
    const newName = (catLabel.textContent || '').trim();
    const oldName = catLabel.dataset.orig || '';
    if (!newName) { catLabel.textContent = oldName || categoryName; return; }
    if (newName === oldName) return;
    // Push change to the underlying category header title span
    try {
      const titleSpan = header && header.querySelector('.category-title span');
      if (titleSpan) {
        titleSpan.textContent = newName;
        // Dispatch input so any dependent UI updates run
        titleSpan.dispatchEvent(new Event('input', { bubbles: true }));
        // Trigger autosave explicitly only when modified
        try { if (typeof autoSaveEstimate === 'function') autoSaveEstimate(); } catch (_) {}
      }
      // Refresh filters and list view to reflect updated category name
      try { if (typeof populateFilterOptions === 'function') populateFilterOptions(); } catch (_) {}
      scheduleListViewRebuild(200);
    } catch (e) { console.warn('Failed to update category name from list view', e); }
  });
  // "+" Add line item button for this category
  const addBtn = document.createElement('button');
  addBtn.className = 'lv-add-btn';
  addBtn.type = 'button';
  addBtn.title = 'Add line item to this category';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      // Insert directly below this item's underlying card
      if (window.addLineItemCard) {
        window.addLineItemCard({}, null, card);
      } else if (typeof addLineItemCard === 'function') {
        addLineItemCard({}, null, card);
      }
      // Rebuild list shortly to show the new row; card view handles focus/scroll
      scheduleListViewRebuild(300);
    } catch (err) {
      console.warn('Failed to add line item from list view', err);
    }
  });
  // Group left-side icons together before the label
  const iconGroup = document.createElement('div');
  iconGroup.className = 'lv-icon-group';
  iconGroup.appendChild(toggleBtn);
  iconGroup.appendChild(addBtn);
  catWrap.appendChild(iconGroup);
  catWrap.appendChild(catLabel);
  tdCat.appendChild(catWrap);
  tr.appendChild(tdCat);

        // Item name (editable)
  const tdName = document.createElement('td');
  tdName.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:200px;';
        tdName.style.position = 'relative';
  const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = name;
  nameInput.style.width = '100%';
  nameInput.style.fontSize = '15px';
  nameInput.style.padding = '4px 6px';
        // Suggestion box for list view item names
        const nameSuggest = document.createElement('div');
        nameSuggest.className = 'lv-suggestion-box';
        nameSuggest.style.cssText = 'display:none; position:absolute; left:10px; right:10px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,0.08); max-height:300px; overflow-y:auto; z-index:2000; margin-top:6px;';
        // Prevent input blur while clicking suggestions
        nameSuggest.addEventListener('mousedown', (e) => { e.preventDefault(); });

        function renderNameSuggestionsListView(matches) {
          if (!Array.isArray(matches) || matches.length === 0) {
            nameSuggest.style.display = 'none';
            nameSuggest.innerHTML = '';
            return;
          }
          nameSuggest.innerHTML = '';
          matches.forEach(match => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:8px 10px; border-bottom:1px solid #f3f4f6; cursor:pointer;';
            const laborVal = typeof match.laborCost !== 'undefined' ? parseFloat(match.laborCost) : 0;
            const materialVal = typeof match.materialCost !== 'undefined' ? parseFloat(match.materialCost) : 0;
            const rateVal = typeof match.rate !== 'undefined' ? parseFloat(match.rate) : 0;
            const recTotal = typeof match.totalCost !== 'undefined' ? parseFloat(match.totalCost) : rateVal;
            row.innerHTML = `
              <div style="font-weight:600;">${match.name || ''}</div>
              <div style="font-size:12px; color:#6b7280;">${match.description || 'No description'}</div>
              <div style="display:flex; gap:12px; margin-top:6px; font-size:12px;">
                <span style="color:#065f46;">Labor: $${(laborVal||0).toFixed(2)}</span>
                <span style="color:#92400e;">Material: $${(materialVal||0).toFixed(2)}</span>
                <span style="color:#2563eb; font-weight:600;">Rate: $${(recTotal||0).toFixed(2)}</span>
              </div>
            `;
            row.addEventListener('click', () => {
              // Apply to list input
              nameInput.value = match.name || '';
              // Push to underlying card inputs (no blur yet -> no autosave yet)
              setAndDispatch(getCardInput('.item-name'), nameInput.value, 'input');
              const descEl = getCardInput('.item-description');
              if (descEl) { descEl.value = match.description || ''; descEl.dispatchEvent(new Event('input', { bubbles:true })); }
              const priceEl = getCardInput('.item-price');
              if (priceEl) { priceEl.value = (typeof match.totalCost !== 'undefined' ? parseFloat(match.totalCost) : rateVal).toFixed(2); priceEl.dispatchEvent(new Event('input', { bubbles:true })); }
              const codeEl = getCardInput('.item-cost-code');
              if (codeEl) { codeEl.value = match.costCode || 'Uncategorized'; codeEl.dispatchEvent(new Event('input', { bubbles:true })); }
              const qtyEl = getCardInput('.item-quantity');
              if (qtyEl) { qtyEl.value = 1; qtyEl.dispatchEvent(new Event('input', { bubbles:true })); }
              // Push labor and material totals (and set rates for consistency)
              const laborEl = getCardInput('.item-labor-cost');
              const materialEl = getCardInput('.item-material-cost');
              const modeVal = (modeSelect && modeSelect.value) || 'each';
              const effQtyNow = modeVal === 'sqft' ? (parseFloat(getCardInput('.item-area')?.value) || 0)
                               : modeVal === 'lnft' ? (parseFloat(getCardInput('.item-length')?.value) || 0)
                               : (parseFloat(getCardInput('.item-quantity')?.value) || 0);
              if (laborEl) {
                if (typeof match.laborCost !== 'undefined') {
                  const laborTotal = parseFloat(match.laborCost) || 0;
                  laborEl.value = laborTotal.toFixed(2);
                  // Store rate if possible so quantity changes keep totals consistent
                  const lr = effQtyNow > 0 ? (laborTotal / effQtyNow) : laborTotal;
                  laborEl.dataset.rate = String(lr || 0);
                  laborEl.removeAttribute('data-manual');
                } else {
                  laborEl.value = (parseFloat(laborEl.value) || 0).toFixed(2);
                  delete laborEl.dataset.rate;
                }
                laborEl.dispatchEvent(new Event('input', { bubbles:true }));
              }
              if (materialEl) {
                if (typeof match.materialCost !== 'undefined') {
                  const materialTotal = parseFloat(match.materialCost) || 0;
                  materialEl.value = materialTotal.toFixed(2);
                  const mr = effQtyNow > 0 ? (materialTotal / effQtyNow) : materialTotal;
                  materialEl.dataset.rate = String(mr || 0);
                  materialEl.removeAttribute('data-manual');
                } else {
                  materialEl.value = (parseFloat(materialEl.value) || 0).toFixed(2);
                  delete materialEl.dataset.rate;
                }
                materialEl.dispatchEvent(new Event('input', { bubbles:true }));
              }
              nameSuggest.style.display = 'none';
              // Recompute and update list presentation
              try { if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false); } catch(_) {}
              syncAndRebuild();
            });
            nameSuggest.appendChild(row);
          });
          nameSuggest.style.display = 'block';
        }

        nameInput.addEventListener('focus', () => {
          // Show all suggestions on focus for quick selection
          const list = (Array.isArray(window.laborCostList) ? window.laborCostList : []);
          renderNameSuggestionsListView(list.slice(0, 50));
        });
        nameInput.addEventListener('input', () => {
          const val = (nameInput.value || '').toLowerCase();
          if (!val) {
            nameSuggest.style.display = 'none';
            nameSuggest.innerHTML = '';
            return;
          }
          const list = (Array.isArray(window.laborCostList) ? window.laborCostList : []);
          const matches = list.filter(it => (it.name || '').toLowerCase().includes(val));
          renderNameSuggestionsListView(matches.slice(0, 50));
        });
        nameInput.addEventListener('blur', () => {
          // Hide suggestions after a short delay to allow click
          setTimeout(() => { nameSuggest.style.display = 'none'; }, 120);
        });
        nameInput.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-name');
          nameInput.dataset.orig = cardEl ? (cardEl.value || '') : '';
        });
        nameInput.addEventListener('blur', () => {
          if ((nameInput.dataset.orig || '') !== (nameInput.value || '')) {
            setAndDispatch(getCardInput('.item-name'), nameInput.value, 'blur');
          }
          syncAndRebuild();
          // autosave comes from underlying card blur handler
        });
        tdName.appendChild(nameInput);
        tdName.appendChild(nameSuggest);
        tr.appendChild(tdName);

        // Mode select
  const tdMode = document.createElement('td');
  tdMode.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:70px;';
  const modeSelect = document.createElement('select');
  modeSelect.style.fontSize = '13px';
  modeSelect.style.padding = '4px 6px';
        ['each','sqft','lnft'].forEach(opt => {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt.toUpperCase();
          if (opt === mode) o.selected = true;
          modeSelect.appendChild(o);
        });
        modeSelect.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-calc-mode');
          modeSelect.dataset.orig = cardEl ? (cardEl.value || '') : '';
        });
        modeSelect.addEventListener('change', () => {
          setAndDispatch(getCardInput('.item-calc-mode'), modeSelect.value, 'change');
          // After mode change, the effective qty field changes meaning; rebuild row
          syncAndRebuild();
        });
        // Save when exiting the mode select
        modeSelect.addEventListener('blur', () => {
          if ((modeSelect.dataset.orig || '') !== (modeSelect.value || '')) {
            setAndDispatch(getCardInput('.item-calc-mode'), modeSelect.value, 'blur');
          }
        });
        tdMode.appendChild(modeSelect);
        tr.appendChild(tdMode);

        // Qty/Area/Len input (based on mode)
  const tdQty = document.createElement('td');
  tdQty.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; text-align:right; min-width:72px;';
  const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        if (mode === 'each') { qtyInput.min = '1'; qtyInput.step = '1'; }
        else { qtyInput.min = '0'; qtyInput.step = '0.01'; }
  qtyInput.style.width = '100%'; qtyInput.style.textAlign = 'right';
  qtyInput.style.fontSize = '13px';
  qtyInput.style.padding = '4px 6px';
        qtyInput.value = effQty;
        qtyInput.addEventListener('focus', () => {
          const key = (modeSelect.value === 'sqft') ? '.item-area' : (modeSelect.value === 'lnft' ? '.item-length' : '.item-quantity');
          const cardEl = getCardInput(key);
          qtyInput.dataset.orig = cardEl ? (cardEl.value || '') : '';
        });
        // Block decimal/exponent keys for each mode
        qtyInput.addEventListener('keydown', (e) => {
          if (modeSelect.value === 'each') {
            if (e.key === '.' || e.key === 'e' || e.key === 'E' || e.key === '-' || e.key === '+') {
              e.preventDefault();
            }
          }
        });
        qtyInput.addEventListener('input', () => {
          if (modeSelect.value === 'each') {
            const n = parseInt(qtyInput.value || '');
            qtyInput.value = Number.isFinite(n) ? String(Math.max(1, n)) : '';
          }
          if (modeSelect.value === 'sqft') setAndDispatch(getCardInput('.item-area'), qtyInput.value, 'input');
          else if (modeSelect.value === 'lnft') setAndDispatch(getCardInput('.item-length'), qtyInput.value, 'input');
          else setAndDispatch(getCardInput('.item-quantity'), qtyInput.value, 'input');
          syncAndRebuild();
        });
        // Save when leaving the qty/area/length field
        qtyInput.addEventListener('blur', () => {
          const key = (modeSelect.value === 'sqft') ? '.item-area' : (modeSelect.value === 'lnft' ? '.item-length' : '.item-quantity');
          if ((qtyInput.dataset.orig || '') !== (qtyInput.value || '')) {
            setAndDispatch(getCardInput(key), qtyInput.value, 'blur');
          }
        });
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);

        // Unit price input (with comma formatting on blur)
  const tdUnit = document.createElement('td');
  tdUnit.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; text-align:right; min-width:88px;';
  const unitInput = document.createElement('input');
        unitInput.type = 'text';
  unitInput.style.width = '100%'; unitInput.style.textAlign = 'right';
  unitInput.style.fontSize = '15px';
  unitInput.style.padding = '4px 6px';
        unitInput.value = fmtNum(unitPrice || 0);
        unitInput.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-price');
          unitInput.dataset.orig = cardEl ? (cardEl.value || '') : '';
          // UX: auto-clear when zero to ease entering new value
          // Show raw number (no commas) while editing
          unitInput.value = (parseNum(unitInput.value) || 0).toFixed(2);
          const v = parseFloat(unitInput.value);
          if (isNaN(v) || v === 0) unitInput.value = '';
        });
        unitInput.addEventListener('input', () => {
          // Sanitize to digits and decimal; do not insert commas while typing
          const raw = unitInput.value;
          const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
          if (cleaned !== raw) unitInput.value = cleaned;
          setAndDispatch(getCardInput('.item-price'), String(parseNum(cleaned)), 'input');
          syncAndRebuild();
        });
        unitInput.addEventListener('blur', () => {
          const numeric = parseNum(unitInput.value);
          // Push clean numeric string to the underlying card on blur
          if ((unitInput.dataset.orig || '') !== String(numeric)) {
            setAndDispatch(getCardInput('.item-price'), String(numeric), 'blur');
          }
          // Re-apply comma formatting for display
          unitInput.value = fmtNum(numeric);
        });
        tdUnit.appendChild(unitInput);
        tr.appendChild(tdUnit);

        // Labor total input (comma formatting on initial render and blur; edit rate raw)
  const tdLabor = document.createElement('td');
  tdLabor.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; text-align:right; min-width:100px;';
  const laborInput = document.createElement('input');
        laborInput.type = 'text';
  laborInput.style.width = '100%'; laborInput.style.textAlign = 'right';
  laborInput.style.fontSize = '15px';
  laborInput.style.padding = '4px 6px';
        laborInput.value = fmtNum(laborTotal || 0);
        laborInput.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-labor-cost');
          laborInput.dataset.orig = cardEl ? (cardEl.value || '') : '';
          // Switch to RATE edit mode like card view
          // Compute effective quantity from the underlying card inputs
          const modeVal = (modeSelect && modeSelect.value) || 'each';
          const effQty = modeVal === 'sqft' ? (parseFloat(getCardInput('.item-area')?.value) || 0)
                        : modeVal === 'lnft' ? (parseFloat(getCardInput('.item-length')?.value) || 0)
                        : (parseFloat(getCardInput('.item-quantity')?.value) || 0);
          let rate = parseFloat(cardEl?.dataset.rate || '');
          if (isNaN(rate)) {
            const totalVal = parseFloat(cardEl?.value || '0') || 0;
            rate = effQty > 0 ? (totalVal / effQty) : totalVal;
          }
          laborInput.dataset.editMode = 'rate';
          laborInput.dataset.effQty = String(effQty || 0);
          // Keep originals for smart no-op on unchanged
          laborInput.dataset.lvOrigRate = String(rate || 0);
          laborInput.dataset.lvOrigEffQty = String(effQty || 0);
          laborInput.dataset.lvOrigTotal = String(parseFloat(cardEl?.value || '0') || 0);
          // Show raw rate (no commas) while editing
          laborInput.value = (rate || 0).toFixed(2);
          // If zero, clear to ease typing
          const v = parseFloat(laborInput.value);
          if (isNaN(v) || v === 0) laborInput.value = '';
        });
        // While editing rate in list view, don't push to card until blur
        laborInput.addEventListener('input', () => {
          // No-op: keep footer unchanged until blur for accurate totals, but refresh footer label if desired
          const raw = laborInput.value;
          const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
          if (cleaned !== raw) laborInput.value = cleaned;
        });
        laborInput.addEventListener('blur', () => {
          const cardEl = getCardInput('.item-labor-cost');
          const modeVal = (modeSelect && modeSelect.value) || 'each';
          const effQtyNow = modeVal === 'sqft' ? (parseFloat(getCardInput('.item-area')?.value) || 0)
                           : modeVal === 'lnft' ? (parseFloat(getCardInput('.item-length')?.value) || 0)
                           : (parseFloat(getCardInput('.item-quantity')?.value) || 0);
          const fallbackEff = parseFloat(laborInput.dataset.effQty || '0') || 0;
          const effQty = effQtyNow || fallbackEff;
          const rate = parseNum(laborInput.value) || 0;
          const origRate = parseFloat(laborInput.dataset.lvOrigRate || '0') || 0;
          const origEff = parseFloat(laborInput.dataset.lvOrigEffQty || '0') || 0;
          const origTotal = parseFloat(laborInput.dataset.lvOrigTotal || '0') || 0;
          const nearlyEqual = (a,b) => Math.abs((a||0)-(b||0)) < 0.005;
          const rateChanged = !nearlyEqual(rate, origRate);
          const effChanged = !nearlyEqual(effQty, origEff);
          if (!rateChanged && !effChanged) {
            // No real change: restore original total (with commas) and skip dispatch/autosave
            laborInput.value = fmtNum(origTotal || 0);
            delete laborInput.dataset.editMode;
            return;
          }
          const newTotal = rate * (effQty || 0);
          if (cardEl) {
            cardEl.dataset.rate = String(rate);
            cardEl.dataset.editMode = '';
            cardEl.value = (newTotal || 0).toFixed(2);
            // Only dispatch input so card logic recalculates without reinterpreting as RATE on blur
            setAndDispatch(cardEl, cardEl.value, 'input');
          }
          // Show commas for display post-edit
          laborInput.value = fmtNum(newTotal || 0);
          delete laborInput.dataset.editMode;
          if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
          // Trigger a debounced autosave since we skipped card blur
          try { if (typeof queueListAutoSave === 'function') queueListAutoSave(400); } catch (_) {}
          scheduleListViewRebuild(600);
        });
        tdLabor.appendChild(laborInput);
        tr.appendChild(tdLabor);

        // Material total input (comma formatting on initial render and blur; edit rate raw)
  const tdMaterial = document.createElement('td');
  tdMaterial.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; text-align:right; min-width:92px;';
  const materialInput = document.createElement('input');
        materialInput.type = 'text';
  materialInput.style.width = '100%'; materialInput.style.textAlign = 'right';
  materialInput.style.fontSize = '15px';
  materialInput.style.padding = '4px 6px';
        materialInput.value = fmtNum(materialTotal || 0);
        materialInput.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-material-cost');
          materialInput.dataset.orig = cardEl ? (cardEl.value || '') : '';
          // Switch to RATE edit mode like card view
          const modeVal = (modeSelect && modeSelect.value) || 'each';
          const effQty = modeVal === 'sqft' ? (parseFloat(getCardInput('.item-area')?.value) || 0)
                        : modeVal === 'lnft' ? (parseFloat(getCardInput('.item-length')?.value) || 0)
                        : (parseFloat(getCardInput('.item-quantity')?.value) || 0);
          let rate = parseFloat(cardEl?.dataset.rate || '');
          if (isNaN(rate)) {
            const totalVal = parseFloat(cardEl?.value || '0') || 0;
            rate = effQty > 0 ? (totalVal / effQty) : totalVal;
          }
          materialInput.dataset.editMode = 'rate';
          materialInput.dataset.effQty = String(effQty || 0);
          materialInput.dataset.lvOrigRate = String(rate || 0);
          materialInput.dataset.lvOrigEffQty = String(effQty || 0);
          materialInput.dataset.lvOrigTotal = String(parseFloat(cardEl?.value || '0') || 0);
          // Show raw rate (no commas) while editing
          materialInput.value = (rate || 0).toFixed(2);
          const v = parseFloat(materialInput.value);
          if (isNaN(v) || v === 0) materialInput.value = '';
        });
        // Do not sync to card until blur
        materialInput.addEventListener('input', () => {
          const raw = materialInput.value;
          const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
          if (cleaned !== raw) materialInput.value = cleaned;
        });
        materialInput.addEventListener('blur', () => {
          const cardEl = getCardInput('.item-material-cost');
          const modeVal = (modeSelect && modeSelect.value) || 'each';
          const effQtyNow = modeVal === 'sqft' ? (parseFloat(getCardInput('.item-area')?.value) || 0)
                           : modeVal === 'lnft' ? (parseFloat(getCardInput('.item-length')?.value) || 0)
                           : (parseFloat(getCardInput('.item-quantity')?.value) || 0);
          const fallbackEff = parseFloat(materialInput.dataset.effQty || '0') || 0;
          const effQty = effQtyNow || fallbackEff;
          const rate = parseNum(materialInput.value) || 0;
          const origRate = parseFloat(materialInput.dataset.lvOrigRate || '0') || 0;
          const origEff = parseFloat(materialInput.dataset.lvOrigEffQty || '0') || 0;
          const origTotal = parseFloat(materialInput.dataset.lvOrigTotal || '0') || 0;
          const nearlyEqual = (a,b) => Math.abs((a||0)-(b||0)) < 0.005;
          const rateChanged = !nearlyEqual(rate, origRate);
          const effChanged = !nearlyEqual(effQty, origEff);
          if (!rateChanged && !effChanged) {
            materialInput.value = fmtNum(origTotal || 0);
            delete materialInput.dataset.editMode;
            return;
          }
          const newTotal = rate * (effQty || 0);
          if (cardEl) {
            cardEl.dataset.rate = String(rate);
            cardEl.dataset.editMode = '';
            cardEl.value = (newTotal || 0).toFixed(2);
            setAndDispatch(cardEl, cardEl.value, 'input');
          }
          materialInput.value = fmtNum(newTotal || 0);
          delete materialInput.dataset.editMode;
          if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
          try { if (typeof queueListAutoSave === 'function') queueListAutoSave(400); } catch (_) {}
          scheduleListViewRebuild(600);
        });
        tdMaterial.appendChild(materialInput);
        tr.appendChild(tdMaterial);

        // Amount (computed)
  const tdAmount = document.createElement('td');
  tdAmount.style.cssText = 'padding:4px 0px; font-size:15px; border-bottom:1px solid #f1f5f9; text-align:center; min-width:90px;';
        tdAmount.textContent = formatter(amount);
        tr.appendChild(tdAmount);

        // Status select
  const tdStatus = document.createElement('td');
  tdStatus.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:160px; width:160px;';
  const statusSelect = document.createElement('select');
        statusSelect.style.width = '80%';
        statusSelect.style.boxSizing = 'border-box';
  statusSelect.style.padding = '4px 6px';
  statusSelect.style.fontSize = '13px';
        statusSelect.className = 'item-status-dropdown';
        const statusToClass = (s) => {
          switch ((s || '').toLowerCase()) {
            case 'in-progress': return 'status-in-progress';
            case 'completed': return 'status-completed';
            case 'approved': return 'status-completed'; // match card style
            case 'rework': return 'status-on-hold';
            case 'pending': return 'status-pending';
            case 'cancelled': return 'status-new';
            default: return 'status-pending';
          }
        };
        [
          { value: 'in-progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'approved', label: 'Approved' },
          { value: 'rework', label: 'Rework' }
        ].forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.value; o.textContent = opt.label;
          if ((status || '').toLowerCase() === opt.value) o.selected = true;
          statusSelect.appendChild(o);
        });
        // Apply initial class based on current status
        statusSelect.classList.add(statusToClass(status));
        statusSelect.addEventListener('change', () => {
          statusSelect.className = 'item-status-dropdown ' + statusToClass(statusSelect.value);
          setAndDispatch(getCardInput('.item-status-dropdown'), statusSelect.value, 'change');
          syncAndRebuild();
        });
        tdStatus.appendChild(statusSelect);
        tr.appendChild(tdStatus);

        // Assigned (text + optional unassign icon when assigned)
  const tdAssigned = document.createElement('td');
  tdAssigned.className = 'lv-assigned';
  tdAssigned.style.cssText = 'padding:3px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:140px;';
        if (card.getAttribute('data-assigned-to')) {
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'center';
          wrap.style.gap = '6px';
          const nameSpan = document.createElement('span');
          nameSpan.textContent = assigned;
          const unassignBtn = document.createElement('button');
          unassignBtn.className = 'lv-unassign-btn';
          unassignBtn.title = 'Unassign';
          unassignBtn.setAttribute('aria-label', 'Unassign');
          unassignBtn.textContent = '✕';
          unassignBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Prefer existing card unassign button if present
            const cardBtn = getCardInput('.unassign-item');
            if (cardBtn) {
              cardBtn.click();
            } else if (typeof unassignItem === 'function') {
              unassignItem(card);
            }
            // Rebuild after unassign completes
            setTimeout(() => {
              buildListViewFromCards();
              if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
              if (typeof window.updateSelectedLaborCost === 'function') window.updateSelectedLaborCost();
            }, 150);
          });
          wrap.appendChild(nameSpan);
          wrap.appendChild(unassignBtn);
          tdAssigned.appendChild(wrap);
        } else {
          tdAssigned.textContent = 'Unassigned';
        }
        tr.appendChild(tdAssigned);

        // Actions (Delete)
  const tdActions = document.createElement('td');
  tdActions.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:64px;';
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.className = 'lv-delete-btn';
        delBtn.addEventListener('click', () => {
          const btn = getCardInput('.delete-line-item');
          if (btn) btn.click();
          // Rebuild after deletion
          setTimeout(() => { buildListViewFromCards(); updateTableFooterTotals(false); }, 80);
        });
        tdActions.appendChild(delBtn);
  tr.appendChild(tdActions);

  frag.appendChild(tr);
  rowsForThisCategory++;

        // Row-level collapse toggle: show description and photos horizontally beneath
        const itemId = card.getAttribute('data-item-id');
        const thCount = document.querySelectorAll('#line-items-table-container thead th').length || 12;
        function removeExistingDetailRow() {
          const next = tr.nextElementSibling;
          if (next && next.classList && next.classList.contains('lv-detail-row') && next.getAttribute('data-for-id') === itemId) {
            next.remove();
            return true;
          }
          return false;
        }
        function renderThumbs(imgUrls) {
          if (!Array.isArray(imgUrls) || imgUrls.length === 0) {
            return '<div class="placeholder" style="color:#6b7280; font-size:12px;">No photos</div>';
          }
          const list = imgUrls.map(src => `<img src="${src}" alt="photo">`).join('');
          // Provide an onclick handler via event delegation later
          return `<div class="lv-thumb-row">${list}</div>`;
        }
        function getCardPhotos(type) {
          try {
            const sel = `#${type}-photos-${itemId} img`;
            const imgs = Array.from(card.querySelectorAll(sel));
            return imgs.map(img => img.getAttribute('src')).filter(Boolean);
          } catch (_) { return []; }
        }
        function createDetailRow() {
          const dtr = document.createElement('tr');
          dtr.className = 'lv-detail-row';
          dtr.setAttribute('data-for-id', itemId);
          const td = document.createElement('td');
          td.colSpan = thCount;
          // Gather content
          const description = (getCardInput('.item-description')?.value || '').trim();
          const beforeList = getCardPhotos('before');
          const afterList = getCardPhotos('after');
          // Start/End date current values from card
          const startDateVal = getCardInput('.item-start-date')?.value || '';
          const endDateVal = getCardInput('.item-end-date')?.value || '';
          td.innerHTML = `
            <div class="lv-detail-content">
              <div class="lv-detail-desc">
                <h5>Description</h5>
                <textarea class="lv-detail-desc-textarea" placeholder="No description provided."></textarea>
              </div>
              <div class="lv-detail-dates" style="flex:0 0 150px; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:10px;">
                
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <label style="font-size:12px; color:#374151;">Start Date</label>
                  <input type="date" class="lv-detail-start-date" value="${startDateVal}" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;">
                  <label style="font-size:12px; color:#374151;">End Date</label>
                  <input type="date" class="lv-detail-end-date" value="${endDateVal}" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;">
                </div>
              </div>
              <div class="lv-detail-photos">
                <div style="flex:1 1 0;">
                  <h5>Before Photos</h5>
                  <div class="lv-before" data-type="before">${renderThumbs(beforeList)}</div>
                </div>
                <div style="flex:1 1 0;">
                  <h5>After Photos</h5>
                  <div class="lv-after" data-type="after">${renderThumbs(afterList)}</div>
                </div>
              </div>
            </div>
          `;
          // Wire editable description to underlying card
          const descTa = td.querySelector('.lv-detail-desc-textarea');
          if (descTa) {
            descTa.value = description || '';
            try { if (typeof autoResizeTextarea === 'function') autoResizeTextarea(descTa); } catch (_) {}
            descTa.addEventListener('focus', () => {
              const cardDesc = getCardInput('.item-description');
              descTa.dataset.orig = cardDesc ? (cardDesc.value || '') : '';
            });
            descTa.addEventListener('input', () => {
              const cardDesc = getCardInput('.item-description');
              if (cardDesc) {
                cardDesc.value = descTa.value;
                cardDesc.dispatchEvent(new Event('input', { bubbles:true }));
              }
              try { if (typeof autoResizeTextarea === 'function') autoResizeTextarea(descTa); } catch (_) {}
            });
            descTa.addEventListener('blur', () => {
              const cardDesc = getCardInput('.item-description');
              if (!cardDesc) return;
              const changed = (descTa.dataset.orig || '') !== (descTa.value || '');
              if (changed) {
                cardDesc.dispatchEvent(new Event('blur', { bubbles:true }));
              }
            });
          }
          // Wire start/end dates to underlying card inputs
          const lvStart = td.querySelector('.lv-detail-start-date');
          const lvEnd = td.querySelector('.lv-detail-end-date');
          if (lvStart) {
            lvStart.addEventListener('focus', () => {
              const cardStart = getCardInput('.item-start-date');
              lvStart.dataset.orig = cardStart ? (cardStart.value || '') : '';
            });
            lvStart.addEventListener('change', () => {
              const cardStart = getCardInput('.item-start-date');
              if (cardStart) {
                cardStart.value = lvStart.value;
                // Trigger the card's change handler which persists to server
                cardStart.dispatchEvent(new Event('change', { bubbles:true }));
              }
            });
            lvStart.addEventListener('blur', () => {
              // If user reverted, no-op
              if ((lvStart.dataset.orig || '') === (lvStart.value || '')) return;
              const cardStart = getCardInput('.item-start-date');
              if (cardStart) {
                // Ensure final sync on blur
                if (cardStart.value !== lvStart.value) {
                  cardStart.value = lvStart.value;
                  cardStart.dispatchEvent(new Event('change', { bubbles:true }));
                }
              }
            });
          }
          if (lvEnd) {
            lvEnd.addEventListener('focus', () => {
              const cardEnd = getCardInput('.item-end-date');
              lvEnd.dataset.orig = cardEnd ? (cardEnd.value || '') : '';
            });
            lvEnd.addEventListener('change', () => {
              const cardEnd = getCardInput('.item-end-date');
              if (cardEnd) {
                cardEnd.value = lvEnd.value;
                cardEnd.dispatchEvent(new Event('change', { bubbles:true }));
              }
            });
            lvEnd.addEventListener('blur', () => {
              if ((lvEnd.dataset.orig || '') === (lvEnd.value || '')) return;
              const cardEnd = getCardInput('.item-end-date');
              if (cardEnd) {
                if (cardEnd.value !== lvEnd.value) {
                  cardEnd.value = lvEnd.value;
                  cardEnd.dispatchEvent(new Event('change', { bubbles:true }));
                }
              }
            });
          }
          // Click any thumbnail to open the full-screen viewer
          td.addEventListener('click', (ev) => {
            const img = ev.target && ev.target.tagName === 'IMG' ? ev.target : null;
            if (!img) return;
            const col = img.closest('.lv-before, .lv-after');
            if (!col) return;
            const type = col.classList.contains('lv-before') ? 'before' : 'after';
            const urls = Array.from(col.querySelectorAll('img')).map(i => i.getAttribute('src')).filter(Boolean);
            if (urls.length === 0) return;
            if (typeof openPhotoViewer === 'function') {
              openPhotoViewer(img.getAttribute('src'), urls);
            }
          });
          dtr.appendChild(td);
          return dtr;
        }
        // Toggle detail using arrow button only
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
          if (expanded) {
            // Collapse
            removeExistingDetailRow();
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.title = 'Show details';
            // icon rotates via CSS
          } else {
            // Expand
            const detailRow = createDetailRow();
            tr.parentNode.insertBefore(detailRow, tr.nextSibling);
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.title = 'Hide details';
            // icon rotates via CSS
          }
        });
      }
      nextEl = nextEl.nextElementSibling;
    }

    // If no visible items for this category, render a placeholder row so the category appears
    if (rowsForThisCategory === 0) {
      const ptr = document.createElement('tr');
      ptr.className = 'lv-empty-category';

      // Build 12 columns to match header
      const td0 = document.createElement('td'); // Select
      const tdCat = document.createElement('td'); // Category
      const tdItem = document.createElement('td'); // Item
      const tdMode = document.createElement('td');
      const tdQty = document.createElement('td');
      const tdUnit = document.createElement('td');
      const tdLabor = document.createElement('td');
      const tdMaterial = document.createElement('td');
      const tdAmount = document.createElement('td');
      const tdStatus = document.createElement('td');
      const tdAssigned = document.createElement('td');
      const tdActions = document.createElement('td');

      const base = 'padding:4px 6px; border-bottom:1px solid #f1f5f9; font-size:14px;';
      td0.style.cssText = 'padding:3px 2px; border-bottom:1px solid #f1f5f9; width:26px; min-width:26px;';
      tdCat.style.cssText = base + ' min-width:130px; font-weight:600; color:#0f172a;';
      tdItem.style.cssText = base + ' min-width:200px; color:#6b7280; font-style:italic;';
      tdMode.style.cssText = base + ' min-width:70px;';
      tdQty.style.cssText = base + ' min-width:72px; text-align:right;';
      tdUnit.style.cssText = base + ' min-width:88px; text-align:right;';
      tdLabor.style.cssText = base + ' min-width:100px; text-align:right;';
      tdMaterial.style.cssText = base + ' min-width:92px; text-align:right;';
      tdAmount.style.cssText = base + ' min-width:90px; text-align:center;';
      tdStatus.style.cssText = base + ' min-width:160px; width:160px; text-align:center; color:#9ca3af;';
      tdAssigned.style.cssText = base + ' min-width:140px; color:#9ca3af;';
      tdActions.style.cssText = base + ' min-width:64px; text-align:right;';

      // Build category cell with inline "+" add button (like non-empty rows)
      const catWrap = document.createElement('div');
      catWrap.className = 'lv-cat-wrap';
      const iconGroup = document.createElement('div');
      iconGroup.className = 'lv-icon-group';
      const addBtn = document.createElement('button');
      addBtn.className = 'lv-add-btn';
      addBtn.type = 'button';
      addBtn.title = 'Add line item to this category';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          if (window.addLineItemCard) {
            window.addLineItemCard({}, header);
          } else if (typeof addLineItemCard === 'function') {
            addLineItemCard({}, header);
          }
          setTimeout(() => {
            try { if (typeof buildListViewFromCards === 'function') buildListViewFromCards(); } catch(_) {}
            try { if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false); } catch(_) {}
            try { if (typeof syncSeparatedListHeader === 'function') syncSeparatedListHeader(); } catch(_) {}
          }, 100);
        } catch (err) {
          console.warn('Failed to add line item from empty category placeholder', err);
        }
      });
      iconGroup.appendChild(addBtn);
      const catLabel = document.createElement('span');
      catLabel.className = 'lv-cat-label';
      catLabel.textContent = categoryName || 'Untitled Category';
      catWrap.appendChild(iconGroup);
      catWrap.appendChild(catLabel);
      tdCat.appendChild(catWrap);

      tdItem.textContent = 'No items yet';

      [td0, tdCat, tdItem, tdMode, tdQty, tdUnit, tdLabor, tdMaterial, tdAmount, tdStatus, tdAssigned, tdActions]
        .forEach(td => ptr.appendChild(td));
      frag.appendChild(ptr);
    }
  });

  // Commit rows to the DOM in a single operation
  tbody.appendChild(frag);
    try { syncSeparatedListHeader(); } catch(_) {}
}

// ✅ Initialize filter event listeners
function initializeFilterListeners() {
  const itemNameFilter = document.getElementById('filter-item-name');
  const categoryFilter = document.getElementById('filter-category');
  const statusFilter = document.getElementById('filter-status');
  const vendorFilter = document.getElementById('filter-vendor');
  const clearFiltersButton = document.getElementById('clear-filters');

  if (!itemNameFilter || !categoryFilter || !statusFilter || !vendorFilter || !clearFiltersButton) {
    console.error("Filter elements not found");
    return;
  }

  // Populate filter dropdowns
  populateFilterOptions();

  // Add event listeners to filter controls
  [itemNameFilter, categoryFilter, statusFilter, vendorFilter].forEach(filter => {
    filter.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
  });

  // Clear filters button
  clearFiltersButton.addEventListener('click', clearFilters);
}

// ✅ Populate filter options dynamically
function populateFilterOptions() {
  // Get category filter dropdown
  const categorySelect = document.getElementById('filter-category');
  if (!categorySelect) return;
  
  // Clear existing options except the first one (All Categories)
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }
  
  // Get unique categories from DOM
  const categories = new Set();
  document.querySelectorAll('.category-header .category-title span').forEach(el => {
    if (el && el.textContent) {
      categories.add(el.textContent.trim());
    }
  });
  
  // Add category options
  categories.forEach(category => {
    if (category) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    }
  });
  
  // Get vendor filter dropdown
  const vendorSelect = document.getElementById('filter-vendor');
  if (!vendorSelect) return;
  
  // Clear existing options except the first two (All Vendors, Unassigned)
  while (vendorSelect.options.length > 2) {
    vendorSelect.remove(2);
  }
  
  // Populate vendor filter from vendorMap
  if (window.vendorMap) {
    Object.values(window.vendorMap).forEach(vendor => {
      if (vendor && vendor._id && vendor.name) {
        const option = document.createElement('option');
        option.value = vendor._id;
        option.textContent = vendor.name;
        vendorSelect.appendChild(option);
      }
    });
  }
}

// ✅ Apply filters to line items - Card View Only
function applyFilters() {
  const categoryValue = document.getElementById('filter-category')?.value || '';
  const statusValue = document.getElementById('filter-status')?.value || '';
  const vendorValue = document.getElementById('filter-vendor')?.value || '';
  
  // Apply filters to cards
  applyCardViewFilters(categoryValue, statusValue, vendorValue);
  
  // Update counts
  updateFilterCounts();
}

// ✅ Apply filters to card view
function applyCardViewFilters(categoryValue, statusValue, vendorValue) {
  const itemNameValue = document.getElementById('filter-item-name')?.value.trim().toLowerCase() || '';
  let visibleCount = 0;
  let hiddenCount = 0;

  const cards = document.querySelectorAll('.line-item-card');
  cards.forEach(card => {
    // Get the category for this card
    let categoryHeader = card.previousElementSibling;
    while (categoryHeader && !categoryHeader.classList.contains('category-header')) {
      categoryHeader = categoryHeader.previousElementSibling;
    }

    // Get category name
    const cardCategory = categoryHeader ?
      categoryHeader.querySelector('.category-title span')?.textContent?.trim() || '' : '';

// Get item status from the dropdown value
const statusDropdown = card.querySelector('.item-status-dropdown');
const cardStatus = statusDropdown ? statusDropdown.value.toLowerCase() : 'new';

    // Get assigned vendor
    const assignedTo = card.getAttribute('data-assigned-to') || '';
    const isAssigned = assignedTo && assignedTo !== '';

    // Get item name
    const itemName = card.querySelector('.item-name')?.value.trim().toLowerCase() || '';

    // Check if card matches all active filters
    const matchesItemName = !itemNameValue || itemName.includes(itemNameValue);
    const matchesCategory = !categoryValue || cardCategory === categoryValue;
    const matchesStatus = !statusValue || cardStatus.includes(statusValue.toLowerCase());
    const matchesVendor = !vendorValue ||
      (vendorValue === 'unassigned' && !isAssigned) ||
      (isAssigned && assignedTo === vendorValue);

    // Show or hide based on filter matches
    if (matchesItemName && matchesCategory && matchesStatus && matchesVendor) {
      card.style.display = '';
      visibleCount++;
    } else {
      card.style.display = 'none';
      hiddenCount++;
    }
  });

  // Now handle category headers - only show if they have visible cards
  const categoryHeaders = document.querySelectorAll('.category-header');
  categoryHeaders.forEach(header => {
    let hasVisibleCards = false;

    // Check next siblings until next category or end
    let nextEl = header.nextElementSibling;
    while (nextEl && !nextEl.classList.contains('category-header')) {
      if (nextEl.classList.contains('line-item-card') && nextEl.style.display !== 'none') {
        hasVisibleCards = true;
        break;
      }
      nextEl = nextEl.nextElementSibling;
    }

    header.style.display = hasVisibleCards ? '' : 'none';
  });

  
  // If list view is active, rebuild the table to reflect current visible cards
  if (isListViewActive && isListViewActive()) {
    buildListViewFromCards();
    if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
  }
}

// ✅ Clear all filters
function clearFilters() {
  // Reset all filter dropdowns
  const filterElements = [
    document.getElementById('filter-category'),
    document.getElementById('filter-status'),
    document.getElementById('filter-vendor')
  ];
  
  filterElements.forEach(el => {
    if (el) el.value = '';
  });
  
  // Show all cards and category headers
  document.querySelectorAll('.line-item-card, .category-header').forEach(el => {
    el.style.display = '';
  });
  
  // Reset filter counts
  updateFilterCounts();
  
}

// ✅ Update the filter count display - Card View Only
// ✅ Update the filter count display with filter badges
function updateFilterCounts() {
  const items = document.querySelectorAll('.line-item-card');
  const totalItems = items.length;
  const visibleItems = Array.from(items).filter(item => item.style.display !== 'none').length;
  
  // Update filter header with count
  const filterHeader = document.querySelector('.filter-header h3');
  if (!filterHeader) return;
  
  // Get active filters
  const activeFilters = [
    { 
      id: 'filter-category', 
      name: 'Category', 
      value: document.getElementById('filter-category')?.value || '',
      label: document.getElementById('filter-category')?.selectedOptions[0]?.textContent || ''
    },
    { 
      id: 'filter-status', 
      name: 'Status', 
      value: document.getElementById('filter-status')?.value || '',
      label: document.getElementById('filter-status')?.selectedOptions[0]?.textContent || ''
    },
    { 
      id: 'filter-vendor', 
      name: 'Vendor', 
      value: document.getElementById('filter-vendor')?.value || '',
      label: document.getElementById('filter-vendor')?.selectedOptions[0]?.textContent || ''
    }
  ].filter(f => f.value);
  
  // Set the header text
  filterHeader.textContent = `Filters (${visibleItems}/${totalItems})`;
  
  // Add badge count if filters are active
  if (activeFilters.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'filter-active-badge';
    badge.textContent = activeFilters.length;
    filterHeader.appendChild(badge);
  }
  
  // Add .has-value class to filters with values
  document.querySelectorAll('.filter-select').forEach(select => {
    select.classList.toggle('has-value', select.value !== '');
  });
  
  // Update or create the filter badges container inline next to the header title
  const headerContainer = document.querySelector('.filter-header');
  let badgesContainer = headerContainer ? headerContainer.querySelector('.filter-badges') : null;
  if (!badgesContainer) {
    badgesContainer = document.createElement('div');
    badgesContainer.className = 'filter-badges';
    if (headerContainer) {
      const titleEl = headerContainer.querySelector('h3');
      if (titleEl) {
        titleEl.insertAdjacentElement('afterend', badgesContainer);
      } else {
        headerContainer.appendChild(badgesContainer);
      }
    }
  }
  
  // Clear existing badges
  badgesContainer.innerHTML = '';
  
  // Hide badges container if no active filters
  badgesContainer.style.display = activeFilters.length ? 'inline-flex' : 'none';
  
  // Create badges for each active filter
  activeFilters.forEach(filter => {
    const badge = document.createElement('div');
    badge.className = 'filter-badge';
    badge.innerHTML = `
      <span class="filter-badge-name">${filter.name}:</span>
      <span class="filter-badge-value">${filter.label}</span>
      <button class="filter-badge-remove" data-filter-id="${filter.id}">×</button>
    `;
    badgesContainer.appendChild(badge);
    
    // Add click event to remove button
    badge.querySelector('.filter-badge-remove').addEventListener('click', function() {
      document.getElementById(filter.id).value = '';
      applyFilters();
    });
  });
}

// ✅ Update clearFilters to also update badge display
function clearFilters() {
  // Reset all filter dropdowns
  const filterElements = [
    document.getElementById('filter-category'),
    document.getElementById('filter-status'),
    document.getElementById('filter-vendor')
  ];
  // Also reset the item name text filter
  const itemNameInput = document.getElementById('filter-item-name');
  if (itemNameInput) itemNameInput.value = '';
  
  filterElements.forEach(el => {
    if (el) el.value = '';
  });
  
  // Show all cards and category headers
  document.querySelectorAll('.line-item-card, .category-header').forEach(el => {
    el.style.display = '';
  });
  
  // If list view is active, rebuild the table and refresh totals
  try {
    if (typeof isListViewActive === 'function' && isListViewActive()) {
      if (typeof buildListViewFromCards === 'function') buildListViewFromCards();
      if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
      if (typeof syncSeparatedListHeader === 'function') syncSeparatedListHeader();
    }
  } catch (_) {}
  
  // Hide badges container
  const badgesContainer = document.querySelector('.filter-badges');
  if (badgesContainer) {
    badgesContainer.style.display = 'none';
    badgesContainer.innerHTML = '';
  }
  
  // Reset filter counts
  updateFilterCounts();
  
  
}


// Add this function or modify your existing updateTableFooterTotals

// Update table footer totals, optionally only counting visible rows
function updateTableFooterTotals(filteredOnly = false) {
  // Prefer the list-view table if visible; otherwise fallback to the first .estimate-table
  const tableContainer = document.getElementById('line-items-table-container');
  const table = (tableContainer && tableContainer.style.display !== 'none')
    ? tableContainer.querySelector('.estimate-table')
    : document.querySelector('.estimate-table');
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  let totalLabor = 0;
  let totalMaterial = 0;
  let totalAmount = 0;
  let totalProfit = 0;

  // Determine column indexes by header labels when possible
  let laborIdx = -1, materialIdx = -1, amountIdx = -1, profitIdx = -1;
  const headerCells = Array.from(table.querySelectorAll('thead tr th'));
  if (headerCells.length) {
    headerCells.forEach((th, idx) => {
      const t = (th.textContent || '').trim().toLowerCase();
      if (t.includes('labor')) laborIdx = idx;
      if (t.includes('material')) materialIdx = idx;
      if (t.includes('amount') || t.includes('total')) amountIdx = idx;
      if (t.includes('profit')) profitIdx = idx;
    });
  }

  // Get numeric value from a table cell: prefer input/select value, fallback to textContent
  const getCellNumeric = (cell) => {
    if (!cell) return 0;
    const input = cell.querySelector('input, select');
    const raw = input ? (input.value ?? '') : (cell.textContent ?? '');
    const v = parseFloat(String(raw).replace(/[$,\s]/g, ''));
    return isNaN(v) ? 0 : v;
  };

  rows.forEach(row => {
    if (filteredOnly && row.style.display === 'none') return;
    const cells = row.children;
    const cLen = cells.length;

    // Fallback heuristics if headers not found
    let lIdx = laborIdx, mIdx = materialIdx, aIdx = amountIdx, pIdx = profitIdx;
    if (lIdx === -1 || mIdx === -1 || aIdx === -1) {
      const separatedHeaderVisible = (function(){
        const h = document.getElementById('list-view-header');
        return !!(h && (h.style.display !== 'none'));
      })();

      if (separatedHeaderVisible && cLen >= 12) {
        // Current list-view (separate HTML header):
        // [0]=Select, [1]=Category, [2]=Item, [3]=Mode, [4]=Qty, [5]=Unit Price, [6]=Labor, [7]=Material, [8]=Amount, [9]=Status, [10]=Assigned, [11]=Actions
        lIdx = 6; mIdx = 7; aIdx = 8; pIdx = -1;
      } else if (cLen >= 12) {
        // 12-col legacy/body-internal header variant; fall back to common order if used
        // Adjust if your legacy order differs
        lIdx = 6; mIdx = 7; aIdx = 8; pIdx = -1;
      } else if (cLen >= 8) {
        // Compact 8-col variant
        lIdx = 5; mIdx = 6; aIdx = 7; pIdx = -1;
      } else {
        // Last-resort guess: assume last three numeric cells are L/M/A
        lIdx = Math.max(0, cLen - 3);
        mIdx = Math.max(0, cLen - 2);
        aIdx = Math.max(0, cLen - 1);
        pIdx = -1;
      }
    }

    totalLabor += getCellNumeric(cells[lIdx]);
    totalMaterial += getCellNumeric(cells[mIdx]);
    totalAmount += getCellNumeric(cells[aIdx]);
    if (pIdx !== -1) totalProfit += getCellNumeric(cells[pIdx]);
  });

  const footer = table.querySelector('tfoot tr');
  if (!footer) return;

  // Currency formatter with thousands separators
  const fmt = (n) => {
    const num = Number(n) || 0;
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Map footer positions based on structure
  const fLen = footer.children.length;
  if (fLen >= 4 && footer.children[0] && footer.children[0].colSpan >= 4) {
    // List-view footer layout: [0]=colspan label, [1]=Labor, [2]=Material, [3]=Amount
    if (footer.children[1]) footer.children[1].textContent = fmt(totalLabor);
    if (footer.children[2]) footer.children[2].textContent = fmt(totalMaterial);
    if (footer.children[3]) footer.children[3].textContent = fmt(totalAmount);
    if (filteredOnly) {
      footer.setAttribute('data-filtered', 'true');
      if (footer.children[0]) footer.children[0].textContent = 'FILTERED TOTALS:';
    } else {
      footer.removeAttribute('data-filtered');
      if (footer.children[0]) footer.children[0].textContent = 'TOTALS:';
    }
  } else if (fLen >= 12) {
    // Legacy footer layout with explicit columns
    footer.children[8].textContent = fmt(totalLabor);
    footer.children[9].textContent = fmt(totalMaterial);
    footer.children[10].textContent = fmt(totalAmount);
    footer.children[11].textContent = fmt(isNaN(totalProfit) ? 0 : totalProfit);
    if (filteredOnly) footer.setAttribute('data-filtered', 'true'); else footer.removeAttribute('data-filtered');
  }
}

let allEstimateIds = [];
let currentEstimateIndex = -1;

// Fetch all estimates for this project and set up navigation
async function setupEstimateNavigation() {
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  const estimateId = new URLSearchParams(window.location.search).get("estimateId");
  if (!projectId) return;

  try {
    const res = await fetch(`/api/estimates?projectId=${projectId}`);
    const data = await res.json();
    if (!data.estimates) return;

    allEstimateIds = data.estimates.map(e => e._id);
    currentEstimateIndex = allEstimateIds.indexOf(estimateId);

    // Enable/disable buttons
    document.getElementById("prev-estimate").disabled = currentEstimateIndex <= 0;
    document.getElementById("next-estimate").disabled = currentEstimateIndex === -1 || currentEstimateIndex >= allEstimateIds.length - 1;
  } catch (err) {
    console.warn("Estimate navigation fetch failed", err);
  }
}



// Navigation button handlers
function goToEstimate(offset) {
  if (allEstimateIds.length === 0 || currentEstimateIndex === -1) return;
  const newIndex = currentEstimateIndex + offset;
  if (newIndex < 0 || newIndex >= allEstimateIds.length) return;
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  const newEstimateId = allEstimateIds[newIndex];
  // Navigate to the new estimate
  window.location.href = `?projectId=${projectId}&estimateId=${newEstimateId}`;
}

let allEstimatesList = []; // Store all estimates for suggestions

async function setupEstimateTitleSuggestions() {
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  const estimateId = new URLSearchParams(window.location.search).get("estimateId");
  const input = document.getElementById("estimate-title");
  const suggestionBox = document.getElementById("estimate-title-suggestions");
  if (!input || !suggestionBox || !projectId) return;

  // Fetch all estimates for this project
  try {
    const res = await fetch(`/api/estimates?projectId=${projectId}`);
    const data = await res.json();
    window.allEstimatesList = data.estimates || [];
  } catch (err) {
    window.allEstimatesList = [];
  }

  // Helper to render suggestions with startDate and endDate
  function renderSuggestions(matches) {
    suggestionBox.innerHTML = "";
    if (matches.length === 0) {
      suggestionBox.style.display = "none";
      return;
    }
    matches.forEach(est => {
      const option = document.createElement("div");
      option.style.display = "flex";
      option.style.alignItems = "center";
      option.style.justifyContent = "space-between";
      option.style.padding = "10px 16px";
      option.style.cursor = "pointer";
      option.style.borderBottom = "1px solid #eee";
      option.onmouseenter = () => (option.style.background = "#f0f4ff");
      option.onmouseleave = () => (option.style.background = "#fff");

      // Title
      const titleSpan = document.createElement("span");
      titleSpan.textContent = est.title || `Estimate ${est._id}`;
      option.appendChild(titleSpan);

      // Dates
      const datesSpan = document.createElement("span");
      datesSpan.style.fontSize = "0.9em";
      datesSpan.style.color = "#888";
      let startDate = est.startDate ? new Date(est.startDate).toLocaleDateString() : "-";
      let endDate = est.endDate ? new Date(est.endDate).toLocaleDateString() : "-";
      datesSpan.textContent = `Start: ${startDate} | End: ${endDate}`;
      option.appendChild(datesSpan);

      option.onclick = () => {
        window.location.href = `?projectId=${projectId}&estimateId=${est._id}`;
      };
      suggestionBox.appendChild(option);
    });
    suggestionBox.style.display = "block";
  }


  // Show all suggestions when input is focused
  input.addEventListener("focus", function () {
    renderSuggestions(window.allEstimatesList);
  });

  // Show filtered suggestions when typing
  input.addEventListener("input", function () {
    const val = input.value.trim().toLowerCase();
    if (!val) {
      renderSuggestions(window.allEstimatesList);
    } else {
      const matches = window.allEstimatesList.filter(est =>
        (est.title || "").toLowerCase().includes(val)
      );
      renderSuggestions(matches);
    }
  });

  // Hide suggestions when clicking outside
  document.addEventListener("click", function (e) {
    if (!input.contains(e.target) && !suggestionBox.contains(e.target)) {
      suggestionBox.style.display = "none";
    }
  });
}


// Attach event listeners after DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  setupEstimateNavigation();
  setupEstimateTitleSuggestions();
  
  document.getElementById("prev-estimate").addEventListener("click", () => goToEstimate(-1));
  document.getElementById("next-estimate").addEventListener("click", () => goToEstimate(1));

  // Autosave tax changes: update summary live and persist with debounce / on blur
  const taxInput = document.getElementById('tax-input');
  if (taxInput) {
    taxInput.addEventListener('input', () => { try { updateSummary(); } catch (_) {} });
    // Use smart blur so autosave only fires on actual changes
    addSmartBlurAutoSave(taxInput);
  }
});

// Global utility: only autosave on blur if value actually changed, and skip during deletion
function addSmartBlurAutoSave(input) {
  if (!input) return;
  let originalValue;
  const getValue = () => input.hasAttribute('contenteditable') ? input.textContent : input.value;
  input.addEventListener('focus', () => {
    // If a stable original was provided by a specialized focus handler (e.g., labor/material), use it
    if (typeof input.dataset.smartOrig !== 'undefined') {
      originalValue = input.dataset.smartOrig;
    } else {
      originalValue = getValue();
    }
  });
  input.addEventListener('blur', () => {
    if (window.__isDeletingLineItem) return;
    // Numeric-aware comparison to avoid autosave due to formatting (e.g., 10 vs 10.00)
    const rawNow = getValue();
    const isNumericField = (
      input.type === 'number' ||
      input.classList.contains('item-price') ||
      input.classList.contains('item-quantity') ||
      input.classList.contains('item-area') ||
      input.classList.contains('item-length') ||
      input.classList.contains('item-labor-cost') ||
      input.classList.contains('item-material-cost')
    );
    let changed = false;
    if (isNumericField) {
      const beforeNum = parseFloat(originalValue);
      const nowNum = parseFloat(rawNow);
      const diff = Math.abs((isNaN(beforeNum)?0:beforeNum) - (isNaN(nowNum)?0:nowNum));
      changed = diff > 0.005; // pennies tolerance
    } else {
      changed = rawNow !== originalValue;
    }
    // Clear smartOrig flag
    try { delete input.dataset.smartOrig; } catch (_) {}
    if (changed) {
      try { autoSaveEstimate(); } catch (e) { console.warn('Autosave (blur) failed', e); }
    }
  });
}

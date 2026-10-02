// Property management: application ui.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Setup Send Application modal and actions
function initializeSendApplicationModalUi() {
    // Create modal if missing
    if (!document.getElementById('sendApplicationModal')) {
        const modal = document.createElement('div');
        modal.id = 'sendApplicationModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:480px;">
                <h2>Send Rental Application</h2>
                <form id="sendApplicationForm">
                    <div class="form-group">
                        <label>Property (optional)</label>
                        <select id="sendAppProperty">
                            <option value="">Select a property</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Unit (optional)</label>
                        <select id="sendAppUnit" disabled>
                            <option value="">Select a unit</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Full Name (optional)</label>
                        <input type="text" id="sendAppName" placeholder="e.g., John Doe" />
                    </div>
                    <div class="form-group">
                        <label>Email (required)</label>
                        <input type="email" id="sendAppEmail" placeholder="applicant@example.com" required />
                        <div id="sendAppError" style="display:none; color:#b91c1c; font-size:12px; margin-top:8px;">Please enter a valid email.</div>
                    </div>
                    <div class="modal-buttons">
                        <button type="button" class="btn-secondary" id="cancelSendAppBtn">Cancel</button>
                        <button type="submit" class="btn-primary" id="confirmSendAppBtn">Send Link</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modal);
    }

    const sendBtn = document.getElementById('sendApplicationBtn');
    const cancelBtn = document.getElementById('cancelSendAppBtn');
    const formEl = document.getElementById('sendApplicationForm');
    const errorEl = document.getElementById('sendAppError');
    const emailInput = document.getElementById('sendAppEmail');
    const nameInput = document.getElementById('sendAppName');
    const propertySelect = document.getElementById('sendAppProperty');
    const unitSelect = document.getElementById('sendAppUnit');
    if (formEl?.dataset.bound === 'true') return;
    let modalUnits = [];

    function isValidEmail(email) { return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email); }

    async function populateUnitsForProperty(propertyId) {
        modalUnits = [];
        unitSelect.innerHTML = '<option value="">Select a unit</option>';
        unitSelect.disabled = true;
        if (!propertyId) return;
        try {
            const res = await fetch(`${API_URL}/properties/${propertyId}/units`);
            if (!res.ok) throw new Error('Failed to load units');
            const data = await res.json();
            modalUnits = data.property?.units || [];
            if (modalUnits.length) {
                unitSelect.disabled = false;
                unitSelect.innerHTML = ['<option value="">Select a unit</option>',
                    ...modalUnits.map(u => `<option value="${u._id}">Unit ${u.number}</option>`)
                ].join('');
            }
        } catch (e) {
            console.error('Error loading units for property:', e);
        }
    }

    function openSendAppModal() {
        errorEl.style.display = 'none';
        nameInput.value = '';
        emailInput.value = '';
        // Populate properties list (default to current property if available)
        if (propertySelect) {
            propertySelect.innerHTML = '<option value="">Select a property</option>' +
                (state.properties || []).map(p => `<option value="${p._id}">${p.name}</option>`).join('');
            if (state.currentProperty?._id) {
                propertySelect.value = state.currentProperty._id;
            }
            // Populate units for the selected property
            populateUnitsForProperty(propertySelect.value);
        }
        openModal('sendApplicationModal');
    }
    function closeSendAppModal() { closeModal('sendApplicationModal'); }

    sendBtn?.addEventListener('click', openSendAppModal);
    cancelBtn?.addEventListener('click', closeSendAppModal);
    propertySelect?.addEventListener('change', (e) => {
        const propId = e.target.value || '';
        populateUnitsForProperty(propId);
    });
    formEl?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const name = nameInput.value.trim();
        const selectedPropertyId = propertySelect?.value || '';
        const selectedProperty = (state.properties || []).find(p => p._id === selectedPropertyId);
        const selectedUnitId = unitSelect?.value || '';
        const selectedUnit = (modalUnits || []).find(u => u._id === selectedUnitId);
        if (!isValidEmail(email)) { errorEl.style.display = 'block'; return; }
        try {
            showLoader();
            const res = await fetch('/api/rental-applications/send-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    name,
                    propertyId: selectedProperty?._id || state.currentProperty?._id || undefined,
                    propertyName: selectedProperty?.name || state.currentProperty?.name || undefined,
                    unitId: selectedUnit?._id || undefined,
                    unitNumber: selectedUnit?.number || undefined
                })
            });
            hideLoader();
            if (!res.ok) throw new Error('Failed to send link');
            closeSendAppModal();
            showNotification('Application link sent successfully', 'success');
            // Refresh invites list to show the new record
            runWhenIdle(() => loadInvites(true));
        } catch (err) {
            console.error('Send application error:', err);
            errorEl.textContent = 'Failed to send link. Please try again.';
            errorEl.style.display = 'block';
        }
    });
    if (formEl) formEl.dataset.bound = 'true';
}

// Light / Dark theme toggle for the top tools bar
function initializeThemeToggle() {
    const body = document.body;
    const toggle = document.getElementById('themeToggle');
    if (!toggle || toggle.dataset.bound === 'true') return;

    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    const STORAGE_KEY = 'pmTheme';

    const applyTheme = (theme) => {
        const isDark = theme === 'dark';
        if (isDark) {
            body.classList.add('dark-theme');
        } else {
            body.classList.remove('dark-theme');
        }

        if (icon) {
            icon.classList.remove('fa-sun', 'fa-moon');
            icon.classList.add(isDark ? 'fa-sun' : 'fa-moon');
        }
        if (label) {
            label.textContent = isDark ? 'Light mode' : 'Dark mode';
        }
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        toggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    };

    let savedTheme = null;
    try {
        savedTheme = window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
    } catch (_) {
        savedTheme = null;
    }

    if (savedTheme !== 'light' && savedTheme !== 'dark') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        savedTheme = prefersDark ? 'dark' : 'light';
    }

    applyTheme(savedTheme);

    toggle.addEventListener('click', () => {
        const isCurrentlyDark = body.classList.contains('dark-theme');
        const nextTheme = isCurrentlyDark ? 'light' : 'dark';
        applyTheme(nextTheme);
        try {
            if (window.localStorage) {
                localStorage.setItem(STORAGE_KEY, nextTheme);
            }
        } catch (_) {
            // Ignore storage errors
        }
    });
    toggle.dataset.bound = 'true';
}

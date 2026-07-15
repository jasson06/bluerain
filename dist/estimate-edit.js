function getDisclosureIconSvg() {
  return '<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"></path></svg>';
}

function ensureDisclosureStyles() {
  if (typeof document === 'undefined' || document.getElementById('estimate-disclosure-styles')) return;

  const style = document.createElement('style');
  style.id = 'estimate-disclosure-styles';
  style.textContent = `
    .estimate-disclosure-btn,
    .estimate-disclosure-icon {
      --toggle-color: #1d4ed8;
      --toggle-border: #bfdbfe;
      --toggle-hover-bg: #dbeafe;
      --toggle-shadow: rgba(59, 130, 246, 0.18);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      color: var(--toggle-color);
      vertical-align: middle;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
    .estimate-disclosure-btn {
      border: 1px solid var(--toggle-border);
      background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.96) 100%);
      cursor: pointer;
      padding: 0;
      transition: background 0.16s ease, box-shadow 0.16s ease, transform 0.08s ease, border-color 0.16s ease;
    }
    .estimate-disclosure-btn:hover {
      background: var(--toggle-hover-bg);
      box-shadow: 0 6px 14px var(--toggle-shadow);
    }
    .estimate-disclosure-btn:active {
      transform: translateY(1px) scale(0.98);
    }
    .estimate-disclosure-btn:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--toggle-color) 24%, white);
      outline-offset: 2px;
    }
    .estimate-disclosure-icon {
      border: 1px solid var(--toggle-border);
      background: rgba(255, 255, 255, 0.92);
      pointer-events: none;
    }
    .estimate-disclosure-btn svg,
    .estimate-disclosure-icon svg {
      display: block;
      transition: transform 0.18s ease;
      transform: rotate(0deg);
    }
    .estimate-disclosure-btn[aria-expanded="true"] svg,
    .estimate-disclosure-icon.is-expanded svg {
      transform: rotate(90deg);
    }
    .estimate-disclosure-btn-amber,
    .estimate-disclosure-icon-amber {
      --toggle-color: #9a3412;
      --toggle-border: #fed7aa;
      --toggle-hover-bg: #ffedd5;
      --toggle-shadow: rgba(245, 158, 11, 0.22);
    }
    .estimate-disclosure-btn-slate,
    .estimate-disclosure-icon-slate {
      --toggle-color: #111827;
      --toggle-border: #e5e7eb;
      --toggle-hover-bg: #f3f4f6;
      --toggle-shadow: rgba(15, 23, 42, 0.12);
    }
  `;
  document.head.appendChild(style);
}

function setDisclosureButtonState(button, expanded, expandedTitle, collapsedTitle) {
  if (!button) return;
  ensureDisclosureStyles();
  button.innerHTML = getDisclosureIconSvg();
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (expandedTitle || collapsedTitle) {
    button.title = expanded ? (expandedTitle || '') : (collapsedTitle || '');
  }
}

const PROJECT_PHASES = [
  { value: "pre-construction", label: "Pre-Construction", shortLabel: "Pre-Con", purpose: "establish scope and remove surprises", examples: ["Site walk", "Measurements", "Contractor bids", "Scope creation", "Material selections", "Budget approval", "Existing conditions photos"] },
  { value: "permits", label: "Permits", shortLabel: "Permits", purpose: "clear administrative blockers", examples: ["Building permits", "Historic approval", "Utility coordination", "CPS / SAWS work", "Meter setup", "Engineering revisions"] },
  { value: "demo", label: "Demo", shortLabel: "Demo", purpose: "strip project down and prepare for work", examples: ["Interior demo", "Debris removal", "Tree removal", "Site cleanup", "Temporary protection", "Material staging"] },
  { value: "structure", label: "Structure", shortLabel: "Structure", purpose: "make the building sound and weather tight", examples: ["Foundation", "Framing", "Exterior siding", "Roofing", "Windows", "Exterior stairs", "Balcony work"] },
  { value: "rough-in", label: "Rough-In", shortLabel: "Rough-In", purpose: "infrastructure hidden behind walls", examples: ["Plumbing rough", "Electrical rough", "HVAC rough", "Sewer replacement", "Underground utilities", "Fire blocking", "Insulation"] },
  { value: "inspections", label: "Inspections", shortLabel: "Inspect", purpose: "avoid hidden failures later", examples: ["Rough inspections", "Corrections", "Re-inspections", "Sign-offs"] },
  { value: "finishes", label: "Finishes", shortLabel: "Finishes", purpose: "visible product creation", examples: ["Drywall", "Texture", "Paint", "Flooring", "Cabinets", "Countertops", "Tile", "Trim", "Fixtures", "Appliances"] },
  { value: "exterior", label: "Exterior", shortLabel: "Exterior", purpose: "curb appeal and supporting features", examples: ["Landscaping", "Parking areas", "Fencing", "Mailboxes", "Lighting", "Exterior paint", "Signage"] },
  { value: "punch", label: "Punch", shortLabel: "Punch", purpose: "finish outstanding issues", examples: ["Deficiency corrections", "Cleaning", "Touch-ups", "Final photos", "Final inspections"] }
];
const PROJECT_PHASE_ALIASES = new Map([
  ["planning", "pre-construction"],
  ["permits-approvals", "permits"],
  ["site-preparation", "demo"],
  ["rough-construction", "structure"],
  ["finish-work", "finishes"],
  ["final-completion", "punch"],
  ["completed", "punch"]
]);
const PROJECT_PHASE_MAP = new Map(PROJECT_PHASES.map((phase) => [phase.value, phase]));
const DEFAULT_PROJECT_PHASE = PROJECT_PHASES[0].value;
let __projectPhaseTooltip = null;
let __projectPhaseTooltipActiveTarget = null;

function clampProjectPhaseProgress(value, fallbackStatus = "new") {
  const numericValue = parseFloat(value);
  if (Number.isFinite(numericValue)) {
    return Math.min(100, Math.max(0, Math.round(numericValue)));
  }
  return String(fallbackStatus || "").toLowerCase() === "completed" ? 100 : 0;
}

function normalizeProjectPhase(value) {
  const normalizedValue = PROJECT_PHASE_ALIASES.get(value) || value;
  return PROJECT_PHASE_MAP.has(normalizedValue) ? normalizedValue : DEFAULT_PROJECT_PHASE;
}

function getProjectPhaseLabel(value, useShortLabel = false) {
  const phase = PROJECT_PHASE_MAP.get(normalizeProjectPhase(value)) || PROJECT_PHASES[0];
  return useShortLabel ? phase.shortLabel : phase.label;
}

function getProjectPhaseGuidanceText(value) {
  const phase = PROJECT_PHASE_MAP.get(normalizeProjectPhase(value)) || PROJECT_PHASES[0];
  const examples = Array.isArray(phase.examples) ? phase.examples.join(', ') : '';
  return `${phase.label}\nPurpose: ${phase.purpose || 'Track this stage of work.'}${examples ? `\nExamples: ${examples}` : ''}`;
}

function ensureProjectPhaseTooltip() {
  if (__projectPhaseTooltip && document.body?.contains(__projectPhaseTooltip)) {
    return __projectPhaseTooltip;
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'project-phase-guidance-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.innerHTML = `
    <div class="project-phase-guidance-tooltip-title"></div>
    <div class="project-phase-guidance-tooltip-purpose"></div>
    <div class="project-phase-guidance-tooltip-examples"></div>
  `;
  document.body.appendChild(tooltip);
  __projectPhaseTooltip = tooltip;

  if (!window.__projectPhaseTooltipEventsBound) {
    window.addEventListener('scroll', () => hideProjectPhaseTooltip(), true);
    window.addEventListener('resize', () => hideProjectPhaseTooltip());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideProjectPhaseTooltip();
    });
    window.__projectPhaseTooltipEventsBound = true;
  }

  return tooltip;
}

function positionProjectPhaseTooltip(target) {
  const tooltip = ensureProjectPhaseTooltip();
  if (!tooltip || !target) return;

  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gutter = 12;
  let top = rect.top - tooltipRect.height - gutter;
  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

  if (top < 12) {
    top = rect.bottom + gutter;
    tooltip.dataset.placement = 'bottom';
  } else {
    tooltip.dataset.placement = 'top';
  }

  left = Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12));
  tooltip.style.top = `${Math.round(top + window.scrollY)}px`;
  tooltip.style.left = `${Math.round(left + window.scrollX)}px`;
}

function showProjectPhaseTooltip(target, value) {
  const tooltip = ensureProjectPhaseTooltip();
  const phase = PROJECT_PHASE_MAP.get(normalizeProjectPhase(value)) || PROJECT_PHASES[0];
  if (!tooltip || !phase || !target) return;

  const titleEl = tooltip.querySelector('.project-phase-guidance-tooltip-title');
  const purposeEl = tooltip.querySelector('.project-phase-guidance-tooltip-purpose');
  const examplesEl = tooltip.querySelector('.project-phase-guidance-tooltip-examples');
  if (!titleEl || !purposeEl || !examplesEl) return;

  titleEl.textContent = phase.label;
  purposeEl.textContent = `Purpose: ${phase.purpose || 'Track this stage of work.'}`;
  examplesEl.innerHTML = Array.isArray(phase.examples)
    ? phase.examples.map((example) => `<span>${example}</span>`).join('')
    : '';

  __projectPhaseTooltipActiveTarget = target;
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden', 'false');
  positionProjectPhaseTooltip(target);
}

function hideProjectPhaseTooltip() {
  const tooltip = __projectPhaseTooltip;
  __projectPhaseTooltipActiveTarget = null;
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

function bindProjectPhaseTooltip(target, value) {
  if (!target) return;
  const normalizedPhase = normalizeProjectPhase(value);
  target.dataset.phaseGuidanceValue = normalizedPhase;
  target.removeAttribute('title');
  target.setAttribute('aria-label', getProjectPhaseGuidanceText(normalizedPhase));

  if (target.dataset.phaseTooltipBound === 'true') return;
  target.dataset.phaseTooltipBound = 'true';

  target.addEventListener('mouseenter', () => {
    showProjectPhaseTooltip(target, target.dataset.phaseGuidanceValue || DEFAULT_PROJECT_PHASE);
  });
  target.addEventListener('mouseleave', () => {
    if (__projectPhaseTooltipActiveTarget === target) hideProjectPhaseTooltip();
  });
  target.addEventListener('focus', () => {
    showProjectPhaseTooltip(target, target.dataset.phaseGuidanceValue || DEFAULT_PROJECT_PHASE);
  });
  target.addEventListener('blur', () => {
    if (__projectPhaseTooltipActiveTarget === target) hideProjectPhaseTooltip();
  });
}

function getEstimateLineItemCards() {
  return Array.from(document.querySelectorAll('.line-item-card'));
}

function isCardAssigned(card) {
  return !!String(card?.getAttribute?.('data-assigned-to') || '').trim();
}

function getLineItemPhaseFromCard(card) {
  return normalizeProjectPhase(card?.querySelector('.item-phase-dropdown')?.value || card?.dataset?.phase || DEFAULT_PROJECT_PHASE);
}

function getLineItemCompletionFromCard(card) {
  const statusValue = card?.querySelector('.item-status-dropdown')?.value || 'new';
  return clampProjectPhaseProgress(card?.querySelector('.item-percent-complete')?.value, statusValue);
}

function isLineItemOverdue(card, todayString = new Date().toISOString().slice(0, 10)) {
  if (!card) return false;
  const targetFinish = card.querySelector('.item-end-date')?.value || '';
  if (!targetFinish) return false;
  const statusValue = String(card.querySelector('.item-status-dropdown')?.value || '').toLowerCase();
  if (statusValue === 'completed') return false;
  return getLineItemCompletionFromCard(card) < 100 && targetFinish < todayString;
}

function getNextPercentCompleteForStatus(nextStatus, currentValue) {
  return nextStatus === 'completed'
    ? 100
    : nextStatus === 'in-progress'
      ? 0
      : clampProjectPhaseProgress(currentValue, nextStatus);
}

async function persistLineItemStatusChange(lineItemId, newStatus, options = {}) {
  const {
    vendorId = '',
    estimateId = new URLSearchParams(window.location.search).get('estimateId'),
    percentComplete = getNextPercentCompleteForStatus(newStatus, 0)
  } = options;

  try {
    const response = await fetch(`/api/estimates/line-items/${lineItemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, percentComplete })
    });
    if (!response.ok) {
      return { ok: false, error: 'estimate' };
    }
  } catch (_) {
    return { ok: false, error: 'estimate' };
  }

  let vendorSyncFailed = false;
  if (vendorId && /^[a-f\d]{24}$/i.test(vendorId)) {
    try {
      const vendorRes = await fetch(`/api/vendors/${vendorId}/update-item-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: lineItemId,
          status: newStatus,
          estimateId: estimateId
        })
      });
      vendorSyncFailed = !vendorRes.ok;
    } catch (_) {
      vendorSyncFailed = true;
    }
  }

  return { ok: true, vendorSyncFailed };
}

function getCurrentProjectPhase(cards = getEstimateLineItemCards()) {
  for (const phase of PROJECT_PHASES) {
    const phaseCards = cards.filter((card) => getLineItemPhaseFromCard(card) === phase.value);
    if (!phaseCards.length) continue;
    const hasOpenWork = phaseCards.some((card) => getLineItemCompletionFromCard(card) < 100 && String(card.querySelector('.item-status-dropdown')?.value || '').toLowerCase() !== 'completed');
    if (hasOpenWork) return phase.value;
  }
  const lastPhaseWithItems = [...PROJECT_PHASES].reverse().find((phase) => cards.some((card) => getLineItemPhaseFromCard(card) === phase.value));
  return lastPhaseWithItems?.value || DEFAULT_PROJECT_PHASE;
}

function renderProjectPhaseBar() {
  const phaseBar = document.getElementById('project-phase-bar');
  const phaseSummary = document.getElementById('project-phase-summary');
  if (!phaseBar || !phaseSummary) return;

  const cards = getEstimateLineItemCards();
  const phaseFilter = document.getElementById('filter-phase');
  const activePhase = phaseFilter?.value || '';
  const currentPhase = getCurrentProjectPhase(cards);
  const overdueCount = cards.filter((card) => isLineItemOverdue(card)).length;
  const overallProgress = cards.length
    ? Math.round(cards.reduce((sum, card) => sum + getLineItemCompletionFromCard(card), 0) / cards.length)
    : 0;

  phaseBar.innerHTML = PROJECT_PHASES.map((phase, index) => {
    const phaseCards = cards.filter((card) => getLineItemPhaseFromCard(card) === phase.value);
    const averageProgress = phaseCards.length
      ? Math.round(phaseCards.reduce((sum, card) => sum + getLineItemCompletionFromCard(card), 0) / phaseCards.length)
      : 0;
    const stateClass = activePhase === phase.value
      ? 'is-active'
      : currentPhase === phase.value
        ? 'is-current'
        : '';
    return `
      <button type="button" class="project-phase-step ${stateClass}" data-phase-value="${phase.value}" aria-pressed="${activePhase === phase.value ? 'true' : 'false'}">
        <span class="project-phase-step-head">
          <span class="project-phase-step-label">${phase.shortLabel}</span>
          <span class="project-phase-step-info" data-phase-guidance-trigger="${phase.value}" tabindex="0" role="button" aria-label="Show ${phase.label} guidance">i</span>
        </span>
        <span class="project-phase-step-meta">
          <span>${phaseCards.length} item${phaseCards.length === 1 ? '' : 's'}</span>
          <span>${averageProgress}%</span>
        </span>
      </button>
      ${index < PROJECT_PHASES.length - 1 ? '<span class="project-phase-chevron" aria-hidden="true">→</span>' : ''}
    `;
  }).join('');

  phaseBar.querySelectorAll('[data-phase-guidance-trigger]').forEach((icon) => {
    const phaseValue = icon.getAttribute('data-phase-guidance-trigger') || DEFAULT_PROJECT_PHASE;
    bindProjectPhaseTooltip(icon, phaseValue);
    icon.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  phaseBar.querySelectorAll('[data-phase-value]').forEach((button) => {
    const phaseValue = button.getAttribute('data-phase-value') || DEFAULT_PROJECT_PHASE;
    button.addEventListener('click', () => {
      const nextValue = button.getAttribute('data-phase-value') || '';
      if (phaseFilter) {
        phaseFilter.value = phaseFilter.value === nextValue ? '' : nextValue;
      }
      applyFilters();
    });
  });

  const viewingPhaseLabel = activePhase
    ? getProjectPhaseLabel(activePhase)
    : getProjectPhaseLabel(currentPhase);

  phaseSummary.innerHTML = `
    <span><strong>Viewing:</strong> ${viewingPhaseLabel}</span>
    <span><strong>Current:</strong> ${getProjectPhaseLabel(currentPhase)}</span>
    <span><strong>Completion:</strong> ${overallProgress}%</span>
    <span><strong>Overdue:</strong> ${overdueCount}</span>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  ensureDisclosureStyles();
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

  let fullScreenPhotos = [];
  let fullScreenIndex = 0;
  
 let laborCostList = [];

 let isDeletingLineItem = false;

 updatePage();

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
  
let __toastHideTimer = null;
let __estimateSaveInFlightCount = 0;
let __estimateSnapshot = null;
let __estimateSavePromise = null;
let __estimateQueuedSaveOptions = null;

function ensureToastStructure() {
  const toast = document.getElementById('toast');
  if (!toast) return null;
  if (!toast.querySelector('.toast-indicator')) {
    toast.innerHTML = '<span class="toast-indicator" aria-hidden="true"></span><span class="toast-message"></span>';
  }
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.display = toast.style.display || 'none';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.maxWidth = 'min(90vw, 520px)';
  toast.style.lineHeight = '1.35';
  return toast;
}

function hideToast() {
  const toast = document.getElementById('toast');
  try { clearTimeout(__toastHideTimer); } catch (_) {}
  __toastHideTimer = null;
  if (!toast) return;
  toast.style.display = 'none';
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(-50%) translateY(-6px)';
}

function showToast(message, options = {}) {
  const toast = ensureToastStructure();
  if (!toast) return;

  const normalizedOptions = typeof options === 'string'
    ? { variant: options }
    : (options || {});

  const {
    variant = 'info',
    persist = false,
    duration = 3000
  } = normalizedOptions;

  const indicator = toast.querySelector('.toast-indicator');
  const messageEl = toast.querySelector('.toast-message');
  if (!indicator || !messageEl) return;

  try { clearTimeout(__toastHideTimer); } catch (_) {}
  __toastHideTimer = null;

  toast.dataset.state = variant;
  toast.style.display = 'inline-flex';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  if (variant === 'loading') {
    try { ensureAssignSpinnerStyles(); } catch (_) {}
    toast.style.background = 'linear-gradient(135deg, #0f172a 0%, #1d4fd8 100%)';
    indicator.innerHTML = '';
    indicator.style.display = 'inline-block';
    indicator.style.width = '14px';
    indicator.style.height = '14px';
    indicator.style.border = '2px solid rgba(255,255,255,0.35)';
    indicator.style.borderTopColor = '#ffffff';
    indicator.style.borderRadius = '999px';
    indicator.style.animation = 'assignSpin .8s linear infinite';
    indicator.style.flex = '0 0 auto';
  } else {
    indicator.style.animation = 'none';
    indicator.style.width = '18px';
    indicator.style.height = '18px';
    indicator.style.border = 'none';
    indicator.style.borderRadius = '0';
    indicator.style.display = 'inline-flex';
    indicator.style.alignItems = 'center';
    indicator.style.justifyContent = 'center';
    indicator.style.fontWeight = '800';
    indicator.style.flex = '0 0 auto';

    if (variant === 'success') {
      toast.style.background = 'linear-gradient(135deg, #047857 0%, #10b981 100%)';
      indicator.textContent = '✓';
    } else if (variant === 'error') {
      toast.style.background = 'linear-gradient(135deg, #991b1b 0%, #ef4444 100%)';
      indicator.textContent = '!';
    } else {
      toast.style.background = 'linear-gradient(to right, #0ea5e9, #3b82f6)';
      indicator.textContent = 'i';
    }
  }

  messageEl.textContent = message;

  if (!persist) {
    __toastHideTimer = setTimeout(() => {
      hideToast();
    }, duration);
  }
}

function normalizeSaveEstimateOptions(options = {}) {
  if (typeof options === 'boolean') {
    return { silentSuccess: options };
  }
  return {
    silentSuccess: false,
    loadingMessage: 'Saving estimate...',
    ...options
  };
}

function mergeSaveEstimateOptions(currentOptions = {}, nextOptions = {}) {
  const current = normalizeSaveEstimateOptions(currentOptions);
  const next = normalizeSaveEstimateOptions(nextOptions);
  return {
    ...current,
    ...next,
    silentSuccess: current.silentSuccess && next.silentSuccess,
    loadingMessage: next.loadingMessage || current.loadingMessage || 'Saving estimate...'
  };
}

try { window.__estimateEditShowToast = showToast; } catch (_) {}

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
                    <button class="delete-photo" onclick="deletePhoto('${itemId}', '${photo.replace(/'/g, "\\'")}', '${type}')" aria-label="Delete ${type} photo ${index + 1}" title="Delete photo">
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="12" height="12" fill="currentColor"><path d="M7.5 3.5A1.5 1.5 0 0 1 9 2h2a1.5 1.5 0 0 1 1.5 1.5V4H16a.75.75 0 0 1 0 1.5h-.72l-.64 9.03A2 2 0 0 1 12.65 16H7.35a2 2 0 0 1-1.99-1.47L4.72 5.5H4A.75.75 0 0 1 4 4h3.5v-.5ZM11 4v-.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5V4H11Zm-2 3.25a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0V8A.75.75 0 0 1 9 7.25Zm2.75.75a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0V8Z"></path></svg>
                    </button>
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
          setTimeout(() => {
            updatePhotoSection(itemId, type);
            try {
              if (typeof isListViewActive === 'function' && isListViewActive() && typeof scheduleListViewRebuild === 'function') {
                scheduleListViewRebuild(220);
              }
            } catch (_) {}
          }, 500);
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
    const estimateSnapshot = typeof window !== 'undefined' ? window.__estimateSnapshot : null;
    const snapshotPhotos = estimateSnapshot?.lineItems
      ?.flatMap((category) => Array.isArray(category.items) ? category.items : [])
      ?.find((item) => String(item._id) === String(itemId))?.photos?.[type];

    if (Array.isArray(snapshotPhotos) && snapshotPhotos.length) {
      contentHTML = generatePhotoPreview(snapshotPhotos, itemId, type);
    }

    const estimateId = new URLSearchParams(window.location.search).get("estimateId");
    const vendorId = localStorage.getItem("vendorId");

    if (!contentHTML && estimateId) {
      try {
        const res = await fetch(`/api/estimates/${estimateId}`);
        if (res.ok) {
          const { estimate } = await res.json();
          const item = estimate.lineItems.flatMap((cat) => cat.items).find((i) => String(i._id) === String(itemId));
          if (item?.photos?.[type]) {
            contentHTML = generatePhotoPreview(item.photos[type], itemId, type);
          }
        }
      } catch (fetchError) {
        if (!String(fetchError?.message || '').includes('Failed to fetch')) {
          throw fetchError;
        }
      }
    }

    if (!contentHTML && vendorId && vendorId !== "null" && vendorId !== "undefined") {
      try {
        const res = await fetch(`/api/vendors/${vendorId}/items/${itemId}/photos`);
        if (res.ok) {
          const { photos } = await res.json();
          if (photos?.[type]) {
            contentHTML = generatePhotoPreview(photos[type], itemId, type);
          }
        }
      } catch (fetchError) {
        if (!String(fetchError?.message || '').includes('Failed to fetch')) {
          throw fetchError;
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
        try {
          if (typeof isListViewActive === 'function' && isListViewActive() && typeof scheduleListViewRebuild === 'function') {
            scheduleListViewRebuild(220);
          }
        } catch (_) {}
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
  __estimateSnapshot = estimate || null;

      

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
  const renderOptions = { autoFocus: false };

  const pendingPhotoItems = [];
  categories.forEach(category => {
    const categoryHeader = addCategoryHeader(category, renderOptions);
    category.items.forEach(item => {
      addLineItemCard(item, categoryHeader, null, renderOptions);
      // Defer photo setup to idle time to speed initial render
      pendingPhotoItems.push(item._id);
    });
  });

  rebuildSplitGroupHeaders();
  applyCategoryCollapseState();

  // Update filters after rendering
  populateFilterOptions();
  applyFilters();
  renderProjectPhaseBar();

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

}





  // Add Category Header
  function addCategoryHeader(category = { category: "New Category", status: "in-progress", items: [] }, options = {}) {
    const lineItemsContainer = document.getElementById("line-items-cards");
    const shouldAutoFocus = options.autoFocus !== false && shouldAllowEstimateAutoFocus();
    const header = document.createElement("div");
    header.classList.add("category-header");
    header.dataset.categoryId = category._id || "";
    header.innerHTML = `
      <div class="category-title">
        <div class="category-title-main">
          <input type="checkbox" class="category-select-toggle" aria-label="Select category line items" title="Select category line items">
          <button class="btn category-drag-handle" type="button" draggable="true" title="Drag category">::</button>
          <button class="btn toggle-category-collapse estimate-disclosure-btn" type="button" aria-expanded="true" title="Collapse category">${getDisclosureIconSvg()}</button>
          <div class="category-title-copy">
            <span class="category-title-label"></span>
            <span contenteditable="true">${category.category}</span>
            <span class="category-total-amount">Total $0.00</span>
          </div>
        </div>
        <div class="category-title-actions">
          <button class="btn add-line-item" type="button" title="Add line item">+</button>
          <button class="btn remove-category" type="button" title="Remove category">&times;</button>
        </div>
      </div>
    `;
    ensureCategoryCollapseKey(header, category.category);

    const collapseButton = header.querySelector('.toggle-category-collapse');
    collapseButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCategoryCollapsed(header, !isCategoryCollapsed(header));
      applyCategoryCollapseState();
      try {
        if (typeof isListViewActive === 'function' && isListViewActive()) {
          if (typeof buildListViewFromCards === 'function') buildListViewFromCards();
          if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
        }
      } catch (_) {}
    });

    header.querySelector(".add-line-item").addEventListener("click", () => {
      addLineItemCard({}, header);
    });

    header.querySelector('.category-select-toggle')?.addEventListener('change', (event) => {
      toggleCategoryLineItemSelection(header, !!event.target?.checked);
    });

    header.querySelector(".remove-category").addEventListener("click", () => {
  const categoryName = header.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || 'this category';
  if (!confirm(`Are you sure you want to remove "${categoryName}" and all its line items? This cannot be undone.`)) {
    return;
  }
      let nextSibling = header.nextSibling;
      while (nextSibling && !nextSibling.classList.contains("category-header")) {
        const temp = nextSibling.nextSibling;
        if (nextSibling.classList.contains("line-item-card") || nextSibling.classList.contains("split-group-header")) {
          nextSibling.remove();
        }
        nextSibling = temp;
      }
      header.remove();
      removeCategoryCollapsedState(header);
      rebuildSplitGroupHeaders();
      applyCategoryCollapseState();
      autoSaveEstimate(); // Auto-save when a category is removed
    });

    lineItemsContainer.appendChild(header);
  try { if (typeof window.__estimateEditWireCategoryDrag === 'function') window.__estimateEditWireCategoryDrag(header); } catch (_) {}
  try { syncCategoryHeaderTotal(header); } catch (_) {}
  try { syncCategorySelectionCheckboxes(); } catch (_) {}

    
    if (shouldAutoFocus) {
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
    }

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

async function autoSaveEstimate(silent = false) {
  await saveEstimate({ silentSuccess: true, loadingMessage: 'Auto-saving changes...' });
  if (!silent) showToast("Auto-saved!", { variant: 'success' });
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

function getVendorFromCard(card) {
  const assignedToId = card?.getAttribute?.("data-assigned-to") || "";
  if (!assignedToId) return null;
  if (window.vendorMap && window.vendorMap[assignedToId]) return window.vendorMap[assignedToId];
  return assignedToId;
}

function formatEstimateCurrency(value) {
  return `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeVendorModalHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVendorModalStatus(status) {
  const normalizedStatus = String(status || 'new').trim().toLowerCase();
  return normalizedStatus
    .split('-')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : '')
    .join(' ');
}

function isVendorModalDescriptionExpandable(description) {
  const normalizedDescription = String(description || '').trim();
  return normalizedDescription.length > 180 || normalizedDescription.includes('\n');
}

function syncVendorTriggerState(card) {
  const vendorEl = card?.querySelector?.('.vendor-name');
  if (!vendorEl) return;
  const isAssigned = !!String(card.getAttribute('data-assigned-to') || '').trim();
  vendorEl.removeAttribute('title');
  vendorEl.setAttribute('aria-haspopup', 'dialog');
  if (isAssigned) {
    vendorEl.setAttribute('role', 'button');
    vendorEl.setAttribute('tabindex', '0');
  } else {
    vendorEl.removeAttribute('role');
    vendorEl.removeAttribute('tabindex');
  }
}

function getCardEffectiveQuantity(card) {
  if (!card) return 0;
  const calcMode = card.querySelector(".item-calc-mode")?.value || "each";
  if (calcMode === "sqft") return parseFloat(card.querySelector(".item-area")?.value) || 0;
  if (calcMode === "lnft") return parseFloat(card.querySelector(".item-length")?.value) || 0;
  return parseFloat(card.querySelector(".item-quantity")?.value) || 0;
}

function getCardDisplayAmount(card) {
  if (!card) return 0;
  const totalText = card.querySelector(".item-total")?.textContent || "";
  const parsedDisplayAmount = parseFloat(totalText.replace(/[^0-9.-]/g, ""));
  if (Number.isFinite(parsedDisplayAmount)) return parsedDisplayAmount;
  return getCardEffectiveQuantity(card) * (parseFloat(card.querySelector(".item-price")?.value) || 0);
}

function getAssignedAmountFromCard(card) {
  if (!card) return 0;
  const laborCost = parseFloat(card.querySelector(".item-labor-cost")?.value);
  if (Number.isFinite(laborCost)) return laborCost;
  return getCardDisplayAmount(card);
}

function getVendorNameFromCard(card) {
  const vendorName = card?.querySelector(".vendor-name")?.getAttribute("data-fullname")?.trim();
  if (vendorName && vendorName !== "Unassigned") return vendorName;
  const vendor = getVendorFromCard(card);
  if (!vendor) return null;
  if (typeof vendor === "object") return vendor.name || vendor.displayName || null;
  const normalizedVendor = String(vendor).trim();
  return normalizedVendor || null;
}

function collectVendorAssignmentSummaries(cards = getEstimateLineItemCards()) {
  const assignedCards = cards.filter((card) => {
    const assignedToId = card.getAttribute("data-assigned-to") || "";
    return assignedToId.trim() !== "";
  });

  const vendorTotals = new Map();
  assignedCards.forEach((card) => {
    const vendorId = (card.getAttribute("data-assigned-to") || "").trim() || `vendor-${vendorTotals.size}`;
    const vendorName = getVendorNameFromCard(card) || "Assigned Vendor";
    const current = vendorTotals.get(vendorId) || {
      name: vendorName,
      itemCount: 0,
      amount: 0,
      items: []
    };
    const itemAmount = getAssignedAmountFromCard(card);
    const itemName = card.querySelector('.item-name')?.value?.trim() || 'Unnamed line item';
    const itemCategory = card.querySelector('.item-cost-code')?.value?.trim() || 'Uncategorized';
    const itemDescription = card.querySelector('.item-description')?.value?.trim() || 'No description provided';
    const itemStatus = card.querySelector('.item-status-dropdown')?.value?.trim() || 'new';
    current.name = vendorName;
    current.itemCount += 1;
    current.amount += itemAmount;
    current.items.push({
      id: card.getAttribute('data-item-id') || '',
      name: itemName,
      category: itemCategory,
      description: itemDescription,
      status: itemStatus,
      amount: itemAmount
    });
    vendorTotals.set(vendorId, current);
  });

  return vendorTotals;
}

function getVendorAssignmentSummary(vendorId, vendorName, cards = getEstimateLineItemCards()) {
  const vendorTotals = collectVendorAssignmentSummaries(cards);
  if (vendorId && vendorTotals.has(vendorId)) {
    return vendorTotals.get(vendorId);
  }

  const normalizedName = String(vendorName || '').trim().toLowerCase();
  if (!normalizedName) return null;
  return Array.from(vendorTotals.values()).find((vendor) => String(vendor.name || '').trim().toLowerCase() === normalizedName) || null;
}

function closeVendorStatsModal() {
  const modal = document.getElementById('vendor-stats-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

function openVendorStatsModal(vendorId, vendorName) {
  const modal = document.getElementById('vendor-stats-modal');
  if (!modal) return;
  const summary = getVendorAssignmentSummary(vendorId, vendorName);
  if (!summary) return;

  const titleEl = document.getElementById('vendor-stats-title');
  const subtitleEl = document.getElementById('vendor-stats-subtitle');
  const countEl = document.getElementById('vendor-stats-count');
  const amountEl = document.getElementById('vendor-stats-amount');
  const listCountEl = document.getElementById('vendor-stats-list-count');
  const itemsEl = document.getElementById('vendor-stats-items');
  const footnoteEl = document.getElementById('vendor-stats-footnote');

  if (titleEl) titleEl.textContent = summary.name || vendorName || 'Assigned Vendor';
  if (subtitleEl) subtitleEl.textContent = 'Current assignment snapshot for this estimate.';
  if (countEl) countEl.textContent = String(summary.itemCount || 0);
  if (amountEl) amountEl.textContent = formatEstimateCurrency(summary.amount || 0);
  if (listCountEl) {
    listCountEl.textContent = `${summary.itemCount || 0} item${summary.itemCount === 1 ? '' : 's'}`;
  }
  if (itemsEl) {
    const sortedItems = Array.isArray(summary.items)
      ? [...summary.items].sort((left, right) => {
          if (right.amount !== left.amount) return right.amount - left.amount;
          return String(left.name || '').localeCompare(String(right.name || ''));
        })
      : [];

    itemsEl.innerHTML = sortedItems.length
      ? `
          <table class="vendor-stats-modal-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${sortedItems.map((item) => `
                <tr class="vendor-stats-modal-row" ${isVendorModalDescriptionExpandable(item.description) ? 'data-expandable="true" aria-expanded="false" tabindex="0"' : ''}>
                  <td data-label="Item">
                    <div class="vendor-stats-modal-table-item">${escapeVendorModalHtml(item.name)}</div>
                    <div class="vendor-stats-modal-table-description">${escapeVendorModalHtml(item.category)}</div>
                  </td>
                  <td data-label="Description">
                    <div class="vendor-stats-modal-table-description ${isVendorModalDescriptionExpandable(item.description) ? 'is-collapsed' : ''}" data-role="description">${escapeVendorModalHtml(item.description)}</div>
                    ${isVendorModalDescriptionExpandable(item.description) ? '<span class="vendor-stats-modal-table-description-hint" data-role="description-hint">Tap item to show more</span>' : ''}
                  </td>
                  <td data-label="Status">
                    <span class="vendor-stats-modal-status ${getStatusClass(item.status)}">${escapeVendorModalHtml(formatVendorModalStatus(item.status))}</span>
                  </td>
                  <td data-label="Amount" class="vendor-stats-modal-table-amount">${formatEstimateCurrency(item.amount || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total Assigned</td>
                <td class="vendor-stats-modal-table-amount">${formatEstimateCurrency(summary.amount || 0)}</td>
              </tr>
            </tfoot>
          </table>
        `
      : '<div class="vendor-stats-modal-empty">No assigned line items found for this vendor.</div>';
  }
  if (footnoteEl) {
    footnoteEl.textContent = `${summary.itemCount || 0} assigned line item${summary.itemCount === 1 ? '' : 's'} currently tied to this vendor in the estimate.`;
  }

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function initializeVendorStatsModal() {
  if (document.body?.dataset?.vendorStatsModalBound === 'true') return;
  if (document.body) document.body.dataset.vendorStatsModalBound = 'true';

  document.addEventListener('click', (event) => {
    const closeTrigger = event.target.closest('[data-vendor-modal-close]');
    if (closeTrigger) {
      event.preventDefault();
      closeVendorStatsModal();
      return;
    }

    const trigger = event.target.closest('.vendor-name, .vendor-assignment-trigger');
    if (!trigger) return;

    let vendorId = '';
    let vendorName = '';

    if (trigger.classList.contains('vendor-name')) {
      const card = trigger.closest('.line-item-card');
      vendorId = card?.getAttribute('data-assigned-to') || trigger.getAttribute('data-vendor-id') || '';
      vendorName = trigger.getAttribute('data-fullname') || getVendorNameFromCard(card) || '';
    } else {
      vendorId = trigger.getAttribute('data-vendor-id') || '';
      vendorName = trigger.getAttribute('data-fullname') || trigger.textContent || '';
    }

    if (!String(vendorId).trim()) return;
    event.preventDefault();
    event.stopPropagation();
    openVendorStatsModal(vendorId, vendorName);
    return;
  });

  document.addEventListener('click', (event) => {
    const row = event.target.closest('.vendor-stats-modal-row[data-expandable="true"]');
    if (!row) return;
    const description = row.querySelector('[data-role="description"]');
    const hint = row.querySelector('[data-role="description-hint"]');
    if (!description) return;

    const isExpanded = row.getAttribute('aria-expanded') === 'true';
    row.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    description.classList.toggle('is-collapsed', isExpanded);
    if (hint) {
      hint.textContent = isExpanded ? 'Tap item to show more' : 'Tap item to collapse';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeVendorStatsModal();
    if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('.vendor-name')) {
      event.preventDefault();
      event.target.click();
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('.vendor-stats-modal-row[data-expandable="true"]')) {
      event.preventDefault();
      event.target.click();
    }
  });
}

function syncSplitBadge(card, splitPercentage, splitGroupId) {
  if (!card) return;

  if (splitPercentage !== undefined && splitPercentage !== null && splitPercentage !== "") {
    card.dataset.splitPercentage = String(splitPercentage);
  } else {
    delete card.dataset.splitPercentage;
  }

  if (splitGroupId) {
    card.dataset.splitGroupId = splitGroupId;
  } else {
    delete card.dataset.splitGroupId;
  }

  syncSplitGroupVisuals(card, splitGroupId);
}

function getSplitGroupTheme(splitGroupId) {
  const themes = [
    { border: "#f59e0b", background: "#fffbeb", chipBackground: "#fef3c7", chipColor: "#92400e" },
    { border: "#0ea5e9", background: "#f0f9ff", chipBackground: "#dbeafe", chipColor: "#0c4a6e" },
    { border: "#10b981", background: "#ecfdf5", chipBackground: "#d1fae5", chipColor: "#065f46" },
    { border: "#ec4899", background: "#fdf2f8", chipBackground: "#fbcfe8", chipColor: "#9d174d" },
    { border: "#8b5cf6", background: "#f5f3ff", chipBackground: "#ede9fe", chipColor: "#5b21b6" }
  ];

  if (!splitGroupId) return null;

  let hash = 0;
  for (let index = 0; index < splitGroupId.length; index += 1) {
    hash = ((hash << 5) - hash) + splitGroupId.charCodeAt(index);
    hash |= 0;
  }

  return themes[Math.abs(hash) % themes.length];
}

try { window.__estimateEditGetSplitGroupTheme = getSplitGroupTheme; } catch (_) {}

function getSplitGroupCards(splitGroupId) {
  if (!splitGroupId) return [];
  try {
    return Array.from(document.querySelectorAll(`.line-item-card[data-split-group-id="${splitGroupId}"]`));
  } catch (_) {
    return [];
  }
}

function getSplitGroupDisplayInfo(splitGroupId) {
  const cards = getSplitGroupCards(splitGroupId);
  const theme = getSplitGroupTheme(splitGroupId) || { border: "#f59e0b", background: "#fffbeb", chipBackground: "#fef3c7", chipColor: "#92400e" };
  const percentages = cards
    .map((card) => parseFloat(card.dataset.splitPercentage || ""))
    .filter((value) => Number.isFinite(value));
  const combinedLaborTotal = roundCurrency(cards.reduce((sum, card) => {
    const laborInput = card.querySelector(".item-labor-cost");
    return sum + (parseFloat(laborInput?.value || "") || 0);
  }, 0));
  const summary = percentages.length ? `${percentages.join(" / ")}%` : `${cards.length} payments`;
  const collapsedState = window.__splitGroupCollapsedState || {};

  return {
    id: splitGroupId,
    cards,
    theme,
    percentages,
    combinedLaborTotal,
    summary,
    isCollapsed: !!collapsedState[splitGroupId]
  };
}

try { window.__estimateEditGetSplitGroupDisplayInfo = getSplitGroupDisplayInfo; } catch (_) {}

function syncCardSplitGroupIndicator(card) {
  if (!card) return;

  const header = card.querySelector('.card-header');
  if (!header) return;

  header.querySelector('.split-inline-cluster')?.remove();

  const splitGroupId = card.dataset.splitGroupId;
  if (!splitGroupId) return;

  const info = getSplitGroupDisplayInfo(splitGroupId);
  if (!info.cards.length || info.cards[0] !== card) return;

  const nameInput = header.querySelector('.item-name');
  if (!nameInput) return;

  const cluster = document.createElement('div');
  cluster.className = 'split-inline-cluster';
  cluster.innerHTML = `
    <button type="button" class="split-inline-toggle estimate-disclosure-btn estimate-disclosure-btn-amber" aria-expanded="${info.isCollapsed ? 'false' : 'true'}" title="${info.isCollapsed ? 'Expand split payments' : 'Collapse split payments'}" style="--toggle-color:${info.theme.chipColor}; --toggle-border:${info.theme.chipBackground};">${getDisclosureIconSvg()}</button>
    <span class="split-inline-meta" title="${info.summary} • Labor $${info.combinedLaborTotal.toFixed(2)}">${info.summary} • Labor $${info.combinedLaborTotal.toFixed(2)}</span>
  `;

  const toggleButton = cluster.querySelector('.split-inline-toggle');
  toggleButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const collapsedState = window.__splitGroupCollapsedState || {};
    collapsedState[splitGroupId] = !collapsedState[splitGroupId];
    try { window.__splitGroupCollapsedState = collapsedState; } catch (_) {}
    rebuildSplitGroupHeaders();
    try {
      if (typeof isListViewActive === 'function' && isListViewActive()) {
        buildListViewFromCards();
        if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
      }
    } catch (_) {}
  });

  header.insertBefore(cluster, nameInput);
}

function syncSplitGroupVisuals(card, splitGroupId) {
  if (!card) return;

  const theme = getSplitGroupTheme(splitGroupId);

  if (!theme || !splitGroupId) {
    card.style.borderLeft = "";
    card.style.background = "";
    card.style.boxShadow = "";
    return;
  }

  card.style.borderLeft = `4px solid ${theme.border}`;
  card.style.background = `linear-gradient(90deg, ${theme.background} 0, #ffffff 72px)`;
  card.style.boxShadow = `inset 0 0 0 1px ${theme.chipBackground}`;
}

function clearSplitGroupHeaders(container) {
  if (!container) return;
  container.querySelectorAll(".split-group-header").forEach((header) => header.remove());
}

function rebuildSplitGroupHeaders() {
  const container = document.getElementById("line-items-cards");
  if (!container) return;

  clearSplitGroupHeaders(container);

  const collapsedState = window.__splitGroupCollapsedState || {};
  try { window.__splitGroupCollapsedState = collapsedState; } catch (_) {}

  container.querySelectorAll('.line-item-card').forEach((card) => {
    card.querySelector('.split-inline-cluster')?.remove();
  });

  try { applyCategoryCollapseState(); } catch (_) {}

  const categoryHeaders = Array.from(container.querySelectorAll(".category-header"));
  categoryHeaders.forEach((categoryHeader) => {
    let current = categoryHeader.nextElementSibling;
    const groupMap = new Map();
    const groups = [];

    while (current && !current.classList.contains("category-header")) {
      if (current.classList.contains("split-group-header")) {
        current = current.nextElementSibling;
        continue;
      }

      if (current.classList.contains("line-item-card")) {
        const splitGroupId = current.dataset.splitGroupId;
        if (splitGroupId) {
          if (!groupMap.has(splitGroupId)) {
            const group = { id: splitGroupId, cards: [] };
            groupMap.set(splitGroupId, group);
            groups.push(group);
          }
          groupMap.get(splitGroupId).cards.push(current);
        }
      }

      current = current.nextElementSibling;
    }

    groups.forEach((group) => {
      if (!group.cards.length) return;

      group.cards.forEach((card, index) => {
        syncCardSplitGroupIndicator(card);
        const shouldHide = !!collapsedState[group.id] && index > 0;
        if (shouldHide) {
          card.style.display = 'none';
        }
      });
    });
  });
}

function scaleMoneyInput(input, ratio, qty) {
  if (!input) return;

  const currentTotal = parseFloat(input.value) || 0;
  const currentRate = parseFloat(input.dataset.rate || "");
  const nextTotal = currentTotal * ratio;
  input.value = nextTotal.toFixed(2);
  input.dataset.rate = String((Number.isFinite(currentRate) ? currentRate : (qty > 0 ? currentTotal / qty : currentTotal)) * ratio);
  input.dataset.editMode = "";
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundSplitPercentage(value) {
  return Math.round(Number(value) || 0);
}

function buildSplitPercentages(count) {
  const safeCount = Math.max(2, Math.min(12, Math.round(Number(count) || 2)));
  const baseShare = Math.floor(100 / safeCount);
  const remainder = 100 - (baseShare * safeCount);

  return Array.from({ length: safeCount }, (_, index) => baseShare + (index < remainder ? 1 : 0));
}

function buildLaborShares(laborValue, percentages) {
  const totalLabor = roundCurrency(laborValue);
  const shares = [];
  let allocated = 0;

  percentages.forEach((percentage, index) => {
    if (index === percentages.length - 1) {
      shares.push(roundCurrency(totalLabor - allocated));
      return;
    }

    const share = roundCurrency((totalLabor * percentage) / 100);
    shares.push(share);
    allocated = roundCurrency(allocated + share);
  });

  return shares;
}

function rebalanceSplitPercentages(values, editedIndex, rawValue) {
  const nextValues = values.map((value) => roundSplitPercentage(value));
  const minShare = 1;
  const lastIndex = nextValues.length - 1;

  if (lastIndex <= 0) {
    return [100];
  }

  if (editedIndex !== lastIndex) {
    const reservedTotal = nextValues.reduce((sum, value, index) => {
      if (index === editedIndex || index === lastIndex) return sum;
      return sum + Math.max(minShare, value || minShare);
    }, 0);
    const maxEditedValue = 100 - reservedTotal - minShare;
    const clampedEditedValue = Math.min(maxEditedValue, Math.max(minShare, roundSplitPercentage(rawValue)));
    nextValues[editedIndex] = clampedEditedValue;
    nextValues[lastIndex] = 100 - reservedTotal - clampedEditedValue;
    return nextValues;
  }

  const previousIndex = lastIndex - 1;
  const reservedTotal = nextValues.reduce((sum, value, index) => {
    if (index === previousIndex || index === lastIndex) return sum;
    return sum + Math.max(minShare, value || minShare);
  }, 0);
  const maxLastValue = 100 - reservedTotal - minShare;
  const clampedLastValue = Math.min(maxLastValue, Math.max(minShare, roundSplitPercentage(rawValue)));

  nextValues[lastIndex] = clampedLastValue;
  nextValues[previousIndex] = 100 - reservedTotal - clampedLastValue;

  return nextValues;
}

function showSplitPreviewModal({ itemName, laborCost, paymentCount = 2, lockPaymentCount = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; padding:24px; z-index:10000;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(720px, 100%); max-height:90vh; overflow:auto; background:#ffffff; border-radius:20px; box-shadow:0 24px 60px rgba(15,23,42,0.25); padding:24px; font-family:inherit;";
    modal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px;">
        <div>
          <div style="font-size:22px; font-weight:700; color:#0f172a;">Split Line Item</div>
          <div style="font-size:14px; color:#475569; margin-top:6px;">Review the labor split before creating payment rows for ${itemName || "this line item"}.</div>
        </div>
        <button type="button" class="split-preview-close" style="border:none; background:#e2e8f0; color:#0f172a; border-radius:999px; width:34px; height:34px; font-size:18px; cursor:pointer;">×</button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:18px;">
        <label style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#334155; font-weight:600;">
          Number of payments
          <select class="split-payment-count" style="padding:10px 12px; border:1px solid #cbd5e1; border-radius:12px; font:inherit;" ${lockPaymentCount ? 'disabled' : ''}>
            ${Array.from({ length: 7 }, (_, index) => {
              const value = index + 2;
              return `<option value="${value}">${value} payments</option>`;
            }).join("")}
          </select>
        </label>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#334155; font-weight:600;">
          Labor amount to split
          <div style="padding:10px 12px; border:1px solid #cbd5e1; border-radius:12px; background:#f8fafc; color:#0f172a; font-weight:700;">$${roundCurrency(laborCost).toFixed(2)}</div>
        </div>
      </div>
      <div class="split-percentages-container" style="display:grid; gap:12px; margin-bottom:18px;"></div>
      <div class="split-preview-error" style="display:none; margin-bottom:12px; padding:10px 12px; border-radius:12px; background:#fef2f2; color:#b91c1c; font-size:13px; font-weight:600;"></div>
      <div class="split-preview-summary" style="display:grid; gap:10px; padding:16px; border-radius:16px; background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:18px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button type="button" class="split-preview-cancel" style="padding:10px 16px; border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#0f172a; font-weight:600; cursor:pointer;">Cancel</button>
        <button type="button" class="split-preview-apply" style="padding:10px 16px; border-radius:12px; border:none; background:#0f766e; color:#fff; font-weight:700; cursor:pointer;">Apply Split</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const countSelect = modal.querySelector(".split-payment-count");
    const rowsContainer = modal.querySelector(".split-percentages-container");
    const summaryContainer = modal.querySelector(".split-preview-summary");
    const errorBox = modal.querySelector(".split-preview-error");
    const applyButton = modal.querySelector(".split-preview-apply");

    const normalizedPaymentCount = Math.max(2, Math.min(8, parseInt(paymentCount, 10) || 2));
    let percentages = buildSplitPercentages(normalizedPaymentCount);
    countSelect.value = String(normalizedPaymentCount);

    const cleanup = (result) => {
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve(result);
    };

    const readPercentages = () => Array.from(rowsContainer.querySelectorAll(".split-percentage-input")).map((input) => {
      const rawValue = input.value.trim();
      if (rawValue === "") return NaN;
      return roundSplitPercentage(parseFloat(rawValue));
    });

    const syncPercentageInputs = (values) => {
      Array.from(rowsContainer.querySelectorAll(".split-percentage-input")).forEach((input, index) => {
        input.value = String(roundSplitPercentage(values[index] || 0));
      });
    };

    const validatePercentages = (values) => {
      const hasInvalid = values.some((value) => !Number.isFinite(value) || value <= 0);
      const sum = values.reduce((total, value) => total + (Number(value) || 0), 0);
      if (hasInvalid) {
        return { valid: false, message: "Each payment percentage must be greater than 0.", sum };
      }
      if (sum !== 100) {
        return { valid: false, message: `Percentages must total 100%. Current total: ${sum}%.`, sum };
      }
      return { valid: true, message: "", sum };
    };

    const renderSummary = () => {
      const values = readPercentages();
      const validation = validatePercentages(values);
      const normalizedValues = values.map((value) => Number.isFinite(value) ? value : 0);
      const laborShares = buildLaborShares(laborCost, normalizedValues);

      errorBox.style.display = validation.valid ? "none" : "block";
      errorBox.textContent = validation.message;
      applyButton.disabled = !validation.valid;
      applyButton.style.opacity = validation.valid ? "1" : "0.6";
      applyButton.style.cursor = validation.valid ? "pointer" : "not-allowed";

      summaryContainer.innerHTML = normalizedValues.map((percentage, index) => {
        const estimateImpact = index === 0 ? "Keeps current estimate price and material." : "Creates a $0 duplicate so estimate total does not increase.";
        return `
          <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:12px 14px; border-radius:14px; background:#fff; border:1px solid #e2e8f0;">
            <div>
              <div style="font-size:14px; font-weight:700; color:#0f172a;">Payment ${index + 1}</div>
              <div style="font-size:12px; color:#64748b; margin-top:4px;">${estimateImpact}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px; font-weight:700; color:#0f172a;">${roundSplitPercentage(percentage)}%</div>
              <div style="font-size:12px; color:#0f766e; margin-top:4px;">Labor $${roundCurrency(laborShares[index] || 0).toFixed(2)}</div>
            </div>
          </div>
        `;
      }).join("") + `
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; font-size:12px; color:#475569; font-weight:700;">
          <span>Total percentage</span>
          <span>${validation.sum}%</span>
        </div>
      `;
    };

    const renderRows = (values) => {
      rowsContainer.innerHTML = values.map((percentage, index) => `
        <label style="display:grid; grid-template-columns:minmax(120px, 1fr) minmax(120px, 180px); gap:12px; align-items:center; font-size:13px; color:#334155; font-weight:600;">
          <span>Payment ${index + 1} percentage</span>
          <span style="display:flex; align-items:center; gap:8px; padding:0 12px; border:1px solid #cbd5e1; border-radius:12px; background:#fff;">
            <input type="number" min="1" max="100" step="1" value="${roundSplitPercentage(percentage)}" class="split-percentage-input" style="flex:1; min-width:0; padding:10px 0; border:none; outline:none; font:inherit; background:transparent;">
            <span style="font-size:13px; color:#64748b; font-weight:700;">%</span>
          </span>
        </label>
      `).join("");

      rowsContainer.querySelectorAll(".split-percentage-input").forEach((input, index) => {
        input.addEventListener("input", () => {
          const rawValue = input.value.trim();
          if (rawValue === "") {
            renderSummary();
            return;
          }
          percentages = rebalanceSplitPercentages(
            readPercentages().map((value, valueIndex) => {
              if (Number.isFinite(value)) return value;
              return valueIndex === index ? percentages[valueIndex] : value;
            }),
            index,
            parseFloat(rawValue)
          );
          syncPercentageInputs(percentages);
          renderSummary();
        });
      });

      renderSummary();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        cleanup(null);
      }
    };

    countSelect.addEventListener("change", () => {
      if (lockPaymentCount) return;
      percentages = buildSplitPercentages(parseInt(countSelect.value, 10));
      renderRows(percentages);
    });

    modal.querySelector(".split-preview-close").addEventListener("click", () => cleanup(null));
    modal.querySelector(".split-preview-cancel").addEventListener("click", () => cleanup(null));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup(null);
    });

    applyButton.addEventListener("click", () => {
      const values = readPercentages();
      const validation = validatePercentages(values);
      if (!validation.valid) {
        renderSummary();
        return;
      }
      cleanup(values.map((value) => roundSplitPercentage(value)));
    });

    document.addEventListener("keydown", handleKeydown);
    renderRows(percentages);
  });
}

try { window.__estimateEditShowSplitPreviewModal = showSplitPreviewModal; } catch (_) {}

function showMultiSplitPreviewModal(items) {
  return new Promise((resolve) => {
    const splitItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (splitItems.length < 2) {
      resolve(null);
      return;
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; padding:24px; z-index:10000;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(860px, 100%); max-height:90vh; overflow:auto; background:#ffffff; border-radius:20px; box-shadow:0 24px 60px rgba(15,23,42,0.25); padding:24px; font-family:inherit;";
    modal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px;">
        <div>
          <div style="font-size:22px; font-weight:700; color:#0f172a;">Split Selected Line Items</div>
          <div style="font-size:14px; color:#475569; margin-top:6px;">Choose a selected line item below and configure its split using the same preview flow as a single item.</div>
        </div>
        <button type="button" class="split-preview-close" style="border:none; background:#e2e8f0; color:#0f172a; border-radius:999px; width:34px; height:34px; font-size:18px; cursor:pointer;">×</button>
      </div>
      <div class="multi-split-item-selector" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;"></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:18px;">
        <label style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#334155; font-weight:600;">
          Number of payments
          <select class="split-payment-count" style="padding:10px 12px; border:1px solid #cbd5e1; border-radius:12px; font:inherit;">
            ${Array.from({ length: 7 }, (_, index) => {
              const value = index + 2;
              return `<option value="${value}">${value} payments</option>`;
            }).join("")}
          </select>
        </label>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#334155; font-weight:600;">
          Labor amount to split
          <div class="multi-split-labor-amount" style="padding:10px 12px; border:1px solid #cbd5e1; border-radius:12px; background:#f8fafc; color:#0f172a; font-weight:700;"></div>
        </div>
      </div>
      <div class="split-percentages-container" style="display:grid; gap:12px; margin-bottom:18px;"></div>
      <div class="split-preview-error" style="display:none; margin-bottom:12px; padding:10px 12px; border-radius:12px; background:#fef2f2; color:#b91c1c; font-size:13px; font-weight:600;"></div>
      <div class="split-preview-summary" style="display:grid; gap:10px; padding:16px; border-radius:16px; background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:18px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button type="button" class="split-preview-cancel" style="padding:10px 16px; border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#0f172a; font-weight:600; cursor:pointer;">Cancel</button>
        <button type="button" class="split-preview-apply" style="padding:10px 16px; border-radius:12px; border:none; background:#0f766e; color:#fff; font-weight:700; cursor:pointer;">Apply Split</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const itemStates = splitItems.map((item, index) => {
      const normalizedPaymentCount = Math.max(2, Math.min(8, parseInt(item.paymentCount, 10) || 2));
      return {
        id: item.id || `multi-split-${index}`,
        itemName: item.itemName || `Line Item ${index + 1}`,
        laborCost: roundCurrency(item.laborCost),
        paymentCount: normalizedPaymentCount,
        percentages: Array.isArray(item.percentages) && item.percentages.length >= 2
          ? item.percentages.map((value) => roundSplitPercentage(value))
          : buildSplitPercentages(normalizedPaymentCount)
      };
    });

    let activeIndex = 0;
    const selectorContainer = modal.querySelector('.multi-split-item-selector');
    const countSelect = modal.querySelector('.split-payment-count');
    const laborAmount = modal.querySelector('.multi-split-labor-amount');
    const rowsContainer = modal.querySelector('.split-percentages-container');
    const summaryContainer = modal.querySelector('.split-preview-summary');
    const errorBox = modal.querySelector('.split-preview-error');
    const applyButton = modal.querySelector('.split-preview-apply');

    const cleanup = (result) => {
      document.removeEventListener('keydown', handleKeydown);
      overlay.remove();
      resolve(result);
    };

    const getActiveState = () => itemStates[activeIndex];

    const validatePercentages = (values) => {
      const hasInvalid = values.some((value) => !Number.isFinite(value) || value <= 0);
      const sum = values.reduce((total, value) => total + (Number(value) || 0), 0);
      if (hasInvalid) return { valid: false, message: 'Each payment percentage must be greater than 0.', sum };
      if (sum !== 100) return { valid: false, message: `Percentages must total 100%. Current total: ${sum}%.`, sum };
      return { valid: true, message: '', sum };
    };

    const renderSelector = () => {
      selectorContainer.innerHTML = itemStates.map((item, index) => {
        const isActive = index === activeIndex;
        return `
          <button type="button" class="multi-split-item-chip" data-index="${index}" style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; min-width:180px; padding:10px 12px; border-radius:14px; border:1px solid ${isActive ? '#93c5fd' : '#dbeafe'}; background:${isActive ? '#eff6ff' : '#ffffff'}; color:#0f172a; cursor:pointer; box-shadow:${isActive ? '0 10px 24px rgba(37,99,235,0.12)' : '0 2px 6px rgba(15,23,42,0.05)'};">
            <span style="font-size:13px; font-weight:700;">${item.itemName}</span>
            <span style="font-size:12px; color:#475569;">Labor $${item.laborCost.toFixed(2)} • ${item.paymentCount} payments</span>
          </button>
        `;
      }).join('');
      selectorContainer.querySelectorAll('.multi-split-item-chip').forEach((button) => {
        button.addEventListener('click', () => {
          activeIndex = parseInt(button.dataset.index, 10) || 0;
          syncActiveView();
        });
      });
    };

    const renderSummary = () => {
      const activeState = getActiveState();
      const values = activeState.percentages.map((value) => Number.isFinite(value) ? roundSplitPercentage(value) : 0);
      const validation = validatePercentages(values);
      const laborShares = buildLaborShares(activeState.laborCost, values);

      errorBox.style.display = validation.valid ? 'none' : 'block';
      errorBox.textContent = validation.message;
      const hasInvalidItem = itemStates.some((item) => !validatePercentages(item.percentages).valid);
      applyButton.disabled = hasInvalidItem;
      applyButton.style.opacity = hasInvalidItem ? '0.6' : '1';
      applyButton.style.cursor = hasInvalidItem ? 'not-allowed' : 'pointer';

      summaryContainer.innerHTML = values.map((percentage, index) => {
        const estimateImpact = index === 0 ? 'Keeps current estimate price and material.' : 'Creates a $0 duplicate so estimate total does not increase.';
        return `
          <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:12px 14px; border-radius:14px; background:#fff; border:1px solid #e2e8f0;">
            <div>
              <div style="font-size:14px; font-weight:700; color:#0f172a;">Payment ${index + 1}</div>
              <div style="font-size:12px; color:#64748b; margin-top:4px;">${estimateImpact}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px; font-weight:700; color:#0f172a;">${roundSplitPercentage(percentage)}%</div>
              <div style="font-size:12px; color:#0f766e; margin-top:4px;">Labor $${roundCurrency(laborShares[index] || 0).toFixed(2)}</div>
            </div>
          </div>
        `;
      }).join('') + `
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; font-size:12px; color:#475569; font-weight:700;">
          <span>Total percentage</span>
          <span>${validation.sum}%</span>
        </div>
      `;
    };

    const renderRows = () => {
      const activeState = getActiveState();
      rowsContainer.innerHTML = activeState.percentages.map((percentage, index) => `
        <label style="display:grid; grid-template-columns:minmax(120px, 1fr) minmax(120px, 180px); gap:12px; align-items:center; font-size:13px; color:#334155; font-weight:600;">
          <span>Payment ${index + 1} percentage</span>
          <span style="display:flex; align-items:center; gap:8px; padding:0 12px; border:1px solid #cbd5e1; border-radius:12px; background:#fff;">
            <input type="number" min="1" max="100" step="1" value="${roundSplitPercentage(percentage)}" class="split-percentage-input" data-index="${index}" style="flex:1; min-width:0; padding:10px 0; border:none; outline:none; font:inherit; background:transparent;">
            <span style="font-size:13px; color:#64748b; font-weight:700;">%</span>
          </span>
        </label>
      `).join('');

      rowsContainer.querySelectorAll('.split-percentage-input').forEach((input) => {
        input.addEventListener('input', () => {
          const activeItem = getActiveState();
          const index = parseInt(input.dataset.index, 10) || 0;
          const rawValue = input.value.trim();
          if (rawValue === '') {
            renderSummary();
            return;
          }
          activeItem.percentages = rebalanceSplitPercentages(
            activeItem.percentages.map((value) => roundSplitPercentage(value)),
            index,
            parseFloat(rawValue)
          );
          renderSelector();
          syncActiveView(false);
        });
      });
    };

    const syncActiveView = (refreshRows = true) => {
      const activeState = getActiveState();
      countSelect.value = String(activeState.paymentCount);
      laborAmount.textContent = `$${activeState.laborCost.toFixed(2)}`;
      renderSelector();
      if (refreshRows) renderRows();
      renderSummary();
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') cleanup(null);
    };

    countSelect.addEventListener('change', () => {
      const activeState = getActiveState();
      activeState.paymentCount = Math.max(2, Math.min(8, parseInt(countSelect.value, 10) || 2));
      activeState.percentages = buildSplitPercentages(activeState.paymentCount);
      syncActiveView();
    });

    modal.querySelector('.split-preview-close').addEventListener('click', () => cleanup(null));
    modal.querySelector('.split-preview-cancel').addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cleanup(null);
    });

    applyButton.addEventListener('click', () => {
      const invalidItem = itemStates.find((item) => !validatePercentages(item.percentages).valid);
      if (invalidItem) {
        activeIndex = Math.max(0, itemStates.indexOf(invalidItem));
        syncActiveView();
        return;
      }
      cleanup(itemStates.map((item) => ({
        id: item.id,
        paymentCount: item.paymentCount,
        percentages: item.percentages.map((value) => roundSplitPercentage(value))
      })));
    });

    document.addEventListener('keydown', handleKeydown);
    syncActiveView();
  });
}

try { window.__estimateEditShowMultiSplitPreviewModal = showMultiSplitPreviewModal; } catch (_) {}

function applySplitToCard(card, splitPercentages, options = {}) {
  if (!card || !Array.isArray(splitPercentages) || splitPercentages.length < 2) return false;

  const {
    skipPersist = false,
    skipToast = false
  } = options;

  const nameInput = card.querySelector(".item-name");
  const quantityInput = card.querySelector(".item-quantity");
  const areaInput = card.querySelector(".item-area");
  const lengthInput = card.querySelector(".item-length");
  const laborCostInput = card.querySelector(".item-labor-cost");
  const calcModeSelect = card.querySelector(".item-calc-mode");
  const statusDropdown = card.querySelector(".item-status-dropdown");
  const baseName = (nameInput?.value || "Line Item").trim();
  const laborValue = parseFloat(laborCostInput?.value) || 0;
  const splitGroupId = card.dataset.splitGroupId || `split-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const currentAssignedTo = card.getAttribute("data-assigned-to") || "";
  const quantityValue = parseFloat(quantityInput?.value) || 1;
  const areaValue = parseFloat(areaInput?.value) || 0;
  const lengthValue = parseFloat(lengthInput?.value) || 0;
  const laborShares = buildLaborShares(laborValue, splitPercentages);

  const categoryHeader = (() => {
    let header = card.previousElementSibling;
    while (header && !header.classList.contains("category-header")) {
      header = header.previousElementSibling;
    }
    return header;
  })();

  if (nameInput) nameInput.value = `${baseName} (${splitPercentages[0]}%)`;
  if (laborCostInput) {
    laborCostInput.value = laborShares[0].toFixed(2);
    laborCostInput.dataset.rate = String(quantityValue > 0 ? (laborShares[0] / quantityValue) : laborShares[0]);
    laborCostInput.dataset.editMode = "";
  }
  syncSplitBadge(card, splitPercentages[0], splitGroupId);

  let insertAfterCard = card;
  for (let index = 1; index < splitPercentages.length; index += 1) {
    const splitPercentage = splitPercentages[index];
    const splitItem = {
      _id: undefined,
      type: "item",
      name: baseName,
      description: card.querySelector(".item-description")?.value?.trim() || "",
      costCode: card.querySelector(".item-cost-code")?.value?.trim() || "Uncategorized",
      quantity: quantityValue,
      unitPrice: 0,
      calcMode: calcModeSelect?.value || "each",
      area: areaValue,
      length: lengthValue,
      laborCost: laborShares[index],
      materialCost: 0,
      total: 0,
      assignedTo: getVendorFromCard(card),
      status: statusDropdown?.value || "in-progress",
      splitPercentage,
      splitGroupId,
      startDate: card.querySelector(".item-start-date")?.value || null,
      endDate: card.querySelector(".item-end-date")?.value || null
    };

    addLineItemCard(splitItem, categoryHeader, insertAfterCard);
    const splitCard = insertAfterCard.nextElementSibling;
    if (!splitCard || !splitCard.classList.contains("line-item-card")) continue;

    const splitNameInput = splitCard.querySelector(".item-name");
    const splitPriceInput = splitCard.querySelector(".item-price");
    const splitLaborInput = splitCard.querySelector(".item-labor-cost");
    const splitMaterialInput = splitCard.querySelector(".item-material-cost");
    if (splitNameInput) splitNameInput.value = `${baseName} (${splitPercentage}%)`;
    if (splitPriceInput) splitPriceInput.value = 0;
    if (splitMaterialInput) {
      splitMaterialInput.value = "0.00";
      splitMaterialInput.dataset.rate = "0";
      splitMaterialInput.dataset.editMode = "";
    }
    if (splitLaborInput) {
      splitLaborInput.value = laborShares[index].toFixed(2);
      splitLaborInput.dataset.rate = String(quantityValue > 0 ? (laborShares[index] / quantityValue) : laborShares[index]);
      splitLaborInput.dataset.editMode = "";
    }
    syncSplitBadge(splitCard, splitPercentage, splitGroupId);
    if (currentAssignedTo) splitCard.setAttribute("data-assigned-to", currentAssignedTo);
    insertAfterCard = splitCard;
  }

  if (currentAssignedTo) card.setAttribute("data-assigned-to", currentAssignedTo);
  try {
    if (typeof card.__updateCardValues === "function") card.__updateCardValues();
  } catch (_) {}

  if (!skipPersist) {
    updateSummary();
    updateSelectedLaborCost();
    try { autoSaveEstimate(); } catch (_) {}
    try {
      if (typeof isListViewActive === "function" && isListViewActive()) {
        if (typeof buildListViewFromCards === "function") buildListViewFromCards();
        if (typeof updateTableFooterTotals === "function") updateTableFooterTotals(false);
      }
    } catch (_) {}
    if (!skipToast && typeof window.__estimateEditShowToast === 'function') {
      window.__estimateEditShowToast(`Split line item into ${splitPercentages.length} payments: ${splitPercentages.join("%, ")}%`);
    }
  }

  return true;
}

async function runSplitFlowForCard(card) {
  if (!card) return false;

  if (isCardAssigned(card)) {
    showToast("Unassign line item before splitting.");
    return false;
  }

  const nameInput = card.querySelector(".item-name");
  const quantityInput = card.querySelector(".item-quantity");
  const areaInput = card.querySelector(".item-area");
  const lengthInput = card.querySelector(".item-length");
  const laborCostInput = card.querySelector(".item-labor-cost");
  const calcModeSelect = card.querySelector(".item-calc-mode");
  const statusDropdown = card.querySelector(".item-status-dropdown");
  const baseName = (nameInput?.value || "Line Item").trim();
  const laborValue = parseFloat(laborCostInput?.value) || 0;
  const splitPercentages = await showSplitPreviewModal({ itemName: baseName, laborCost: laborValue });

  if (!Array.isArray(splitPercentages) || splitPercentages.length < 2) {
    return false;
  }

  return applySplitToCard(card, splitPercentages);
}

try { window.__estimateEditRunSplitFlowForCard = runSplitFlowForCard; } catch (_) {}


// Add Line Item Card Function
function addLineItemCard(item = {}, categoryHeader = null, insertAfter = null, options = {}) {
  const shouldAutoFocus = options.autoFocus !== false && shouldAllowEstimateAutoFocus();
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
    { value: "new", label: "New" },
    { value: "in-progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "approved", label: "Approved" },
    { value: "rework", label: "Rework" }
  ];
  const status = item.status || "new";
  const statusClass = getStatusClass(status);
  const phase = normalizeProjectPhase(item.phase);
  const percentComplete = clampProjectPhaseProgress(item.percentComplete, status);

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
    <input type="checkbox" class="line-item-select">
    <button class="btn card-drag-handle" type="button" draggable="true" title="Drag line item">::</button>
    <input type="text" class="item-name" value="${item.name || ""}" placeholder="Item Name">
    <div class="suggestion-box" style="display:none; position:absolute; background:#fff; border:1px solid #ccc; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); max-height:350px; overflow-y:auto; z-index:1000;"></div>
    <button class="btn delete-line-item">Delete</button>
    ${item.assignedTo ? `<button class="btn unassign-item">Unassign</button>` : ""}
    <button class="btn split-line-item" type="button" style="display:none;">Split</button>
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
      <label>Project Phase</label>
      <select class="item-phase-dropdown">
        ${PROJECT_PHASES.map((option) => `<option value="${option.value}" ${phase === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
      </select>
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
    <div class="detail">
      <label>Actual Cost to Date</label>
      <input type="text" class="item-actual-cost" value="$0.00" readonly style="background:#f1f5f9;">
    </div>
    <div class="detail">
      <label>Material Cost to Date</label>
      <input type="text" class="item-material-cost-to-date" value="$0.00" readonly style="background:#f1f5f9;">
    </div>
    <div class="detail">
      <label>Labor Cost to Date</label>
      <input type="text" class="item-labor-cost-to-date" value="$0.00" readonly style="background:#f1f5f9;">
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
    <div class="card-phase-grid">
      <div class="card-phase-field">
        <label for="start-date-${card.getAttribute("data-item-id")}">Target Start</label>
        <input type="date" class="item-start-date" id="start-date-${card.getAttribute("data-item-id")}" value="${startDateValue}">
      </div>
      <div class="card-phase-field">
        <label for="end-date-${card.getAttribute("data-item-id")}">Target Finish</label>
        <input type="date" class="item-end-date" id="end-date-${card.getAttribute("data-item-id")}" value="${endDateValue}">
      </div>
      <div class="card-phase-field">
        <label for="progress-${card.getAttribute("data-item-id")}">% Complete</label>
        <div class="phase-percent-input-wrap">
          <input type="number" class="item-percent-complete" id="progress-${card.getAttribute("data-item-id")}" value="${percentComplete}" min="0" max="100" step="1">
          <span>%</span>
        </div>
      </div>
      <div class="phase-status-cluster">
        <span class="phase-status-chip">
          <span>Status</span>
        <select class="item-status-dropdown ${statusClass}" style="margin-left:8px; padding:4px 10px; border-radius:6px; border:1px solid #ccc; font-weight:600;">
          ${statusOptions.map(opt => `<option value="${opt.value}" ${status === opt.value ? "selected" : ""}>${opt.label}</option>`).join("")}
        </select>
        </span>
        <span class="phase-vendor-pill">
          <span>Assigned</span>
          <span class="vendor-name tooltip-click" data-fullname="${assignedToName}">
            ${assignedToInitials}
          </span>
        </span>
      </div>
    </div>
    <span class="item-total" style="font-size:1.15em; font-weight:600; color:#2563eb; margin-left:auto;">
      $0.00
    </span>
  </div>
`;

  syncSplitBadge(card, item.splitPercentage, item.splitGroupId || null);

  // Status dropdown handler
  const statusDropdown = card.querySelector(".item-status-dropdown");
  const phaseDropdown = card.querySelector('.item-phase-dropdown');
  const percentCompleteInput = card.querySelector('.item-percent-complete');
  statusDropdown.className = "item-status-dropdown " + getStatusClass(status);

  const syncPhaseTrackingUi = () => {
    if (phaseDropdown) {
      const normalizedPhase = normalizeProjectPhase(phaseDropdown.value);
      phaseDropdown.value = normalizedPhase;
      card.dataset.phase = normalizedPhase;
    }
    if (percentCompleteInput) {
      const normalizedProgress = clampProjectPhaseProgress(percentCompleteInput.value, statusDropdown.value);
      percentCompleteInput.value = String(normalizedProgress);
      card.dataset.percentComplete = String(normalizedProgress);
    }
    renderProjectPhaseBar();
  };

  syncPhaseTrackingUi();

  phaseDropdown?.addEventListener('change', () => {
    syncPhaseTrackingUi();
    applyFilters();
  });

  percentCompleteInput?.addEventListener('input', () => {
    card.dataset.percentComplete = String(clampProjectPhaseProgress(percentCompleteInput.value, statusDropdown.value));
    renderProjectPhaseBar();
  });

  percentCompleteInput?.addEventListener('change', () => {
    syncPhaseTrackingUi();
    applyFilters();
    try { queueCardAutoSave(300); } catch (_) {}
  });

  statusDropdown.addEventListener("change", async function () {
    const newStatus = statusDropdown.value;
    const lineItemId = card.getAttribute("data-item-id");
    const vendorId = card.getAttribute("data-assigned-to");
    const nextPercentComplete = getNextPercentCompleteForStatus(newStatus, percentCompleteInput?.value);
    const result = await persistLineItemStatusChange(lineItemId, newStatus, {
      vendorId,
      percentComplete: nextPercentComplete
    });

    if (!result.ok) {
      showToast("Failed to update estimate status");
      return;
    }
    // Update dropdown color
    const newClass = getStatusClass(newStatus);
    statusDropdown.className = "item-status-dropdown " + newClass;
    if (percentCompleteInput) {
      percentCompleteInput.value = String(nextPercentComplete);
    }
    syncPhaseTrackingUi();
    applyFilters();
    clearSelectedLineItems();
    if (result.vendorSyncFailed) {
      showToast("Vendor status update failed");
      return;
    }
    showToast("Status updated!");
  });

  // Start/End Date update handlers
  const startDateInput = card.querySelector(".item-start-date");
  const endDateInput = card.querySelector(".item-end-date");
  const lineItemId = card.getAttribute("data-item-id");

  if (startDateInput) {
    startDateInput.addEventListener("change", () => {
      renderProjectPhaseBar();
      applyFilters();
      clearSelectedLineItems();
      fetch(`/api/estimates/line-items/${lineItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: startDateInput.value })
      }).then((response) => {
        if (!response.ok) {
          throw new Error("Failed to update start date");
        }
        showToast("Start date updated!");
      }).catch(() => {
        showToast("Failed to update start date");
      });
    });
  }
  if (endDateInput) {
    endDateInput.addEventListener("change", () => {
      renderProjectPhaseBar();
      applyFilters();
      clearSelectedLineItems();
      fetch(`/api/estimates/line-items/${lineItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: endDateInput.value })
      }).then((response) => {
        if (!response.ok) {
          throw new Error("Failed to update end date");
        }
        showToast("End date updated!");
      }).catch(() => {
        showToast("Failed to update end date");
      });
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

 

  syncVendorTriggerState(card);
   

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
  rebuildSplitGroupHeaders();
  applyCategoryCollapseState();
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
  const splitButton = card.querySelector(".split-line-item");

  const toggleSplitButton = () => {
    if (!splitButton) return;
    splitButton.style.display = checkbox && checkbox.checked ? "inline-flex" : "none";
  };

  checkbox.addEventListener("change", updateSelectedLaborCost);
  checkbox.addEventListener("change", toggleSplitButton);
  toggleSplitButton();

  if (splitButton) {
    splitButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await runSplitFlowForCard(card);
    });
  }

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
  clearSelectedLineItems();
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

card.__updateCardValues = updateCardValues;

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
    calcModeSelect,
    phaseDropdown,
    percentCompleteInput,
    startDateInput,
    endDateInput

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


  setTimeout(async () => {
    // You must have window.expenses and window.invoices loaded globally for this to work
    if (item._id && window.expenses && window.invoices) {
      // Material = sum of expenses for this item
      const material = window.expenses.filter(e => e.item?.itemId === item._id).reduce((sum, e) => sum + (e.amount || 0), 0);
      // Labor = sum of bills for this item (from invoices)
      let labor = 0;
      window.invoices.forEach(inv => {
        (inv.lineItems || []).forEach(li => {
          if (li.itemId === item._id || (li.itemId && li.itemId.toString() === item._id.toString())) {
            labor += li.total || (li.quantity * li.unitPrice) || 0;
          }
        });
      });
      const actual = material + labor;
      card.querySelector('.item-actual-cost').value = `$${actual.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      card.querySelector('.item-material-cost-to-date').value = `$${material.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      card.querySelector('.item-labor-cost-to-date').value = `$${labor.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    }
  }, 0);

  // Initial calculation
  updateCardValues();

  // Append the card to the container
  const lineItemsContainer = document.getElementById("line-items-cards");
  if (insertAfter && insertAfter.parentNode) {
    insertAfter.parentNode.insertBefore(card, insertAfter.nextSibling);
  } else if (categoryHeader && categoryHeader.parentNode) {
    let referenceNode = categoryHeader.nextSibling;
    while (referenceNode && !referenceNode.classList.contains("category-header")) {
      referenceNode = referenceNode.nextSibling;
    }
    categoryHeader.parentNode.insertBefore(card, referenceNode);
  } else {
    lineItemsContainer.appendChild(card);
  }
  rebuildSplitGroupHeaders();
  applyCategoryCollapseState();
  try { if (typeof window.__estimateEditWireCardDrag === 'function') window.__estimateEditWireCardDrag(card); } catch (_) {}
  if (shouldAutoFocus) {
    setTimeout(() => {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      const nameInput = card.querySelector(".item-name");
      if (nameInput) {
        nameInput.focus();
        nameInput.select && nameInput.select();
      }
    }, 100);
  }

  return card;
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

  const formattedSubtotal = formatEstimateCurrency(subtotal);
  const formattedTotal = formatEstimateCurrency(total);
  const formattedLabor = formatEstimateCurrency(totalLabor);
  const formattedMaterial = formatEstimateCurrency(totalMaterial);
  const formattedProfit = formatEstimateCurrency(projectedProfit);

  document.getElementById("subtotal").textContent = formattedSubtotal;
  document.getElementById("total").textContent = formattedTotal;
  document.getElementById("total-labor-cost").textContent = formattedLabor;
  document.getElementById("total-material-cost").textContent = formattedMaterial;
  document.getElementById("projected-profit").textContent = formattedProfit;
  renderProjectPhaseBar();
  try { syncAllCategoryHeaderTotals(); } catch (_) {}
  try {
    if (typeof updateTableFooterTotals === 'function') {
      updateTableFooterTotals(shouldUseFilteredTotalsForMobileFooter());
    }
  } catch (_) {}
  // Keep list view in sync if visible (debounced to avoid destroying focused input)
  if (isListViewActive && isListViewActive()) {
    scheduleListViewRebuild(600);
  }
  if (isGanttViewActive && isGanttViewActive()) {
    try { buildGanttViewFromCards(); } catch (_) {}
  }
}
  

// ✅ Function to Calculate and Display Selected Labor Cost
  function clearSelectedLineItems() {
    const selectedCardCheckboxes = Array.from(document.querySelectorAll('.line-item-card .line-item-select:checked'));
    if (!selectedCardCheckboxes.length) {
      try { syncCategorySelectionCheckboxes(); } catch (_) {}
      try { syncListViewSelectAllCheckboxState(); } catch (_) {}
      return false;
    }

    selectedCardCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    document.querySelectorAll('#line-items-table-container tbody .lv-drag-select-stack input[type="checkbox"]:checked')
      .forEach((checkbox) => {
        checkbox.checked = false;
      });

    try { syncCategorySelectionCheckboxes(); } catch (_) {}
    try { syncListViewSelectAllCheckboxState(); } catch (_) {}
    return true;
  }

function getSelectableCategoryLineItemCheckboxes(header) {
  return getCategoryCards(header)
    .map((card) => card.querySelector('.line-item-select'))
    .filter(Boolean);
}

function toggleCategoryLineItemSelection(header, shouldSelect) {
  const checkboxes = getSelectableCategoryLineItemCheckboxes(header);
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked === shouldSelect) return;
    checkbox.checked = shouldSelect;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  try { syncCategorySelectionCheckboxes(); } catch (_) {}
}

function syncCategorySelectionCheckboxes() {
  document.querySelectorAll('.category-header').forEach((header) => {
    const selectableCheckboxes = getSelectableCategoryLineItemCheckboxes(header);
    const selectedCount = selectableCheckboxes.filter((checkbox) => checkbox.checked).length;
    const totalCount = selectableCheckboxes.length;
    const allSelected = totalCount > 0 && selectedCount === totalCount;
    const partiallySelected = selectedCount > 0 && selectedCount < totalCount;
    const key = ensureCategoryCollapseKey(header);

    const syncCheckbox = (checkbox) => {
      if (!checkbox) return;
      checkbox.disabled = totalCount === 0;
      checkbox.checked = allSelected;
      checkbox.indeterminate = partiallySelected;
      checkbox.title = allSelected ? 'Unselect category line items' : 'Select category line items';
      checkbox.setAttribute('aria-label', checkbox.title);
    };

    syncCheckbox(header.querySelector('.category-select-toggle'));
    document.querySelectorAll(`.lv-category-group-row[data-category-key="${key}"] .lv-category-select-toggle`).forEach(syncCheckbox);
  });
}

try { window.__estimateEditGetSelectableCategoryLineItemCheckboxes = getSelectableCategoryLineItemCheckboxes; } catch (_) {}
try { window.__estimateEditToggleCategoryLineItemSelection = toggleCategoryLineItemSelection; } catch (_) {}
try { window.__estimateEditSyncCategorySelectionCheckboxes = syncCategorySelectionCheckboxes; } catch (_) {}

function getSelectableLineItemCheckboxes() {
  return Array.from(document.querySelectorAll('.line-item-card .line-item-select'))
    .filter(Boolean);
}

function syncListViewSelectAllCheckboxState() {
  const selectAllCheckbox = document.getElementById('list-view-select-all');
  if (!selectAllCheckbox) return;

  const selectableCheckboxes = getSelectableLineItemCheckboxes();
  const selectedCount = selectableCheckboxes.filter((checkbox) => checkbox.checked).length;
  const totalCount = selectableCheckboxes.length;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  selectAllCheckbox.disabled = totalCount === 0;
  selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  selectAllCheckbox.checked = isAllSelected;
  selectAllCheckbox.title = isAllSelected ? 'Unselect all line items' : 'Select all line items';
  selectAllCheckbox.setAttribute('aria-label', selectAllCheckbox.title);
}

function syncListViewRowSelectionCheckboxes() {
  document.querySelectorAll('#line-items-table-container tr[data-card-id]').forEach((row) => {
    const itemId = row.getAttribute('data-card-id');
    if (!itemId) return;
    const cardCheckbox = document.querySelector(`.line-item-card[data-item-id="${itemId}"] .line-item-select`);
    const rowCheckbox = row.querySelector('.lv-drag-select-stack input[type="checkbox"]');
    if (!cardCheckbox || !rowCheckbox) return;
    rowCheckbox.checked = cardCheckbox.checked;
    rowCheckbox.disabled = cardCheckbox.disabled;
  });
}

function updateSelectedLaborCost() {
  const selectedItems = Array.from(document.querySelectorAll(".line-item-select:checked"))
    .filter(Boolean);

  let totalLaborCost = 0;
  let totalSelectedAmount = 0;

  selectedItems.forEach(item => {
    const card = item.closest(".line-item-card");
    totalSelectedAmount += getCardDisplayAmount(card);
    const laborCost = parseFloat(card.querySelector(".item-labor-cost").value.replace("$", ""));
    totalLaborCost += isNaN(laborCost) ? 0 : laborCost;
  });

  const listViewFooter = document.getElementById('list-view-footer');
  const selectionSummary = listViewFooter?.querySelector('[data-role="selection-summary"]');
  const selectionSummaryText = listViewFooter?.querySelector('[data-role="selection-summary-text"]');
  const listViewActive = !!listViewFooter && listViewFooter.style.display !== 'none';
  const ganttViewActive = typeof isGanttViewActive === 'function' && isGanttViewActive();
  const cardViewActive = !listViewActive && !ganttViewActive;
  let floatingLaborCost = document.getElementById("floating-labor-cost");

  if (!floatingLaborCost) {
    floatingLaborCost = document.createElement("div");
    floatingLaborCost.id = "floating-labor-cost";
    floatingLaborCost.style.position = "fixed";
    floatingLaborCost.style.bottom = "3px";
    floatingLaborCost.style.right = "20px";
    floatingLaborCost.style.backgroundColor = "#007bff";
    floatingLaborCost.style.color = "#fff";
    floatingLaborCost.style.padding = "8px 20px";
    floatingLaborCost.style.borderRadius = "6px";
    floatingLaborCost.style.zIndex = "9999";
    floatingLaborCost.style.display = "none";
    document.body.appendChild(floatingLaborCost);
  }

  if (cardViewActive && selectedItems.length > 0) {
    floatingLaborCost.style.display = "block";
    floatingLaborCost.textContent = `Selected Amount: ${formatEstimateCurrency(totalSelectedAmount)} | Labor: ${formatEstimateCurrency(totalLaborCost)}`;
  } else {
    floatingLaborCost.style.display = "none";
  }

  if (selectionSummary && selectionSummaryText) {
    if (listViewActive && selectedItems.length > 0) {
      selectionSummary.classList.add('is-visible');
      selectionSummaryText.textContent = `Selected Amount: ${formatEstimateCurrency(totalSelectedAmount)} | Labor: ${formatEstimateCurrency(totalLaborCost)}`;
    } else {
      selectionSummary.classList.remove('is-visible');
      selectionSummaryText.textContent = '';
    }
  }

  try {
    if (typeof window.__estimateEditSyncBatchActionState === 'function') {
      window.__estimateEditSyncBatchActionState(selectedItems.length, totalLaborCost);
    }
  } catch (_) {}
  try { syncMobileBottomBarState(selectedItems.length); } catch (_) {}
  try { syncListViewRowSelectionCheckboxes(); } catch (_) {}
  try { syncCategorySelectionCheckboxes(); } catch (_) {}
  try { syncListViewSelectAllCheckboxState(); } catch (_) {}
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

  const selectedCards = Array.from(document.querySelectorAll(".line-item-select:checked"))
    .map((checkbox) => checkbox.closest(".line-item-card"))
    .filter(Boolean);
  const assignableCards = selectedCards.filter((card) => !isCardAssigned(card));
  const skippedAssignedCount = selectedCards.length - assignableCards.length;

  const selectedItems = assignableCards.map((card) => {
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
      costCode = categoryHeader?.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || 'Uncategorized';
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
    showToast(skippedAssignedCount
      ? "Line item already assigned. Remove current vendor first before reassigning."
      : "No items selected for assignment.");
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
        syncVendorTriggerState(card);

        // Keep assigned items selectable for batch actions, but clear the current selection.
        const checkbox = card.querySelector(".line-item-select");
        if (checkbox) {
          checkbox.checked = false;
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

    showToast(skippedAssignedCount
      ? `✅ ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} assigned. ${skippedAssignedCount} already assigned item${skippedAssignedCount === 1 ? '' : 's'} skipped. Remove current vendor first before reassigning.`
      : "✅ Items assigned successfully!");
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
      case "new":
        return "status-in-progress";
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

    try { window.__estimateEditGetStatusClass = getStatusClass; } catch (_) {}



  
function unassignItem(card) {
  const itemId = card.getAttribute("data-item-id");

  // Clear the "Assigned to" field in the UI
  card.setAttribute("data-assigned-to", "");
  card.querySelector(".vendor-name").textContent = "Unassigned";
  card.querySelector(".vendor-name").setAttribute('data-fullname', 'Unassigned');
  syncVendorTriggerState(card);

  // Re-enable the checkbox for the item
  const checkbox = card.querySelector(".line-item-select");
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
// Save Estimate
async function performSaveEstimate(options = {}) {
  const {
    silentSuccess = false,
    loadingMessage = 'Saving estimate...'
  } = normalizeSaveEstimateOptions(options);

  __estimateSaveInFlightCount += 1;
  showToast(loadingMessage, { variant: 'loading', persist: true });

  let completedWithError = false;
  const lineItems = [];
  let currentCategory = null;
  let categorySortOrder = 0;
  let skippedDraftNewItems = false; // Track unnamed brand-new items we intentionally skip

  document.querySelectorAll("#line-items-cards > div").forEach((element) => {
    if (element.classList.contains("category-header")) {
      currentCategory = {
        _id: element.getAttribute("data-category-id") || undefined,
        type: "category",
        category: element.querySelector('.category-title span[contenteditable]').textContent.trim(),
        sortOrder: categorySortOrder++,
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
        sortOrder: currentCategory ? currentCategory.items.length : 0,
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
        status: element.querySelector(".item-status-dropdown")?.value || "new",
        phase: normalizeProjectPhase(element.querySelector('.item-phase-dropdown')?.value || DEFAULT_PROJECT_PHASE),
        percentComplete: clampProjectPhaseProgress(element.querySelector('.item-percent-complete')?.value, element.querySelector('.item-status-dropdown')?.value || 'new'),
        startDate: element.querySelector(".item-start-date")?.value || undefined,
        endDate: element.querySelector(".item-end-date")?.value || undefined,
        assignedTo,
        costCode: element.querySelector(".item-cost-code")?.value.trim() || "Uncategorized",
        splitPercentage: element.dataset.splitPercentage ? parseFloat(element.dataset.splitPercentage) : undefined,
        splitGroupId: element.dataset.splitGroupId || undefined
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
    let existingEstimate = __estimateSnapshot;
    if (estimateId && !existingEstimate) {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (!response.ok) throw new Error("Failed to fetch existing estimate.");
      const dto = await response.json();
      existingEstimate = dto?.estimate || null; // API returns { success, estimate }
      __estimateSnapshot = existingEstimate;
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
    __estimateSnapshot = result?.estimate || updatedEstimate;
    // Inform about skipped drafts if any
    if (skippedDraftNewItems) {
      showToast("Note: Unnamed new line items were not saved. Add a name to include them.", { variant: 'info' });
    }
    if (!silentSuccess) {
      showToast(`Estimate ${method === "POST" ? "created" : "updated"} successfully!`, { variant: 'success' });
    }

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
    if (patchPromises.length) {
      Promise.allSettled(patchPromises).catch(() => {});
    }

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

          applyCategoryCollapseState();
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
    completedWithError = true;
    console.error("Error saving estimate:", error);
    showToast(`Error saving the estimate${error?.message ? ": " + error.message : ". Please try again."}`, { variant: 'error' });
  } finally {
    __estimateSaveInFlightCount = Math.max(0, __estimateSaveInFlightCount - 1);
    if (__estimateSaveInFlightCount > 0 && !completedWithError) {
      showToast(loadingMessage, { variant: 'loading', persist: true });
    } else if (__estimateSaveInFlightCount === 0 && !completedWithError && silentSuccess) {
      hideToast();
    }
  }
}

async function saveEstimate(options = {}) {
  const normalizedOptions = normalizeSaveEstimateOptions(options);

  if (__estimateSavePromise) {
    __estimateQueuedSaveOptions = __estimateQueuedSaveOptions
      ? mergeSaveEstimateOptions(__estimateQueuedSaveOptions, normalizedOptions)
      : normalizedOptions;
    showToast(normalizedOptions.loadingMessage, { variant: 'loading', persist: true });
    return __estimateSavePromise;
  }

  __estimateSavePromise = performSaveEstimate(normalizedOptions);

  try {
    await __estimateSavePromise;
  } finally {
    __estimateSavePromise = null;
  }

  if (__estimateQueuedSaveOptions) {
    const queuedOptions = __estimateQueuedSaveOptions;
    __estimateQueuedSaveOptions = null;
    return saveEstimate(queuedOptions);
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
            Phase: getProjectPhaseLabel(item.phase || DEFAULT_PROJECT_PHASE),
            costCode: item.costCode,
            Name: item.name,
            Description: item.description,
            Quantity: item.quantity,
            UnitPrice: item.unitPrice,
            Total: item.quantity * item.unitPrice,
            PercentComplete: `${clampProjectPhaseProgress(item.percentComplete, item.status || 'new')}%`,
            TargetStart: item.startDate ? String(item.startDate).substring(0, 10) : '',
            TargetFinish: item.endDate ? String(item.endDate).substring(0, 10) : '',
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
  function showToast(message, options = {}) {
    if (typeof window.__estimateEditShowToast === 'function') {
      window.__estimateEditShowToast(message, options);
    }
  }

  const floatingMenu = document.getElementById("floating-vendor-select");
  const dropdown = document.getElementById("floating-vendor-dropdown");
  const searchInput = document.getElementById("floating-vendor-search");
  const assignButton = document.getElementById("assign-vendor-btn");
  const cancelButton = document.getElementById("cancel-vendor-btn");
  if (!floatingMenu || !dropdown || !assignButton || !cancelButton) return;

  let selectedCardForVendor = null;
  const FLOATING_VENDOR_EXPANDED_ROWS = 6;

  function setFloatingVendorDropdownExpanded(expanded) {
    if (expanded) {
      dropdown.size = FLOATING_VENDOR_EXPANDED_ROWS;
      dropdown.setAttribute("data-expanded", "true");
    } else {
      dropdown.size = 1;
      dropdown.removeAttribute("data-expanded");
    }
  }

  function populateFloatingVendorOptions(searchTerm = "") {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    dropdown.innerHTML = '<option value="">Select a Vendor</option>';
    const vendors = window.vendorMap ? Object.values(window.vendorMap) : [];
    vendors
      .filter((vendor) => !normalizedSearch || String(vendor.name || "").toLowerCase().includes(normalizedSearch))
      .forEach((vendor) => {
        const option = document.createElement("option");
        option.value = vendor._id;
        option.textContent = vendor.name;
        dropdown.appendChild(option);
      });
    setFloatingVendorDropdownExpanded(!!normalizedSearch);
  }

  function getSelectedVendorCards() {
    return Array.from(document.querySelectorAll('.line-item-select:checked'))
      .map((checkbox) => checkbox.closest('.line-item-card'))
      .filter((card) => card && !isCardAssigned(card))
      .filter(Boolean);
  }

  function hideFloatingVendorSelect(resetSelection = true) {
    floatingMenu.style.display = "none";
    if (searchInput) searchInput.value = "";
    populateFloatingVendorOptions();
    setFloatingVendorDropdownExpanded(false);
    if (resetSelection && selectedCardForVendor) {
      const checkbox = selectedCardForVendor.querySelector(".line-item-select");
      if (checkbox) checkbox.checked = false;
    }
    selectedCardForVendor = null;
  }

  // Show menu when a line-item-select is checked
  document.body.addEventListener("change", function(e) {
    if (e.target.classList.contains("line-item-select")) {
      const selectedCards = getSelectedVendorCards();
      if (!selectedCards.length) {
        hideFloatingVendorSelect(false);
        return;
      }
      if (e.target.checked) {
        selectedCardForVendor = e.target.closest(".line-item-card");
      } else if (!selectedCardForVendor || !selectedCards.includes(selectedCardForVendor)) {
        selectedCardForVendor = selectedCards[0];
      }
      showFloatingVendorSelect();
    }
  });

  function showFloatingVendorSelect() {
    if (searchInput) searchInput.value = "";
    populateFloatingVendorOptions();
    setFloatingVendorDropdownExpanded(false);
    floatingMenu.style.display = "block";
    searchInput?.focus();
  }

  searchInput?.addEventListener("input", () => {
    populateFloatingVendorOptions(searchInput.value);
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFloatingVendorDropdownExpanded(true);
      dropdown.focus();
      dropdown.selectedIndex = Math.min(1, dropdown.options.length - 1);
    }
  });

  dropdown.addEventListener("blur", () => {
    if (!searchInput?.value.trim()) setFloatingVendorDropdownExpanded(false);
  });

  // Assign vendor when button clicked
assignButton.onclick = async function() {
  const vendorId = dropdown.value;
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

  cancelButton.onclick = hideFloatingVendorSelect;
})();

function isMobileEstimateViewport() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
}

function shouldAllowEstimateAutoFocus() {
  return !isMobileEstimateViewport();
}

function getSelectedAssignableCards() {
  return Array.from(document.querySelectorAll('.line-item-select:checked'))
    .map((checkbox) => checkbox.closest('.line-item-card'))
    .filter(Boolean);
}

function getCardCategoryHeader(card) {
  if (!card) return null;
  let current = card.previousElementSibling;
  while (current && !current.classList.contains('category-header')) {
    current = current.previousElementSibling;
  }
  return current || null;
}

function getCardCategoryName(card) {
  const header = getCardCategoryHeader(card);
  return header?.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || 'Line Item';
}

function syncMobileBottomBarState(selectedCount) {
  const count = typeof selectedCount === 'number' ? selectedCount : getSelectedAssignableCards().length;
  const countEl = document.getElementById('mobile-actions-count');
  if (countEl) {
    countEl.hidden = count <= 0;
    countEl.textContent = String(count);
  }
}

function wireMobileExperience() {
  const mobileBackButton = document.getElementById('mobile-back-btn');
  const mobileAddRoomButton = document.getElementById('mobile-add-room-btn');
  const mobileAddItemButton = document.getElementById('mobile-add-item-btn');
  const mobileActionsButton = document.getElementById('mobile-actions-btn');
  const mobileSaveButton = document.getElementById('mobile-save-btn');

  mobileBackButton?.addEventListener('click', () => document.getElementById('cancel-estimate')?.click());
  mobileAddRoomButton?.addEventListener('click', () => document.getElementById('add-category-header')?.click());
  mobileAddItemButton?.addEventListener('click', () => addLineItemCard());
  mobileSaveButton?.addEventListener('click', () => document.getElementById('save-estimate')?.click());
  mobileActionsButton?.addEventListener('click', () => {
    const selectedCards = getSelectedAssignableCards();
    if (!selectedCards.length) {
      window.__estimateEditShowToast?.('Select at least one line item first.');
      return;
    }
    window.__estimateEditOpenBatchActionDrawer?.();
  });

  syncMobileBottomBarState();
}




  // Add Event Listeners
  document.getElementById("export-estimate-excel").addEventListener("click", exportEstimateToExcel);
  document.getElementById("add-line-item").addEventListener("click", () => addLineItemCard());
  document.getElementById("add-category-header").addEventListener("click", () => {
    const categoryName = prompt("Enter Room/Area Name:");
    if (categoryName) addCategoryHeader({ category: categoryName });
  });
  document.getElementById("assign-items-button").addEventListener("click", assignItemsToVendor);
  document.getElementById("selected-items-action-btn")?.addEventListener("click", () => window.__estimateEditOpenBatchActionDrawer?.());
  document.getElementById("batch-actions-close")?.addEventListener("click", () => window.__estimateEditCloseBatchActionDrawer?.());
  document.getElementById("batch-status-apply")?.addEventListener("click", () => window.__estimateEditApplyBatchStatus?.());
  document.getElementById("batch-phase-apply")?.addEventListener("click", () => window.__estimateEditApplyBatchPhase?.());
  document.getElementById("batch-move-category")?.addEventListener("click", () => window.__estimateEditMoveSelectedToCategory?.());
  document.getElementById("batch-assign-dates")?.addEventListener("click", () => window.__estimateEditApplyBatchDates?.());
  document.getElementById("batch-split-labor")?.addEventListener("click", () => window.__estimateEditSplitLaborAcrossSelected?.());
  document.getElementById("batch-duplicate-items")?.addEventListener("click", () => window.__estimateEditDuplicateSelected?.());
  document.getElementById("batch-delete-items")?.addEventListener("click", () => window.__estimateEditDeleteSelected?.());
  document.getElementById("tax-input").addEventListener("input", updateSummary);
  document.getElementById("save-estimate").addEventListener("click", saveEstimate);
  initializeVendorStatsModal();
  document.getElementById('list-view-select-all')?.addEventListener('change', (event) => {
    const shouldSelectAll = !!event.target?.checked;
    const selectableCheckboxes = getSelectableLineItemCheckboxes();

    selectableCheckboxes.forEach((checkbox) => {
      if (checkbox.checked === shouldSelectAll) return;
      checkbox.checked = shouldSelectAll;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    try { updateSelectedLaborCost(); } catch (_) {}
    if (typeof isListViewActive === 'function' && isListViewActive()) {
      try { buildListViewFromCards(); } catch (_) {}
      try { if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false); } catch (_) {}
    }
  });
  wireMobileExperience();
  try { window.__estimateEditRefreshBatchPhaseOptions?.(); } catch (_) {}
  try { window.__estimateEditRefreshBatchCategoryOptions?.(); } catch (_) {}
  try { window.__estimateEditSyncBatchActionState?.(); } catch (_) {}
  try { syncListViewSelectAllCheckboxState(); } catch (_) {}
 });

  function roundCurrency(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function getCardLineItemAmount(card) {
    if (!card) return 0;
    const calcMode = card.querySelector('.item-calc-mode')?.value || 'each';
    const unitPrice = parseFloat(card.querySelector('.item-price')?.value || '0') || 0;
    let quantity = 0;

    if (calcMode === 'sqft') {
      quantity = parseFloat(card.querySelector('.item-area')?.value || '0') || 0;
    } else if (calcMode === 'lnft') {
      quantity = parseFloat(card.querySelector('.item-length')?.value || '0') || 0;
    } else {
      quantity = parseFloat(card.querySelector('.item-quantity')?.value || '0') || 0;
    }

    return roundCurrency(quantity * unitPrice);
  }

  function getCategoryTotalAmount(header) {
    return roundCurrency(getCategoryCards(header).reduce((sum, card) => sum + getCardLineItemAmount(card), 0));
  }

  function syncCategoryHeaderTotal(header) {
    if (!header) return;
    const totalEl = header.querySelector('.category-total-amount');
    if (!totalEl) return;
    totalEl.textContent = `Total $${getCategoryTotalAmount(header).toFixed(2)}`;
  }

  function syncAllCategoryHeaderTotals() {
    document.querySelectorAll('.category-header').forEach((header) => syncCategoryHeaderTotal(header));
  }

  function getSplitGroupTheme(splitGroupId) {
    if (typeof window !== 'undefined' && typeof window.__estimateEditGetSplitGroupTheme === 'function') {
      return window.__estimateEditGetSplitGroupTheme(splitGroupId);
    }

    const themes = [
      { border: "#f59e0b", background: "#fffbeb", chipBackground: "#fef3c7", chipColor: "#92400e" },
      { border: "#0ea5e9", background: "#f0f9ff", chipBackground: "#dbeafe", chipColor: "#0c4a6e" },
      { border: "#10b981", background: "#ecfdf5", chipBackground: "#d1fae5", chipColor: "#065f46" },
      { border: "#ec4899", background: "#fdf2f8", chipBackground: "#fbcfe8", chipColor: "#9d174d" },
      { border: "#8b5cf6", background: "#f5f3ff", chipBackground: "#ede9fe", chipColor: "#5b21b6" }
    ];

    if (!splitGroupId) return null;

    let hash = 0;
    for (let index = 0; index < splitGroupId.length; index += 1) {
      hash = ((hash << 5) - hash) + splitGroupId.charCodeAt(index);
      hash |= 0;
    }

    return themes[Math.abs(hash) % themes.length];
  }

function getCategoryCollapseStorageKey() {
  const projectId = new URLSearchParams(window.location.search).get('projectId') || 'default';
  return `estimate-category-collapsed:${projectId}`;
}

function persistCategoryCollapsedState(state) {
  try {
    window.localStorage.setItem(getCategoryCollapseStorageKey(), JSON.stringify(state || {}));
  } catch (_) {}
}

function getCategoryCollapsedState() {
  let state = (typeof window !== 'undefined' && window.__categoryCollapsedState) || null;
  if (!state) {
    try {
      const raw = window.localStorage.getItem(getCategoryCollapseStorageKey());
      state = raw ? JSON.parse(raw) : {};
    } catch (_) {
      state = {};
    }
  }
  try { if (typeof window !== 'undefined') window.__categoryCollapsedState = state; } catch (_) {}
  return state;
}

function ensureCategoryCollapseKey(header, fallbackName = '') {
  if (!header) return '';
  if (header.dataset.categoryKey) return header.dataset.categoryKey;

  const raw = header.dataset.categoryId || fallbackName || header.querySelector?.('.category-title span[contenteditable]')?.textContent?.trim() || 'category';
  const normalized = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  const key = header.dataset.categoryId ? `id:${header.dataset.categoryId}` : `name:${normalized}`;
  header.dataset.categoryKey = key;
  return key;
}

function isCategoryCollapsed(headerOrKey) {
  const key = typeof headerOrKey === 'string' ? headerOrKey : ensureCategoryCollapseKey(headerOrKey);
  if (!key) return false;
  return !!getCategoryCollapsedState()[key];
}

function setCategoryCollapsed(headerOrKey, collapsed) {
  const key = typeof headerOrKey === 'string' ? headerOrKey : ensureCategoryCollapseKey(headerOrKey);
  if (!key) return;
  const state = getCategoryCollapsedState();
  state[key] = !!collapsed;
  persistCategoryCollapsedState(state);
}

function removeCategoryCollapsedState(headerOrKey) {
  const key = typeof headerOrKey === 'string' ? headerOrKey : ensureCategoryCollapseKey(headerOrKey);
  if (!key) return;
  const state = getCategoryCollapsedState();
  delete state[key];
  persistCategoryCollapsedState(state);
}

function getCategoryCards(header) {
  const cards = [];
  let nextEl = header?.nextElementSibling;
  while (nextEl && !nextEl.classList.contains('category-header')) {
    if (nextEl.classList.contains('line-item-card')) cards.push(nextEl);
    nextEl = nextEl.nextElementSibling;
  }
  return cards;
}

function applyCategoryCollapseState() {
  ensureDisclosureStyles();
  const headers = document.querySelectorAll('.category-header');
  headers.forEach((header) => {
    const toggle = header.querySelector('.toggle-category-collapse');
    const collapsed = isCategoryCollapsed(header);
    if (toggle) {
      setDisclosureButtonState(toggle, !collapsed, 'Collapse category', 'Expand category');
    }

    let nextEl = header.nextElementSibling;
    while (nextEl && !nextEl.classList.contains('category-header')) {
      if (nextEl.classList.contains('line-item-card')) {
        const filterVisible = nextEl.dataset.filterVisible !== 'false';
        nextEl.style.display = (!collapsed && filterVisible) ? '' : 'none';
      } else if (nextEl.classList.contains('split-group-header')) {
        nextEl.style.display = collapsed ? 'none' : '';
      }
      nextEl = nextEl.nextElementSibling;
    }
  });

  try {
    if (typeof syncGlobalCategoryCollapseToggle === 'function') syncGlobalCategoryCollapseToggle();
  } catch (_) {}
}

  async function runSplitFlowForCard(card) {
    if (typeof window !== 'undefined' && typeof window.__estimateEditRunSplitFlowForCard === 'function') {
      return window.__estimateEditRunSplitFlowForCard(card);
    }
    console.warn('Split flow is not available yet.');
    return false;
  }




 // Add this right after the document.addEventListener("DOMContentLoaded", async () => {
// After all your initial variable declarations

// ✅ Create Filter UI - Card View Only
function createFilterUI() {
  const filterContainer = document.createElement('div');
  // Render compact when inline within topbar; class applied just before insert
  filterContainer.className = 'filters-container';
  filterContainer.innerHTML = `
      <div class="filter-header">
        <h3>Filters</h3>
      </div>
      <div class="filter-options">
        <div class="filter-group">
          <label for="filter-item-name">Item Name</label>
          <input type="text" id="filter-item-name" class="filter-input" placeholder="Search by item name">
        </div>
        <div class="filter-group">
          <label for="filter-phase">Phase</label>
          <select id="filter-phase" class="filter-select">
            <option value="">All Phases</option>
          </select>
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
        <button id="toggle-all-categories-btn-card" class="topbar-category-collapse-toggle estimate-disclosure-btn" type="button" aria-pressed="false" title="Collapse all categories" style="display:inline-flex; align-items:center; justify-content:center; margin-top:11px;">${getDisclosureIconSvg()}</button>
        <button id="show-gantt-view-btn" title="Show gantt view" aria-pressed="false" aria-label="Gantt View" style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#ffffff; cursor:pointer; color:#0f172a; margin-top:11px; font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,0.04); transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease; width:34px; height:34px; padding:0; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
            <path d="M3 5h18"></path>
            <path d="M3 12h18"></path>
            <path d="M3 19h18"></path>
            <rect x="4" y="4" width="6" height="2.5" rx="1.25" fill="#93c5fd" stroke="none"></rect>
            <rect x="10" y="11" width="8" height="2.5" rx="1.25" fill="#60a5fa" stroke="none"></rect>
            <rect x="7" y="18" width="11" height="2.5" rx="1.25" fill="#2563eb" stroke="none"></rect>
          </svg>
        </button>
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

  const selectedItemsActionButton = document.getElementById('selected-items-action-btn');
  const filterOptions = filterContainer.querySelector('.filter-options');
  if (selectedItemsActionButton && filterOptions) {
    filterOptions.appendChild(selectedItemsActionButton);
  }

  // Prefer placing inside the topbar host if present; fallback to original location

  function getSelectedCards() {
    return Array.from(document.querySelectorAll('.line-item-select:checked'))
      .map((checkbox) => checkbox.closest('.line-item-card'))
      .filter((card, index, cards) => card && cards.indexOf(card) === index);
  }

  function getCategoryHeaderForCard(card) {
    let current = card?.previousElementSibling || null;
    while (current && !current.classList.contains('category-header')) {
      current = current.previousElementSibling;
    }
    return current || null;
  }

  function getCategoryBlockNodes(header) {
    if (!header) return [];
    const nodes = [header];
    let nextEl = header.nextElementSibling;
    while (nextEl && !nextEl.classList.contains('category-header')) {
      nodes.push(nextEl);
      nextEl = nextEl.nextElementSibling;
    }
    return nodes;
  }

  function getLastCardInCategory(header, excludedCard = null) {
    const cards = getCategoryCards(header).filter((card) => card !== excludedCard);
    return cards.length ? cards[cards.length - 1] : null;
  }

  function getEffectiveQuantityForCard(card) {
    if (!card) return 0;
    const mode = card.querySelector('.item-calc-mode')?.value || 'each';
    if (mode === 'sqft') return parseFloat(card.querySelector('.item-area')?.value || '0') || 0;
    if (mode === 'lnft') return parseFloat(card.querySelector('.item-length')?.value || '0') || 0;
    return Math.max(1, parseFloat(card.querySelector('.item-quantity')?.value || '0') || 0);
  }

  function cloneItemDataFromCard(card) {
    if (!card) return {};
    return {
      name: card.querySelector('.item-name')?.value || '',
      description: card.querySelector('.item-description')?.value || '',
      quantity: parseFloat(card.querySelector('.item-quantity')?.value || '1') || 1,
      unitPrice: parseFloat(card.querySelector('.item-price')?.value || '0') || 0,
      laborCost: parseFloat(card.querySelector('.item-labor-cost')?.value || '0') || 0,
      materialCost: parseFloat(card.querySelector('.item-material-cost')?.value || '0') || 0,
      calcMode: card.querySelector('.item-calc-mode')?.value || 'each',
      area: parseFloat(card.querySelector('.item-area')?.value || '0') || 0,
      length: parseFloat(card.querySelector('.item-length')?.value || '0') || 0,
      costCode: card.querySelector('.item-cost-code')?.value || '',
      status: card.querySelector('.item-status-dropdown')?.value || 'new',
      phase: card.querySelector('.item-phase-dropdown')?.value || DEFAULT_PROJECT_PHASE,
      percentComplete: clampProjectPhaseProgress(card.querySelector('.item-percent-complete')?.value, card.querySelector('.item-status-dropdown')?.value || 'new'),
      startDate: card.querySelector('.item-start-date')?.value || '',
      endDate: card.querySelector('.item-end-date')?.value || ''
    };
  }

  function setCardLaborTotal(card, totalLabor) {
    const laborInput = card?.querySelector('.item-labor-cost');
    if (!laborInput) return;
    const roundedTotal = roundCurrency(totalLabor);
    const effQty = getEffectiveQuantityForCard(card);
    laborInput.dataset.rate = String(effQty > 0 ? roundCurrency(roundedTotal / effQty) : roundedTotal);
    laborInput.value = roundedTotal.toFixed(2);
    if (typeof card.__updateCardValues === 'function') {
      card.__updateCardValues();
    } else {
      laborInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function refreshBatchCategoryOptions() {
    const select = document.getElementById('batch-category-select');
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '<option value="">Select category</option>';
    document.querySelectorAll('.category-header').forEach((header) => {
      const name = header.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || 'Untitled Category';
      const key = ensureCategoryCollapseKey(header, name);
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      select.appendChild(option);
    });
    if (previousValue && Array.from(select.options).some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }
  }

  function refreshBatchPhaseOptions() {
    const select = document.getElementById('batch-phase-select');
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '<option value="">Select phase</option>';
    PROJECT_PHASES.forEach((phase) => {
      const option = document.createElement('option');
      option.value = phase.value;
      option.textContent = phase.label;
      select.appendChild(option);
    });
    if (previousValue && Array.from(select.options).some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }
  }

  function openBatchActionDrawer() {
    const drawer = document.getElementById('batch-actions-drawer');
    if (!drawer) return;
    refreshBatchCategoryOptions();
    refreshBatchPhaseOptions();
    drawer.hidden = false;
    try { document.addEventListener('pointerdown', handleBatchActionOutsidePointerDown, true); } catch (_) {}
    try { document.addEventListener('keydown', handleBatchActionDrawerKeydown, true); } catch (_) {}
  }

  function closeBatchActionDrawer() {
    const drawer = document.getElementById('batch-actions-drawer');
    if (!drawer) return;
    drawer.hidden = true;
    try { document.removeEventListener('pointerdown', handleBatchActionOutsidePointerDown, true); } catch (_) {}
    try { document.removeEventListener('keydown', handleBatchActionDrawerKeydown, true); } catch (_) {}
  }

  function handleBatchActionOutsidePointerDown(event) {
    const drawer = document.getElementById('batch-actions-drawer');
    const button = document.getElementById('selected-items-action-btn');
    const target = event.target;
    if (!drawer || drawer.hidden) return;
    if ((drawer && drawer.contains(target)) || (button && button.contains(target))) return;
    closeBatchActionDrawer();
  }

  function handleBatchActionDrawerKeydown(event) {
    if (event.key === 'Escape') {
      closeBatchActionDrawer();
    }
  }

  function syncBatchActionState(selectedCount, totalLabor) {
    const cards = typeof selectedCount === 'number' ? null : getSelectedCards();
    const count = typeof selectedCount === 'number' ? selectedCount : cards.length;
    const labor = typeof totalLabor === 'number'
      ? totalLabor
      : (cards || []).reduce((sum, card) => sum + (parseFloat(card.querySelector('.item-labor-cost')?.value || '0') || 0), 0);
    const summary = document.getElementById('batch-selection-summary');
    const actionButton = document.getElementById('selected-items-action-btn');
    const drawer = document.getElementById('batch-actions-drawer');
    if (summary) {
      summary.textContent = count > 0
        ? `${count} item${count === 1 ? '' : 's'} selected • Labor $${labor.toFixed(2)}`
        : '0 items selected';
      summary.classList.toggle('is-empty', count === 0);
    }
    if (actionButton) {
      actionButton.hidden = count === 0;
      actionButton.textContent = count > 0
        ? `Actions (${count})`
        : 'Actions';
    }
    if (drawer && count === 0) {
      drawer.hidden = true;
    }
    [
      'batch-status-apply',
      'batch-phase-apply',
      'batch-move-category',
      'batch-assign-dates',
      'batch-split-labor',
      'batch-duplicate-items',
      'batch-delete-items'
    ].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.disabled = count === 0;
    });
  }

  function resetBatchActionInputs() {
    const statusSelect = document.getElementById('batch-status-select');
    const phaseSelect = document.getElementById('batch-phase-select');
    const categorySelect = document.getElementById('batch-category-select');
    const startDateInput = document.getElementById('batch-start-date');
    const endDateInput = document.getElementById('batch-end-date');

    if (statusSelect) statusSelect.value = '';
    if (phaseSelect) phaseSelect.value = '';
    if (categorySelect) categorySelect.value = '';
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';
  }

  async function persistBatchDomChanges() {
    try { clearSelectedLineItems(); } catch (_) {}
    try { rebuildSplitGroupHeaders(); } catch (_) {}
    try { applyCategoryCollapseState(); } catch (_) {}
    try { populateFilterOptions(); } catch (_) {}
    refreshBatchCategoryOptions();
    refreshBatchPhaseOptions();
    try { updateSummary(); } catch (_) {}
    try { updateSelectedLaborCost(); } catch (_) {}
    if (typeof isListViewActive === 'function' && isListViewActive()) {
      try { buildListViewFromCards(); } catch (_) {}
      try { if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false); } catch (_) {}
    }
    if (typeof isGanttViewActive === 'function' && isGanttViewActive()) {
      try { buildGanttViewFromCards(); } catch (_) {}
    }
    if (typeof window.autoSaveEstimate === 'function') {
      await window.autoSaveEstimate(true);
    }
    resetBatchActionInputs();
    try { clearSelectedLineItems(); } catch (_) {}
  }

  function findCategoryHeaderByKey(key) {
    return Array.from(document.querySelectorAll('.category-header')).find((header) => ensureCategoryCollapseKey(header) === key) || null;
  }

  function moveCardBeforeOrAfter(card, targetCard, placeAfter) {
    if (!card || !targetCard || card === targetCard) return false;
    const referenceNode = placeAfter ? targetCard.nextElementSibling : targetCard;
    if (referenceNode === card) return false;
    targetCard.parentNode.insertBefore(card, referenceNode);
    return true;
  }

  function moveCardIntoCategory(card, targetHeader) {
    if (!card || !targetHeader) return false;
    const lastCard = getLastCardInCategory(targetHeader, card);
    const referenceNode = lastCard ? lastCard.nextElementSibling : targetHeader.nextElementSibling;
    if (referenceNode === card) return false;
    targetHeader.parentNode.insertBefore(card, referenceNode);
    return true;
  }

  function moveCategoryBlock(sourceHeader, targetHeader, placeAfter) {
    if (!sourceHeader || !targetHeader || sourceHeader === targetHeader) return false;
    const parentNode = sourceHeader.parentNode;
    if (!parentNode || parentNode !== targetHeader.parentNode) return false;
    const sourceNodes = getCategoryBlockNodes(sourceHeader);
    const targetNodes = getCategoryBlockNodes(targetHeader);
    const referenceNode = placeAfter
      ? targetNodes[targetNodes.length - 1]?.nextElementSibling || null
      : targetHeader;
    if (sourceNodes.includes(referenceNode)) return false;
    const fragment = document.createDocumentFragment();
    sourceNodes.forEach((node) => fragment.appendChild(node));
    parentNode.insertBefore(fragment, referenceNode);
    return true;
  }

  function clearEstimateDragHighlights() {
    document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-target, .lv-item-drop-top, .lv-item-drop-bottom, .lv-category-drop-target')
      .forEach((node) => node.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-target', 'lv-item-drop-top', 'lv-item-drop-bottom', 'lv-category-drop-target'));
  }

  function beginEstimateDrag(payload) {
    window.__estimateEditDragPayload = payload;
  }

  function getEstimateDragPayload() {
    return window.__estimateEditDragPayload || null;
  }

  function endEstimateDrag() {
    window.__estimateEditDragPayload = null;
    clearEstimateDragHighlights();
  }

  async function handleDroppedItemOnCard(targetCard, placeAfter) {
    const payload = getEstimateDragPayload();
    if (!payload || payload.type !== 'item') return;
    const sourceCard = document.querySelector(`.line-item-card[data-item-id="${payload.itemId}"]`);
    if (!sourceCard || !targetCard || sourceCard === targetCard) return;
    if (moveCardBeforeOrAfter(sourceCard, targetCard, placeAfter)) {
      await persistBatchDomChanges();
    }
  }

  async function handleDroppedItemOnCategory(targetHeader) {
    const payload = getEstimateDragPayload();
    if (!payload) return;
    if (payload.type === 'item') {
      const sourceCard = document.querySelector(`.line-item-card[data-item-id="${payload.itemId}"]`);
      if (moveCardIntoCategory(sourceCard, targetHeader)) {
        await persistBatchDomChanges();
      }
      return;
    }
    if (payload.type === 'category') {
      const sourceHeader = findCategoryHeaderByKey(payload.categoryKey);
      if (moveCategoryBlock(sourceHeader, targetHeader, false)) {
        await persistBatchDomChanges();
      }
    }
  }

  function wireCategoryDrag(header) {
    if (!header || header.dataset.dragWired === 'true') return;
    header.dataset.dragWired = 'true';
    const handle = header.querySelector('.category-drag-handle');
    if (!handle) return;
    handle.addEventListener('dragstart', (event) => {
      beginEstimateDrag({ type: 'category', categoryKey: ensureCategoryCollapseKey(header) });
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => endEstimateDrag());
    header.addEventListener('dragover', (event) => {
      const payload = getEstimateDragPayload();
      if (!payload) return;
      event.preventDefault();
      clearEstimateDragHighlights();
      header.classList.add('drag-over-target');
    });
    header.addEventListener('dragleave', () => header.classList.remove('drag-over-target'));
    header.addEventListener('drop', async (event) => {
      event.preventDefault();
      header.classList.remove('drag-over-target');
      await handleDroppedItemOnCategory(header);
      endEstimateDrag();
    });
  }

  function wireCardDrag(card) {
    if (!card || card.dataset.dragWired === 'true') return;
    card.dataset.dragWired = 'true';
    const handle = card.querySelector('.card-drag-handle');
    if (!handle) return;
    handle.addEventListener('dragstart', (event) => {
      beginEstimateDrag({ type: 'item', itemId: card.getAttribute('data-item-id') });
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => endEstimateDrag());
    card.addEventListener('dragover', (event) => {
      const payload = getEstimateDragPayload();
      if (!payload || payload.type !== 'item') return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const placeAfter = event.clientY > rect.top + (rect.height / 2);
      clearEstimateDragHighlights();
      card.classList.add(placeAfter ? 'drag-over-bottom' : 'drag-over-top');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over-top', 'drag-over-bottom'));
    card.addEventListener('drop', async (event) => {
      const payload = getEstimateDragPayload();
      if (!payload || payload.type !== 'item') return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const placeAfter = event.clientY > rect.top + (rect.height / 2);
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      await handleDroppedItemOnCard(card, placeAfter);
      endEstimateDrag();
    });
  }

  async function applyBatchStatus() {
    const cards = getSelectedCards();
    const nextStatus = document.getElementById('batch-status-select')?.value || '';
    if (!cards.length) {
      window.__estimateEditShowToast?.('Select at least one item.');
      return;
    }
    if (!nextStatus) {
      window.__estimateEditShowToast?.('Select a status to apply.');
      return;
    }
    const statusUpdates = await Promise.all(cards.map(async (card) => {
      const dropdown = card.querySelector('.item-status-dropdown');
      const percentCompleteInput = card.querySelector('.item-percent-complete');
      if (!dropdown) return { ok: false, skipped: true, vendorSyncFailed: false };
      const lineItemId = card.getAttribute('data-item-id');
      const vendorId = card.getAttribute('data-assigned-to');
      const nextPercentComplete = getNextPercentCompleteForStatus(nextStatus, percentCompleteInput?.value);
      const result = await persistLineItemStatusChange(lineItemId, nextStatus, {
        vendorId,
        percentComplete: nextPercentComplete
      });
      if (!result.ok) {
        return result;
      }
      dropdown.value = nextStatus;
      const statusClass = typeof window.__estimateEditGetStatusClass === 'function'
        ? window.__estimateEditGetStatusClass(nextStatus)
        : 'status-pending';
      dropdown.className = `item-status-dropdown ${statusClass}`;
      if (percentCompleteInput) {
        const nextPercentComplete = nextStatus === 'completed'
          ? 100
          : nextStatus === 'in-progress'
            ? 0
          : clampProjectPhaseProgress(percentCompleteInput.value, nextStatus);
        percentCompleteInput.value = String(nextPercentComplete);
        card.dataset.percentComplete = String(nextPercentComplete);
      }
      return result;
    }));

    const failedEstimateUpdates = statusUpdates.filter((result) => result && !result.ok && !result.skipped).length;
    const vendorSyncFailures = statusUpdates.filter((result) => result && result.ok && result.vendorSyncFailed).length;
    const successfulUpdates = statusUpdates.filter((result) => result && result.ok).length;

    if (!successfulUpdates) {
      window.__estimateEditShowToast?.('Failed to update selected item statuses.');
      return;
    }
    try { renderProjectPhaseBar(); } catch (_) {}
    try { applyFilters(); } catch (_) {}
    await persistBatchDomChanges();
    if (failedEstimateUpdates) {
      window.__estimateEditShowToast?.(`Updated ${successfulUpdates} item${successfulUpdates === 1 ? '' : 's'}; ${failedEstimateUpdates} failed.`);
      return;
    }
    if (vendorSyncFailures) {
      window.__estimateEditShowToast?.(`Status updated for ${successfulUpdates} item${successfulUpdates === 1 ? '' : 's'}; vendor sync failed for ${vendorSyncFailures}.`);
      return;
    }
    window.__estimateEditShowToast?.(`Status updated for ${successfulUpdates} item${successfulUpdates === 1 ? '' : 's'}.`);
  }

  async function applyBatchPhase() {
    const cards = getSelectedCards();
    const nextPhase = document.getElementById('batch-phase-select')?.value || '';
    if (!cards.length) {
      window.__estimateEditShowToast?.('Select at least one item.');
      return;
    }
    if (!nextPhase) {
      window.__estimateEditShowToast?.('Select a phase to apply.');
      return;
    }
    cards.forEach((card) => {
      const dropdown = card.querySelector('.item-phase-dropdown');
      if (!dropdown) return;
      dropdown.value = nextPhase;
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await persistBatchDomChanges();
  }

  async function moveSelectedToCategory() {
    const cards = getSelectedCards();
    const categoryKey = document.getElementById('batch-category-select')?.value || '';
    const targetHeader = findCategoryHeaderByKey(categoryKey);
    if (!cards.length) {
      window.__estimateEditShowToast?.('Select at least one item.');
      return;
    }
    if (!targetHeader) {
      window.__estimateEditShowToast?.('Select a destination category.');
      return;
    }
    cards.forEach((card) => moveCardIntoCategory(card, targetHeader));
    await persistBatchDomChanges();
  }

  async function applyBatchDates() {
    const cards = getSelectedCards();
    const startDate = document.getElementById('batch-start-date')?.value || '';
    const endDate = document.getElementById('batch-end-date')?.value || '';
    if (!cards.length) {
      window.__estimateEditShowToast?.('Select at least one item.');
      return;
    }
    if (!startDate && !endDate) {
      window.__estimateEditShowToast?.('Enter at least one date.');
      return;
    }
    cards.forEach((card) => {
      const startInput = card.querySelector('.item-start-date');
      const endInput = card.querySelector('.item-end-date');
      if (startInput && startDate) startInput.value = startDate;
      if (endInput && endDate) endInput.value = endDate;
    });
    await persistBatchDomChanges();
  }

  async function splitLaborAcrossSelected() {
    const cards = getSelectedCards();
    const splittableCards = cards.filter((card) => !isCardAssigned(card));
    const skippedAssignedCount = cards.length - splittableCards.length;
    if (splittableCards.length < 2) {
      if (typeof window.__estimateEditShowToast === 'function') {
        window.__estimateEditShowToast(skippedAssignedCount
          ? 'Assigned line items were skipped. Unassign at least two items before splitting labor.'
          : 'Select at least two items to split labor.');
      }
      return;
    }
    const previewItems = splittableCards.map((card, index) => ({
      id: card.getAttribute('data-item-id') || `selected-${index}`,
      itemName: (card.querySelector('.item-name')?.value || `Line Item ${index + 1}`).trim(),
      laborCost: parseFloat(card.querySelector('.item-labor-cost')?.value || '0') || 0,
      paymentCount: 2
    }));
    const splitConfigs = typeof window.__estimateEditShowMultiSplitPreviewModal === 'function'
      ? await window.__estimateEditShowMultiSplitPreviewModal(previewItems)
      : null;
    if (!Array.isArray(splitConfigs) || !splitConfigs.length) {
      return;
    }

    const configMap = new Map(splitConfigs.map((config) => [String(config.id), config]));
    splittableCards.forEach((card, index) => {
      const cardId = card.getAttribute('data-item-id') || `selected-${index}`;
      const config = configMap.get(String(cardId));
      if (!config || !Array.isArray(config.percentages) || config.percentages.length < 2) return;
      applySplitToCard(card, config.percentages, { skipPersist: true, skipToast: true });
    });

    try { rebuildSplitGroupHeaders(); } catch (_) {}
    try { applyCategoryCollapseState(); } catch (_) {}
    try { updateSummary(); } catch (_) {}
    try { updateSelectedLaborCost(); } catch (_) {}
    try {
      if (typeof isListViewActive === 'function' && isListViewActive()) {
        if (typeof buildListViewFromCards === 'function') buildListViewFromCards();
        if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
      }
    } catch (_) {}
    await persistBatchDomChanges();
    if (typeof window.__estimateEditShowToast === 'function') {
      window.__estimateEditShowToast(skippedAssignedCount
        ? `Applied split preview to ${splittableCards.length} line items. ${skippedAssignedCount} assigned item${skippedAssignedCount === 1 ? '' : 's'} skipped.`
        : `Applied split preview to ${splittableCards.length} selected line items.`);
    }
  }

  async function duplicateSelected() {
    const cards = getSelectedCards();
    if (!cards.length) {
      window.__estimateEditShowToast?.('Select at least one item.');
      return;
    }
    cards.forEach((card) => {
      const categoryHeader = getCategoryHeaderForCard(card);
      const duplicatedCard = typeof window.addLineItemCard === 'function'
        ? window.addLineItemCard(cloneItemDataFromCard(card), categoryHeader, card)
        : null;
      const duplicateCheckbox = duplicatedCard?.querySelector('.line-item-select');
      if (duplicateCheckbox) {
        duplicateCheckbox.checked = false;
        duplicateCheckbox.disabled = false;
      }
      if (duplicatedCard) duplicatedCard.setAttribute('data-assigned-to', '');
    });
    await persistBatchDomChanges();
  }

  async function deleteSelected() {
    const cards = getSelectedCards();
    if (!cards.length) {
      window.__estimateEditShowToast?.('Select at least one item.');
      return;
    }
    const deletableCards = cards.filter((card) => !isCardAssigned(card));
    const skippedAssignedCount = cards.length - deletableCards.length;
    if (!deletableCards.length) {
      window.__estimateEditShowToast?.('Assigned line items cannot be deleted. Remove the vendor assignment first.');
      return;
    }
    if (!window.confirm(`Delete ${deletableCards.length} selected item${deletableCards.length === 1 ? '' : 's'}?`)) {
      return;
    }
    deletableCards.forEach((card) => card.remove());
    await persistBatchDomChanges();
    if (skippedAssignedCount) {
      window.__estimateEditShowToast?.(`${skippedAssignedCount} assigned item${skippedAssignedCount === 1 ? '' : 's'} skipped. Remove the vendor assignment first to delete them.`);
    }
  }

  try {
    window.__estimateEditRefreshBatchCategoryOptions = refreshBatchCategoryOptions;
    window.__estimateEditRefreshBatchPhaseOptions = refreshBatchPhaseOptions;
    window.__estimateEditSyncBatchActionState = syncBatchActionState;
    window.__estimateEditOpenBatchActionDrawer = openBatchActionDrawer;
    window.__estimateEditCloseBatchActionDrawer = closeBatchActionDrawer;
    window.__estimateEditApplyBatchStatus = applyBatchStatus;
    window.__estimateEditApplyBatchPhase = applyBatchPhase;
    window.__estimateEditMoveSelectedToCategory = moveSelectedToCategory;
    window.__estimateEditApplyBatchDates = applyBatchDates;
    window.__estimateEditSplitLaborAcrossSelected = splitLaborAcrossSelected;
    window.__estimateEditDuplicateSelected = duplicateSelected;
    window.__estimateEditDeleteSelected = deleteSelected;
    window.__estimateEditClearEstimateDragHighlights = clearEstimateDragHighlights;
    window.__estimateEditBeginEstimateDrag = beginEstimateDrag;
    window.__estimateEditGetEstimateDragPayload = getEstimateDragPayload;
    window.__estimateEditEndEstimateDrag = endEstimateDrag;
    window.__estimateEditHandleDroppedItemOnCard = handleDroppedItemOnCard;
    window.__estimateEditHandleDroppedItemOnCategory = handleDroppedItemOnCategory;
    window.__estimateEditWireCategoryDrag = wireCategoryDrag;
    window.__estimateEditWireCardDrag = wireCardDrag;
  } catch (_) {}
  try {
    document.querySelectorAll('.category-header').forEach((header) => wireCategoryDrag(header));
    document.querySelectorAll('.line-item-card').forEach((card) => wireCardDrag(card));
  } catch (_) {}
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

  function getVisibleCategoryHeaders() {
    return Array.from(document.querySelectorAll('.category-header')).filter((header) => header.style.display !== 'none');
  }

  function areAllVisibleCategoriesCollapsed() {
    const headers = getVisibleCategoryHeaders();
    if (!headers.length) return false;
    return headers.every((header) => isCategoryCollapsed(header));
  }

  function syncGlobalCategoryCollapseToggle() {
    const buttons = Array.from(document.querySelectorAll('#toggle-all-categories-btn, #toggle-all-categories-btn-card'));
    if (!buttons.length) return;
    const headers = getVisibleCategoryHeaders();
    const allCollapsed = headers.length > 0 && headers.every((header) => isCategoryCollapsed(header));
    buttons.forEach((button) => {
      button.disabled = headers.length === 0;
      button.setAttribute('aria-pressed', allCollapsed ? 'true' : 'false');
      setDisclosureButtonState(button, !allCollapsed, 'Collapse all categories', 'Expand all categories');
    });
  }

  function toggleAllCategoriesCollapsed() {
    const headers = getVisibleCategoryHeaders();
    if (!headers.length) return;
    const nextCollapsed = !headers.every((header) => isCategoryCollapsed(header));
    headers.forEach((header) => setCategoryCollapsed(header, nextCollapsed));
    applyCategoryCollapseState();
    try {
      if (typeof isListViewActive === 'function' && isListViewActive()) {
        buildListViewFromCards();
        if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
      }
    } catch (_) {}
  }

  const toggleAllCategoriesButtons = document.querySelectorAll('#toggle-all-categories-btn, #toggle-all-categories-btn-card');
  toggleAllCategoriesButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleAllCategoriesCollapsed();
    });
  });

  try { window.syncGlobalCategoryCollapseToggle = syncGlobalCategoryCollapseToggle; } catch (_) {}
  syncGlobalCategoryCollapseToggle();

  initializeFilterListeners();
  wireToggleViewButton();
  // Restore last view mode (lazy-init list view only if needed)
  const mode = (localStorage.getItem('estimateViewMode') || 'card');
  if (mode === 'gantt') {
    showGanttView();
  } else if (mode === 'list') {
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
  document.documentElement.style.setProperty('--topbar-height', `122px`);
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
      #line-items-table-container .estimate-table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 1560px; table-layout: fixed; }
      #line-items-table-container .estimate-table thead { display: none; }
      #line-items-table-container .estimate-table tfoot { display: none; }
      #list-view-footer.lvf {
        position: fixed;
        bottom: 0px;
        z-index: 70;
        display: none;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(10px);
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.16);
        overflow: hidden;
      }
      #list-view-footer .lvf-inner {
        position: relative;
        will-change: transform;
      }
      #list-view-footer .lvf-selection-summary {
        display: none;
        position: absolute;
        top: 50%;
        right: 12px;
        transform: translateY(-50%);
        align-items: center;
        justify-content: flex-end;
        pointer-events: none;
        z-index: 1;
      }
      #list-view-footer .lvf-selection-summary.is-visible {
        display: flex;
      }
      #list-view-footer .lvf-selection-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: #dbeafe;
        color: #1d4ed8;
        font-size: 13px;
        font-weight: 700;
        box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.14);
      }
      #list-view-footer table {
        width: 100%;
        min-width: 1300px;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
      }
      #list-view-footer tfoot td {
        padding: 10px 8px;
        font-size: 15px;
        color: #0f172a;
        background: transparent;
        white-space: nowrap;
      }
      #list-view-footer .lvf-label-cell {
        text-align: right;
        font-weight: 700;
      }
      #list-view-footer tfoot [data-footer-field] {
        text-align: right;
        font-weight: 700;
      }

      

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
      #line-items-table-container .lv-split-btn {
        background: #fff7ed;
        color: #9a3412;
        border: 1px solid #fdba74;
        border-radius: 8px;
        padding: 4px 8px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, transform 0.08s ease, box-shadow 0.15s ease;
      }
      #line-items-table-container .lv-split-btn:hover:not(:disabled) {
        background: #fed7aa;
        color: #7c2d12;
        box-shadow: 0 1px 6px rgba(0,0,0,0.08);
      }
      #line-items-table-container .lv-split-btn:active:not(:disabled) {
        transform: translateY(1px);
      }
      #line-items-table-container .lv-split-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #line-items-table-container .lv-split-group-row td {
        padding: 8px 10px;
        border-bottom: 1px solid #e5e7eb;
        background: #fffaf0;
      }
      #line-items-table-container .lv-category-group-row td {
        padding: 8px 6px;
        border-bottom: 1px solid #dbeafe;
        background: #eff6ff;
        box-shadow: inset 0 -1px 0 #dbeafe;
      }
      #line-items-table-container .lv-category-group-row td:first-child {
        border-left: 4px solid #2563eb;
      }
      #line-items-table-container .lv-category-group-main {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      #line-items-table-container .lv-category-group-kicker {
        font-size: 12px;
        font-weight: 800;
        color: #1d4ed8;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      #line-items-table-container .lv-category-group-label {
        min-width: 0;
        color: #0f172a;
        font-size: 14px;
        font-weight: 700;
        outline: none;
      }
      #line-items-table-container .lv-category-group-label:focus {
        color: #1d4ed8;
      }
      #line-items-table-container .lv-category-group-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: flex-end;
      }
      #line-items-table-container .lv-category-group-item .lv-category-group-meta {
        justify-content: center;
      }
      #line-items-table-container .lv-category-group-count {
        font-size: 14px;
        color: #1d4ed8;
        font-weight: 600;
      }
      #line-items-table-container .lv-category-group-total {
        text-align: right;
        width: 100%;
        min-width: 0;
        font-weight: 600;
      }
      #line-items-table-container .lv-split-group-toggle {
        --toggle-color: #9a3412;
        --toggle-border: #fed7aa;
        --toggle-hover-bg: #ffedd5;
        --toggle-shadow: rgba(245, 158, 11, 0.22);
      }
      #line-items-table-container .lv-split-group-toggle:hover {
        border-color: #fdba74;
      }
      #line-items-table-container .lv-category-collapse-btn {
        --toggle-color: #1d4ed8;
        --toggle-border: #dbeafe;
        --toggle-hover-bg: #dbeafe;
        --toggle-shadow: rgba(59, 130, 246, 0.18);
      }
      #line-items-table-container .lv-category-collapse-btn:hover {
        border-color: #93c5fd;
      }
      #line-items-table-container .lv-category-collapse-btn:active {
        transform: translateY(1px) scale(0.98);
      }
      #line-items-table-container .lv-cat-inline-label {
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        text-decoration-color: rgba(100, 116, 139, 0.35);
        text-underline-offset: 2px;
      }
      #line-items-table-container .lv-cat-inline-label:hover {
        color: #1d4ed8;
        text-decoration-color: rgba(29, 78, 216, 0.45);
      }
      #line-items-table-container .lv-cat-inline-label:focus-visible {
        outline: 2px solid rgba(59, 130, 246, 0.35);
        outline-offset: 2px;
        border-radius: 4px;
      }
      #line-items-table-container .lv-inline-split-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        min-width: 0;
      }
      #line-items-table-container .lv-inline-split-meta {
        font-size: 12px;
        font-weight: 700;
        color: #9a3412;
        background: #fff7ed;
        border: 1px solid #fdba74;
        border-radius: 999px;
        padding: 4px 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 240px;
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
        flex: 1 1 560px;
        max-width: 720px;
        display: flex;
        gap: 18px;
      }
      #line-items-table-container .lv-photo-panel {
        flex: 1 1 320px;
        max-width: 350px;
        min-width: 0;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 12px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
      }
      #line-items-table-container .lv-photo-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      #line-items-table-container .lv-photo-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 9px;
        border-radius: 999px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 12px;
        font-weight: 700;
      }
      #line-items-table-container .lv-photo-panel-tools {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      #line-items-table-container .lv-photo-add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        border: 1px solid #bfdbfe;
        background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
        color: #1d4ed8;
        box-shadow: 0 4px 10px rgba(37, 99, 235, 0.14);
        cursor: pointer;
        transition: transform 0.12s ease, box-shadow 0.16s ease, border-color 0.16s ease;
      }
      #line-items-table-container .lv-photo-add-btn:hover {
        transform: translateY(-1px);
        border-color: #60a5fa;
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
      }
      #line-items-table-container .lv-photo-add-btn:active {
        transform: translateY(1px);
      }
      #line-items-table-container .lv-photo-add-btn svg {
        display: block;
      }
      #line-items-table-container .lv-photo-upload-input {
        display: none;
      }
      #line-items-table-container .lv-photo-slider {
        position: relative;
      }
      #line-items-table-container .lv-photo-viewport {
        overflow: hidden;
        border-radius: 12px;
      }
      #line-items-table-container .lv-photo-track {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scroll-behavior: smooth;
        scrollbar-width: none;
        padding-bottom: 6px;
      }
      #line-items-table-container .lv-photo-track::-webkit-scrollbar {
        display: none;
      }
      #line-items-table-container .lv-photo-card {
        flex: 0 0 calc(50% - 6px);
        min-width: 180px;
        max-width: 240px;
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        background: #e5e7eb;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
        scroll-snap-align: start;
        cursor: pointer;
      }
      #line-items-table-container .lv-photo-card img {
        display: block;
        width: 100%;
        height: 144px;
        object-fit: cover;
      }
      #line-items-table-container .lv-photo-card::after {
        content: '';
        position: absolute;
        inset: auto 0 0 0;
        height: 48%;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.6) 100%);
        pointer-events: none;
      }
      #line-items-table-container .lv-photo-card-index {
        position: absolute;
        left: 10px;
        bottom: 10px;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.16);
        backdrop-filter: blur(8px);
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
      }
      #line-items-table-container .lv-photo-delete-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.72);
        color: #ffffff;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.22);
        cursor: pointer;
        transition: transform 0.12s ease, background 0.16s ease, box-shadow 0.16s ease;
      }
      #line-items-table-container .lv-photo-delete-btn:hover {
        transform: translateY(-1px);
        background: rgba(220, 38, 38, 0.92);
        box-shadow: 0 10px 22px rgba(127, 29, 29, 0.28);
      }
      #line-items-table-container .lv-photo-delete-btn:active {
        transform: translateY(1px);
      }
      #line-items-table-container .lv-photo-delete-btn svg {
        display: block;
      }
      #line-items-table-container .lv-photo-nav {
        position: absolute;
        top: calc(50% - 18px);
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        color: #0f172a;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        transition: transform 0.12s ease, box-shadow 0.16s ease, background 0.16s ease;
      }
      #line-items-table-container .lv-photo-nav:hover {
        transform: translateY(-1px);
        background: #ffffff;
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.2);
      }
      #line-items-table-container .lv-photo-nav:active {
        transform: translateY(1px);
      }
      #line-items-table-container .lv-photo-nav.prev {
        left: 8px;
      }
      #line-items-table-container .lv-photo-nav.next {
        right: 8px;
      }
      #line-items-table-container .lv-photo-dots {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 10px;
      }
      #line-items-table-container .lv-photo-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #cbd5e1;
        transition: transform 0.16s ease, background 0.16s ease;
      }
      #line-items-table-container .lv-photo-dot.is-active {
        background: #2563eb;
        transform: scale(1.35);
      }
      #line-items-table-container .lv-photo-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 144px;
        border: 1px dashed #cbd5e1;
        border-radius: 12px;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
      }
      @media (max-width: 1100px) {
        #line-items-table-container .lv-detail-content {
          flex-wrap: wrap;
        }
        #line-items-table-container .lv-detail-photos {
          flex: 1 1 100%;
          max-width: 100%;
          min-width: 0;
          flex-wrap: wrap;
        }
        #line-items-table-container .lv-photo-panel {
          min-width: min(100%, 320px);
          max-width: 100%;
        }
      }
      @media (max-width: 760px) {
        #line-items-table-container .lv-photo-card {
          flex-basis: 100%;
          max-width: none;
        }
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
      #line-items-table-container .lv-drag-select-stack {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 100%;
        white-space: nowrap;
      }
      #line-items-table-container .lv-drag-select-stack input[type="checkbox"] {
        margin: 0;
        flex: 0 0 auto;
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
      <table class="estimate-table" style="width:100%; min-width:1300px; border-collapse:separate; border-spacing:0; table-layout:fixed;">
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

  if (!document.getElementById('list-view-footer')) {
    const footer = document.createElement('div');
    footer.id = 'list-view-footer';
    footer.className = 'lvf';
    footer.innerHTML = `
      <div class="lvf-inner">
        <div class="lvf-selection-summary" data-role="selection-summary" aria-live="polite">
          <span class="lvf-selection-pill" data-role="selection-summary-text"></span>
        </div>
        <table class="estimate-table">
          <tfoot>
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="lvf-label-cell">TOTALS:</td>
              <td data-footer-field="labor">$0.00</td>
              <td data-footer-field="material">$0.00</td>
              <td data-footer-field="amount">$0.00</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    cards.parentNode.insertBefore(footer, container.nextSibling);
  }
}

// Sync the separate HTML header with the body table (widths + horizontal scroll)
function syncSeparatedListHeader() {
  const header = document.getElementById('list-view-header');
  const footer = document.getElementById('list-view-footer');
  const scroller = document.querySelector('#line-items-table-container .table-scroll');
  const tableContainer = document.getElementById('line-items-table-container');
  const bodyTable = document.querySelector('#line-items-table-container .estimate-table');
  if (!header || !scroller || !bodyTable || !tableContainer) return;
  const headerTable = header.querySelector('table');
  if (!headerTable) return;

  // Lock columns to the declared header widths instead of rendered widths,
  // otherwise the browser redistributes extra table space back into the first column.
  const ths = headerTable.querySelectorAll('thead th');
  if (!ths.length) return;
  const readDeclaredWidth = (th) => {
    const inlineWidth = Number.parseFloat(th.style.width || '');
    if (Number.isFinite(inlineWidth) && inlineWidth > 0) return inlineWidth;

    const inlineMinWidth = Number.parseFloat(th.style.minWidth || '');
    if (Number.isFinite(inlineMinWidth) && inlineMinWidth > 0) return inlineMinWidth;

    const computed = window.getComputedStyle(th);
    const computedWidth = Number.parseFloat(computed.width || '');
    if (Number.isFinite(computedWidth) && computedWidth > 0) return computedWidth;

    const computedMinWidth = Number.parseFloat(computed.minWidth || '');
    if (Number.isFinite(computedMinWidth) && computedMinWidth > 0) return computedMinWidth;

    return th.offsetWidth;
  };
  const widths = Array.from(ths).map((th) => readDeclaredWidth(th));
  const totalWidth = Math.ceil(widths.reduce((sum, width) => sum + width, 0));

  // Create/replace colgroups so columns lock to same widths
  const colgroupHTML = widths.map(w => `<col style="width:${w}px">`).join('');
  let hg = headerTable.querySelector('colgroup');
  if (!hg) { hg = document.createElement('colgroup'); headerTable.insertBefore(hg, headerTable.firstChild); }
  hg.innerHTML = colgroupHTML;
  headerTable.style.width = `${totalWidth}px`;
  headerTable.style.minWidth = `${totalWidth}px`;
  let bg = bodyTable.querySelector('colgroup');
  if (!bg) { bg = document.createElement('colgroup'); bodyTable.insertBefore(bg, bodyTable.firstChild); }
  bg.innerHTML = colgroupHTML;
  bodyTable.style.width = `${totalWidth}px`;
  bodyTable.style.minWidth = `${totalWidth}px`;
  const footerTable = footer?.querySelector('table');
  if (footerTable) {
    let fg = footerTable.querySelector('colgroup');
    if (!fg) { fg = document.createElement('colgroup'); footerTable.insertBefore(fg, footerTable.firstChild); }
    fg.innerHTML = colgroupHTML;
    footerTable.style.width = `${totalWidth}px`;
    footerTable.style.minWidth = `${totalWidth}px`;
  }

  if (footer) {
    const rect = tableContainer.getBoundingClientRect();
    header.style.width = `${Math.max(0, rect.width)}px`;
    header.style.maxWidth = `${Math.max(0, rect.width)}px`;
    footer.style.left = `${Math.max(0, rect.left)}px`;
    footer.style.width = `${Math.max(0, rect.width)}px`;
  }

  // Sync horizontal scroll position
  const inner = header.querySelector('.lvh-inner');
  const footerInner = footer?.querySelector('.lvf-inner') || null;
  if (inner) {
    inner.style.width = `${totalWidth}px`;
    inner.style.overflowX = 'hidden';
    inner.style.transform = `translateX(${-scroller.scrollLeft}px)`;
    if (footerInner) {
      footerInner.style.width = `${totalWidth}px`;
      footerInner.style.overflowX = 'hidden';
      footerInner.style.transform = `translateX(${-scroller.scrollLeft}px)`;
    }
  }
}

function initSeparatedListHeader() {
  const header = document.getElementById('list-view-header');
  const footer = document.getElementById('list-view-footer');
  const scroller = document.querySelector('#line-items-table-container .table-scroll');
  if (!header || !scroller || !footer) return;

  syncSeparatedListHeader();
  if (!scroller.__lvhSyncBound) {
    const syncFromScroller = () => {
      const headerEl = document.getElementById('list-view-header');
      const footerEl = document.getElementById('list-view-footer');
      const headerInner = headerEl?.querySelector('.lvh-inner');
      const footerInner = footerEl?.querySelector('.lvf-inner');
      if (!headerInner) return;
      headerInner.style.transform = `translateX(${-scroller.scrollLeft}px)`;
      if (footerInner) {
        footerInner.style.transform = `translateX(${-scroller.scrollLeft}px)`;
      }
    };

    scroller.addEventListener('scroll', syncFromScroller, { passive: true });
    scroller.__lvhSyncBound = true;
    scroller.__lvhSyncHandler = syncFromScroller;
  }
  try { scroller.__lvhSyncHandler?.(); } catch (_) {}
  if (!window.__lvhResizeBound) {
    window.addEventListener('resize', () => {
      try { syncSeparatedListHeader(); } catch(_) {}
      try {
        const activeScroller = document.querySelector('#line-items-table-container .table-scroll');
        activeScroller?.__lvhSyncHandler?.();
      } catch (_) {}
    });
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
  const categoryName = header ? (header.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || '') : '';
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
  const ganttBtn = document.getElementById('show-gantt-view-btn');
  if (btn && btn.dataset.viewBound !== 'true') {
    btn.dataset.viewBound = 'true';
    btn.addEventListener('click', () => {
      const mode = getCurrentEstimateViewMode();
      if (mode === 'list' || mode === 'gantt') {
        showCardView();
        localStorage.setItem('estimateViewMode', 'card');
      } else {
        showListView();
        localStorage.setItem('estimateViewMode', 'list');
      }
      syncEstimateViewButtons();
    });
  }
  if (ganttBtn && ganttBtn.dataset.viewBound !== 'true') {
    ganttBtn.dataset.viewBound = 'true';
    ganttBtn.addEventListener('click', () => {
      if (isGanttViewActive()) {
        showCardView();
        localStorage.setItem('estimateViewMode', 'card');
      } else {
        showGanttView();
        localStorage.setItem('estimateViewMode', 'gantt');
      }
      syncEstimateViewButtons();
    });
  }
  syncEstimateViewButtons();
}

function isListViewActive() {
  const tableContainer = document.getElementById('line-items-table-container');
  return tableContainer && tableContainer.style.display !== 'none';
}

function isGanttViewActive() {
  const ganttContainer = document.getElementById('gantt-view-container');
  return !!ganttContainer && ganttContainer.style.display !== 'none';
}

function getCurrentEstimateViewMode() {
  if (isGanttViewActive()) return 'gantt';
  if (isListViewActive()) return 'list';
  return 'card';
}

function syncEstimateViewButtons(mode = getCurrentEstimateViewMode()) {
  const btn = document.getElementById('toggle-view-btn');
  const ganttBtn = document.getElementById('show-gantt-view-btn');
  const icon = document.getElementById('toggle-view-icon');
  const label = document.getElementById('toggle-view-label');
  const listActive = mode === 'list';
  const ganttActive = mode === 'gantt';

  if (btn) {
    btn.setAttribute('aria-pressed', listActive ? 'true' : 'false');
    btn.classList.toggle('is-list', listActive);
    btn.style.background = listActive
      ? 'linear-gradient(180deg, #eef2ff, #e0e7ff)'
      : '#ffffff';
    btn.style.borderColor = listActive ? '#c7d2fe' : '#e2e8f0';
    btn.style.boxShadow = listActive
      ? '0 8px 20px rgba(99, 102, 241, 0.18)'
      : '0 1px 2px rgba(0,0,0,0.04)';
    btn.title = listActive ? 'Show card view' : 'Show list view';
  }
  if (icon) icon.setAttribute('data-mode', listActive ? 'list' : 'card');
  if (label) label.textContent = listActive ? 'Card View' : 'List View';

  if (ganttBtn) {
    ganttBtn.setAttribute('aria-pressed', ganttActive ? 'true' : 'false');
    ganttBtn.style.background = ganttActive
      ? 'linear-gradient(180deg, #eff6ff, #dbeafe)'
      : '#ffffff';
    ganttBtn.style.borderColor = ganttActive ? '#93c5fd' : '#e2e8f0';
    ganttBtn.style.boxShadow = ganttActive
      ? '0 8px 20px rgba(37, 99, 235, 0.18)'
      : '0 1px 2px rgba(0,0,0,0.04)';
    ganttBtn.title = ganttActive ? 'Return to card view' : 'Show gantt view';
  }
}

function shouldUseFilteredTotalsForMobileFooter() {
  if (typeof isListViewActive === 'function' && isListViewActive()) return false;
  return Array.from(document.querySelectorAll('.line-item-card')).some((card) => card.dataset.filterVisible === 'false');
}

function showCardView() {
  const cards = document.getElementById('line-items-cards');
  const tableContainer = document.getElementById('line-items-table-container');
  const header = document.getElementById('list-view-header');
  const footer = document.getElementById('list-view-footer');
  const ganttContainer = document.getElementById('gantt-view-container');
  if (cards) cards.style.display = '';
  if (tableContainer) tableContainer.style.display = 'none';
  if (header) header.style.display = 'none';
  if (footer) footer.style.display = 'none';
  if (ganttContainer) ganttContainer.style.display = 'none';
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
  try { if (typeof applyCategoryCollapseState === 'function') applyCategoryCollapseState(); } catch (_) {}
  try {
    if (typeof updateTableFooterTotals === 'function') {
      updateTableFooterTotals(shouldUseFilteredTotalsForMobileFooter());
    }
  } catch (_) {}
  syncEstimateViewButtons('card');
  try { updateSelectedLaborCost(); } catch (_) {}
}

function showListView() {
  ensureListViewContainer();
  buildListViewFromCards();
  const cards = document.getElementById('line-items-cards');
  const tableContainer = document.getElementById('line-items-table-container');
  const header = document.getElementById('list-view-header');
  const footer = document.getElementById('list-view-footer');
  const ganttContainer = document.getElementById('gantt-view-container');
  if (cards) cards.style.display = 'none';
  if (tableContainer) tableContainer.style.display = '';
  if (header) header.style.display = '';
  if (footer) footer.style.display = 'block';
  if (ganttContainer) ganttContainer.style.display = 'none';
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
  syncEstimateViewButtons('list');
  try { updateSelectedLaborCost(); } catch (_) {}
}

function parseGanttDateValue(value) {
  if (!value) return null;
  const parts = String(value).split('-').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addGanttDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getGanttDayDiff(startDate, endDate) {
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function formatEstimateDateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatGanttRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) return 'No dates yet';
  return `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

function formatEstimateStatusLabel(statusValue) {
  return String(statusValue || 'new')
    .split('-')
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : '')
    .join(' ')
    .trim() || 'New';
}

function getGanttStatusClass(statusValue) {
  const normalized = String(statusValue || 'new').trim().toLowerCase().replace(/[\s_]+/g, '-');
  switch (normalized) {
    case 'in-progress':
      return 'status-in-progress';
    case 'completed':
      return 'status-completed';
    case 'approved':
      return 'status-approved';
    case 'rework':
      return 'status-rework';
    case 'overdue':
      return 'status-overdue';
    case 'on-hold':
      return 'status-on-hold';
    case 'new':
    case 'pending':
    default:
      return 'status-pending';
  }
}

function escapeGanttHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const GANTT_CATEGORY_THEMES = [
  { color: '#2563eb', dark: '#1d4ed8', text: '#ffffff' },
  { color: '#0f766e', dark: '#115e59', text: '#ffffff' },
  { color: '#7c3aed', dark: '#6d28d9', text: '#ffffff' },
  { color: '#be123c', dark: '#9f1239', text: '#ffffff' },
  { color: '#c2410c', dark: '#9a3412', text: '#ffffff' },
  { color: '#475569', dark: '#334155', text: '#ffffff' },
  { color: '#ca8a04', dark: '#a16207', text: '#ffffff' },
  { color: '#0369a1', dark: '#075985', text: '#ffffff' }
];

function getGanttCategoryTheme(categoryName) {
  const key = String(categoryName || 'uncategorized').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return GANTT_CATEGORY_THEMES[Math.abs(hash) % GANTT_CATEGORY_THEMES.length];
}

const GANTT_ZOOM_LEVELS = [28, 36, 44, 56];
const GANTT_ZOOM_STORAGE_KEY = 'estimateGanttZoomIndex';
let __ganttDragState = null;
const __expandedGanttRows = new Set();

function getStoredGanttZoomIndex() {
  try {
    const rawValue = Number(window.localStorage.getItem(GANTT_ZOOM_STORAGE_KEY));
    if (Number.isInteger(rawValue) && rawValue >= 0 && rawValue < GANTT_ZOOM_LEVELS.length) {
      return rawValue;
    }
  } catch (_) {}
  return 1;
}

function getCurrentGanttDayWidth() {
  return GANTT_ZOOM_LEVELS[getStoredGanttZoomIndex()] || GANTT_ZOOM_LEVELS[1];
}

function persistGanttZoomIndex(nextIndex) {
  try {
    window.localStorage.setItem(GANTT_ZOOM_STORAGE_KEY, String(nextIndex));
  } catch (_) {}
}

function setCurrentGanttZoomIndex(nextIndex) {
  const clampedIndex = Math.max(0, Math.min(GANTT_ZOOM_LEVELS.length - 1, Number(nextIndex) || 0));
  persistGanttZoomIndex(clampedIndex);
  const container = document.getElementById('gantt-view-container');
  if (container) {
    syncGanttZoomControls(container);
  }
  if (typeof isGanttViewActive === 'function' && isGanttViewActive()) {
    buildGanttViewFromCards();
  }
}

function syncGanttZoomControls(container = document.getElementById('gantt-view-container')) {
  if (!container) return;
  const zoomIndex = getStoredGanttZoomIndex();
  const zoomValue = GANTT_ZOOM_LEVELS[zoomIndex] || GANTT_ZOOM_LEVELS[1];
  const zoomOutButton = container.querySelector('[data-gantt-zoom="out"]');
  const zoomInButton = container.querySelector('[data-gantt-zoom="in"]');
  const zoomLabel = container.querySelector('[data-role="gantt-zoom-label"]');
  if (zoomOutButton) zoomOutButton.disabled = zoomIndex <= 0;
  if (zoomInButton) zoomInButton.disabled = zoomIndex >= GANTT_ZOOM_LEVELS.length - 1;
  if (zoomLabel) zoomLabel.textContent = `${zoomValue}px/day`;
}

function isGanttRowExpanded(itemId) {
  return __expandedGanttRows.has(String(itemId || ''));
}

function toggleGanttRowExpanded(itemId) {
  const key = String(itemId || '');
  if (!key) return;
  if (__expandedGanttRows.has(key)) {
    __expandedGanttRows.delete(key);
  } else {
    __expandedGanttRows.add(key);
  }
}

function clearGanttPreviewIndicators() {
  const container = document.getElementById('gantt-view-container');
  if (!container) return;
  container.querySelectorAll('.gantt-day-cell.is-preview-start, .gantt-day-cell.is-preview-end, .gantt-day-cell.is-preview-span')
    .forEach((cell) => cell.classList.remove('is-preview-start', 'is-preview-end', 'is-preview-span'));
  container.querySelectorAll('.gantt-row-track.has-preview').forEach((track) => {
    track.classList.remove('has-preview');
    track.style.removeProperty('--gantt-preview-left');
    track.style.removeProperty('--gantt-preview-width');
  });
}

function updateGanttPreviewIndicators(rangeStart, previewStartDate, previewEndDate, itemId, dayWidth) {
  const container = document.getElementById('gantt-view-container');
  if (!container || !rangeStart || !previewStartDate || !previewEndDate) return;

  clearGanttPreviewIndicators();

  const previewStartKey = formatEstimateDateKey(previewStartDate);
  const previewEndKey = formatEstimateDateKey(previewEndDate);
  const previewLeft = getGanttDayDiff(rangeStart, previewStartDate) * dayWidth;
  const previewSpanDays = Math.max(0, getGanttDayDiff(previewStartDate, previewEndDate));
  const previewWidth = Math.max(previewSpanDays * dayWidth, dayWidth);

  container.querySelectorAll('.gantt-day-cell').forEach((cell) => {
    const cellKey = cell.getAttribute('data-day-key') || '';
    if (!cellKey) return;
    if (cellKey >= previewStartKey && cellKey <= previewEndKey) {
      cell.classList.add('is-preview-span');
    }
    if (cellKey === previewStartKey) {
      cell.classList.add('is-preview-start');
    }
    if (cellKey === previewEndKey) {
      cell.classList.add('is-preview-end');
    }
  });

  const activeTrack = container.querySelector(`.gantt-row-track[data-card-id="${itemId}"]`);
  if (activeTrack) {
    activeTrack.classList.add('has-preview');
    activeTrack.style.setProperty('--gantt-preview-left', `${previewLeft}px`);
    activeTrack.style.setProperty('--gantt-preview-width', `${previewWidth}px`);
  }
}

function commitGanttSchedule(itemId, nextStartValue, nextEndValue, options = {}) {
  const { silent = false } = options;
  const card = findLineItemCardById(itemId);
  if (!card) return Promise.resolve(false);

  const startInput = card.querySelector('.item-start-date');
  const endInput = card.querySelector('.item-end-date');
  const lineItemId = card.getAttribute('data-item-id') || '';
  const startValue = String(nextStartValue || '');
  const endValue = String(nextEndValue || '');
  const currentStart = startInput?.value || '';
  const currentEnd = endInput?.value || '';

  if (currentStart === startValue && currentEnd === endValue) {
    return Promise.resolve(false);
  }

  if (startInput) startInput.value = startValue;
  if (endInput) endInput.value = endValue;

  try { renderProjectPhaseBar(); } catch (_) {}
  try { applyFilters(); } catch (_) {}
  try { updateSummary(); } catch (_) {}

  return fetch(`/api/estimates/line-items/${lineItemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: startValue, endDate: endValue })
  }).then((response) => {
    if (!response.ok) {
      throw new Error('Failed to update gantt dates');
    }
    if (!silent) {
      showToast('Schedule updated!');
    }
    try { buildGanttViewFromCards(); } catch (_) {}
    return true;
  }).catch((error) => {
    if (startInput) startInput.value = currentStart;
    if (endInput) endInput.value = currentEnd;
    try { renderProjectPhaseBar(); } catch (_) {}
    try { applyFilters(); } catch (_) {}
    try { updateSummary(); } catch (_) {}
    try { buildGanttViewFromCards(); } catch (_) {}
    if (!silent) {
      showToast('Failed to update schedule');
    }
    throw error;
  });
}

function clearGanttDragState() {
  if (!__ganttDragState) return;
  const { barEl, trackEl, pointerId, moveHandler, upHandler } = __ganttDragState;
  try { if (barEl && pointerId !== undefined) barEl.releasePointerCapture(pointerId); } catch (_) {}
  try { if (trackEl) trackEl.classList.remove('is-dragging'); } catch (_) {}
  try { if (barEl) barEl.classList.remove('is-dragging'); } catch (_) {}
  try { clearGanttPreviewIndicators(); } catch (_) {}
  try { window.removeEventListener('pointermove', moveHandler, true); } catch (_) {}
  try { window.removeEventListener('pointerup', upHandler, true); } catch (_) {}
  __ganttDragState = null;
}

function beginGanttBarDrag(event, barEl, dragMode) {
  if (!barEl || !dragMode) return;
  const trackEl = barEl.closest('.gantt-row-track');
  const itemId = barEl.getAttribute('data-card-id') || '';
  const startDate = parseGanttDateValue(barEl.getAttribute('data-start-date') || '');
  const endDate = parseGanttDateValue(barEl.getAttribute('data-end-date') || '');
  const rangeStart = parseGanttDateValue(trackEl?.getAttribute('data-range-start') || '');
  const dayWidth = Number(trackEl?.getAttribute('data-day-width') || getCurrentGanttDayWidth()) || getCurrentGanttDayWidth();
  if (!trackEl || !itemId || !startDate || !endDate || !rangeStart) return;

  clearGanttDragState();

  const durationDays = Math.max(0, getGanttDayDiff(startDate, endDate));
  const initialOffset = getGanttDayDiff(rangeStart, startDate);
  const initialLeft = initialOffset * dayWidth + 4;
  const initialWidth = Math.max((durationDays + 1) * dayWidth - 8, Math.max(dayWidth - 8, 20));

  const moveHandler = (moveEvent) => {
    if (!__ganttDragState) return;
    const deltaDays = Math.round((moveEvent.clientX - __ganttDragState.startClientX) / __ganttDragState.dayWidth);
    let nextStartDate = __ganttDragState.originalStartDate;
    let nextEndDate = __ganttDragState.originalEndDate;

    if (__ganttDragState.dragMode === 'move') {
      nextStartDate = addGanttDays(__ganttDragState.originalStartDate, deltaDays);
      nextEndDate = addGanttDays(__ganttDragState.originalEndDate, deltaDays);
    } else if (__ganttDragState.dragMode === 'resize-start') {
      nextStartDate = addGanttDays(__ganttDragState.originalStartDate, deltaDays);
      if (nextStartDate > nextEndDate) nextStartDate = nextEndDate;
    } else if (__ganttDragState.dragMode === 'resize-end') {
      nextEndDate = addGanttDays(__ganttDragState.originalEndDate, deltaDays);
      if (nextEndDate < nextStartDate) nextEndDate = nextStartDate;
    }

    const nextLeft = getGanttDayDiff(__ganttDragState.rangeStart, nextStartDate) * __ganttDragState.dayWidth + 4;
    const nextSpanDays = Math.max(0, getGanttDayDiff(nextStartDate, nextEndDate));
    const nextWidth = Math.max(nextSpanDays * __ganttDragState.dayWidth - 8, Math.max(__ganttDragState.dayWidth - 8, 20));
    __ganttDragState.previewStartValue = formatEstimateDateKey(nextStartDate);
    __ganttDragState.previewEndValue = formatEstimateDateKey(nextEndDate);
    __ganttDragState.barEl.style.left = `${nextLeft}px`;
    __ganttDragState.barEl.style.width = `${nextWidth}px`;
    __ganttDragState.barEl.setAttribute('data-preview-range', formatGanttRangeLabel(nextStartDate, nextEndDate));
    updateGanttPreviewIndicators(__ganttDragState.rangeStart, nextStartDate, nextEndDate, __ganttDragState.itemId, __ganttDragState.dayWidth);
  };

  const upHandler = () => {
    const activeState = __ganttDragState;
    clearGanttDragState();
    if (!activeState) return;
    const nextStartValue = activeState.previewStartValue || formatEstimateDateKey(activeState.originalStartDate);
    const nextEndValue = activeState.previewEndValue || formatEstimateDateKey(activeState.originalEndDate);
    commitGanttSchedule(activeState.itemId, nextStartValue, nextEndValue, { silent: true }).catch(() => {});
  };

  __ganttDragState = {
    itemId,
    barEl,
    trackEl,
    pointerId: event.pointerId,
    dragMode,
    dayWidth,
    startClientX: event.clientX,
    rangeStart,
    originalStartDate: startDate,
    originalEndDate: endDate,
    previewStartValue: formatEstimateDateKey(startDate),
    previewEndValue: formatEstimateDateKey(endDate),
    initialLeft,
    initialWidth,
    moveHandler,
    upHandler
  };

  barEl.classList.add('is-dragging');
  trackEl.classList.add('is-dragging');
  updateGanttPreviewIndicators(rangeStart, startDate, endDate, itemId, dayWidth);
  try { barEl.setPointerCapture(event.pointerId); } catch (_) {}
  window.addEventListener('pointermove', moveHandler, true);
  window.addEventListener('pointerup', upHandler, true);
}

function findLineItemCardById(itemId) {
  return Array.from(document.querySelectorAll('.line-item-card')).find((card) => String(card.getAttribute('data-item-id') || '') === String(itemId || '')) || null;
}

function ensureGanttViewContainer() {
  const cards = document.getElementById('line-items-cards');
  if (!cards || !cards.parentNode) return null;

  let container = document.getElementById('gantt-view-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gantt-view-container';
    container.style.display = 'none';
    container.style.marginTop = '10px';
    container.innerHTML = `
      <style>
        #gantt-view-container {
          position: relative;
        }
        #gantt-view-container .gantt-shell {
          border: 1px solid #dbe4f0;
          border-radius: 20px;
          background:
            radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 28%),
            linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }
        #gantt-view-container .gantt-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
          background: linear-gradient(135deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.92));
        }
        #gantt-view-container .gantt-eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #2563eb;
          margin-bottom: 8px;
        }
        #gantt-view-container .gantt-toolbar h3 {
          margin: 0;
          font-size: 20px;
          line-height: 1.1;
          color: #0f172a;
        }
        #gantt-view-container .gantt-toolbar p {
          margin: 6px 0 0;
          max-width: 460px;
          color: #475569;
          font-size: 13px;
        }
        #gantt-view-container .gantt-toolbar-right {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 10px;
        }
        #gantt-view-container .gantt-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }
        #gantt-view-container .gantt-stat {
          min-width: 108px;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(191, 219, 254, 0.9);
          box-shadow: 0 10px 20px rgba(148, 163, 184, 0.12);
        }
        #gantt-view-container .gantt-stat strong,
        #gantt-view-container .gantt-stat span {
          display: block;
          color: #0f172a;
          font-size: 12px;
          font-weight: 700;
        }
        #gantt-view-container .gantt-stat small {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        #gantt-view-container .gantt-zoom-controls {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(191, 219, 254, 0.9);
          box-shadow: 0 10px 20px rgba(148, 163, 184, 0.12);
        }
        #gantt-view-container .gantt-zoom-button {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          border: 1px solid #bfdbfe;
          background: #ffffff;
          color: #1d4ed8;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
        }
        #gantt-view-container .gantt-zoom-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        #gantt-view-container .gantt-zoom-label {
          min-width: 70px;
          color: #0f172a;
          font-size: 12px;
          font-weight: 800;
          text-align: center;
        }
        #gantt-view-container .gantt-scroll {
          overflow: auto;
          max-height: min(72vh, calc(100vh - 260px));
          padding: 0 0 10px;
          overscroll-behavior: contain;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        #gantt-view-container .gantt-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        #gantt-view-container .gantt-board {
          min-width: max-content;
        }
        #gantt-view-container .gantt-header,
        #gantt-view-container .gantt-subheader,
        #gantt-view-container .gantt-row {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          align-items: stretch;
        }
        #gantt-view-container .gantt-header,
        #gantt-view-container .gantt-subheader {
          position: sticky;
          top: 0;
          z-index: 6;
        }
        #gantt-view-container .gantt-subheader {
          top: 40px;
          z-index: 5;
        }
        #gantt-view-container .gantt-sticky-cell {
          position: sticky;
          left: 0;
          z-index: 7;
          display: flex;
          align-items: center;
          padding: 10px 14px;
          background: rgba(248, 250, 252, 0.96);
          border-right: 1px solid rgba(226, 232, 240, 0.9);
          color: #334155;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        #gantt-view-container .gantt-months,
        #gantt-view-container .gantt-days,
        #gantt-view-container .gantt-row-track {
          position: relative;
          min-height: 40px;
          background: rgba(255, 255, 255, 0.9);
        }
        #gantt-view-container .gantt-months {
          display: grid;
          border-bottom: 1px solid rgba(226, 232, 240, 0.9);
        }
        #gantt-view-container .gantt-month-cell {
          padding: 10px 8px 8px;
          border-right: 1px solid rgba(226, 232, 240, 0.85);
          color: #475569;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.96);
        }
        #gantt-view-container .gantt-days {
          display: grid;
          border-bottom: 1px solid rgba(226, 232, 240, 0.95);
        }
        #gantt-view-container .gantt-day-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          min-height: 34px;
          border-right: 1px solid rgba(226, 232, 240, 0.75);
          color: #64748b;
          font-size: 10px;
          background: rgba(255, 255, 255, 0.94);
        }
        #gantt-view-container .gantt-day-cell strong {
          color: #0f172a;
          font-size: 12px;
        }
        #gantt-view-container .gantt-day-cell.is-weekend {
          background: rgba(241, 245, 249, 0.95);
        }
        #gantt-view-container .gantt-day-cell.is-today {
          background: linear-gradient(180deg, rgba(191, 219, 254, 0.98), rgba(219, 234, 254, 0.95));
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
        }
        #gantt-view-container .gantt-day-cell.is-today strong {
          color: #1d4ed8;
        }
        #gantt-view-container .gantt-day-cell.is-preview-span {
          background: rgba(254, 240, 138, 0.45);
        }
        #gantt-view-container .gantt-day-cell.is-preview-start,
        #gantt-view-container .gantt-day-cell.is-preview-end {
          background: rgba(253, 224, 71, 0.62);
          box-shadow: inset 0 0 0 1px rgba(202, 138, 4, 0.24);
        }
        #gantt-view-container .gantt-row {
          min-height: 40px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.85);
        }
        #gantt-view-container .gantt-row.is-expanded {
          min-height: 82px;
        }
        #gantt-view-container .gantt-row-info {
          position: sticky;
          left: 0;
          z-index: 4;
          padding: 0px 12px;
          background: rgba(255, 255, 255, 0.96);
          border-right: 1px solid rgba(226, 232, 240, 0.85);
        }
        #gantt-view-container .gantt-row-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          min-height: 34px;
          padding: 0;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        #gantt-view-container .gantt-row-summary:focus-visible {
          outline: 2px solid rgba(96, 165, 250, 0.35);
          outline-offset: 2px;
          border-radius: 8px;
        }
        #gantt-view-container .gantt-row-summary-left {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1 1 auto;
        }
        #gantt-view-container .gantt-row-summary-right {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }
        #gantt-view-container .gantt-row-toggle {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #eff6ff;
          color: #2563eb;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          flex: 0 0 auto;
        }
        #gantt-view-container .gantt-row.is-expanded .gantt-row-toggle {
          transform: rotate(90deg);
        }
        #gantt-view-container .gantt-row-title {
          margin: 0;
          color: #0f172a;
          font-size: 13px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #gantt-view-container .gantt-row-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 7px;
        }
        #gantt-view-container .gantt-row-details {
          display: none;
          margin-top: 8px;
        }
        #gantt-view-container .gantt-row.is-expanded .gantt-row-details {
          display: block;
        }
        #gantt-view-container .gantt-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          color: #1e293b;
          background: #f1f5f9;
        }
        #gantt-view-container .gantt-chip.phase {
          background: #dbeafe;
          color: #1d4ed8;
        }
        #gantt-view-container .gantt-chip.progress {
          background: #ecfccb;
          color: #3f6212;
        }
        #gantt-view-container .gantt-chip.status {
          color: #ffffff;
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
        }
        #gantt-view-container .gantt-chip.status.status-in-progress {
          background: linear-gradient(135deg, #facc15, #eab308);
          color: #422006;
        }
        #gantt-view-container .gantt-chip.status.status-completed,
        #gantt-view-container .gantt-chip.status.status-approved {
          background: linear-gradient(135deg, #22c55e, #15803d);
          color: #ffffff;
        }
        #gantt-view-container .gantt-chip.status.status-rework {
          background: linear-gradient(135deg, #f97316, #ea580c);
        }
        #gantt-view-container .gantt-chip.status.status-pending,
        #gantt-view-container .gantt-chip.status.status-new,
        #gantt-view-container .gantt-chip.status.status-on-hold {
          background: linear-gradient(135deg, #94a3b8, #64748b);
        }
        #gantt-view-container .gantt-chip.status.status-overdue {
          background: linear-gradient(135deg, #ef4444, #b91c1c);
        }
        #gantt-view-container .gantt-chip.status-badge {
          color: #ffffff;
          padding: 5px 9px;
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
        }
        #gantt-view-container .gantt-chip.status-badge.status-pending,
        #gantt-view-container .gantt-chip.status-badge.status-new {
          background: linear-gradient(135deg, #94a3b8, #64748b);
        }
        #gantt-view-container .gantt-chip.status-badge.status-in-progress {
          background: linear-gradient(135deg, #facc15, #eab308);
          color: #422006;
        }
        #gantt-view-container .gantt-chip.status-badge.status-completed,
        #gantt-view-container .gantt-chip.status-badge.status-approved {
          background: linear-gradient(135deg, #22c55e, #15803d);
        }
        #gantt-view-container .gantt-chip.status-badge.status-rework {
          background: linear-gradient(135deg, #f97316, #ea580c);
        }
        #gantt-view-container .gantt-chip.status-badge.status-overdue {
          background: linear-gradient(135deg, #ef4444, #b91c1c);
        }
        #gantt-view-container .gantt-row-dates {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 9px;
        }
        #gantt-view-container .gantt-row-dates label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1 1 0;
          color: #64748b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        #gantt-view-container .gantt-date-input {
          width: 100%;
          min-width: 0;
          padding: 6px 8px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: rgba(255, 255, 255, 0.95);
          color: #0f172a;
          font-size: 12px;
          box-sizing: border-box;
        }
        #gantt-view-container .gantt-date-input:focus {
          outline: none;
          border-color: #60a5fa;
          box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
        }
        #gantt-view-container .gantt-row-track {
          overflow: hidden;
          background-image: repeating-linear-gradient(
            to right,
            rgba(226, 232, 240, 0.75) 0,
            rgba(226, 232, 240, 0.75) 1px,
            transparent 1px,
            transparent var(--gantt-day-width, 36px)
          );
        }
        #gantt-view-container .gantt-row-track.is-dragging {
          cursor: grabbing;
        }
        #gantt-view-container .gantt-row-track::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(248, 250, 252, 0.5), rgba(255, 255, 255, 0.12));
          pointer-events: none;
        }
        #gantt-view-container .gantt-track-today {
          position: absolute;
          top: 0;
          bottom: 0;
          width: var(--gantt-day-width, 36px);
          background: linear-gradient(180deg, rgba(191, 219, 254, 0.36), rgba(147, 197, 253, 0.22));
          border-left: 1px solid rgba(37, 99, 235, 0.22);
          border-right: 1px solid rgba(37, 99, 235, 0.16);
          pointer-events: none;
          z-index: 0;
        }
        #gantt-view-container .gantt-track-preview {
          position: absolute;
          top: 0;
          bottom: 0;
          left: var(--gantt-preview-left, 0px);
          width: var(--gantt-preview-width, 0px);
          background: linear-gradient(180deg, rgba(253, 224, 71, 0.24), rgba(250, 204, 21, 0.14));
          border-left: 2px solid rgba(202, 138, 4, 0.65);
          border-right: 2px solid rgba(202, 138, 4, 0.45);
          opacity: 0;
          pointer-events: none;
          z-index: 1;
          transition: opacity 0.08s ease;
        }
        #gantt-view-container .gantt-row-track.has-preview .gantt-track-preview {
          opacity: 1;
        }
        #gantt-view-container .gantt-row-bar {
          position: absolute;
          top: 11px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          padding: 0 28px 0 18px;
          border-radius: 11px;
          color: var(--gantt-cat-text, #ffffff);
          background: linear-gradient(135deg, var(--gantt-cat-color, #64748b), var(--gantt-cat-color-dark, #475569));
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(8px);
          overflow: hidden;
          cursor: grab;
          touch-action: none;
          z-index: 2;
        }
        #gantt-view-container .gantt-row-bar.is-dragging {
          cursor: grabbing;
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.24);
        }
        #gantt-view-container .gantt-row-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.16), transparent 55%);
          pointer-events: none;
        }
        #gantt-view-container .gantt-row-bar::before {
          content: attr(data-preview-range);
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 9px;
          font-weight: 700;
          opacity: 0.86;
        }
        #gantt-view-container .gantt-row-bar-label {
          overflow: hidden;
          text-overflow: ellipsis;
          position: relative;
          z-index: 1;
        }
        #gantt-view-container .gantt-row-handle {
          position: absolute;
          top: 4px;
          bottom: 4px;
          width: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.42);
          cursor: ew-resize;
          z-index: 2;
        }
        #gantt-view-container .gantt-row-handle.start {
          left: 4px;
        }
        #gantt-view-container .gantt-row-handle.end {
          right: 4px;
        }
        #gantt-view-container .gantt-row.is-expanded .gantt-row-bar {
          top: 21px;
        }
        #gantt-view-container .gantt-row-placeholder {
          position: absolute;
          top: 12px;
          left: 10px;
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px dashed #cbd5e1;
          background: rgba(255, 255, 255, 0.85);
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
        }
        #gantt-view-container .gantt-row.is-expanded .gantt-row-placeholder {
          top: 22px;
        }
        #gantt-view-container .gantt-empty {
          padding: 48px 24px;
          text-align: center;
          color: #64748b;
          font-size: 15px;
        }
        @media (max-width: 960px) {
          #gantt-view-container .gantt-toolbar {
            flex-direction: column;
          }
          #gantt-view-container .gantt-stats {
            justify-content: flex-start;
          }
          #gantt-view-container .gantt-toolbar-right {
            justify-content: flex-start;
          }
          #gantt-view-container .gantt-header,
          #gantt-view-container .gantt-subheader,
          #gantt-view-container .gantt-row {
            grid-template-columns: 250px minmax(0, 1fr);
          }
        }
      </style>
      <div class="gantt-shell">
        <div class="gantt-toolbar">
          <div>
            <div class="gantt-eyebrow">Project Schedule</div>
           
            
          </div>
          <div class="gantt-toolbar-right">
            <div class="gantt-zoom-controls">
              <button type="button" class="gantt-zoom-button" data-gantt-zoom="out" aria-label="Zoom out">-</button>
              <span class="gantt-zoom-label" data-role="gantt-zoom-label">36px/day</span>
              <button type="button" class="gantt-zoom-button" data-gantt-zoom="in" aria-label="Zoom in">+</button>
            </div>
            <div class="gantt-stats">
              <div class="gantt-stat"><span data-role="gantt-scheduled-count">0</span><small>Scheduled</small></div>
              <div class="gantt-stat"><span data-role="gantt-range-label">No dates yet</span><small>Timeline</small></div>
            </div>
          </div>
        </div>
        <div class="gantt-scroll">
          <div class="gantt-board" data-role="gantt-board"></div>
        </div>
      </div>
    `;
    cards.parentNode.insertBefore(container, cards.nextSibling);
  }

  if (container.dataset.bound !== 'true') {
    container.dataset.bound = 'true';
    container.addEventListener('change', (event) => {
      const input = event.target.closest('.gantt-date-input');
      if (!input) return;
      const cardId = input.getAttribute('data-card-id') || '';
      const field = input.getAttribute('data-date-field') || 'start';
      const card = findLineItemCardById(cardId);
      if (!card) return;
      const startValue = field === 'start'
        ? input.value
        : (card.querySelector('.item-start-date')?.value || '');
      const endValue = field === 'end'
        ? input.value
        : (card.querySelector('.item-end-date')?.value || '');
      commitGanttSchedule(cardId, startValue, endValue).catch(() => {});
    });
    container.addEventListener('click', (event) => {
      const zoomButton = event.target.closest('[data-gantt-zoom]');
      if (zoomButton) {
        const direction = zoomButton.getAttribute('data-gantt-zoom') === 'in' ? 1 : -1;
        setCurrentGanttZoomIndex(getStoredGanttZoomIndex() + direction);
        return;
      }
      const toggleAllButton = event.target.closest('[data-gantt-toggle-all-categories]');
      if (toggleAllButton) {
        const headers = Array.from(document.querySelectorAll('.category-header')).filter((header) => header.style.display !== 'none');
        if (headers.length) {
          const nextCollapsed = !headers.every((header) => isCategoryCollapsed(header));
          headers.forEach((header) => setCategoryCollapsed(header, nextCollapsed));
          try { applyCategoryCollapseState(); } catch (_) {}
          buildGanttViewFromCards();
        }
        return;
      }
      const categoryButton = event.target.closest('.gantt-row-summary[data-category-key]');
      if (categoryButton && !categoryButton.hasAttribute('data-card-id')) {
        const categoryKey = categoryButton.getAttribute('data-category-key') || '';
        const categoryHeader = Array.from(document.querySelectorAll('.category-header')).find((header) => ensureCategoryCollapseKey(header) === categoryKey) || null;
        if (categoryHeader) {
          setCategoryCollapsed(categoryHeader, !isCategoryCollapsed(categoryHeader));
          try { applyCategoryCollapseState(); } catch (_) {}
          buildGanttViewFromCards();
        }
        return;
      }
      const summaryButton = event.target.closest('.gantt-row-summary');
      if (!summaryButton) return;
      const itemId = summaryButton.getAttribute('data-card-id') || '';
      if (!itemId) return;
      toggleGanttRowExpanded(itemId);
      buildGanttViewFromCards();
    });
    container.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('.gantt-row-handle');
      const bar = event.target.closest('.gantt-row-bar');
      if (!bar) return;
      const dragMode = handle
        ? (handle.classList.contains('start') ? 'resize-start' : 'resize-end')
        : 'move';
      event.preventDefault();
      beginGanttBarDrag(event, bar, dragMode);
    });
  }

  syncGanttZoomControls(container);

  return container;
}

function buildGanttViewFromCards() {
  const container = ensureGanttViewContainer();
  const board = container?.querySelector('[data-role="gantt-board"]');
  const scheduledCountEl = container?.querySelector('[data-role="gantt-scheduled-count"]');
  const rangeLabelEl = container?.querySelector('[data-role="gantt-range-label"]');
  if (!container || !board) return;

  const cards = Array.from(document.querySelectorAll('.line-item-card'));
  const visibleCards = cards.filter((card) => card.dataset.filterVisible !== 'false');
  if (!visibleCards.length) {
    board.innerHTML = '<div class="gantt-empty">No line items match the current filters.</div>';
    if (scheduledCountEl) scheduledCountEl.textContent = '0';
    if (rangeLabelEl) rangeLabelEl.textContent = 'No dates yet';
    return;
  }

  const items = visibleCards.map((card) => {
    const itemId = card.getAttribute('data-item-id') || '';
    const name = card.querySelector('.item-name')?.value?.trim() || 'Untitled line item';
    let categoryHeader = card?.previousElementSibling || null;
    while (categoryHeader && !categoryHeader.classList.contains('category-header')) {
      categoryHeader = categoryHeader.previousElementSibling;
    }
    const categoryName = categoryHeader?.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || 'Uncategorized';
    const statusValue = String(card.querySelector('.item-status-dropdown')?.value || 'new').toLowerCase();
    const statusClass = getGanttStatusClass(statusValue);
    const phaseValue = typeof getLineItemPhaseFromCard === 'function' ? getLineItemPhaseFromCard(card) : DEFAULT_PROJECT_PHASE;
    const phaseLabel = typeof getProjectPhaseLabel === 'function' ? getProjectPhaseLabel(phaseValue, true) : phaseValue;
    const percentComplete = typeof getLineItemCompletionFromCard === 'function' ? getLineItemCompletionFromCard(card) : 0;
    const startValue = card.querySelector('.item-start-date')?.value || '';
    const endValue = card.querySelector('.item-end-date')?.value || '';
    const startDate = parseGanttDateValue(startValue);
    const endDate = parseGanttDateValue(endValue);
    return {
      itemId,
      name,
      categoryName,
      statusValue,
      statusClass,
      phaseLabel,
      percentComplete,
      startValue,
      endValue,
      startDate,
      endDate
    };
  });

  const groupedItems = [];
  items.forEach((item, index) => {
    const card = visibleCards[index];
    let categoryHeader = card?.previousElementSibling || null;
    while (categoryHeader && !categoryHeader.classList.contains('category-header')) {
      categoryHeader = categoryHeader.previousElementSibling;
    }
    const categoryName = item.categoryName || 'Uncategorized';
    const categoryKey = categoryHeader
      ? ensureCategoryCollapseKey(categoryHeader, categoryName)
      : `name:${String(categoryName).toLowerCase()}`;
    const lastGroup = groupedItems[groupedItems.length - 1];
    if (!lastGroup || lastGroup.categoryKey !== categoryKey) {
      groupedItems.push({
        categoryKey,
        categoryHeader,
        categoryName,
        items: [item]
      });
    } else {
      lastGroup.items.push(item);
    }
  });
  const groupedCategoryHeaders = groupedItems
    .map((group) => group.categoryHeader)
    .filter(Boolean);
  const allGroupedCategoriesCollapsed = groupedCategoryHeaders.length > 0
    && groupedCategoryHeaders.every((header) => isCategoryCollapsed(header));

  const datedItems = items.filter((item) => item.startDate && item.endDate);
  const estimateStart = parseGanttDateValue(document.getElementById('estimate-start-date')?.value || '');
  const estimateEnd = parseGanttDateValue(document.getElementById('estimate-end-date')?.value || '');
  const today = parseGanttDateValue(new Date().toISOString().slice(0, 10));
  let rangeStart = datedItems.length
    ? datedItems.reduce((min, item) => item.startDate < min ? item.startDate : min, datedItems[0].startDate)
    : estimateStart || today;
  let rangeEnd = datedItems.length
    ? datedItems.reduce((max, item) => item.endDate > max ? item.endDate : max, datedItems[0].endDate)
    : estimateEnd || addGanttDays(rangeStart, 13);

  if (estimateStart && estimateStart < rangeStart) rangeStart = estimateStart;
  if (estimateEnd && estimateEnd > rangeEnd) rangeEnd = estimateEnd;
  if (rangeEnd < rangeStart) rangeEnd = rangeStart;

  rangeStart = addGanttDays(rangeStart, -1);
  rangeEnd = addGanttDays(rangeEnd, 1);

  const totalDays = Math.max(1, getGanttDayDiff(rangeStart, rangeEnd) + 1);
  const dayWidth = getCurrentGanttDayWidth();
  const timelineWidth = totalDays * dayWidth;

  const dayDates = Array.from({ length: totalDays }, (_, index) => addGanttDays(rangeStart, index));
  const monthSegments = [];
  let currentSegment = null;
  dayDates.forEach((date) => {
    const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (!currentSegment || currentSegment.key !== monthKey) {
      currentSegment = {
        key: monthKey,
        label: date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        span: 1
      };
      monthSegments.push(currentSegment);
    } else {
      currentSegment.span += 1;
    }
  });

  board.innerHTML = `
    <div class="gantt-header">
      <div class="gantt-sticky-cell">Line Items</div>
      <div class="gantt-months" style="grid-template-columns: ${monthSegments.map((segment) => `${segment.span * dayWidth}px`).join(' ')}; width:${timelineWidth}px;">
        ${monthSegments.map((segment) => `<div class="gantt-month-cell">${escapeGanttHtml(segment.label)}</div>`).join('')}
      </div>
    </div>
    <div class="gantt-subheader">
      <div class="gantt-sticky-cell">Schedule
        <button
          type="button"
          class="estimate-disclosure-btn"
          data-gantt-toggle-all-categories="true"
          aria-pressed="${allGroupedCategoriesCollapsed ? 'true' : 'false'}"
          title="${allGroupedCategoriesCollapsed ? 'Expand all categories' : 'Collapse all categories'}"
          aria-label="${allGroupedCategoriesCollapsed ? 'Expand all categories' : 'Collapse all categories'}"
          style="margin-left:auto;"
          ${groupedCategoryHeaders.length ? '' : 'disabled'}
        >${getDisclosureIconSvg()}</button>
      </div>
      <div class="gantt-days" style="grid-template-columns: repeat(${totalDays}, ${dayWidth}px); width:${timelineWidth}px;">
        ${dayDates.map((date) => {
          const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
          const isToday = today && formatEstimateDateKey(date) === formatEstimateDateKey(today);
          return `<div class="gantt-day-cell${isWeekend ? ' is-weekend' : ''}${isToday ? ' is-today' : ''}" data-day-key="${formatEstimateDateKey(date)}"><span>${date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }).slice(0, 1)}</span><strong>${date.getUTCDate()}</strong></div>`;
        }).join('')}
      </div>
    </div>
    ${groupedItems.map((group) => {
      const categoryCollapsed = group.categoryHeader ? isCategoryCollapsed(group.categoryHeader) : false;
      const groupHtml = [
        `
        <div class="gantt-row gantt-category-row${categoryCollapsed ? ' is-collapsed' : ''}" data-category-key="${escapeGanttHtml(group.categoryKey)}" style="background: linear-gradient(180deg, rgba(248,250,252,0.98), rgba(241,245,249,0.94)); min-height:48px;">
          <div class="gantt-row-info" style="background: linear-gradient(180deg, rgba(248,250,252,0.98), rgba(241,245,249,0.96));">
            <button type="button" class="gantt-row-summary" data-category-key="${escapeGanttHtml(group.categoryKey)}" aria-expanded="${categoryCollapsed ? 'false' : 'true'}" title="${categoryCollapsed ? 'Expand category' : 'Collapse category'}">
              <span class="gantt-row-summary-left">
                <span class="gantt-row-toggle">›</span>
                <p class="gantt-row-title">${escapeGanttHtml(group.categoryName)}</p>
              </span>
              <span class="gantt-row-summary-right">
                <span class="gantt-category-count">${group.items.length} item${group.items.length === 1 ? '' : 's'}</span>
              </span>
            </button>
          </div>
          <div class="gantt-row-track" data-category-key="${escapeGanttHtml(group.categoryKey)}" style="width:${timelineWidth}px; --gantt-day-width:${dayWidth}px;"></div>
        </div>
        `,
        ...(categoryCollapsed ? [] : group.items.map((item) => {
          const hasSchedule = item.startDate && item.endDate && item.endDate >= item.startDate;
          const expanded = isGanttRowExpanded(item.itemId);
          const startOffset = hasSchedule ? getGanttDayDiff(rangeStart, item.startDate) : 0;
          const barSpanDays = hasSchedule ? Math.max(0, getGanttDayDiff(item.startDate, item.endDate)) : 0;
          const barWidth = hasSchedule ? Math.max(barSpanDays * dayWidth - 8, Math.max(dayWidth - 8, 20)) : 0;
          const statusLabel = formatEstimateStatusLabel(item.statusValue);
          const rangeLabel = hasSchedule ? formatGanttRangeLabel(item.startDate, item.endDate) : '';
          const categoryTheme = getGanttCategoryTheme(item.categoryName);
          const todayOffset = today ? getGanttDayDiff(rangeStart, today) : -1;
          const todayInRange = todayOffset >= 0 && todayOffset < totalDays;
          return `
        <div class="gantt-row gantt-item-row${expanded ? ' is-expanded' : ''}">
          <div class="gantt-row-info">
            <button type="button" class="gantt-row-summary" data-card-id="${escapeGanttHtml(item.itemId)}" aria-expanded="${expanded ? 'true' : 'false'}" title="${expanded ? 'Collapse details' : 'Expand details'}">
              <span class="gantt-row-summary-left">
                <span class="gantt-row-toggle">›</span>
                <p class="gantt-row-title">${escapeGanttHtml(item.name)}</p>
              </span>
              <span class="gantt-row-summary-right">
                <span class="gantt-chip status-badge ${escapeGanttHtml(item.statusClass)}">${escapeGanttHtml(statusLabel)}</span>
              </span>
            </button>
            <div class="gantt-row-details">
              <div class="gantt-row-meta">
                <span class="gantt-chip">${escapeGanttHtml(item.categoryName)}</span>
                <span class="gantt-chip phase">${escapeGanttHtml(item.phaseLabel)}</span>
                <span class="gantt-chip progress">${escapeGanttHtml(`${item.percentComplete}% complete`)}</span>
              </div>
              <div class="gantt-row-dates">
                <label>Start
                  <input type="date" class="gantt-date-input" data-card-id="${escapeGanttHtml(item.itemId)}" data-date-field="start" value="${escapeGanttHtml(item.startValue)}">
                </label>
                <label>Finish
                  <input type="date" class="gantt-date-input" data-card-id="${escapeGanttHtml(item.itemId)}" data-date-field="end" value="${escapeGanttHtml(item.endValue)}">
                </label>
              </div>
            </div>
          </div>
          <div class="gantt-row-track" data-card-id="${escapeGanttHtml(item.itemId)}" data-range-start="${escapeGanttHtml(formatEstimateDateKey(rangeStart))}" data-day-width="${dayWidth}" style="width:${timelineWidth}px; --gantt-day-width:${dayWidth}px;">
            ${todayInRange ? `<div class="gantt-track-today" style="left:${todayOffset * dayWidth}px;"></div>` : ''}
            <div class="gantt-track-preview"></div>
            ${hasSchedule
              ? `<div class="gantt-row-bar ${escapeGanttHtml(item.statusClass)}" data-card-id="${escapeGanttHtml(item.itemId)}" data-start-date="${escapeGanttHtml(item.startValue)}" data-end-date="${escapeGanttHtml(item.endValue)}" data-preview-range="${escapeGanttHtml(rangeLabel)}" title="Drag to change dates" style="left:${startOffset * dayWidth + 4}px; width:${barWidth}px; --gantt-cat-color:${categoryTheme.color}; --gantt-cat-color-dark:${categoryTheme.dark}; --gantt-cat-text:${categoryTheme.text};"><span class="gantt-row-handle start" role="presentation"></span><span class="gantt-row-bar-label">${escapeGanttHtml(item.name)}</span><span class="gantt-row-handle end" role="presentation"></span></div>`
              : '<div class="gantt-row-placeholder">Set start and finish dates to place this item on the timeline.</div>'}
          </div>
        </div>
      `;
        }))
      ];
      return groupHtml.join('');
    }).join('')}
  `;

  if (scheduledCountEl) scheduledCountEl.textContent = String(datedItems.length);
  if (rangeLabelEl) rangeLabelEl.textContent = formatGanttRangeLabel(rangeStart, rangeEnd);
  syncGanttZoomControls(container);
}

function showGanttView() {
  ensureGanttViewContainer();
  buildGanttViewFromCards();
  const cards = document.getElementById('line-items-cards');
  const tableContainer = document.getElementById('line-items-table-container');
  const header = document.getElementById('list-view-header');
  const footer = document.getElementById('list-view-footer');
  const ganttContainer = document.getElementById('gantt-view-container');
  if (cards) cards.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'none';
  if (header) header.style.display = 'none';
  if (footer) footer.style.display = 'none';
  if (ganttContainer) ganttContainer.style.display = '';
  try { toggleSummaryVisibility(false); } catch (_) {}
  syncEstimateViewButtons('gantt');
  try { updateSelectedLaborCost(); } catch (_) {}
  try { updateTopbarHeight(); } catch (_) {}
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
  const tableColCount = document.querySelectorAll('#line-items-table-container thead th').length || 12;
  const formatter = (n) => `$${(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
  // Helpers for numeric formatting/parsing (inputs show commas; calculations use raw numbers)
  const fmtNum = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseNum = (s) => {
    const v = parseFloat(String(s ?? '').replace(/[$,\s]/g, ''));
    return isNaN(v) ? 0 : v;
  };
  const createCategoryCollapseButton = (header, collapsed) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lv-category-collapse-btn estimate-disclosure-btn';
    setDisclosureButtonState(button, !collapsed, 'Collapse category', 'Expand category');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCategoryCollapsed(header, !isCategoryCollapsed(header));
      try { if (typeof applyCategoryCollapseState === 'function') applyCategoryCollapseState(); } catch (_) {}
      buildListViewFromCards();
      if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
    });
    return button;
  };
  const createCategoryAddButton = (header) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lv-add-btn';
    button.title = 'Add line item to this category';
    button.textContent = '+';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (window.addLineItemCard) {
          window.addLineItemCard({}, header);
        } else if (typeof addLineItemCard === 'function') {
          addLineItemCard({}, header);
        }
        scheduleListViewRebuild(300);
      } catch (err) {
        console.warn('Failed to add line item from category row', err);
      }
    });
    return button;
  };
  const createEditableCategoryLabel = (header, categoryName) => {
    const label = document.createElement('span');
    label.className = 'lv-category-group-label';
    label.textContent = categoryName;
    label.setAttribute('contenteditable', 'true');
    label.addEventListener('focus', () => {
      label.dataset.orig = label.textContent || '';
      try {
        const range = document.createRange();
        range.selectNodeContents(label);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    });
    label.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); label.blur(); }
      if (event.key === 'Escape') {
        event.preventDefault();
        label.textContent = label.dataset.orig || categoryName;
        label.blur();
      }
    });
    label.addEventListener('blur', () => {
      const newName = (label.textContent || '').trim();
      const oldName = label.dataset.orig || '';
      if (!newName) {
        label.textContent = oldName || categoryName;
        return;
      }
      if (newName === oldName) return;
      try {
        const titleSpan = header?.querySelector('.category-title span[contenteditable]');
        if (titleSpan) {
          titleSpan.textContent = newName;
          titleSpan.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof autoSaveEstimate === 'function') autoSaveEstimate();
        }
        try { if (typeof populateFilterOptions === 'function') populateFilterOptions(); } catch (_) {}
        scheduleListViewRebuild(200);
      } catch (error) {
        console.warn('Failed to update category name from list view header', error);
      }
    });
    return label;
  };
  const createCategoryHeaderRow = (header, categoryName, visibleCount, collapsed, totalAmount) => {
    const row = document.createElement('tr');
    row.className = 'lv-category-group-row';
    row.setAttribute('data-category-key', ensureCategoryCollapseKey(header, categoryName));
    const emptyCell = () => {
      const td = document.createElement('td');
      td.innerHTML = '&nbsp;';
      return td;
    };

    const leadCell = document.createElement('td');
    const leadStack = document.createElement('div');
    leadStack.className = 'lv-drag-select-stack';
    const categorySelect = document.createElement('input');
    categorySelect.type = 'checkbox';
    categorySelect.className = 'lv-category-select-toggle';
    categorySelect.setAttribute('aria-label', 'Select category line items');
    categorySelect.title = 'Select category line items';
    categorySelect.addEventListener('change', (event) => {
      window.__estimateEditToggleCategoryLineItemSelection?.(header, !!event.target?.checked);
    });
    const categoryHandle = document.createElement('button');
    categoryHandle.type = 'button';
    categoryHandle.className = 'lv-drag-handle';
    categoryHandle.textContent = '::';
    categoryHandle.title = 'Drag category';
    categoryHandle.draggable = true;
    categoryHandle.addEventListener('dragstart', (event) => {
      if (typeof window.__estimateEditBeginEstimateDrag === 'function') {
        window.__estimateEditBeginEstimateDrag({ type: 'category', categoryKey: ensureCategoryCollapseKey(header, categoryName) });
      }
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    categoryHandle.addEventListener('dragend', () => {
      if (typeof window.__estimateEditEndEstimateDrag === 'function') {
        window.__estimateEditEndEstimateDrag();
      }
    });
    const selectableCheckboxes = window.__estimateEditGetSelectableCategoryLineItemCheckboxes?.(header) || [];
    const selectedCount = selectableCheckboxes.filter((checkbox) => checkbox.checked).length;
    categorySelect.disabled = selectableCheckboxes.length === 0;
    categorySelect.checked = selectableCheckboxes.length > 0 && selectedCount === selectableCheckboxes.length;
    categorySelect.indeterminate = selectedCount > 0 && selectedCount < selectableCheckboxes.length;
    leadStack.appendChild(categoryHandle);
    leadStack.appendChild(categorySelect);
    leadCell.appendChild(leadStack);
    row.appendChild(leadCell);

    const mainCell = document.createElement('td');
    const main = document.createElement('div');
    main.className = 'lv-category-group-main';
    const collapseBtn = createCategoryCollapseButton(header, collapsed);
    const label = createEditableCategoryLabel(header, categoryName);
    main.prepend(collapseBtn);
    main.appendChild(label);
    mainCell.appendChild(main);
    row.appendChild(mainCell);

    const itemCell = document.createElement('td');
    itemCell.className = 'lv-category-group-item';
    const itemMeta = document.createElement('div');
    itemMeta.className = 'lv-category-group-meta';
    itemMeta.innerHTML = `<span class="lv-category-group-count">${visibleCount} line item${visibleCount === 1 ? '' : 's'}</span>`;
    itemCell.appendChild(itemMeta);
    row.appendChild(itemCell);

    row.appendChild(emptyCell());
    row.appendChild(emptyCell());
    row.appendChild(emptyCell());
    row.appendChild(emptyCell());
    row.appendChild(emptyCell());

    const totalCell = document.createElement('td');
    totalCell.className = 'lv-category-group-total';
    totalCell.textContent = formatter(totalAmount);
    row.appendChild(totalCell);

    row.appendChild(emptyCell());
    row.appendChild(emptyCell());

    const statusSpacer = emptyCell();
    row.appendChild(statusSpacer);

    row.appendChild(emptyCell());

    const actionCell = document.createElement('td');
    actionCell.style.textAlign = 'right';
    actionCell.appendChild(createCategoryAddButton(header));
    row.appendChild(actionCell);
    row.addEventListener('dragover', (event) => {
      const payload = typeof window.__estimateEditGetEstimateDragPayload === 'function'
        ? window.__estimateEditGetEstimateDragPayload()
        : null;
      if (!payload) return;
      event.preventDefault();
      if (typeof window.__estimateEditClearEstimateDragHighlights === 'function') {
        window.__estimateEditClearEstimateDragHighlights();
      }
      row.classList.add('lv-category-drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('lv-category-drop-target'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      row.classList.remove('lv-category-drop-target');
      if (typeof window.__estimateEditHandleDroppedItemOnCategory === 'function') {
        await window.__estimateEditHandleDroppedItemOnCategory(header);
      }
      if (typeof window.__estimateEditEndEstimateDrag === 'function') {
        window.__estimateEditEndEstimateDrag();
      }
    });
    return row;
  };

  const headers = document.querySelectorAll('.category-header');
  // Use a document fragment to minimize reflows during table construction
  const frag = document.createDocumentFragment();

  headers.forEach(header => {
    // Skip hidden categories
    if (header.style.display === 'none') return;
    const categoryName = header.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || '';
    const visibleCategoryCards = getCategoryCards(header).filter((card) => card.dataset.filterVisible !== 'false');
    const categoryCollapsed = isCategoryCollapsed(header);
    const categoryTotalAmount = getCategoryTotalAmount(header);
    frag.appendChild(createCategoryHeaderRow(header, categoryName, visibleCategoryCards.length, categoryCollapsed, categoryTotalAmount));
    if (categoryCollapsed) {
      return;
    }
    let nextEl = header.nextElementSibling;
    let rowsForThisCategory = 0;
    while (nextEl && !nextEl.classList.contains('category-header')) {
      if (nextEl.classList.contains('line-item-card') && nextEl.style.display !== 'none') {
        const card = nextEl;
        const splitGroupId = card.dataset.splitGroupId || '';
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
        const phaseValue = getLineItemPhaseFromCard(card);
        const percentComplete = getLineItemCompletionFromCard(card);
        const status = card.querySelector('.item-status-dropdown')?.value || '';
        const assigned = card.getAttribute('data-assigned-to') ? (card.querySelector('.vendor-name')?.getAttribute('data-fullname') || 'Assigned') : 'Unassigned';

        const tr = document.createElement('tr');
        tr.setAttribute('data-card-id', card.getAttribute('data-item-id'));

        const splitGroupInfo = splitGroupId && typeof window.__estimateEditGetSplitGroupDisplayInfo === 'function'
          ? window.__estimateEditGetSplitGroupDisplayInfo(splitGroupId)
          : null;
        const isFirstSplitGroupCard = !!(splitGroupInfo && splitGroupInfo.cards[0] === card);

        const listCollapsedState = window.__splitGroupCollapsedState || {};
        if (splitGroupId && listCollapsedState[splitGroupId] && !isFirstSplitGroupCard) {
          nextEl = nextEl.nextElementSibling;
          continue;
        }

        if (splitGroupId) {
          const theme = getSplitGroupTheme(splitGroupId) || { border: '#f59e0b', background: '#fffbeb', chipBackground: '#fef3c7', chipColor: '#92400e' };
          tr.style.background = `linear-gradient(90deg, ${theme.background} 0, #ffffff 56px)`;
          tr.style.boxShadow = `inset 4px 0 0 ${theme.border}`;
        }

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
    tdSelect.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; width:76px; min-width:76px;';
        const selectStack = document.createElement('div');
        selectStack.className = 'lv-drag-select-stack';
        const itemHandle = document.createElement('button');
        itemHandle.type = 'button';
        itemHandle.className = 'lv-drag-handle';
        itemHandle.textContent = '::';
        itemHandle.title = 'Drag line item';
        itemHandle.draggable = true;
        itemHandle.style.margin = '0';
        itemHandle.addEventListener('dragstart', (event) => {
          if (typeof window.__estimateEditBeginEstimateDrag === 'function') {
            window.__estimateEditBeginEstimateDrag({ type: 'item', itemId: card.getAttribute('data-item-id') });
          }
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        itemHandle.addEventListener('dragend', () => {
          if (typeof window.__estimateEditEndEstimateDrag === 'function') {
            window.__estimateEditEndEstimateDrag();
          }
        });
        const selectCb = document.createElement('input');
        selectCb.type = 'checkbox';
  // Remove default checkbox margins and center compactly
  selectCb.style.display = 'block';
  selectCb.style.margin = '0 auto';
    selectCb.style.width = '15px';
    selectCb.style.height = '15px';
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
        selectStack.appendChild(itemHandle);
        selectStack.appendChild(selectCb);
        tdSelect.appendChild(selectStack);
        tr.appendChild(tdSelect);

  // Category label toggles details
  const tdCat = document.createElement('td');
  tdCat.style.cssText = 'padding:4px 0px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:130px;';
  const catWrap = document.createElement('div');
  catWrap.className = 'lv-cat-wrap';
  const catLabel = document.createElement('span');
  catLabel.className = 'lv-cat-inline-label';
  catLabel.textContent = categoryName;
  catLabel.setAttribute('role', 'button');
  catLabel.setAttribute('tabindex', '0');
  catLabel.setAttribute('aria-expanded', 'false');
  catLabel.title = 'Show details';
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
        if (splitGroupInfo && isFirstSplitGroupCard) {
          const splitWrap = document.createElement('div');
          splitWrap.className = 'lv-inline-split-wrap';
          splitWrap.innerHTML = `
            <button type="button" class="lv-inline-split-toggle estimate-disclosure-btn estimate-disclosure-btn-amber" aria-expanded="${splitGroupInfo.isCollapsed ? 'false' : 'true'}" style="--toggle-color:${splitGroupInfo.theme.chipColor}; --toggle-border:${splitGroupInfo.theme.chipBackground};" title="${splitGroupInfo.isCollapsed ? 'Expand split payments' : 'Collapse split payments'}">${getDisclosureIconSvg()}</button>
            <span class="lv-inline-split-meta" title="${splitGroupInfo.summary} • Labor ${formatter(splitGroupInfo.combinedLaborTotal)}">${splitGroupInfo.summary} • Labor ${formatter(splitGroupInfo.combinedLaborTotal)}</span>
          `;
          splitWrap.querySelector('.lv-inline-split-toggle')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const collapsedState = window.__splitGroupCollapsedState || {};
            collapsedState[splitGroupId] = !collapsedState[splitGroupId];
            try { window.__splitGroupCollapsedState = collapsedState; } catch (_) {}
            try { rebuildSplitGroupHeaders(); } catch (_) {}
            buildListViewFromCards();
            if (typeof updateTableFooterTotals === 'function') updateTableFooterTotals(false);
          });
          tdName.appendChild(splitWrap);
        }
        tdName.appendChild(nameInput);
        tdName.appendChild(nameSuggest);
        tr.appendChild(tdName);
        tr.addEventListener('dragover', (event) => {
          const payload = typeof window.__estimateEditGetEstimateDragPayload === 'function'
            ? window.__estimateEditGetEstimateDragPayload()
            : null;
          if (!payload || payload.type !== 'item') return;
          event.preventDefault();
          const rect = tr.getBoundingClientRect();
          const placeAfter = event.clientY > rect.top + (rect.height / 2);
          if (typeof window.__estimateEditClearEstimateDragHighlights === 'function') {
            window.__estimateEditClearEstimateDragHighlights();
          }
          tr.classList.add(placeAfter ? 'lv-item-drop-bottom' : 'lv-item-drop-top');
        });
        tr.addEventListener('dragleave', () => tr.classList.remove('lv-item-drop-top', 'lv-item-drop-bottom'));
        tr.addEventListener('drop', async (event) => {
          const payload = typeof window.__estimateEditGetEstimateDragPayload === 'function'
            ? window.__estimateEditGetEstimateDragPayload()
            : null;
          if (!payload || payload.type !== 'item') return;
          event.preventDefault();
          const rect = tr.getBoundingClientRect();
          const placeAfter = event.clientY > rect.top + (rect.height / 2);
          tr.classList.remove('lv-item-drop-top', 'lv-item-drop-bottom');
          if (typeof window.__estimateEditHandleDroppedItemOnCard === 'function') {
            await window.__estimateEditHandleDroppedItemOnCard(card, placeAfter);
          }
          if (typeof window.__estimateEditEndEstimateDrag === 'function') {
            window.__estimateEditEndEstimateDrag();
          }
        });

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

        // Phase select
  const tdPhase = document.createElement('td');
  tdPhase.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:120px;';
  const phaseSelect = document.createElement('select');
        phaseSelect.style.width = '100%';
        phaseSelect.style.boxSizing = 'border-box';
  phaseSelect.style.padding = '4px 6px';
  phaseSelect.style.fontSize = '13px';
        PROJECT_PHASES.forEach((phaseOption) => {
          const option = document.createElement('option');
          option.value = phaseOption.value;
          option.textContent = phaseOption.shortLabel;
          if (phaseValue === phaseOption.value) option.selected = true;
          phaseSelect.appendChild(option);
        });
        phaseSelect.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-phase-dropdown');
          phaseSelect.dataset.orig = cardEl ? (cardEl.value || '') : '';
        });
        phaseSelect.addEventListener('change', () => {
          setAndDispatch(getCardInput('.item-phase-dropdown'), phaseSelect.value, 'change');
          syncAndRebuild();
        });
        phaseSelect.addEventListener('blur', () => {
          if ((phaseSelect.dataset.orig || '') !== (phaseSelect.value || '')) {
            setAndDispatch(getCardInput('.item-phase-dropdown'), phaseSelect.value, 'blur');
          }
        });
        tdPhase.appendChild(phaseSelect);
        tr.appendChild(tdPhase);

        // Percent complete input
  const tdProgress = document.createElement('td');
  tdProgress.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:76px;';
  const progressWrap = document.createElement('div');
        progressWrap.style.display = 'flex';
        progressWrap.style.alignItems = 'center';
        progressWrap.style.gap = '6px';
  const progressInput = document.createElement('input');
        progressInput.type = 'number';
        progressInput.min = '0';
        progressInput.max = '100';
        progressInput.step = '1';
        progressInput.value = String(percentComplete);
  progressInput.style.width = '100%';
  progressInput.style.textAlign = 'right';
  progressInput.style.fontSize = '13px';
  progressInput.style.padding = '4px 6px';
        const progressSuffix = document.createElement('span');
        progressSuffix.textContent = '%';
        progressSuffix.style.color = '#64748b';
        progressSuffix.style.fontWeight = '700';
        progressInput.addEventListener('focus', () => {
          const cardEl = getCardInput('.item-percent-complete');
          progressInput.dataset.orig = cardEl ? (cardEl.value || '') : '';
        });
        progressInput.addEventListener('input', () => {
          const normalized = String(clampProjectPhaseProgress(progressInput.value, statusSelect.value || status));
          if (normalized !== progressInput.value) progressInput.value = normalized;
          setAndDispatch(getCardInput('.item-percent-complete'), normalized, 'input');
        });
        progressInput.addEventListener('blur', () => {
          const normalized = String(clampProjectPhaseProgress(progressInput.value, statusSelect.value || status));
          progressInput.value = normalized;
          if ((progressInput.dataset.orig || '') !== normalized) {
            setAndDispatch(getCardInput('.item-percent-complete'), normalized, 'blur');
            try { if (typeof queueListAutoSave === 'function') queueListAutoSave(300); } catch (_) {}
          }
          syncAndRebuild();
        });
        progressWrap.appendChild(progressInput);
        progressWrap.appendChild(progressSuffix);
        tdProgress.appendChild(progressWrap);
        tr.appendChild(tdProgress);

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
            case 'new': return 'status-in-progress';
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
          if ((statusSelect.value || '').toLowerCase() === 'completed' && parseFloat(progressInput.value || '0') < 100) {
            progressInput.value = '100';
            setAndDispatch(getCardInput('.item-percent-complete'), progressInput.value, 'input');
          } else if ((statusSelect.value || '').toLowerCase() === 'in-progress' && parseFloat(progressInput.value || '0') !== 0) {
            progressInput.value = '0';
            setAndDispatch(getCardInput('.item-percent-complete'), progressInput.value, 'input');
          }
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
          const nameSpan = document.createElement('button');
          nameSpan.type = 'button';
          nameSpan.className = 'vendor-assignment-trigger';
          nameSpan.textContent = assigned;
          nameSpan.setAttribute('data-vendor-id', card.getAttribute('data-assigned-to') || '');
          nameSpan.setAttribute('data-fullname', assigned);
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

          // Actions (Split/Delete)
  const tdActions = document.createElement('td');
        tdActions.style.cssText = 'padding:4px 6px; font-size:15px; border-bottom:1px solid #f1f5f9; min-width:132px;';
          const actionsWrap = document.createElement('div');
          actionsWrap.style.display = 'flex';
          actionsWrap.style.alignItems = 'center';
          actionsWrap.style.gap = '6px';
          const splitBtn = document.createElement('button');
          splitBtn.textContent = 'Split';
          splitBtn.className = 'lv-split-btn';
          splitBtn.disabled = isCardAssigned(card);
          splitBtn.title = splitBtn.disabled ? 'Unassign line item before splitting' : 'Split this line item';
          splitBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await runSplitFlowForCard(card);
          });
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.className = 'lv-delete-btn';
        delBtn.addEventListener('click', () => {
          const btn = getCardInput('.delete-line-item');
          if (btn) btn.click();
          // Rebuild after deletion
          setTimeout(() => { buildListViewFromCards(); updateTableFooterTotals(false); }, 80);
        });
          actionsWrap.appendChild(splitBtn);
          actionsWrap.appendChild(delBtn);
          tdActions.appendChild(actionsWrap);
  tr.appendChild(tdActions);

  frag.appendChild(tr);
  rowsForThisCategory++;

        // Row-level collapse toggle: show description and photos horizontally beneath
        const itemId = card.getAttribute('data-item-id');
        const thCount = tableColCount;
        function removeExistingDetailRow() {
          const next = tr.nextElementSibling;
          if (next && next.classList && next.classList.contains('lv-detail-row') && next.getAttribute('data-for-id') === itemId) {
            next.remove();
            return true;
          }
          return false;
        }
        function renderPhotoSlider(imgUrls, type) {
          if (!Array.isArray(imgUrls) || imgUrls.length === 0) {
            return '<div class="lv-photo-empty">No photos yet</div>';
          }
          const cards = imgUrls.map((src, index) => `
            <div class="lv-photo-card" data-photo-index="${index}">
              <button type="button" class="lv-photo-delete-btn" data-photo-delete="${index}" aria-label="Delete ${type} photo ${index + 1}" title="Delete photo">
                <svg aria-hidden="true" viewBox="0 0 20 20" width="12" height="12" fill="currentColor"><path d="M7.5 3.5A1.5 1.5 0 0 1 9 2h2a1.5 1.5 0 0 1 1.5 1.5V4H16a.75.75 0 0 1 0 1.5h-.72l-.64 9.03A2 2 0 0 1 12.65 16H7.35a2 2 0 0 1-1.99-1.47L4.72 5.5H4A.75.75 0 0 1 4 4h3.5v-.5ZM11 4v-.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5V4H11Zm-2 3.25a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0V8A.75.75 0 0 1 9 7.25Zm2.75.75a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0V8Z"></path></svg>
              </button>
              <img src="${src}" alt="${type} photo ${index + 1}">
              <span class="lv-photo-card-index">${index + 1} / ${imgUrls.length}</span>
            </div>
          `).join('');
          const dots = imgUrls.map((_, index) => `<span class="lv-photo-dot${index === 0 ? ' is-active' : ''}" data-dot-index="${index}"></span>`).join('');
          return `
            <div class="lv-photo-slider" data-photo-slider="${type}">
              <button type="button" class="lv-photo-nav prev" aria-label="Previous ${type} photo">&#10094;</button>
              <div class="lv-photo-viewport">
                <div class="lv-photo-track">${cards}</div>
              </div>
              <button type="button" class="lv-photo-nav next" aria-label="Next ${type} photo">&#10095;</button>
              <div class="lv-photo-dots">${dots}</div>
            </div>
          `;
        }
        function getCardPhotos(type) {
          try {
            const sel = `#${type}-photos-${itemId} img`;
            const imgs = Array.from(card.querySelectorAll(sel));
            return imgs.map(img => img.getAttribute('src')).filter(Boolean);
          } catch (_) { return []; }
        }
        async function loadDetailPhotosIntoCard() {
          try {
            await Promise.all([
              updatePhotoSection(itemId, 'before'),
              updatePhotoSection(itemId, 'after')
            ]);
          } catch (_) {}
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
          // Start/End date and Cost Code current values from card
          const startDateVal = getCardInput('.item-start-date')?.value || '';
          const endDateVal = getCardInput('.item-end-date')?.value || '';
          const costCodeVal = getCardInput('.item-cost-code')?.value || '';
          td.innerHTML = `
            <div class="lv-detail-content">
              <div class="lv-detail-desc">
                <h5>Description</h5>
                <textarea class="lv-detail-desc-textarea" placeholder="No description provided."></textarea>
              </div>
              <div class="lv-detail-dates" style="flex:0 0 190px; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:10px;">
                <div style="display:flow; flex-direction:column; gap:6px;">
                  <label style="font-size:12px; color:#374151;">Start Date</label>
                  <input type="date" class="lv-detail-start-date" value="${startDateVal}" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;">
                  <label style="font-size:12px; color:#374151;">End Date</label>
                  <input type="date" class="lv-detail-end-date" value="${endDateVal}" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;">
                  <label style="font-size:12px; color:#374151; margin-top:4px;">Cost Code</label>
                  <input type="text" class="lv-detail-cost-code" value="${costCodeVal}" style="padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;">
                </div>
              </div>
              <div class="lv-detail-photos">
                <div class="lv-photo-panel">
                  <div class="lv-photo-panel-header">
                    <h5>Before Photos</h5>
                    <div class="lv-photo-panel-tools">
                      <span class="lv-photo-count">${beforeList.length}</span>
                      <button type="button" class="lv-photo-add-btn" data-photo-upload-trigger="before" aria-label="Add before photos" title="Add before photos">
                        <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1z"></path></svg>
                      </button>
                      <input type="file" class="lv-photo-upload-input" data-photo-upload-input="before" accept="image/*" multiple>
                    </div>
                  </div>
                  <div class="lv-before" data-type="before">${renderPhotoSlider(beforeList, 'before')}</div>
                </div>
                <div class="lv-photo-panel">
                  <div class="lv-photo-panel-header">
                    <h5>After Photos</h5>
                    <div class="lv-photo-panel-tools">
                      <span class="lv-photo-count">${afterList.length}</span>
                      <button type="button" class="lv-photo-add-btn" data-photo-upload-trigger="after" aria-label="Add after photos" title="Add after photos">
                        <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1z"></path></svg>
                      </button>
                      <input type="file" class="lv-photo-upload-input" data-photo-upload-input="after" accept="image/*" multiple>
                    </div>
                  </div>
                  <div class="lv-after" data-type="after">${renderPhotoSlider(afterList, 'after')}</div>
                </div>
              </div>
            </div>
          `;
          const wirePhotoSlider = (root, imageList) => {
            if (!root || !Array.isArray(imageList) || imageList.length === 0) return;
            const track = root.querySelector('.lv-photo-track');
            const cards = Array.from(root.querySelectorAll('.lv-photo-card'));
            const dots = Array.from(root.querySelectorAll('.lv-photo-dot'));
            const updateActiveDot = () => {
              if (!track || !cards.length || !dots.length) return;
              const trackLeft = track.scrollLeft;
              let activeIndex = 0;
              let bestDistance = Number.POSITIVE_INFINITY;
              cards.forEach((photoCard, index) => {
                const distance = Math.abs(photoCard.offsetLeft - trackLeft);
                if (distance < bestDistance) {
                  bestDistance = distance;
                  activeIndex = index;
                }
              });
              dots.forEach((dot, index) => dot.classList.toggle('is-active', index === activeIndex));
            };
            const scrollToIndex = (index) => {
              const target = cards[index];
              if (!target || !track) return;
              track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
            };
            root.querySelector('.lv-photo-nav.prev')?.addEventListener('click', (event) => {
              event.preventDefault();
              const currentIndex = dots.findIndex((dot) => dot.classList.contains('is-active'));
              scrollToIndex(Math.max(0, currentIndex - 1));
            });
            root.querySelector('.lv-photo-nav.next')?.addEventListener('click', (event) => {
              event.preventDefault();
              const currentIndex = dots.findIndex((dot) => dot.classList.contains('is-active'));
              scrollToIndex(Math.min(cards.length - 1, currentIndex + 1));
            });
            dots.forEach((dot, index) => {
              dot.addEventListener('click', () => scrollToIndex(index));
            });
            cards.forEach((photoCard, index) => {
              photoCard.addEventListener('click', () => {
                try { openPhotoViewer(imageList[index], imageList); } catch (_) {}
              });
            });
            root.querySelectorAll('.lv-photo-delete-btn').forEach((button) => {
              button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const photoIndex = Number(button.getAttribute('data-photo-delete'));
                const targetUrl = imageList[photoIndex];
                if (!targetUrl) return;
                deletePhoto(itemId, targetUrl, root.getAttribute('data-photo-slider') || 'before');
              });
            });
            track.addEventListener('scroll', updateActiveDot, { passive: true });
            updateActiveDot();
          };
          wirePhotoSlider(td.querySelector('.lv-before [data-photo-slider="before"]'), beforeList);
          wirePhotoSlider(td.querySelector('.lv-after [data-photo-slider="after"]'), afterList);
          ['before', 'after'].forEach((photoType) => {
            const trigger = td.querySelector(`[data-photo-upload-trigger="${photoType}"]`);
            const input = td.querySelector(`[data-photo-upload-input="${photoType}"]`);
            if (!trigger || !input) return;
            trigger.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              input.value = '';
              input.click();
            });
            input.addEventListener('change', (event) => {
              event.stopPropagation();
              uploadPhoto(event, itemId, photoType);
            });
          });
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
          // Wire start/end dates and cost code to underlying card inputs
          const lvStart = td.querySelector('.lv-detail-start-date');
          const lvEnd = td.querySelector('.lv-detail-end-date');
          const lvCost = td.querySelector('.lv-detail-cost-code');
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
          if (lvCost) {
            lvCost.addEventListener('focus', () => {
              const cardCost = getCardInput('.item-cost-code');
              lvCost.dataset.orig = cardCost ? (cardCost.value || '') : '';
            });
            lvCost.addEventListener('input', () => {
              const cardCost = getCardInput('.item-cost-code');
              if (cardCost) {
                cardCost.value = lvCost.value;
                cardCost.dispatchEvent(new Event('input', { bubbles:true }));
              }
            });
            lvCost.addEventListener('blur', () => {
              if ((lvCost.dataset.orig || '') === (lvCost.value || '')) return;
              const cardCost = getCardInput('.item-cost-code');
              if (cardCost) {
                if (cardCost.value !== lvCost.value) {
                  cardCost.value = lvCost.value;
                  cardCost.dispatchEvent(new Event('blur', { bubbles:true }));
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
        async function refreshExpandedDetailRowPhotos() {
          await loadDetailPhotosIntoCard();
          const current = tr.nextElementSibling;
          if (!current || !current.classList || !current.classList.contains('lv-detail-row') || current.getAttribute('data-for-id') !== itemId) {
            return;
          }
          const replacement = createDetailRow();
          current.replaceWith(replacement);
        }
        async function toggleDetailRow(event) {
          event?.stopPropagation?.();
          const expanded = catLabel.getAttribute('aria-expanded') === 'true';
          if (expanded) {
            removeExistingDetailRow();
            catLabel.setAttribute('aria-expanded', 'false');
            catLabel.title = 'Show details';
            try { card.removeAttribute('data-lv-expanded'); } catch (_) {}
          } else {
            const detailRow = createDetailRow();
            tr.parentNode.insertBefore(detailRow, tr.nextSibling);
            catLabel.setAttribute('aria-expanded', 'true');
            catLabel.title = 'Hide details';
            try { card.setAttribute('data-lv-expanded', 'true'); } catch (_) {}
            await refreshExpandedDetailRowPhotos();
          }
        }

        catLabel.addEventListener('click', toggleDetailRow);
        catLabel.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleDetailRow(event);
          }
        });

        // If this item was previously expanded, auto-expand its detail row
        try {
          if (card.getAttribute('data-lv-expanded') === 'true') {
            const detailRow = createDetailRow();
            frag.appendChild(detailRow);
            catLabel.setAttribute('aria-expanded', 'true');
            catLabel.title = 'Hide details';
            setTimeout(() => {
              refreshExpandedDetailRowPhotos();
            }, 0);
          }
        } catch (_) {}
      }
      nextEl = nextEl.nextElementSibling;
    }

    // If no visible items for this category, render a placeholder row so the category appears
    if (rowsForThisCategory === 0 && !categoryCollapsed) {
      const ptr = document.createElement('tr');
      ptr.className = 'lv-empty-category';

      // Build columns to match header
      const td0 = document.createElement('td'); // Select
      const tdCat = document.createElement('td'); // Category
      const tdItem = document.createElement('td'); // Item
      const tdMode = document.createElement('td');
      const tdQty = document.createElement('td');
      const tdUnit = document.createElement('td');
      const tdLabor = document.createElement('td');
      const tdMaterial = document.createElement('td');
      const tdAmount = document.createElement('td');
      const tdPhase = document.createElement('td');
      const tdProgress = document.createElement('td');
      const tdStatus = document.createElement('td');
      const tdAssigned = document.createElement('td');
      const tdActions = document.createElement('td');

      const base = 'padding:4px 6px; border-bottom:1px solid #f1f5f9; font-size:14px;';
      td0.style.cssText = 'padding:2px 0; border-bottom:1px solid #f1f5f9; width:76px; min-width:76px;';
      tdCat.style.cssText = base + ' min-width:130px; font-weight:600; color:#0f172a;';
      tdItem.style.cssText = base + ' min-width:200px; color:#6b7280; font-style:italic;';
      tdMode.style.cssText = base + ' min-width:70px;';
      tdQty.style.cssText = base + ' min-width:72px; text-align:right;';
      tdUnit.style.cssText = base + ' min-width:88px; text-align:right;';
      tdLabor.style.cssText = base + ' min-width:100px; text-align:right;';
      tdMaterial.style.cssText = base + ' min-width:92px; text-align:right;';
      tdAmount.style.cssText = base + ' min-width:90px; text-align:center;';
      tdPhase.style.cssText = base + ' min-width:120px; text-align:center; color:#9ca3af;';
      tdProgress.style.cssText = base + ' min-width:76px; text-align:center; color:#9ca3af;';
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
      
      [td0, tdCat, tdItem, tdMode, tdQty, tdUnit, tdLabor, tdMaterial, tdAmount, tdPhase, tdProgress, tdStatus, tdAssigned, tdActions]
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
  const phaseFilter = document.getElementById('filter-phase');
  const categoryFilter = document.getElementById('filter-category');
  const statusFilter = document.getElementById('filter-status');
  const vendorFilter = document.getElementById('filter-vendor');
  const clearFiltersButton = document.getElementById('clear-filters');

  if (!itemNameFilter || !phaseFilter || !categoryFilter || !statusFilter || !vendorFilter || !clearFiltersButton) {
    console.error("Filter elements not found");
    return;
  }

  // Populate filter dropdowns
  populateFilterOptions();

  // Add event listeners to filter controls
  [itemNameFilter, phaseFilter, categoryFilter, statusFilter, vendorFilter].forEach(filter => {
    filter.addEventListener('input', applyFilters);
    filter.addEventListener('change', applyFilters);
  });

  // Clear filters button
  clearFiltersButton.addEventListener('click', clearFilters);
}

// ✅ Populate filter options dynamically
function populateFilterOptions() {
  const phaseSelect = document.getElementById('filter-phase');
  if (phaseSelect) {
    const previousPhase = phaseSelect.value;
    phaseSelect.innerHTML = '<option value="">All Phases</option>';
    PROJECT_PHASES.forEach((phase) => {
      const option = document.createElement('option');
      option.value = phase.value;
      option.textContent = phase.label;
      phaseSelect.appendChild(option);
    });
    if (previousPhase && Array.from(phaseSelect.options).some((option) => option.value === previousPhase)) {
      phaseSelect.value = previousPhase;
    }
  }

  // Get category filter dropdown
  const categorySelect = document.getElementById('filter-category');
  if (!categorySelect) return;
  
  // Clear existing options except the first one (All Categories)
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }
  
  // Get unique categories from DOM
  const categories = new Set();
  document.querySelectorAll('.category-header .category-title span[contenteditable]').forEach(el => {
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
  const previousVendor = vendorSelect.value;
  
  // Clear existing options except the first two (All Vendors, Unassigned)
  while (vendorSelect.options.length > 2) {
    vendorSelect.remove(2);
  }
  
  const participatingVendors = new Map();
  document.querySelectorAll('.line-item-card').forEach((card) => {
    const vendorId = String(card.getAttribute('data-assigned-to') || '').trim();
    if (!vendorId) return;

    const vendorFromMap = window.vendorMap && window.vendorMap[vendorId];
    const vendorName = vendorFromMap?.name
      || card.querySelector('.vendor-name')?.getAttribute('data-fullname')?.trim()
      || vendorId;

    if (!participatingVendors.has(vendorId)) {
      participatingVendors.set(vendorId, vendorName);
    }
  });

  Array.from(participatingVendors.entries())
    .sort((left, right) => String(left[1]).localeCompare(String(right[1]), undefined, { sensitivity: 'base' }))
    .forEach(([vendorId, vendorName]) => {
      const option = document.createElement('option');
      option.value = vendorId;
      option.textContent = vendorName;
      vendorSelect.appendChild(option);
    });

  if (previousVendor && Array.from(vendorSelect.options).some((option) => option.value === previousVendor)) {
    vendorSelect.value = previousVendor;
  } else if (previousVendor && previousVendor !== 'unassigned') {
    vendorSelect.value = '';
  }

  try { refreshBatchCategoryOptions(); } catch (_) {}
  renderProjectPhaseBar();
  if (typeof isGanttViewActive === 'function' && isGanttViewActive()) {
    try { buildGanttViewFromCards(); } catch (_) {}
  }
}

// ✅ Apply filters to line items - Card View Only
function applyFilters() {
  const phaseValue = document.getElementById('filter-phase')?.value || '';
  const categoryValue = document.getElementById('filter-category')?.value || '';
  const statusValue = document.getElementById('filter-status')?.value || '';
  const vendorValue = document.getElementById('filter-vendor')?.value || '';
  
  // Apply filters to cards
  applyCardViewFilters(categoryValue, statusValue, vendorValue, phaseValue);
  
  // Update counts
  updateFilterCounts();
  renderProjectPhaseBar();
  if (typeof isGanttViewActive === 'function' && isGanttViewActive()) {
    try { buildGanttViewFromCards(); } catch (_) {}
  }
}

// ✅ Apply filters to card view
function applyCardViewFilters(categoryValue, statusValue, vendorValue, phaseValue) {
  const itemNameValue = document.getElementById('filter-item-name')?.value.trim().toLowerCase() || '';
  let visibleCount = 0;
  let hiddenCount = 0;

  const cards = Array.from(document.querySelectorAll('.line-item-card'));
  cards.forEach(card => {
    // Get the category for this card
    let categoryHeader = card.previousElementSibling;
    while (categoryHeader && !categoryHeader.classList.contains('category-header')) {
      categoryHeader = categoryHeader.previousElementSibling;
    }

    // Get category name
    const cardCategory = categoryHeader ?
      categoryHeader.querySelector('.category-title span[contenteditable]')?.textContent?.trim() || '' : '';

// Get item status from the dropdown value
const statusDropdown = card.querySelector('.item-status-dropdown');
const cardStatus = statusDropdown ? statusDropdown.value.toLowerCase() : 'new';
  const cardPhase = getLineItemPhaseFromCard(card);

    // Get assigned vendor
    const assignedTo = card.getAttribute('data-assigned-to') || '';
    const isAssigned = assignedTo && assignedTo !== '';

    // Get item name
    const itemName = card.querySelector('.item-name')?.value.trim().toLowerCase() || '';

    // Check if card matches all active filters
    const matchesItemName = !itemNameValue || itemName.includes(itemNameValue);
    const matchesPhase = !phaseValue || cardPhase === phaseValue;
    const matchesCategory = !categoryValue || cardCategory === categoryValue;
    const matchesStatus = !statusValue || cardStatus.includes(statusValue.toLowerCase());
    const matchesVendor = !vendorValue ||
      (vendorValue === 'unassigned' && !isAssigned) ||
      (isAssigned && assignedTo === vendorValue);

    // Show or hide based on filter matches
    if (matchesItemName && matchesPhase && matchesCategory && matchesStatus && matchesVendor) {
      card.dataset.filterVisible = 'true';
      card.style.display = '';
      visibleCount++;
    } else {
      card.dataset.filterVisible = 'false';
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
      if (nextEl.classList.contains('line-item-card') && nextEl.dataset.filterVisible !== 'false') {
        hasVisibleCards = true;
        break;
      }
      nextEl = nextEl.nextElementSibling;
    }

    header.style.display = hasVisibleCards ? '' : 'none';
  });

  applyCategoryCollapseState();

  
  // If list view is active, rebuild the table to reflect current visible cards
  if (isListViewActive && isListViewActive()) {
    buildListViewFromCards();
  }
  if (typeof updateTableFooterTotals === 'function') {
    updateTableFooterTotals(shouldUseFilteredTotalsForMobileFooter());
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
    if (el.classList.contains('line-item-card')) el.dataset.filterVisible = 'true';
    el.style.display = '';
  });
  applyCategoryCollapseState();

  if (typeof isListViewActive === 'function' && isListViewActive()) {
    if (typeof buildListViewFromCards === 'function') buildListViewFromCards();
  }

  if (typeof updateTableFooterTotals === 'function') {
    updateTableFooterTotals(shouldUseFilteredTotalsForMobileFooter());
  }
  
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
      id: 'filter-phase', 
      name: 'Phase', 
      value: document.getElementById('filter-phase')?.value || '',
      label: document.getElementById('filter-phase')?.selectedOptions[0]?.textContent || ''
    },
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
  if (!headerContainer) {
    renderProjectPhaseBar();
    return;
  }
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
      const filterElement = document.getElementById(filter.id);
      if (!filterElement) return;
      if (filterElement.type === 'checkbox') {
        filterElement.checked = false;
      } else {
        filterElement.value = '';
      }
      applyFilters();
    });
  });
}

// ✅ Update clearFilters to also update badge display
function clearFilters() {
  // Reset all filter dropdowns
  const filterElements = [
    document.getElementById('filter-phase'),
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
    if (el.classList.contains('line-item-card')) el.dataset.filterVisible = 'true';
    el.style.display = '';
  });
  applyCategoryCollapseState();
  
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
  renderProjectPhaseBar();
  
  
}


// Add this function or modify your existing updateTableFooterTotals

// Update table footer totals, optionally only counting visible rows
function updateTableFooterTotals(filteredOnly = false) {
  const cardNodes = Array.from(document.querySelectorAll('.line-item-card'));
  let totalLabor = 0;
  let totalMaterial = 0;
  let totalAmount = 0;
  let totalProfit = 0;

  if (cardNodes.length) {
    const cardsToSum = filteredOnly
      ? cardNodes.filter((card) => card.dataset.filterVisible !== 'false')
      : cardNodes;

    cardsToSum.forEach((card) => {
      const laborValue = parseFloat(card.querySelector('.item-labor-cost')?.value || '0') || 0;
      const materialValue = parseFloat(card.querySelector('.item-material-cost')?.value || '0') || 0;
      const amountValue = typeof getCardLineItemAmount === 'function'
        ? getCardLineItemAmount(card)
        : roundCurrency((parseFloat(card.querySelector('.item-quantity')?.value || '0') || 0) * (parseFloat(card.querySelector('.item-price')?.value || '0') || 0));

      totalLabor += laborValue;
      totalMaterial += materialValue;
      totalAmount += amountValue;
    });
  }

  // Currency formatter with thousands separators
  const fmt = (n) => {
    const num = Number(n) || 0;
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const mobileFooterLabel = document.getElementById('mobile-footer-label');
  const mobileFooterLabor = document.getElementById('mobile-footer-labor');
  const mobileFooterMaterial = document.getElementById('mobile-footer-material');
  const mobileFooterAmount = document.getElementById('mobile-footer-amount');
  if (mobileFooterLabel) mobileFooterLabel.textContent = filteredOnly ? 'FILTERED TOTALS:' : 'TOTALS:';
  if (mobileFooterLabor) mobileFooterLabor.textContent = fmt(totalLabor);
  if (mobileFooterMaterial) mobileFooterMaterial.textContent = fmt(totalMaterial);
  if (mobileFooterAmount) mobileFooterAmount.textContent = fmt(totalAmount);

  // Prefer the list-view table if visible; otherwise fallback to the first .estimate-table
  const tableContainer = document.getElementById('line-items-table-container');
  const table = (tableContainer && tableContainer.style.display !== 'none')
    ? tableContainer.querySelector('.estimate-table')
    : document.querySelector('.estimate-table');
  if (!table) return;

  const rows = cardNodes.length ? [] : table.querySelectorAll('tbody tr');

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
    if (!row.hasAttribute('data-card-id')) return;
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
        // Current list-view (separate HTML header) without Cost Code column:
        // [0]=Select, [1]=Category, [2]=Item, [3]=Mode, [4]=Qty, [5]=Unit Price,
        // [6]=Labor, [7]=Material, [8]=Amount, [9]=Status, [10]=Assigned, [11]=Actions
        lIdx = 6; mIdx = 7; aIdx = 8; pIdx = -1;
      } else if (cLen >= 12) {
        // 12-col body-internal header variant; fall back to common order if used
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
  const floatingFooter = tableContainer && tableContainer.style.display !== 'none'
    ? document.querySelector('#list-view-footer tfoot tr')
    : null;
  if (!footer && !floatingFooter) return;

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

  if (floatingFooter) {
    if (floatingFooter.children[6]) floatingFooter.children[6].textContent = fmt(totalLabor);
    if (floatingFooter.children[7]) floatingFooter.children[7].textContent = fmt(totalMaterial);
    if (floatingFooter.children[8]) floatingFooter.children[8].textContent = fmt(totalAmount);
    if (filteredOnly) {
      floatingFooter.setAttribute('data-filtered', 'true');
      if (floatingFooter.children[5]) floatingFooter.children[5].textContent = 'FILTERED TOTALS:';
    } else {
      floatingFooter.removeAttribute('data-filtered');
      if (floatingFooter.children[5]) floatingFooter.children[5].textContent = 'TOTALS:';
    }
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
      if (input.closest('.line-item-card')) {
        try { clearSelectedLineItems(); } catch (_) {}
      }
      try { autoSaveEstimate(); } catch (e) { console.warn('Autosave (blur) failed', e); }
    }
  });
}




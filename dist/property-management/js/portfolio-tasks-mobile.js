// Property management: portfolio tasks mobile.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function portfolioTaskPropertyOptions(selected = '') {
    const properties = [...new Map((state.properties || []).map(p => [String(p._id), p])).values()];
    let options = '<option value="">No property · Global task</option>';
    if (selected && !properties.some(p => String(p._id) === selected)) options += `<option value="${escapeHtml(selected)}" selected>Linked property (not in this list)</option>`;
    return options + properties.map(p => `<option value="${escapeHtml(String(p._id))}" ${String(p._id) === selected ? 'selected' : ''}>${escapeHtml(p.name || 'Unnamed property')}</option>`).join('');
}

function portfolioTaskDraft(task = {}) {
    return { title: task.title || '', description: task.description || '', projectId: String(task.projectId?._id || task.projectId || ''), dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '' };
}

function portfolioTaskFields(draft, prefix) {
    return `<label>Details<textarea name="description" rows="2" placeholder="Add details">${escapeHtml(draft.description)}</textarea></label><label>Due date<input type="date" name="dueDate" value="${escapeHtml(draft.dueDate)}"></label><label>Property<select name="projectId" id="${prefix}Property">${portfolioTaskPropertyOptions(draft.projectId)}</select></label>`;
}

function togglePortfolioTaskComposer(open, reset = false) {
    const form = document.getElementById('portfolioTaskForm'), trigger = document.getElementById('portfolioTaskAddButton');
    if (!form || !trigger || state.portfolioTaskCreating) return;
    if (reset) form.reset();
    form.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
        const select = form.elements.projectId;
        select.innerHTML = portfolioTaskPropertyOptions(select.value);
        document.getElementById('portfolioTaskTitleInput').focus();
    } else trigger.focus({ preventScroll: true });
}

function initPortfolioTaskFlow() {
    const panel = document.getElementById('portfolioTasksSidebar'); if (!panel || panel.dataset.taskFlowBound) return;
    panel.dataset.taskFlowBound = 'true';
    const form = document.getElementById('portfolioTaskForm');
    document.getElementById('portfolioTaskExtra').innerHTML = portfolioTaskFields(portfolioTaskDraft(), 'newTask');
    form.addEventListener('submit', event => { event.preventDefault(); addPortfolioTaskFromInput(form.querySelector('[type=submit]')); });
    panel.addEventListener('input', event => {
        const editor = event.target.closest('.task-inline-editor');
        if (editor && state.portfolioTaskDraft && event.target.name) state.portfolioTaskDraft[event.target.name] = event.target.value;
    });
    panel.addEventListener('change', event => {
        const editor = event.target.closest('.task-inline-editor');
        if (editor && state.portfolioTaskDraft && event.target.name) state.portfolioTaskDraft[event.target.name] = event.target.value;
    });
    panel.addEventListener('submit', event => {
        const editor = event.target.closest('.task-inline-editor'); if (!editor) return;
        event.preventDefault();
        const draft = state.portfolioTaskDraft;
        if (!draft?.title.trim()) { editor.querySelector('[name=title]').focus(); return; }
        mutatePortfolioTask(editor.dataset.id, { title: draft.title.trim(), description: draft.description, projectId: draft.projectId || null, dueDate: draft.dueDate || null }, false, true);
    });
    panel.addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.id === 'portfolioTaskAddButton') { togglePortfolioTaskComposer(form.hidden); return; }
        if (button.id === 'portfolioTaskCancelButton') { togglePortfolioTaskComposer(false, true); return; }
        if (state.portfolioTaskBusy) return;
        const id = button.dataset.taskId, task = (state.portfolioTasks || []).find(t => String(t._id) === id);
        if (button.dataset.taskAction === 'cancel') { state.portfolioTaskEditing = ''; state.portfolioTaskDraft = null; renderPortfolioTasksList(); return; }
        if (!task) return;
        switch (button.dataset.taskAction) {
            case 'edit':
                if (state.portfolioTaskEditing && state.portfolioTaskEditing !== id) { showNotification('Save or cancel the current task first', 'info'); return; }
                state.portfolioTaskEditing = id; state.portfolioTaskDraft = portfolioTaskDraft(task); renderPortfolioTasksList(); document.querySelector('.task-inline-editor [name=title]')?.focus(); break;
            case 'complete': mutatePortfolioTask(id, { completed: task.status !== 'completed' }); break;
            case 'star': mutatePortfolioTask(id, { pinned: !task.pinned }); break;
            case 'delete': if (window.confirm('Delete this task?')) mutatePortfolioTask(id, null, true); break;
            case 'property': { const propertyId = String(task.projectId?._id || task.projectId || ''); if (propertyId) selectProperty(propertyId); break; }
        }
    });
}

async function addPortfolioTaskFromInput(button) {
    if (state.portfolioTaskCreating) return;
    const form = document.getElementById('portfolioTaskForm'), input = document.getElementById('portfolioTaskTitleInput');
    const title = input.value.trim(); if (!title) { input.focus(); return; }
    state.portfolioTaskCreating = true; button.disabled = true;
    const payload = { title, description: form.elements.description.value, dueDate: form.elements.dueDate.value || null, projectId: form.elements.projectId.value || null, status: 'new' };
    try {
        const res = await fetch(`${API_URL}/portfolio-tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Could not add task');
        const data = await res.json(); if (!data.task) throw new Error('Missing saved task');
        state.portfolioTasks = [data.task, ...(state.portfolioTasks || [])]; state.portfolioTaskView = 'active'; state.propertyOverviewData = null;
        form.reset(); form.hidden = true; document.getElementById('portfolioTaskAddButton').setAttribute('aria-expanded', 'false'); renderPortfolioTasksList(); document.getElementById('portfolioTaskAddButton').focus();
        showNotification('Task added', 'success');
    } catch (error) { showNotification('Could not save task. Your draft is still here.', 'error'); }
    finally { state.portfolioTaskCreating = false; button.disabled = false; }
}

async function mutatePortfolioTask(id, updates, remove = false, closeEditor = false) {
    if (state.portfolioTaskBusy) return;
    state.portfolioTaskBusy = id;
    const list = document.getElementById('portfolioTasksList'); list.setAttribute('aria-busy', 'true');
    list.querySelectorAll('button,input,select,textarea').forEach(el => el.disabled = true);
    try {
        const res = await fetch(`${API_URL}/portfolio-tasks/${encodeURIComponent(id)}`, { method: remove ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json' }, ...(remove ? {} : { body: JSON.stringify(updates) }) });
        if (!res.ok) throw new Error('Could not update task');
        const data = await res.json(); if (!remove && !data.task) throw new Error('Missing saved task');
        state.portfolioTasks = remove ? state.portfolioTasks.filter(t => String(t._id) !== id) : state.portfolioTasks.map(t => String(t._id) === id ? data.task : t);
        state.propertyOverviewData = null;
        if (closeEditor || (remove && state.portfolioTaskEditing === id)) { state.portfolioTaskEditing = ''; state.portfolioTaskDraft = null; }
        renderPortfolioTasksList();
        showNotification(remove ? 'Task deleted' : updates.completed === true ? 'Task completed' : 'Task saved', 'success');
    } catch (error) { showNotification('Could not save changes. Please try again.', 'error'); }
    finally { state.portfolioTaskBusy = ''; list.setAttribute('aria-busy', 'false'); list.querySelectorAll('button,input,select,textarea').forEach(el => el.disabled = false); }
}

function renderPortfolioTasksList() {
    const list = document.getElementById('portfolioTasksList'); if (!list) return;
    const view = state.portfolioTaskView || 'active', all = state.portfolioTasks || [];
    document.querySelectorAll('[data-portfolio-task-view]').forEach(button => { const completed = button.dataset.portfolioTaskView === 'completed'; const count = all.filter(t => (t.status === 'completed') === completed).length; button.classList.toggle('active', button.dataset.portfolioTaskView === view); button.setAttribute('aria-pressed', String(button.dataset.portfolioTaskView === view)); button.textContent = `${completed ? 'Completed' : 'Active'} (${count})`; });
    const tasks = all.filter(t => (t.status === 'completed') === (view === 'completed')).sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned));
    if (!tasks.length) { list.innerHTML = `<div class="task-flow-empty">${view === 'completed' ? 'Completed tasks will appear here.' : 'All caught up. Add a task above.'}</div>`; return; }
    list.innerHTML = tasks.map(task => {
        const id = escapeHtml(String(task._id)), done = task.status === 'completed', editing = state.portfolioTaskEditing === String(task._id);
        const projectId = String(task.projectId?._id || task.projectId || ''), property = (state.properties || []).find(p => String(p._id) === projectId);
        const propertyName = property?.name || task.projectId?.name || 'Linked property';
        const date = task.dueDate ? String(task.dueDate).slice(0,10) : '', today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const due = date ? new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '';
        const button = (action,label,icon,extra='') => `<button type="button" data-task-action="${action}" data-task-id="${id}" class="task-icon-button ${extra}" aria-label="${label}"><i class="fas ${icon}" aria-hidden="true"></i></button>`;
        return `<article class="task-flow-item ${done?'is-completed':''}"><div class="task-flow-row">${button('complete',done?'Mark incomplete':'Complete task',done?'fa-circle-check':'fa-circle','task-check')}<div class="task-flow-copy"><button type="button" class="task-title-button" data-task-action="edit" data-task-id="${id}">${escapeHtml(task.title || 'Task')}</button>${!editing&&task.description?`<p class="task-flow-description">${escapeHtml(task.description)}</p>`:''}<div class="task-flow-meta">${date?`<span class="task-date ${!done&&date<todayKey?'overdue':''}">${!done&&date<todayKey?'Overdue · ':''}${due}</span>`:''}${projectId?`<button type="button" class="task-property-link" data-task-action="property" data-task-id="${id}" title="Open ${escapeHtml(propertyName)}"><i class="fas fa-building" aria-hidden="true"></i>${escapeHtml(propertyName)}</button>`:''}</div></div>${button('star',task.pinned?'Unstar task':'Star task','fa-star',task.pinned?'is-starred':'')}</div>${editing?`<form class="task-inline-editor" data-id="${id}"><label>Task<input name="title" required maxlength="500" value="${escapeHtml(state.portfolioTaskDraft.title)}"></label>${portfolioTaskFields(state.portfolioTaskDraft,'editTask')}<div class="task-editor-actions"><button type="submit">Save</button><button type="button" data-task-action="cancel">Cancel</button>${button('delete','Delete task','fa-trash')}</div></form>`:''}</article>`;
    }).join('');
    renderWorkspaceOutlineIcons(list);
}

async function loadPortfolioTasks(force = false) {
    if (!force && state.portfolioTasksLoaded) {
        renderPortfolioTasksList();
        return state.portfolioTasks;
    }
    try {
        const res = await fetch(`${API_URL}/portfolio-tasks?scope=all`);
        if (!res.ok) throw new Error('Failed to load portfolio tasks');
        const data = await res.json();
        state.portfolioTasks = Array.isArray(data.tasks) ? data.tasks : [];
        state.portfolioTasksLoaded = true;
    } catch (e) {
        console.error('Error loading portfolio tasks:', e); showNotification('Could not refresh tasks. Please try again.', 'error');
    }
    renderPortfolioTasksList();
    return state.portfolioTasks;
}

function isPortfolioOverviewVisible() {
    const section = document.getElementById('portfolioOverviewSection');
    return Boolean(section && section.style.display !== 'none');
}

function closePortfolioTasksModalMode() {
    const section = document.getElementById('portfolioOverviewSection');
    if (!section || !state.portfolioTasksModalMode) return;
    state.portfolioTasksModalMode = false;
    section.classList.remove('portfolio-tasks-only');
    if (!state.portfolioMode) {
        section.style.display = 'none';
    }
    renderWorkspaceSidebar();
    syncMobilePortfolioUi();
}

function openGlobalPortfolioTasksDrawer() {
    if (isPortfolioOverviewVisible() && state.portfolioMode) {
        togglePortfolioTasksDrawer(true);
        document.getElementById('portfolioTaskAddButton')?.focus();
        return;
    }
    const section = document.getElementById('portfolioOverviewSection');
    if (!section) return;
    state.portfolioTasksModalMode = true;
    section.style.display = 'block';
    section.classList.add('portfolio-tasks-only');
    renderWorkspaceSidebar();
    syncMobilePortfolioUi();
    loadPortfolioTasks(true).catch(() => {});
    togglePortfolioTasksDrawer(true);
    document.getElementById('portfolioTaskAddButton')?.focus();
}

function togglePortfolioTasksDrawer(force) {
    if (state.portfolioMode && !state.portfolioTasksModalMode && window.innerWidth > 900) {
        const panel = document.getElementById('portfolioTasksSidebar');
        panel?.classList.remove('desktop-open', 'mobile-open');
        document.getElementById('mobilePanelOverlay')?.classList.remove('visible');
        if (force !== false) {
            panel?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
            document.getElementById('portfolioTaskAddButton')?.focus({ preventScroll: true });
        }
        return;
    }

    const panel=document.getElementById('portfolioTasksSidebar'),overlay=document.getElementById('mobilePanelOverlay'),tasksBtn=document.getElementById('mobileNavTasksBtn');
    if(!panel)return;
    const isOpen=panel.classList.contains('desktop-open')||panel.classList.contains('mobile-open');
    const shouldOpen=typeof force==='boolean'?force:!isOpen;
    panel.classList.toggle('desktop-open',shouldOpen&&window.innerWidth>900);
    panel.classList.toggle('mobile-open',shouldOpen&&window.innerWidth<=900);
    overlay?.classList.toggle('visible',shouldOpen);
    tasksBtn?.classList.toggle('active',shouldOpen&&window.innerWidth<=900);
    tasksBtn?.setAttribute('aria-expanded',shouldOpen&&window.innerWidth<=900?'true':'false');
    if(!shouldOpen)closePortfolioTasksModalMode();
}

function setMobileTasksDrawerOpen(isOpen) {
    const tasksSidebar = document.getElementById('portfolioTasksSidebar');
    const overlay = document.getElementById('mobilePanelOverlay');
    const tasksBtn = document.getElementById('mobileNavTasksBtn');
    if (!tasksSidebar || !overlay) return;

    const canOpen = window.innerWidth <= 900 && isPortfolioOverviewVisible();
    const shouldOpen = Boolean(isOpen && canOpen);

    tasksSidebar.classList.toggle('mobile-open', shouldOpen);
    overlay.classList.toggle('visible', shouldOpen);

    if (tasksBtn) {
        tasksBtn.classList.toggle('active', shouldOpen);
        tasksBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }
}

function syncMobilePortfolioUi() {
    const tasksBtn = document.getElementById('mobileNavTasksBtn');
    const propertiesBtn = document.getElementById('mobileNavPropertiesBtn');
    const sidebar = document.querySelector('.sidebar');
    const portfolioVisible = isPortfolioOverviewVisible();

    if (tasksBtn) {
        const iconEl = tasksBtn.querySelector('i');
        const labelEl = tasksBtn.querySelector('span');
        if (portfolioVisible) {
            if (iconEl) iconEl.className = 'fas fa-list-check';
            if (labelEl) labelEl.textContent = 'Tasks';
            tasksBtn.setAttribute('aria-label', state.portfolioTasksModalMode ? 'Open tasks drawer' : 'Go to Global Tasks');
        } else {
            if (iconEl) iconEl.className = 'fas fa-chart-pie';
            if (labelEl) labelEl.textContent = 'Overview';
            tasksBtn.setAttribute('aria-label', 'Open portfolio overview');
            tasksBtn.classList.remove('active');
            tasksBtn.setAttribute('aria-expanded', 'false');
        }
    }

    if (propertiesBtn && sidebar) {
        const sidebarOpen = window.innerWidth <= 900 && sidebar.classList.contains('visible');
        propertiesBtn.classList.toggle('active', sidebarOpen);
        propertiesBtn.setAttribute('aria-expanded', sidebarOpen ? 'true' : 'false');
    }

    if (window.innerWidth > 900 || !portfolioVisible) {
        setMobileTasksDrawerOpen(false);
    }
}

function initializeMobilePortfolioNavigation() {
    const sidebar = document.querySelector('.sidebar');
    const propertiesBtn = document.getElementById('mobileNavPropertiesBtn');
    const tasksBtn = document.getElementById('mobileNavTasksBtn');
    const maintenanceBtn = document.getElementById('mobileNavMaintenanceBtn');
    const applicationsBtn = document.getElementById('mobileNavApplicationsBtn');
    const overlay = document.getElementById('sidebarOverlay');
    const panelOverlay = document.getElementById('mobilePanelOverlay');
    if (!sidebar || sidebar.dataset.mobileNavBound === 'true') {
        syncMobilePortfolioUi();
        return;
    }

    // Hide sidebar by default on mobile
    function setSidebarInitial() {
        if (window.innerWidth <= 900) {
            sidebar.classList.remove('visible');
        } else {
            sidebar.classList.add('visible');
        }
    }
    setSidebarInitial();
    syncMobilePortfolioUi();

    propertiesBtn?.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
            setMobileTasksDrawerOpen(false);
            sidebar.classList.toggle('visible');
            syncMobilePortfolioUi();
            return;
        }
        sidebar.classList.add('visible');
        syncMobilePortfolioUi();
    });

    tasksBtn?.addEventListener('click', () => {
        if (window.innerWidth > 900) return;
        if (!isPortfolioOverviewVisible()) {
            sidebar.classList.remove('visible');
            setMobileTasksDrawerOpen(false);
            try {
                openGlobalPortfolioTasksDrawer();
            } catch (error) {
                console.error('Error opening portfolio overview from mobile nav:', error);
                showNotification('Could not open tasks drawer', 'error');
            }
            syncMobilePortfolioUi();
            return;
        }
        sidebar.classList.remove('visible');
        const tasksSidebar = document.getElementById('portfolioTasksSidebar');
        const willOpen = !tasksSidebar?.classList.contains('mobile-open');
        setMobileTasksDrawerOpen(willOpen);
        syncMobilePortfolioUi();
    });

    maintenanceBtn?.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        setMobileTasksDrawerOpen(false);
        syncMobilePortfolioUi();
        document.getElementById('topToolMaintenance')?.click();
    });

    applicationsBtn?.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        setMobileTasksDrawerOpen(false);
        syncMobilePortfolioUi();
        document.getElementById('topToolApplications')?.click();
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        syncMobilePortfolioUi();
    });

    panelOverlay?.addEventListener('click', () => {
        togglePortfolioTasksDrawer(false);
        syncMobilePortfolioUi();
    });

        // Touch support for maintenance-card hover effect on iOS/mobile
    document.querySelectorAll('.maintenance-card').forEach(card => {
        card.addEventListener('touchstart', function() {
            this.classList.add('active');
        });
        card.addEventListener('touchend', function() {
            this.classList.remove('active');
        });
        card.addEventListener('touchcancel', function() {
            this.classList.remove('active');
        });
    });


    // Hide sidebar on resize if needed
    window.addEventListener('resize', () => {
        setSidebarInitial();
        syncMobilePortfolioUi();
    });
    sidebar.dataset.mobileNavBound = 'true';
}


function managerInitials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return words.length ? Array.from(words[0])[0].toLocaleUpperCase() + (words.length > 1 ? Array.from(words[words.length - 1])[0].toLocaleUpperCase() : '') : 'M';
}
function updateManagerMenuIdentity(name) {
    document.getElementById('managerAvatarInitials').textContent = managerInitials(name);
    document.getElementById('managerMenuName').textContent = name || 'Manager';
    document.getElementById('managerMenuButton').setAttribute('aria-label', `Account menu for ${name || 'Manager'}`);
}
function setManagerMenuOpen(open, restoreFocus = false) {
    const button = document.getElementById('managerMenuButton'), menu = document.getElementById('managerAccountMenu');
    menu.hidden = !open; button.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('managerProfileMenuItem').focus();
    else if (restoreFocus) button.focus();
}
async function managerProfileRequest(method = 'GET', payload) {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Please sign in again to access your profile.');
    const response = await fetch('/api/manager/profile', { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Please sign in again to edit your profile.' : data.error || 'Unable to update profile.');
    return data.manager;
}
function initializeManagerAccountMenu() {
    const container = document.getElementById('managerAccount'), trigger = document.getElementById('managerMenuButton'), menu = document.getElementById('managerAccountMenu');
    if (!container || container.dataset.bound) return; container.dataset.bound = 'true';
    updateManagerMenuIdentity(localStorage.getItem('managerName') || localStorage.getItem('userName') || '');
    trigger.addEventListener('click', () => setManagerMenuOpen(menu.hidden));
    trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); setManagerMenuOpen(true); } });
    document.getElementById('managerProfileMenuItem').addEventListener('click', openManagerProfileSettings);
    document.addEventListener('pointerdown', event => { if (!container.contains(event.target)) setManagerMenuOpen(false); });
    container.addEventListener('focusout', event => { if (!container.contains(event.relatedTarget)) setManagerMenuOpen(false); });
    menu.addEventListener('keydown', event => {
        const items = Array.from(menu.querySelectorAll('[role=menuitem]'));
        if (event.key === 'Escape') { event.preventDefault(); setManagerMenuOpen(false, true); }
        else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
            event.preventDefault(); const index = items.indexOf(document.activeElement);
            items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        }
    });
    document.getElementById('managerProfileForm').addEventListener('submit', async event => {
        event.preventDefault(); const save = document.getElementById('managerProfileSave'); if (save.disabled) return;
        const name = document.getElementById('managerProfileName').value.trim(); if (!name) return;
        save.disabled = true; const error = document.getElementById('managerProfileError'); error.textContent = '';
        try { const manager = await managerProfileRequest('PUT', { name }); localStorage.setItem('managerName', manager.name); updateManagerMenuIdentity(manager.name); setPortfolioWelcomeText(); showNotification('Profile updated', 'success'); }
        catch (err) { error.textContent = err.message; }
        finally { save.disabled = false; }
    });
    window.addEventListener('storage', event => { if (event.key === 'managerName') updateManagerMenuIdentity(event.newValue); });
}
document.addEventListener('DOMContentLoaded', initializeManagerAccountMenu);
function closeManagerProfileContainer() {
    document.body.classList.remove('manager-profile-active');
    const section = document.getElementById('managerProfileSection'); if (section) section.hidden = true;
    document.getElementById('managerPasswordForm')?.reset();
}
function logoutManager() {
    ['token', 'managerId', 'managerName', 'userName', 'managerEmail'].forEach(key => localStorage.removeItem(key));
    document.getElementById('managerPasswordForm')?.reset();
    window.location.replace('project-manager-auth.html');
}
function showManagerProfileContainer(tab = 'profile') {
    setManagerMenuOpen(false);
    const section = document.getElementById('managerProfileSection');
    section.hidden = false; document.body.classList.add('manager-profile-active');
    document.querySelectorAll('[data-manager-profile-tab]').forEach(button => {
        const active = button.dataset.managerProfileTab === tab;
        button.setAttribute('aria-selected', String(active));
        document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
    });
    section.scrollIntoView({ block: 'start', behavior: 'auto' });
    document.getElementById(tab === 'security' ? 'managerCurrentPassword' : 'managerProfileName')?.focus({ preventScroll: true });
}
async function openManagerProfileSettings(tab = 'profile') {
    showManagerProfileContainer(typeof tab === 'string' ? tab : 'profile');
    const error = document.getElementById('managerProfileError'), save = document.getElementById('managerProfileSave');
    document.getElementById('managerProfileName').value = localStorage.getItem('managerName') || localStorage.getItem('userName') || '';
    error.textContent = 'Loading profile…'; save.disabled = true;
    try {
        const manager = await managerProfileRequest();
        if (document.getElementById('managerProfileSection').hidden) return;
        document.getElementById('managerProfileName').value = manager.name || '';
        document.getElementById('managerProfileEmail').value = manager.email || '';
        localStorage.setItem('managerName', manager.name || ''); updateManagerMenuIdentity(manager.name); setPortfolioWelcomeText();
        error.textContent = ''; save.disabled = false;
    } catch (err) { error.textContent = err.message; }
}
function initializeManagerProfileContainer() {
    document.getElementById('managerProfileBack').addEventListener('click', () => { closeManagerProfileContainer(); document.getElementById('managerMenuButton').focus(); });
    document.getElementById('managerPasswordMenuItem').addEventListener('click', () => openManagerProfileSettings('security'));
    document.getElementById('managerLogoutMenuItem').addEventListener('click', logoutManager);
    document.querySelectorAll('[data-manager-profile-tab]').forEach(button => button.addEventListener('click', () => showManagerProfileContainer(button.dataset.managerProfileTab)));
    document.getElementById('managerPasswordForm').addEventListener('submit', async event => {
        event.preventDefault(); const button = document.getElementById('managerPasswordSave'); if (button.disabled) return;
        const form = event.currentTarget, message = document.getElementById('managerPasswordError');
        const currentPassword = form.elements.currentPassword.value, newPassword = form.elements.newPassword.value;
        if (newPassword !== form.elements.confirmPassword.value) { message.textContent = 'New passwords do not match.'; return; }
        if (new TextEncoder().encode(newPassword).length > 72) { message.textContent = 'Use a password of at most 72 bytes.'; return; }
        button.disabled = true; message.textContent = '';
        try {
            const response = await fetch('/api/manager/password', { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to change password.');
            form.reset(); logoutManager();
        } catch (err) { message.textContent = err.message; }
        finally { button.disabled = false; }
    });
    window.addEventListener('storage', event => { if (event.key === 'token' && !event.newValue) window.location.replace('project-manager-auth.html'); });
}
document.addEventListener('DOMContentLoaded', initializeManagerProfileContainer);



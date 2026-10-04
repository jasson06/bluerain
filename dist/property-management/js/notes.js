// Property management: notes.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// ===== Notes Drawer Logic (Applications, Invites & Tenants) =====

function getNotesDrawerElements() {
    return {
        root: document.getElementById('notesDrawer'),
        overlay: document.getElementById('notesDrawerOverlay'),
        loaderEl: document.getElementById('notesDrawerLoader'),
        closeBtn: document.getElementById('notesDrawerClose'),
        titleEl: document.getElementById('notesDrawerTitle'),
        subtitleEl: document.getElementById('notesDrawerSubtitle'),
        bodyEl: document.getElementById('notesDrawerBody'),
        formEl: document.getElementById('notesDrawerForm'),
        inputEl: document.getElementById('notesDrawerInput')
    };
}

function setNotesDrawerLoading(isLoading) {
    const { loaderEl } = getNotesDrawerElements();
    if (!loaderEl) return;
    loaderEl.style.display = isLoading ? 'flex' : 'none';
}

function renderNotesDrawerMessages(notes) {
    const { bodyEl } = getNotesDrawerElements();
    if (!bodyEl) return;
    const items = Array.isArray(notes) ? notes : [];
    if (!items.length) {
        bodyEl.innerHTML = '<div class="notes-drawer-empty">No notes yet. Start the conversation below.</div>';
        return;
    }
    const rows = items
        .slice()
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
        .map(n => {
            const ts = n.createdAt ? new Date(n.createdAt).toLocaleString('en-US') : '';
            const safeText = (n.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const noteId = n._id || '';
            return `
                <div class="notes-drawer-message" data-note-id="${noteId}">
                    <div class="notes-drawer-bubble">
                        <button type="button" class="notes-drawer-delete" data-note-id="${noteId}" title="Delete note">
                            <i class="fas fa-trash"></i>
                        </button>
                        <div>${safeText}</div>
                        <span class="notes-drawer-timestamp">${ts}</span>
                    </div>
                </div>`;
        }).join('');
    bodyEl.innerHTML = rows;

    // Attach delete handlers for each note trash icon
    bodyEl.querySelectorAll('.notes-drawer-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const noteId = btn.getAttribute('data-note-id');
            if (!noteId) return;
            deleteNoteFromDrawer(noteId);
        });
    });

    bodyEl.scrollTop = bodyEl.scrollHeight;
}

// ===== Portfolio Overview Inline Notes Panel (always visible in sidebar) =====

function getPortfolioNotesSourceForContext(ctx) {
    if (!ctx) return { notes: [], label: 'No item selected' };
    if (ctx.type === 'tenant') {
        const t = (state.allTenants || state.tenants || []).find(x => String(x._id) === String(ctx.id));
        if (!t) return { notes: [], label: 'Tenant not found' };
        const name = t.fullName || t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
        const unitNumber = t.unitNumber || t.unit || '';
        const labelParts = [name, unitNumber && `Unit ${unitNumber}`].filter(Boolean);
        return { notes: t.notesHistory || [], label: labelParts.join(' \\u2022 ') || 'Tenant' };
    }
    if (ctx.type === 'application') {
        const a = (state.applications || []).find(x => String(x._id) === String(ctx.id));
        if (!a) return { notes: [], label: 'Application not found' };
        const labelParts = [a.name || '', a.email || ''].filter(Boolean);
        return { notes: a.notesHistory || [], label: labelParts.join(' \\u2022 ') || 'Application' };
    }
    if (ctx.type === 'invite') {
        const inv = (state.invites || []).find(x => String(x._id) === String(ctx.id));
        if (!inv) return { notes: [], label: 'Invite not found' };
        const labelParts = [inv.name || '', inv.email || ''].filter(Boolean);
        return { notes: inv.notesHistory || [], label: labelParts.join(' \\u2022 ') || 'Invite' };
    }
    return { notes: [], label: 'Unsupported item' };
}

function renderPortfolioNotesPanel() {
    const containerEl = document.getElementById('portfolioNotesSidebar');
    const metaEl = document.getElementById('portfolioNotesMeta');
    const listEl = document.getElementById('portfolioNotesList');
    const formEl = document.getElementById('portfolioNotesForm');
    const inputEl = document.getElementById('portfolioNotesInput');
    if (!containerEl || !metaEl || !listEl) return;

    const ctx = state.portfolioNotesContext;
    if (!ctx) {
        containerEl.style.display = 'none';
        metaEl.textContent = 'Select a row in the overview to see notes.';
        listEl.innerHTML = '<p style="font-size:0.8rem;color:#9ca3af;margin:4px 2px;">No item selected.</p>';
        if (formEl) formEl.style.display = 'none';
        return;
    }

    containerEl.style.display = 'flex';
    const src = getPortfolioNotesSourceForContext(ctx);
    metaEl.textContent = src.label || 'Selected item';
    if (formEl) formEl.style.display = '';

    const notes = Array.isArray(src.notes) ? src.notes : [];
    if (!notes.length) {
        listEl.innerHTML = '<p style="font-size:0.8rem;color:#9ca3af;margin:4px 2px;">No notes yet. Add one below.</p>';
    } else {
        const rows = notes
            .slice()
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
            .map(n => {
                const ts = n.createdAt ? new Date(n.createdAt).toLocaleString('en-US') : '';
                const safeText = (n.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const noteId = n._id || '';
                return `
                    <div class=\"portfolio-notes-item\" data-note-id=\"${noteId}\">\n                        <div class=\"portfolio-notes-bubble\">\n                            <button type=\"button\" class=\"portfolio-notes-delete\" data-note-id=\"${noteId}\" title=\"Delete note\">\n                                <i class=\"fas fa-trash\"></i>\n                            </button>\n                            <div>${safeText}</div>\n                            <span class=\"portfolio-notes-timestamp\">${ts}</span>\n                        </div>\n                    </div>`;
            }).join('');
        listEl.innerHTML = rows;
        listEl.querySelectorAll('.portfolio-notes-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-note-id');
                if (!id) return;
                deletePortfolioNote(id);
            });
        });
    }

    if (inputEl) inputEl.value = '';
}

async function savePortfolioNote(text) {
    const ctx = state.portfolioNotesContext;
    if (!ctx) {
        showNotification('Select an item in the overview first', 'error');
        return;
    }

    let url = '';
    if (ctx.type === 'tenant') {
        url = `/api/tenants/${ctx.id}/notes`;
    } else if (ctx.type === 'application') {
        url = `/api/rental-applications/${ctx.id}/notes`;
    } else if (ctx.type === 'invite') {
        url = `/api/application-invites/${ctx.id}/notes`;
    } else {
        showNotification('Notes are not supported for this item', 'error');
        return;
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!res.ok) throw new Error('Failed to add note');
        const data = await res.json();
        const notes = data.notes || [];

        if (ctx.type === 'tenant') {
            state.allTenants = (state.allTenants || []).map(t =>
                String(t._id) === String(ctx.id) ? { ...t, notesHistory: notes } : t
            );
            state.tenants = (state.tenants || []).map(t =>
                String(t._id) === String(ctx.id) ? { ...t, notesHistory: notes } : t
            );
        } else if (ctx.type === 'application') {
            state.applications = (state.applications || []).map(a =>
                String(a._id) === String(ctx.id) ? { ...a, notesHistory: notes } : a
            );
        } else if (ctx.type === 'invite') {
            state.invites = (state.invites || []).map(x =>
                String(x._id) === String(ctx.id) ? { ...x, notesHistory: notes } : x
            );
        }

        renderPortfolioNotesPanel();
    } catch (err) {
        console.error('Add portfolio note error:', err);
        showNotification('Could not add note', 'error');
    }
}

async function deletePortfolioNote(noteId) {
    const ctx = state.portfolioNotesContext;
    if (!ctx || !noteId) return;

    if (!confirm('Delete this note? This cannot be undone.')) return;

    let url = '';
    if (ctx.type === 'tenant') {
        url = `/api/tenants/${ctx.id}/notes/${noteId}`;
    } else if (ctx.type === 'application') {
        url = `/api/rental-applications/${ctx.id}/notes/${noteId}`;
    } else if (ctx.type === 'invite') {
        url = `/api/application-invites/${ctx.id}/notes/${noteId}`;
    } else {
        return;
    }

    try {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete note');
        const data = await res.json();
        const notes = data.notes || [];

        if (ctx.type === 'tenant') {
            state.allTenants = (state.allTenants || []).map(t =>
                String(t._id) === String(ctx.id) ? { ...t, notesHistory: notes } : t
            );
            state.tenants = (state.tenants || []).map(t =>
                String(t._id) === String(ctx.id) ? { ...t, notesHistory: notes } : t
            );
        } else if (ctx.type === 'application') {
            state.applications = (state.applications || []).map(a =>
                String(a._id) === String(ctx.id) ? { ...a, notesHistory: notes } : a
            );
        } else if (ctx.type === 'invite') {
            state.invites = (state.invites || []).map(x =>
                String(x._id) === String(ctx.id) ? { ...x, notesHistory: notes } : x
            );
        }

        renderPortfolioNotesPanel();
    } catch (err) {
        console.error('Delete portfolio note error:', err);
        showNotification('Could not delete note', 'error');
    }
}

function clearPortfolioSelectionAndNotes() {
    const detailsBody = document.getElementById('portfolioDetailsBody');
    if (detailsBody) {
        detailsBody.querySelectorAll('tr.selected-portfolio-row').forEach(row => {
            row.classList.remove('selected-portfolio-row');
        });
    }
    if (state.portfolioNotesContext) {
        state.portfolioNotesContext = null;
        renderPortfolioNotesPanel();
    }
}

function openNotesDrawerForTenant(tenantId) {
    const { root, overlay, closeBtn, titleEl, subtitleEl, inputEl } = getNotesDrawerElements();
    if (!root) return;
    const tenant = (state.allTenants || state.tenants || []).find(t => String(t._id) === String(tenantId));
    if (!tenant) return;

    state.notesDrawerContext = {
        type: 'tenant',
        id: tenantId
    };

    if (titleEl) titleEl.textContent = 'Tenant Notes';
    if (subtitleEl) {
        const name = tenant.fullName || tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();
        const email = tenant.email || tenant.tenantEmail || '';
        const subtitle = [name, email].filter(Boolean).join(' \u2022 ');
        subtitleEl.textContent = subtitle;
    }

    renderNotesDrawerMessages(tenant.notesHistory || []);

    root.classList.add('open');
    if (inputEl) {
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 50);
    }

    if (overlay) {
        overlay.onclick = () => closeNotesDrawer();
    }
    if (closeBtn) {
        closeBtn.onclick = () => closeNotesDrawer();
    }
}

function openNotesDrawerForApplication(appId) {
    const { root, overlay, closeBtn, titleEl, subtitleEl, inputEl } = getNotesDrawerElements();
    if (!root) return;
    const app = (state.applications || []).find(a => String(a._id) === String(appId));
    if (!app) return;

    state.notesDrawerContext = {
        type: 'application',
        id: appId
    };

    if (titleEl) titleEl.textContent = 'Application Notes';
    if (subtitleEl) subtitleEl.textContent = `${app.name || ''} • ${app.email || ''}`.trim();

    renderNotesDrawerMessages(app.notesHistory || []);

    root.classList.add('open');
    if (inputEl) {
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 50);
    }

    if (overlay) {
        overlay.onclick = () => closeNotesDrawer();
    }
    if (closeBtn) {
        closeBtn.onclick = () => closeNotesDrawer();
    }
}

function openNotesDrawerForInvite(inviteId) {
    const { root, overlay, closeBtn, titleEl, subtitleEl, inputEl } = getNotesDrawerElements();
    if (!root) return;
    const invite = (state.invites || []).find(x => String(x._id) === String(inviteId));
    if (!invite) return;

    state.notesDrawerContext = {
        type: 'invite',
        id: inviteId
    };

    if (titleEl) titleEl.textContent = 'Invite Notes';
    if (subtitleEl) subtitleEl.textContent = `${invite.name || ''} • ${invite.email || ''}`.trim();

    renderNotesDrawerMessages(invite.notesHistory || []);

    root.classList.add('open');
    if (inputEl) {
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 50);
    }

    if (overlay) {
        overlay.onclick = () => closeNotesDrawer();
    }
    if (closeBtn) {
        closeBtn.onclick = () => closeNotesDrawer();
    }
}

function closeNotesDrawer() {
    const { root } = getNotesDrawerElements();
    if (!root) return;
    root.classList.remove('open');
    state.notesDrawerContext = null;
}

async function deleteNoteFromDrawer(noteId) {
    const ctx = state.notesDrawerContext;
    if (!ctx || !noteId) return;

    if (!confirm('Delete this note? This cannot be undone.')) return;

    let url = '';
    if (ctx.type === 'application') {
        url = `/api/rental-applications/${ctx.id}/notes/${noteId}`;
    } else if (ctx.type === 'invite') {
        url = `/api/application-invites/${ctx.id}/notes/${noteId}`;
    } else if (ctx.type === 'tenant') {
        url = `/api/tenants/${ctx.id}/notes/${noteId}`;
    } else {
        return;
    }

    try {
        setNotesDrawerLoading(true);
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete note');
        const data = await res.json();
        const notes = data.notes || [];

        if (ctx.type === 'application') {
            state.applications = (state.applications || []).map(a =>
                String(a._id) === String(ctx.id) ? { ...a, notesHistory: notes } : a
            );
        } else if (ctx.type === 'invite') {
            state.invites = (state.invites || []).map(x =>
                String(x._id) === String(ctx.id) ? { ...x, notesHistory: notes } : x
            );
        } else if (ctx.type === 'tenant') {
            state.allTenants = (state.allTenants || []).map(t =>
                String(t._id) === String(ctx.id) ? { ...t, notesHistory: notes } : t
            );
        }

        renderNotesDrawerMessages(notes);
    } catch (err) {
        console.error('Delete note error:', err);
        showNotification('Could not delete note', 'error');
    } finally {
        setNotesDrawerLoading(false);
    }
}

async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }
showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/documents/${docId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete document');
        
    invalidateCache('documents');
    await refreshContent('documents');
        showNotification('Document deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting document:', error);
        showNotification('Error deleting document', 'error');
            } finally {
        hideLoader();
    }
}

let paymentWorkspaceLoadSequence=0;
async function loadPaymentWorkspace(propertyId,quiet=false){
 if(!propertyId)return;
 const sequence=++paymentWorkspaceLoadSequence;
 setQuickBooksProgress('payments','Loading QuickBooks payments and preparing balances. This may take a moment…');
 try{
  const response=await fetch(`${API_URL}/properties/${propertyId}/quickbooks/payment-workspace`),data=await response.json();
  if(!response.ok)throw new Error(data.message||'Unable to load payment workspace');
  if(sequence!==paymentWorkspaceLoadSequence||String(state.currentProperty?._id)!==String(propertyId))return;
  state.paymentWorkspace=data;state.quickBooksPaymentsConnected=!!data.connected;
  state.quickBooksPayments=Array.isArray(data.qbPayments)?data.qbPayments:[];state.quickBooksPaymentsError='';
  if(Array.isArray(data.localPayments)){state.payments=data.localPayments;renderPayments();updateTabCounts();}
  renderPaymentWorkspace();
  const review=Number(data.summary?.unmatched||0)+Number(data.summary?.conflicts||0);
  setQuickBooksProgress('payments',data.connected?`QuickBooks payments loaded. Balances are up to date.${review?' Some transactions need review in Unmatched or Conflicts.':''}`:'QuickBooks is not connected for this property.',data.connected?'success':'info');
  return data;
 }catch(error){
  if(sequence!==paymentWorkspaceLoadSequence||String(state.currentProperty?._id)!==String(propertyId))return;
  state.paymentWorkspace={connected:false,error:error.message,summary:{unmatched:0,conflicts:1,unmappedCustomers:0}};
  renderPaymentWorkspace();setQuickBooksProgress('payments','Unable to refresh QuickBooks payments. Existing rows may be out of date. '+error.message,'error');
  const banner=document.getElementById('qbPaymentsProgress');if(banner){const retry=document.createElement('button');retry.className='btn-secondary';retry.textContent='Retry';retry.onclick=()=>loadPaymentWorkspace(propertyId);banner.appendChild(retry);}
  if(!quiet)showNotification(error.message,'error');
 }
}

function selectPaymentWorkspace(tab){state.paymentWorkspaceTab=tab||'transactions';document.querySelectorAll('.payment-workspace-tab').forEach(b=>b.classList.toggle('active',b.dataset.paymentWorkspace===state.paymentWorkspaceTab));const t=document.getElementById('paymentWorkspaceTransactions'),o=document.getElementById('paymentWorkspaceOperational');if(t)t.style.display=state.paymentWorkspaceTab==='transactions'?'block':'none';if(o)o.style.display=state.paymentWorkspaceTab==='transactions'?'none':'block';renderPaymentWorkspace();}

function currentPaymentPeriod(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}

function initializePaymentPeriodFilter(){const input=document.getElementById('paymentPeriodFilter');if(!input||input.dataset.ready)return;if(!input.value)input.value=currentPaymentPeriod();input.dataset.ready='1';input.addEventListener('change',()=>{state.paymentPage=1;renderPayments();});}

function setPaymentPeriodFilter(mode){const input=document.getElementById('paymentPeriodFilter');if(!input)return;input.value=mode==='all'?'':currentPaymentPeriod();state.paymentPage=1;renderPayments();}

function changePaymentPage(delta){state.paymentPage=Math.max(1,(Number(state.paymentPage)||1)+delta);renderPayments();}

function setPaymentPageSize(value){state.paymentPageSize=Math.max(10,Number(value)||50);state.paymentPage=1;renderPayments();}

function generatePaymentNote(){const tenant=(state.tenants||[]).find(t=>String(t._id)===String(document.getElementById('paymentTenant')?.value)),amount=Number(document.getElementById('paymentAmount')?.value||0),apply=document.getElementById('paymentApplyTo')?.selectedOptions?.[0]?.textContent||'Payment',method=document.getElementById('paymentMethod')?.selectedOptions?.[0]?.textContent||'',date=document.getElementById('paymentDate')?.value,period=document.getElementById('paymentPeriodMonth')?.value;const parts=[`${apply} payment${Number.isFinite(amount)?` of $${amount.toFixed(2)}`:''}`,tenant?.name?`for ${tenant.name}`:'',period?`applied to ${period}`:'',method?`received via ${method}`:'',date?`posted ${date}`:''].filter(Boolean);document.getElementById('paymentNote').value=parts.join(' · ');}

function showTenantLedgerInline(){const modal=document.getElementById('tenantBalanceModal'),content=modal?.querySelector('.modal-content'),ledger=document.getElementById('paymentWorkspaceLedger');if(!content||!ledger)return openModal('tenantBalanceModal');paymentLedgerOriginalParent=paymentLedgerOriginalParent||modal;document.getElementById('paymentWorkspaceTabs').style.display='none';document.getElementById('paymentWorkspaceTransactions').style.display='none';document.getElementById('paymentWorkspaceOperational').style.display='none';ledger.style.display='block';ledger.innerHTML='<button type="button" class="btn-secondary" onclick="closeTenantLedgerInline()" style="margin-bottom:12px"><i class="fas fa-arrow-left"></i> Back to payments</button>';content.style.maxWidth='none';content.style.width='100%';content.style.boxShadow='none';content.style.margin='0';ledger.appendChild(content);}

function closeTenantLedgerInline(){const modal=document.getElementById('tenantBalanceModal'),content=document.querySelector('#paymentWorkspaceLedger .modal-content'),ledger=document.getElementById('paymentWorkspaceLedger');if(content&&modal){content.style.maxWidth='1000px';content.style.width='';content.style.boxShadow='';content.style.margin='';modal.appendChild(content);}if(ledger){ledger.innerHTML='';ledger.style.display='none';}document.getElementById('paymentWorkspaceTabs').style.display='flex';selectPaymentWorkspace('transactions');}

function closeTenantLedgerView(){if(document.querySelector('#paymentWorkspaceLedger .modal-content'))closeTenantLedgerInline();else closeModal('tenantBalanceModal');}

function paymentWorkspaceEmpty(icon,title,text,action=''){return `<div class="empty-state" style="padding:38px 20px"><i class="fas ${icon}" style="font-size:28px;color:#64748b"></i><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>${action}</div>`;}

function paymentWorkspaceDate(v){return v?formatDateDisplay(v):'—';}

function renderPaymentWorkspace(){const data=state.paymentWorkspace||{},summary=data.summary||{},put=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=Number(v)||0;};put('paymentUnmatchedCount',summary.unmatched);put('paymentConflictCount',summary.conflicts);put('paymentCustomerCount',summary.unmappedCustomers);const root=document.getElementById('paymentWorkspaceOperational');if(!root||state.paymentWorkspaceTab==='transactions')return;if(data.error){root.innerHTML=paymentWorkspaceEmpty('fa-triangle-exclamation','Workspace unavailable',data.error,'<button class="btn-secondary" onclick="loadPaymentWorkspace(state.currentProperty._id)">Try again</button>');return;}if(!data.connected){root.innerHTML=paymentWorkspaceEmpty('fa-link','Connect QuickBooks','Connect this property to review payments, customers, and synchronization status.','<button class="btn-primary" onclick="openQuickBooksSettings()">Connect QuickBooks</button>');return;}
if(state.paymentWorkspaceTab==='unmatched'){const rows=data.unmatched||[],tenantOptions=(state.tenants||[]).map(t=>`<option value="${escapeHtml(t._id)}">${escapeHtml(t.name)}</option>`).join('');root.innerHTML=`<div class="payments-header"><div><h3>Unmatched QuickBooks transactions</h3><p class="task-meta">Link an existing equal payment or import it once as a local posted payment.</p></div><button class="btn-secondary" onclick="loadPaymentWorkspace(state.currentProperty._id)">Refresh</button></div>${rows.length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Date</th><th>Customer</th><th>Reference</th><th>Amount</th><th>Resolution</th></tr></thead><tbody>${rows.map(r=>{const candidates=(state.payments||[]).filter(p=>!p.quickBooks?.entityId&&Math.abs(Number(p.amount||0)-Number(r.totalAmt||0))<.005);return `<tr><td>${paymentWorkspaceDate(r.txnDate)}</td><td>${escapeHtml(r.customerName||'Unassigned')}</td><td>${escapeHtml(r.docNumber||r.id||'—')}<div class="task-meta">${escapeHtml(r.periodError|| (r.invoiceId ? `Invoice ${r.invoiceNumber} · ${r.periodMonth}` : ''))}</div></td><td>$${Number(r.totalAmt||0).toFixed(2)}</td><td>${r.localPaymentId?'<span class="task-meta">Already linked</span>':`${candidates.length?`<select id="qbMatch-${r.sourceType}-${r.id}"><option value="">Local payment…</option>${candidates.map(p=>`<option value="${p._id}">${paymentWorkspaceDate(p.date)} · $${Number(p.amount).toFixed(2)}</option>`).join('')}</select><button class="overview-row-action" onclick="linkWorkspacePayment('${r.sourceType}','${r.id}')">Link</button>`:''}<select id="qbImport-${r.sourceType}-${r.id}"><option value="">Tenant to import…</option>${tenantOptions}</select><button class="overview-row-action" onclick="importWorkspacePayment('${r.sourceType}','${r.id}')">Import</button>`}</td></tr>`;}).join('')}</tbody></table></div>`:paymentWorkspaceEmpty('fa-circle-check','Nothing to review','Every QuickBooks payment is linked or imported.')}`;}
else if(state.paymentWorkspaceTab==='conflicts'){const rows=data.conflicts||[];root.innerHTML=`<div class="payments-header"><div><h3>Conflicts &amp; errors</h3><p class="task-meta">Resolve mapping problems, then retry the affected payment.</p></div><button class="btn-secondary" onclick="loadPaymentWorkspace(state.currentProperty._id)">Refresh</button></div>${rows.length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Type</th><th>Problem</th><th>Updated</th><th>Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${escapeHtml(x.kind||'sync')}</td><td>${escapeHtml(x.message||'Synchronization error')}</td><td>${paymentWorkspaceDate(x.updatedAt)}</td><td>${x.localEntityId?`<button class="overview-row-action" onclick="retryWorkspacePayment('${x.localEntityId}')">Retry</button>`:'Review mappings'}</td></tr>`).join('')}</tbody></table></div>`:paymentWorkspaceEmpty('fa-circle-check','No conflicts','Payment synchronization has no unresolved errors.')}`;}
else if(state.paymentWorkspaceTab==='customers'){
  const rows=data.customers||[],options=data.qbCustomers||[];
  root.innerHTML=`<div class="payments-header"><div><h3>Customer mapping</h3><p class="task-meta">Select all QuickBooks customers for each tenant. Choose one default for new outgoing payments.</p></div><button class="btn-secondary" onclick="loadPaymentWorkspace(state.currentProperty._id)">Refresh</button></div><div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Tenant</th><th>Unit</th><th>Incoming customers</th><th>Outgoing default</th><th></th></tr></thead><tbody>${rows.map(x=>{
    const linked=x.customers|| (x.customerId?[{customerId:x.customerId,customerDisplayName:x.customerDisplayName}]:[]);
    const ids=new Set(linked.map(c=>String(c.customerId)));
    const choices=[...new Map([...linked.map(c=>({id:c.customerId,name:c.customerDisplayName||c.customerId})),...options].map(c=>[String(c.id),c])).values()];
    return `<tr><td><strong>${escapeHtml(x.tenantName)}</strong></td><td>${escapeHtml(x.unitNumber||'—')}</td><td><div id="qbCustomers-${x.tenantId}" style="max-height:180px;overflow:auto">${choices.map(c=>`<label style="display:block"><input type="checkbox" value="${escapeHtml(c.id)}" ${ids.has(String(c.id))?'checked':''} onchange="updateWorkspaceCustomerDefault('${x.tenantId}')"> ${escapeHtml(c.name)}</label>`).join('')}</div></td><td><select id="qbCustomer-${x.tenantId}"><option value="">Not mapped</option>${choices.filter(c=>ids.has(String(c.id))).map(c=>`<option value="${escapeHtml(c.id)}" ${String(c.id)===String(x.customerId)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></td><td><button class="overview-row-action" id="qbSaveCustomer-${x.tenantId}" onclick="saveWorkspaceCustomer('${x.tenantId}')">Save</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
else if(state.paymentWorkspaceTab==='mappings'){const groups=[['Income items',data.mappingHealth?.incomeItems||[]],['Accounts',data.mappingHealth?.accounts||[]]];root.innerHTML=`<div class="payments-header"><div><h3>Accounts &amp; items</h3><p class="task-meta">Review mapping health here. Use the mapping modal to make changes.</p></div><button class="btn-primary" onclick="openQuickBooksSettings()">Edit mappings</button></div><div class="overview-grid">${groups.map(([name,items])=>`<section class="property-panel overview-span-6"><h3>${name}</h3>${items.map(x=>`<div class="overview-row"><span>${escapeHtml(x.label)}</span><strong>${x.mapped?escapeHtml(x.name||'Mapped'):'Not mapped'}</strong></div>`).join('')}</section>`).join('')}</div>`;}
else{const rows=data.activity||[];root.innerHTML=`<div class="payments-header"><div><h3>QuickBooks activity</h3><p class="task-meta">Recent synchronization attempts for this property.</p></div><button class="btn-secondary" onclick="loadPaymentWorkspace(state.currentProperty._id)">Refresh</button></div>${rows.length?`<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Record</th><th>Operation</th><th>Status</th><th>QuickBooks ID</th><th>Updated</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${escapeHtml(x.localEntityType||'Record')} ${escapeHtml(String(x.localEntityId||'').slice(-6))}</td><td>${escapeHtml(x.operation||'sync')}</td><td>${escapeHtml(x.status||'pending')}</td><td>${escapeHtml(x.quickBooksEntityId||'—')}</td><td>${paymentWorkspaceDate(x.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`:paymentWorkspaceEmpty('fa-clock-rotate-left','No activity','No QuickBooks synchronization attempts are recorded.')}`;}}

async function linkWorkspacePayment(sourceType,entityId){const paymentId=document.getElementById(`qbMatch-${sourceType}-${entityId}`)?.value;if(!paymentId)return showNotification('Select a local payment','error');await resolveWorkspaceAction('link',{sourceType,entityId,paymentId},'Payment linked without creating a duplicate');}

async function importWorkspacePayment(sourceType,entityId){const tenantId=document.getElementById(`qbImport-${sourceType}-${entityId}`)?.value;if(!tenantId)return showNotification('Select a tenant','error');if(!confirm('Import this QuickBooks payment into the local ledger?'))return;await resolveWorkspaceAction('import',{sourceType,entityId,tenantId,applyTo:'rent'},'QuickBooks payment imported');}

async function resolveWorkspaceAction(action,body,message){try{const response=await fetch(`${API_URL}/properties/${state.currentProperty._id}/quickbooks/payment-workspace/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.message||'Unable to resolve payment');await loadPayments(state.currentProperty._id,true);showNotification(message,'success');}catch(error){showNotification(error.message,'error');}}

function updateWorkspaceCustomerDefault(tenantId){
  const select=document.getElementById(`qbCustomer-${tenantId}`),previous=select.value;
  const checked=[...document.querySelectorAll(`#qbCustomers-${tenantId} input:checked`)];
  select.innerHTML=checked.length ? checked.map(input=>`<option value="${escapeHtml(input.value)}">${escapeHtml(input.parentElement.textContent.trim())}</option>`).join('') : '<option value="">Not mapped</option>';
  if(checked.some(input=>input.value===previous))select.value=previous;
}

async function saveWorkspaceCustomer(tenantId){
  const propertyId=state.currentProperty?._id,button=document.getElementById(`qbSaveCustomer-${tenantId}`);if(button?.disabled)return;
  if(button){button.disabled=true;button.textContent='Saving…';}
  setQuickBooksProgress('payments','Saving customer mapping…');
  const customerId=document.getElementById(`qbCustomer-${tenantId}`)?.value||'';
  const customerIds=[...document.querySelectorAll(`#qbCustomers-${tenantId} input:checked`)].map(input=>input.value);
  let mappingSaved=false;
  try{
    const response=await fetch(`${API_URL}/properties/${propertyId}/quickbooks/customer-mapping/${tenantId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerId,customerIds})}),data=await response.json();
    if(!response.ok)throw new Error(data.message||'Unable to save customer mapping');mappingSaved=true;
    if(String(state.currentProperty?._id)!==String(propertyId))return;
    if(button)button.textContent='Preparing payments…';
    const workspace=await loadPaymentWorkspace(propertyId,true);
    if(!workspace)throw new Error('Mapping saved, but payments could not refresh. Use Retry in the payment section.');
    showNotification(customerIds.length?'Customers mapped. Payments updated.':'Mapping removed. Payments updated.','success');
  }catch(error){if(!mappingSaved)setQuickBooksProgress('payments',error.message,'error');showNotification(error.message,'error');}
  finally{if(button){button.disabled=false;button.textContent='Save';}}
}

async function retryWorkspacePayment(paymentId){await syncPaymentQuickBooks(paymentId);await loadPaymentWorkspace(state.currentProperty._id,true);}

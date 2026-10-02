// Property management: applications search.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Applications subtabs toggle (Applications vs Invites)
function initializeApplicationsSubtabs() {
    const buttons = document.querySelectorAll('.applications-tab-btn');
    const paneApps = document.getElementById('applicationsPane-applications');
    const paneInvites = document.getElementById('applicationsPane-invites');
    if (!buttons.length || !paneApps || !paneInvites) return;
    if (paneApps.dataset._subtabsInited === '1') return;
    paneApps.dataset._subtabsInited = '1';
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const sub = btn.getAttribute('data-subtab');
            if (sub === 'invites') {
                paneApps.style.display = 'none';
                paneInvites.style.display = 'block';
            } else {
                paneApps.style.display = 'block';
                paneInvites.style.display = 'none';
            }
        });
    });
}

// ===== Applications Search =====
function initializeApplicationsSearch() {
    const search = document.getElementById('applicationsSearchBar');
    if (!search) return;
    if (search.dataset._inited === '1') return;
    search.dataset._inited = '1';
    const debouncedRender = debounce(renderFilteredApplications, 180);
    search.addEventListener('input', ()=>{ positionApplicationsSearchSuggestions(); autoSuggestApplications(); showApplicationsSearchSuggestions(true); debouncedRender(); });
    search.addEventListener('change', ()=>{ positionApplicationsSearchSuggestions(); debouncedRender(); });
    search.addEventListener('focus', ()=>{ positionApplicationsSearchSuggestions(); showApplicationsSearchSuggestions(true); });
    search.addEventListener('blur', ()=> setTimeout(()=>showApplicationsSearchSuggestions(false), 120));
    const clr = document.getElementById('clearApplicationsFiltersBtn');
    if (clr) clr.onclick = ()=>{ search.value=''; window.__appsAccumulatedQuery=''; renderFilteredApplications(); showApplicationsSearchSuggestions(false); };
    const sug = document.getElementById('applicationsSearchSuggestions');
    if (sug) {
        renderApplicationsSuggestionTokens();
        sug.addEventListener('mousedown', (e)=>{
            const tokenEl = e.target.closest('.suggest-item');
            const valEl = e.target.closest('.suggest-value');
            e.preventDefault();
            if (tokenEl) {
                const token = tokenEl.getAttribute('data-token') || '';
                showApplicationsValueSuggestions(token);
            } else if (valEl) {
                const token = valEl.getAttribute('data-token') || '';
                const value = valEl.getAttribute('data-value') || '';
                const acc = (window.__appsAccumulatedQuery || '').trim();
                const sep = acc ? ' ' : '';
                window.__appsAccumulatedQuery = `${acc}${sep}${token}${value}`;
                const input = document.getElementById('applicationsSearchBar');
                if (input) input.value = '';
                renderFilteredApplications();
                showApplicationsSearchSuggestions(false);
            }
        });
        const backBtn = document.getElementById('applicationsSuggestBack');
        if (backBtn) backBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); renderApplicationsSuggestionTokens(); });
    }
}

function parseApplicationsSearch(queryStr) {
    const tokens = { nameList:[], emailList:[], phoneList:[], propertyList:[], unitList:[], statusList:[], movein:'', submitted:'', text:'' };
    const parts = (queryStr||'').trim().split(/\s+/).filter(Boolean);
    const rest = [];
    for (const part of parts) {
        const low = part.toLowerCase();
        const take = (pfx)=> part.slice(pfx.length);
        if (low.startsWith('name:')) tokens.nameList.push(...take('name:').split(',').filter(Boolean));
        else if (low.startsWith('email:')) tokens.emailList.push(...take('email:').split(',').filter(Boolean));
        else if (low.startsWith('phone:')) tokens.phoneList.push(...take('phone:').split(',').filter(Boolean));
        else if (low.startsWith('property:')) tokens.propertyList.push(...take('property:').split(',').filter(Boolean));
        else if (low.startsWith('unit:')) tokens.unitList.push(...take('unit:').split(',').filter(Boolean));
        else if (low.startsWith('status:')) tokens.statusList.push(...take('status:').split(',').filter(Boolean));
        else if (low.startsWith('movein:')) tokens.movein = take('movein:');
        else if (low.startsWith('submitted:')) tokens.submitted = take('submitted:');
        else rest.push(part);
    }
    const norm = (arr)=> Array.from(new Set(arr.map(v=>String(v).trim().toLowerCase()).filter(Boolean)));
    tokens.nameList = norm(tokens.nameList);
    tokens.emailList = norm(tokens.emailList);
    tokens.phoneList = norm(tokens.phoneList);
    tokens.propertyList = norm(tokens.propertyList);
    tokens.unitList = norm(tokens.unitList);
    tokens.statusList = norm(tokens.statusList);
    tokens.text = rest.join(' ').toLowerCase();
    return { tokens, text: tokens.text };
}

function getApplicationsSearch() {
    const input = document.getElementById('applicationsSearchBar');
    const current = input ? input.value : '';
    const combined = `${(window.__appsAccumulatedQuery||'').trim()} ${current.trim()}`.trim();
    const query = parseApplicationsSearch(combined);
    renderApplicationsFilterChips(query.tokens);
    return query;
}

function renderApplicationsFilterChips(tokens) {
    const container = document.getElementById('applicationsActiveFilterChips');
    if (!container) return;
    const mkChip = (k,v,disp)=>`<span class="filter-chip" data-key="${k}" data-value="${v}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef2f7;color:#374151;border:1px solid #e5e7eb;font-size:.9em;"><span style="color:#0b5cab;font-weight:600">${k}</span><span>${disp ?? v}</span><button class="chip-remove" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-weight:700;">×</button></span>`;
    const chips = [];
    tokens.nameList.forEach(v=>chips.push(mkChip('name:',v)));
    tokens.emailList.forEach(v=>chips.push(mkChip('email:',v)));
    tokens.phoneList.forEach(v=>chips.push(mkChip('phone:',v)));
    tokens.propertyList.forEach(v=>chips.push(mkChip('property:',v)));
    tokens.unitList.forEach(v=>chips.push(mkChip('unit:',v)));
    tokens.statusList.forEach(v=>chips.push(mkChip('status:',v)));
    if (tokens.movein) chips.push(mkChip('movein:', tokens.movein));
    if (tokens.submitted) chips.push(mkChip('submitted:', tokens.submitted));
    container.innerHTML = chips.join('');
    container.querySelectorAll('.chip-remove').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            const chip = e.target.closest('.filter-chip');
            removeApplicationsFilterToken(chip.getAttribute('data-key')||'', chip.getAttribute('data-value')||'');
        });
    });
}

function removeApplicationsFilterToken(key, value) {
    const input = document.getElementById('applicationsSearchBar');
    const combined = `${(window.__appsAccumulatedQuery||'').trim()} ${(input?.value||'').trim()}`.trim();
    const { tokens } = parseApplicationsSearch(combined);
    const rem = (arr)=>{ const i = arr.findIndex(v=>v===value.toLowerCase()); if(i>=0) arr.splice(i,1); };
    switch(key){
        case 'name:': rem(tokens.nameList); break;
        case 'email:': rem(tokens.emailList); break;
        case 'phone:': rem(tokens.phoneList); break;
        case 'property:': rem(tokens.propertyList); break;
        case 'unit:': rem(tokens.unitList); break;
        case 'status:': rem(tokens.statusList); break;
        case 'movein:': tokens.movein=''; break;
        case 'submitted:': tokens.submitted=''; break;
    }
    const parts=[];
    if (tokens.nameList.length) parts.push(`name:${tokens.nameList.join(',')}`);
    if (tokens.emailList.length) parts.push(`email:${tokens.emailList.join(',')}`);
    if (tokens.phoneList.length) parts.push(`phone:${tokens.phoneList.join(',')}`);
    if (tokens.propertyList.length) parts.push(`property:${tokens.propertyList.join(',')}`);
    if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
    if (tokens.statusList.length) parts.push(`status:${tokens.statusList.join(',')}`);
    if (tokens.movein) parts.push(`movein:${tokens.movein}`);
    if (tokens.submitted) parts.push(`submitted:${tokens.submitted}`);
    window.__appsAccumulatedQuery = parts.join(' ');
    if (input) input.value='';
    renderFilteredApplications();
}

function showApplicationsSearchSuggestions(show){
    const box = document.getElementById('applicationsSearchSuggestions');
    if (!box) return;
    if (show) renderApplicationsSuggestionTokens();
    box.style.display = show ? 'block' : 'none';
}

function positionApplicationsSearchSuggestions(){
    const bar = document.getElementById('applicationsFilterBar');
    const input = document.getElementById('applicationsSearchBar');
    const box = document.getElementById('applicationsSearchSuggestions');
    if (!bar || !input || !box) return;
    const barRect = bar.getBoundingClientRect();
    const inRect = input.getBoundingClientRect();
    box.style.left = `${inRect.left - barRect.left}px`;
    box.style.top = `${inRect.bottom - barRect.top + 6}px`;
    box.style.minWidth = `${Math.max(inRect.width, 320)}px`;
}

function renderApplicationsSuggestionTokens(){
    const list = document.getElementById('applicationsSuggestList');
    const title = document.getElementById('applicationsSuggestTitle');
    const values = document.getElementById('applicationsSuggestValues');
    const backBtn = document.getElementById('applicationsSuggestBack');
    if (!list) return;
    const tokens = ['name:','email:','phone:','property:','unit:','status:','movein:','submitted:'];
    list.innerHTML = tokens.map(k=>`<li class='suggest-item' data-token='${k}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${k}</span><span style='font-size:.85em;color:#6b7280'>Add ${k} filter</span></li>`).join('');
    if (title) title.textContent = 'Choose a filter';
    if (backBtn) backBtn.style.display='none';
    if (values) { values.style.display='none'; values.innerHTML=''; }
    list.style.display='block';
}

function showApplicationsValueSuggestions(token){
    const list = document.getElementById('applicationsSuggestList');
    const values = document.getElementById('applicationsSuggestValues');
    const title = document.getElementById('applicationsSuggestTitle');
    const backBtn = document.getElementById('applicationsSuggestBack');
    if (!list || !values || !title) return;
    let items=[];
    if (token==='property:') {
        // For application property filters, suggest values based on the
        // actual address text shown in the Property column so users can
        // search by what they see, not internal names.
        const rows = Array.from(document.querySelectorAll('#applicationsTable tbody tr'));
        const seen = new Set();
        items = rows.map(r => {
            const label = (r.children[3]?.textContent || '').trim();
            const value = (r.dataset.property || '').toLowerCase();
            return { label, value };
        }).filter(it => {
            if (!it.label || !it.value) return false;
            if (seen.has(it.value)) return false;
            seen.add(it.value);
            return true;
        });
    }
    else if (token==='unit:') items = (state.units||[]).map(u=>({label:`${u.number}`, value:String(u.number).toLowerCase()}));
    else if (token==='status:') items = ['pending','approved','rejected'].map(v=>({label:v,value:v}));
    else if (token==='movein:' || token==='submitted:') {
        const now = new Date();
        items = Array.from({length:6},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-i,1); const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return {label:m,value:m}; });
    } else if (token==='name:' || token==='email:' || token==='phone:') {
        items = (state.applications||[]).slice(0,10).map(a=>({label: a.name||a.email||a.phone||'', value: (a.name||a.email||a.phone||'').toLowerCase()}));
    }
    title.textContent = `Choose a value for ${token}`;
    if (backBtn) backBtn.style.display='inline';
    list.style.display='none';
    values.innerHTML = items.map(it=>`<li class='suggest-value' data-token='${token}' data-value='${it.value}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${it.label}</span></li>`).join('');
    values.style.display = items.length ? 'block' : 'none';
}

function autoSuggestApplications(){
    const input = document.getElementById('applicationsSearchBar');
    const val = (input?.value||'').trim();
    const m = val.match(/(name:|email:|phone:|property:|unit:|status:|movein:|submitted:)([^\s]*)$/i);
    if (!m) { renderApplicationsSuggestionTokens(); return; }
    const token = m[1].toLowerCase();
    const partial = (m[2]||'').toLowerCase();
    showApplicationsValueSuggestions(token);
    const values = document.getElementById('applicationsSuggestValues');
    if (values && partial) Array.from(values.querySelectorAll('.suggest-value')).forEach(li=>{ const v=(li.getAttribute('data-value')||'').toLowerCase(); li.style.display = v.includes(partial) ? 'flex' : 'none'; });
}

function normalizePropertyFilterText(value) {
    return String(value || '')
        .replace(/<br\s*\/?/gi, ' ')
        .replace(/>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function getCurrentPropertyFilterTerms() {
    if (!state.currentProperty) return [];
    const property = state.currentProperty;
    const address = property.address || {};
    const line1 = address.line1 || address.addressLine1 || '';
    const line2 = address.line2 || address.addressLine2 || '';
    const city = address.city || '';
    const stateCode = address.state || '';
    const zip = address.zip || '';
    const values = [
        property.name,
        line1,
        [line1, line2].filter(Boolean).join(' '),
        [line1, city, stateCode, zip].filter(Boolean).join(' '),
        [line1, line2, city, stateCode, zip].filter(Boolean).join(' '),
        [line1, city, stateCode, zip].filter(Boolean).join(', '),
        [line1, line2, city, stateCode, zip].filter(Boolean).join(', ')
    ];
    return Array.from(new Set(values.map(normalizePropertyFilterText).filter(Boolean)));
}

function matchesSelectedProperty(rawPropertyValue) {
    const terms = getCurrentPropertyFilterTerms();
    if (!terms.length) return true;
    const haystack = normalizePropertyFilterText(rawPropertyValue);
    if (!haystack) return false;
    return terms.some(term => haystack.includes(term) || term.includes(haystack));
}

function getFilteredApplicationsList() {
    const { tokens, text } = getApplicationsSearch();
    return (state.applications||[]).filter(a=>{
        const nm = (a.name||'').toLowerCase();
        const em = (a.email||'').toLowerCase();
        const ph = (a.phone||'').toLowerCase();
        let propertyName=''; let unitNumber = a.unit || '';
        if (a.notes) { try { const n=JSON.parse(a.notes); propertyName = (n.propertyAddress||'').toLowerCase(); unitNumber = (n.unitNumber||unitNumber); } catch{} }
        const un = String(unitNumber||'').toLowerCase();
        const st = (a.status||'').toLowerCase();
        const mv = (a.moveIn||'');
        const sb = (a.submitted||'');
        const hitText = !text || nm.includes(text) || em.includes(text) || ph.includes(text) || un.includes(text) || propertyName.includes(text);
        const hitName = !tokens.nameList.length || tokens.nameList.some(v=>nm.includes(v));
        const hitEmail = !tokens.emailList.length || tokens.emailList.some(v=>em.includes(v));
        const hitPhone = !tokens.phoneList.length || tokens.phoneList.some(v=>ph.includes(v));
        const hitProp = !tokens.propertyList.length || tokens.propertyList.some(v=>propertyName.includes(v));
        const hitUnit = !tokens.unitList.length || tokens.unitList.some(v=>un.includes(v));
        const hitStatus = !tokens.statusList.length || tokens.statusList.includes(st);
        const hitMoveIn = !tokens.movein || String(mv).startsWith(tokens.movein);
        const hitSubmitted = !tokens.submitted || String(sb).startsWith(tokens.submitted);
        const hitCurrentProperty = matchesSelectedProperty(propertyName);
        return hitCurrentProperty && hitText && hitName && hitEmail && hitPhone && hitProp && hitUnit && hitStatus && hitMoveIn && hitSubmitted;
    });
}

function renderFilteredApplications(){
    const items = getFilteredApplicationsList();
    renderApplications(items);
}

// ===== Invites Search =====
function initializeInvitesSearch() {
    const search = document.getElementById('invitesSearchBar');
    if (!search) return;
    if (search.dataset._inited === '1') return;
    search.dataset._inited = '1';
    const debouncedRender = debounce(renderFilteredInvites, 180);
    search.addEventListener('input', ()=>{ positionInvitesSearchSuggestions(); autoSuggestInvites(); showInvitesSearchSuggestions(true); debouncedRender(); });
    search.addEventListener('change', ()=>{ positionInvitesSearchSuggestions(); debouncedRender(); });
    search.addEventListener('focus', ()=>{ positionInvitesSearchSuggestions(); showInvitesSearchSuggestions(true); });
    search.addEventListener('blur', ()=> setTimeout(()=>showInvitesSearchSuggestions(false), 120));
    const clr = document.getElementById('clearInvitesFiltersBtn');
    if (clr) clr.onclick = ()=>{ search.value=''; window.__invAccumulatedQuery=''; renderFilteredInvites(); showInvitesSearchSuggestions(false); };
    const sug = document.getElementById('invitesSearchSuggestions');
    if (sug) {
        renderInvitesSuggestionTokens();
        sug.addEventListener('mousedown', (e)=>{
            const tokenEl = e.target.closest('.suggest-item');
            const valEl = e.target.closest('.suggest-value');
            e.preventDefault();
            if (tokenEl) {
                const token = tokenEl.getAttribute('data-token') || '';
                showInvitesValueSuggestions(token);
            } else if (valEl) {
                const token = valEl.getAttribute('data-token') || '';
                const value = valEl.getAttribute('data-value') || '';
                const acc = (window.__invAccumulatedQuery || '').trim();
                const sep = acc ? ' ' : '';
                window.__invAccumulatedQuery = `${acc}${sep}${token}${value}`;
                const input = document.getElementById('invitesSearchBar');
                if (input) input.value = '';
                renderFilteredInvites();
                showInvitesSearchSuggestions(false);
            }
        });
        const backBtn = document.getElementById('invitesSuggestBack');
        if (backBtn) backBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); renderInvitesSuggestionTokens(); });
    }
}

function parseInvitesSearch(queryStr) {
    const tokens = { nameList:[], emailList:[], propertyList:[], unitList:[], statusList:[], sent:'', opened:'', openedcount:'', text:'' };
    const parts = (queryStr||'').trim().split(/\s+/).filter(Boolean);
    const rest = [];
    for (const part of parts) {
        const low = part.toLowerCase();
        const take=(p)=>part.slice(p.length);
        if (low.startsWith('name:')) tokens.nameList.push(...take('name:').split(',').filter(Boolean));
        else if (low.startsWith('email:')) tokens.emailList.push(...take('email:').split(',').filter(Boolean));
        else if (low.startsWith('property:')) tokens.propertyList.push(...take('property:').split(',').filter(Boolean));
        else if (low.startsWith('unit:')) tokens.unitList.push(...take('unit:').split(',').filter(Boolean));
        else if (low.startsWith('status:')) tokens.statusList.push(...take('status:').split(',').filter(Boolean));
        else if (low.startsWith('sent:')) tokens.sent = take('sent:');
        else if (low.startsWith('opened:')) tokens.opened = take('opened:');
        else if (low.startsWith('openedcount:')) tokens.openedcount = take('openedcount:');
        else rest.push(part);
    }
    const norm=(arr)=>Array.from(new Set(arr.map(v=>String(v).trim().toLowerCase()).filter(Boolean)));
    tokens.nameList = norm(tokens.nameList);
    tokens.emailList = norm(tokens.emailList);
    tokens.propertyList = norm(tokens.propertyList);
    tokens.unitList = norm(tokens.unitList);
    tokens.statusList = norm(tokens.statusList);
    tokens.text = rest.join(' ').toLowerCase();
    return { tokens, text: tokens.text };
}

function getInvitesSearch(){
    const input = document.getElementById('invitesSearchBar');
    const current = input ? input.value : '';
    const combined = `${(window.__invAccumulatedQuery||'').trim()} ${current.trim()}`.trim();
    const query = parseInvitesSearch(combined);
    renderInvitesFilterChips(query.tokens);
    return query;
}

function renderInvitesFilterChips(tokens){
    const container = document.getElementById('invitesActiveFilterChips');
    if (!container) return;
    const mkChip = (k,v,disp)=>`<span class="filter-chip" data-key="${k}" data-value="${v}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef2f7;color:#374151;border:1px solid #e5e7eb;font-size:.9em;"><span style=\"color:#0b5cab;font-weight:600\">${k}</span><span>${disp ?? v}</span><button class="chip-remove" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-weight:700;">×</button></span>`;
    const chips=[];
    tokens.nameList.forEach(v=>chips.push(mkChip('name:',v)));
    tokens.emailList.forEach(v=>chips.push(mkChip('email:',v)));
    tokens.propertyList.forEach(v=>chips.push(mkChip('property:',v)));
    tokens.unitList.forEach(v=>chips.push(mkChip('unit:',v)));
    tokens.statusList.forEach(v=>chips.push(mkChip('status:',v)));
    if (tokens.sent) chips.push(mkChip('sent:', tokens.sent));
    if (tokens.opened) chips.push(mkChip('opened:', tokens.opened));
    if (tokens.openedcount) chips.push(mkChip('openedcount:', tokens.openedcount));
    container.innerHTML = chips.join('');
    container.querySelectorAll('.chip-remove').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            const chip = e.target.closest('.filter-chip');
            removeInvitesFilterToken(chip.getAttribute('data-key')||'', chip.getAttribute('data-value')||'');
        });
    });
}

function removeInvitesFilterToken(key, value){
    const input = document.getElementById('invitesSearchBar');
    const combined = `${(window.__invAccumulatedQuery||'').trim()} ${(input?.value||'').trim()}`.trim();
    const { tokens } = parseInvitesSearch(combined);
    const rem=(arr)=>{ const i=arr.findIndex(v=>v===value.toLowerCase()); if(i>=0) arr.splice(i,1); };
    switch(key){
        case 'name:': rem(tokens.nameList); break;
        case 'email:': rem(tokens.emailList); break;
        case 'property:': rem(tokens.propertyList); break;
        case 'unit:': rem(tokens.unitList); break;
        case 'status:': rem(tokens.statusList); break;
        case 'sent:': tokens.sent=''; break;
        case 'opened:': tokens.opened=''; break;
        case 'openedcount:': tokens.openedcount=''; break;
    }
    const parts=[];
    if (tokens.nameList.length) parts.push(`name:${tokens.nameList.join(',')}`);
    if (tokens.emailList.length) parts.push(`email:${tokens.emailList.join(',')}`);
    if (tokens.propertyList.length) parts.push(`property:${tokens.propertyList.join(',')}`);
    if (tokens.unitList.length) parts.push(`unit:${tokens.unitList.join(',')}`);
    if (tokens.statusList.length) parts.push(`status:${tokens.statusList.join(',')}`);
    if (tokens.sent) parts.push(`sent:${tokens.sent}`);
    if (tokens.opened) parts.push(`opened:${tokens.opened}`);
    if (tokens.openedcount) parts.push(`openedcount:${tokens.openedcount}`);
    window.__invAccumulatedQuery = parts.join(' ');
    if (input) input.value='';
    renderFilteredInvites();
}

function showInvitesSearchSuggestions(show){
    const box = document.getElementById('invitesSearchSuggestions');
    if (!box) return;
    if (show) renderInvitesSuggestionTokens();
    box.style.display = show ? 'block' : 'none';
}

function positionInvitesSearchSuggestions(){
    const bar = document.getElementById('invitesFilterBar');
    const input = document.getElementById('invitesSearchBar');
    const box = document.getElementById('invitesSearchSuggestions');
    if (!bar || !input || !box) return;
    const barRect = bar.getBoundingClientRect();
    const inRect = input.getBoundingClientRect();
    box.style.left = `${inRect.left - barRect.left}px`;
    box.style.top = `${inRect.bottom - barRect.top + 6}px`;
    box.style.minWidth = `${Math.max(inRect.width, 320)}px`;
}

function renderInvitesSuggestionTokens(){
    const list = document.getElementById('invitesSuggestList');
    const title = document.getElementById('invitesSuggestTitle');
    const values = document.getElementById('invitesSuggestValues');
    const backBtn = document.getElementById('invitesSuggestBack');
    if (!list) return;
    const tokens = ['name:','email:','property:','unit:','status:','sent:','opened:','openedcount:'];
    list.innerHTML = tokens.map(k=>`<li class='suggest-item' data-token='${k}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${k}</span><span style='font-size:.85em;color:#6b7280'>Add ${k} filter</span></li>`).join('');
    if (title) title.textContent='Choose a filter';
    if (backBtn) backBtn.style.display='none';
    if (values) { values.style.display='none'; values.innerHTML=''; }
    list.style.display='block';
}

function showInvitesValueSuggestions(token){
    const list = document.getElementById('invitesSuggestList');
    const values = document.getElementById('invitesSuggestValues');
    const title = document.getElementById('invitesSuggestTitle');
    const backBtn = document.getElementById('invitesSuggestBack');
    if (!list || !values || !title) return;
    let items=[];
    if (token==='property:') {
        // For invite property filters, base suggestions on the Property
        // column text in the invites table (typically an address) so
        // the search aligns with what users see there.
        const rows = Array.from(document.querySelectorAll('#invitesTable tbody tr'));
        const seen = new Set();
        items = rows.map(r => {
            const label = (r.children[3]?.textContent || '').trim();
            const value = (r.dataset.property || '').toLowerCase();
            return { label, value };
        }).filter(it => {
            if (!it.label || !it.value) return false;
            if (seen.has(it.value)) return false;
            seen.add(it.value);
            return true;
        });
    }
    else if (token==='unit:') items = (state.units||[]).map(u=>({label:`${u.number}`, value:String(u.number).toLowerCase()}));
    else if (token==='status:') items = ['sent','opened','bounced','failed'].map(v=>({label:v,value:v}));
    else if (token==='sent:' || token==='opened:') {
        const now=new Date();
        items = Array.from({length:6},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-i,1); const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return {label:m,value:m}; });
    } else if (token==='openedcount:') {
        items = ['=0','>0','>=2','>=5'].map(v=>({label:v,value:v}));
    } else if (token==='name:' || token==='email:') {
        items = (state.invites||[]).slice(0,10).map(i=>({label:i.name||i.email||'', value:(i.name||i.email||'').toLowerCase()}));
    }
    title.textContent = `Choose a value for ${token}`;
    if (backBtn) backBtn.style.display='inline';
    list.style.display='none';
    values.innerHTML = items.map(it=>`<li class='suggest-value' data-token='${token}' data-value='${it.value}' style='padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;'><span style='font-weight:600;color:#1f2937'>${it.label}</span></li>`).join('');
    values.style.display = items.length ? 'block' : 'none';
}

function autoSuggestInvites(){
    const input = document.getElementById('invitesSearchBar');
    const val = (input?.value||'').trim();
    const m = val.match(/(name:|email:|property:|unit:|status:|sent:|opened:|openedcount:)([^\s]*)$/i);
    if (!m) { renderInvitesSuggestionTokens(); return; }
    const token = m[1].toLowerCase();
    const partial = (m[2]||'').toLowerCase();
    showInvitesValueSuggestions(token);
    const values = document.getElementById('invitesSuggestValues');
    if (values && partial) Array.from(values.querySelectorAll('.suggest-value')).forEach(li=>{ const v=(li.getAttribute('data-value')||'').toLowerCase(); li.style.display = v.includes(partial) ? 'flex' : 'none'; });
}

function renderFilteredInvites(){
    const { tokens, text } = getInvitesSearch();
    const items = (state.invites||[]).filter(inv=>{
        const nm = (inv.name||'').toLowerCase();
        const em = (inv.email||'').toLowerCase();
        const prop = (inv.propertyName||'').toLowerCase();
        const invitePropertyId = inv.propertyId && typeof inv.propertyId === 'object'
            ? String(inv.propertyId._id || inv.propertyId)
            : String(inv.propertyId || '');
        const un = String(inv.unitNumber||'').toLowerCase();
        const st = (inv.status||'').toLowerCase();
        const sent = String(inv.sentAt||'');
        const opened = String(inv.openedAt||'');
        const oc = Number.isFinite(inv.openCount) ? Number(inv.openCount) : 0;
        const hitText = !text || nm.includes(text) || em.includes(text) || prop.includes(text) || un.includes(text);
        const hitName = !tokens.nameList.length || tokens.nameList.some(v=>nm.includes(v));
        const hitEmail = !tokens.emailList.length || tokens.emailList.some(v=>em.includes(v));
        const hitProp = !tokens.propertyList.length || tokens.propertyList.some(v=>prop.includes(v));
        const hitUnit = !tokens.unitList.length || tokens.unitList.some(v=>un.includes(v));
        const hitStatus = !tokens.statusList.length || tokens.statusList.includes(st);
        const hitSent = !tokens.sent || sent.startsWith(tokens.sent);
        const hitOpened = !tokens.opened || opened.startsWith(tokens.opened);
        let hitOpenCount = true;
        if (tokens.openedcount) {
            const m = tokens.openedcount.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
            if (m) {
                const op = m[1] || '='; const val = Number(m[2]);
                if (op==='>') hitOpenCount = oc > val; else if (op==='>=') hitOpenCount = oc >= val; else if (op==='<') hitOpenCount = oc < val; else if (op==='<=') hitOpenCount = oc <= val; else hitOpenCount = oc === val;
            }
        }
        const hitCurrentProperty = state.currentProperty?._id
            ? (invitePropertyId && invitePropertyId === String(state.currentProperty._id)) || matchesSelectedProperty(prop)
            : true;
        return hitCurrentProperty && hitText && hitName && hitEmail && hitProp && hitUnit && hitStatus && hitSent && hitOpened && hitOpenCount;
    });
    renderInvites(items);
}

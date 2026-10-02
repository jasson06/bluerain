// Property management: property profile.
// Classic script: declarations share the page scope; startup runs in property-management.js.

function profileValue(value, type) {
    if (value === undefined || value === null || value === '') return 'Not provided';
    if (type === 'money') return `$${Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:2})}`;
    if (type === 'percent') return `${Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:2})}%`;
    return escapeHtml(String(value));
}

function renderPropertyProfile() {
    const root = document.getElementById('propertyProfileView');
    if (!root || !state.currentProperty) return;
    const p = state.currentProperty.propertyProfile || {};
    const groups = [
      ['Building', propertyProfileFields.slice(0,10)],
      ['Ownership & management', propertyProfileFields.slice(10,18)],
      ['Finance & insurance', propertyProfileFields.slice(18,29)],
            ['Operating expense assumptions', propertyProfileFields.slice(29,34)],
            ['Utility expense assumptions', propertyProfileFields.slice(34,39)],
            ['Compliance, systems & safety', propertyProfileFields.slice(39)]
    ];
    const address = state.currentProperty.address || {};
    root.innerHTML = `<div class="property-info-grid">
      <section class="property-info-card"><h3><i class="fas fa-map-marker-alt"></i> Identity & address</h3>
        <div class="property-field"><span>Name</span><span>${escapeHtml(state.currentProperty.name || 'Not provided')}</span></div>
        <div class="property-field"><span>Code</span><span>${escapeHtml(state.currentProperty.code || 'Not provided')}</span></div>
        <div class="property-field"><span>Address</span><span>${escapeHtml([address.addressLine1,address.addressLine2,address.city,address.state,address.zip].filter(Boolean).join(', ') || 'Not provided')}</span></div>
      </section>
      ${groups.map(([title,fields])=>`<section class="property-info-card"><h3>${title}</h3>${fields.map(([key,label,type])=>`<div class="property-field"><span>${label}</span><span>${profileValue(p[key],type)}</span></div>`).join('')}</section>`).join('')}
    </div>`;
    loadQuickBooksStatus();
}

function openPropertyProfileEditor() {
    if (!state.currentProperty) return;
    const p = state.currentProperty.propertyProfile || {};
    propertyProfileFields.forEach(([key]) => { const el=document.getElementById(`pp_${key}`); if(el) el.value=p[key] ?? ''; });
    if (!document.getElementById('pp_managementFeeRate')?.value) document.getElementById('pp_managementFeeRate').value = '3';
    if (!document.getElementById('pp_vacancyLossRate')?.value) document.getElementById('pp_vacancyLossRate').value = '3';
    openModal('propertyProfileModal');
}

async function savePropertyProfile(event) {
    event.preventDefault();
    if (!state.currentProperty) return;
    const numeric = new Set(['yearBuilt','yearRenovated','buildingCount','floorCount','rentableSqft','purchasePrice','estimatedValue','loanBalance','monthlyDebt','annualPropertyTax','annualOperatingBudget','insurancePremium','contractServicesMonthly','payrollMonthly','managementFeeRate','vacancyLossRate','administrativeMonthly','electricalMonthly','waterMonthly','trashSewerMonthly','gasMonthly','internetMonthly']);
    const propertyProfile = {};
    propertyProfileFields.forEach(([key]) => { const el=document.getElementById(`pp_${key}`); if(!el)return; propertyProfile[key]=numeric.has(key) ? (el.value === '' ? null : Number(el.value)) : el.value.trim(); });
    showLoader();
    try {
      const response=await fetch(`${API_URL}/properties/${state.currentProperty._id}/profile`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyProfile,buildingEquipment:state.currentProperty.buildingEquipment||[]})});
      if(!response.ok) throw new Error((await response.json().catch(()=>({}))).message || 'Unable to save property');
      const data=await response.json();
      state.currentProperty=data.property;
      const index=state.properties.findIndex(item=>String(item._id)===String(data.property._id)); if(index>=0) state.properties[index]=data.property;
      renderPropertyProfile(); renderPropertyOverview(); closeModal('propertyProfileModal'); showNotification('Property information updated','success');
    } catch(error) { showNotification(error.message,'error'); } finally { hideLoader(); }
}

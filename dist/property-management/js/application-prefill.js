// Property management: application prefill.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Helper function to determine file icon
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'pdf': return 'pdf';
        case 'doc':
        case 'docx': return 'word';
        case 'jpg':
        case 'jpeg':
        case 'png': return 'image';
        default: return 'alt';
    }
}

// Prefill tenant modal fields based on an approved application
function prefillTenantFromApplication(app) {
    try {
        resetTenantForm();
        populateUnitSelect();

        const nameEl = document.getElementById('tenantName');
        const phoneEl = document.getElementById('tenantPhone');
        const emailEl = document.getElementById('tenantEmail');
        const unitEl = document.getElementById('tenantUnit');
        const leaseStartEl = document.getElementById('leaseStart');

        if (nameEl) nameEl.value = app.name || '';
        if (phoneEl) phoneEl.value = app.phone || '';
        if (emailEl) emailEl.value = app.email || '';

        if (leaseStartEl && app.moveIn) {
            const d = new Date(app.moveIn);
            if (!isNaN(d.getTime())) {
                leaseStartEl.value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
            }
        }

        if (unitEl && app.unit && Array.isArray(state.units)) {
            const match = state.units.find(u => String(u.number) === String(app.unit) && u.status === 'vacant');
            if (match) unitEl.value = match._id;
        }

        // Decode notes JSON (if provided) and prefill extended fields: pets, cars, emergency contact, lease holders, occupants
        if (app.notes) {
            try {
                const raw = decodeURIComponent(app.notes);
                const n = JSON.parse(raw) || {};

                // Normalize application JSON (flat keys) into tenant schema shape
                const norm = {
                    emergencyContact: n.emergencyContact || {
                        name: n.emName || '',
                        phone: n.emPhone || '',
                        email: n.emEmail || '',
                        address: n.emAddress || '',
                        relation: n.emRel || ''
                    },
                    leaseHolders: Array.isArray(n.leaseHolders) ? n.leaseHolders : (()=>{
                        const full = [n.caFirst, n.caMiddle, n.caLast].filter(Boolean).join(' ').trim();
                        const email = n.caEmail || '';
                        const phone = n.caPhone || '';
                        return full || email || phone ? [{ name: full, email, phone }] : [];
                    })(),
                    authorizedOccupants: (()=>{
                        const names = [];
                        for (let i=1;i<=5;i++){
                            const nm = n[`occ${i}Name`];
                            if (nm && String(nm).trim()) names.push(String(nm).trim());
                        }
                        return names;
                    })(),
                    pets: (()=>{
                        const details = [];
                        for (let i=1;i<=3;i++){
                            const type = n[`pet${i}Type`];
                            const weight = n[`pet${i}Weight`];
                            const age = n[`pet${i}Age`];
                            const vaccinated = n[`pet${i}Vaccinated`];
                            if ((type && String(type).trim()) || (weight && String(weight).trim()) || (age && String(age).trim()) || (vaccinated && String(vaccinated).trim())){
                                details.push({
                                    type: type || '',
                                    name: '',
                                    breed: '',
                                    weight: weight || '',
                                    age: age || '',
                                    gender: '',
                                    vaccination: vaccinated || ''
                                });
                            }
                        }
                        return {
                            hasPets: details.length > 0,
                            count: details.length,
                            fee: 0,
                            nonRefundableFee: 0,
                            monthlyRent: 0,
                            depositIncrease: 0,
                            details
                        };
                    })(),
                    cars: (()=>{
                        const details = [];
                        const addCar = (mm, year, plate) => {
                            if (!mm && !year && !plate) return;
                            details.push({
                                make: mm || '',
                                model: '',
                                color: '',
                                licensePlate: plate || '',
                                year: year || ''
                            });
                        };
                        addCar(n.veh1MakeModel, n.veh1Year, n.veh1Plate);
                        addCar(n.veh2MakeModel, n.veh2Year, n.veh2Plate);
                        let count = parseInt(n.vehCount, 10);
                        if (!Number.isFinite(count) || count <= 0) count = details.length;
                        return {
                            hasCar: details.length > 0,
                            count,
                            details
                        };
                    })()
                };

                // Emergency Contact
                const ecName = document.getElementById('emergencyContactName');
            const ecPhone = document.getElementById('emergencyContactPhone');
            const ecEmail = document.getElementById('emergencyContactEmail');
            const ecAddress = document.getElementById('emergencyContactAddress');
            const ecRelation = document.getElementById('emergencyContactRelation');
                if (ecName) ecName.value = norm.emergencyContact.name || '';
                if (ecPhone) ecPhone.value = norm.emergencyContact.phone || '';
                if (ecEmail) ecEmail.value = norm.emergencyContact.email || '';
                if (ecAddress) ecAddress.value = norm.emergencyContact.address || '';
                if (ecRelation) ecRelation.value = norm.emergencyContact.relation || '';

                // Lease Holders (co-applicants)
                if (Array.isArray(norm.leaseHolders) && norm.leaseHolders.length) {
                    populateLeaseHolders(norm.leaseHolders);
                }

                // Authorized Occupants
                const occ = Array.isArray(norm.authorizedOccupants) ? norm.authorizedOccupants : [];
                if (occ.length) {
                    const ta = document.getElementById('authorizedOccupants');
                    if (ta) ta.value = occ.join('\n');
                }

                // Pets
                if (norm.pets && (norm.pets.hasPets || (Array.isArray(norm.pets.details) && norm.pets.details.length > 0))) {
                    const hasPetsEl = document.getElementById('hasPets');
                    if (hasPetsEl) {
                        hasPetsEl.checked = !!norm.pets.hasPets || (Array.isArray(norm.pets.details) && norm.pets.details.length > 0);
                        document.getElementById('petDetails').style.display = hasPetsEl.checked ? 'block' : 'none';
                    }
                    if (typeof norm.pets.count === 'number') {
                        const petCountEl = document.getElementById('petCount');
                        if (petCountEl) petCountEl.value = String(norm.pets.count);
                        updatePetFields();
                    } else {
                        updatePetFields();
                    }
                    // Fees
                    const petNRF = document.getElementById('petNonRefundableFee');
                    const petMR = document.getElementById('petMonthlyRent');
                    const petDI = document.getElementById('petDepositIncrease');
                    if (petNRF && typeof norm.pets.nonRefundableFee === 'number') petNRF.value = String(norm.pets.nonRefundableFee);
                    if (petMR && typeof norm.pets.monthlyRent === 'number') petMR.value = String(norm.pets.monthlyRent);
                    if (petDI && typeof norm.pets.depositIncrease === 'number') petDI.value = String(norm.pets.depositIncrease);
                    // Details per pet
                    if (Array.isArray(norm.pets.details)) {
                        // Ensure petCount matches
                        const countEl = document.getElementById('petCount');
                        if (countEl) {
                            countEl.value = String(norm.pets.details.length);
                            updatePetFields();
                        }
                        norm.pets.details.forEach((pd, i) => {
                            const pt = document.querySelector(`.pet-type[data-index="${i}"]`);
                            const pn = document.querySelector(`.pet-name[data-index="${i}"]`);
                            const pb = document.querySelector(`.pet-breed[data-index="${i}"]`);
                            const pw = document.querySelector(`.pet-weight[data-index="${i}"]`);
                            const pa = document.querySelector(`.pet-age[data-index="${i}"]`);
                            const gSel = document.querySelector(`.pet-gender[data-index="${i}"]`);
                            const pv = document.querySelector(`.pet-vaccination[data-index="${i}"]`);
                            if (pt) pt.value = pd.type || '';
                            if (pn) pn.value = pd.name || '';
                            if (pb) pb.value = pd.breed || '';
                            if (pw) pw.value = pd.weight || '';
                            if (pa) pa.value = pd.age || '';
                            if (gSel && pd.gender) gSel.value = pd.gender;
                            if (pv) pv.value = pd.vaccination || '';
                        });
                    }
                }

                // Vehicles
                if (norm.cars && (norm.cars.hasCar || (Array.isArray(norm.cars.details) && norm.cars.details.length > 0))) {
                    const hasCarEl = document.getElementById('hasCar');
                    if (hasCarEl) {
                        hasCarEl.checked = !!norm.cars.hasCar || (Array.isArray(norm.cars.details) && norm.cars.details.length > 0);
                        document.getElementById('carDetails').style.display = hasCarEl.checked ? 'block' : 'none';
                    }
                    const carCountEl = document.getElementById('carCount');
                    if (Array.isArray(norm.cars.details)) {
                        if (carCountEl) {
                            carCountEl.value = String(norm.cars.details.length);
                            updateCarFields();
                        }
                        norm.cars.details.forEach((cd, i) => {
                            const cm = document.querySelector(`.car-make[data-index="${i}"]`);
                            const cmo = document.querySelector(`.car-model[data-index="${i}"]`);
                            const cc = document.querySelector(`.car-color[data-index="${i}"]`);
                            const cp = document.querySelector(`.car-plate[data-index="${i}"]`);
                            const cy = document.querySelector(`.car-year[data-index="${i}"]`);
                            if (cm) cm.value = cd.make || '';
                            if (cmo) cmo.value = cd.model || '';
                            if (cc) cc.value = cd.color || '';
                            if (cp) cp.value = cd.licensePlate || '';
                            if (cy) cy.value = cd.year || '';
                        });
                    }
                }
            } catch (e) {
                console.warn('Unable to parse application notes for prefill:', e?.message || e);
            }
        }

        // Focus for quick confirmation/edit
        nameEl?.focus();
    } catch (e) {
        console.warn('Unable to prefill tenant from application:', e?.message || e);
    }
}

// Document utility functions
async function viewDocument(documentId) {
    try {
        if (!state.currentProperty) {
            showNotification('Please select a property first', 'error');
            return;
        }

        const docFile = state.documents.find(d => d._id === documentId);
        if (!docFile) {
            throw new Error('Document not found in state');
        }

        const url = `${API_URL}/properties/${state.currentProperty._id}/documents/${documentId}/view`;
        window.open(url, '_blank', 'noopener');
    } catch (error) {
        console.error('Error viewing document:', error);
        showNotification('Error viewing document', 'error');
    }
}

async function downloadDocument(docId) {
    showLoader();
    try {
        const doc = state.documents.find(d => d._id === docId);
        if (!doc) throw new Error('Document not found');

        // Construct the download URL (use the /view endpoint for inline, or create a /download endpoint for attachment)
        const url = `${API_URL}/properties/${state.currentProperty._id}/documents/${docId}/download`;

        // Fetch the file as a blob
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download document');

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('Error downloading document:', error);
        showNotification('Error downloading document', 'error');
           } finally {
        hideLoader(); 
    }
}

function closeDocumentMenu(trigger) {
    const menu = trigger?.closest('.document-menu');
    if (menu) menu.removeAttribute('open');
}

async function renameDocument(docId) {
    const doc = (state.documents || []).find(d => d._id === docId);
    if (!doc || !state.currentProperty?._id) {
        showNotification('Document not found', 'error');
        return;
    }

    const nextName = window.prompt('Rename document', doc.name || '');
    if (nextName === null) return;

    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === doc.name) return;

    showLoader();
    try {
        const response = await fetch(`${API_URL}/properties/${state.currentProperty._id}/documents/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: trimmedName })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to rename document');
        }

        const updatedDocument = await response.json();
        state.documents = (state.documents || []).map(item => item._id === updatedDocument._id ? updatedDocument : item);
        renderDocuments();
        showNotification('Document renamed successfully', 'success');
    } catch (error) {
        console.error('Error renaming document:', error);
        showNotification(error.message || 'Error renaming document', 'error');
    } finally {
        hideLoader();
    }
}

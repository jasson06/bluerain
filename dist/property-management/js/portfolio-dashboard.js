// Property management: portfolio dashboard.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Load all payments across all properties for portfolio-wide rent metrics
async function loadPortfolioPayments(force = false) {
    if (!force && Array.isArray(state.portfolioPayments) && state.portfolioPayments.length) {
        return state.portfolioPayments;
    }
    if (!Array.isArray(state.properties) || !state.properties.length) {
        state.portfolioPayments = [];
        return [];
    }

    if (!Array.isArray(state.allUnits) || !state.allUnits.length || !Array.isArray(state.allTenants) || !state.allTenants.length) {
        try {
            await loadAllUnitsAndTenants();
        } catch (e) {
            console.warn('Error loading units/tenants for portfolio payments:', e);
        }
    }

    const allUnits = state.allUnits || [];
    const allTenants = state.allTenants || [];

    const perPropertyArrays = await Promise.all(
        state.properties.map(async (property) => {
            try {
                const [localRes, quickBooksRes] = await Promise.all([
                    fetch(`${API_URL}/properties/${property._id}/payments`),
                    fetch(`${API_URL}/properties/${property._id}/quickbooks/payments`).catch(() => null)
                ]);
                if (!localRes.ok) return [];
                const localData = await localRes.json();
                const quickBooksPayload = quickBooksRes && quickBooksRes.ok
                    ? await quickBooksRes.json().catch(() => ({ payments: [] }))
                    : { payments: [] };
                const propertyTenants = allTenants.filter(tenant => String(tenant.projectId || tenant.propertyId || '') === String(property._id));
                const propertyUnits = allUnits.filter(unit => String(unit.projectId || unit.propertyId || '') === String(property._id));
                return getUnifiedPayments(
                    Array.isArray(localData) ? localData : [],
                    Array.isArray(quickBooksPayload?.payments) ? quickBooksPayload.payments : [],
                    {
                        tenantsSource: propertyTenants,
                        unitsSource: propertyUnits,
                        propertyId: property._id
                    }
                );
            } catch (e) {
                console.error(`Error loading payments for property ${property._id}:`, e);
                return [];
            }
        })
    );

    const all = perPropertyArrays.flat();
    state.portfolioPayments = all;
    return all;
}

// Compute and render portfolio-wide metrics into the overview strip
async function renderPortfolioOverview() {
    try {
        const section = document.getElementById('portfolioOverviewSection');
        if (!section) return;

        const elOpenRentAmount = document.getElementById('portfolioOpenRentAmount');
        const elOpenRentCount = document.getElementById('portfolioOpenRentCount');
        const elRentSummary = document.getElementById('portfolioRentCollectedSummary');
        const elRentBar = document.getElementById('portfolioRentCollectedBar');
        const elTotalRentSummary = document.getElementById('portfolioTotalRentSummary');
        const elTenantsCount = document.getElementById('portfolioTenantsCount');
        const elTenantsSummary = document.getElementById('portfolioTenantsSummary');
        const elOpenMaint = document.getElementById('portfolioOpenMaintenanceCount');
        const elMaintBreakdown = document.getElementById('portfolioMaintenanceBreakdown');
        const elApplicationsCount = document.getElementById('portfolioApplicationsCount');
        const elApplicationsSummary = document.getElementById('portfolioApplicationsSummary');
        const elExpiringLeases = document.getElementById('portfolioExpiringLeasesCount');
        const elExpiringLeasesBreakdown = document.getElementById('portfolioExpiringLeasesBreakdown');
        const elVacantUnits = document.getElementById('portfolioVacantUnitsCount');
        const elVacancySummary = document.getElementById('portfolioVacancySummary');
        const elOccupancyBar = document.getElementById('portfolioOccupancyBar');
        if (!elOpenRentAmount || !elOpenRentCount || !elOpenMaint || !elExpiringLeases || !elVacantUnits) return;

        // Start loading portfolio-wide payments and maintenance in parallel with any
        // remaining unit/tenant loading work to reduce time-to-first overview paint.
        const paymentsPromise = loadPortfolioPayments().catch((e) => {
            console.error('Error loading portfolio payments:', e);
            return [];
        });

        const maintenancePromise = (async () => {
            let openMaintCount = 0;
            const requestStageCounts = {
                new: 0,
                scheduled: 0,
                waiting: 0,
                'in-progress': 0,
                completed: 0,
                closed: 0
            };
            let pendingRequestCount = 0;
            let recurringUpcoming = 0;
            let recurringInProgress = 0;
            portfolioMaintenancePhotoHydrationStarted = false;
            portfolioMaintenancePhotoHydrationComplete = false;
            try {
                // Include completed requests in the portfolio maintenance dataset so
                // completed via filters, but only count pending + in-progress in the chip.
                const cacheBust = Date.now();
                const [requestsRes, schedulesRes] = await Promise.all([
                    fetch('/api/properties/maintenance?status=pending,in-progress,completed,closed&_=' + cacheBust),
                    fetch('/api/properties/maintenance-schedules?status=pending,in-progress,completed,closed&_=' + cacheBust)
                ]);
                if (requestsRes.ok) {
                    const items = await requestsRes.json();
                    if (Array.isArray(items)) {
                        state.portfolioMaintenance = items;
                        items.forEach(m => {
                            const workflowStage = getMaintenanceWorkflowStage(m);
                            if (requestStageCounts[workflowStage] !== undefined) {
                                requestStageCounts[workflowStage]++;
                            }
                            if (m.status === 'pending') {
                                pendingRequestCount++;
                            }
                            if (m.status === 'pending' || m.status === 'in-progress') {
                                openMaintCount++;
                            }
                        });
                    }
                }
                if (schedulesRes.ok) {
                    const schedules = await schedulesRes.json();
                    if (Array.isArray(schedules)) {
                        state.portfolioRecurringMaintenance = schedules;
                        schedules.forEach(schedule => {
                            const status = schedule.status || 'pending';
                            if (status === 'pending') {
                                recurringUpcoming++;
                                openMaintCount++;
                            } else if (status === 'in-progress') {
                                recurringInProgress++;
                                openMaintCount++;
                            }
                        });
                    }
                }
            } catch (e) {
                console.error('Error loading portfolio maintenance overview:', e);
            }
            return { openMaintCount, requestStageCounts, pendingRequestCount, recurringUpcoming, recurringInProgress };
        })();

        // Ensure portfolio units/tenants are loaded
        if (!Array.isArray(state.allUnits) || !state.allUnits.length || !Array.isArray(state.allTenants) || !state.allTenants.length) {
            try {
                await loadAllUnitsAndTenants();
            } catch (e) {
                console.warn('Error loading units/tenants for portfolio overview:', e);
            }
        }

        const allUnits = state.allUnits || [];
        const allTenants = state.allTenants || [];
        const allApplications = state.applications || [];
        const allInvites = state.invites || [];
        state.portfolioTenantsWithBalance = [];
        state.portfolioExpiringLeases = [];
        state.portfolioUpcomingMoveIns = [];
        state.portfolioVacantUnits = [];
        state.portfolioOccupiedUnits = [];
        const activeTenants = allTenants.filter(t => t.leaseStatus !== 'terminated' && t.leaseStatus !== 'expired');

        const pendingApplications = allApplications.filter(a => (a.status || 'pending') === 'pending');
        const recentInvites = allInvites.slice(0, 50);

        const now = new Date();
        // Determine which month to use for rent metrics (default = current month)
        let periodYear = now.getFullYear();
        let periodMonthIndex = now.getMonth(); // 0-based
        if (state.portfolioRentMonth) {
            const parts = String(state.portfolioRentMonth).split('-');
            if (parts.length === 2) {
                const py = Number(parts[0]);
                const pm = Number(parts[1]);
                if (!isNaN(py) && !isNaN(pm) && pm >= 1 && pm <= 12) {
                    periodYear = py;
                    periodMonthIndex = pm - 1;
                }
            }
        }
        const periodMonth = `${periodYear}-${String(periodMonthIndex + 1).padStart(2, '0')}`;
        const periodDate = new Date(periodYear, periodMonthIndex, 15);

        // Update Applications & Invites chip if present
        if (elApplicationsCount && elApplicationsSummary) {
            const appsCount = pendingApplications.length;
            const invitesCount = recentInvites.length;
            elApplicationsCount.textContent = String(appsCount);
            const parts = [];
            parts.push(`${appsCount} pending application${appsCount === 1 ? '' : 's'}`);
            if (invitesCount) {
                parts.push(`${invitesCount} invite${invitesCount === 1 ? '' : 's'}`);
            }
            elApplicationsSummary.textContent = parts.join(' • ') || 'Applications & invites overview';
        }

        // Load portfolio-wide payments for current month rent comparisons
        const allPayments = await paymentsPromise;

        let totalUnpaidRent = 0;
        let totalExpectedRent = 0;
        let portfolioMonthlyIncome = 0; // contract monthly income (base rent + recurring fees, no proration)
        let totalPaidThisMonthAll = 0;
        let tenantsWithBalance = 0;
        let expiringLeasesCount = 0;
        let expiringWithin30 = 0;
        let upcomingMoveInsCount = 0;
        let upcomingMoveInsWithin30 = 0;

        activeTenants.forEach(tenant => {
            // Lease expiry within 60 days (always relative to "now", not the selected rent month)
            if (tenant.leaseEnd) {
                const leaseEndDate = new Date(tenant.leaseEnd);
                const diffMs = leaseEndDate - now;
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                if (diffDays <= 60 && diffDays > 0 && (tenant.leaseStatus === 'active' || tenant.leaseStatus === 'pending')) {
                    expiringLeasesCount++;
                    if (diffDays <= 30) {
                        expiringWithin30++;
                    }
                    state.portfolioExpiringLeases.push({ tenant, daysUntilEnd: diffDays });
                }
            }

            // Expected rent vs payments for the selected month
            const petFees = (tenant.pets?.hasPets ? (Number(tenant.pets.monthlyRent) || 0) : 0);
            const additionalFees =
                (Number(tenant.waterFee) || 0) +
                (Number(tenant.trashFee) || 0) +
                (Number(tenant.adminFee) || 0) +
                (tenant.additionalFee?.amount || 0) +
                petFees;

            // Determine if the selected month falls completely outside this tenant's lease range
            const leaseStart = tenant.leaseStart ? new Date(tenant.leaseStart) : null;
            const leaseEnd = tenant.leaseEnd ? new Date(tenant.leaseEnd) : null;
            let outOfLeaseMonth = false;
            if (leaseStart || leaseEnd) {
                const monthStart = new Date(periodYear, periodMonthIndex, 1);
                const monthEnd = new Date(periodYear, periodMonthIndex + 1, 0);
                if (leaseStart && monthEnd < leaseStart) {
                    outOfLeaseMonth = true;
                }
                if (leaseEnd && monthStart > leaseEnd) {
                    outOfLeaseMonth = true;
                }
            }

            // For "Estimated monthly income", only count tenants whose lease covers the selected month
            // (no proration/overrides applied in this high-level metric)
            const contractualMonthly = (Number(tenant.baseRent) || 0) + additionalFees;
            if (!outOfLeaseMonth) {
                portfolioMonthlyIncome += contractualMonthly;
            }

            let expectedMonthly = 0;
            let monthOverride = null;
            if (!outOfLeaseMonth) {
                // For in-range months, still respect proration and overrides
                const expectedBase = computeExpectedBaseRentForMonth(tenant, periodDate);
                const overrideMap = tenant?.monthlyOverrides || null;
                monthOverride = overrideMap
                    ? (typeof overrideMap.get === 'function' ? overrideMap.get(periodMonth) : overrideMap[periodMonth])
                    : null;

                expectedMonthly = expectedBase + additionalFees;
                if (monthOverride) {
                    const ovExpected = Number(monthOverride.expectedRent);
                    const ovLate = Number(monthOverride.lateFee);
                    const ovMode = (monthOverride.lateFeeMode === 'percent') ? 'percent' : 'amount';
                    const baseBeforeLate = Number.isFinite(ovExpected) ? ovExpected : (expectedBase + additionalFees);
                    if (ovMode === 'percent' && Number.isFinite(ovLate)) {
                        expectedMonthly = baseBeforeLate + (baseBeforeLate * (ovLate / 100));
                    } else {
                        expectedMonthly = baseBeforeLate + (Number.isFinite(ovLate) ? ovLate : 0);
                    }
                }
            }

            const monthPayments = allPayments.filter(p => {
                if (!p.date || (p.applyTo || 'rent') !== 'rent') return false;
                if (String(p.tenantId) !== String(tenant._id)) return false;
                const d = new Date(p.date);
                return d.getMonth() === periodMonthIndex && d.getFullYear() === periodYear;
            });

            const totalPaidThisMonth = monthPayments.reduce((sum, p) => {
                const amt = Number(p.amount) || 0;
                return sum + (amt > 0 ? amt : 0);
            }, 0);

            const remainingRent = Math.max(0, expectedMonthly - totalPaidThisMonth);
            totalExpectedRent += expectedMonthly;
            totalPaidThisMonthAll += totalPaidThisMonth;
            // Always store a row so the rent details view can show all tenants
            state.portfolioTenantsWithBalance.push({ tenant, remainingRent, expectedMonthly, paidThisMonth: totalPaidThisMonth, outOfLease: outOfLeaseMonth });
            // But only count those with a positive remaining balance toward the "open rent" chip
            if (!outOfLeaseMonth && remainingRent > 0.01) {
                tenantsWithBalance++;
                totalUnpaidRent += remainingRent;
            }
        });

        // Upcoming / recent move-ins based on actual tenant lease start dates
        // (rather than applications). Track move-ins up to 60 days out and
        // up to 60 days after the lease start date.
        const msPerDay = 1000 * 60 * 60 * 24;
        activeTenants.forEach(tenant => {
            if (!tenant.leaseStart) return;
            const moveInDate = new Date(tenant.leaseStart);
            if (isNaN(moveInDate.getTime())) return;
            const diffMs = moveInDate - now;
            const diffDays = Math.ceil(diffMs / msPerDay);
            // Include move-ins up to 60 days out, plus the move-in day (0)
            // and up to 60 days after move-in (negative diffDays).
            if (diffDays <= 60 && diffDays >= -60) {
                upcomingMoveInsCount++;
                if (diffDays <= 30) {
                    upcomingMoveInsWithin30++;
                }
                const displayDays = diffDays < 0 ? 0 : diffDays;
                state.portfolioUpcomingMoveIns.push({
                    tenant,
                    daysUntilMoveIn: displayDays,
                    rawDaysUntilMoveIn: diffDays
                });
            }
        });

        const vacantUnitsList = allUnits.filter(u => u.status === 'vacant');
        const occupiedUnitsList = allUnits.filter(u => u.status === 'occupied' || u.status === 'leased' || u.status === 'rented');
        const vacantUnits = vacantUnitsList.length;
        const totalUnits = allUnits.length || 0;
        state.portfolioVacantUnits = vacantUnitsList;
        state.portfolioOccupiedUnits = occupiedUnitsList;

        const { openMaintCount, requestStageCounts, pendingRequestCount, recurringUpcoming, recurringInProgress } = await maintenancePromise;

        const rentText = `$${totalUnpaidRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const rentSub = tenantsWithBalance ? `${tenantsWithBalance} tenant${tenantsWithBalance !== 1 ? 's' : ''} with balance` : 'All current month rent paid';

        elOpenRentAmount.textContent = rentText;
        elOpenRentCount.textContent = rentSub;
        if (elTotalRentSummary) {
            const totalExpectedText = `$${portfolioMonthlyIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            elTotalRentSummary.textContent = `Estimated monthly income: ${totalExpectedText}`;
        }

        // Tenants chip: show active vs total tenants across the portfolio
        if (elTenantsCount && elTenantsSummary) {
            const totalTenantsCount = allTenants.length;
            const activeTenantsCount = activeTenants.length;
            const inactiveTenantsCount = Math.max(0, totalTenantsCount - activeTenantsCount);
            elTenantsCount.textContent = activeTenantsCount;
            if (!totalTenantsCount) {
                elTenantsSummary.textContent = 'No tenants yet across the portfolio';
            } else {
                elTenantsSummary.textContent = `${activeTenantsCount} active • ${inactiveTenantsCount} inactive (of ${totalTenantsCount} total)`;
            }
        }
        elOpenMaint.textContent = openMaintCount;
        const totalLeaseAndMoveEvents = expiringLeasesCount + upcomingMoveInsCount;
        elExpiringLeases.textContent = totalLeaseAndMoveEvents;
        elVacantUnits.textContent = vacantUnits;

        // Rent collection progress
        if (elRentSummary && elRentBar) {
            const collectedPercent = totalExpectedRent > 0
                ? Math.max(0, Math.min(100, Math.round((totalPaidThisMonthAll / totalExpectedRent) * 100)))
                : 100;
            elRentSummary.textContent = `Collected ${collectedPercent}% of expected rent`;
            elRentBar.style.width = collectedPercent + '%';
        }

        // Maintenance breakdown badges
        if (elMaintBreakdown) {
            elMaintBreakdown.innerHTML = '';
            if (openMaintCount === 0) {
                const badge = document.createElement('span');
                badge.className = 'portfolio-badge';
                badge.textContent = 'No open items';
                elMaintBreakdown.appendChild(badge);
            } else {
                if (pendingRequestCount > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'portfolio-badge warn';
                    badge.textContent = `${pendingRequestCount} pending`;
                    elMaintBreakdown.appendChild(badge);
                }
                if (requestStageCounts.scheduled > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'portfolio-badge';
                    badge.textContent = `${requestStageCounts.scheduled} scheduled`;
                    elMaintBreakdown.appendChild(badge);
                }
                if (requestStageCounts.waiting > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'portfolio-badge warn';
                    badge.textContent = `${requestStageCounts.waiting} waiting`;
                    elMaintBreakdown.appendChild(badge);
                }
                if (requestStageCounts['in-progress'] > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'portfolio-badge';
                    badge.textContent = `${requestStageCounts['in-progress']} in progress`;
                    elMaintBreakdown.appendChild(badge);
                }
                if (recurringUpcoming > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'portfolio-badge warn';
                    badge.textContent = `${recurringUpcoming} recurring up-coming`;
                    elMaintBreakdown.appendChild(badge);
                }
                if (recurringInProgress > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'portfolio-badge';
                    badge.textContent = `${recurringInProgress} recurring in-progress`;
                    elMaintBreakdown.appendChild(badge);
                }
            }
        }

        // Lease expiry breakdown
        if (elExpiringLeasesBreakdown) {
            if (totalLeaseAndMoveEvents === 0) {
                elExpiringLeasesBreakdown.textContent = 'No expiring leases or upcoming move-ins in the next 60 days';
            } else {
                const within30Total = expiringWithin30 + upcomingMoveInsWithin30;
                const in31To60Total = (expiringLeasesCount - expiringWithin30) + (upcomingMoveInsCount - upcomingMoveInsWithin30);
                elExpiringLeasesBreakdown.textContent = `${within30Total} within 30 days, ${in31To60Total} in 31-60 days`;
            }
        }

        // Occupancy progress
        if (elVacancySummary && elOccupancyBar) {
            if (totalUnits === 0) {
                elVacancySummary.textContent = 'No units configured yet';
                elOccupancyBar.style.width = '0%';
            } else {
                const occupiedUnits = Math.max(0, totalUnits - vacantUnits);
                const occupancyPercent = Math.round((occupiedUnits / totalUnits) * 100);
                elVacancySummary.textContent = `${occupancyPercent}% occupied, ${vacantUnits} vacant of ${totalUnits} units`;
                elOccupancyBar.style.width = occupancyPercent + '%';
            }
        }
        await renderPortfolioExecutiveDashboard();
        clearPortfolioLocalLoaders();
        state.portfolioOverviewLoaded = true;
    } catch (e) {
        console.warn('Error rendering portfolio overview:', e);
    }
}

function getPortfolioExecutiveRange(value=document.getElementById('portfolioExecutivePeriod')?.value||'month',previous=false){
    const now=new Date(),year=now.getFullYear(),month=now.getMonth();
    let firstMonth=month,months=1,label='This month';
    if(value==='3months'){firstMonth=month-2;months=3;label='3 months';}
    else if(value==='6months'){firstMonth=month-5;months=6;label='6 months';}
    else if(value==='year'){firstMonth=0;months=12;label='This year';}
    else if(value==='lastMonth'){firstMonth=month-1;label='Last month';}
    else if(value==='quarter'){firstMonth=Math.floor(month/3)*3;months=3;label='This quarter';}
    if(previous)firstMonth-=months;
    const start=new Date(year,firstMonth,1),end=new Date(year,firstMonth+months,0,23,59,59,999);
    return{from:start.toISOString(),to:end.toISOString(),label};
}

function portfolioMoney(value){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value)||0)}

function portfolioPropertyId(record){return String(record?.projectId?._id||record?.projectId||record?.propertyId?._id||record?.propertyId||record?.project?._id||record?.project||'')}

function getPortfolioFilteredProperties(){const propertyFilter=document.getElementById('portfolioExecutiveProperty')?.value||'all',statusFilter=document.getElementById('portfolioExecutiveStatus')?.value||'all';return(state.properties||[]).filter(p=>(propertyFilter==='all'||String(p._id)===propertyFilter)&&(statusFilter==='all'||String(p.status||'active').toLowerCase().replace(/\s+/g,'-')===statusFilter));}

async function renderPortfolioExecutiveDashboard(){
    const requestId=(state.portfolioExecutiveRequestId||0)+1;
    state.portfolioExecutiveRequestId=requestId;
    const root=document.getElementById('portfolioExecutiveKpis'),tableRoot=document.getElementById('portfolioComparisonTable');if(!root||!tableRoot)return;
    setupPortfolioExecutiveControls();
    const propertySelect=document.getElementById('portfolioExecutiveProperty'),selected=propertySelect?.value||'all';if(propertySelect?.tagName==='SELECT'){propertySelect.innerHTML='<option value="all">All properties</option>'+(state.properties||[]).map(p=>`<option value="${p._id}">${escapeHtml(p.name||'Property')}</option>`).join('');propertySelect.value=[...propertySelect.options].some(o=>o.value===selected)?selected:'all';}
    const properties=getPortfolioFilteredProperties(),range=getPortfolioExecutiveRange(),compare=document.getElementById('portfolioExecutiveCompare')?.checked;
    document.getElementById('portfolioExecutiveMeta').textContent=`${properties.length} ${properties.length===1?'property':'properties'} · ${range.label} · Updated ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
    root.innerHTML=Array.from({length:8},()=>'<div class="portfolio-executive-card portfolio-skeleton">Loading</div>').join('');
    tableRoot.innerHTML='<div class="portfolio-table-loader"><i class="fas fa-circle-notch fa-spin"></i><span>Loading portfolio records…</span></div>';
    const loadOverview=async(p,r)=>{try{const res=await fetch(`${API_URL}/properties/${p._id}/overview?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);return res.ok?await res.json():null}catch{return null}};
    const previousRange=getPortfolioExecutiveRange(undefined,true);
    const rows=await Promise.all(properties.map(async property=>{const [overview,previous,qb]=await Promise.all([loadOverview(property,range),compare?loadOverview(property,previousRange):Promise.resolve(null),fetch(`${API_URL}/properties/${property._id}/quickbooks/status`).then(r=>r.ok?r.json():null).catch(()=>null)]);const units=(state.allUnits||[]).filter(u=>portfolioPropertyId(u)===String(property._id)),tenants=(state.allTenants||[]).filter(t=>portfolioPropertyId(t)===String(property._id)&&!['terminated','expired','inactive'].includes(String(t.leaseStatus||t.status||'').toLowerCase())),maint=(state.portfolioMaintenance||[]).filter(m=>portfolioPropertyId(m)===String(property._id)&&!['completed','closed'].includes(String(m.status||'').toLowerCase()));const summary=overview?.summary||{},financials=overview?.financials||{},delinquency=overview?.delinquency||{},prev=previous?.summary||{},occupied=units.filter(u=>['occupied','leased','rented'].includes(String(u.status||'').toLowerCase())).length,total=units.length,occupancy=Number(summary.occupancyRate??(total?occupied/total*100:0)),expected=Number(summary.expectedRent??summary.rentRoll??0),collected=Number(summary.rentCollected??0),collection=expected?Math.min(100,collected/expected*100):100,outstanding=Number(summary.rentOutstanding??delinquency.total??Math.max(0,expected-collected)),expenses=Number(financials.operatingExpenses??0),noi=Number(financials.estimatedNOI??collected-expenses),delinquent=Number(delinquency.tenantCount??0),attention=(100-occupancy)/10+maint.length*2+delinquent*3+(qb?.connected?0:2);return{property,overviewAvailable:!!overview,units:total,occupied,vacant:Math.max(0,total-occupied),tenants:tenants.length,occupancy,expected,collected,collection,outstanding,expenses,noi,maintenance:maint.length,delinquent,qbConnected:!!qb?.connected,attention,previousCollection:Number(prev.expectedRent??prev.rentRoll??0)?Number(prev.rentCollected??0)/Number(prev.expectedRent??prev.rentRoll)*100:null};}));
    if(requestId!==state.portfolioExecutiveRequestId)return;
    state.portfolioComparisonRows=rows;state.portfolioComparisonMasterRows=rows;state.portfolioComparisonPage=1;
    const totals=rows.reduce((a,r)=>{a.units+=r.units;a.occupied+=r.occupied;a.expected+=r.expected;a.collected+=r.collected;a.outstanding+=r.outstanding;a.expenses+=r.expenses;a.noi+=r.noi;a.maintenance+=r.maintenance;a.delinquent+=r.delinquent;return a},{units:0,occupied:0,expected:0,collected:0,outstanding:0,expenses:0,noi:0,maintenance:0,delinquent:0});
    const occupancy=totals.units?totals.occupied/totals.units*100:0,collection=totals.expected?totals.collected/totals.expected*100:100,pendingApps=(state.applications||[]).filter(a=>String(a.status||'pending').toLowerCase()==='pending').length;
    const cards=[['properties','fa-city','Properties',rows.length,`${rows.filter(r=>r.qbConnected).length} QuickBooks connected`,'good'],['occupancy','fa-building-user','Occupancy',`${occupancy.toFixed(1)}%`,`${totals.occupied} occupied · ${totals.units-totals.occupied} vacant`,occupancy>=95?'good':occupancy>=85?'warn':'danger'],['rent','fa-sack-dollar','Rent roll',portfolioMoney(totals.expected),range.label,''],['collection','fa-money-bill-trend-up','Collected',portfolioMoney(totals.collected),`${collection.toFixed(1)}% collection rate`,collection>=95?'good':collection>=85?'warn':'danger'],['delinquency','fa-triangle-exclamation','Outstanding',portfolioMoney(totals.outstanding),`${totals.delinquent} delinquent tenants`,totals.outstanding?'danger':'good'],['expenses','fa-receipt','Operating expenses',portfolioMoney(totals.expenses),range.label,''],['noi','fa-chart-line','Estimated NOI',portfolioMoney(totals.noi),'Income less operating expenses',totals.noi>=0?'good':'danger'],['maintenance','fa-screwdriver-wrench','Open maintenance',totals.maintenance,'Requests requiring action',totals.maintenance?'warn':'good'],['applications','fa-file-signature','Applications',pendingApps,'Pending portfolio applications',pendingApps?'warn':'good'],['leases','fa-file-contract','Lease events',(state.portfolioExpiringLeases||[]).length+(state.portfolioUpcomingMoveIns||[]).length,'Next 60 days',''],['units','fa-door-open','Total units',totals.units,`${totals.units-totals.occupied} currently vacant`,''],['quickbooks','fa-link','QuickBooks',`${rows.filter(r=>r.qbConnected).length}/${rows.length}`,`${rows.filter(r=>!r.qbConnected).length} need connection`,rows.every(r=>r.qbConnected)?'good':'warn']];
    root.innerHTML=cards.map(c=>`<article class="portfolio-executive-card" data-portfolio-drill="${c[0]}" tabindex="0"><span class="portfolio-executive-icon"><i class="fas ${c[1]}"></i></span><div class="portfolio-executive-label">${c[2]}</div><div class="portfolio-executive-value">${c[3]}</div><div class="portfolio-executive-trend ${c[5]}">${c[4]}</div></article>`).join('');
    root.insertAdjacentHTML('beforeend',`<article class="portfolio-executive-card" data-portfolio-drill="tenants" tabindex="0"><span class="portfolio-executive-icon"><i class="fas fa-users"></i></span><div class="portfolio-executive-label">Active tenants</div><div class="portfolio-executive-value">${(state.allTenants||[]).filter(t=>String(t.leaseStatus||t.status||'').trim().toLowerCase()==='active'&&getPortfolioFilteredProperties().some(p=>portfolioPropertyId(t)===String(p._id))).length}</div><div class="portfolio-executive-trend">Active tenants in selected properties</div></article>`);
    updatePortfolioUpcomingCard();
    renderUnifiedPortfolioWorkspace();
}



function portfolioPropertyName(id){return(state.properties||[]).find(p=>String(p._id)===String(id))?.name||'Unassigned property'}

function renderPortfolioComparisonTable(){const root=document.getElementById('portfolioComparisonTable'),pager=document.getElementById('portfolioComparisonPagination');if(!root||!pager)return;const query=String(document.getElementById('portfolioComparisonSearch')?.value||'').toLowerCase(),sort=document.getElementById('portfolioComparisonSort')?.value||'attention';let rows=(state.portfolioComparisonRows||[]).filter(r=>!query||String(r.property.name||'').toLowerCase().includes(query));rows.sort((a,b)=>sort==='name'?String(a.property.name).localeCompare(String(b.property.name)):sort==='occupancy'?b.occupancy-a.occupancy:sort==='collection'?b.collection-a.collection:sort==='noi'?b.noi-a.noi:b.attention-a.attention);const size=Number(document.getElementById('portfolioPageSize')?.value||15),pages=Math.max(1,Math.ceil(rows.length/size)),page=Math.min(state.portfolioComparisonPage||1,pages);state.portfolioComparisonPage=page;const visible=rows.slice((page-1)*size,page*size);root.innerHTML=visible.length?`<table class="portfolio-performance-table"><thead><tr><th>Property</th><th>Units</th><th>Occupancy</th><th>Rent roll</th><th>Collected</th><th>Outstanding</th><th>Expenses</th><th>NOI</th><th>Maintenance</th><th>QuickBooks</th><th>Health</th><th></th></tr></thead><tbody>${visible.map(r=>{const health=r.attention<3?'good':r.attention<8?'warn':'danger';return`<tr data-portfolio-property-id="${r.property._id}" tabindex="0" style="cursor:pointer" onclick="selectProperty('${r.property._id}', { loaderContext: event })" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectProperty('${r.property._id}', { loaderContext: event });}"><td><strong>${escapeHtml(r.property.name||'Property')}</strong><div class="task-meta">${r.tenants} active tenants</div></td><td>${r.units}</td><td>${r.occupancy.toFixed(1)}%</td><td>${portfolioMoney(r.expected)}</td><td>${portfolioMoney(r.collected)}<div class="task-meta">${r.collection.toFixed(1)}%</div></td><td>${portfolioMoney(r.outstanding)}</td><td>${portfolioMoney(r.expenses)}</td><td>${portfolioMoney(r.noi)}</td><td>${r.maintenance}</td><td><span class="portfolio-health ${r.qbConnected?'good':'warn'}">${r.qbConnected?'Connected':'Local only'}</span></td><td><span class="portfolio-health ${health}"><i class="fas fa-circle"></i>${health==='good'?'Healthy':health==='warn'?'Watch':'Attention'}</span></td><td><button class="overview-row-action" onclick="event.stopPropagation();openPortfolioPropertySnapshot('${r.property._id}')"><i class="fas fa-chart-pie"></i> Detail</button></td></tr>`}).join('')}</tbody></table>`:'<div class="empty-compact">No properties match these filters.</div>';pager.innerHTML=`<button ${page<=1?'disabled':''} onclick="state.portfolioComparisonPage--;renderPortfolioComparisonTable()"><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${page} of ${pages} · ${rows.length} properties</span><button ${page>=pages?'disabled':''} onclick="state.portfolioComparisonPage++;renderPortfolioComparisonTable()"><i class="fas fa-chevron-right"></i></button>`;}

function portfolioUnitName(id){return(state.allUnits||[]).find(u=>String(u._id)===String(id))?.number||'—'}

function portfolioDate(value){if(!value)return'—';const d=new Date(value);return isNaN(d)?'—':d.toLocaleDateString()}

function updatePortfolioUpcomingCard(){const days=Number(document.getElementById('portfolioUpcomingPeriod')?.value||60),now=Date.now(),limit=now+days*86400000,isUpcoming=value=>{const time=new Date(value||0).getTime();return time>=now&&time<=limit};const leases=(state.allTenants||[]).filter(t=>isUpcoming(t.leaseEnd)).length,moveIns=(state.allTenants||[]).filter(t=>isUpcoming(t.leaseStart)).length,maintenance=[...(state.portfolioMaintenance||[]),...(state.portfolioRecurringMaintenance||[])].filter(m=>isUpcoming(m.scheduledDate||m.nextScheduledDate||m.dueDate)).length;const card=document.querySelector('[data-portfolio-drill="leases"]');if(card){card.querySelector('.portfolio-executive-value').textContent=leases+moveIns+maintenance;card.querySelector('.portfolio-executive-trend').textContent=`${leases} leases · ${moveIns} move-ins · ${maintenance} scheduled · next ${days} days`;}}

function setPortfolioWorkspaceMode(mode){state.portfolioWorkspacePreviousMode=state.portfolioWorkspaceMode||'properties';state.portfolioWorkspaceMode=mode||'properties';state.portfolioComparisonPage=1;if(mode==='applications')state.portfolioApplicationType=state.portfolioApplicationType||'application';if(mode==='maintenance'){state.portfolioMaintenanceType=state.portfolioMaintenanceType||'request';state.portfolioMaintenanceView='list';presetPortfolioMaintenanceStatusFilters('in-progress','in-progress');state.portfolioMaintenanceUseDefaultStatus=true;}const search=document.getElementById('portfolioComparisonSearch');if(search)search.value='';const renderResult=renderUnifiedPortfolioWorkspace();if(mode==='tenants'){const filter=document.getElementById('portfolioWorkspaceFilter');if(filter){filter.value='active';renderUnifiedPortfolioWorkspace(false);}}scrollPortfolioTabsBelowToolbar();if(renderResult&&typeof renderResult.finally==='function')renderResult.finally(scrollPortfolioTabsBelowToolbar);}

function portfolioStatus(value){return String(value||'unknown').toLowerCase().replace(/[_\s]+/g,'-')}

function renderUnifiedPortfolioWorkspace(resetFilter=true){const mode=state.portfolioWorkspaceMode||'properties',root=document.getElementById('portfolioComparisonTable'),pager=document.getElementById('portfolioComparisonPagination'),title=document.getElementById('portfolioWorkspaceTitle'),summary=document.getElementById('portfolioWorkspaceSummary'),filter=document.getElementById('portfolioWorkspaceFilter'),sort=document.getElementById('portfolioComparisonSort'),typeToggle=document.getElementById('portfolioWorkspaceTypeToggle');if(!root||!pager||!title||!filter)return;document.querySelectorAll('[data-portfolio-view]').forEach(b=>b.classList.toggle('active',b.dataset.portfolioView===mode));document.getElementById('portfolioWorkspaceBack').hidden=mode==='properties';const recordPayment=document.getElementById('portfolioRecordPayment');if(recordPayment)recordPayment.style.display=mode==='rent'?'':'none';if(typeToggle){typeToggle.hidden=!['applications','maintenance','upcoming','vacant'].includes(mode);typeToggle.innerHTML=mode==='applications'?`<button class="${(state.portfolioApplicationType||'application')==='application'?'active':''}" data-workspace-type="application"><i class="fas fa-file-lines"></i> Applications</button><button class="${state.portfolioApplicationType==='invite'?'active':''}" data-workspace-type="invite"><i class="fas fa-envelope-open-text"></i> Invites</button>`:mode==='maintenance'?`<button class="${(state.portfolioMaintenanceType||'request')==='request'?'active':''}" data-workspace-type="request"><i class="fas fa-screwdriver-wrench"></i> Requests</button><button class="${state.portfolioMaintenanceType==='recurring'?'active':''}" data-workspace-type="recurring"><i class="fas fa-arrows-rotate"></i> Recurring</button>`:mode==='upcoming'?[30,60,90].map(d=>`<button class="${Number(document.getElementById('portfolioUpcomingPeriod')?.value||60)===d?'active':''}" data-workspace-type="upcoming-${d}">${d} days</button>`).join(''):`<button class="${(state.portfolioUnitType||'all')==='all'?'active':''}" data-workspace-type="unit-all"><i class="fas fa-building"></i> All units</button><button class="${state.portfolioUnitType==='vacant'?'active':''}" data-workspace-type="unit-vacant"><i class="fas fa-door-open"></i> Vacant</button>`;}const propertyIds=new Set(getPortfolioFilteredProperties().map(p=>String(p._id))),query=String(document.getElementById('portfolioComparisonSearch')?.value||'').toLowerCase();let columns=[],records=[],filterOptions=[['all','All records']],label='Property performance',description='Compare operating health and open the property that needs attention.';
if(mode==='properties'){records=(state.portfolioComparisonMasterRows||state.portfolioComparisonRows||[]).map(r=>({...r,status:r.attention<3?'healthy':r.attention<8?'watch':'attention',search:r.property.name}));columns=['Property','Units','Occupancy','Rent roll','Collected','Outstanding','Expenses','NOI','Maintenance','QuickBooks','Health',''];filterOptions=[['all','All properties'],['healthy','Healthy'],['watch','Watch'],['attention','Needs attention']];}
else if(mode==='tenants'){label='All tenants';description='Active, pending, inactive, expired and terminated tenants across the portfolio.';records=(state.allTenants||[]).filter(t=>propertyIds.has(portfolioPropertyId(t))).map(t=>{const balance=(state.portfolioTenantsWithBalance||[]).find(x=>String(x.tenant?._id)===String(t._id));return{raw:t,status:portfolioStatus(t.leaseStatus||t.status),search:`${t.name||''} ${t.email||''} ${portfolioPropertyName(portfolioPropertyId(t))}`,cells:[`<span class="portfolio-record-primary">${escapeHtml(t.name||'Unnamed tenant')}</span><div class="portfolio-record-secondary">${escapeHtml(t.email||t.phone||'No contact')}</div>`,escapeHtml(portfolioPropertyName(portfolioPropertyId(t))),escapeHtml(portfolioUnitName(t.unitId?._id||t.unitId)),portfolioStatus(t.leaseStatus||t.status),portfolioDate(t.leaseStart),portfolioDate(t.leaseEnd),portfolioMoney(t.baseRent),portfolioMoney(balance?.remainingRent||0),`<button class="overview-row-action" onclick="openPortfolioRecordDrawer('tenant','${t._id}')">Open</button>`]}});columns=['Tenant','Property','Unit','Status','Lease start','Lease end','Rent','Balance',''];filterOptions=[['all','All tenants'],['active','Active'],['pending','Pending'],['inactive','Inactive'],['expired','Expired'],['terminated','Terminated']];}
else if(mode==='maintenance'){label='Maintenance';description='Current, scheduled, recurring, completed and closed maintenance activity.';const requests=(state.portfolioMaintenance||[]).filter(m=>propertyIds.has(portfolioPropertyId(m))).map(m=>({kind:'Request',raw:m,status:portfolioStatus(m.status),search:`${m.title||m.issue||''} ${m.description||''} ${portfolioPropertyName(portfolioPropertyId(m))}`,cells:[`<span class="portfolio-record-primary">${escapeHtml(m.title||m.issue||'Maintenance request')}</span><div class="portfolio-record-secondary">${escapeHtml(m.description||'')}</div>`,'Request',escapeHtml(portfolioPropertyName(portfolioPropertyId(m))),escapeHtml(portfolioUnitName(m.unitId?._id||m.unitId)),portfolioStatus(m.status),escapeHtml(m.priority||'—'),portfolioDate(m.scheduledDate||m.createdAt),escapeHtml(m.assignedVendor?.name||m.vendor?.name||'—'),`<button class="overview-row-action" onclick="openPortfolioRecordDrawer('maintenance','${m._id}')">Open</button>`]}));const recurring=(state.portfolioRecurringMaintenance||[]).filter(m=>propertyIds.has(portfolioPropertyId(m))).map(m=>({kind:'Recurring',raw:m,status:portfolioStatus(m.status),search:`${m.title||''} ${m.description||''} ${portfolioPropertyName(portfolioPropertyId(m))}`,cells:[`<span class="portfolio-record-primary">${escapeHtml(m.title||'Recurring maintenance')}</span><div class="portfolio-record-secondary">${escapeHtml(m.description||'')}</div>`,'Recurring',escapeHtml(portfolioPropertyName(portfolioPropertyId(m))),'—',portfolioStatus(m.status),escapeHtml(m.priority||'—'),portfolioDate(m.nextScheduledDate),escapeHtml(m.assignedVendor?.name||'—'),`<button class="overview-row-action" onclick="openPortfolioRecordDrawer('maintenance','${m._id}')">Open</button>`]}));records=(state.portfolioMaintenanceType||'request')==='recurring'?recurring:requests;columns=['Maintenance','Type','Property','Unit','Status','Priority','Scheduled','Vendor',''];filterOptions=[['all','All statuses'],['current','Current / open'],['pending','Pending'],['in-progress','In progress'],['scheduled','Scheduled'],['completed','Completed'],['closed','Closed']];}
else if(mode==='applications'){label=(state.portfolioApplicationType||'application')==='invite'?'Invitations':'Applications';description='Fast review of applications and invitations without leaving the portfolio.';const apps=(state.applications||[]).map(a=>({kind:'application',raw:a,status:portfolioStatus(a.status||'pending'),search:`${a.name||''} ${a.email||''} ${a.unit||''}`,cells:[`<span class="portfolio-record-primary">${escapeHtml(a.name||'Applicant')}</span><div class="portfolio-record-secondary">${escapeHtml(a.email||'')}</div>`,'Application',escapeHtml(a.propertyName||'—'),escapeHtml(a.unit||'—'),portfolioStatus(a.status||'pending'),portfolioDate(a.submitted||a.createdAt),'—',`<button class="overview-row-action" onclick="openPortfolioRecordDrawer('application','${a._id}')">Open</button>`]}));const invites=(state.invites||[]).map(i=>({kind:'invite',raw:i,status:portfolioStatus(i.status||'sent'),search:`${i.name||''} ${i.email||''} ${i.propertyName||''}`,cells:[`<span class="portfolio-record-primary">${escapeHtml(i.name||'Invitee')}</span><div class="portfolio-record-secondary">${escapeHtml(i.email||'')}</div>`,'Invite',escapeHtml(i.propertyName||'—'),escapeHtml(i.unitNumber||'—'),portfolioStatus(i.status||'sent'),portfolioDate(i.sentAt),i.openedAt?`${portfolioDate(i.openedAt)}<div class="portfolio-record-secondary">${new Date(i.openedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · ${Number(i.openCount)||1} opens</div>`:'Never',`<button class="overview-row-action" onclick="openPortfolioRecordDrawer('invite','${i._id}')">Open</button>`]}));records=(state.portfolioApplicationType||'application')==='invite'?invites:apps;columns=['Applicant / Invitee','Type','Property','Unit','Status','Sent / Submitted','Last opened',''];filterOptions=[['all','All statuses'],['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['sent','Sent'],['opened','Opened'],['expired','Expired']];}
else if(mode==='rent'){label='Coming rent';description='Expected charges, posted payments and remaining rent for every current tenant.';records=(state.portfolioTenantsWithBalance||[]).filter(x=>propertyIds.has(portfolioPropertyId(x.tenant))).map(x=>({raw:x,status:x.outOfLease?'out-of-lease':x.remainingRent<=.01?'paid':x.paidThisMonth>0?'partial':'unpaid',search:`${x.tenant?.name||''} ${portfolioPropertyName(portfolioPropertyId(x.tenant))}`,cells:[`<span class="portfolio-record-primary">${escapeHtml(x.tenant?.name||'Tenant')}</span>`,escapeHtml(portfolioPropertyName(portfolioPropertyId(x.tenant))),escapeHtml(portfolioUnitName(x.tenant?.unitId?._id||x.tenant?.unitId)),portfolioMoney(x.expectedMonthly),portfolioMoney(x.paidThisMonth),portfolioMoney(x.remainingRent),x.outOfLease?'Out of lease':x.remainingRent<=.01?'<span class="portfolio-paid-status"><i class="fas fa-circle-check"></i> Paid</span>':x.paidThisMonth>0?'Partial':'Unpaid',`<div class="portfolio-rent-actions-cell"><button class="overview-row-action" onclick="openPortfolioTenantLedger('${x.tenant?._id}')">Ledger</button><button type="button" class="btn-secondary portfolio-record-payment-btn" onclick="event.stopPropagation();openPaymentModalForTenantAndProperty('${x.tenant?._id}','${portfolioPropertyId(x.tenant)}',false)">+ Payment</button></div>`]}));columns=['Tenant','Property','Unit','Expected','Collected','Remaining','Status',''];filterOptions=[['all','All rent'],['paid','Paid'],['partial','Partially paid'],['unpaid','Unpaid'],['out-of-lease','Out of lease']];}
else if(mode==='upcoming'){const days=Number(document.getElementById('portfolioUpcomingPeriod')?.value||60),now=Date.now(),limit=now+days*86400000,inRange=value=>{const t=new Date(value||0).getTime();return t>=now&&t<=limit},events=[];(state.allTenants||[]).filter(t=>propertyIds.has(portfolioPropertyId(t))).forEach(t=>{if(inRange(t.leaseEnd))events.push({status:'lease',date:t.leaseEnd,search:`${t.name} lease`,cells:[`<span class="portfolio-record-primary">Lease expires</span><div class="portfolio-record-secondary">${escapeHtml(t.name||'Tenant')}</div>`,'Lease',escapeHtml(portfolioPropertyName(portfolioPropertyId(t))),portfolioDate(t.leaseEnd),'Upcoming',`<button class="overview-row-action" onclick="setPortfolioWorkspaceMode('tenants')">Tenants</button>`]});if(inRange(t.leaseStart))events.push({status:'move-in',date:t.leaseStart,search:`${t.name} move in`,cells:[`<span class="portfolio-record-primary">Move-in</span><div class="portfolio-record-secondary">${escapeHtml(t.name||'Tenant')}</div>`,'Move-in',escapeHtml(portfolioPropertyName(portfolioPropertyId(t))),portfolioDate(t.leaseStart),'Upcoming',`<button class="overview-row-action" onclick="setPortfolioWorkspaceMode('tenants')">Tenants</button>`]})});[...(state.portfolioMaintenance||[]),...(state.portfolioRecurringMaintenance||[])].filter(m=>propertyIds.has(portfolioPropertyId(m))).forEach(m=>{const date=m.scheduledDate||m.nextScheduledDate||m.dueDate;if(inRange(date))events.push({status:'maintenance',date,search:`${m.title||m.issue||''} maintenance`,cells:[`<span class="portfolio-record-primary">${escapeHtml(m.title||m.issue||'Scheduled maintenance')}</span>`,'Maintenance',escapeHtml(portfolioPropertyName(portfolioPropertyId(m))),portfolioDate(date),portfolioStatus(m.status),`<button class="overview-row-action" onclick="setPortfolioWorkspaceMode('maintenance')">Maintenance</button>`]})});(state.allUnits||[]).filter(u=>propertyIds.has(portfolioPropertyId(u))).forEach(u=>{const date=u.profile?.availableDate||u.availableDate;if(inRange(date))events.push({status:'availability',date,search:`unit ${u.number} available`,cells:[`<span class="portfolio-record-primary">Unit ${escapeHtml(u.number||'—')} available</span>`,'Availability',escapeHtml(portfolioPropertyName(portfolioPropertyId(u))),portfolioDate(date),portfolioStatus(u.status),`<button class="overview-row-action" onclick="setPortfolioWorkspaceMode('vacant')">Units</button>`]});(u.equipment||[]).forEach(eq=>{if(inRange(eq.nextServiceDate))events.push({status:'equipment',date:eq.nextServiceDate,search:`${eq.name||eq.category||''} equipment`,cells:[`<span class="portfolio-record-primary">${escapeHtml(eq.name||eq.category||'Equipment service')}</span><div class="portfolio-record-secondary">Unit ${escapeHtml(u.number||'—')}</div>`,'Equipment',escapeHtml(portfolioPropertyName(portfolioPropertyId(u))),portfolioDate(eq.nextServiceDate),'Service due',`<button class="overview-row-action" onclick="setPortfolioWorkspaceMode('vacant')">Units</button>`]})})});(state.portfolioTasks||[]).forEach(t=>{if(inRange(t.dueDate))events.push({status:'task',date:t.dueDate,search:`${t.title||''} task`,cells:[`<span class="portfolio-record-primary">${escapeHtml(t.title||'Task')}</span>`,'Task',escapeHtml(portfolioPropertyName(t.projectId?._id||t.projectId)),portfolioDate(t.dueDate),portfolioStatus(t.status),`<button class="overview-row-action" onclick="togglePortfolioTasksDrawer(true)">Tasks</button>`]})});records=events.sort((a,b)=>new Date(a.date)-new Date(b.date));label=`Upcoming ${days} days`;description='Lease, move-in, maintenance, availability, equipment and task events in one timeline.';columns=['Event','Type','Property','Date','Status',''];filterOptions=[['all','All events'],['lease','Lease expirations'],['move-in','Move-ins'],['maintenance','Maintenance'],['availability','Availability'],['equipment','Equipment'],['task','Tasks']];}
else{label='Units & vacancies';description='See every unit, or narrow the same list to vacant units requiring leasing action.';records=(state.allUnits||[]).filter(u=>propertyIds.has(portfolioPropertyId(u))&&((state.portfolioUnitType||'all')==='all'||portfolioStatus(u.status)==='vacant')).map(u=>{const tenant=(state.allTenants||[]).find(t=>String(t.unitId?._id||t.unitId)===String(u._id)&&!['terminated','expired','inactive'].includes(portfolioStatus(t.leaseStatus||t.status)));return{raw:u,status:portfolioStatus(u.status),search:`${u.number||''} ${portfolioPropertyName(portfolioPropertyId(u))} ${tenant?.name||''}`,cells:[`<span class="portfolio-record-primary">Unit ${escapeHtml(u.number||'—')}</span><div class="portfolio-record-secondary">${escapeHtml(u.profile?.floorPlan||u.type||'')}</div>`,escapeHtml(portfolioPropertyName(portfolioPropertyId(u))),portfolioStatus(u.status),escapeHtml(tenant?.name||'—'),portfolioMoney(u.rent||u.monthlyRent),portfolioDate(u.profile?.availableDate||u.availableDate),`${(u.equipment||[]).length} items`,escapeHtml(u.profile?.condition||'Not rated'),`<button class="overview-row-action" onclick="openPortfolioRecordDrawer('unit','${u._id}')">Open</button>`]}});columns=['Unit','Property','Status','Tenant','Rent','Available','Equipment','Condition',''];filterOptions=[['all','All units'],['vacant','Vacant units only'],['occupied','Occupied'],['maintenance','Maintenance'],['unavailable','Unavailable']];}
title.innerHTML=`<i class="fas ${mode==='properties'?'fa-chart-column':mode==='tenants'?'fa-users':mode==='maintenance'?'fa-screwdriver-wrench':mode==='applications'?'fa-file-signature':mode==='rent'?'fa-sack-dollar':mode==='vacant'?'fa-door-open':'fa-building-user'}"></i> ${label}`;summary.textContent=description;sort.style.display=mode==='properties'?'':'none';if(resetFilter){filter.innerHTML=filterOptions.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');filter.value='all';}const filterValue=filter.value||'all';if(filterValue!=='all')records=records.filter(r=>filterValue==='current'?['new','pending','scheduled','waiting','in-progress'].includes(r.status):filterValue==='recurring'?r.kind==='Recurring':filterValue==='application'||filterValue==='invite'?r.kind===filterValue:r.status===filterValue);if(query)records=records.filter(r=>String(r.search||JSON.stringify(r.cells||[])).toLowerCase().includes(query));if(mode==='properties'){state.portfolioComparisonRows=records;renderPortfolioComparisonTable();return;}const size=Number(document.getElementById('portfolioPageSize')?.value||15),pages=Math.max(1,Math.ceil(records.length/size)),page=Math.min(state.portfolioComparisonPage||1,pages),visible=records.slice((page-1)*size,page*size);state.portfolioComparisonPage=page;root.innerHTML=visible.length?`<table class="portfolio-performance-table"><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${visible.map(r=>`<tr>${r.cells.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<div class="empty-compact">No records match the current portfolio filters.</div>';pager.innerHTML=`<button ${page<=1?'disabled':''} onclick="state.portfolioComparisonPage--;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${page} of ${pages} · ${records.length} records</span><button ${page>=pages?'disabled':''} onclick="state.portfolioComparisonPage++;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-right"></i></button>`;}

function showPortfolioInlineWorkspace(titleText,summaryText,content,returnMode){state.portfolioInlineReturnMode=returnMode||state.portfolioWorkspaceMode||'properties';document.querySelectorAll('[data-portfolio-view]').forEach(b=>b.classList.remove('active'));document.getElementById('portfolioWorkspaceBack').hidden=false;document.getElementById('portfolioWorkspaceTitle').innerHTML=titleText;document.getElementById('portfolioWorkspaceSummary').textContent=summaryText;document.getElementById('portfolioWorkspaceTypeToggle').hidden=true;document.getElementById('portfolioRecordPayment').style.display='none';document.getElementById('portfolioComparisonSearch').style.display='none';document.getElementById('portfolioWorkspaceFilter').style.display='none';document.getElementById('portfolioComparisonSort').style.display='none';document.querySelector('.portfolio-page-size')?.style.setProperty('display','none');document.getElementById('portfolioComparisonTable').innerHTML=content;document.getElementById('portfolioComparisonPagination').innerHTML='';}

function restorePortfolioWorkspaceControls(){document.getElementById('portfolioComparisonSearch').style.display='';document.getElementById('portfolioWorkspaceFilter').style.display='';document.querySelector('.portfolio-page-size')?.style.removeProperty('display');}

function openPortfolioTenantLedger(tenantId){const tenant=(state.allTenants||[]).find(t=>String(t._id)===String(tenantId));if(!tenant)return;const payments=(state.portfolioPayments||[]).filter(p=>String(p.tenantId?._id||p.tenantId)===String(tenantId)).sort((a,b)=>new Date(b.date)-new Date(a.date)),rent=(state.portfolioTenantsWithBalance||[]).find(x=>String(x.tenant?._id)===String(tenantId));const content=`<div class="portfolio-inline-summary"><div><span>Expected this month</span><strong>${portfolioMoney(rent?.expectedMonthly)}</strong></div><div><span>Collected</span><strong>${portfolioMoney(rent?.paidThisMonth)}</strong></div><div><span>Remaining</span><strong>${portfolioMoney(rent?.remainingRent)}</strong></div><div><span>Transactions</span><strong>${payments.length}</strong></div></div>${payments.length?`<table class="portfolio-performance-table"><thead><tr><th>Date</th><th>Period</th><th>Type</th><th>Apply to</th><th>Method</th><th>Source</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${payments.map(p=>`<tr><td>${portfolioDate(p.date)}</td><td>${escapeHtml(p.periodMonth||p.paymentPeriod||'—')}</td><td>${escapeHtml(p.type||'payment')}</td><td>${escapeHtml(p.applyTo||'rent')}</td><td>${escapeHtml(p.paymentMethod||p.method||'—')}</td><td>${p.quickBooks?.entityId?'QuickBooks / matched':'Local'}</td><td>${portfolioMoney(p.amount)}</td><td>${escapeHtml(p.notes||p.note||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-compact">No posted transactions for this tenant.</div>'}`;showPortfolioInlineWorkspace(`<i class="fas fa-book-open"></i> ${escapeHtml(tenant.name||'Tenant')} ledger`,`${portfolioPropertyName(portfolioPropertyId(tenant))} · Unit ${portfolioUnitName(tenant.unitId?._id||tenant.unitId)}`,content,'rent');}

function portfolioDrawerRows(rows){return rows.filter(r=>r[1]!==undefined&&r[1]!==null&&r[1]!=='').map(([label,value])=>`<div class="portfolio-drawer-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('')}

function openPortfolioRecordDrawer(kind,id){const drawer=document.getElementById('portfolioRecordDrawer'),body=document.getElementById('portfolioRecordDrawerBody'),title=document.getElementById('portfolioRecordDrawerTitle');if(!drawer||!body)return;body.innerHTML='<div class="portfolio-table-loader"><i class="fas fa-circle-notch fa-spin"></i><span>Loading details…</span></div>';drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');setTimeout(()=>{let item,heading='',sections='';if(kind==='tenant'){item=(state.allTenants||[]).find(x=>String(x._id)===String(id));if(item){const rent=(state.portfolioTenantsWithBalance||[]).find(x=>String(x.tenant?._id)===String(id));heading=item.name||'Tenant';sections=`<section class="portfolio-drawer-section"><h4><i class="fas fa-address-card"></i> Tenant profile</h4>${portfolioDrawerRows([['Email',item.email||'—'],['Phone',item.phone||'—'],['Property',portfolioPropertyName(portfolioPropertyId(item))],['Unit',portfolioUnitName(item.unitId?._id||item.unitId)],['Lease status',item.leaseStatus||item.status||'—'],['Lease start',portfolioDate(item.leaseStart)],['Lease end',portfolioDate(item.leaseEnd)]])}</section><section class="portfolio-drawer-section"><h4><i class="fas fa-sack-dollar"></i> Current rent</h4>${portfolioDrawerRows([['Base rent',portfolioMoney(item.baseRent)],['Expected',portfolioMoney(rent?.expectedMonthly)],['Collected',portfolioMoney(rent?.paidThisMonth)],['Remaining',portfolioMoney(rent?.remainingRent)]])}</section><button class="btn-secondary" onclick="closePortfolioRecordDrawer();openPortfolioTenantLedger('${id}')"><i class="fas fa-book-open"></i> Open ledger inline</button>`;}}else if(kind==='unit'){item=(state.allUnits||[]).find(x=>String(x._id)===String(id));if(item){heading=`Unit ${item.number||''}`;sections=`<section class="portfolio-drawer-section"><h4><i class="fas fa-building-user"></i> Unit profile</h4>${portfolioDrawerRows([['Property',portfolioPropertyName(portfolioPropertyId(item))],['Status',item.status||'—'],['Bedrooms',item.bedrooms??'—'],['Bathrooms',item.bathrooms??'—'],['Square feet',item.sqft||'—'],['Rent',portfolioMoney(item.rent||item.monthlyRent)],['Available',portfolioDate(item.profile?.availableDate||item.availableDate)],['Condition',item.profile?.condition||'Not rated']])}</section><section class="portfolio-drawer-section"><h4><i class="fas fa-microchip"></i> Equipment (${(item.equipment||[]).length})</h4>${(item.equipment||[]).map(eq=>`<div class="portfolio-drawer-row"><span>${escapeHtml(eq.name||eq.category||'Equipment')}</span><strong>${escapeHtml(eq.condition||eq.brand||'—')}</strong></div>`).join('')||'<div class="empty-compact">No equipment recorded.</div>'}</section>`;}}else if(kind==='maintenance'){item=[...(state.portfolioMaintenance||[]),...(state.portfolioRecurringMaintenance||[])].find(x=>String(x._id)===String(id));if(item){heading=item.title||item.issue||'Maintenance';sections=`<section class="portfolio-drawer-section"><h4><i class="fas fa-screwdriver-wrench"></i> Work details</h4>${portfolioDrawerRows([['Property',portfolioPropertyName(portfolioPropertyId(item))],['Unit',portfolioUnitName(item.unitId?._id||item.unitId)],['Status',item.status||'—'],['Priority',item.priority||'—'],['Created',portfolioDate(item.createdAt)],['Scheduled',portfolioDate(item.scheduledDate||item.nextScheduledDate)],['Vendor',item.assignedVendor?.name||item.vendor?.name||'—'],['Estimated cost',portfolioMoney(item.estimatedCost||item.cost)]])}</section><section class="portfolio-drawer-section"><h4>Description</h4><p>${DescriptionEditor.render(item.description||'No description provided.')}</p></section>`;}}else{const source=kind==='invite'?(state.invites||[]):(state.applications||[]);item=source.find(x=>String(x._id)===String(id));if(item){heading=item.name||(kind==='invite'?'Invitation':'Application');sections=`<section class="portfolio-drawer-section"><h4><i class="fas ${kind==='invite'?'fa-envelope-open-text':'fa-file-signature'}"></i> ${kind==='invite'?'Invitation':'Application'} details</h4>${portfolioDrawerRows([['Email',item.email||'—'],['Phone',item.phone||'—'],['Property',item.propertyName||'—'],['Unit',item.unitNumber||item.unit||'—'],['Status',item.status||'—'],['Sent / submitted',portfolioDate(item.sentAt||item.submitted||item.createdAt)],['Last opened',item.openedAt?new Date(item.openedAt).toLocaleString():'Never'],['Open count',item.openCount??0],['Move-in',portfolioDate(item.moveIn)]])}</section>`;}}title.textContent=heading||'Details';body.innerHTML=sections||'<div class="empty-compact">Details are unavailable.</div>';},120);}

function closePortfolioRecordDrawer(){const drawer=document.getElementById('portfolioRecordDrawer');drawer?.classList.remove('open');drawer?.setAttribute('aria-hidden','true');if(drawer){delete drawer.dataset.recordKind;delete drawer.dataset.recordId;drawer.classList.remove('tenant-drawer');}}

async function openPortfolioPropertySnapshot(propertyId){const property=(state.properties||[]).find(p=>String(p._id)===String(propertyId));if(!property)return;showPortfolioInlineWorkspace(`<i class="fas fa-building"></i> ${escapeHtml(property.name||'Property')}`,'Loading visual property dashboard…',`<div class="portfolio-property-visual">${Array.from({length:4},()=>'<div class="portfolio-visual-card portfolio-skeleton"></div>').join('')}</div>`,'properties');try{const range=getPortfolioExecutiveRange(),res=await fetch(`${API_URL}/properties/${propertyId}/overview?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),data=res.ok?await res.json():{},s=data.summary||{},f=data.financials||{},d=data.delinquency||{},occupancy=Math.max(0,Math.min(100,Number(s.occupancyRate||0))),expected=Number(s.expectedRent??s.rentRoll??0),collected=Number(s.rentCollected||0),collection=expected?Math.min(100,collected/expected*100):100,expenses=Number(f.operatingExpenses||0),noi=Number(f.estimatedNOI||0),maxFinancial=Math.max(expected,collected,expenses,Math.abs(noi),1),attention=data.unitsRequiringAttention||[];const bar=(label,value,color='')=>`<div class="portfolio-bar-row"><span>${label}</span><div class="portfolio-bar-track"><span style="width:${Math.abs(value)/maxFinancial*100}%;${color?`background:${color}`:''}"></span></div><strong>${portfolioMoney(value)}</strong></div>`;const content=`<div class="portfolio-inline-summary"><div><span>Total units</span><strong>${Number(s.totalUnits||s.total||0)}</strong></div><div><span>Vacant units</span><strong>${Number(s.vacant||0)}</strong></div><div><span>Open maintenance</span><strong>${Number(s.openMaintenance||0)}</strong></div><div><span>Delinquent tenants</span><strong>${Number(d.tenantCount||0)}</strong></div></div><div class="portfolio-property-visual"><section class="portfolio-visual-card"><h4>Occupancy</h4><div class="portfolio-visual-chart"><div class="portfolio-donut" style="--value:${occupancy}"><strong>${occupancy.toFixed(1)}%</strong></div></div></section><section class="portfolio-visual-card"><h4>Rent collection</h4><div class="portfolio-visual-chart"><div class="portfolio-donut" style="--value:${collection}"><strong>${collection.toFixed(1)}%</strong></div></div></section><section class="portfolio-visual-card"><h4>Financial performance</h4>${bar('Rent roll',expected)}${bar('Collected',collected)}${bar('Expenses',expenses,'linear-gradient(90deg,#f59e0b,#fb7185)')}${bar('Est. NOI',noi,noi>=0?'linear-gradient(90deg,#059669,#34d399)':'linear-gradient(90deg,#dc2626,#fb7185)')}</section><section class="portfolio-visual-card"><h4>Attention summary</h4>${portfolioDrawerRows([['Outstanding',portfolioMoney(s.rentOutstanding??d.total)],['Collection rate',`${collection.toFixed(1)}%`],['Units requiring attention',attention.length],['Budget variance',f.budgetVariance==null?'Not set':portfolioMoney(f.budgetVariance)]])}</section></div>${attention.length?`<section class="portfolio-visual-card" style="margin-top:12px"><h4>Units requiring attention</h4><table class="portfolio-performance-table"><thead><tr><th>Unit</th><th>Status</th><th>Reasons</th><th>Rent</th></tr></thead><tbody>${attention.slice(0,12).map(u=>`<tr><td>Unit ${escapeHtml(u.number||'—')}</td><td>${escapeHtml(u.status||'—')}</td><td>${escapeHtml((u.reasons||[]).join(', ')||'Review')}</td><td>${portfolioMoney(u.rent)}</td></tr>`).join('')}</tbody></table></section>`:''}`;showPortfolioInlineWorkspace(`<i class="fas fa-chart-pie"></i> ${escapeHtml(property.name||'Property')} overview`,`${formatAddress(property.address).replace(/<br>/g,', ')} · ${range.label}`,content,'properties');}catch{document.getElementById('portfolioComparisonTable').innerHTML='<div class="empty-compact">Unable to load this property overview.</div>';}}

function getPortfolioComparisonActionConfig(mode=state.portfolioWorkspaceMode||'properties'){if(mode==='maintenance')return{label:'New',title:'Create a new maintenance request',icon:'fa-plus',hoverInline:false};if(mode==='applications')return{label:'Send Application',title:'Send a rental application link',icon:'fa-paper-plane',hoverInline:false};return null;}

function syncPortfolioComparisonAction(mode=state.portfolioWorkspaceMode||'properties'){const button=document.getElementById('portfolioRecordPayment'),label=document.getElementById('portfolioRecordPaymentLabel'),icon=button?.querySelector('i');if(!button||!label||!icon)return;const config=getPortfolioComparisonActionConfig(mode);if(!config){button.hidden=true;button.style.display='none';return;}button.hidden=false;button.style.display='';button.classList.toggle('portfolio-hover-inline-action',!!config.hoverInline);icon.className=`fas ${config.icon}`;label.textContent=config.label;button.setAttribute('title',config.title);button.setAttribute('aria-label',config.label.replace(/^\+\s*/,'Add '));}

function triggerPortfolioComparisonAction(){const mode=state.portfolioWorkspaceMode||'properties';if(mode==='maintenance'){const form=document.getElementById('addMaintenanceForm');if(!form)return;form.dataset.context='portfolio';populateMaintenancePropertySelect();populateMaintenanceVendorSelect('maintenanceVendor');const unitSelect=document.getElementById('maintenanceUnit');if(unitSelect)unitSelect.innerHTML='<option value="">Select a unit</option>';openModal('addMaintenanceModal');return;}if(mode==='applications'){document.getElementById('sendApplicationBtn')?.click();return;}if(mode==='rent')openPaymentModalForTenantAndProperty(null,'__portfolio__',false);}

function returnFromPortfolioInline(){restorePortfolioWorkspaceControls();setPortfolioWorkspaceMode(state.portfolioInlineReturnMode||'properties');}

function setupPortfolioExecutiveControls(){const root=document.getElementById('portfolioOverviewSection');if(!root||root.dataset.executiveBound)return;root.dataset.executiveBound='true';['portfolioExecutivePeriod','portfolioExecutiveProperty','portfolioExecutiveStatus','portfolioExecutiveCompare'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>renderPortfolioExecutiveDashboard()));document.getElementById('portfolioComparisonSearch')?.addEventListener('input',()=>{state.portfolioComparisonPage=1;renderUnifiedPortfolioWorkspace(false)});document.getElementById('portfolioComparisonSort')?.addEventListener('change',()=>renderUnifiedPortfolioWorkspace(false));document.getElementById('portfolioPageSize')?.addEventListener('change',()=>{state.portfolioComparisonPage=1;renderUnifiedPortfolioWorkspace(false)});document.getElementById('portfolioWorkspaceFilter')?.addEventListener('change',()=>{state.portfolioComparisonPage=1;renderUnifiedPortfolioWorkspace(false)});document.getElementById('portfolioWorkspaceBack')?.addEventListener('click',returnFromPortfolioInline);document.getElementById('portfolioRecordPayment')?.addEventListener('click',triggerPortfolioComparisonAction);document.getElementById('portfolioTasksToggle')?.addEventListener('click',()=>togglePortfolioTasksDrawer());document.getElementById('portfolioExecutiveRefresh')?.addEventListener('click',()=>renderPortfolioOverview());document.getElementById('portfolioExecutiveExport')?.addEventListener('click',exportPortfolioComparison);root.addEventListener('click',event=>{const workspaceType=event.target.closest('[data-workspace-type]');if(workspaceType){const value=workspaceType.dataset.workspaceType;if(value.startsWith('upcoming-')){document.getElementById('portfolioUpcomingPeriod').value=value.split('-')[1];updatePortfolioUpcomingCard();}else if(state.portfolioWorkspaceMode==='applications')state.portfolioApplicationType=value;else if(state.portfolioWorkspaceMode==='maintenance')state.portfolioMaintenanceType=value;else if(value.startsWith('unit-'))state.portfolioUnitType=value.split('-')[1];renderUnifiedPortfolioWorkspace(false);return;}const tab=event.target.closest('[data-portfolio-view]');if(tab){restorePortfolioWorkspaceControls();setPortfolioWorkspaceMode(tab.dataset.portfolioView);}const card=event.target.closest('[data-portfolio-drill]');if(card)openPortfolioDrill(card.dataset.portfolioDrill);});}

function openPortfolioDrill(type){const map={properties:'properties',occupancy:'vacant',units:'vacant',tenants:'tenants',rent:'rent',collection:'rent',delinquency:'rent',maintenance:'maintenance',applications:'applications',leases:'upcoming'};if(type==='quickbooks'){setPortfolioWorkspaceMode('properties');return;}setPortfolioWorkspaceMode(map[type]||'properties');}

function exportPortfolioComparison(){const rows=state.portfolioComparisonRows||[];const csv=[['Property','Units','Occupancy','Rent Roll','Collected','Collection Rate','Outstanding','Expenses','Estimated NOI','Open Maintenance','Delinquent Tenants','QuickBooks'],...rows.map(r=>[r.property.name,r.units,r.occupancy.toFixed(1),r.expected,r.collected,r.collection.toFixed(1),r.outstanding,r.expenses,r.noi,r.maintenance,r.delinquent,r.qbConnected?'Connected':'Local only'])].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`portfolio-performance-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);}

function setPortfolioInitialLoadingState(){
    ['portfolioOpenRentAmount','portfolioOpenRentCount','portfolioRentCollectedSummary','portfolioTotalRentSummary','portfolioTenantsCount','portfolioTenantsSummary','portfolioOpenMaintenanceCount','portfolioApplicationsCount','portfolioApplicationsSummary','portfolioExpiringLeasesCount','portfolioExpiringLeasesBreakdown','portfolioVacantUnitsCount','portfolioVacancySummary'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.add('portfolio-local-loading');el.textContent='Loading';}});
    const kpis=document.getElementById('portfolioExecutiveKpis'),table=document.getElementById('portfolioComparisonTable'),tasks=document.getElementById('portfolioTasksList');
    if(kpis)kpis.innerHTML=Array.from({length:8},()=>'<div class="portfolio-executive-card portfolio-skeleton">Loading</div>').join('');
    if(table)table.innerHTML='<div class="portfolio-table-loader"><i class="fas fa-circle-notch fa-spin"></i><span>Loading portfolio workspace…</span></div>';
    if(tasks)tasks.innerHTML='<div class="portfolio-table-loader" style="min-height:90px"><i class="fas fa-circle-notch fa-spin"></i><span>Loading tasks…</span></div>';
}

function clearPortfolioLocalLoaders(){document.querySelectorAll('#portfolioOverviewSection .portfolio-local-loading').forEach(el=>el.classList.remove('portfolio-local-loading'));}

async function renderPortfolioEvictionsWorkspace(resetFilter=true){
    const root=document.getElementById('portfolioComparisonTable'),pager=document.getElementById('portfolioComparisonPagination'),title=document.getElementById('portfolioWorkspaceTitle'),summary=document.getElementById('portfolioWorkspaceSummary'),filter=document.getElementById('portfolioWorkspaceFilter'),sort=document.getElementById('portfolioComparisonSort'),toggle=document.getElementById('portfolioWorkspaceTypeToggle');
    if(!root||!pager||!title||!filter)return;
    document.querySelectorAll('[data-portfolio-view]').forEach(button=>button.classList.toggle('active',button.dataset.portfolioView==='evictions'));
    document.getElementById('portfolioWorkspaceBack').hidden=false;
    state.portfolioInlineReturnMode='properties';
    title.innerHTML='<i class="fas fa-gavel"></i> Evictions';
    summary.textContent='Active eviction cases across all properties.';
    if(toggle)toggle.hidden=true;
    if(sort)sort.style.display='none';
    document.getElementById('portfolioComparisonSearch').style.display='';
    filter.style.display='';
    if(resetFilter){filter.innerHTML='<option value="all">All stages</option>'+['review','notices','resolution','court','judgment','possession'].map(stage=>`<option value="${stage}">${stage.replace(/^./,letter=>letter.toUpperCase())}</option>`).join('');filter.value='all';}
    if(!Array.isArray(state.portfolioEvictions)){
        root.innerHTML='<div class="portfolio-table-loader"><i class="fas fa-circle-notch fa-spin"></i><span>Loading active evictions...</span></div>';pager.innerHTML='';
        state.portfolioEvictionsPromise=state.portfolioEvictionsPromise||fetch('/api/eviction-cases').then(response=>{if(!response.ok)throw Error('Unable to load eviction cases');return response.json();}).then(cases=>{state.portfolioEvictions=cases.filter(item=>item.active);}).finally(()=>{state.portfolioEvictionsPromise=null;});
        try{await state.portfolioEvictionsPromise;if(state.portfolioWorkspaceMode==='evictions')return renderPortfolioEvictionsWorkspace(false);}catch(error){console.error(error);if(state.portfolioWorkspaceMode==='evictions')root.innerHTML='<div class="empty-compact">Unable to load eviction cases.</div>';}
        return;
    }
    const propertyIds=new Set((state.properties||[]).map(property=>String(property._id))),query=String(document.getElementById('portfolioComparisonSearch')?.value||'').toLowerCase(),stage=filter.value||'all';
    let cases=state.portfolioEvictions.filter(item=>propertyIds.has(String(item.projectId))&&(stage==='all'||item.stage===stage)&&(!query||`${item.snapshot?.tenantName||''} ${item.snapshot?.propertyName||''} ${item.owner||''} ${item.nextAction||''}`.toLowerCase().includes(query)));
    const size=Number(state.portfolioRowsPerPage||15),pages=Math.max(1,Math.ceil(cases.length/size)),page=Math.min(state.portfolioComparisonPage||1,pages),visible=cases.slice((page-1)*size,page*size);state.portfolioComparisonPage=page;
    root.innerHTML=visible.length?`<table class="portfolio-performance-table"><thead><tr><th>Tenant</th><th>Property</th><th>Stage</th><th>Case Manager</th><th>Next Action</th><th>Due</th><th>Updated</th><th></th></tr></thead><tbody>${visible.map(item=>`<tr data-portfolio-eviction="${escapeHtml(item._id)}" tabindex="0" style="cursor:pointer"><td><span class="portfolio-record-primary">${escapeHtml(item.snapshot?.tenantName||'Unknown tenant')}</span></td><td>${escapeHtml(item.snapshot?.propertyName||portfolioPropertyName(item.projectId))}</td><td><span class="status-badge">${escapeHtml(portfolioStatus(item.stage))}</span></td><td>${escapeHtml(item.owner||'—')}</td><td>${escapeHtml(item.nextAction||'—')}</td><td>${portfolioDate(item.dueAt)}</td><td>${portfolioDate(item.updatedAt)}</td><td><button type="button" class="overview-row-action" data-open-portfolio-eviction>Open</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty-compact">No active evictions match the current portfolio filters.</div>';
    root.querySelectorAll('[data-portfolio-eviction]').forEach(row=>{const open=()=>openEvictionCase(row.dataset.portfolioEviction,()=>setPortfolioWorkspaceMode('evictions'));row.onclick=event=>{if(event.target.closest('button')&&!event.target.closest('[data-open-portfolio-eviction]'))return;open();};row.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&event.target===row){event.preventDefault();open();}};});
    pager.innerHTML=`<button ${page<=1?'disabled':''} onclick="state.portfolioComparisonPage--;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${page} of ${pages} · ${cases.length} active cases</span><button ${page>=pages?'disabled':''} onclick="state.portfolioComparisonPage++;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-right"></i></button>`;
    addPortfolioPageSizeToPagination();syncPortfolioComparisonAction('evictions');
}

function addPortfolioPageSizeToPagination(){
    const pager=document.getElementById('portfolioComparisonPagination');if(!pager||document.getElementById('portfolioPageSize'))return;
    const current=Number(state.portfolioRowsPerPage||15);
    pager.insertAdjacentHTML('afterbegin',`<label class="portfolio-page-size">Rows per page <select id="portfolioPageSize" class="pm-page-size" aria-label="Rows per page">${[10,15,25,50].map(n=>`<option value="${n}" ${n===current?'selected':''}>${n}</option>`).join('')}</select></label>`);
}



function getPortfolioTenantWorkspaceView(){return state.portfolioTenantView==='grid'?'grid':'list';}

function getPortfolioTenantWorkspaceItems(){const propertyIds=new Set(getPortfolioFilteredProperties().map(p=>String(p._id))),query=String(document.getElementById('portfolioComparisonSearch')?.value||'').toLowerCase(),filterValue=document.getElementById('portfolioWorkspaceFilter')?.value||'all';let items=(state.allTenants||[]).filter(t=>propertyIds.has(portfolioPropertyId(t))).map(tenant=>{const propertyName=portfolioPropertyName(portfolioPropertyId(tenant)),unitLabel=portfolioUnitName(tenant.unitId?._id||tenant.unitId),notesCount=Array.isArray(tenant.notesHistory)?tenant.notesHistory.length:0,status=portfolioStatus(tenant.leaseStatus||tenant.status),balance=(state.portfolioTenantsWithBalance||[]).find(x=>String(x.tenant?._id)===String(tenant._id));const name=tenant.fullName||tenant.name||`${tenant.firstName||''} ${tenant.lastName||''}`.trim()||'Tenant',email=tenant.email||tenant.tenantEmail||'',phone=tenant.phone||tenant.tenantPhone||'';return{tenant,propertyName,unitLabel,notesCount,status,balance,name,email,phone,search:`${name} ${email} ${phone} ${propertyName} ${unitLabel} ${status}`.toLowerCase()};});if(filterValue!=='all')items=items.filter(item=>item.status===filterValue);if(query)items=items.filter(item=>item.search.includes(query));return items;}

function getPortfolioTenantWorkspacePage(items){const size=Number(document.getElementById('portfolioPageSize')?.value||state.portfolioRowsPerPage||15),pages=Math.max(1,Math.ceil(items.length/size)),page=Math.min(state.portfolioComparisonPage||1,pages),visible=items.slice((page-1)*size,page*size);state.portfolioComparisonPage=page;return{size,pages,page,visible};}

function renderPortfolioTenantNotesBadge(tenant){const count=Array.isArray(tenant?.notesHistory)?tenant.notesHistory.length:0;return `<button type="button" class="portfolio-note-count" onclick="event.stopPropagation();openPortfolioRecordDrawer('tenant','${tenant?._id||''}')" title="Open tenant drawer"><i class="fas fa-note-sticky"></i> ${count}</button>`;}

function renderPortfolioTenantGridCard(item){const tenant=item.tenant||{},name=item.name||tenant.name||'Tenant',initials=escapeHtml(name.split(' ').map(part=>part[0]||'').join('').slice(0,2).toUpperCase()||'T'),assignedUnit=tenant.unitId&&typeof tenant.unitId==='object'?tenant.unitId:null,leaseStart=portfolioDate(tenant.leaseStart),leaseEnd=portfolioDate(tenant.leaseEnd),leaseStatus=tenant.leaseStatus||tenant.status||'active',leaseStatusText=String(leaseStatus).charAt(0).toUpperCase()+String(leaseStatus).slice(1),parkingAssignment=tenant.parking||assignedUnit?.parkingLabel||assignedUnit?.parking||'Unassigned',petFees=tenant.pets?.hasPets?(Number(tenant.pets.monthlyRent)||0):0,additionalFees=(Number(tenant.waterFee)||0)+(Number(tenant.trashFee)||0)+(Number(tenant.adminFee)||0)+(tenant.additionalFee?.amount||0)+petFees,totalRent=(Number(tenant.baseRent)||0)+additionalFees,recentNotes=(Array.isArray(tenant.notesHistory)?tenant.notesHistory:[]).slice().sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0)).slice(-8),notesMarkup=recentNotes.length?recentNotes.map(note=>`<div class="tenant-card-note"><div class="tenant-card-note-bubble" style="border:1px solid ${note.authorRole==='tenant'?'#bfdbfe':'#bbf7d0'};background:${note.authorRole==='tenant'?'#eff6ff':'#ecfdf5'};"><div style="font-weight:700;font-size:0.8rem;color:#0f172a;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><span>${escapeHtml(note.authorName||note.createdByName||note.managerName||note.createdBy||'Management')}</span><span style="font-weight:500;color:#64748b;">${escapeHtml(note.createdAt?new Date(note.createdAt).toLocaleString('en-US'):'')}</span></div><div style="font-size:0.84rem;color:#475569;margin-top:3px;white-space:pre-line;">${escapeHtml(note.text||note.note||note.content||'')}</div></div></div>`).join(''):'<div style="font-size:0.84rem;color:#64748b;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#fff;">No notes yet. Start the conversation below.</div>';const emergency=tenant.emergencyContact?`<div class="tenant-detail-row" style="overflow-x:auto;white-space:nowrap;gap:18px;"><span><i class="fas fa-user-shield"></i> ${escapeHtml(tenant.emergencyContact.name||'N/A')}</span><span><i class="fas fa-phone"></i> ${escapeHtml(tenant.emergencyContact.phone||'N/A')}</span></div>`:'<span class="tenant-detail-value">N/A</span>';let leaseCountdownHtml='';if(tenant.leaseEnd){const today=new Date(),leaseEndDate=new Date(tenant.leaseEnd),diffDays=Math.ceil((leaseEndDate-today)/(1000*60*60*24));if(diffDays<=60&&diffDays>0&&(tenant.leaseStatus==='active'||tenant.leaseStatus==='pending'))leaseCountdownHtml=`<div class="tenant-detail-row" style="margin-top:8px;"><span style="color:#f39c12;font-weight:600;"><i class="fas fa-hourglass-half"></i> Lease expires in <span style="font-size:1.08em;color:#d35400;">${diffDays} day${diffDays!==1?'s':''}</span></span></div>`;}let rentStatusBadge='';const expectedMonthly=Math.max(0,totalRent),remainingRent=Math.max(0,Number(item.balance?.remainingRent||0)),paidThisMonth=Math.max(0,expectedMonthly-remainingRent),dueDate=new Date(new Date().getFullYear(),new Date().getMonth(),1),daysUntilDue=Math.floor((dueDate-new Date())/(1000*60*60*24));if(remainingRent>0){if(daysUntilDue<0)rentStatusBadge=`<span class="rent-badge overdue"><i class="fas fa-exclamation-circle"></i> OVERDUE • $${remainingRent.toFixed(2)}</span>`;else if(daysUntilDue<=3)rentStatusBadge=`<span class="rent-badge due-soon"><i class="fas fa-clock"></i> DUE IN ${daysUntilDue}d • $${remainingRent.toFixed(2)}</span>`;else if(paidThisMonth>0&&remainingRent>0)rentStatusBadge=`<span class="rent-badge partial"><i class="fas fa-adjust"></i> PARTIAL • ${expectedMonthly?((paidThisMonth/expectedMonthly)*100).toFixed(0):0}%</span>`;}return `<div class="tenant-card" data-portfolio-tenant-card="${tenant._id}" style="min-width:0;"><div class="tenant-header"><div class="tenant-avatar-small">${initials}</div><h3>${escapeHtml(name)}</h3><div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">${renderPortfolioTenantNotesBadge(tenant)}<button type="button" onclick="openPortfolioRecordDrawer('tenant','${tenant._id}')" class="btn-secondary"><i class="fas fa-eye"></i> Details</button><button type="button" onclick="editTenant('${tenant._id}')" class="btn-secondary"><i class="fas fa-pen"></i> Edit</button></div></div><div class="tenant-card-scroll" style="overflow:hidden;"><div class="tenant-card-layout portfolio-tenant-card-columns"><div class="tenant-card-main portfolio-tenant-card-details"><div class="tenant-info"><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-building"></i> Property</div><div class="tenant-detail-row"><span>${escapeHtml(item.propertyName||'—')}</span></div><div class="tenant-detail-row">${assignedUnit?`Unit ${escapeHtml(assignedUnit.number||'—')} (${escapeHtml(String(assignedUnit.bedrooms??'N/A'))} bed, ${escapeHtml(String(assignedUnit.bathrooms??'N/A'))} bath)`:`Unit ${escapeHtml(item.unitLabel||'—')}`}</div><div class="tenant-detail-row"><span>Parking:</span><span>${escapeHtml(parkingAssignment)}</span></div><div class="tenant-detail-row"><span>Access Code:</span><span>${escapeHtml(tenant.accessCode||'Not set')}</span></div></div><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-address-card"></i> Contact</div><div class="tenant-detail-row"><span><i class="fas fa-phone"></i> ${escapeHtml(item.phone||'—')}</span></div><div class="tenant-detail-row"><span><i class="fas fa-envelope"></i> ${escapeHtml(item.email||'—')}</span></div></div><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-calendar-alt"></i> Lease</div><div class="tenant-detail-row"><span>Lease:</span><span>${escapeHtml(leaseStart)} - ${escapeHtml(leaseEnd)}</span></div>${leaseCountdownHtml}${rentStatusBadge?`<div class="tenant-detail-row">${rentStatusBadge}</div>`:''}<div class="tenant-detail-row"><span>Deposit:</span><span>$${(Number(tenant.deposit)||0).toFixed(2)}</span></div><div class="tenant-detail-row"><span>Base Rent:</span><span>$${(Number(tenant.baseRent)||0).toFixed(2)}</span></div><div class="tenant-detail-row"><span>Total Fees:</span><span style="font-weight:600;color:#2980b9;">$${additionalFees.toFixed(2)}</span></div><div class="tenant-detail-row"><span>Total Rent:</span><span style="font-weight:700;color:#217dbb;font-size:1.08em;letter-spacing:0.5px;background:#eaf6ff;padding:3px 12px;border-radius:12px;">$${totalRent.toFixed(2)}</span></div><div class="tenant-detail-row"><span>Balance:</span><span>${portfolioMoney(item.balance?.remainingRent||0)}</span></div><div class="tenant-detail-row"><span>Status:</span><span class="lease-badge ${escapeHtml(String(leaseStatus).toLowerCase())}"><i class="fas fa-circle"></i>${escapeHtml(leaseStatusText)}</span></div></div><div class="tenant-section"><div class="tenant-section-title"><i class="fas fa-user-shield"></i> Emergency</div>${emergency}</div></div></div><div class="maintenance-thread compact-maintenance-thread tenant-card-thread portfolio-tenant-card-notes"><div class="tenant-card-thread-header"><span><i class="fas fa-comments" style="color:#2563eb;margin-right:6px;"></i>Tenant Notes</span><span style="font-size:0.8rem;color:#64748b;">${item.notesCount}</span></div><div class="maintenance-thread-messages" style="display:grid;gap:6px;margin-bottom:0;padding-right:4px;align-content:start;scrollbar-width:none;min-height:0;">${notesMarkup}</div></div></div></div></div>`;}

function enhancePortfolioTenantListView(){const table=document.querySelector('#portfolioComparisonTable .portfolio-performance-table');if(!table)return;const head=table.querySelector('thead tr'),body=table.querySelector('tbody');if(!head||!body)return;const items=getPortfolioTenantWorkspaceItems(),page=getPortfolioTenantWorkspacePage(items);if(!head.querySelector('[data-tenant-notes-column]'))head.lastElementChild?.insertAdjacentHTML('beforebegin','<th data-tenant-notes-column>Notes</th>');const rows=Array.from(body.querySelectorAll('tr'));if(rows.length===1&&rows[0].children.length===1){rows[0].children[0].colSpan=10;return;}rows.forEach((row,index)=>{const item=page.visible[index];if(!item)return;row.dataset.tenantId=item.tenant._id;row.tabIndex=0;row.style.cursor='pointer';if(row.dataset.portfolioTenantBound!=='true'){row.addEventListener('click',event=>{if(event.target.closest('button,a,input,select,textarea'))return;openPortfolioRecordDrawer('tenant',row.dataset.tenantId);});row.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;if(event.target.closest('button,a,input,select,textarea'))return;event.preventDefault();openPortfolioRecordDrawer('tenant',row.dataset.tenantId);});row.dataset.portfolioTenantBound='true';}const cells=row.querySelectorAll('td');const actionCell=cells[cells.length-1];if(!actionCell)return;let notesCell=row.querySelector('[data-tenant-notes-cell]');if(!notesCell){notesCell=document.createElement('td');notesCell.dataset.tenantNotesCell='true';row.insertBefore(notesCell,actionCell);}notesCell.innerHTML=renderPortfolioTenantNotesBadge(item.tenant);actionCell.innerHTML=`<button type="button" class="overview-row-action" onclick="event.stopPropagation();editTenant('${item.tenant._id}')" title="Edit tenant"><i class="fas fa-pen"></i></button>`;});}

function renderPortfolioTenantGridView(){const root=document.getElementById('portfolioComparisonTable'),pager=document.getElementById('portfolioComparisonPagination');if(!root||!pager)return;const items=getPortfolioTenantWorkspaceItems(),page=getPortfolioTenantWorkspacePage(items);root.innerHTML=page.visible.length?`<div class="portfolio-tenant-card-grid">${page.visible.map(renderPortfolioTenantGridCard).join('')}</div>`:'<div class="empty-compact">No tenants match the current filters.</div>';pager.innerHTML=`<button ${page.page<=1?'disabled':''} onclick="state.portfolioComparisonPage--;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${page.page} of ${page.pages} · ${items.length} records</span><button ${page.page>=page.pages?'disabled':''} onclick="state.portfolioComparisonPage++;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-right"></i></button>`;}

function renderPortfolioTenantsWorkspace(){const toggle=document.getElementById('portfolioWorkspaceTypeToggle');if(!toggle)return;const view=getPortfolioTenantWorkspaceView();toggle.hidden=false;toggle.innerHTML=`<span class="portfolio-maintenance-view-toggle"><button class="${view==='list'?'active':''}" data-tenant-view="list" title="List view"><i class="fas fa-list"></i></button><button class="${view==='grid'?'active':''}" data-tenant-view="grid" title="Grid view"><i class="fas fa-table-cells-large"></i></button></span>`;if(view==='grid')renderPortfolioTenantGridView();else enhancePortfolioTenantListView();}

function renderPortfolioMaintenanceWorkspace(){
    const root=document.getElementById('portfolioComparisonTable'),toggle=document.getElementById('portfolioWorkspaceTypeToggle'),filter=document.getElementById('portfolioWorkspaceFilter');if(!root||!toggle)return;
    initializePortfolioMaintenanceWorkspaceCardHandlers();
    if(!Array.isArray(state.vendors)||!state.vendors.length){
        root.innerHTML=`<div class="portfolio-table-loader"><i class="fas fa-circle-notch fa-spin"></i><span>Loading maintenance</span></div>`;
        if(!state._portfolioMaintenanceWorkspaceVendorsLoading){
            state._portfolioMaintenanceWorkspaceVendorsLoading=true;
            loadMaintenanceVendors()
                .then(()=>{
                    if((state.portfolioWorkspaceMode||'properties')==='maintenance'){
                        renderUnifiedPortfolioWorkspace(false);
                    }
                })
                .catch(error=>{
                    console.error('Error loading portfolio maintenance workspace vendors:',error);
                    if((state.portfolioWorkspaceMode||'properties')==='maintenance'){
                        root.innerHTML='<div class="empty-compact">Unable to load maintenance vendors.</div>';
                    }
                })
                .finally(()=>{
                    state._portfolioMaintenanceWorkspaceVendorsLoading=false;
                });
        }
        return;
    }
    const view=state.portfolioMaintenanceView||'list',type=state.portfolioMaintenanceType||'request';
    document.querySelector('.portfolio-comparison-panel')?.classList.toggle('portfolio-maintenance-list-mode',view==='list');
    toggle.hidden=false;toggle.insertAdjacentHTML('beforeend',`<span class="portfolio-maintenance-view-toggle"><button class="${view==='list'?'active':''}" data-maint-view="list" title="List view"><i class="fas fa-list"></i></button><button class="${view==='card'?'active':''}" data-maint-view="card" title="Card and chat view"><i class="fas fa-table-cells-large"></i></button></span>`);
    const propertyIds=new Set(getPortfolioFilteredProperties().map(p=>String(p._id))),query=String(document.getElementById('portfolioComparisonSearch')?.value||'').toLowerCase();
    let items=(type==='recurring'?state.portfolioRecurringMaintenance:state.portfolioMaintenance)||[];
    const availableItems=items.filter(m=>propertyIds.has(portfolioPropertyId(m)));
    const statusFilter=renderPortfolioMaintenanceWorkspaceFilter(filter,availableItems,type);
    items=availableItems.filter(m=>{
        if(statusFilter&&getPortfolioMaintenanceStatusValue(m,type)!==statusFilter)return false;
        if(query&&!`${m.title||m.issue||''} ${m.description||''} ${portfolioPropertyName(portfolioPropertyId(m))}`.toLowerCase().includes(query))return false;
        return true;
    });
    const size=Number(state.portfolioRowsPerPage||15),pages=Math.max(1,Math.ceil(items.length/size)),page=Math.min(state.portfolioComparisonPage||1,pages),visible=items.slice((page-1)*size,page*size);
    if(view==='card'){
        root.innerHTML=visible.length?`<div class="portfolio-maintenance-cards">${visible.map(item=>type==='recurring'?renderPortfolioRecurringMaintenanceCard(item):renderPortfolioMaintenanceRequestCard(item)).join('')}</div>`:'<div class="empty-compact">No maintenance records match the current filters.</div>';
        if(type==='request'&&visible.length){
            scheduleMaintenancePhotoHydration('portfolio');
        }
    }else{
        const headers=type==='recurring'
            ? ['Property','Unit','Type','Description','Assigned','Scheduled','Cost','Workflow','Next Due','Actions']
            : ['Property','Unit','Type','Description','Assigned','Scheduled','Cost','Workflow','Created','Actions'];
        const rowsHtml=visible.map(item=>type==='recurring'?renderPortfolioRecurringMaintenanceRow(item):renderPortfolioMaintenanceRequestRow(item)).join('');
        root.innerHTML=visible.length
            ? `<div style="overflow-x:auto;"><table id="portfolioMaintenanceListTable" class="maintenance-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(44,62,80,0.07);"><thead><tr>${headers.map(header=>`<th style="padding:9px 8px;font-weight:600;color:#4b5563;text-align:left;">${header}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`
            : '<div class="empty-compact">No maintenance records match the current filters.</div>';
    }
    const pager=document.getElementById('portfolioComparisonPagination');if(pager)pager.innerHTML=`<button ${page<=1?'disabled':''} onclick="state.portfolioComparisonPage--;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-left"></i></button><span class="task-meta">Page ${page} of ${pages} · ${items.length} records</span><button ${page>=pages?'disabled':''} onclick="state.portfolioComparisonPage++;renderUnifiedPortfolioWorkspace(false)"><i class="fas fa-chevron-right"></i></button>`;
}

function initializePortfolioMaintenanceWorkspaceCardHandlers(){
    const root=document.getElementById('portfolioComparisonTable');if(!root||root.dataset.portfolioMaintenanceCardBound==='true')return;
    root.addEventListener('click',event=>{
        if((state.portfolioWorkspaceMode||'properties')!=='maintenance'||(state.portfolioMaintenanceView||'list')!=='list')return;
        if(event.target.closest('button, select, input, a, textarea'))return;
        const row=event.target.closest('#portfolioMaintenanceListTable tr[data-maint-id][data-maint-source]');
        if(!row)return;
        event.preventDefault();
        if(row.dataset.maintSource==='recurring'){
            const schedule=(state.portfolioRecurringMaintenance||[]).find(item=>String(item._id)===String(row.dataset.maintId));
            if(!schedule){
                showNotification('Unable to open recurring maintenance row editor','error');
                return;
            }
            enterRecurringMaintenanceRowEditMode(row,schedule,{
                refreshPortfolio:true,
                editingKey:'currentEditingPortfolioRecurringMaintenanceId',
                beforeSave:()=>{
                    state.keepPortfolioMaintenanceFiltersOnNextRender=true;
                },
                setSaving:(scheduleId,isSaving)=>{
                    setPortfolioMaintenanceItemSaving(scheduleId,'recurring',isSaving);
                }
            });
            return;
        }
        const request=(state.portfolioMaintenance||[]).find(item=>String(item._id)===String(row.dataset.maintId));
        if(!request){
            showNotification('Unable to open maintenance row editor','error');
            return;
        }
        enterPortfolioMaintenanceEditMode(row,request);
    });
    root.addEventListener('change',async event=>{
        if((state.portfolioWorkspaceMode||'properties')!=='maintenance')return;
        const listRow=event.target.closest('#portfolioMaintenanceListTable tr[data-maint-id][data-project-id]');
        const card=event.target.closest('[data-maint-id][data-project-id]');
        const target=listRow||card;
        if(!target||!root.contains(target))return;
        if(card&&!listRow&&(state.portfolioMaintenanceView||'list')!=='card'&&!card.closest('.rm-expanded-row'))return;

        const recurringChangedField=event.target.closest('.recurring-maintenance-inline-vendor, .recurring-maintenance-inline-start-date, .recurring-maintenance-inline-status');
        if(recurringChangedField){
            if(target.dataset.isSaving==='true')return;
            const vendorField=target.querySelector('.recurring-maintenance-inline-vendor');
            const startDateField=target.querySelector('.recurring-maintenance-inline-start-date');
            const statusField=target.querySelector('.recurring-maintenance-inline-status');
            const isVendorAssignmentSave=recurringChangedField.matches('.recurring-maintenance-inline-vendor');
            try{
                target.dataset.isSaving='true';
                [startDateField,statusField].forEach(field=>{if(field)field.disabled=true;});
                setMaintenanceVendorComboboxDisabled(vendorField,true);
                setMaintenanceVendorComboboxLoading(vendorField,isVendorAssignmentSave);
                state.keepPortfolioMaintenanceFiltersOnNextRender=true;
                setPortfolioMaintenanceItemSaving(target.dataset.maintId,'recurring',true);
                await updatePortfolioRecurringMaintenanceSchedule(target.dataset.maintId,target.dataset.projectId,{
                    assignedVendor:vendorField?.value||null,
                    startDate:startDateField?.value?dateInputToISOAtNoon(startDateField.value):'',
                    status:statusField?.value||'pending'
                },{refreshPortfolio:true});
                showNotification('Recurring maintenance updated','success');
            }catch(err){
                console.error('Error updating recurring maintenance from portfolio workspace:',err);
                showNotification('Could not update recurring maintenance','error');
            }finally{
                delete target.dataset.isSaving;
                [startDateField,statusField].forEach(field=>{if(field)field.disabled=false;});
                setMaintenanceVendorComboboxLoading(vendorField,false);
                setMaintenanceVendorComboboxDisabled(vendorField,false);
                setPortfolioMaintenanceItemSaving(target.dataset.maintId,'recurring',false);
            }
            return;
        }

        const changedField=event.target.closest('.maintenance-inline-workflow, .maintenance-inline-vendor, .maintenance-inline-scheduled');
        if(!changedField||target.dataset.maintSource==='recurring')return;
        const editor=changedField.closest('.maintenance-inline-editor');
        const requestId=editor?.getAttribute('data-request-id')||target.getAttribute('data-maint-id');
        const projectId=target.getAttribute('data-project-id');
        const requestEditor=editor||target;
        if(!requestEditor||!requestId||!projectId||requestEditor.dataset.isSaving==='true')return;

        const workflowSelect=requestEditor.querySelector('.maintenance-inline-workflow');
        const vendorSelect=requestEditor.querySelector('.maintenance-inline-vendor');
        const scheduledInput=requestEditor.querySelector('.maintenance-inline-scheduled');
        const isVendorAssignmentSave=changedField.matches('.maintenance-inline-vendor');
        const payload={
            workflowStage:workflowSelect?.value||'new',
            assignedVendor:vendorSelect?.value||'',
            scheduledFor:scheduledInput?.value||''
        };

        try{
            requestEditor.dataset.isSaving='true';
            target.dataset.isSaving='true';
            [workflowSelect,scheduledInput].forEach(field=>{if(field)field.disabled=true;});
            setMaintenanceVendorComboboxDisabled(vendorSelect,true);
            setMaintenanceVendorComboboxLoading(vendorSelect,isVendorAssignmentSave);
            state.keepPortfolioMaintenanceFiltersOnNextRender=true;
            setPortfolioMaintenanceItemSaving(requestId,'request',true);
            await updateMaintenanceInlineFields(projectId,requestId,payload,{refreshProperty:state.currentProperty&&String(state.currentProperty._id)===String(projectId),refreshPortfolio:true,refreshOverview:false});
            showNotification('Maintenance request updated','success');
        }catch(err){
            console.error('Error updating portfolio maintenance from workspace card view:',err);
            showNotification('Could not update maintenance request','error');
        }finally{
            delete requestEditor.dataset.isSaving;
            delete target.dataset.isSaving;
            [workflowSelect,scheduledInput].forEach(field=>{if(field)field.disabled=false;});
            setMaintenanceVendorComboboxLoading(vendorSelect,false);
            setMaintenanceVendorComboboxDisabled(vendorSelect,false);
            setPortfolioMaintenanceItemSaving(requestId,'request',false);
        }
    });
    root.dataset.portfolioMaintenanceCardBound='true';
}

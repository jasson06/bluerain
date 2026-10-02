'use strict';

// Occurrences own their evidence and review; the schedule owns only the next visit.
module.exports = function createMaintenanceQC({ MaintenanceSchedule, Estimate, Manager, jwt, secret, nextDate, syncVendor, syncVendorQC }) {
  const id = value => String(value?._id || value || '');
  const fail = (message, status = 409) => Object.assign(new Error(message), { status });
  const findItem = (estimate, itemId) => estimate?.lineItems.flatMap(section => section.items || []).find(item => id(item) === id(itemId));
  const photos = value => ({ before: [...new Set(value?.before || [])], after: [...new Set(value?.after || [])] });
  function mergePhotos(entry, item) {
    entry.photos = photos({
      before: [...(entry.photos?.before || []), ...(item.photos?.before || [])],
      after: [...(entry.photos?.after || []), ...(item.photos?.after || [])]
    });
  }
  function event(entry, status, notes, reviewer) {
    entry.reviews = entry.reviews || [];
    entry.reviews.push({ status, notes, reviewedAt: new Date(), reviewedBy: reviewer?._id,
      reviewerName: reviewer?.name || '', photos: photos(entry.photos) });
  }
  async function reviewer(req) {
    const rawToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const fallbackManagerId = String(req.headers['x-manager-id'] || req.body?.managerId || '').trim();
    let decoded = null;
    if (rawToken) {
      try { decoded = jwt.verify(rawToken, secret); }
      catch (error) {
        if (!fallbackManagerId) throw fail('Your manager session has expired. Sign in again to review maintenance.', 401);
      }
      if (decoded && !decoded.managerId) throw fail('Only managers can review maintenance.', 403);
    }
    const managerId = decoded?.managerId || fallbackManagerId;
    if (!managerId) throw fail('Sign in as a manager to review maintenance.', 401);
    const manager = await Manager.findById(managerId).select('_id name');
    if (!manager) throw fail('Manager account not found.', 403);
    return manager;
  }
  async function linked(entry) {
    const estimate = entry.estimateId ? await Estimate.findById(entry.estimateId) : null;
    return { estimate, item: findItem(estimate, entry.estimateItemId) };
  }
  async function historyDetails(schedule, entry) {
    const result = entry.toObject ? entry.toObject() : { ...entry };
    result.photos = photos(entry.photos);
    result.photoSource = result.photos.before.length || result.photos.after.length ? 'saved' : 'unavailable';
    // Keep the exact evidence reviewed at approval if an estimate is edited later.
    if (entry.qcStatus === 'approved') return result;
    const estimateId = entry.estimateId || schedule.linkedEstimateId;
    if (!estimateId) return result;
    const estimate = await Estimate.findById(estimateId);
    if (!estimate || id(estimate.projectId) !== id(schedule.projectId)) return result;
    const belongsToSchedule = candidate => id(candidate.maintenanceScheduleId) === id(schedule)
      || (!candidate.maintenanceScheduleId && id(candidate) === id(schedule.linkedEstimateItemId));
    let item = entry.estimateItemId ? findItem(estimate, entry.estimateItemId) : null;
    if (item && !belongsToSchedule(item)) return result;
    if (!entry.estimateItemId) {
      // Use the existing recurring link for older history only when one completed
      // item matches that date. Never substitute the current/next visit's photos.
      const day = value => {
        const date = value ? new Date(value) : null;
        return date && Number.isFinite(+date) ? date.toISOString().slice(0, 10) : '';
      };
      const completedDay = day(entry.completedAt);
      const sameDayEntries = (schedule.history || []).filter(history => day(history.completedAt) === completedDay);
      const candidates = estimate.lineItems.flatMap(section => section.items || []).filter(candidate =>
        belongsToSchedule(candidate)
        && ['completed', 'approved', 'rework'].includes(candidate.status)
        && completedDay && day(candidate.endDate) === completedDay
        && !(schedule.history || []).some(history => id(history) !== id(entry) && id(history.estimateItemId) === id(candidate)));
      if (sameDayEntries.length === 1 && candidates.length === 1) item = candidates[0];
    }
    if (item) {
      result.photos = photos(item.photos);
      result.photoSource = 'estimate';
    }
    return result;
  }
  async function syncItem(entry, estimate, item) {
    if (!item || !estimate) return;
    const latest = (entry.reviews || []).slice().reverse().find(review => ['approved', 'rework'].includes(review.status));
    const oldRework = item.qualityControl?.rework;
    item.qualityControl = { status: entry.qcStatus === 'awaiting-qc' ? 'pending' : entry.qcStatus,
      notes: latest?.notes || '', reviewedBy: latest?.reviewedBy, reviewedAt: latest?.reviewedAt,
      ...(oldRework ? { rework: oldRework.toObject ? oldRework.toObject() : oldRework } : {}) };
    if (entry.qcStatus === 'rework') item.qualityControl.rework = {
      note: latest?.notes || '', managerId: latest?.reviewedBy, requestedAt: latest?.reviewedAt,
      photos: entry.reworkPhotos || []
    };
    // A QC decision updates only QC metadata on this historical item. Do not
    // save the whole estimate or copy its work status/dates into vendor tasks.
    const qualityControl = item.qualityControl?.toObject ? item.qualityControl.toObject() : item.qualityControl;
    await Estimate.updateOne({ _id: estimate._id, 'lineItems.items._id': item._id }, {
      $set: { 'lineItems.$[].items.$[qcItem].qualityControl': qualityControl }
    }, { arrayFilters: [{ 'qcItem._id': item._id }], runValidators: true });
    await syncVendorQC(estimate, item, qualityControl);
  }
  async function complete(schedule, estimate, item, options = {}) {
    schedule.history = schedule.history || [];
    const existing = item && schedule.history.find(entry => id(entry.estimateItemId) === id(item));
    if (existing) {
      if (existing.qcStatus !== 'approved') mergePhotos(existing, item);
      // Work-status edits and uploads never advance the independent QC flow.
      await schedule.save();
      await syncItem(existing, estimate, item);
      return schedule;
    }
    const cycleKey = new Date(schedule.nextScheduledDate).toISOString();
    if (options.expectedNextScheduledDate && new Date(options.expectedNextScheduledDate).toISOString() !== cycleKey) {
      throw fail('This visit has already changed. Refresh before completing it.');
    }
    const completedAt = options.completedAt || new Date();
    schedule.history.push({ completedAt, submittedAt: completedAt, scheduledFor: schedule.nextScheduledDate,
      completedBy: options.completedBy || 'Manager', notes: options.notes || '',
      cost: Number(item?.total ?? schedule.cost) || 0,
      estimateId: estimate?._id || null, estimateItemId: item?._id || null,
      vendorId: item?.assignedTo || schedule.assignedVendor || null,
      photos: photos(item?.photos), qcStatus: 'awaiting-qc',
      reviews: [{ status: 'submitted', reviewedAt: completedAt, notes: options.notes || '', photos: photos(item?.photos) }] });
    schedule.status = 'pending';
    schedule.completedAt = null;
    schedule.startDate = completedAt;
    schedule.nextScheduledDate = nextDate(schedule, completedAt);
    schedule.linkedEstimateItemId = null;
    await schedule.save();
    const entry = schedule.history[schedule.history.length - 1];
    // Only the first work completion sets work status and dates, not later QC.
    if (item && estimate) {
      item.status = 'completed';
      item.endDate = completedAt;
      await Estimate.updateOne({ _id: estimate._id, 'lineItems.items._id': item._id }, {
        $set: { 'lineItems.$[].items.$[completedItem].status': 'completed',
          'lineItems.$[].items.$[completedItem].endDate': completedAt }
      }, { arrayFilters: [{ 'completedItem._id': item._id }] });
    }
    await syncItem(entry, estimate, item);
    if (item && estimate) await syncVendor(estimate, item, item.assignedTo);
    return schedule;
  }
  async function review(schedule, entry, status, notes, manager, reworkPhotos = [], expectedReviewCount) {
    if (!['approved', 'rework', 'resubmit'].includes(status)) throw fail('Invalid review action.', 400);
    notes = String(notes || '').trim();
    if (status === 'rework' && !notes) throw fail('Explain what needs to be corrected.', 400);
    if (!entry.qcStatus || entry.qcStatus === 'legacy') throw fail('This older completion has no verified QC record.');
    if (expectedReviewCount !== undefined && Number(expectedReviewCount) !== (entry.reviews || []).length) {
      throw fail('The review has changed. Refresh before submitting your decision.');
    }
    const { estimate, item } = await linked(entry);
    if (status === entry.qcStatus) { await syncItem(entry, estimate, item); return schedule; }
    if (status === 'resubmit' ? entry.qcStatus !== 'rework' : entry.qcStatus !== 'awaiting-qc') {
      throw fail('This completion is no longer awaiting this action. Refresh its history.');
    }
    if (item) entry.photos = photos(item.photos);
    entry.qcStatus = status === 'resubmit' ? 'awaiting-qc' : status;
    if (status === 'resubmit') entry.submittedAt = new Date();
    if (status === 'rework') entry.reworkPhotos = Array.isArray(reworkPhotos) ? reworkPhotos : [];
    event(entry, status === 'resubmit' ? 'resubmitted' : status, notes, manager);
    await schedule.save();
    await syncItem(entry, estimate, item);
    return schedule;
  }
  async function reviewItem(req, estimate, item, status, notes, reworkPhotos) {
    const manager = await reviewer(req);
    const schedule = await MaintenanceSchedule.findById(item.maintenanceScheduleId);
    const entry = schedule?.history.find(entry => id(entry.estimateItemId) === id(item));
    if (!entry) throw fail('Complete this maintenance visit before reviewing it.');
    await review(schedule, entry, status, notes, manager, reworkPhotos);
    return { success: true, source: 'estimate', schedule };
  }
  return { complete, review, reviewer, reviewItem, findItem, syncItem, mergePhotos, historyDetails };
};

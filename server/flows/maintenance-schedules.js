// maintenance schedules flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// Helper for overdue email
function getOverdueMaintenanceEmailHtml({ recipientName, schedule, isManager }) {
  // Helper to format address
  function formatAddress(address) {
    if (!address) return '';
    const line1 = address.addressLine1 || address.line1 || '';
    const line2 = address.addressLine2 || address.line2 || '';
    const city = address.city || '';
    const state = address.state || '';
    const zip = address.zip || '';
    let addr = line1;
    if (line2) addr += ', ' + line2;
    if (city) addr += ', ' + city;
    if (state) addr += ', ' + state;
    if (zip) addr += ' ' + zip;
    return addr.trim();
  }

  const propertyAddress = schedule.projectId?.address
    ? formatAddress(schedule.projectId.address)
    : '';

  return `
    <div style="font-family: Arial, sans-serif; background: #fffbe6; padding: 24px;">
      <div style="max-width: 520px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(44,62,80,0.07); padding: 24px;">
        <h2 style="color: #d35400; margin-top: 0;">Overdue Maintenance Alert</h2>
        <p style="font-size: 1.1em;">Hello ${recipientName},</p>
        <p>
          ${isManager
            ? 'This is an alert that the following scheduled maintenance is overdue:'
            : 'This is an alert that your assigned scheduled maintenance is overdue:'}
          <br>
          <strong style="color: #2c3e50;">${schedule.title}</strong>
          at <strong style="color: #217dbb;">${propertyAddress || 'Property'}</strong>
          <span style="color: #d35400;">(Original Due Date: ${new Date(schedule.nextScheduledDate).toLocaleDateString()})</span>.
        </p>
        <div style="margin: 18px 0; padding: 12px; background: #fff3cd; border-radius: 8px;">
          <strong>Description:</strong> ${schedule.description || '<span style="color:#888;">No description provided.</span>'}
        </div>
        <div style="margin-top: 24px; text-align: right;">
          <span style="font-size: 0.95em; color: #888;">Thank you,<br>BESF Team</span>
        </div>
      </div>
    </div>
  `;
}

async function sendTodayMaintenanceReminder(schedule) {
  // Populate vendor and project if not already
  if (!schedule.assignedVendor || !schedule.projectId) {
    schedule = await serverContext.MaintenanceSchedule.findById(schedule._id)
      .populate('assignedVendor projectId');
  }
  // Vendor reminder
  if (schedule.assignedVendor && schedule.assignedVendor.email) {
    await serverContext.transporter.sendMail({
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to: schedule.assignedVendor.email,
      subject: `Reminder: Maintenance Scheduled for Today`,
      html: (0, serverContext.getMaintenanceEmailHtml)({
        recipientName: schedule.assignedVendor.name || 'Vendor',
        schedule,
        dayLabel: 'Today',
        isManager: false
      })
    });
  }
  // Manager reminder
  await serverContext.transporter.sendMail({
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: ["jleonel3915@gmail.com"], // Add more emails as needed
    subject: `Reminder: Maintenance Scheduled for Today`,
    html: (0, serverContext.getMaintenanceEmailHtml)({
      recipientName: 'Team',
      schedule,
      dayLabel: 'Today',
      isManager: true
    })
  });
}

async function ensureScheduleActivatedForDate(schedule) {
  // 1. Mark the schedule active for today and send reminders
  schedule.status = 'in-progress';
  await schedule.save();
  await (0, serverContext.sendTodayMaintenanceReminder)(schedule);
  console.log(`Auto-updated schedule "${schedule.title}" to in-progress for today.`);
  await (0, serverContext.syncMaintenanceScheduleToEstimate)(schedule, { createIfMissing: true });
}

async function sendOverdueScheduleAlert(schedule) {
  // 2. Send overdue alerts for schedules that are already past due
  if (schedule.assignedVendor && schedule.assignedVendor.email) {
    await serverContext.transporter.sendMail({
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to: schedule.assignedVendor.email,
      subject: `Overdue Maintenance Alert: ${schedule.title}`,
      html: (0, serverContext.getOverdueMaintenanceEmailHtml)({
        recipientName: schedule.assignedVendor.name || 'Vendor',
        schedule,
        isManager: false
      })
    });
  }

  await serverContext.transporter.sendMail({
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: ['besfllc@gmail.com'],
    subject: `Overdue Maintenance Alert: ${schedule.title}`,
    html: (0, serverContext.getOverdueMaintenanceEmailHtml)({
      recipientName: 'Team',
      schedule,
      isManager: true
    })
  });
  console.log(`Overdue maintenance alert sent for "${schedule.title}"`);
}

function escapeRegexForMaintenanceLink(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getRecurringMaintenanceUnitLabel(schedule) {
  const rawUnitId = schedule?.unitId && (schedule.unitId._id || schedule.unitId);
  let unitNumber = typeof schedule?.unitId?.number === 'string' ? schedule.unitId.number.trim() : '';
  if (!unitNumber && rawUnitId) {
    const linkedUnit = await serverContext.Unit.findById(rawUnitId).select('number').lean().catch(() => null);
    unitNumber = String(linkedUnit?.number || '').trim();
  }
  return unitNumber ? `Unit ${unitNumber}` : '';
}

function getNextScheduledDateForCompletion(schedule, completedAt = new Date()) {
  const now = completedAt instanceof Date ? completedAt : new Date(completedAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentNextDate = schedule?.nextScheduledDate ? new Date(schedule.nextScheduledDate) : today;
  let baseDate = currentNextDate < today ? today : currentNextDate;
  let nextDate = new Date(baseDate);
  switch (schedule?.frequency) {
    case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
    case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
    case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
    case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
    case 'custom':
      if (schedule?.intervalDays && schedule.intervalDays > 0) {
        nextDate.setDate(nextDate.getDate() + schedule.intervalDays);
      }
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }
  return nextDate;
}

// --- auto schedule logic ---
async function updateNextScheduledDates(scheduleId = null) {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 0. Optionally scope processing to a single schedule when editing
    const scheduleFilter = scheduleId ? { _id: scheduleId } : {};

    // 1. Set status to "in-progress" if nextScheduledDate is today and not already in-progress
    const schedulesToday = await serverContext.MaintenanceSchedule.find({
      ...scheduleFilter,
      nextScheduledDate: {
        $gte: today,
        $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      },
      status: { $ne: 'in-progress' }
    }).populate('assignedVendor projectId');

    for (const schedule of schedulesToday) {
      await (0, serverContext.ensureScheduleActivatedForDate)(schedule);
    }

    // 2. Notify for overdue schedules (nextScheduledDate < today, not completed)
    const overdueSchedules = await serverContext.MaintenanceSchedule.find({
      ...scheduleFilter,
      nextScheduledDate: { $lt: today },
      status: { $ne: 'completed' }
    }).populate('assignedVendor projectId');

    for (const schedule of overdueSchedules) { 
      await (0, serverContext.sendOverdueScheduleAlert)(schedule);
    }
  } catch (err) {
    console.error('Error updating nextScheduledDates:', err);
  }
}

// Run updateNextScheduledDates every day at 7am
function scheduleDailyUpdateNextScheduledDates() {
  const now = new Date();
  const next11am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0, 0);
  if (now > next11am) {
    // If it's past 11am today, schedule for tomorrow
    next11am.setDate(next11am.getDate() + 1);
  }
  const millisTill11am = next11am - now;
  setTimeout(() => {
    (0, serverContext.updateNextScheduledDates)();
    setInterval(serverContext.updateNextScheduledDates, 24 * 60 * 60 * 1000); // every 24 hours
  }, millisTill11am);
}

// Replace the HTML in sendMaintenanceReminders with this improved style:
function getMaintenanceEmailHtml({ recipientName, schedule, dayLabel, isManager }) {
  // Helper to format address
  function formatAddress(address) {
    if (!address) return '';
    const line1 = address.addressLine1 || address.line1 || '';
    const line2 = address.addressLine2 || address.line2 || '';
    const city = address.city || '';
    const state = address.state || '';
    const zip = address.zip || '';
    let addr = line1;
    if (line2) addr += ', ' + line2;
    if (city) addr += ', ' + city;
    if (state) addr += ', ' + state;
    if (zip) addr += ' ' + zip;
    return addr.trim();
  }

  const propertyAddress = schedule.projectId?.address
    ? formatAddress(schedule.projectId.address)
    : '';
 
  return `
    <div style="font-family: Arial, sans-serif; background: #f6fafd; padding: 24px;">
      <div style="max-width: 520px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(44,62,80,0.07); padding: 24px;">
        <h2 style="color: #217dbb; margin-top: 0;">${dayLabel} Maintenance Reminder</h2>
        <p style="font-size: 1.1em;">Hello ${recipientName},</p>
        <p>
          ${isManager
            ? 'This is a friendly reminder that we have a scheduled maintenance for'
            : 'This is a friendly reminder that you have a scheduled maintenance for'}
          <strong style="color: #2c3e50;">${schedule.title}</strong>
          at <strong style="color: #217dbb;">${propertyAddress || 'Property'}</strong>
          <span style="color: #217dbb;">${dayLabel === 'Today' ? 'today' : 'tomorrow'} (${new Date(schedule.nextScheduledDate).toLocaleDateString()})</span>.
        </p>
        <div style="margin: 18px 0; padding: 12px; background: #eaf6ff; border-radius: 8px;">
          <strong>Description:</strong> ${schedule.description || '<span style="color:#888;">No description provided.</span>'}
        </div>
        <table style="width:100%;margin-bottom:18px;">
          <tr>
            <td style="padding:6px 0;"><strong>Frequency:</strong></td>
            <td style="padding:6px 0;">${schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)}${schedule.frequency === 'custom' && schedule.intervalDays ? ` (Every ${schedule.intervalDays} days)` : ''}</td>
          </tr>
        </table>
        <div style="margin-top: 24px; text-align: right;">
          <span style="font-size: 0.95em; color: #888;">Thank you,<br>BESF Team</span>
        </div>
      </div>
    </div>
  `;
}

// In sendMaintenanceReminders, update the email sending logic:
async function sendMaintenanceReminders() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find schedules for tomorrow and today
    const schedulesTomorrow = await serverContext.MaintenanceSchedule.find({
      nextScheduledDate: {
        $gte: tomorrow,
        $lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
      }
    }).populate('assignedVendor projectId');

    const schedulesToday = await serverContext.MaintenanceSchedule.find({
      nextScheduledDate: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    }).populate('assignedVendor projectId');
 
    // Send reminders for tomorrow
    for (const schedule of schedulesTomorrow) {
       // Vendor reminder
      if (schedule.assignedVendor && schedule.assignedVendor.email) {
        await serverContext.transporter.sendMail({
          from: `"BESF Team" <${process.env.EMAIL_USER}>`,
          to: schedule.assignedVendor.email,
          subject: `Reminder: Upcoming Maintenance Scheduled for Tomorrow`,
          html: (0, serverContext.getMaintenanceEmailHtml)({
            recipientName: schedule.assignedVendor.name || 'Vendor',
            schedule,
            dayLabel: 'Tomorrow',
            isManager: false
          })
        });
      }
      // Send to default project manager email
await serverContext.transporter.sendMail({
  from: `"BESF Team" <${process.env.EMAIL_USER}>`,
  to: ["jleonel3915@gmail.com"], // <-- Add both emails here
  subject: `Reminder: Maintenance Scheduled for Tomorrow`,
  html: (0, serverContext.getMaintenanceEmailHtml)({
    recipientName: 'Team',
    schedule,
    dayLabel: 'Tomorrow',
    isManager: true
  })
});
    }
  } catch (err) {
    console.error('Error sending maintenance reminders:', err);
  }
}

function get_api_properties_maintenance_schedules() {
serverContext.app.get('/api/properties/maintenance-schedules', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (status) {
      const statuses = String(status)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (statuses.length) {
        filter.status = { $in: statuses };
      }
    } else {
      filter.status = { $ne: 'completed' };
    }

    const schedules = await serverContext.MaintenanceSchedule.find(filter)
      .populate('assignedVendor', 'name email')
      .populate('unitId')
      .populate('projectId')
      .sort({ nextScheduledDate: 1, createdAt: -1 });

    res.json(schedules);
  } catch (error) {
    console.error('Error fetching all maintenance schedules:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId() {
serverContext.app.get('/api/properties/:propertyId/maintenance-schedules/:scheduleId/history/:historyId', async (req, res) => {
  try {
    const schedule = await serverContext.MaintenanceSchedule.findOne({ _id: req.params.scheduleId, projectId: req.params.propertyId });
    const entry = schedule?.history.id(req.params.historyId);
    if (!entry) return res.status(404).json({ message: 'Completion not found.' });
    res.json(await serverContext.maintenanceQC.historyDetails(schedule, entry));
  } catch (error) { (0, serverContext.maintenanceQCError)(res, error); }
});
}

function patch_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId_review() {
serverContext.app.patch('/api/properties/:propertyId/maintenance-schedules/:scheduleId/history/:historyId/review', async (req, res) => {
  try {
    const manager = await serverContext.maintenanceQC.reviewer(req);
    const schedule = await serverContext.MaintenanceSchedule.findOne({ _id: req.params.scheduleId, projectId: req.params.propertyId });
    const entry = schedule?.history.id(req.params.historyId);
    if (!entry) return res.status(404).json({ message: 'Completion not found.' });
    await serverContext.maintenanceQC.review(schedule, entry, req.body.status, req.body.notes, manager, [], req.body.expectedReviewCount);
    res.json({ success: true, schedule });
  } catch (error) { (0, serverContext.maintenanceQCError)(res, error); }
});
}

function patch_api_properties_propertyId_maintenance_schedules_scheduleId_complete() {
serverContext.app.patch('/api/properties/:propertyId/maintenance-schedules/:scheduleId/complete', async (req, res) => {
  try {
    let schedule = await serverContext.MaintenanceSchedule.findOne({ _id: req.params.scheduleId, projectId: req.params.propertyId });
    if (!schedule) return res.status(404).json({ message: 'Schedule not found.' });
    if (!req.body.expectedNextScheduledDate || new Date(req.body.expectedNextScheduledDate).getTime() !== new Date(schedule.nextScheduledDate).getTime()) {
      return res.status(409).json({ message: 'This visit changed. Refresh before completing it.' });
    }
    const linked = await (0, serverContext.syncMaintenanceScheduleToEstimate)(schedule, { createIfMissing: true });
    schedule = await serverContext.maintenanceQC.complete(linked.schedule, linked.estimate, linked.item, {
      ...req.body, completedAt: new Date(), resubmit: true
    });
    res.json({ success: true, schedule });
  } catch (error) { (0, serverContext.maintenanceQCError)(res, error); }
});
}

function post_api_properties_propertyId_maintenance_schedules() {
// API to create a schedule
serverContext.app.post('/api/properties/:propertyId/maintenance-schedules', async (req, res) => {
  try {
    const { title, description, frequency, intervalDays, startDate, assignedVendor, unitId, status, cost } = req.body;
    if (!title || !frequency || !startDate) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    let nextDate = new Date(startDate);
    switch (frequency) {
      case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
      case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
      case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
      case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
      case 'custom':
        if (!intervalDays || intervalDays < 1) return res.status(400).json({ message: 'Custom intervalDays required.' });
        nextDate.setDate(nextDate.getDate() + intervalDays);
        break;
    }
    const schedule = new serverContext.MaintenanceSchedule({
      projectId: req.params.propertyId,
      title,
      description,
      frequency,
      intervalDays: frequency === 'custom' ? intervalDays : null,
      startDate,
      nextScheduledDate: nextDate,
      assignedVendor: assignedVendor || null,
      unitId: unitId || null,
      status: status || 'pending',
      completedAt: status === 'completed' ? new Date() : null,
      cost: cost || 0
    });
    await schedule.save();
    let responseSchedule = schedule;
    if (schedule.status === 'in-progress') {
      const syncResult = await (0, serverContext.syncMaintenanceScheduleToEstimate)(schedule, { createIfMissing: true });
      responseSchedule = syncResult?.schedule || schedule;
    }
    res.status(201).json(responseSchedule);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create schedule.' });
  }
});
}

function get_api_properties_propertyId_maintenance_schedules() {
// API to get schedules for a property
serverContext.app.get('/api/properties/:propertyId/maintenance-schedules', async (req, res) => {
  try {
    const schedules = await serverContext.MaintenanceSchedule.find({ projectId: req.params.propertyId })
      .populate('assignedVendor', 'name email'); 
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch maintenance schedules' });
  }
});
}

function post_api_properties_propertyId_maintenance_schedules_scheduleId_estimate() {
serverContext.app.post('/api/properties/:propertyId/maintenance-schedules/:scheduleId/estimate', async (req, res) => {
  try {
    const schedule = await serverContext.MaintenanceSchedule.findOne({
      _id: req.params.scheduleId,
      projectId: req.params.propertyId
    });
    if (!schedule) return res.status(404).json({ message: 'Schedule not found.' });

    const syncResult = await (0, serverContext.syncMaintenanceScheduleToEstimate)(schedule, { createIfMissing: true });
    const responseSchedule = syncResult?.schedule || schedule;

    res.json({
      success: true,
      schedule: responseSchedule,
      estimateId: syncResult?.estimate?._id || responseSchedule.linkedEstimateId || null,
      lineItemId: syncResult?.item?._id || responseSchedule.linkedEstimateItemId || null
    });
  } catch (err) {
    console.error('Failed to create or link recurring maintenance estimate:', err);
    res.status(500).json({ message: 'Failed to create or link recurring maintenance estimate.' });
  }
});
}

function put_api_properties_propertyId_maintenance_schedules_scheduleId() {
// --- Maintenance Schedule: Update (PUT) ---
serverContext.app.put('/api/properties/:propertyId/maintenance-schedules/:scheduleId', async (req, res) => {
  try {
    const { title, description, frequency, intervalDays, startDate, assignedVendor, unitId, status, cost } = req.body;
    const existingSchedule = await serverContext.MaintenanceSchedule.findOne({ _id: req.params.scheduleId, projectId: req.params.propertyId });
    if (!existingSchedule) return res.status(404).json({ message: 'Schedule not found.' });
    let nextDate = new Date(startDate);
    switch (frequency) {
      case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
      case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
      case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
      case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
      case 'custom':
        if (!intervalDays || intervalDays < 1) return res.status(400).json({ message: 'Custom intervalDays required.' });
        nextDate.setDate(nextDate.getDate() + intervalDays);
        break;
    }
    const updateObj = {
      title,
      description,
      frequency,
      intervalDays: frequency === 'custom' ? intervalDays : null,
      startDate,
      nextScheduledDate: nextDate,
      assignedVendor: assignedVendor || null,
      unitId: unitId || null,
      cost: cost || 0
    };
    if (status) {
      updateObj.status = status;
      if (status === 'completed') {
        const completedAt = new Date();
        updateObj.completedAt = completedAt;
        updateObj.startDate = completedAt;
      } else {
        updateObj.completedAt = null;
      }
    }
    const originalStartDate = existingSchedule.startDate;
    const dateChanged = Boolean(startDate) && new Date(startDate).toISOString().slice(0, 10) !== new Date(originalStartDate).toISOString().slice(0, 10);
    if (!dateChanged && frequency === existingSchedule.frequency && (intervalDays || null) === (existingSchedule.intervalDays || null)) {
      updateObj.nextScheduledDate = existingSchedule.nextScheduledDate;
    }
    if (status === 'completed') {
      if (!req.body.expectedNextScheduledDate || new Date(req.body.expectedNextScheduledDate).getTime() !== new Date(existingSchedule.nextScheduledDate).getTime()) {
        return res.status(409).json({ message: 'This visit changed. Refresh before completing it.' });
      }
      delete updateObj.status;
      delete updateObj.completedAt;
      updateObj.startDate = existingSchedule.startDate;
      updateObj.nextScheduledDate = existingSchedule.nextScheduledDate;
      Object.assign(existingSchedule, updateObj);
      const linked = await (0, serverContext.syncMaintenanceScheduleToEstimate)(existingSchedule, { createIfMissing: true });
      const completed = await serverContext.maintenanceQC.complete(linked.schedule, linked.estimate, linked.item, {
        completedBy: req.body.completedBy || 'Manager', notes: req.body.notes || '',
        expectedNextScheduledDate: req.body.expectedNextScheduledDate
      });
      return res.json(completed);
    }
    Object.assign(existingSchedule, updateObj);
    let updated = await existingSchedule.save();

    const startDateChanged = dateChanged;
    if (startDateChanged && updated?._id) {
      await (0, serverContext.updateNextScheduledDates)(updated._id);
      updated = await serverContext.MaintenanceSchedule.findById(updated._id);
    }

    const shouldSyncEstimate = !!updated && (
      updated.status === 'in-progress'
      || !!updated.linkedEstimateId
      || !!updated.linkedEstimateItemId
      || String(existingSchedule.assignedVendor || '') !== String(updated.assignedVendor || '')
      || String(existingSchedule.title || '') !== String(updated.title || '')
      || String(existingSchedule.description || '') !== String(updated.description || '')
      || String(existingSchedule.unitId || '') !== String(updated.unitId || '')
      || Number(existingSchedule.cost || 0) !== Number(updated.cost || 0)
    );
    if (shouldSyncEstimate) {
      const syncResult = await (0, serverContext.syncMaintenanceScheduleToEstimate)(updated, {
        createIfMissing: updated.status === 'in-progress' || !!updated.linkedEstimateId
      });
      updated = syncResult?.schedule || updated;
    }

    res.json(updated);
  } catch (err) {
    (0, serverContext.maintenanceQCError)(res, err);
  }
});
}

function delete_api_properties_propertyId_maintenance_schedules_scheduleId() {
// --- Maintenance Schedule: Delete (DELETE) ---
serverContext.app.delete('/api/properties/:propertyId/maintenance-schedules/:scheduleId', async (req, res) => {
  try {
    const deleted = await serverContext.MaintenanceSchedule.findOneAndDelete({
      _id: req.params.scheduleId,
      projectId: req.params.propertyId
    });
    if (!deleted) return res.status(404).json({ message: 'Schedule not found.' });
    res.json({ message: 'Schedule deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete schedule.' });
  }
});
}

return {
  get_api_properties_maintenance_schedules,
  get_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId,
  patch_api_properties_propertyId_maintenance_schedules_scheduleId_history_historyId_review,
  patch_api_properties_propertyId_maintenance_schedules_scheduleId_complete,
  getOverdueMaintenanceEmailHtml,
  sendTodayMaintenanceReminder,
  ensureScheduleActivatedForDate,
  sendOverdueScheduleAlert,
  escapeRegexForMaintenanceLink,
  getRecurringMaintenanceUnitLabel,
  getNextScheduledDateForCompletion,
  updateNextScheduledDates,
  scheduleDailyUpdateNextScheduledDates,
  getMaintenanceEmailHtml,
  sendMaintenanceReminders,
  post_api_properties_propertyId_maintenance_schedules,
  get_api_properties_propertyId_maintenance_schedules,
  post_api_properties_propertyId_maintenance_schedules_scheduleId_estimate,
  put_api_properties_propertyId_maintenance_schedules_scheduleId,
  delete_api_properties_propertyId_maintenance_schedules_scheduleId
};
};

// announcements flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

function parseAnnouncementCalendarDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function get_api_properties_propertyId_announcements() {
serverContext.app.get('/api/properties/:propertyId/announcements', async (req, res) => {
  try {
    const announcements = await serverContext.Announcement.find({ projectId: req.params.propertyId })
      .populate('targetTenantIds', 'name email unitId')
      .sort({ pinned: -1, startsAt: -1, createdAt: -1 })
      .lean();
    res.json(announcements);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_properties_propertyId_announcements() {
serverContext.app.post('/api/properties/:propertyId/announcements', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });
    const targetTenantIds = Array.isArray(req.body.targetTenantIds)
      ? req.body.targetTenantIds.filter(id => serverContext.mongoose.Types.ObjectId.isValid(id))
      : [];
    const startsAt = req.body.startsAt ? (0, serverContext.parseAnnouncementCalendarDate)(req.body.startsAt) : null;
    const expiresAt = req.body.expiresAt ? (0, serverContext.parseAnnouncementCalendarDate)(req.body.expiresAt) : null;
    if (req.body.startsAt && !startsAt) {
      return res.status(400).json({ message: 'Invalid publish date' });
    }
    if (req.body.expiresAt && !expiresAt) {
      return res.status(400).json({ message: 'Invalid expiration date' });
    }
    if (startsAt && expiresAt && expiresAt < startsAt) {
      return res.status(400).json({ message: 'Expiration date must be after the publish date' });
    }

    const announcement = await serverContext.Announcement.create({
      projectId: req.params.propertyId,
      title,
      message,
      category: ['notice', 'inspection', 'utility', 'parking', 'general'].includes(req.body.category) ? req.body.category : 'general',
      targetTenantIds,
      pinned: Boolean(req.body.pinned),
      startsAt,
      expiresAt,
      createdBy: String(req.body.createdBy || 'Management').trim() || 'Management'
    });
    res.status(201).json(announcement);
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_properties_propertyId_announcements_announcementId() {
serverContext.app.put('/api/properties/:propertyId/announcements/:announcementId', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });

    const targetTenantIds = Array.isArray(req.body.targetTenantIds)
      ? req.body.targetTenantIds.filter(id => serverContext.mongoose.Types.ObjectId.isValid(id))
      : [];
    const startsAt = req.body.startsAt ? (0, serverContext.parseAnnouncementCalendarDate)(req.body.startsAt) : null;
    const expiresAt = req.body.expiresAt ? (0, serverContext.parseAnnouncementCalendarDate)(req.body.expiresAt) : null;
    if (req.body.startsAt && !startsAt) {
      return res.status(400).json({ message: 'Invalid publish date' });
    }
    if (req.body.expiresAt && !expiresAt) {
      return res.status(400).json({ message: 'Invalid expiration date' });
    }
    if (startsAt && expiresAt && expiresAt < startsAt) {
      return res.status(400).json({ message: 'Expiration date must be after the publish date' });
    }

    const updated = await serverContext.Announcement.findOneAndUpdate(
      {
        _id: req.params.announcementId,
        projectId: req.params.propertyId
      },
      {
        title,
        message,
        category: ['notice', 'inspection', 'utility', 'parking', 'general'].includes(req.body.category) ? req.body.category : 'general',
        targetTenantIds,
        pinned: Boolean(req.body.pinned),
        startsAt,
        expiresAt,
        createdBy: String(req.body.createdBy || 'Management').trim() || 'Management'
      },
      { new: true }
    ).populate('targetTenantIds', 'name email unitId');

    if (!updated) return res.status(404).json({ message: 'Announcement not found' });
    res.json(updated);
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function delete_api_properties_propertyId_announcements_announcementId() {
serverContext.app.delete('/api/properties/:propertyId/announcements/:announcementId', async (req, res) => {
  try {
    const deleted = await serverContext.Announcement.findOneAndDelete({
      _id: req.params.announcementId,
      projectId: req.params.propertyId
    });
    if (!deleted) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

return {
  parseAnnouncementCalendarDate,
  getStartOfToday,
  get_api_properties_propertyId_announcements,
  post_api_properties_propertyId_announcements,
  put_api_properties_propertyId_announcements_announcementId,
  delete_api_properties_propertyId_announcements_announcementId
};
};

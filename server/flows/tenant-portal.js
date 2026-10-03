// tenant portal flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// ===================== TENANT PORTAL API =====================

function authTenantPortal(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const decoded = serverContext.jwt.verify(header.split(' ')[1], serverContext.JWT_SECRET);
    if (!decoded.tenantPortalTenantId) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.tenantPortalTenantId = decoded.tenantPortalTenantId;
    req.tenantPortalProjectId = decoded.projectId;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeAddressForTenantPortal(project) {
  const address = project?.address || {};
  const line1 = address.line1 || address.addressLine1 || address.street || '';
  const line2 = address.line2 || address.addressLine2 || address.suite || '';
  return {
    line1,
    line2,
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || address.postalCode || ''
  };
}

function buildTenantPortalPaymentLedger(payments = [], tenant = null) {
  const ordered = [...(payments || [])].sort((left, right) => {
    const leftTime = new Date(left?.date || 0).getTime();
    const rightTime = new Date(right?.date || 0).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();
  });

  const rentPeriodTotals = ordered.reduce((map, payment) => {
    if ((payment?.applyTo || 'rent') !== 'rent') return map;
    const paymentDate = payment?.date ? new Date(payment.date) : null;
    if (!paymentDate || Number.isNaN(paymentDate.getTime())) return map;
    const period = payment.periodMonth || `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
    if (!map[period]) {
      map[period] = {
        expected: Number((0, serverContext.computeExpectedRentForMonth)(tenant, paymentDate, 'rent') || 0),
        lateFees: 0,
        applied: 0
      };
    }
    map[period].lateFees += Number(payment.lateFee) || 0;
    return map;
  }, {});

  let depositApplied = 0;
  const depositRequired = Number(tenant?.deposit) || 0;

  const ledger = ordered.map(payment => {
    const entry = { ...payment };
    const applyTo = entry.applyTo || 'rent';

    if (applyTo === 'rent') {
      const paymentDate = entry?.date ? new Date(entry.date) : null;
      if (paymentDate && !Number.isNaN(paymentDate.getTime())) {
        const period = entry.periodMonth || `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
        const periodState = rentPeriodTotals[period];
        if (periodState) {
          periodState.applied += Math.abs(Number(entry.amount) || 0) + Math.abs(Number(entry.appliedCredit) || 0);
          if (!Number.isFinite(Number(entry.balance))) {
            entry.balance = Number((periodState.expected + periodState.lateFees - periodState.applied).toFixed(2));
          }
        }
      }
    } else if (applyTo === 'deposit') {
      depositApplied += Math.max(0, Number(entry.amount) || 0);
      if (!Number.isFinite(Number(entry.balance))) {
        entry.balance = Number((depositRequired - depositApplied).toFixed(2));
      }
    } else if (!Number.isFinite(Number(entry.balance))) {
      entry.balance = 0;
    }

    return entry;
  });

  return ledger.sort((left, right) => {
    const leftTime = new Date(left?.date || 0).getTime();
    const rightTime = new Date(right?.date || 0).getTime();
    if (rightTime !== leftTime) return rightTime - leftTime;
    return new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime();
  });
}

async function buildTenantPortalPayload(tenantId) {
  const tenant = await serverContext.Tenant.findById(tenantId).populate('unitId').lean();
  if (!tenant) return null;
  const today = (0, serverContext.getStartOfToday)();

  const [project, localPayments, maintenance, documents, announcementRecords, quickBooksConnection] = await Promise.all([
    serverContext.Project.findById(tenant.projectId).lean().catch(() => null),
    serverContext.Payment.find({ tenantId: tenant._id }).sort({ date: -1, createdAt: -1 }).lean(),
    serverContext.MaintenanceRequest.find({
      projectId: tenant.projectId,
      ...(tenant.unitId?._id ? { unitId: tenant.unitId._id } : {})
    }).sort({ createdAt: -1 }).lean(),
    serverContext.Document.find({
      projectId: tenant.projectId,
      $or: [
        { tenantId: tenant._id },
        { tenantId: null, type: { $in: ['notice', 'other'] } }
      ]
    }).sort({ createdAt: -1 }).lean(),
    serverContext.Announcement.find({
      projectId: tenant.projectId,
      $or: [
        { targetTenantIds: { $exists: false } },
        { targetTenantIds: { $size: 0 } },
        { targetTenantIds: tenant._id }
      ],
      $or: [{ expiresAt: null }, { expiresAt: { $gte: today } }]
    }).sort({ pinned: -1, startsAt: 1, createdAt: -1 }).limit(10).lean(),
    serverContext.QuickBooksConnection.findOne({ projectId: tenant.projectId }).select('status').lean().catch(() => null)
  ]);

  const announcements = announcementRecords.filter(item => {
    const startsAt = (0, serverContext.parseAnnouncementCalendarDate)(item?.startsAt);
    const expiresAt = (0, serverContext.parseAnnouncementCalendarDate)(item?.expiresAt);
    if (expiresAt && expiresAt < today) return false;
    if (startsAt && !expiresAt && startsAt < today) return false;
    return true;
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const unitId = tenant.unitId?._id || tenant.unitId;
  const unitById = new Map(unitId ? [[String(unitId), tenant.unitId]] : []);
  let payments = [...(localPayments || [])];
  if (quickBooksConnection?.status === 'connected') {
    try {
      const connection = await (0, serverContext.getQbConnection)(tenant.projectId);
      const qbRecords = await (0, serverContext.fetchQuickBooksPaymentRecords)(connection);
      const quickBooksOnlyPayments = (0, serverContext.buildUnifiedQuickBooksPaymentEntries)({
        localPayments,
        qbRecords,
        connectionId: connection._id,
        tenants: [tenant],
        unitById,
        projectId: tenant.projectId
      }).filter(payment => String(payment?.tenantId || '') === String(tenant._id));
      payments = [...localPayments, ...quickBooksOnlyPayments];
    } catch (error) {
      console.warn(`Unable to include QuickBooks-only payments in tenant portal for tenant ${tenantId}:`, error.message);
    }
  }
  payments = (0, serverContext.buildTenantPortalPaymentLedger)(payments, tenant);
  const expectedRent = (0, serverContext.computeExpectedRentForMonth)(tenant, now, 'rent') || 0;
  const currentRentPayments = payments.filter(payment => {
    if ((payment.applyTo || 'rent') !== 'rent' || !payment.date) return false;
    if (payment.periodMonth) return payment.periodMonth === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const d = new Date(payment.date);
    return d >= monthStart && d <= monthEnd;
  });
  const paidThisMonth = currentRentPayments.reduce((sum, payment) => sum + Math.abs(Number(payment.amount) || 0), 0);
  const lateFeesThisMonth = currentRentPayments.reduce((sum, payment) => sum + (Number(payment.lateFee) || 0), 0);
  const rentBalance = expectedRent + lateFeesThisMonth - paidThisMonth;
  const depositRequired = Number(tenant.deposit) || 0;
  const depositPaidFromPayments = payments
    .filter(payment => (payment.applyTo || 'rent') === 'deposit')
    .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const savedDepositPaid = Number(tenant.depositPaid) || 0;
  const depositPaid = Math.max(savedDepositPaid, depositPaidFromPayments);
 
  return {
    tenant: {
      id: tenant._id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      leaseStart: tenant.leaseStart,
      leaseEnd: tenant.leaseEnd,
      leaseStatus: tenant.leaseStatus,
      parking: tenant.parking,
      accessCode: tenant.accessCode,
      emergencyContact: tenant.emergencyContact || {},
      cars: tenant.cars || {},
      pets: tenant.pets || {}
    },
    property: {
      id: project?._id || tenant.projectId,
      name: project?.name || 'Your Property',
      type: project?.type || '',
      address: (0, serverContext.normalizeAddressForTenantPortal)(project)
    },
    unit: tenant.unitId ? {
      id: tenant.unitId._id,
      number: tenant.unitId.number,
      floor: tenant.unitId.floor,
      bedrooms: tenant.unitId.bedrooms,
      bathrooms: tenant.unitId.bathrooms,
      sqft: tenant.unitId.sqft,
      amenities: tenant.unitId.amenities || [],
      utilityAccounts: tenant.unitId.utilityAccounts || {}
    } : null,
    balances: {
      expectedRent,
      paidThisMonth,
      lateFeesThisMonth,
      rentBalance,
      depositRequired,
      depositPaid,
      depositBalance: Math.max(0, depositRequired - depositPaid)
    },
    payments,
    maintenance,
    documents: documents.map(doc => ({
      _id: doc._id,
      name: doc.name,
      type: doc.type,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt,
      viewUrl: `/api/tenant-portal/documents/${doc._id}/view`,
      downloadUrl: `/api/tenant-portal/documents/${doc._id}/download`
    })),
    announcements
  };
}

async function sendTenantPortalDocument(req, res, disposition) {
  try {
    const tenant = await serverContext.Tenant.findById(req.tenantPortalTenantId).select('_id projectId').lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const doc = await serverContext.Document.findOne({
      _id: req.params.documentId,
      projectId: tenant.projectId,
      $or: [
        { tenantId: tenant._id },
        { tenantId: null, type: { $in: ['notice', 'other'] } }
      ]
    }).lean();
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const filePath = (0, serverContext.resolveStoredUploadPath)(doc.filePath);
    if (!serverContext.fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on server' });

    const ext = serverContext.path.extname(doc.name).toLowerCase();
    const contentType = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', (0, serverContext.getContentDispositionHeader)(disposition, doc.name));
    serverContext.fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Tenant portal document error:', error);
    res.status(500).json({ message: 'Error serving document' });
  }
}

function post_api_tenant_portal_login() {
serverContext.app.post('/api/tenant-portal/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const phoneLast4 = (0, serverContext.normalizePhoneDigits)(req.body.phoneLast4).slice(-4);

    if (!email || phoneLast4.length !== 4) {
      return res.status(400).json({ message: 'Email and phone last four are required' });
    }

    const tenants = await serverContext.Tenant.find({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .sort({ leaseStatus: 1, updatedAt: -1 })
      .lean();

    const tenant = tenants.find(t => (0, serverContext.normalizePhoneDigits)(t.phone).slice(-4) === phoneLast4);
    if (!tenant) {
      return res.status(401).json({ message: 'We could not match that tenant record' });
    }

    const token = serverContext.jwt.sign(
      { tenantPortalTenantId: tenant._id, projectId: tenant.projectId },
      serverContext.JWT_SECRET,
      { expiresIn: '14d' }
    );
    const portal = await (0, serverContext.buildTenantPortalPayload)(tenant._id);
    res.json({ token, portal });
  } catch (error) {
    console.error('Tenant portal login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_tenant_portal_me() {
serverContext.app.get('/api/tenant-portal/me', serverContext.authTenantPortal, async (req, res) => {
  try {
    const portal = await (0, serverContext.buildTenantPortalPayload)(req.tenantPortalTenantId);
    if (!portal) return res.status(404).json({ message: 'Tenant not found' });
    res.json({ portal });
  } catch (error) {
    console.error('Tenant portal me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_tenant_portal_profile() {
serverContext.app.put('/api/tenant-portal/profile', serverContext.authTenantPortal, async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.phone === 'string') update.phone = req.body.phone.trim();
    if (req.body.emergencyContact && typeof req.body.emergencyContact === 'object') {
      update.emergencyContact = {
        name: String(req.body.emergencyContact.name || '').trim(),
        phone: String(req.body.emergencyContact.phone || '').trim(),
        email: String(req.body.emergencyContact.email || '').trim(),
        relation: String(req.body.emergencyContact.relation || '').trim(),
        address: String(req.body.emergencyContact.address || '').trim()
      };
    }
    if (req.body.cars && typeof req.body.cars === 'object') update.cars = req.body.cars;
    if (req.body.pets && typeof req.body.pets === 'object') update.pets = req.body.pets;

    await serverContext.Tenant.findByIdAndUpdate(req.tenantPortalTenantId, { $set: update }, { new: true });
    const portal = await (0, serverContext.buildTenantPortalPayload)(req.tenantPortalTenantId);
    res.json({ message: 'Profile updated', portal });
  } catch (error) {
    console.error('Tenant portal profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_tenant_portal_maintenance() {
serverContext.app.post('/api/tenant-portal/maintenance', serverContext.authTenantPortal, serverContext.maintenancePhotoUpload.array('photos', 10), async (req, res) => {
  try {
    const tenant = await serverContext.Tenant.findById(req.tenantPortalTenantId).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const details = [
      description,
      req.body.accessPermission ? `Access permission: ${req.body.accessPermission}` : '',
      req.body.preferredTime ? `Preferred time: ${req.body.preferredTime}` : '',
      req.body.contactPreference ? `Contact preference: ${req.body.contactPreference}` : ''
    ].filter(Boolean).join('\n\n');

    const request = await serverContext.MaintenanceRequest.create({
      projectId: tenant.projectId,
      unitId: tenant.unitId || null,
      title,
      description: details,
      priority: ['low', 'medium', 'high', 'urgent'].includes(req.body.priority) ? req.body.priority : 'medium',
      status: 'pending',
      photos: (req.files || []).map(file => `/uploads/maintenance/${file.filename}`),
      updates: [{
        authorRole: 'tenant',
        authorName: tenant.name || 'Tenant',
        text: 'Maintenance request submitted from the tenant portal.',
        createdAt: new Date()
      }]
    });

    await (0, serverContext.syncMaintenanceRequestToEstimate)(request);

    res.status(201).json({ message: 'Maintenance request submitted', request });
  } catch (error) {
    console.error('Tenant portal maintenance create error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_tenant_portal_maintenance_requestId_messages() {
serverContext.app.post('/api/tenant-portal/maintenance/:requestId/messages', serverContext.authTenantPortal, async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Message is required' });
    if (text.length > 1200) return res.status(400).json({ message: 'Message is too long' });

    const tenant = await serverContext.Tenant.findById(req.tenantPortalTenantId).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const request = await serverContext.MaintenanceRequest.findOne({
      _id: req.params.requestId,
      projectId: tenant.projectId,
      ...(tenant.unitId ? { unitId: tenant.unitId } : {})
    });

    if (!request) return res.status(404).json({ message: 'Maintenance request not found' });

    request.updates = request.updates || [];
    request.updates.push({
      authorRole: 'tenant',
      authorName: tenant.name || 'Tenant',
      text,
      createdAt: new Date()
    });
    await request.save();

    res.status(201).json({ message: 'Message added', updates: request.updates });
  } catch (error) {
    console.error('Tenant portal maintenance message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_tenant_portal_payment_notice() {
serverContext.app.post('/api/tenant-portal/payment-notice', serverContext.authTenantPortal, async (req, res) => {
  try {
    const tenant = await serverContext.Tenant.findById(req.tenantPortalTenantId).populate('unitId').lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const amount = Number(req.body.amount) || 0;
    const method = String(req.body.method || '').trim();
    const reference = String(req.body.reference || '').trim();
    const note = String(req.body.note || '').trim();
    if (!amount || !method) return res.status(400).json({ message: 'Amount and method are required' });

    await serverContext.transporter.sendMail({
      from: `Tenant Portal <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `Tenant payment notice - ${tenant.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;">
          <h2>Tenant Payment Notice</h2>
          <p><strong>Tenant:</strong> ${tenant.name}</p>
          <p><strong>Email:</strong> ${tenant.email}</p>
          <p><strong>Unit:</strong> ${tenant.unitId?.number || 'N/A'}</p>
          <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
          <p><strong>Method:</strong> ${method}</p>
          <p><strong>Reference:</strong> ${reference || 'N/A'}</p>
          <p><strong>Note:</strong><br>${note || 'N/A'}</p>
        </div>
      `
    });

    res.json({ message: 'Payment notice sent' });
  } catch (error) {
    console.error('Tenant portal payment notice error:', error);
    res.status(500).json({ message: 'Unable to send payment notice' });
  }
});
}

function get_api_tenant_portal_documents_documentId_view() {
serverContext.app.get('/api/tenant-portal/documents/:documentId/view', serverContext.authTenantPortal, (req, res) => {
  (0, serverContext.sendTenantPortalDocument)(req, res, 'inline');
});
}

function get_api_tenant_portal_documents_documentId_download() {
serverContext.app.get('/api/tenant-portal/documents/:documentId/download', serverContext.authTenantPortal, (req, res) => {
  (0, serverContext.sendTenantPortalDocument)(req, res, 'attachment');
});
}

return {
  authTenantPortal,
  normalizePhoneDigits,
  normalizeAddressForTenantPortal,
  buildTenantPortalPaymentLedger,
  buildTenantPortalPayload,
  post_api_tenant_portal_login,
  get_api_tenant_portal_me,
  put_api_tenant_portal_profile,
  post_api_tenant_portal_maintenance,
  post_api_tenant_portal_maintenance_requestId_messages,
  post_api_tenant_portal_payment_notice,
  sendTenantPortalDocument,
  get_api_tenant_portal_documents_documentId_view,
  get_api_tenant_portal_documents_documentId_download
};
};

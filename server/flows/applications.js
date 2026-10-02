// applications flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function get_applications_new() {
// [SECTION] Rental applications and applicant intake

// Serve Blue Rain rental application page (if not covered by static)
serverContext.app.get('/applications/new', (req, res) => {
  // Track invite opens when accessed via ?inviteId=
  try {
    const inviteId = req.query.inviteId;
    if (inviteId && serverContext.mongoose.Types.ObjectId.isValid(inviteId)) {
      serverContext.ApplicationInvite.findByIdAndUpdate(inviteId, {
        $set: { openedAt: new Date(), status: 'opened' },
        $inc: { openCount: 1 }
      }).catch(err => console.warn('Invite open track error:', err?.message || err));
    }
  } catch (e) {
    console.warn('Invite tracking error:', e?.message || e);
  }
  const htmlPathPublic = serverContext.path.join(serverContext.__dirname, 'public', 'blue-rain-rental-application.html');
  const htmlPathDist = serverContext.path.join(serverContext.__dirname, 'dist', 'blue-rain-rental-application.html');
  if (serverContext.fs.existsSync(htmlPathPublic)) {
    return res.sendFile(htmlPathPublic);
  } else if (serverContext.fs.existsSync(htmlPathDist)) {
    return res.sendFile(htmlPathDist);
  }
  return res.status(404).send('blue-rain-rental-application.html not found');
});
}

function get_applications_review_id() {
// Serve Blue Rain rental application page in review mode
serverContext.app.get('/applications/review/:id', (req, res) => {
  const htmlPathPublic = serverContext.path.join(serverContext.__dirname, 'public', 'blue-rain-rental-application.html');
  const htmlPathDist = serverContext.path.join(serverContext.__dirname, 'dist', 'blue-rain-rental-application.html');
  if (serverContext.fs.existsSync(htmlPathPublic)) {
    return res.sendFile(htmlPathPublic);
  } else if (serverContext.fs.existsSync(htmlPathDist)) {
    return res.sendFile(htmlPathDist);
  }
  return res.status(404).send('blue-rain-rental-application.html not found');
});
}

function post_api_rental_applications() {
serverContext.app.post('/api/rental-applications', async (req, res) => {
  try {
    // Basic validation; rely on schema defaults beyond this
    const { name, email, phone, unit, moveIn, notes } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Missing required fields: name, email' });
    }

    const doc = new serverContext.Application({
      name,
      email,
      phone: phone || '',
      unit: unit || '',
      moveIn: moveIn ? new Date(moveIn) : undefined,
      notes: notes || ''
    });
    const saved = await doc.save();

    // Prepare email summary
    const isProd = process.env.NODE_ENV === 'production';
    const baseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://bluerainrealestate.com' : `http://localhost:${serverContext.PORT}`);
    const viewLink = `${baseUrl}/applications/review/${saved._id}`;
    const toEmail = process.env.DEFAULT_NOTIFICATION_EMAIL || process.env.EMAIL_USER;

    // Common strings
    const submittedStr = saved.submitted ? new Date(saved.submitted).toLocaleString('en-US') : new Date().toLocaleString('en-US');
    const moveInStr = saved.moveIn ? new Date(saved.moveIn).toLocaleDateString('en-US') : 'N/A';

    // Try to extract property address and unit from notes JSON
    let propertyAddress = '';
    let unitNumber = saved.unit || '';
    try {
      if (saved.notes) {
        const parsed = JSON.parse(saved.notes);
        propertyAddress = parsed.propertyAddress || '';
        unitNumber = parsed.unitNumber || unitNumber;
      }
    } catch {}

    const subject = `New Rental Application — ${saved.name}`;
    const textSummary = [
      `Blue Rain MF LLC — Rental Application`,
      `Submitted: ${submittedStr}`,
      ``,
      `Applicant: ${saved.name}`,
      `Email: ${saved.email}`,
      `Phone: ${saved.phone || 'N/A'}`,
      `Property Address: ${propertyAddress || 'N/A'}`,
      `Unit: ${unitNumber || 'N/A'}`,
      `Move-In: ${moveInStr}`,
      `Status: ${saved.status}`,
      ``,
      `View: ${viewLink}`
    ].join('\n');

    const htmlSummary = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#f5f7fb; padding:24px;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e6ebf5;border-radius:14px;overflow:hidden;color:#1a1f2b;box-shadow:0 8px 24px rgba(0,0,0,.06);">
          <div style="padding:16px 18px;border-bottom:1px solid #eef2fb;background:#f8fafc;">
            <div style="font-size:14px;color:#5b6b88;">Blue Rain MF LLC</div>
            <div style="font-size:18px;font-weight:700;color:#1a1f2b;">New Rental Application</div>
          </div>
          <div style="padding:18px;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;color:#1a1f2b;">
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Submitted</td>
                <td style="padding:8px 0;">${submittedStr}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Applicant</td>
                <td style="padding:8px 0;">${saved.name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Email</td>
                <td style="padding:8px 0;">${saved.email}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Phone</td>
                <td style="padding:8px 0;">${saved.phone || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Property Address</td>
                <td style="padding:8px 0;">${propertyAddress || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Unit</td>
                <td style="padding:8px 0;">${unitNumber || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Move-In</td>
                <td style="padding:8px 0;">${moveInStr}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;width:160px;color:#5b6b88;">Status</td>
                <td style="padding:8px 0;">${saved.status}</td>
              </tr>
            </table>
            <div style="margin-top:18px;">
              <a href="${viewLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:linear-gradient(90deg,#3b82f6,#7c4dff);color:#ffffff;text-decoration:none;font-weight:600;">View Application</a>
            </div>
          </div>
        </div>
      </div>
    `;

    // Send email if at least one recipient is configured
    const recipients = [toEmail, 'bluerainrealestate@gmail.com'].filter(Boolean);
    if (recipients.length > 0) {
      try {
        await serverContext.transporter.sendMail({
          from: `"BlueRain Team" <${process.env.EMAIL_USER}>`,
          to: recipients,
          subject,
          text: textSummary,
          html: htmlSummary
        });
      } catch (mailErr) {
        console.error('Email send error:', mailErr);
        // Continue even if email fails
      }
    }

    // Respond with saved application
    return res.json({ id: saved._id, application: saved });
  } catch (err) {
    console.error('Create rental application error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function post_api_rental_applications_send_link() {
serverContext.app.post('/api/rental-applications/send-link', async (req, res) => {
  try {
    const { name = 'Applicant', email, propertyId, propertyName, unitId, unitNumber, context } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const baseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://bluerainrealestate.com' : `http://localhost:${serverContext.PORT}`);
    // Create invite first to embed inviteId in the URL
    const invite = await serverContext.ApplicationInvite.create({
      name: name || 'Applicant',
      email,
      propertyId: propertyId || undefined,
      propertyName: propertyName || undefined,
      unitId: unitId || undefined,
      unitNumber: unitNumber || undefined,
      context: context || undefined,
      applicationUrl: '',
      status: 'sent'
    });


    const subjBits = [];
    if (propertyName) subjBits.push(propertyName);
    if (unitNumber) subjBits.push(`Unit ${unitNumber}`);
    const subject = `Rental Application Link${subjBits.length ? '  ' + subjBits.join('  ') : ''}`;

    // Build a human-friendly property address if propertyId provided (outside of template)
    let propertyAddressText = '';
    try {
      if (propertyId && serverContext.mongoose.Types.ObjectId.isValid(propertyId)) {
        const proj = await serverContext.Project.findById(propertyId).select('address name').lean();
        const addr = proj?.address || {};
        const parts = [];
        if (addr.addressLine1) parts.push(addr.addressLine1);
        if (addr.addressLine2 && String(addr.addressLine2).trim()) parts.push(addr.addressLine2);
        const cityState = [addr.city, addr.state].filter(Boolean).join(', ');
        if (cityState) parts.push(cityState);
        if (addr.zip) parts.push(addr.zip);
        propertyAddressText = parts.filter(Boolean).join('  ');
      }
    } catch (e) {
      // Non-fatal: leave propertyAddressText empty on failures
      console.warn('Unable to build property address for invite:', e?.message || e);
    }

   // Build application URL including property address / unit in query so the form can auto-fill
    let propertyForUrl = propertyAddressText || propertyName || '';
    let qs = `inviteId=${invite._id}`;
    if (propertyForUrl && String(propertyForUrl).trim()) {
      qs += `&propertyAddress=${encodeURIComponent(propertyForUrl)}`;
    }
    if (unitNumber && String(unitNumber).trim()) {
      qs += `&unitNumber=${encodeURIComponent(String(unitNumber))}`;
    }
    const applicationUrl = `${baseUrl}/applications/new?${qs}`;
    
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#f5f7fb; padding:24px;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e6ebf5;border-radius:14px;overflow:hidden;color:#1a1f2b;box-shadow:0 8px 24px rgba(0,0,0,.06);">
          <div style="padding:16px 18px;border-bottom:1px solid #eef2fb;background:#f8fafc;">
            <div style="font-size:14px;color:#5b6b88;">Blue Rain MF LLC</div>
            <div style="font-size:18px;font-weight:700;color:#1a1f2b;">Rental Application Invitation</div>
          </div>
          <div style="padding:18px;">
            <p style="margin:0 0 12px;">Hi ${name || 'Applicant'},</p>
            <p style="margin:0 0 16px; line-height:1.6;">Start your rental application using the link below.</p>
            ${(propertyName || unitNumber || context) ? `
            <div style="margin:10px 0 18px; padding:10px 12px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px;">
              ${propertyAddressText ? `<div style=\"font-size:13px; color:#1f2937;\"><strong>Address:</strong> ${propertyAddressText}</div>` : (propertyName ? `<div style=\"font-size:13px; color:#1f2937;\"><strong>Property:</strong> ${propertyName}</div>` : '')}
              ${unitNumber ? `<div style=\"font-size:13px; color:#1f2937;\"><strong>Unit:</strong> ${unitNumber}</div>` : ''}
              ${context ? `<div style=\"font-size:12px; color:#6b7280; margin-top:6px;\">${context}</div>` : ''}
            </div>` : ''}
            <div style="margin:16px 0 24px;">
              <a href="${applicationUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:linear-gradient(90deg,#3b82f6,#7c4dff);color:#ffffff;text-decoration:none;font-weight:600;">Start Application</a>
            </div>
            <p style="margin:0 0 8px; font-size:13px; color:#64748b;">If the button doesn’t work, copy and paste this URL:</p>
            <code style="display:block; background:#f8fafc; border:1px solid #e5e7eb; padding:10px; border-radius:8px; font-size:12px; color:#0f172a;">${applicationUrl}</code>
          </div>
        </div>
      </div>`;

    // Configure SMTP properly (fallback to Gmail if env not set)
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const transporter = serverContext.nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for 587
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
      from: `"BlueRain Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);

    // Update invite record with the final URL
    await serverContext.ApplicationInvite.findByIdAndUpdate(invite._id, { $set: { applicationUrl } });

    return res.json({ ok: true, message: 'Application link sent', applicationUrl, messageId: info?.messageId });
  } catch (err) {
    console.error('Send application link error:', err);
    return res.status(500).json({ message: 'Failed to send application link' });
  }
});
}

function get_api_rental_applications() {
// GET: list rental applications (optional ?limit=, default 100, max 500)
serverContext.app.get('/api/rental-applications', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const apps = await serverContext.Application.find({})
      .sort({ submitted: -1 })
      .limit(limit)
      .lean();
    return res.json(apps);
  } catch (err) {
    console.error('List rental applications error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function get_api_application_invites() {
// GET: list application invites (optional ?limit=, default 100, max 500)
serverContext.app.get('/api/application-invites', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const invites = await serverContext.ApplicationInvite.find({})
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
    return res.json(invites);
  } catch (err) {
    console.error('List application invites error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function put_api_application_invites_id() {
// PUT: update an application invite by id
serverContext.app.put('/api/application-invites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, propertyName, unitNumber, status, applicationUrl } = req.body || {};

    const update = {};
    if (typeof name === 'string') update.name = name;
    if (typeof email === 'string') update.email = email;
    if (typeof propertyName === 'string') update.propertyName = propertyName;
    if (typeof unitNumber === 'string') update.unitNumber = unitNumber;
    if (typeof status === 'string') update.status = status;
    if (typeof applicationUrl === 'string') update.applicationUrl = applicationUrl;

    const updated = await serverContext.ApplicationInvite.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!updated) {
      return res.status(404).json({ message: 'Invite not found' });
    }
    return res.json({ invite: updated });
  } catch (err) {
    console.error('Update application invite error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function delete_api_application_invites_id() {
// DELETE: remove an application invite by id
serverContext.app.delete('/api/application-invites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await serverContext.ApplicationInvite.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Invite not found' });
    }
    return res.json({ message: 'Invite deleted' });
  } catch (err) {
    console.error('Delete application invite error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function post_api_application_invites_id_notes() {
// POST: append a note to an application invite
serverContext.app.post('/api/application-invites/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    let { text } = req.body || {};
    text = (text || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Note text is required' });
    }

    const updated = await serverContext.ApplicationInvite.findByIdAndUpdate(
      id,
      { $push: { notesHistory: { text, createdAt: new Date() } } },
      { new: true }
    ).select('notesHistory').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    return res.json({ notes: updated.notesHistory || [] });
  } catch (err) {
    console.error('Append invite note error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function delete_api_application_invites_id_notes_noteId() {
// DELETE: remove a single note from an application invite
serverContext.app.delete('/api/application-invites/:id/notes/:noteId', async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const updated = await serverContext.ApplicationInvite.findByIdAndUpdate(
      id,
      { $pull: { notesHistory: { _id: noteId } } },
      { new: true }
    ).select('notesHistory').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    return res.json({ notes: updated.notesHistory || [] });
  } catch (err) {
    console.error('Delete invite note error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function get_api_rental_applications_id() {
// GET: fetch a rental application by id
serverContext.app.get('/api/rental-applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await serverContext.Application.findById(id);
    if (!doc) return res.status(404).json({ message: 'Application not found' });
    return res.json(doc);
  } catch (err) {
    console.error('Get rental application error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function put_api_rental_applications_id() {
// PUT: update a rental application by id
serverContext.app.put('/api/rental-applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, unit, moveIn, notes, status } = req.body;

    const update = {};
    if (typeof name === 'string') update.name = name;
    if (typeof email === 'string') update.email = email;
    if (typeof phone === 'string') update.phone = phone;
    if (typeof unit === 'string') update.unit = unit;
    if (typeof notes === 'string') update.notes = notes;
    if (typeof status === 'string') update.status = status;
    if (moveIn) {
      const d = new Date(moveIn);
      if (!isNaN(d.getTime())) update.moveIn = d;
    }

    const updated = await serverContext.Application.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Application not found' });
    return res.json({ message: 'Application updated', application: updated });
  } catch (err) {
    console.error('Update rental application error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function post_api_rental_applications_id_notes() {
// (Deprecated) Application move-in checklist endpoint removed.

// POST: append a note to a rental application
serverContext.app.post('/api/rental-applications/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    let { text } = req.body || {};
    text = (text || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Note text is required' });
    }

    const updated = await serverContext.Application.findByIdAndUpdate(
      id,
      { $push: { notesHistory: { text, createdAt: new Date() } } },
      { new: true }
    ).select('notesHistory').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Application not found' });
    }

    return res.json({ notes: updated.notesHistory || [] });
  } catch (err) {
    console.error('Append application note error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function delete_api_rental_applications_id_notes_noteId() {
// DELETE: remove a single note from a rental application
serverContext.app.delete('/api/rental-applications/:id/notes/:noteId', async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const updated = await serverContext.Application.findByIdAndUpdate(
      id,
      { $pull: { notesHistory: { _id: noteId } } },
      { new: true }
    ).select('notesHistory').lean();

    if (!updated) {
      return res.status(404).json({ message: 'Application not found' });
    }

    return res.json({ notes: updated.notesHistory || [] });
  } catch (err) {
    console.error('Delete application note error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

function delete_api_rental_applications_id() {
// DELETE: remove a rental application by id
serverContext.app.delete('/api/rental-applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await serverContext.Application.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Application not found' });
    }
    return res.json({ message: 'Application deleted' });
  } catch (err) {
    console.error('Delete rental application error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
}

return {
  get_applications_new,
  get_applications_review_id,
  post_api_rental_applications,
  post_api_rental_applications_send_link,
  get_api_rental_applications,
  get_api_application_invites,
  put_api_application_invites_id,
  delete_api_application_invites_id,
  post_api_application_invites_id_notes,
  delete_api_application_invites_id_notes_noteId,
  get_api_rental_applications_id,
  put_api_rental_applications_id,
  post_api_rental_applications_id_notes,
  delete_api_rental_applications_id_notes_noteId,
  delete_api_rental_applications_id
};
};

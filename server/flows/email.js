// email flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// [SECTION] Background receipt ingestion (IMAP + OCR)




function checkEmailInbox() {
  // Always create a new IMAP instance for each scan to avoid stale listeners
  
  
  const imap = new serverContext.Imap({
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });

  imap.once('ready', function() {
    imap.openBox('INBOX', false, function(err, box) {
      if (err) {
        console.error('IMAP openBox error:', err);
        imap.end();
        return;
      }
      console.log('📥 IMAP inbox opened!');
      // Search for all emails, get the latest 10 by sequence number
      imap.search(['ALL'], function(err, results) {
        if (err) {
          console.error('IMAP search error:', err);
          imap.end();
          return;
        }
        if (!results.length) {
          console.log('No emails found.');
          imap.end();
          return;
        }
        // Only process the latest 1 email
        const latestEmails = results.slice(-1);
        // Now filter to only UNSEEN among the latest 1
        imap.search(['UNSEEN'], function(err, unseenResults) {
          if (err) {
            console.error('IMAP search error (UNSEEN):', err);
            imap.end();
            return;
          }
          // Intersection of latestEmails and unseenResults
          const toProcess = latestEmails.filter(seq => unseenResults.includes(seq));
          if (!toProcess.length) {
            console.log('No new unseen emails among the latest 10.');
            imap.end();
            return;
          }
          const f = imap.fetch(toProcess, { bodies: '', struct: true, markSeen: true });
          f.on('message', function(msg, seqno) {
            msg.on('body', function(stream, info) {
              (0, serverContext.simpleParser)(stream, async (err, parsed) => {
                if (err) return console.error('Mail parse error:', err);
                console.log('📧 New email from:', parsed.from.text, '| Subject:', parsed.subject);

                // --- Save attachments with fallback filename ---
                if (parsed.attachments && parsed.attachments.length > 0) {
                  for (const att of parsed.attachments) {
                    let filename = att.filename;
                    if (!filename) {
                      filename = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`;
                      console.warn('Attachment had no filename, using fallback:', filename);
                    }
                    const filePath = serverContext.path.join(serverContext.ATTACHMENTS_DIR, filename);
                    serverContext.fs.writeFileSync(filePath, att.content);
                    console.log('📎 Saved attachment:', filename, '| Path:', filePath, '| Size:', att.content.length, 'bytes');

                    // --- Extra logging for PDF detection ---
                    const ext = serverContext.path.extname(filename).toLowerCase();
                    if (ext === '.pdf') {
                      console.log('📄 Detected PDF attachment:', filename);
                    }

                    // --- Run OCR on attachment (including PDF) ---
                    let ocrText = '';
                    try {
                      console.log('🔎 Passing file to Google Vision:', filePath, '| Is PDF:', ext === '.pdf');
                      const [result] = await serverContext.visionClient.documentTextDetection(filePath);
                      ocrText = result.fullTextAnnotation?.text || '';
                      console.log('📝 OCR result:', ocrText.substring(0, 300));
                    } catch (ocrErr) {
                      console.error('❌ OCR error for', filename, ':', ocrErr);
                    }

                    // Fallback to email subject/body if OCR fails
                    if (!ocrText) {
                      ocrText = (parsed.subject || '') + '\n' + (parsed.text || '');
                      console.log('📝 Fallback OCR/email text:', ocrText.substring(0, 300));
                    }

                    // --- Extract amount ---
                    let amount = null;
                    const amountMatch = ocrText.match(/\$([0-9,.]+)/);
                    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

                    // --- Extract project ---
                    let projectId = null;
                    const projectMatch = ocrText.match(/Project\s*[:\-]?\s*([A-Za-z0-9 \-]+)/i);
                    if (projectMatch) {
                      const projectName = projectMatch[1].trim();
                      const project = await serverContext.Project.findOne({ name: new RegExp(projectName, 'i') });
                      if (project) projectId = project._id;
                    }

                    // --- Extract description ---
                    let description = '';
                    const descMatch = ocrText.match(/Description\s*[:\-]?\s*(.+)/i);
                    description = descMatch ? descMatch[1].trim() : (parsed.subject || '(no subject)');

                    // --- Always create an expense ---
await serverContext.Expense.create({
  projectId,
  vendor: "", // Leave vendor blank for frontend OCR
  amount: 0,  // Leave amount blank for frontend OCR
  date: new Date().toISOString().split('T')[0],
  description: "", // Leave description blank for frontend OCR
  receiptPath: `/uploads/email-receipts/${filename}`,
  status: 'missing info',
  source: 'imap'
});
console.log('💸 Expense created for email receipt:', filename, '| project', projectId);
                  }
                }
              });
            });
          });
          f.once('end', function() {
            console.log('✅ All new emails processed.');
            imap.end();
          });
        });
      });
    });
  });

  imap.once('error', function(err) {
    console.error('IMAP connection error:', err);
  });
  imap.once('end', function() {
    console.log('IMAP connection closed.');
  });

  imap.connect();
}

// 📩 Send Email for Existing Users
async function sendExistingUserEmail(email, role, projectId) {
  const signInURL =
    role === "project-manager"
      ? `${process.env.BASE_URL}/project-manager-auth.html`
      : `${process.env.BASE_URL}/sign-inpage.html`;

  const mailOptions = {
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Project Assignment Notification",
    html: `
      <h3>You've Been Invited</h3>
      <p>Hello,</p>
      <p>You have been invited as a <strong>${role}</strong>${
        projectId ? ` for project <strong>${projectId}</strong>` : ""
      }.</p>
      <p>You can sign in to access your dashboard:</p>
      <a href="${signInURL}" style="padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">Sign In</a>
      <p>Best Regards,<br/><strong>BESF Team</strong></p>
    `
  };

  try {
    const info = await serverContext.transporter.sendMail(mailOptions);
    console.log(`✅ Notification email sent to ${email} (existing user). ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending existing user email:`, error);
    return false;
  }
}

// 📩 Send Invitation Email for New Users
async function sendNewUserInviteEmail(email, role, projectId, token) {
  const activationURL = `${process.env.BASE_URL}/sign-inpage.html?email=${encodeURIComponent(
    email
  )}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}${
    projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""
  }`;

  const mailOptions = {
    from: `"BESF Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "You're Invited to Join BESF",
    html: `
      <h3>Welcome to BESF</h3>
      <p>Hello,</p>
      <p>You have been invited as a <strong>${role}</strong>${
        projectId ? ` for project <strong>${projectId}</strong>` : ""
      }.</p>
      <p>Click the button below to activate your account:</p>
      <a href="${activationURL}" style="padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">Activate Account</a>
      <p>If you didn’t request this, please ignore the email.</p>
      <p>Best Regards,<br/><strong>BESF Team</strong></p>
    `
  };

  try {
    const info = await serverContext.transporter.sendMail(mailOptions);
    console.log(`✅ Invitation email sent to new user ${email}. ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending invitation email:`, error);
    return false;
  }
}

function getTaskAssignmentEmailHtml({ assigneeName, projectName, projectAddress, taskTitle, dueDate, description, signInLink }) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
      <tr>
        <td align="center">
          <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px #2563eb22;margin:32px 0;">
            <tr>
              <td style="padding:32px;">
                <h2 style="color:#2563eb;font-size:2em;margin-bottom:18px;">New Task Assigned</h2>
                <p style="font-size:1.08em;color:#334155;margin:0 0 18px 0;">
                  <b>Hello ${assigneeName},</b>
                </p>
                <p style="margin:0 0 18px 0;font-size:1.05em;">
                  You have been assigned a new task in the project:<br>
                  <b style="color:#2563eb;">${projectName}</b>
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                  <tr>
                    <td style="color:#64748b;padding:8px 0;width:120px;">Task:</td>
                    <td style="padding:8px 0;"><b>${taskTitle}</b></td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:8px 0;">Project Address:</td>
                    <td style="padding:8px 0;">${projectAddress}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:8px 0;">Due Date:</td>
                    <td style="padding:8px 0;">${dueDate}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:8px 0;">Description:</td>
                    <td style="padding:8px 0;">${description}</td>
                  </tr>
                </table>
                <p style="margin:24px 0;">
                  <a href="${signInLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:1.08em;">
                    Sign In to View Task
                  </a>
                </p>
                <hr style="border-top:1px solid #e5e7eb;margin:32px 0 18px 0;">
                <p style="color:#64748b;font-size:0.98em;margin:0;">
                  If you have any questions, please contact your manager.<br>
                  <span style="color:#2563eb;">Thank you!</span>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function post_api_send_email() {
// ✅ API to Send Task Assignment Email
serverContext.app.post('/api/send-email', async (req, res) => {
  const { to, subject, text, html, taskData } = req.body;

  // If taskData is provided, generate improved HTML email
  let emailHtml = html;
  if (taskData) {
    emailHtml = (0, serverContext.getTaskAssignmentEmailHtml)({
      assigneeName: taskData.assigneeName,
      projectName: taskData.projectName,
      projectAddress: taskData.projectAddress,
      taskTitle: taskData.taskTitle,
      dueDate: taskData.dueDate,
      description: taskData.description,
      signInLink: taskData.signInLink
    });
  }

  if (!to || !subject || (!text && !emailHtml)) {
    return res.status(400).json({ success: false, message: "Missing email parameters" });
  }

  try {
    await serverContext.transporter.sendMail({
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html: emailHtml || undefined,
    });

    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});
}

function post_api_contact() {
// Contact Form Submission Endpoint
serverContext.app.post('/api/contact', async (req, res) => {
  const { name, email, phone, details } = req.body;
  // Validate input with stricter checks
  if (
    !name || typeof name !== 'string' || name.length < 2 ||
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !phone || phone.length < 7 ||
    !details || typeof details !== 'string' || details.length < 10
  ) {
    return res.status(400).json({
      success: false,
      message: 'Please fill out all fields with valid information.'
    });
  }
 
  // Compose a visually appealing HTML email
  const htmlMsg = `
    <div style="font-family:Inter,Arial,sans-serif;background:#f6fafd;padding:24px;">
      <div style="max-width:520px;margin:auto;background:#fff;border-radius:18px;box-shadow:0 2px 8px #1a73e820;padding:24px;">
        <h2 style="color:#1a73e8;margin-top:0;">New Contact Form Submission</h2>
        <table style="width:100%;margin-bottom:18px;">
          <tr><td style="font-weight:600;">Name:</td><td>${name}</td></tr>
          <tr><td style="font-weight:600;">Email:</td><td>${email}</td></tr>
          <tr><td style="font-weight:600;">Phone:</td><td>${phone}</td></tr>
        </table>
        <div style="margin:18px 0;padding:12px;background:#eaf6ff;border-radius:8px;">
          <strong>Project Details:</strong><br>
          <span style="font-size:1.08em;color:#222;">${details.replace(/\n/g, '<br>')}</span>
        </div>
        <div style="margin-top:24px;text-align:right;">
          <span style="font-size:0.95em;color:#888;">Received via BluerainCO Website</span>
        </div>
      </div>
    </div>
  `;

  try {
    await serverContext.transporter.sendMail({
      from: `"Website Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission',
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nDetails: ${details}`,
      html: htmlMsg
    });
    res.status(200).json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Contact form email error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again later.'
    });
  }
});
}

return {
  checkEmailInbox,
  sendExistingUserEmail,
  sendNewUserInviteEmail,
  getTaskAssignmentEmailHtml,
  post_api_send_email,
  post_api_contact
};
};

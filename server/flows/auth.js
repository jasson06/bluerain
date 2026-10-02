// auth flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// The account menu only reads or updates the authenticated manager's own profile.
function authenticateManagerProfile(req, res, next) {
  try {
    const match = String(req.headers.authorization || '').match(/^Bearer (\S+)$/);
    if (!match) return res.status(401).json({ error: 'Sign in required.' });
    const claims = serverContext.jwt.verify(match[1], serverContext.JWT_SECRET);
    if (!claims.managerId || !serverContext.mongoose.Types.ObjectId.isValid(claims.managerId)) return res.status(401).json({ error: 'Invalid manager session.' });
    req.profileManagerId = claims.managerId;
    next();
  } catch (_) { return res.status(401).json({ error: 'Invalid or expired session.' }); }
}

function get_api_managers() {
serverContext.app.get('/api/managers', async (req, res) => {
  try {
    const managers = await serverContext.Manager.find(); // Fetch all managers from the database
    res.status(200).json(managers); // Send managers as a response
  } catch (error) {
    console.error('Error fetching managers:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch managers' });
  }
});
}

function get_api_manager_profile() {
serverContext.app.get('/api/manager/profile', serverContext.authenticateManagerProfile, async (req, res) => {
  try {
    const manager = await serverContext.Manager.findById(req.profileManagerId).select('_id name email').lean();
    if (!manager) return res.status(404).json({ error: 'Manager not found.' });
    return res.json({ manager });
  } catch (_) { return res.status(500).json({ error: 'Unable to load profile.' }); }
});
}

function put_api_manager_profile() {
serverContext.app.put('/api/manager/profile', serverContext.authenticateManagerProfile, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100) return res.status(400).json({ error: 'Enter a name between 1 and 100 characters.' });
  try {
    const manager = await serverContext.Manager.findByIdAndUpdate(req.profileManagerId, { $set: { name } }, { new: true, runValidators: true }).select('_id name email').lean();
    if (!manager) return res.status(404).json({ error: 'Manager not found.' });
    return res.json({ manager });
  } catch (_) { return res.status(500).json({ error: 'Unable to save profile.' }); }
});
}

function put_api_manager_password() {
serverContext.app.put('/api/manager/password', serverContext.authenticateManagerProfile, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters (up to 72 bytes).' });
  }
  if (currentPassword === newPassword) return res.status(400).json({ error: 'Choose a different new password.' });
  try {
    const manager = await serverContext.Manager.findById(req.profileManagerId).select('_id password');
    if (!manager || !(await serverContext.bcrypt.compare(currentPassword, manager.password))) return res.status(400).json({ error: 'Current password is incorrect.' });
    const password = await serverContext.bcrypt.hash(newPassword, 10);
    const result = await serverContext.Manager.updateOne({ _id: req.profileManagerId, password: manager.password }, { $set: { password }, $unset: { passwordResetToken: '', passwordResetExpires: '' } });
    if (!result.modifiedCount) return res.status(409).json({ error: 'Your account changed. Sign in again and retry.' });
    return res.json({ success: true });
  } catch (_) { return res.status(500).json({ error: 'Unable to change password.' }); }
});
}

function get_api_managers_id() {
serverContext.app.get('/api/managers/:id', async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!serverContext.mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid manager ID.' });
  }

  try {
    const manager = await serverContext.Manager.findById(id);
    if (!manager) {
      return res.status(404).json({ error: 'Manager not found.' });
    }

    res.status(200).json(manager);
  } catch (error) {
    console.error('Error fetching manager:', error.message);
    res.status(500).json({ error: 'Failed to fetch manager.' });
  }
});
}

function post_api_signup() {
// [SECTION] Vendor auth and assignment workflow

// Vendor Sign-Up
serverContext.app.post("/api/signup", async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    const existingVendor = await serverContext.Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ success: false, message: "Vendor already exists." });
    }

    // Create the new vendor
    const newVendor = new serverContext.Vendor({ name, email, phone, password });
    await newVendor.save();

    // Assign projects based on pending invitations
    const pendingInvitations = await serverContext.Invitation.find({ email, role: "vendor", status: "pending" });

    for (const invitation of pendingInvitations) {
      newVendor.assignedProjects.push({ projectId: invitation.projectId, status: "new" });
      invitation.status = "accepted";
      await invitation.save();
    }

    await newVendor.save();

    res.status(201).json({
      success: true,
      message: "Vendor registered successfully and projects assigned.",
      vendor: newVendor,
    });
  } catch (error) {
    console.error("Error registering vendor:", error);
    res.status(500).json({ success: false, message: "Failed to register vendor." });
  }
});
}

function post_api_signin() {
// Vendor Sign-In
serverContext.app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body;

  // Validate request body
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    console.log('Incoming sign-in request:', { email });

    // Find vendor by email
    const vendor = await serverContext.Vendor.findOne({ email });
    if (!vendor) {
      console.warn('Vendor not found:', email);
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    // Compare password
    const isMatch = await serverContext.bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      console.warn('Invalid credentials for vendor:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Generate JWT token
    const token = serverContext.jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Vendor authenticated successfully:', email);

    // Respond with token and vendorId
    return res.status(200).json({ success: true, token, vendorId: vendor._id });
  } catch (error) {
    console.error('Error during vendor sign-in:', error);
    return res.status(500).json({ success: false, message: 'An internal error occurred. Please try again later.' });
  }
});
}

function post_api_password_reset_request() {
// Password Reset Request
serverContext.app.post('/api/password-reset/request', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  try {
    const vendor = await serverContext.Vendor.findOne({ email });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const resetToken = serverContext.crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await serverContext.bcrypt.hash(resetToken, 10);

    vendor.passwordResetToken = resetTokenHash;
    vendor.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry
    await vendor.save();

    // Construct the reset link
    const baseUrl = process.env.BASE_URL || 'http://localhost:5500';
    const resetLink = `${baseUrl}/sign-inpage.html?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;

    // Send the reset token and link via email
    await serverContext.transporter.sendMail({
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to: vendor.email,
      subject: 'Password Reset Request',
      text: `Your password reset token is: ${resetToken}\n\nOr click the link below to reset your password:\n${resetLink}`,
      html: `
        <p>Your password reset token is: <b>${resetToken}</b></p>
        <p>Or click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
      `
    });

    res.status(200).json({ success: true, message: 'Password reset token sent to email.' });
  } catch (error) {
    console.error('Error generating password reset token:', error);
    res.status(500).json({ success: false, message: 'Failed to generate password reset token.' });
  }
});
}

function post_api_password_reset() {
// Password Reset
serverContext.app.post('/api/password-reset', async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const vendor = await serverContext.Vendor.findOne({ email });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    if (!vendor.passwordResetToken || vendor.passwordResetExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    const isTokenValid = await serverContext.bcrypt.compare(token, vendor.passwordResetToken);
    if (!isTokenValid) {
      return res.status(400).json({ success: false, message: 'Invalid reset token.' });
    }

    const salt = await serverContext.bcrypt.genSalt(10);
    vendor.password = await serverContext.bcrypt.hash(newPassword, salt);
    vendor.passwordResetToken = undefined;
    vendor.passwordResetExpires = undefined;
    await vendor.save();

    res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});
}

function post_api_manager_signup() {
// [SECTION] Manager auth, invitations, and outbound email

// Project Manager Sign-Up
serverContext.app.post('/api/manager/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const existingManager = await serverContext.Manager.findOne({ email });
    if (existingManager) {
      return res.status(400).json({ success: false, message: 'Project Manager already exists.' });
    }

    const newManager = new serverContext.Manager({ name, email, password });
    await newManager.save();

    res.status(201).json({ success: true, message: 'Project Manager registered successfully.' });
  } catch (error) {
    console.error('Error registering project manager:', error);
    res.status(500).json({ success: false, message: 'Failed to register project manager.' });
  }
});
}

function post_api_manager_signin() {
// Project Manager Sign-In
serverContext.app.post('/api/manager/signin', async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    console.log('Missing email or password');
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log('Invalid email format:', email);
    return res.status(400).json({ success: false, message: 'Invalid email format.' });
  }

  try {
    // Check database connection
    if (!serverContext.mongoose.connection.readyState) {
      console.error('Database not connected');
      return res.status(500).json({ success: false, message: 'Database connection error.' });
    }

    console.log('Email Received:', email);

    // Find manager by email
    const manager = await serverContext.Manager.findOne({ email: email.toLowerCase() });
    console.log('Manager Found:', manager);

    if (!manager) {
      console.log('No manager found for email:', email);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check password
    const isMatch = await serverContext.bcrypt.compare(password, manager.password);
    console.log('Password Match:', isMatch);

    if (!isMatch) {
      console.log('Password mismatch for manager:', email);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = serverContext.jwt.sign(
      { managerId: manager._id }, 
      serverContext.JWT_SECRET, 
      { expiresIn: '1h' } // Token valid for 1 hour
    );

    // Send successful response
    console.log('Sign-in successful for manager:', manager.email);
    res.status(200).json({
      success: true,
      token,
      managerId: manager._id,
      managerName: manager.name,
    });
  } catch (error) {
    console.error('Error signing in project manager:', error.message);
    res.status(500).json({ success: false, message: 'Failed to sign in.' });
  }
});
}

function post_api_manager_reset_password() {
// Password Reset Request
serverContext.app.post('/api/manager/reset-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  try {
    const manager = await serverContext.Manager.findOne({ email });
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Project Manager not found.' });
    }

    const resetToken = serverContext.crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await serverContext.bcrypt.hash(resetToken, 10);

    manager.passwordResetToken = resetTokenHash;
    manager.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry
    await manager.save();

    // Construct the reset link
    const baseUrl = process.env.BASE_URL || 'http://localhost:5500';
    const resetLink = `${baseUrl}/project-manager-auth.html?role=manager&email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;

    await serverContext.transporter.sendMail({
      from: `"BESF Team" <${process.env.EMAIL_USER}>`,
      to: manager.email,
      subject: 'Password Reset Request',
      text: `Your password reset token is: ${resetToken}\n\nOr click the link below to reset your password:\n${resetLink}`,
      html: `
        <p>Your password reset token is: <b>${resetToken}</b></p>
        <p>Or click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
      `
    });

    res.status(200).json({ success: true, message: 'Password reset token sent to email.' });
  } catch (error) {
    console.error('Error generating password reset token:', error);
    res.status(500).json({ success: false, message: 'Failed to generate password reset token.' });
  }
});
}

function post_api_invite() {
// 📌 API: Invite Team Members (Vendors or Project Managers)
serverContext.app.post("/api/invite", async (req, res) => {
  try {
    const { emails, role, projectId } = req.body;

    if (!Array.isArray(emails) || emails.length === 0 || !role) {
      return res.status(400).json({
        success: false,
        message: "Emails and role are required."
      });
    }

    const invitedUsers = [];

    for (const rawEmail of emails) {
      const email = (rawEmail || '').toLowerCase();
      if (!email) continue;

      if (role === 'vendor') {
        let vendor = await serverContext.Vendor.findOne({ email });
        if (vendor) {
          // Existing vendor: if inactive -> treat as new invite
          if (vendor.status === 'inactive') {
            const token = serverContext.crypto.randomBytes(32).toString('hex');
            const invitation = new serverContext.Invitation({ email, role, projectId, token });
            await invitation.save();
            vendor.isInvited = true;
            await vendor.save();
            invitedUsers.push({ email, status: 'invited-inactive' });
            await (0, serverContext.sendNewUserInviteEmail)(email, role, projectId, token);
          } else {
            // Active vendor
            if (projectId) {
              const alreadyAssigned = vendor.assignedProjects?.some(p => p.projectId.toString() === projectId);
              if (!alreadyAssigned) {
                vendor.assignedProjects = vendor.assignedProjects || [];
                vendor.assignedProjects.push({ projectId, status: 'new' });
                await vendor.save();
              }
            }
            invitedUsers.push({ email, status: 'existing-active' });
            await (0, serverContext.sendExistingUserEmail)(email, role, projectId);
          }
        } else {
          // No vendor: create invitation only
            const token = serverContext.crypto.randomBytes(32).toString('hex');
            const invitation = new serverContext.Invitation({ email, role, projectId, token });
            await invitation.save();
            invitedUsers.push({ email, status: 'invited-new' });
            await (0, serverContext.sendNewUserInviteEmail)(email, role, projectId, token);
        }
      } else {
        // Manager flow unchanged but annotate status
        let manager = await serverContext.Manager.findOne({ email });
        if (manager) {
          if (projectId) {
            const alreadyAssigned = manager.assignedProjects?.some(p => p.projectId.toString() === projectId);
            if (!alreadyAssigned) {
              manager.assignedProjects = manager.assignedProjects || [];
              manager.assignedProjects.push({ projectId });
              await manager.save();
            }
          }
          invitedUsers.push({ email, status: 'existing-manager' });
          await (0, serverContext.sendExistingUserEmail)(email, role, projectId);
        } else {
          const token = serverContext.crypto.randomBytes(32).toString('hex');
          const invitation = new serverContext.Invitation({ email, role, projectId, token });
          await invitation.save();
          invitedUsers.push({ email, status: 'invited-manager' });
          await (0, serverContext.sendNewUserInviteEmail)(email, role, projectId, token);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Invitations processed successfully.",
      invitedUsers
    });
  } catch (error) {
    console.error("Error inviting team members:", error);
    res.status(500).json({
      success: false,
      message: "Failed to invite team members."
    });
  }
});
}

function get_sign_inpage_html() {
// Serve the activation page
serverContext.app.get('/sign-inpage.html', (req, res) => {
  res.sendFile(serverContext.path.join(serverContext.__dirname, 'dist', 'sign-inpage.html'), (err) => {
    if (err) {
      console.error('Error serving sign-inpage.html:', err);
      res.status(500).send('Failed to load the activation page.');
    }
  });
});
}

function post_api_invite_accept() {
// POST /api/invite/accept

serverContext.app.post("/api/invite/accept", async (req, res) => {
  console.log("Request body:", req.body);

  const { token, name, password } = req.body;

  if (!token || !name || !password) {
    console.log("Missing required fields:", { token, name, password });
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    // Find invitation
    const invitation = await serverContext.Invitation.findOne({ token });
    if (!invitation) {
      console.log("Invalid or expired token:", token);
      return res.status(404).json({ success: false, message: "Invalid or expired token." });
    }

    // Hash the password once
    const hashedPassword = await serverContext.bcrypt.hash(password, 10);
    console.log("Hashed password:", hashedPassword);

    const userEmail = invitation.email.toLowerCase();

    // Check if user already exists
    if (invitation.role === "vendor") {
      let existingVendor = await serverContext.Vendor.findOne({ email: userEmail });

      if (existingVendor) {
        // Update existing vendor's password and name if missing
        if (!existingVendor.password) {
          existingVendor.password = hashedPassword;
          existingVendor.name = name;
        }

        // Add assigned project only if it exists and is not already assigned
        if (invitation.projectId) {
          const alreadyAssigned = existingVendor.assignedProjects?.some(
            p => p.projectId.toString() === invitation.projectId.toString()
          );
          if (!alreadyAssigned) {
            existingVendor.assignedProjects.push({ projectId: invitation.projectId, status: "new" });
          }
        }

        existingVendor.isActive = true;
        existingVendor.status = 'active';
        existingVendor.isInvited = false;
        await existingVendor.save();
      } else {
        // New vendor
        const newVendor = new serverContext.Vendor({
          name,
          email: userEmail,
          password: hashedPassword,
          assignedProjects: invitation.projectId ? [{ projectId: invitation.projectId, status: "new" }] : []
        });
        newVendor.isActive = true;
        newVendor.status = 'active';
        newVendor.isInvited = false;
        await newVendor.save();
      }
    } else if (invitation.role === "project-manager") {
      let existingManager = await serverContext.Manager.findOne({ email: userEmail });

      if (existingManager) {
        if (!existingManager.password) {
          existingManager.password = hashedPassword;
          existingManager.name = name;
        }
        if (invitation.projectId) {
          const alreadyAssigned = existingManager.assignedProjects?.some(
            p => p.projectId.toString() === invitation.projectId.toString()
          );
          if (!alreadyAssigned) {
            existingManager.assignedProjects.push({ projectId: invitation.projectId });
          }
        }
        await existingManager.save();
      } else {
        const newManager = new serverContext.Manager({
          name,
          email: userEmail,
          password: hashedPassword,
          assignedProjects: invitation.projectId ? [{ projectId: invitation.projectId }] : []
        });
        await newManager.save();
      }
    } else {
      console.log("Invalid role:", invitation.role);
      return res.status(400).json({ success: false, message: "Invalid role specified." });
    }

    // Remove invitation
    await serverContext.Invitation.deleteOne({ token });

    console.log("Account activated successfully:", { role: invitation.role });
    res.status(200).json({ success: true, message: "Account activated successfully.", role: invitation.role });
  } catch (error) {
    console.error("Error in /api/invite/accept:", error);
    res.status(500).json({ success: false, message: "Failed to activate account." });
  }
});
}

return {
  get_api_managers,
  authenticateManagerProfile,
  get_api_manager_profile,
  put_api_manager_profile,
  put_api_manager_password,
  get_api_managers_id,
  post_api_signup,
  post_api_signin,
  post_api_password_reset_request,
  post_api_password_reset,
  post_api_manager_signup,
  post_api_manager_signin,
  post_api_manager_reset_password,
  post_api_invite,
  get_sign_inpage_html,
  post_api_invite_accept
};
};

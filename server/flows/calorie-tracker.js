// calorie tracker flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {

// ===================== CALORIE TRACKER API =====================

// JWT auth middleware for calorie tracker
function authCalorie(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'Not authenticated' });
  try {
    const decoded = serverContext.jwt.verify(header.split(' ')[1], serverContext.JWT_SECRET);
    req.calorieUserId = decoded.calorieUserId;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function post_api_calorie_register() {
// Register
serverContext.app.post('/api/calorie/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const exists = await serverContext.CalorieUser.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: 'Email already registered' });
    const user = await serverContext.CalorieUser.create({ email: email.toLowerCase().trim(), password, name: name || '' });
    const token = serverContext.jwt.sign({ calorieUserId: user._id }, serverContext.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    console.error('Calorie register error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_calorie_login() {
// Login
serverContext.app.post('/api/calorie/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await serverContext.CalorieUser.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const valid = await serverContext.bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
    const token = serverContext.jwt.sign({ calorieUserId: user._id }, serverContext.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    console.error('Calorie login error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function get_api_calorie_me() {
// Get profile (token check + load all user data)
serverContext.app.get('/api/calorie/me', serverContext.authCalorie, async (req, res) => {
  try {
    const user = await serverContext.CalorieUser.findById(req.calorieUserId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});
}

function put_api_calorie_data() {
// Save tracker data (full sync)
serverContext.app.put('/api/calorie/data', serverContext.authCalorie, async (req, res) => {
  try {
    const { trackerData, calorieGoal, proteinGoal, carbGoal, fatGoal, quickFoods, planData } = req.body;
    const update = {};
    if (trackerData !== undefined) update.trackerData = trackerData;
    if (calorieGoal !== undefined) update.calorieGoal = calorieGoal;
    if (proteinGoal !== undefined) update.proteinGoal = proteinGoal;
    if (carbGoal !== undefined) update.carbGoal = carbGoal;
    if (fatGoal !== undefined) update.fatGoal = fatGoal;
    if (quickFoods !== undefined) update.quickFoods = quickFoods;
    if (planData !== undefined) update.planData = planData;
    if (req.body.savedMeals !== undefined) update.savedMeals = req.body.savedMeals;
    const user = await serverContext.CalorieUser.findByIdAndUpdate(req.calorieUserId, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true });
  } catch (e) {
    console.error('Calorie data save error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});
}

function post_api_calorie_identify_food() {
// ── Calorie Tracker: Identify food from photo via Google Vision ──
serverContext.app.post('/api/calorie/identify-food', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      console.log('identify-food: No image in request body, body keys:', Object.keys(req.body));
      return res.status(400).json({ message: 'No image provided' });
    }

    console.log('identify-food: Received image, length:', image.length);

    // Strip data URI prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log('identify-food: Image buffer size:', imageBuffer.length, 'bytes');

    // Run label detection and object localization in parallel
    const [[labelResult], [objectResult]] = await Promise.all([
      serverContext.visionClient.labelDetection({ image: { content: imageBuffer } }),
      serverContext.visionClient.objectLocalization({ image: { content: imageBuffer } })
    ]);

    const labels = (labelResult.labelAnnotations || []).map(l => ({
      name: l.description.toLowerCase(),
      score: l.score
    }));
    const objects = (objectResult.localizedObjectAnnotations || []).map(o => ({
      name: o.name.toLowerCase(),
      score: o.score
    }));

    console.log('identify-food: Labels:', labels.map(l => l.name + '(' + Math.round(l.score*100) + ')').join(', '));
    console.log('identify-food: Objects:', objects.map(o => o.name + '(' + Math.round(o.score*100) + ')').join(', '));

    // Non-food labels to skip
    const skipWords = new Set([
      'tableware','table','plate','bowl','cup','fork','knife','spoon','chopsticks',
      'serveware','dishware','drinkware','cutlery','kitchen utensil','platter',
      'wood','hand','finger','person','human','room','indoor','outdoor',
      'furniture','photograph','font','rectangle','circle','pattern','textile',
      'plastic','metal','material','still life photography','close-up','macro photography',
      'food','dish','meal','cuisine','recipe','ingredient','produce','comfort food',
      'natural foods','superfood','whole food','staple food','fast food','junk food',
      'side dish','garnish','condiment','snack','appetizer','dessert','breakfast',
      'lunch','dinner','cooking','baking','animal source foods',
      'plant','leaf','flower','grass','landscape','sky','water','liquid','container'
    ]);

    const allItems = [...objects, ...labels];
    const seen = new Set();
    const identified = [];

    for (const item of allItems) {
      const name = item.name;
      if (seen.has(name)) continue;
      seen.add(name);
      if (skipWords.has(name)) continue;

      // Require 65% confidence minimum
      if (item.score >= 0.65) {
        identified.push({ name, confidence: Math.round(item.score * 100) });
      }
    }

    // Sort by confidence
    identified.sort((a, b) => b.confidence - a.confidence);

    console.log('identify-food: Returning', identified.length, 'items:', identified.map(i => i.name).join(', '));
    res.json({ items: identified.slice(0, 8) });
  } catch (e) {
    console.error('Food identification error:', e);
    res.status(500).json({ message: 'Failed to identify food', error: e.message });
  }
});
}

return {
  authCalorie,
  post_api_calorie_register,
  post_api_calorie_login,
  get_api_calorie_me,
  put_api_calorie_data,
  post_api_calorie_identify_food
};
};

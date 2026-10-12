// catalog flow. Shared dependencies remain live through serverContext.
// Route registration is invoked by server.js in its original order.
module.exports = function createFlow(serverContext) {



function delete_api_selection_boards() {
// [SECTION] Products, selections, and catalog tools

// ──────────────────────────────────────────────
// Products API Endpoints
// ──────────────────────────────────────────────


// DELETE /api/selection-boards?projectId=...&room=...
serverContext.app.delete("/api/selection-boards", async (req, res) => {
  const { projectId, room } = req.query;

  if (!projectId || !room) {
    return res.status(400).json({ message: "Missing projectId or room" });
  }

  try {
    const normalizedRoom = room.trim().toLowerCase();

    // Log all rooms for debug
    const boards = await serverContext.SelectionBoard.find({ projectId });
    console.log("📋 Rooms in DB:", boards.map(b => `"${b.room}"`));

    const deleted = await serverContext.SelectionBoard.findOneAndDelete({
      projectId,
      room: { $regex: new RegExp('^' + normalizedRoom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
    });

    if (!deleted) {
      return res.status(404).json({ message: `No board found for room "${normalizedRoom}" in this project.` });
    }

    res.json({ message: `Room "${normalizedRoom}" deleted successfully.` });
  } catch (err) {
    console.error("❌ Error deleting room:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
}

function patch_api_selection_boards() {
serverContext.app.patch('/api/selection-boards',async(req,res)=>{
 const {projectId,room,newRoom}=req.body||{};if(!projectId||typeof room!=='string'||typeof newRoom!=='string'||!newRoom.trim()||newRoom.trim().length>80)return res.status(400).json({error:'Enter a valid room name.'});
 try{const key=v=>String(v).trim().toLowerCase().replace(/[-\s]+/g,' ');const boards=await serverContext.SelectionBoard.find({projectId});const current=boards.find(b=>key(b.room)===key(room));if(boards.some(b=>key(b.room)===key(newRoom)&&b!==current))return res.status(409).json({error:'Room already exists.'});
 if(current){current.room=newRoom.trim();await current.save();res.json({board:current});}else{const board=new serverContext.SelectionBoard({projectId,room:newRoom.trim(),selections:[]});await board.save();res.json({board});}
 }catch(error){res.status(500).json({error:'Could not rename room.'});}
});
}
function get_api_products() {
// GET /api/products - Return all products
serverContext.app.get('/api/products', async (req, res) => {
  try {
    const products = await serverContext.Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
}

function post_api_products() {
// POST /api/products - Add a new product
serverContext.app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, link, photo } = req.body;
    if (!name || !description || !price || !link) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const newProduct = new serverContext.Product({ name, description, price, link, photo });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
}

function post_api_selection_board() {
// Endpoint to create or update a selection board
serverContext.app.post('/api/selection-board', async (req, res) => {
  try {
    const { projectId, room, selections } = req.body;
    if (!projectId || !room || !selections || !Array.isArray(selections)) {
      return res.status(400).json({ message: "projectId, room, and selections (as an array) are required." });
    }
    
    // Ensure each selection object has a photo property.
    const sanitizedSelections = selections.map(s => ({
      name: s.name,
      description: s.description,
      price: s.price,
      link: s.link,
      photo: s.photo || ""
    }));
    
    // Check if a selection board already exists for this project and room.
    let board = await serverContext.SelectionBoard.findOne({ projectId, room });
    if (board) {
      board.selections = sanitizedSelections;
      // If you're using Mongoose timestamps, updatedAt is handled automatically.
      await board.save();
      return res.status(200).json({  board });
    } else {
      board = new serverContext.SelectionBoard({ projectId, room, selections: sanitizedSelections });
      await board.save();
      return res.status(201).json({ message: "Selection board created successfully", board });
    }
  } catch (error) {
    console.error("Error saving selection board:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
}

function get_api_selection_boards() {
// GET /api/selection-boards?projectId=...
serverContext.app.get('/api/selection-boards', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const boards = await serverContext.SelectionBoard.find({ projectId });
    // Instead of a 404, return an empty array if none found:
    res.status(200).json(boards);
  } catch (error) {
    console.error("Error fetching selection boards:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
}

function get_api_product_details() {
serverContext.app.get('/api/product-details', async(req,res)=>{
 try { require('../product-import').validUrl(req.query.url); } catch {return res.status(400).json({error:'Use a public http or https product URL.'});}
 try {res.json(await require('../product-import').importProduct(req.query.url,serverContext.fetch));}
 catch(error){res.status(502).json({error:error.message});}
});
}
function post_api_product_image() {
 const upload=require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}).single('image');
 serverContext.app.post('/api/product-image',(req,res)=>upload(req,res,async error=>{
  if(error)return res.status(400).json({error:'Choose one image under 5 MB.'});
  try {if(!req.file)throw Error('Choose an image.');res.json({url:await require('../product-import').storeImage(req.file.buffer)});}
  catch(e){res.status(400).json({error:e.message});}
 }));
}

function delete_api_products_id() {
// DELETE /api/products/:id – Delete a product by ID.
serverContext.app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const deletedProduct = await serverContext.Product.findByIdAndDelete(productId);
    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({ message: "Product deleted successfully", product: deletedProduct });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
}

function get_api_room_packages() {
// Get all room packages
serverContext.app.get('/api/room-packages', async (req, res) => {
  try {
    const packages = await serverContext.RoomPackage.find();
    res.json(packages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room packages' });
  }
});
}

function get_api_room_packages_key() {
// Get a single room package by key
serverContext.app.get('/api/room-packages/:key', async (req, res) => {
  try {
    const pkg = await serverContext.RoomPackage.findOne({ key: req.params.key });
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    res.json(pkg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room package' });
  }
});
}

function put_api_room_packages_key() {
// Update or create a room package
serverContext.app.put('/api/room-packages/:key', async (req, res) => {
  try {
    const { name, items } = req.body;
    const pkg = await serverContext.RoomPackage.findOneAndUpdate(
      { key: req.params.key },
      { name, items },
      { upsert: true, new: true }
    );
    res.json(pkg);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save room package' });
  }
});
}

return {
  delete_api_selection_boards,
  patch_api_selection_boards,
  get_api_products,
  post_api_products,
  post_api_selection_board,
  get_api_selection_boards,
  get_api_product_details,
  post_api_product_image,
  delete_api_products_id,
  get_api_room_packages,
  get_api_room_packages_key,
  put_api_room_packages_key
};
};

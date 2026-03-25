// server.js – StorePulse PRO MAX SaaS SEGURO 🔐

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

// ------------------ MODELOS ------------------
const User = require("./models/User");
const Store = require("./models/Store");
const Checkin = require("./models/Checkin");
const Agency = require("./models/Agency");

const app = express();

// ------------------ MIDDLEWARE ------------------
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","userId"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ------------------ PORT ------------------
const PORT = process.env.PORT || 3000;

// ------------------ HTML ------------------
["login","register","recover","reset","admin","app"].forEach(page=>{
  app.get(`/${page}.html`, (req,res)=>{
    res.sendFile(path.join(__dirname,"public",`${page}.html`));
  });
});
app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","login.html"));
});

// ------------------ DB ------------------
mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("✅ MongoDB conectado"))
.catch(err=>{
  console.error("❌ Error Mongo:", err.message);
  process.exit(1);
});

// =====================================================
// 🔐 MIDDLEWARE SEGURIDAD
// =====================================================
async function auth(req,res,next){
  try{
    const userId = req.headers.userid;
    if(!userId) return res.status(401).json({error:"No autorizado"});
    const user = await User.findById(userId);
    if(!user) return res.status(401).json({error:"Usuario inválido"});
    req.user = user;
    next();
  }catch{
    res.status(500).json({error:"Error auth"});
  }
}

function onlyAdmin(req,res,next){
  if(req.user.role !== "admin" && req.user.role !== "superadmin") return res.status(403).json({error:"Acceso denegado"});
  next();
}

function onlySuper(req,res,next){
  if(req.user.role !== "superadmin") return res.status(403).json({error:"Solo superadmin"});
  next();
}

// =====================================================
// 🏢 AGENCIAS
// =====================================================
app.post("/agencies", auth, onlySuper, async (req,res)=>{
  try{
    const agency = new Agency({ name:req.body.name });
    await agency.save();
    res.json(agency);
  }catch{
    res.status(500).json({error:"Error creando agencia"});
  }
});

app.get("/agencies", auth, async (req,res)=>{
  const agencies = await Agency.find();
  res.json(agencies);
});

// =====================================================
// 👤 USUARIOS
// =====================================================

// REGISTER (libre)
app.post("/register", async (req,res)=>{
  try{
    let { name,email,password } = req.body;
    email = email.trim().toLowerCase();
    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({error:"Email ya registrado"});
    const user = new User({ name, email, password, role:"promotor", agencyId:null });
    await user.save();
    res.json({message:"Usuario registrado"});
  }catch{
    res.status(500).json({error:"Error registro"});
  }
});

// LOGIN
app.post("/login", async (req,res)=>{
  try{
    const { email,password } = req.body;
    const user = await User.findOne({ email: email.trim().toLowerCase(), password: password.trim() });
    if(!user) return res.status(404).json({message:"Usuario no encontrado"});
    res.json({ userId:user._id, role:user.role, agencyId:user.agencyId });
  }catch{
    res.status(500).json({error:"Error login"});
  }
});

// GET USERS - general
app.get("/users", auth, async (req, res) => {
  try {
    if(req.user.role === "superadmin"){
      const users = await User.find().populate("agencyId");
      return res.json(users);
    }
    const users = await User.find({ agencyId: req.user.agencyId }).populate("agencyId");
    res.json(users);
  } catch {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// GET USERS by agency (solo superadmin)
app.get("/users/agency/:agencyId", auth, onlySuper, async (req,res)=>{
  try{
    const { agencyId } = req.params;
    const users = await User.find({ agencyId }).populate("agencyId");
    res.json(users);
  }catch{
    res.status(500).json({error:"Error al obtener usuarios por agencia"});
  }
});

// CREAR USUARIO
app.post("/admin/create-user", auth, onlyAdmin, async (req,res)=>{
  try{
    let { name,email,password,role,agencyId } = req.body;
    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({error:"Email ya existe"});
    if(req.user.role === "admin") agencyId = req.user.agencyId;
    const user = new User({
      name,
      email,
      password,
      role,
      agencyId: (role==="admin"||role==="superadmin") ? null : agencyId
    });
    await user.save();
    res.json({message:"Usuario creado"});
  }catch{
    res.status(500).json({error:"Error creando usuario"});
  }
});

// CAMBIAR ROL
app.put("/users/:id/role", auth, onlyAdmin, async (req,res)=>{
  try{
    const userToEdit = await User.findById(req.params.id);
    if(req.user.role !== "superadmin" && userToEdit.agencyId?.toString() !== req.user.agencyId?.toString()){
      return res.status(403).json({error:"No permitido"});
    }
    await User.findByIdAndUpdate(req.params.id,{ role:req.body.role });
    res.json({message:"Rol actualizado"});
  }catch{
    res.status(500).json({error:"Error actualizando rol"});
  }
});

// CAMBIAR AGENCIA (SOLO SUPERADMIN)
app.put("/users/:id/agency", auth, onlySuper, async (req,res)=>{
  try{
    await User.findByIdAndUpdate(req.params.id,{ agencyId:req.body.agencyId || null });
    res.json({message:"Agencia actualizada"});
  }catch{
    res.status(500).json({error:"Error actualizando agencia"});
  }
});

// DELETE USER
app.delete("/users/:id", auth, onlyAdmin, async (req,res)=>{
  try{
    const userToDelete = await User.findById(req.params.id);
    if(req.user.role !== "superadmin" && userToDelete.agencyId?.toString() !== req.user.agencyId?.toString()){
      return res.status(403).json({error:"No permitido"});
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({message:"Usuario eliminado"});
  }catch{
    res.status(500).json({error:"Error eliminando usuario"});
  }
});

// =====================================================
// 🏪 STORES
// =====================================================
app.get("/stores", auth, async (req,res)=>{
  const stores = await Store.find().populate("agencyId");
  res.json(stores);
});

app.post("/stores", auth, onlyAdmin, async (req,res)=>{
  const { name, address, lat, lng, agencyId } = req.body;
  const store = new Store({ name, address, lat, lng, agencyId: agencyId || null });
  await store.save();
  res.json(store);
});

// =====================================================
// 📍 CHECKIN
// =====================================================
const storage = multer.diskStorage({
  destination:(req,file,cb)=> cb(null,"uploads/"),
  filename:(req,file,cb)=> cb(null,Date.now()+"-"+file.originalname)
});
const upload = multer({ storage });

app.post("/checkin", upload.single("photo"), async (req,res)=>{
  try{
    const { userId, lat, lng } = req.body;
    const user = await User.findById(userId);
    if(!user) return res.status(404).json({error:"Usuario no existe"});
    await Checkin.create({
      userId,
      agencyId: user.agencyId,
      lat,
      lng,
      photo: req.file?.filename,
      date: new Date()
    });
    res.json({message:"Check-in OK"});
  }catch{
    res.status(500).json({error:"Error al crear check-in"});
  }
});

// ------------------ 404 ------------------
app.use((req,res)=>{
  res.status(404).json({error:"Ruta no encontrada"});
});

// ------------------ START ------------------
app.listen(PORT,"0.0.0.0", ()=>{
  console.log(`🚀 Servidor en puerto ${PORT}`);
  console.log("🔐 STOREPULSE SAAS SEGURO ACTIVO");
});
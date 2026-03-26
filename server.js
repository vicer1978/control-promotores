// server.js – StorePulse PRO MAX SAAS 🔐 FINAL

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

// MODELOS
const User = require("./models/User");
const Store = require("./models/Store");
const Agency = require("./models/Agency");
const Checkin = require("./models/Checkin");
const Report = require("./models/Report");

const app = express();

// =====================================================
// 🔹 MIDDLEWARE
// =====================================================

app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","userId"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =====================================================
// 🔹 CONEXIÓN MONGO
// =====================================================

mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("✅ MongoDB conectado"))
.catch(err=>{
  console.error("❌ Error Mongo:", err.message);
  process.exit(1);
});

// =====================================================
// 🔹 AUTH
// =====================================================

async function auth(req,res,next){
  try{
    const userId = req.headers.userid;
    if(!userId) return res.status(401).json({error:"No autorizado"});

    const user = await User.findById(userId);
    if(!user) return res.status(401).json({error:"Usuario inválido"});

    req.user = user;
    next();

  }catch(err){
    console.error("Error auth:", err);
    res.status(500).json({error:"Error auth"});
  }
}

function onlyAdmin(req,res,next){
  if(req.user.role !== "admin" && req.user.role !== "superadmin")
    return res.status(403).json({error:"Acceso denegado"});
  next();
}

function onlySuper(req,res,next){
  if(req.user.role !== "superadmin")
    return res.status(403).json({error:"Solo superadmin"});
  next();
}

// =====================================================
// 🔹 AGENCIAS
// =====================================================

app.get("/agencies", auth, async (req,res)=>{
  const agencies = await Agency.find();
  res.json(agencies);
});

app.post("/agencies", auth, onlySuper, async (req,res)=>{
  const agency = new Agency({ name:req.body.name });
  await agency.save();
  res.json(agency);
});

// =====================================================
// 🔹 USUARIOS
// =====================================================

// REGISTER
app.post("/register", async (req,res)=>{
  try{
    let { name,email,password } = req.body;

    email = email.trim().toLowerCase();

    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({error:"Email ya registrado"});

    const user = new User({
      name,
      email,
      password,
      role:"promotor"
    });

    await user.save();

    res.json({message:"Usuario registrado"});

  }catch(err){
    console.error("Error registro:", err);
    res.status(500).json({error:"Error registro"});
  }
});

// LOGIN
app.post("/login", async (req,res)=>{
  try{
    const { email,password } = req.body;

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      password: password.trim()
    });

    if(!user) return res.status(404).json({message:"Usuario no encontrado"});

    res.json({
      userId:user._id,
      role:user.role,
      agencyId:user.agencyId,
      name:user.name
    });

  }catch(err){
    console.error("Error login:", err);
    res.status(500).json({error:"Error login"});
  }
});

// TODOS LOS USUARIOS
app.get("/users", auth, async (req,res)=>{
  let users;

  if(req.user.role==="superadmin"){
    users = await User.find().populate("agencyId").populate("stores");
  } else {
    users = await User.find({ agencyId: req.user.agencyId })
      .populate("agencyId")
      .populate("stores");
  }

  res.json(users);
});

// USUARIO POR ID
app.get("/users/:id", auth, async (req,res)=>{
  const user = await User.findById(req.params.id).populate("stores");
  res.json(user);
});

// 🔥 CAMBIAR ROL
app.put("/users/:id/role", auth, async (req,res)=>{
  try{
    const { role } = req.body;

    const user = await User.findById(req.params.id);
    if(!user) return res.status(404).json({error:"Usuario no existe"});

    if(req.user.role !== "superadmin" &&
       user.agencyId?.toString() !== req.user.agencyId?.toString()){
      return res.status(403).json({error:"No autorizado"});
    }

    user.role = role;
    await user.save();

    res.json({message:"Rol actualizado"});

  }catch(err){
    console.error("Error cambiando rol:", err);
    res.status(500).json({error:"Error cambiando rol"});
  }
});

// 🔥 CAMBIAR AGENCIA
app.put("/users/:id/agency", auth, onlySuper, async (req,res)=>{
  try{
    const { agencyId } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { agencyId },
      { new:true }
    );

    res.json(user);

  }catch(err){
    console.error("Error cambiando agencia:", err);
    res.status(500).json({error:"Error cambiando agencia"});
  }
});

// 🔥 ELIMINAR USUARIO
app.delete("/users/:id", auth, async (req,res)=>{
  try{
    const user = await User.findById(req.params.id);
    if(!user) return res.status(404).json({error:"Usuario no existe"});

    if(req.user.role !== "superadmin" &&
       user.agencyId?.toString() !== req.user.agencyId?.toString()){
      return res.status(403).json({error:"No autorizado"});
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({message:"Usuario eliminado"});

  }catch(err){
    console.error("Error eliminando usuario:", err);
    res.status(500).json({error:"Error eliminando usuario"});
  }
});

// 🔥 TIENDAS DEL USUARIO
app.get("/users/:id/stores", auth, async (req,res)=>{
  try{
    const user = await User.findById(req.params.id).populate("stores");

    if(!user) return res.status(404).json({error:"Usuario no encontrado"});

    if(req.user.role !== "superadmin" &&
       user.agencyId?.toString() !== req.user.agencyId?.toString()){
      return res.status(403).json({error:"No autorizado"});
    }

    res.json(user.stores || []);

  }catch(err){
    console.error("Error obteniendo tiendas:", err);
    res.status(500).json({error:"Error obteniendo tiendas"});
  }
});

// 🔥 ACTUALIZAR TIENDAS (DRAG & DROP)
app.put("/users/:id/stores", auth, async (req,res)=>{
  try{
    const { stores } = req.body;

    const user = await User.findById(req.params.id);
    if(!user) return res.status(404).json({error:"Usuario no existe"});

    if(req.user.role !== "superadmin" &&
       user.agencyId?.toString() !== req.user.agencyId?.toString()){
      return res.status(403).json({error:"No autorizado"});
    }

    user.stores = stores;
    await user.save();

    res.json({message:"Tiendas actualizadas"});

  }catch(err){
    console.error("Error actualizando tiendas:", err);
    res.status(500).json({error:"Error actualizando tiendas"});
  }
});

// =====================================================
// 🔹 TIENDAS
// =====================================================

app.get("/stores", auth, async (req,res)=>{
  const stores = await Store.find().populate("agencyId");
  res.json(stores);
});

app.get("/stores/agency/:agencyId", auth, async (req,res)=>{
  const stores = await Store.find({ agencyId:req.params.agencyId });
  res.json(stores);
});

app.get("/stores/:id", auth, async (req,res)=>{
  const store = await Store.findById(req.params.id);
  if(!store) return res.status(404).json({error:"Tienda no encontrada"});
  res.json(store);
});

app.post("/stores", auth, onlyAdmin, async (req,res)=>{
  const { name,address,lat,lng,agencyId } = req.body;

  const store = new Store({
    name,
    address,
    lat,
    lng,
    agencyId: agencyId || req.user.agencyId
  });

  await store.save();
  res.json(store);
});

// =====================================================
// 🔹 CHECKIN
// =====================================================

const storage = multer.diskStorage({
  destination:(req,file,cb)=> cb(null,"uploads/"),
  filename:(req,file,cb)=> cb(null,Date.now()+"-"+file.originalname)
});

const upload = multer({ storage });

function calcularDistancia(lat1,lon1,lat2,lon2){
  const R = 6371;
  const dLat = (lat2-lat1)*(Math.PI/180);
  const dLon = (lon2-lon1)*(Math.PI/180);

  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*(Math.PI/180)) *
    Math.cos(lat2*(Math.PI/180)) *
    Math.sin(dLon/2)**2;

  return R * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a)) * 1000;
}

app.post("/checkin", upload.single("photo"), async (req,res)=>{
  try{
    const { userId, storeId, lat, lng } = req.body;

    const user = await User.findById(userId);
    const store = await Store.findById(storeId);

    if(!user || !store) return res.status(404).json({error:"Datos inválidos"});

    const distancia = calcularDistancia(lat,lng,store.lat,store.lng);

    if(distancia > 120){
      return res.status(400).json({error:"Fuera de rango", distancia});
    }

    await Checkin.create({
      userId,
      storeId,
      agencyId:user.agencyId,
      lat,
      lng,
      photo:req.file?.filename,
      date:new Date()
    });

    res.json({message:"Check-in válido"});

  }catch(err){
    res.status(500).json({error:"Error checkin"});
  }
});

// =====================================================
// 🔹 REPORTES
// =====================================================

app.post("/reports", auth, async (req,res)=>{
  try{
    const { userId, storeId, type, data } = req.body;

    const user = await User.findById(userId);

    const report = new Report({
      userId,
      storeId,
      agencyId:user.agencyId,
      role:user.role,
      type,
      data,
      date:new Date()
    });

    await report.save();

    res.json({message:"Reporte guardado"});

  }catch(err){
    res.status(500).json({error:"Error"});
  }
});

app.get("/reports/:agencyId", auth, async (req,res)=>{
  const reports = await Report.find({ agencyId:req.params.agencyId })
    .populate("userId")
    .populate("storeId")
    .sort({ date:-1 });

  res.json(reports);
});

// =====================================================

app.use((req,res)=>{
  res.status(404).json({error:"Ruta no encontrada"});
});

const PORT = process.env.PORT || 3000;

app.listen(PORT,"0.0.0.0", ()=>{
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
// server.js – StorePulse PRO MAX FINAL

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
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
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ------------------ PORT ------------------
const PORT = process.env.PORT || 3000;

// ------------------ RUTAS HTML ------------------
app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","login.html"));
});

["login","register","recover","reset","admin","app"].forEach(page=>{
  app.get(`/${page}.html`, (req,res)=>{
    res.sendFile(path.join(__dirname,"public",`${page}.html`));
  });
});

// ------------------ MONGODB ------------------
mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("✅ MongoDB conectado"))
.catch(err=>{
  console.error("❌ Error Mongo:", err.message);
  process.exit(1);
});

// ------------------ MULTER ------------------
const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null,"uploads/"),
  filename: (req,file,cb)=> cb(null, Date.now()+"-"+file.originalname)
});
const upload = multer({ storage });

// ------------------ EMAIL ------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ------------------ AGENCIAS ------------------
app.post("/agencies", async (req,res)=>{
  try{
    const { name } = req.body;
    if(!name) return res.status(400).json({error:"Nombre requerido"});

    const agency = new Agency({ name });
    await agency.save();

    res.json(agency);

  }catch{
    res.status(500).json({error:"Error creando agencia"});
  }
});

app.get("/agencies", async (req,res)=>{
  const agencies = await Agency.find().sort({createdAt:-1});
  res.json(agencies);
});

// ------------------ USUARIOS ------------------

// 🔹 REGISTRO SIMPLE
app.post("/register", async (req,res)=>{
  try{
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({error:"Email ya registrado"});

    const user = new User({
      name,
      email,
      password,
      role:"user"
    });

    await user.save();
    res.json({message:"Usuario registrado"});

  }catch{
    res.status(500).json({error:"Error registro"});
  }
});

// 🔹 LOGIN FIX REAL
app.post("/login", async (req,res)=>{
  try{
    const { email, password } = req.body;

    const user = await User.findOne({
      email: email.trim(),
      password: password.trim()
    });

    if(!user) return res.status(404).json({message:"Usuario no encontrado"});

    res.json({
      userId: user._id,
      role: user.role,
      agencyId: user.agencyId
    });

  }catch{
    res.status(500).json({error:"Error login"});
  }
});

// 🔹 TODOS LOS USUARIOS (ADMIN)
app.get("/users", async (req,res)=>{
  const users = await User.find().populate("agencyId");
  res.json(users);
});

// 🔹 USUARIOS POR AGENCIA
app.get("/users/:agencyId", async (req,res)=>{
  const users = await User.find({ agencyId:req.params.agencyId });
  res.json(users);
});

// 🔹 CREAR USUARIO DESDE ADMIN
app.post("/admin/create-user", async (req,res)=>{
  try{

    const { name,email,password,role,agencyId } = req.body;

    const exists = await User.findOne({ email });
    if(exists) return res.status(400).json({error:"Email ya existe"});

    const user = new User({
      name,
      email,
      password,
      role,
      agencyId
    });

    await user.save();
    res.json({message:"Usuario creado"});

  }catch{
    res.status(500).json({error:"Error creando usuario"});
  }
});

// 🔹 CAMBIAR ROL
app.put("/users/:id/role", async (req,res)=>{
  try{
    const { role } = req.body;

    await User.findByIdAndUpdate(req.params.id,{ role });

    res.json({message:"Rol actualizado"});

  }catch{
    res.status(500).json({error:"Error rol"});
  }
});

// 🔹 ELIMINAR USUARIO
app.delete("/users/:id", async (req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({message:"Usuario eliminado"});
});

// ------------------ RECUPERACIÓN PASSWORD ------------------

// 🔹 SOLICITAR RECUPERACIÓN
app.post("/recover", async (req,res)=>{
  try{
    const { email } = req.body;

    const user = await User.findOne({ email });
    if(!user) return res.json({message:"Si existe el correo, recibirás instrucciones"});

    const token = crypto.randomBytes(32).toString("hex");

    user.resetToken = token;
    user.resetTokenExpire = Date.now() + 3600000;
    await user.save();

    const link = `https://storepulse.onrender.com/reset.html?token=${token}`;

    await transporter.sendMail({
      to: email,
      subject: "Recuperar contraseña",
      html: `
        <h3>Recuperación de contraseña</h3>
        <p>Haz clic en el siguiente enlace:</p>
        <a href="${link}">${link}</a>
      `
    });

    res.json({message:"Correo enviado"});

  }catch(err){
    console.error(err);
    res.status(500).json({error:"Error recuperación"});
  }
});

// 🔹 RESET PASSWORD
app.post("/reset", async (req,res)=>{
  try{
    const { token,password } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() }
    });

    if(!user) return res.status(400).json({error:"Token inválido"});

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;

    await user.save();

    res.json({message:"Contraseña actualizada"});

  }catch{
    res.status(500).json({error:"Error reset"});
  }
});

// ------------------ STORES ------------------
app.post("/stores", async (req,res)=>{
  const { name,address,lat,lng,agencyId } = req.body;

  const store = new Store({ name,address,lat,lng,agencyId });
  await store.save();

  res.json({message:"Tienda creada"});
});

app.get("/stores/:agencyId", async (req,res)=>{
  const stores = await Store.find({ agencyId:req.params.agencyId });
  res.json(stores);
});

// ------------------ CHECKIN ------------------
app.post("/checkin", upload.single("photo"), async (req,res)=>{
  try{

    const { lat,lng,userId } = req.body;

    const user = await User.findById(userId);
    if(!user) return res.status(404).json({message:"Usuario no existe"});

    await User.findByIdAndUpdate(userId,{
      lastLocation:{ lat,lng,date:new Date() }
    });

    await Checkin.create({
      userId,
      agencyId:user.agencyId,
      lat,lng,
      photo:req.file?.filename,
      date:new Date()
    });

    res.json({message:"Check-in OK"});

  }catch{
    res.status(500).json({error:"Error check-in"});
  }
});

// ------------------ 404 ------------------
app.use((req,res)=>{
  res.status(404).json({error:"Ruta no encontrada"});
});

// ------------------ START ------------------
app.listen(PORT,"0.0.0.0", ()=>{
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log("🔥 STOREPULSE PRO MAX ACTIVO");
});
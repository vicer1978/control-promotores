// server.js – StorePulse PRO FINAL + recuperación

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

// ------------------ HOME ------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ------------------ MONGODB ------------------
if (!process.env.MONGO_URI) {
  console.error("❌ Falta MONGO_URI");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("❌ Error Mongo:", err.message);
    process.exit(1);
  });

// ------------------ EMAIL CONFIG ------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ------------------ MULTER ------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ================== RUTAS ==================

// 🏢 AGENCIAS
app.post("/agencies", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Nombre requerido" });

    const agency = new Agency({ name });
    await agency.save();

    res.json(agency);
  } catch (err) {
    res.status(500).json({ error: "Error creando agencia" });
  }
});

app.get("/agencies", async (req, res) => {
  const agencies = await Agency.find().sort({ createdAt: -1 });
  res.json(agencies);
});

app.delete("/agencies/:id", async (req, res) => {
  await Agency.findByIdAndDelete(req.params.id);
  res.json({ message: "Agencia eliminada" });
});

// 👤 REGISTER
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, agencyId } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email ya registrado" });

    const user = new User({
      name,
      email,
      password,
      agencyId,
      role: "user"
    });

    await user.save();
    res.json({ message: "Usuario registrado" });

  } catch (err) {
    res.status(500).json({ error: "Error registro" });
  }
});

// 🔐 LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });

    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });

    res.json({
      userId: user._id,
      role: user.role,
      agencyId: user.agencyId
    });

  } catch (err) {
    res.status(500).json({ error: "Error login" });
  }
});

// 🔁 RECUPERAR PASSWORD
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "Si el correo existe, recibirás instrucciones" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    user.resetToken = token;
    user.resetTokenExpire = Date.now() + 1000 * 60 * 30;
    await user.save();

    const link = `https://storepulse.onrender.com/reset-password.html?token=${token}`;

    await transporter.sendMail({
      to: email,
      subject: "Recuperación de contraseña",
      html: `
        <h2>Recuperar contraseña</h2>
        <p>Da clic aquí:</p>
        <a href="${link}">${link}</a>
      `
    });

    res.json({ message: "Correo enviado" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error recuperación" });
  }
});

// 🔄 RESET PASSWORD
app.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() }
    });

    if (!user)
      return res.status(400).json({ message: "Token inválido o expirado" });

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;

    await user.save();

    res.json({ message: "Contraseña actualizada" });

  } catch (err) {
    res.status(500).json({ error: "Error reset password" });
  }
});

// 👥 USERS
app.get("/users/:agencyId", async (req, res) => {
  const users = await User.find({ agencyId: req.params.agencyId });
  res.json(users);
});

// 🏪 STORES
app.post("/stores", async (req, res) => {
  const { name, address, lat, lng, agencyId } = req.body;

  const store = new Store({ name, address, lat, lng, agencyId });
  await store.save();

  res.json({ message: "Tienda creada" });
});

app.get("/stores/:agencyId", async (req, res) => {
  const stores = await Store.find({ agencyId: req.params.agencyId });
  res.json(stores);
});

// 📍 CHECKIN
app.post("/checkin", upload.single("photo"), async (req, res) => {
  try {
    const { lat, lng, userId } = req.body;

    if (!req.file)
      return res.status(400).json({ message: "Debes tomar foto" });

    const user = await User.findById(userId);
    const stores = await Store.find({ agencyId: user.agencyId });

    let dentro = false;

    stores.forEach(store => {
      const dist = Math.sqrt(
        Math.pow(lat - store.lat, 2) +
        Math.pow(lng - store.lng, 2)
      );
      if (dist < 0.01) dentro = true;
    });

    if (!dentro)
      return res.json({ message: "Fuera de tienda" });

    await Checkin.create({
      userId,
      agencyId: user.agencyId,
      lat,
      lng,
      photo: req.file.filename,
      date: new Date()
    });

    res.json({ message: "Check-in OK" });

  } catch (err) {
    res.status(500).json({ error: "Error check-in" });
  }
});

// ------------------ 404 ------------------
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ------------------ START ------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
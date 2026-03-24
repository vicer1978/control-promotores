// server.js – StorePulse PRO listo para Render

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
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ------------------ PORT ------------------
const PORT = process.env.PORT || 3000;

// ------------------ RUTA TEST ------------------
app.get("/", (req, res) => {
  res.send("✅ Backend StorePulse funcionando");
});

// ------------------ CONEXIÓN MONGODB ------------------
if (!process.env.MONGO_URI) {
  console.error("❌ Falta MONGO_URI en variables de entorno");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("❌ Error conectando a MongoDB:", err.message);
    process.exit(1);
  });

// ------------------ MULTER ------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ------------------ RUTAS ------------------

// 🏢 AGENCIAS
app.post("/agencies", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Nombre requerido" });

    const agency = new Agency({ name });
    await agency.save();

    res.json(agency);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando agencia" });
  }
});

app.get("/agencies", async (req, res) => {
  try {
    const agencies = await Agency.find().sort({ createdAt: -1 });
    res.json(agencies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo agencias" });
  }
});

app.delete("/agencies/:id", async (req, res) => {
  try {
    await Agency.findByIdAndDelete(req.params.id);
    res.json({ message: "Agencia eliminada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error eliminando agencia" });
  }
});

// 👤 USUARIOS
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, agencyId } = req.body;

    if (!agencyId)
      return res.status(400).json({ error: "Selecciona una agencia" });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ error: "Email ya registrado" });

    const user = new User({
      name,
      email,
      password,
      role: "user",
      agencyId
    });

    await user.save();
    res.json({ message: "Usuario registrado" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error registro" });
  }
});

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
    console.error(err);
    res.status(500).json({ error: "Error login" });
  }
});

app.get("/users/:agencyId", async (req, res) => {
  try {
    const users = await User.find({ agencyId: req.params.agencyId });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo usuarios" });
  }
});

// 🏪 TIENDAS
app.post("/stores", async (req, res) => {
  try {
    const { name, address, lat, lng, agencyId } = req.body;

    if (!agencyId)
      return res.status(400).json({ error: "agencyId requerido" });

    const store = new Store({ name, address, lat, lng, agencyId });
    await store.save();

    res.json({ message: "Tienda creada" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando tienda" });
  }
});

app.get("/stores/:agencyId", async (req, res) => {
  try {
    const stores = await Store.find({ agencyId: req.params.agencyId });
    res.json(stores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo tiendas" });
  }
});

// 📍 CHECK-IN
app.post("/checkin", upload.single("photo"), async (req, res) => {
  try {
    const { lat, lng, userId } = req.body;

    if (!req.file)
      return res.status(400).json({ message: "Debes tomar foto" });

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ message: "Usuario no existe" });

    const stores = await Store.find({ agencyId: user.agencyId });

    let dentro = false;

    function getDistance(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    stores.forEach(store => {
      const dist = getDistance(lat, lng, store.lat, store.lng);
      if (dist < 0.1) dentro = true;
    });

    if (!dentro)
      return res.json({ message: "Fuera de tienda" });

    await User.findByIdAndUpdate(userId, {
      lastLocation: { lat, lng, date: new Date() }
    });

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
    console.error(err);
    res.status(500).json({ error: "Error check-in" });
  }
});

// ------------------ START ------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log("🔥 VERSION NUEVA DEPLOY ACTIVA");

app.get("/", (req, res) => {
  res.send("🔥 VERSION NUEVA FUNCIONANDO 123");
});
});
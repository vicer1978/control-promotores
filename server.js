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

// ------------------ TEST ------------------
app.get("/", (req, res) => {
  res.send("✅ StorePulse backend funcionando");
});

// ------------------ MONGODB ------------------
if (!process.env.MONGO_URI) {
  console.error("❌ Falta MONGO_URI");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("❌ Error MongoDB:", err.message);
    process.exit(1);
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
  const agency = new Agency({ name: req.body.name });
  await agency.save();
  res.json(agency);
});

app.get("/agencies", async (req, res) => {
  const agencies = await Agency.find();
  res.json(agencies);
});

// 👤 USUARIOS
app.post("/register", async (req, res) => {
  const { name, email, password, agencyId } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "Email ya registrado" });

  const user = new User({ name, email, password, role: "user", agencyId });
  await user.save();

  res.json({ message: "Usuario registrado" });
});

app.post("/login", async (req, res) => {
  const user = await User.findOne(req.body);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  res.json(user);
});

app.get("/users/:agencyId", async (req, res) => {
  const users = await User.find({ agencyId: req.params.agencyId });
  res.json(users);
});

// 🏪 STORES
app.post("/stores", async (req, res) => {
  const store = new Store(req.body);
  await store.save();
  res.json({ message: "Tienda creada" });
});

app.get("/stores/:agencyId", async (req, res) => {
  const stores = await Store.find({ agencyId: req.params.agencyId });
  res.json(stores);
});

// 📍 CHECKIN
app.post("/checkin", upload.single("photo"), async (req, res) => {

  const { lat, lng, userId } = req.body;

  const user = await User.findById(userId);
  const stores = await Store.find({ agencyId: user.agencyId });

  let dentro = false;

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  stores.forEach(store => {
    const dist = getDistance(lat, lng, store.lat, store.lng);
    if (dist < 0.1) dentro = true;
  });

  if (!dentro) return res.json({ message: "Fuera de tienda" });

  await Checkin.create({
    userId,
    agencyId: user.agencyId,
    lat,
    lng,
    photo: req.file.filename,
    date: new Date()
  });

  res.json({ message: "Check-in OK" });
});

// 📊 DASHBOARD
app.get("/dashboard/:agencyId", async (req, res) => {
  const agencyId = req.params.agencyId;

  const totalUsers = await User.countDocuments({ agencyId });
  const totalStores = await Store.countDocuments({ agencyId });
  const totalCheckins = await Checkin.countDocuments({ agencyId });

  const activeUsers = await User.countDocuments({
    agencyId,
    lastLocation: { $exists: true }
  });

  res.json({ totalUsers, totalStores, totalCheckins, activeUsers });
});

// 📋 HISTORIAL
app.get("/checkins/:agencyId", async (req, res) => {
  const data = await Checkin.find({ agencyId: req.params.agencyId })
    .populate("userId")
    .sort({ date: -1 });

  res.json(data);
});

// 🏆 RANKING
app.get("/stats/ranking/:agencyId", async (req, res) => {
  const ranking = await Checkin.aggregate([
    { $match: { agencyId: new mongoose.Types.ObjectId(req.params.agencyId) } },
    { $group: { _id: "$userId", total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "_id"
      }
    },
    { $unwind: "$_id" }
  ]);

  res.json(ranking);
});

// 📄 REPORT
app.get("/report/:agencyId", async (req, res) => {
  const { start, end } = req.query;

  const data = await Checkin.find({
    agencyId: req.params.agencyId,
    date: {
      $gte: new Date(start),
      $lte: new Date(end)
    }
  });

  res.json(data);
});

// ------------------ 404 ------------------
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ------------------ START ------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const User = require("./models/User");
const Store = require("./models/Store");
const Agency = require("./models/Agency");
const Report = require("./models/Report");
const Checkin = require("./models/Checkin");

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], allowedHeaders: ["Content-Type", "userId"] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB conectado"));

// Middleware de Auth
async function auth(req, res, next) {
    try {
        const userId = req.headers.userid;
        if (!userId) return res.status(401).json({ error: "No autorizado" });
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario inválido" });
        req.user = user;
        next();
    } catch (err) { res.status(500).json({ error: "Error auth" }); }
}

// =====================================================
// 🔹 RUTAS DE SUPER ADMIN (GESTIÓN GLOBAL)
// =====================================================

// Listar todas las agencias
app.get("/agencies", auth, async (req, res) => {
    const agencies = await Agency.find();
    res.json(agencies);
});

// Crear Agencia
app.post("/agencies", auth, async (req, res) => {
    const agency = new Agency(req.body);
    await agency.save();
    res.json(agency);
});

// Activar/Desactivar Agencia
app.patch("/agencies/:id", auth, async (req, res) => {
    const agency = await Agency.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(agency);
});

// 🔥 ELIMINACIÓN EN CASCADA
app.delete("/agencies/:id", auth, async (req, res) => {
    const agencyId = req.params.id;
    await Report.deleteMany({ agencyId });
    await User.deleteMany({ agencyId });
    await Store.deleteMany({ agencyId });
    await Checkin.deleteMany({ agencyId });
    await Agency.findByIdAndDelete(agencyId);
    res.json({ message: "Agencia y todos sus datos eliminados." });
});

// Listar todos los usuarios del sistema
app.get("/users", auth, async (req, res) => {
    const users = await User.find().populate("agencyId", "name");
    res.json(users);
});

// Conteo global
app.get("/users/count", auth, async (req, res) => {
    const count = await User.countDocuments();
    res.json({ count });
});

// Eliminar usuario
app.delete("/users/:id", auth, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuario eliminado" });
});

// =====================================================
// 🔹 RUTAS EXISTENTES (LOGIN, REPORTS, ETC)
// =====================================================

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.trim().toLowerCase(), password: password.trim() });
    if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
    res.json({ userId: user._id, role: user.role, agencyId: user.agencyId, name: user.name });
});

app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    const report = new Report({ ...req.body, userId: req.user._id, agencyId: req.user.agencyId, date: new Date(), data: { ...req.body, foto_url: req.file ? req.file.filename : null } });
    await report.save();
    res.json({ message: "Reporte guardado" });
});

app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    const reports = await Report.find({ agencyId: req.params.agencyId }).populate("userId", "name").populate("storeId", "name").sort({ date: -1 });
    res.json(reports);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Puerto ${PORT}`));

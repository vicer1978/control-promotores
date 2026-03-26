const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

// Modelos
const User = require("./models/User");
const Store = require("./models/Store");
const Agency = require("./models/Agency");
const Report = require("./models/Report");
const Checkin = require("./models/Checkin");

const app = express();

// Middlewares
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], allowedHeaders: ["Content-Type", "userId"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos Estáticos
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configuración de Multer para Fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Conexión MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error DB:", err));

// Middleware de Autenticación
async function auth(req, res, next) {
    try {
        const userId = req.headers.userid || req.headers.userId; 
        if (!userId) return res.status(401).json({ error: "No autorizado" });
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario inválido" });
        req.user = user;
        next();
    } catch (err) { res.status(500).json({ error: "Error auth" }); }
}

// --- RUTAS DE LOGIN ---
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase(), password: password.trim() });
        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
        res.json({ userId: user._id, role: user.role, agencyId: user.agencyId, name: user.name });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// --- RUTAS DE USUARIOS (ADMIN) ---
app.get("/users", auth, async (req, res) => {
    // Si es admin de agencia, solo ve los de su agencia
    const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
    const users = await User.find(filter).populate('stores');
    res.json(users);
});

app.post("/admin/create-user", auth, async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.json({ message: "Usuario creado" });
    } catch (err) { res.status(500).json({ error: "Error al crear usuario" }); }
});

app.delete("/users/:id", auth, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuario eliminado" });
});

// Asignar tiendas a usuario (Drag & Drop)
app.put("/users/:userId/stores", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { stores: req.body.stores });
        res.json({ message: "Ruta actualizada" });
    } catch (err) { res.status(500).json({ error: "Error al asignar" }); }
});

// --- RUTAS DE TIENDAS ---
app.get("/stores", auth, async (req, res) => {
    const stores = await Store.find();
    res.json(stores);
});

app.post("/stores", auth, async (req, res) => {
    const newStore = new Store(req.body);
    await newStore.save();
    res.json(newStore);
});

app.delete("/stores/:id", auth, async (req, res) => {
    await Store.findByIdAndDelete(req.params.id);
    res.json({ message: "Tienda eliminada" });
});

// --- RUTAS DE REPORTES ---

// Crear Reporte (Con Foto)
app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        const reportData = {
            ...req.body,
            userId: req.user._id,
            agencyId: req.user.agencyId,
            foto_url: req.file ? `/uploads/${req.file.filename}` : null,
            createdAt: new Date()
        };
        const report = new Report(reportData);
        await report.save();
        res.json({ message: "Reporte guardado con éxito" });
    } catch (err) {
        res.status(500).json({ error: "Error al guardar reporte" });
    }
});

// Obtener Reportes por Agencia (Para el Admin)
app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const reports = await Report.find({ agencyId: req.params.agencyId })
            .populate('userId', 'name')
            .populate('storeId', 'name')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) { res.status(500).json({ error: "Error al obtener reportes" }); }
});

// --- OPERACIONES DE CAMPO ---
app.post("/checkin", auth, async (req, res) => {
    const newCheckin = new Checkin({ ...req.body, userId: req.user._id, agencyId: req.user.agencyId });
    await newCheckin.save();
    res.json({ message: "Check-in registrado" });
});

app.get("/agencies", async (req, res) => {
    const agencies = await Agency.find();
    res.json(agencies);
});

// Comodín SPA
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 StorePulse Backend corriendo en puerto ${PORT}`));

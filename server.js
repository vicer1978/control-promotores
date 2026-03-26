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

// --- Middlewares ---
app.use(cors({ 
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
    allowedHeaders: ["Content-Type", "userId"] 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos Estáticos
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Configuración de Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// --- Conexión MongoDB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error DB:", err));

// --- Middlewares de Autenticación ---

// Auth General
async function auth(req, res, next) {
    try {
        const userId = req.headers.userid || req.headers.userId; 
        if (!userId) return res.status(401).json({ error: "No autorizado" });
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario inválido" });
        req.user = user;
        next();
    } catch (err) { res.status(500).json({ error: "Error de autenticación" }); }
}

// Auth Exclusiva Super Admin
async function authSuper(req, res, next) {
    try {
        const userId = req.headers.userid || req.headers.userId;
        if (!userId) return res.status(401).json({ error: "No autorizado" });
        const user = await User.findById(userId);
        if (!user || user.role !== 'super-admin') {
            return res.status(403).json({ error: "Acceso denegado: Se requiere Super Admin" });
        }
        req.user = user;
        next();
    } catch (err) { res.status(500).json({ error: "Error de autenticación Super" }); }
}

// --- RUTAS DE LOGIN ---
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ 
            email: email.trim().toLowerCase(), 
            password: password.trim() 
        });
        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
        res.json({ userId: user._id, role: user.role, agencyId: user.agencyId, name: user.name });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// --- RUTAS DE SUPER ADMIN (GESTIÓN GLOBAL) ---

// Agencias
app.get("/super/agencies", authSuper, async (req, res) => {
    try {
        const agencies = await Agency.find().sort({ name: 1 });
        res.json(agencies);
    } catch (err) { res.status(500).json({ error: "Error al obtener agencias" }); }
});

app.post("/super/agencies", authSuper, async (req, res) => {
    try {
        const agency = new Agency({ ...req.body, isActive: true });
        await agency.save();
        res.json({ message: "Agencia creada" });
    } catch (err) { res.status(500).json({ error: "Error al crear agencia" }); }
});

app.put("/super/agencies/:id/status", authSuper, async (req, res) => {
    try {
        await Agency.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive });
        res.json({ message: "Estado actualizado" });
    } catch (err) { res.status(500).json({ error: "Error al actualizar estado" }); }
});

app.delete("/super/agencies/:id", authSuper, async (req, res) => {
    try {
        await Agency.findByIdAndDelete(req.params.id);
        await User.updateMany({ agencyId: req.params.id }, { agencyId: null });
        res.json({ message: "Agencia eliminada" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// Usuarios Globales
app.get("/super/users", authSuper, async (req, res) => {
    try {
        const users = await User.find().populate('agencyId', 'name');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios globales" }); }
});

app.post("/super/users", authSuper, async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.json({ message: "Usuario global creado" });
    } catch (err) { res.status(500).json({ error: "Error al crear usuario" }); }
});

app.put("/super/users/:userId/assign", authSuper, async (req, res) => {
    try {
        const { agencyId } = req.body;
        await User.findByIdAndUpdate(req.params.userId, { agencyId: agencyId || null });
        res.json({ message: "Agencia asignada correctamente" });
    } catch (err) { res.status(500).json({ error: "Error al asignar agencia" }); }
});

app.delete("/super/users/:id", authSuper, async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ error: "No puedes borrarte a ti mismo" });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Usuario eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar usuario" }); }
});

// --- RUTAS DE USUARIOS (ADMIN DE AGENCIA) ---
app.get("/users", auth, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        const users = await User.find(filter).populate('stores');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios" }); }
});

app.post("/admin/create-user", auth, async (req, res) => {
    try {
        const newUser = new User({ ...req.body, agencyId: req.user.agencyId });
        await newUser.save();
        res.json({ message: "Usuario creado" });
    } catch (err) { res.status(500).json({ error: "Error al crear usuario" }); }
});

app.put("/users/:userId/role", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { role: req.body.role });
        res.json({ message: "Rol actualizado" });
    } catch (err) { res.status(500).json({ error: "Error al actualizar rol" }); }
});

app.put("/users/:userId/stores", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { stores: req.body.stores });
        res.json({ message: "Ruta actualizada" });
    } catch (err) { res.status(500).json({ error: "Error al asignar tiendas" }); }
});

app.delete("/users/:id", auth, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Usuario eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- RUTAS DE TIENDAS ---
app.get("/stores", auth, async (req, res) => {
    const stores = await Store.find();
    res.json(stores);
});

app.post("/stores", auth, async (req, res) => {
    try {
        const newStore = new Store(req.body);
        await newStore.save();
        res.json(newStore);
    } catch (err) { res.status(500).json({ error: "Error al crear tienda" }); }
});

app.delete("/stores/:id", auth, async (req, res) => {
    await Store.findByIdAndDelete(req.params.id);
    res.json({ message: "Tienda eliminada" });
});

// --- RUTAS DE REPORTES ---
app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        const reportData = {
            ...req.body,
            userId: req.user._id,
            agencyId: req.user.agencyId,
            foto_url: req.file ? `/uploads/${req.file.filename}` : null
        };
        const report = new Report(reportData);
        await report.save();
        res.json({ message: "Reporte guardado" });
    } catch (err) { res.status(500).json({ error: "Error al guardar reporte" }); }
});

app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const reports = await Report.find({ agencyId: req.params.agencyId })
            .populate('userId', 'name')
            .populate('storeId', 'name')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) { res.status(500).json({ error: "Error al obtener reportes" }); }
});

// --- OTRAS RUTAS ---
app.post("/checkin", auth, async (req, res) => {
    const newCheckin = new Checkin({ ...req.body, userId: req.user._id, agencyId: req.user.agencyId });
    await newCheckin.save();
    res.json({ message: "Check-in registrado" });
});

app.get("/agencies", async (req, res) => {
    const agencies = await Agency.find();
    res.json(agencies);
});

// --- Manejo de Rutas Frontend (SPA) ---
app.get("/admin/super", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "super-admin.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "admin.html"));
});

// Comodín para SPA (regex para evitar conflictos con rutas API)
app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));

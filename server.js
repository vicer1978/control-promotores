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

// Auth General (Mejorado para evitar errores de cast ID)
async function auth(req, res, next) {
    try {
        const userId = req.headers.userid || req.headers.userId; 
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ error: "Sesión inválida o ID malformado" });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario no existe" });
        
        req.user = user;
        next();
    } catch (err) { 
        res.status(500).json({ error: "Error de autenticación" }); 
    }
}

// Auth Exclusiva Super Admin
async function authSuper(req, res, next) {
    try {
        const userId = req.headers.userid || req.headers.userId;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ error: "No autorizado" });
        }
        const user = await User.findById(userId);
        if (!user || user.role !== 'super-admin') {
            return res.status(403).json({ error: "Acceso denegado: Se requiere Super Admin" });
        }
        req.user = user;
        next();
    } catch (err) { 
        res.status(500).json({ error: "Error de autenticación Super" }); 
    }
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

// --- RUTAS DE SUPER ADMIN ---
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

app.get("/super/users", authSuper, async (req, res) => {
    try {
        const users = await User.find().populate('agencyId', 'name');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios globales" }); }
});

// --- RUTAS DE USUARIOS Y TIENDAS ---

// NUEVA RUTA: Obtener usuario específico con tiendas (CRUCIAL PARA EL DASHBOARD)
app.get("/users/:id", auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('stores');
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener perfil de usuario" });
    }
});

app.get("/users", auth, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        const users = await User.find(filter).populate('stores');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios" }); }
});

app.put("/users/:userId/stores", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { stores: req.body.stores });
        res.json({ message: "Ruta actualizada" });
    } catch (err) { res.status(500).json({ error: "Error al asignar tiendas" }); }
});

app.get("/stores", auth, async (req, res) => {
    const stores = await Store.find();
    res.json(stores);
});

// --- OPERACIONES (CHECKIN / REPORTES) ---
app.post("/checkin", auth, async (req, res) => {
    try {
        const newCheckin = new Checkin({ ...req.body, userId: req.user._id, agencyId: req.user.agencyId });
        await newCheckin.save();
        res.json({ message: "Check-in registrado" });
    } catch (err) { res.status(500).json({ error: "Error en check-in" }); }
});

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

// --- MANEJO DE RUTAS FRONTEND (SPA) ---
// Estas rutas deben ir DESPUÉS de todas las rutas de la API

app.get("/admin/super", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "super-admin.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "admin.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "dashboard.html"));
});

// El comodín final solo para peticiones que NO sean de API
app.get("*", (req, res) => {
    // Si la ruta no existe y no es una llamada a /api, mandamos al login
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));

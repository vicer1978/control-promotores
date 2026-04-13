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
    allowedHeaders: ["Content-Type", "userId", "userid"] 
}));

// Mejora de seguridad para visualización de imágenes
app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
});

// MODIFICACIÓN: Se aumenta el límite de tamaño para recibir fotos pesadas
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Archivos Estáticos
app.use(express.static(path.join(__dirname, "public")));

// Servir la carpeta de subidas con permisos correctos
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => {
        res.set("Access-Control-Allow-Origin", "*");
    }
}));

// --- Configuración de Multer (Para Fotos) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ 
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error("Solo se permiten imágenes (jpg, jpeg, png, webp)"));
    }
});

// --- Conexión MongoDB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error DB:", err));

// --- Middlewares de Autenticación ---
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

// --- GESTIÓN DE ASISTENCIA ---
app.get("/checkins/:agencyId", auth, async (req, res) => {
    try {
        const { agencyId } = req.params;
        const history = await Checkin.find({ agencyId })
            .populate("userId", "name role")
            .populate("storeId", "name")
            .sort({ timestamp: -1 })
            .limit(100);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener historial de asistencia" });
    }
});

app.post("/checkin", auth, upload.single("photo"), async (req, res) => {
    try {
        const { storeId, lat, lng } = req.body;
        if (!storeId || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: "Datos incompletos" });
        }
        const lastCheckin = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (lastCheckin && lastCheckin.type === "checkin") {
            return res.status(400).json({ error: "Ya tienes una entrada activa." });
        }
        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkin",
            foto_url: fotoUrl,
            timestamp: new Date()
        });
        await newCheckin.save();
        const checkinReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId,
            reporte: "checkin",
            foto_url: fotoUrl,
            location: { lat: Number(lat), lng: Number(lng) }
        });
        await checkinReport.save();
        res.json({ message: "Entrada registrada", checkin: newCheckin });
    } catch (err) { res.status(500).json({ error: "Error en checkin", detalle: err.message }); }
});

app.post("/checkout", auth, async (req, res) => {
    try {
        const { lat, lng, storeId } = req.body;
        const lastEvent = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (!lastEvent || lastEvent.type === "checkout") {
            return res.status(400).json({ error: "No hay una entrada activa." });
        }
        const newCheckout = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: storeId || lastEvent.storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkout", 
            timestamp: new Date()
        });
        await newCheckout.save();
        const checkoutReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: storeId || lastEvent.storeId,
            reporte: "checkout",
            location: { lat: Number(lat), lng: Number(lng) }
        });
        await checkoutReport.save();
        res.json({ message: "Salida registrada con éxito" });
    } catch (err) { res.status(500).json({ error: "Error en checkout" }); }
});

// --- GESTIÓN DE REPORTES ---
app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const reports = await Report.find({ agencyId: req.params.agencyId })
            .populate('userId', 'name role')
            .populate('storeId', 'name')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) { res.status(500).json({ error: "Error al cargar reportes" }); }
});

app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        const obs = req.body.observaciones || req.body.comentarios || "";
        let tipoReporte = req.body.reportType || req.body.reporte || req.body.type || "";
        if (tipoReporte.toLowerCase().includes("exhibicion")) tipoReporte = "exhibicion";

        const reportData = {
            ...req.body,
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: req.body.storeId, 
            reporte: tipoReporte, 
            foto_url: req.file ? `/uploads/${req.file.filename}` : null,
            cantidad: Number(req.body.cantidad) || 0,
            inv_inicial: Number(req.body.inv_inicial) || 0,
            resurtido: Number(req.body.resurtido) || 0,
            ventas: Number(req.body.ventas) || 0, 
            inv_final: Number(req.body.inv_final) || 0,
            precio: Number(req.body.precio) || Number(req.body.precio_normal) || 0,
            precio_normal: Number(req.body.precio_normal) || Number(req.body.precio) || 0,
            precio_oferta: Number(req.body.precio_oferta) || 0,
            personas: Number(req.body.personas) || 0,
            observaciones: obs,
            location: (req.body.lat && req.body.lng) ? { lat: Number(req.body.lat), lng: Number(req.body.lng) } : { lat: 0, lng: 0 }
        };

        const report = new Report(reportData);
        await report.save();
        res.json({ message: "Reporte guardado con éxito", id: report._id });
    } catch (err) { res.status(500).json({ error: "Error interno", detalles: err.message }); }
});

app.delete("/reports/:id", auth, async (req, res) => {
    try {
        await Report.findByIdAndDelete(req.params.id);
        res.json({ message: "Reporte eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- GESTIÓN DE USUARIOS (EXTENDIDO PARA ADMIN DASHBOARD) ---
app.get("/users", auth, async (req, res) => {
    try {
        const users = await User.find({ agencyId: req.user.agencyId }).populate('assignedStores');
        // Mapeo para asegurar compatibilidad de nombres de campos
        const mappedUsers = users.map(u => ({
            ...u._doc,
            assignedStores: u.assignedStores || u.stores || [] 
        }));
        res.json(mappedUsers);
    } catch (err) { res.status(500).json({ error: "Error al cargar usuarios" }); }
});

app.post("/users/register", auth, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const newUser = new User({
            name,
            email: email.toLowerCase(),
            password: password || "123",
            role: role || "promotor",
            agencyId: req.user.agencyId
        });
        await newUser.save();
        res.json({ message: "Usuario creado con éxito" });
    } catch (err) { res.status(500).json({ error: "Error al crear usuario" }); }
});

app.post("/users/:userId/assign", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { 
            $addToSet: { assignedStores: req.body.storeId, stores: req.body.storeId } 
        });
        res.json({ message: "Tienda asignada" });
    } catch (err) { res.status(500).json({ error: "Error al asignar" }); }
});

app.post("/users/:userId/unassign", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { 
            $pull: { assignedStores: req.body.storeId, stores: req.body.storeId } 
        });
        res.json({ message: "Tienda desasignada" });
    } catch (err) { res.status(500).json({ error: "Error al desasignar" }); }
});

app.put("/users/:userId/role", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { role: req.body.role });
        res.json({ message: "Rol actualizado" });
    } catch (err) { res.status(500).json({ error: "Error al cambiar rol" }); }
});

app.delete("/users/:id", auth, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Usuario eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- GESTIÓN DE TIENDAS ---
app.get("/stores", auth, async (req, res) => {
    try {
        const stores = await Store.find({ agencyId: req.user.agencyId }).sort({ name: 1 });
        res.json(stores);
    } catch (err) { res.status(500).json({ error: "Error al cargar tiendas" }); }
});

app.post("/stores", auth, async (req, res) => {
    try {
        const newStore = new Store({ ...req.body, agencyId: req.user.agencyId });
        await newStore.save();
        res.json({ message: "Tienda creada", store: newStore });
    } catch (err) { res.status(500).json({ error: "Error al crear tienda" }); }
});

app.delete("/stores/:id", auth, async (req, res) => {
    try {
        await Store.findByIdAndDelete(req.params.id);
        res.json({ message: "Tienda eliminada" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar tienda" }); }
});

// --- MANEJO DE FRONTEND ---
app.get("/admin", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "admin.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard.html")));
app.get("/home", (req, res) => res.sendFile(path.resolve(__dirname, "public", "home.html")));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/uploads/')) return res.status(404).send('Archivo no encontrado');
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
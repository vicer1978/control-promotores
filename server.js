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

// --- GESTIÓN DE ASISTENCIA CON FOTO (CHECK-IN / CHECK-OUT) ---
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
            storeId: storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkin",
            foto_url: fotoUrl,
            timestamp: new Date()
        });
        await newCheckin.save();

        const checkinReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: storeId,
            reporte: "checkin",
            foto_url: fotoUrl,
            location: { lat: Number(lat), lng: Number(lng) }
        });
        await checkinReport.save();

        res.json({ message: "Entrada registrada", checkin: newCheckin });
    } catch (err) {
        res.status(500).json({ error: "Error en checkin", detalle: err.message });
    }
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
    } catch (err) {
        res.status(500).json({ error: "Error en checkout" });
    }
});

// --- GESTIÓN DE REPORTES ---
app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const reports = await Report.find({ agencyId: req.params.agencyId })
            .populate('userId', 'name role')
            .populate('storeId', 'name')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: "Error al cargar reportes" });
    }
});

app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        const obs = req.body.observaciones || req.body.comentarios || "";
        
        // NORMALIZACIÓN: Corregir error de validación 'exhibicion' vs 'exhibiciones'
        let tipoReporte = req.body.reportType || req.body.reporte || req.body.type || "";
        if (tipoReporte.toLowerCase().includes("exhibicion")) {
            tipoReporte = "exhibicion";
        }

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
            location: (req.body.lat && req.body.lng) ? {
                lat: Number(req.body.lat),
                lng: Number(req.body.lng)
            } : { lat: 0, lng: 0 }
        };

        const report = new Report(reportData);
        await report.save();
        res.json({ message: "Reporte guardado con éxito", id: report._id });
    } catch (err) { 
        res.status(500).json({ error: "Error interno al guardar", detalles: err.message }); 
    }
});

app.delete("/reports/:id", auth, async (req, res) => {
    try {
        await Report.findByIdAndDelete(req.params.id);
        res.json({ message: "Reporte eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- GESTIÓN DE USUARIOS Y TIENDAS ---
app.get("/users", auth, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        const users = await User.find(filter).populate('stores');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.get("/users/:id", auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('stores');
        res.json(user);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.post("/users", auth, async (req, res) => {
    try {
        const { name, email, password, role, agencyId } = req.body;
        const newUser = new User({
            name,
            email: email.toLowerCase(),
            password,
            role,
            agencyId: agencyId || req.user.agencyId
        });
        await newUser.save();
        res.json({ message: "Usuario creado" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.put("/users/:userId/stores", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.userId, { stores: req.body.stores });
        res.json({ message: "Ruta actualizada" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.get("/stores", auth, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        const stores = await Store.find(filter).sort({ name: 1 });
        res.json(stores);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.post("/stores", auth, async (req, res) => {
    try {
        const newStore = new Store({ ...req.body, agencyId: req.user.agencyId });
        await newStore.save();
        res.json({ message: "Tienda creada", store: newStore });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// --- MANEJO DE FRONTEND (SERVIR HTML) ---
app.get("/admin", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "admin.html")));
app.get("/admin/super", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "super-admin.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard.html")));
app.get("/dashboard_tareas", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard_tareas.html")));
app.get("/home", (req, res) => res.sendFile(path.resolve(__dirname, "public", "home.html")));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

// Catch-all para cualquier otra ruta
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/uploads/')) return res.status(404).send('Archivo no encontrado');
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));

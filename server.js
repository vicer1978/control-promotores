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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos Estáticos
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Configuración de Multer (Para Fotos) ---
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

// --- GESTIÓN DE ASISTENCIA (CHECK-IN / CHECK-OUT) ---

app.post("/checkin", auth, async (req, res) => {
    try {
        const { storeId, lat, lng } = req.body;

        if (!storeId || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: "Datos incompletos: storeId, lat y lng son obligatorios." });
        }

        const lastCheckin = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (lastCheckin && lastCheckin.type === "checkin") {
            return res.status(400).json({ error: "Ya tienes una entrada activa. Registra salida primero." });
        }

        // 1. Guardar Asistencia (Prioridad)
        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: storeId,
            location: { 
                lat: Number(lat), 
                lng: Number(lng) 
            },
            type: "checkin",
            timestamp: new Date()
        });
        await newCheckin.save();

        // 2. Guardar Reporte Espejo (Historial)
        const checkinReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: storeId,
            reporte: "checkin",
            location: { lat: Number(lat), lng: Number(lng) }
        });
        checkinReport.save().catch(e => console.error("⚠️ Error reporte espejo checkin:", e.message));

        res.json({ message: "Entrada registrada", checkin: newCheckin });
    } catch (err) {
        console.error("❌ Error en checkin:", err);
        res.status(500).json({ error: "Error al registrar entrada", detalle: err.message });
    }
});

app.post("/checkout", auth, async (req, res) => {
    try {
        const { lat, lng, storeId } = req.body;

        const lastEvent = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (!lastEvent || lastEvent.type === "checkout") {
            return res.status(400).json({ error: "No hay una entrada activa para registrar salida." });
        }

        const newCheckout = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: storeId || lastEvent.storeId,
            location: { 
                lat: Number(lat), 
                lng: Number(lng) 
            },
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
        checkoutReport.save().catch(e => console.error("⚠️ Error reporte espejo checkout:", e.message));

        res.json({ message: "Salida registrada con éxito", checkout: newCheckout });
    } catch (err) {
        console.error("❌ Error en checkout:", err);
        res.status(500).json({ error: "Error al registrar salida", detalle: err.message });
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
        
        const reportData = {
            ...req.body,
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId: req.body.storeId, 
            // Soporta varios nombres de campo que el celular pueda enviar
            reporte: req.body.reporte || req.body.reportType || req.body.type, 
            foto_url: req.file ? `/uploads/${req.file.filename}` : null,
            
            // Conversión segura a número para evitar fallos de validación
            cantidad: Number(req.body.cantidad) || 0,
            inv_inicial: Number(req.body.inv_inicial) || 0,
            resurtido: Number(req.body.resurtido) || 0,
            inv_final: Number(req.body.inv_final) || 0,
            
            // Manejo especial para precios (soporta precio_normal desde el front)
            precio: Number(req.body.precio) || Number(req.body.precio_normal) || 0,
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
        console.error("❌ Error al guardar reporte:", err);
        res.status(500).json({ error: "Error interno al guardar el reporte", detalles: err.message }); 
    }
});

app.delete("/reports/:id", auth, async (req, res) => {
    try {
        await Report.findByIdAndDelete(req.params.id);
        res.json({ message: "Reporte eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- GESTIÓN DE USUARIOS Y RUTAS ---

app.get("/users", auth, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        const users = await User.find(filter).populate('stores');
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios" }); }
});

app.get("/users/:id", auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('stores');
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        res.json(user);
    } catch (err) { res.status(500).json({ error: "Error al obtener perfil" }); }
});

app.post("/users", auth, async (req, res) => {
    try {
        const { name, email, password, role, agencyId } = req.body;
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) return res.status(400).json({ error: "El correo ya existe" });

        const newUser = new User({
            name,
            email: email.toLowerCase(),
            password,
            role,
            agencyId: agencyId || req.user.agencyId
        });
        await newUser.save();
        res.json({ message: "Usuario creado", userId: newUser._id });
    } catch (err) { res.status(500).json({ error: "Error al crear usuario" }); }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { role: req.body.role });
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
        const targetId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ error: "ID de usuario malformado" });
        }
        if (targetId === req.user._id.toString()) {
            return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
        }
        const deletedUser = await User.findByIdAndDelete(targetId);
        if (!deletedUser) return res.status(404).json({ error: "Usuario no encontrado" });
        res.json({ message: "Usuario eliminado correctamente" });
    } catch (err) {
        console.error("❌ Error al eliminar usuario:", err);
        res.status(500).json({ error: "Error al eliminar usuario", detalle: err.message });
    }
});

// --- GESTIÓN DE TIENDAS ---

app.get("/stores", auth, async (req, res) => {
    try {
        const stores = await Store.find().sort({ name: 1 });
        res.json(stores);
    } catch (err) { res.status(500).json({ error: "Error al obtener tiendas" }); }
});

app.post("/stores", auth, async (req, res) => {
    try {
        const { name, address } = req.body;
        const newStore = new Store({ 
            name, 
            address, 
            agencyId: req.user.agencyId 
        });
        await newStore.save();
        res.json({ message: "Tienda creada", store: newStore });
    } catch (err) { res.status(500).json({ error: "Error al crear tienda" }); }
});

// --- MANEJO DE FRONTEND ---

app.get("/admin", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "Admin", "admin.html"));
});

app.get("/admin/super", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "Admin", "super-admin.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "dashboard.html"));
});

app.get("/home", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "home.html"));
});

app.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));

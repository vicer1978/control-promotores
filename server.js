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
const Project = require("./models/Project");

const app = express();

// --- Middlewares ---
app.use(cors({ 
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
    allowedHeaders: ["Content-Type", "userId", "userid", "projectid"] 
}));

app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => {
        res.set("Access-Control-Allow-Origin", "*");
    }
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ 
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error("Solo se permiten imágenes (jpg, jpeg, png, webp)"));
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error DB:", err));

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

// --- LOGIN ---
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ 
            email: email.trim().toLowerCase(), 
            password: password.trim() 
        });
        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
        res.json({ 
            userId: user._id, 
            role: user.role, 
            agencyId: user.agencyId, 
            projectId: user.projectId, 
            name: user.name 
        });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// --- GESTIÓN DE PROYECTOS (CLIENTES) ---
app.get("/projects", auth, async (req, res) => {
    try {
        const projects = await Project.find({ agencyId: req.user.agencyId, active: true });
        res.json(projects);
    } catch (err) { res.status(500).json({ error: "Error al obtener proyectos" }); }
});

app.post("/projects", auth, async (req, res) => {
    try {
        const newProject = new Project({ ...req.body, agencyId: req.user.agencyId });
        await newProject.save();
        res.json({ message: "Proyecto creado", project: newProject });
    } catch (err) { res.status(500).json({ error: "Error al crear proyecto" }); }
});

app.delete("/projects/:id", auth, async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: "Proyecto eliminado correctamente" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar proyecto" }); }
});

// --- ASISTENCIA (CHECKINS) ---
app.get("/checkins/:agencyId", auth, async (req, res) => {
    try {
        const { agencyId } = req.params;
        const projectId = req.headers.projectid;
        const query = { agencyId };
        if (projectId) query.projectId = projectId;

        const history = await Checkin.find(query)
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
        const { storeId, lat, lng, projectId } = req.body;
        if (!storeId || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: "Datos incompletos" });
        }
        const lastCheckin = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (lastCheckin && lastCheckin.type === "checkin") {
            return res.status(400).json({ error: "Ya tienes una entrada activa." });
        }
        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const currentProjectId = projectId || req.user.projectId;

        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: currentProjectId,
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
            projectId: currentProjectId,
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
        const { lat, lng, storeId, projectId } = req.body;
        const lastEvent = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (!lastEvent || lastEvent.type === "checkout") {
            return res.status(400).json({ error: "No hay una entrada activa." });
        }
        const currentProjectId = projectId || lastEvent.projectId || req.user.projectId;

        const newCheckout = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: currentProjectId,
            storeId: storeId || lastEvent.storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkout", 
            timestamp: new Date()
        });
        await newCheckout.save();

        const checkoutReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: currentProjectId,
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

// --- REPORTES ---
app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        const query = { agencyId: req.params.agencyId };
        if (projectId) query.projectId = projectId;

        const reports = await Report.find(query)
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
        let tipoReporte = req.body.reportType || req.body.reporte || req.body.type || "";
        if (tipoReporte.toLowerCase().includes("exhibicion")) {
            tipoReporte = "exhibicion";
        }
        
        const reportData = {
            ...req.body,
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: req.body.projectId || req.user.projectId,
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

// --- GESTIÓN DE USUARIOS ---
app.get("/users", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        if (projectId) filter.projectId = projectId;

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

// MODIFICACIÓN PARA DIAGNÓSTICO DE DUPLICADOS
app.post("/users", auth, async (req, res) => {
    try {
        const { name, email, password, role, agencyId, stores, projectId } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: "Faltan datos obligatorios" });
        }

        // Limpieza profunda y validación de projectId
        const finalEmail = email.toLowerCase().trim();
        const finalProjectId = (projectId === "" || !projectId) ? null : projectId;

        const newUser = new User({
            name: name.trim(),
            email: finalEmail,
            password: password.trim(),
            role,
            agencyId: agencyId || req.user.agencyId,
            projectId: finalProjectId,
            stores: stores || []
        });

        await newUser.save();
        res.json({ message: "Usuario creado", user: newUser });
    } catch (err) { 
        console.error("Error Mongo:", err);
        // Si el error es de duplicado (E11000)
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(400).json({ 
                message: `El campo '${field}' ya está registrado. No puedes usar valores duplicados en ${field}.`,
                detalle: err.message 
            });
        }
        res.status(500).json({ message: "Error interno", detalle: err.message }); 
    }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.email) updates.email = updates.email.toLowerCase().trim();
        if (updates.projectId === "" || updates.projectId === null) {
            updates.projectId = null;
        }

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json({ message: "Usuario actualizado", user });
    } catch (err) { res.status(500).json({ error: "Error al actualizar usuario" }); }
});

app.post("/users/:userId/assign", auth, async (req, res) => {
    try {
        const { storeId } = req.body;
        if (!storeId) return res.status(400).json({ error: "storeId es requerido" });
        await User.findByIdAndUpdate(req.params.userId, { $addToSet: { stores: storeId } });
        res.json({ message: "Tienda asignada con éxito" });
    } catch (err) { res.status(500).json({ error: "Error al asignar tienda" }); }
});

app.delete("/users/:userId/stores/:storeId", auth, async (req, res) => {
    try {
        const { userId, storeId } = req.params;
        await User.findByIdAndUpdate(userId, { $pull: { stores: storeId } });
        res.json({ message: "Tienda desasignada con éxito" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar tienda" }); }
});

// --- GESTIÓN DE TIENDAS ---
app.get("/stores", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        const filter = req.user.role === 'admin' ? { agencyId: req.user.agencyId } : {};
        if (projectId) filter.projectId = projectId;

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

app.delete("/stores/:id", auth, async (req, res) => {
    try {
        await Store.findByIdAndDelete(req.params.id);
        res.json({ message: "Tienda eliminada" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar tienda" }); }
});

// --- RUTAS DE NAVEGACIÓN ---
app.get("/admin", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "admin.html")));
app.get("/admin/super", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "super-admin.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard.html")));
app.get("/dashboard_tareas", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard_tareas.html")));
app.get("/home", (req, res) => res.sendFile(path.resolve(__dirname, "public", "home.html")));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/uploads/')) return res.status(404).send('Archivo no encontrado');
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));

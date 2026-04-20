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
    setHeaders: (res) => { res.set("Access-Control-Allow-Origin", "*"); }
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
            return res.status(401).json({ error: "Sesión inválida" });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario no existe" });
        req.user = user;
        next();
    } catch (err) { res.status(500).json({ error: "Error de autenticación" }); }
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
        res.json({ userId: user._id, role: user.role, agencyId: user.agencyId, name: user.name });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// --- PROYECTOS ---
app.get("/projects", auth, async (req, res) => {
    try {
        const projects = await Project.find({ agencyId: req.user.agencyId }).populate("clientId", "name").sort({ name: 1 }).lean();
        res.json(projects.map(p => ({ ...p, clientName: p.clientId ? p.clientId.name : "Sin asignar" })));
    } catch (err) { res.status(500).json({ error: "Error al obtener proyectos" }); }
});

app.post("/projects", auth, async (req, res) => {
    try {
        const newProject = new Project({ ...req.body, agencyId: req.user.agencyId });
        await newProject.save();
        res.json({ message: "Proyecto creado", project: newProject });
    } catch (err) { res.status(500).json({ error: "Error al crear" }); }
});

// --- ASISTENCIA (Lógica de Código 1 unificada con Proyectos) ---
app.get("/checkins/:agencyId", auth, async (req, res) => {
    try {
        const { agencyId } = req.params;
        const projectId = req.headers.projectid;
        let query = { agencyId };

        if (req.user.role === 'cliente') {
            query.projectId = projectId;
        } else if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            query.projectId = projectId;
        }

        const history = await Checkin.find(query)
            .populate("userId", "name role")
            .populate("storeId", "name")
            .sort({ timestamp: -1 })
            .limit(100);
        res.json(history);
    } catch (err) { res.status(500).json({ error: "Error al obtener historial" }); }
});

app.post("/checkin", auth, upload.single("photo"), async (req, res) => {
    try {
        const { storeId, lat, lng, projectId } = req.body;
        const lastCheckin = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        
        if (lastCheckin && lastCheckin.type === "checkin") {
            return res.status(400).json({ error: "Ya tienes una entrada activa." });
        }

        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const finalProjectId = projectId || req.user.projectId;

        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: finalProjectId,
            storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkin",
            foto_url: fotoUrl,
            timestamp: new Date()
        });
        await newCheckin.save();

        // Duplicar en reporte (Lógica Código 1)
        const checkinReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: finalProjectId,
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
        const { lat, lng, storeId, projectId } = req.body;
        const lastEvent = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        
        if (!lastEvent || lastEvent.type === "checkout") {
            return res.status(400).json({ error: "No hay una entrada activa." });
        }

        const finalProjectId = projectId || lastEvent.projectId || req.user.projectId;

        const newCheckout = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: finalProjectId,
            storeId: storeId || lastEvent.storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkout", 
            timestamp: new Date()
        });
        await newCheckout.save();

        const checkoutReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: finalProjectId,
            storeId: storeId || lastEvent.storeId,
            reporte: "checkout",
            location: { lat: Number(lat), lng: Number(lng) }
        });
        await checkoutReport.save();

        res.json({ message: "Salida registrada con éxito" });
    } catch (err) { res.status(500).json({ error: "Error en checkout" }); }
});

// --- REPORTES ---
app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        let query = { agencyId: req.params.agencyId };
        
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            query.projectId = projectId;
        }

        const reports = await Report.find(query)
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
            projectId: req.body.projectId || req.user.projectId,
            reporte: tipoReporte, 
            foto_url: req.file ? `/uploads/${req.file.filename}` : null,
            cantidad: Number(req.body.cantidad) || 0,
            precio: Number(req.body.precio) || Number(req.body.precio_normal) || 0,
            observaciones: obs,
            location: (req.body.lat && req.body.lng) ? { lat: Number(req.body.lat), lng: Number(req.body.lng) } : { lat: 0, lng: 0 }
        };
        const report = new Report(reportData);
        await report.save();
        res.json({ message: "Reporte guardado", id: report._id });
    } catch (err) { res.status(500).json({ error: "Error al guardar", detalles: err.message }); }
});

// --- USUARIOS Y TIENDAS ---
app.get("/users", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        const filter = { agencyId: req.user.agencyId };
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) filter.projectId = projectId;
        const users = await User.find(filter).populate('stores').sort({ name: 1 });
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.post("/users", auth, async (req, res) => {
    try {
        const newUser = new User({ ...req.body, agencyId: req.user.agencyId });
        await newUser.save();
        res.json({ message: "Usuario creado", user: newUser });
    } catch (err) { res.status(500).json({ error: "Error al crear" }); }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.email) updates.email = updates.email.toLowerCase().trim();
        const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).populate('stores');
        res.json({ message: "Usuario actualizado", user });
    } catch (err) { res.status(500).json({ error: "Error al actualizar" }); }
});

app.get("/stores", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        const filter = { agencyId: req.user.agencyId };
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) filter.projectId = projectId;
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

// --- RUTAS DE NAVEGACIÓN ---
app.get("/admin", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "admin.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard.html")));
app.get("/home", (req, res) => res.sendFile(path.resolve(__dirname, "public", "home.html")));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor unificado en puerto ${PORT}`));

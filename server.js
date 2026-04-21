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
        // Buscamos el ID en todas las variantes posibles de headers
        const userId = req.headers.userid || req.headers.userId || req.headers.UserId; 
        
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            console.log("ID de usuario no recibido o malformado");
            return res.status(401).json({ error: "Sesión inválida" });
        }
        
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario no existe" });
        
        req.user = user;
        next();
    } catch (err) { 
        res.status(500).json({ error: "Error de servidor en auth" }); 
    }
}



// --- LOGIN ---
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email y password requeridos" });

        const user = await User.findOne({ 
            email: email.trim().toLowerCase(), 
            password: password.trim() 
        });

        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });

        // AGREGAMOS projectId a la respuesta
        res.json({ 
            userId: user._id, 
            role: user.role, 
            agencyId: user.agencyId, 
            name: user.name,
            projectId: user.projectId // <--- ESTO ES VITAL PARA MARIA
        });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});


// --- GESTIÓN DE PROYECTOS ---
app.get("/projects", auth, async (req, res) => {
    try {
        const projects = await Project.find({ agencyId: req.user.agencyId })
            .populate("clientId", "name") 
            .sort({ name: 1 })
            .lean();
        
        const formattedProjects = projects.map(p => ({
            ...p,
            clientName: p.clientId ? p.clientId.name : "Sin asignar"
        }));
        
        res.json(formattedProjects);
    } catch (err) { 
        res.status(500).json({ error: "Error al obtener proyectos" }); 
    }
});

app.get("/client-projects", auth, async (req, res) => {
    try {
        const filter = { agencyId: req.user.agencyId, active: true };
        if (req.user.role.toLowerCase() === 'cliente') {
            filter.clientId = req.user._id;
        }
        const projects = await Project.find(filter).populate("clientId", "name").sort({ name: 1 });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: "Error al cargar proyectos del cliente" });
    }
});

app.post("/projects", auth, async (req, res) => {
    try {
        const { name, clientId } = req.body;
        if (!name) return res.status(400).json({ error: "El nombre de la marca/proyecto es necesario" });

        const newProject = new Project({ 
            ...req.body, 
            clientId: clientId || null,
            agencyId: req.user.agencyId
        });
        await newProject.save();
        res.json({ message: "Proyecto creado con éxito", project: newProject });
    } catch (err) { 
        res.status(500).json({ error: "Error al crear proyecto" }); 
    }
});

app.put("/projects/:id", auth, async (req, res) => {
    try {
        const updates = req.body;
        const project = await Project.findByIdAndUpdate(req.params.id, updates, { new: true }).populate("clientId", "name");
        res.json({ message: "Proyecto actualizado con éxito", project });
    } catch (err) { res.status(500).json({ error: "Error al actualizar proyecto" }); }
});

app.delete("/projects/:id", auth, async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: "Proyecto eliminado correctamente" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar proyecto" }); }
});

// --- ASISTENCIA (CHECKINS / CHECKOUTS) ---
app.get("/checkins/:agencyId", auth, async (req, res) => {
    try {
        const { agencyId } = req.params;
        const query = { agencyId };
        
        const filterProject = req.headers.projectid;
        if (req.user.role.toLowerCase() === 'cliente') {
            const hasAccess = await Project.findOne({ _id: filterProject, clientId: req.user._id });
            if (!hasAccess) return res.status(403).json({ error: "Acceso denegado" });
            query.projectId = filterProject;
        } else if (filterProject && mongoose.Types.ObjectId.isValid(filterProject)) {
            query.projectId = filterProject;
        }

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

        // Validación de entrada activa (del Código 1)
        const lastCheckin = await Checkin.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
        if (lastCheckin && lastCheckin.type === "checkin") {
            return res.status(400).json({ error: "Ya tienes una entrada activa." });
        }

        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        
        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || req.user.projectId,
            storeId: storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkin",
            foto_url: fotoUrl,
            timestamp: new Date()
        });
        await newCheckin.save();

        // Crear reporte automático de checkin (del Código 1)
        const checkinReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || req.user.projectId,
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

        const newCheckout = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || lastEvent.projectId,
            storeId: storeId || lastEvent.storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkout", 
            timestamp: new Date()
        });
        await newCheckout.save();

        const checkoutReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || lastEvent.projectId,
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
        const { agencyId } = req.params;
        const query = { agencyId };
        
        const filterProject = req.headers.projectid;
        if (req.user.role.toLowerCase() === 'cliente') {
            query.projectId = filterProject;
        } else if (filterProject && mongoose.Types.ObjectId.isValid(filterProject)) {
            query.projectId = filterProject;
        }

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
        res.status(500).json({ error: "Error al guardar reporte", detalles: err.message }); 
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
        const filter = { agencyId: req.user.agencyId };

        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            filter.projectId = projectId;
        }

        const users = await User.find(filter).populate('stores').sort({ name: 1 });
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al cargar usuarios" }); }
});

app.post("/users", auth, async (req, res) => {
    try {
        const { name, email, password, role, projectId, stores } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "Nombre, email y contraseña son obligatorios" });
        }

        const newUser = new User({
            name: name.toString().trim(),
            email: email.toString().toLowerCase().trim(),
            password: password.toString().trim(),
            role: (role || 'promotor').toLowerCase().trim(),
            agencyId: req.user.agencyId,
            projectId: (projectId && mongoose.Types.ObjectId.isValid(projectId)) ? projectId : null, 
            stores: stores || []
        });

        await newUser.save();
        res.json({ message: "Usuario creado con éxito", user: newUser });
    } catch (err) { 
        res.status(500).json({ error: "No se pudo guardar el usuario", detalle: err.message }); 
    }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, role, active, projectId, stores } = req.body;

        // Construimos el objeto de actualización de forma dinámica
        const updateData = {};
        
        if (name !== undefined) updateData.name = name.trim();
        if (role !== undefined) updateData.role = role;
        if (active !== undefined) updateData.active = active;
        if (Array.isArray(stores)) updateData.stores = stores;

        // Limpieza de Email
        if (email) updateData.email = email.toLowerCase().trim();

        // Limpieza de projectId
        if (!projectId || projectId === "null" || projectId === "") {
            updateData.projectId = null;
        } else if (mongoose.Types.ObjectId.isValid(projectId)) {
            updateData.projectId = projectId;
        }

        // USAMOS $set para que solo modifique lo que enviamos y no borre lo demás
        const user = await User.findByIdAndUpdate(
            userId, 
            { $set: updateData }, 
            { new: true }
        ).populate('stores');

        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        res.json({ message: "Usuario actualizado con éxito", user });
    } catch (err) {
        console.error("Error al actualizar usuario:", err);
        res.status(500).json({ error: "Error interno al guardar cambios" });
    }
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
        let filter = {};

        // 1. Si el usuario NO es admin (es decir, es Maria/Promotor), 
        // solo le mostramos las tiendas que tiene asignadas en su perfil.
        if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
            if (req.user.stores && req.user.stores.length > 0) {
                filter._id = { $in: req.user.stores };
            } else {
                // Si no tiene tiendas asignadas, devolvemos lista vacía
                return res.json([]);
            }
        }

        // 2. Si es ADMIN, el filtro se queda vacío {} y Store.find({}) 
        // traerá TODO el catálogo universal para poder asignar nuevas.
        const stores = await Store.find(filter).sort({ name: 1 });
        res.json(stores);
        
    } catch (err) { 
        console.error("Error en stores:", err);
        res.status(500).json({ error: "Error al cargar catálogo" }); 
    }
});





app.post("/stores", auth, async (req, res) => {
    try {
        // Creamos la tienda limpia, sin pegarla a una agencia o proyecto
        const newStore = new Store({ 
            ...req.body 
            // agencyId: req.user.agencyId <--- QUITAMOS ESTO
        });
        await newStore.save();
        res.json({ message: "Tienda añadida al catálogo global", store: newStore });
    } catch (err) { 
        res.status(500).json({ error: "Error al crear tienda" }); 
    }
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
app.get("/home", (req, res) => res.sendFile(path.resolve(__dirname, "public", "home.html")));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));

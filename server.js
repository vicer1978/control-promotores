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
        if (!email || !password) return res.status(400).json({ message: "Email y password requeridos" });

        const user = await User.findOne({ 
            email: email.trim().toLowerCase(), 
            password: password.trim() 
        });
        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
        res.json({ 
            userId: user._id, 
            role: user.role, 
            agencyId: user.agencyId, 
            name: user.name 
        });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// --- GESTIÓN DE PROYECTOS (MODIFICADO PARA MOSTRAR CLIENTE) ---
app.get("/projects", auth, async (req, res) => {
    try {
        // Agregamos .populate para traer el nombre del cliente desde la colección de Usuarios
        const projects = await Project.find({ agencyId: req.user.agencyId })
            .populate("clientId", "name") 
            .sort({ name: 1 });
        
        // Formateamos la respuesta para que el frontend reciba "clientName" directamente si existe
        const formattedProjects = projects.map(p => ({
            ...p._doc,
            clientName: p.clientId ? p.clientId.name : "Sin asignar"
        }));
        
        res.json(formattedProjects);
    } catch (err) { 
        console.error("Error al obtener proyectos:", err);
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
            clientId: clientId || null, // Aseguramos que se guarde el cliente seleccionado
            agencyId: req.user.agencyId
        });
        await newProject.save();
        res.json({ message: "Proyecto creado con éxito", project: newProject });
    } catch (err) { 
        console.error("Error al guardar proyecto:", err);
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

// --- ASISTENCIA (CHECKINS) ---
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
        res.status(500).json({ error: "Error al obtener historial" });
    }
});

app.post("/checkin", auth, upload.single("photo"), async (req, res) => {
    try {
        const { storeId, lat, lng, projectId } = req.body;
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
        res.json({ message: "Entrada registrada", checkin: newCheckin });
    } catch (err) {
        res.status(500).json({ error: "Error en checkin" });
    }
});

// --- GESTIÓN DE USUARIOS ---
app.get("/users", auth, async (req, res) => {
    try {
        const projectId = req.headers.projectid;
        const filter = { agencyId: req.user.agencyId };

        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            filter.projectId = projectId;
        }

        const users = await User.find(filter)
            .populate('stores')
            .sort({ name: 1 });
            
        res.json(users);
    } catch (err) { 
        console.error("Error al cargar usuarios:", err);
        res.status(500).json({ error: "Error al cargar usuarios" }); 
    }
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
        console.error("Error detallado al crear usuario:", err);
        res.status(500).json({ error: "No se pudo guardar el usuario", detalle: err.message }); 
    }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.email) updates.email = updates.email.toLowerCase().trim();
        delete updates.agencyId; 

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json({ message: "Usuario actualizado", user });
    } catch (err) { res.status(500).json({ error: "Error al actualizar" }); }
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
        const projectId = req.headers.projectid;
        const filter = { agencyId: req.user.agencyId };
        
        if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
            filter.projectId = projectId;
        }
        
        const stores = await Store.find(filter).sort({ name: 1 });
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

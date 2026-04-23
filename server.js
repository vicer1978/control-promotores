const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken"); // Nuevo: Para seguridad real
require("dotenv").config();

// Modelos
const User = require("./models/User");
const Store = require("./models/Store");
const Agency = require("./models/Agency");
const Report = require("./models/Report");
const Checkin = require("./models/Checkin");
const Project = require("./models/Project");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "tu_clave_secreta_super_segura";

// --- Middlewares ---
app.use(cors({ 
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
    allowedHeaders: ["Content-Type", "userId", "userid", "projectid", "Authorization"] 
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
    limits: { fileSize: 15 * 1024 * 1024 }, // Bajado a 15MB para optimizar
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

// --- AUTH MEJORADO ---
async function auth(req, res, next) {
    try {
        let userId;
        const authHeader = req.headers.authorization;

        // Intentamos por JWT primero
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
        } else {
            // Backup: Tu lógica original por headers para no romper nada hoy
            userId = req.headers.userid || req.headers.userId || req.headers.UserId;
        }
        
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ error: "Sesión inválida o expirada" });
        }
        
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario no existe" });
        
        req.user = user;
        next();
    } catch (err) { 
        res.status(401).json({ error: "Token inválido o error en auth" }); 
    }
}

// --- LOGIN CON JWT ---
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email y password requeridos" });

        const user = await User.findOne({ 
            email: email.trim().toLowerCase(), 
            password: password.trim() 
        }).populate('stores');

        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });

        // Generamos Token
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "30d" });

        res.json({ 
            token, // Nuevo: Envía esto al front
            userId: user._id, 
            role: user.role, 
            agencyId: user.agencyId, 
            name: user.name,
            projectId: user.projectId,
            stores: user.stores
        });
    } catch (err) { 
        console.error("Error en login:", err);
        res.status(500).json({ message: "Error en login" }); 
    }
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
    } catch (err) { res.status(500).json({ error: "Error al obtener proyectos" }); }
});

app.get("/client-projects", auth, async (req, res) => {
    try {
        const filter = { agencyId: req.user.agencyId, active: true };
        if (req.user.role.toLowerCase() === 'cliente') filter.clientId = req.user._id;
        const projects = await Project.find(filter).populate("clientId", "name").sort({ name: 1 }).lean();
        res.json(projects);
    } catch (err) { res.status(500).json({ error: "Error al cargar proyectos del cliente" }); }
});

app.post("/projects", auth, async (req, res) => {
    try {
        const { name, clientId } = req.body;
        if (!name) return res.status(400).json({ error: "El nombre es necesario" });

        const newProject = new Project({ ...req.body, clientId: clientId || null, agencyId: req.user.agencyId });
        await newProject.save();
        res.json({ message: "Proyecto creado", project: newProject });
    } catch (err) { res.status(500).json({ error: "Error al crear proyecto" }); }
});

app.put("/projects/:id", auth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const updateData = { ...req.body };

        // --- LIMPIEZA DE CLIENTE ---
        // Evita que IDs malformados o vacíos rompan el servidor
        if (!updateData.clientId || updateData.clientId === "null" || updateData.clientId === "") {
            updateData.clientId = null;
        } else if (!mongoose.Types.ObjectId.isValid(updateData.clientId)) {
            return res.status(400).json({ error: "ID de cliente inválido" });
        }

        // Actualizamos usando $set para seguridad
        const project = await Project.findByIdAndUpdate(
            projectId, 
            { $set: updateData }, 
            { new: true }
        ).populate("clientId", "name");

        if (!project) {
            return res.status(404).json({ error: "Proyecto no encontrado" });
        }

        res.json({ 
            message: "Proyecto actualizado con éxito", 
            project 
        });

    } catch (err) { 
        console.error("❌ ERROR CRÍTICO EN PUT /PROJECTS:", err);
        res.status(500).json({ 
            error: "Error al actualizar proyecto", 
            detalle: err.message 
        }); 
    }
});


app.delete("/projects/:id", auth, async (req, res) => {
    try {
        await Project.findByIdAndDelete(req.params.id);
        res.json({ message: "Proyecto eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});

// --- ASISTENCIA (CORREGIDA) ---
app.post("/checkin", auth, upload.single("photo"), async (req, res) => {
    try {
        const { storeId, lat, lng, projectId } = req.body;
        if (!storeId || lat === undefined) return res.status(400).json({ error: "Datos incompletos" });

        // 1. Buscamos el ÚLTIMO evento de asistencia del usuario
        const lastEvent = await Checkin.findOne({ 
            userId: req.user._id 
        }).sort({ timestamp: -1 }).lean();

        // 2. LÓGICA DE RE-ENTRADA:
        // Solo bloqueamos si el último evento fue un 'checkin' (es decir, no ha cerrado la visita anterior)
        if (lastEvent && lastEvent.type === "checkin") {
            return res.status(400).json({ 
                error: "Aún tienes una visita activa. Debes registrar salida antes de iniciar otra." 
            });
        }

        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        
        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || req.user.projectId,
            storeId,
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkin",
            foto_url: fotoUrl,
            timestamp: new Date()
        });
        await newCheckin.save();

        // Guardamos también en la tabla de reportes para el historial visual
        const checkinReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || req.user.projectId,
            storeId,
            reportType: "checkin", 
            photo: fotoUrl,        
            lat: Number(lat), lng: Number(lng)
        });
        await checkinReport.save();

        res.json({ message: "Entrada registrada correctamente", checkin: newCheckin });
    } catch (err) {
        console.error("ERROR EN CHECKIN:", err);
        res.status(500).json({ error: "Error al registrar entrada" });
    }
});


app.post("/checkout", auth, async (req, res) => {
    try {
        const { lat, lng, storeId, projectId } = req.body;
        
        // 1. Buscamos el último CHECKIN para heredar la tienda y proyecto correctos
        const lastCheckin = await Checkin.findOne({ 
            userId: req.user._id, 
            type: "checkin" 
        }).sort({ timestamp: -1 }).lean();
        
        // 2. Creamos el registro de asistencia
        const newCheckout = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || (lastCheckin?.projectId),
            storeId: storeId || (lastCheckin?.storeId),
            location: { lat: Number(lat), lng: Number(lng) },
            type: "checkout", 
            timestamp: new Date()
        });
        await newCheckout.save();

        // 3. Creamos el reporte de salida para el historial del Admin
        const checkoutReport = new Report({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            projectId: projectId || (lastCheckin?.projectId),
            storeId: storeId || (lastCheckin?.storeId),
            reportType: "checkout",
            lat: Number(lat) || 0, 
            lng: Number(lng) || 0,
            timestamp: new Date(),
            fecha: new Date().toISOString().split('T')[0]
        });
        await checkoutReport.save();

        res.json({ message: "Salida registrada con éxito" });
    } catch (err) { 
        console.error("❌ ERROR EN CHECKOUT:", err);
        res.status(500).json({ error: "Error al registrar la salida" }); 
    }
});


// --- REPORTES ---
app.get("/reports/agency/:agencyId", auth, async (req, res) => {
    try {
        const { agencyId } = req.params;
        const pid = req.headers.projectid;

        // Construimos la consulta de forma que MongoDB la reciba como texto puro
        let query = { 
            agencyId: { $eq: String(agencyId) } 
        };

        // Si hay proyecto, lo añadimos de la misma forma
        if (pid && pid !== "null" && pid !== "undefined" && pid !== "") {
            query.projectId = { $eq: String(pid) };
        }

        console.log("🔍 Buscando con Filtro Estricto de Texto:", JSON.stringify(query));

        // .lean() es vital aquí para que no intente transformar los resultados en modelos pesados
        const reports = await Report.find(query)
            .populate('userId', 'name role')
            .populate('storeId', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const formatted = reports.map(r => ({
            ...r,
            reporte: r.reportType || r.reporte || "Reporte"
        }));

        console.log(`📊 Respuesta enviada: ${formatted.length} reportes encontrados.`);
        res.json(formatted);

    } catch (err) {
        console.error("❌ Error fatal en reportes:", err);
        res.status(500).json([]);
    }
});




app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        // --- LOG DE SEGURIDAD ---
        console.log(`📝 Recibiendo reporte de: ${req.user.name} | Agencia del usuario: ${req.user.agencyId}`);

        const obs = req.body.observaciones || req.body.comentarios || "";
        let tipoReporte = req.body.reportType || req.body.reporte || "otro";

        // ... (tu lógica de normalización de tipoReporte se queda igual)

        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

        // ... (tu lógica de datosExtra se queda igual)

        const reportData = {
            userId: req.user._id,
            // ASEGURAMOS EL AGENCY ID: 
            // Si el usuario no lo tiene, intentamos tomarlo del body o le ponemos "SIN_AGENCIA" para identificarlo
            agencyId: req.user.agencyId || req.body.agencyId || "SIN_AGENCIA", 
            
            projectId: req.body.projectId || req.user.projectId,
            storeId: req.body.storeId,
            reportType: tipoReporte,
            photo: fotoUrl,
            foto_url: fotoUrl,
            articulo: req.body.articulo || "N/A",
            inv_inicial: Number(req.body.inv_inicial) || 0,
            ventas: Number(req.body.ventas) || 0, 
            cantidad: tipoReporte === "Degustación" ? (req.body.cantidad || "N/A") : (Number(req.body.cantidad) || 0),
            precio: Number(req.body.precio) || 0,
            observaciones: obs,
            lat: Number(req.body.lat) || 0,
            lng: Number(req.body.lng) || 0,
            datosExtra: datosExtra, 
            timestamp: new Date()
        };

        const report = new Report(reportData);
        await report.save();
        
        console.log(`✅ Reporte guardado con éxito. ID: ${report._id} | Agencia asignada: ${report.agencyId}`);
        res.json({ message: "Reporte guardado con éxito", id: report._id });

    } catch (err) { 
        console.error("❌ ERROR CRÍTICO EN /REPORTS:", err);
        res.status(500).json({ error: "Error al guardar reporte", detalle: err.message }); 
    }
});




// --- ACTUALIZAR REPORTE (NUEVA RUTA) ---
app.put("/reports/:id", auth, async (req, res) => {
    try {
        const reportId = req.params.id;
        const updates = req.body;

        // Si el reporte trae fecha, nos aseguramos de no romper el formato
        if (updates.fecha) {
            updates.fecha = new Date(updates.fecha).toISOString().split('T')[0];
        }

        // Buscamos y actualizamos
        const updatedReport = await Report.findByIdAndUpdate(
            reportId,
            { $set: updates },
            { new: true } // Para que devuelva el reporte ya modificado
        ).populate('userId', 'name').populate('storeId', 'name');

        if (!updatedReport) {
            return res.status(404).json({ error: "El reporte no existe" });
        }

        res.json({ 
            message: "Reporte actualizado con éxito", 
            report: updatedReport 
        });

    } catch (err) {
        console.error("❌ ERROR AL ACTUALIZAR REPORTE:", err);
        res.status(500).json({ error: "Error interno al guardar cambios" });
    }
});


app.get("/repair-database", async (req, res) => {
    try {
        const miAgencia = "69c5cb04f89a8be3b199a295"; // Tu ID de admin
        const result = await Report.updateMany(
            { $or: [{ agencyId: null }, { agencyId: "" }, { agencyId: "SIN_AGENCIA" }] },
            { $set: { agencyId: miAgencia } }
        );
        res.send(`🔧 Base de datos reparada: ${result.modifiedCount} reportes actualizados.`);
    } catch (e) {
        res.status(500).send("Error: " + e.message);
    }
});


// --- GESTIÓN DE USUARIOS ---
app.get("/users", auth, async (req, res) => {
    try {
        const filter = { agencyId: req.user.agencyId };
        const pid = req.headers.projectid;
        if (pid && mongoose.Types.ObjectId.isValid(pid)) filter.projectId = pid;

        const users = await User.find(filter).populate('stores').sort({ name: 1 }).lean();
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al cargar usuarios" }); }
});

app.post("/users", auth, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: "Faltan campos" });

        const newUser = new User({
            ...req.body,
            email: email.toLowerCase().trim(),
            agencyId: req.user.agencyId
        });
        await newUser.save();
        res.json({ message: "Usuario creado", user: newUser });
    } catch (err) { res.status(500).json({ error: "Error al guardar usuario" }); }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        const userId = req.params.id;
        const updateData = { ...req.body };

        // Limpieza de Email
        if (updateData.email) updateData.email = updateData.email.toLowerCase().trim();

        // Limpieza de projectId (Igual que en proyectos)
        if (!updateData.projectId || updateData.projectId === "null" || updateData.projectId === "") {
            updateData.projectId = null;
        } else if (!mongoose.Types.ObjectId.isValid(updateData.projectId)) {
            return res.status(400).json({ error: "ID de proyecto inválido" });
        }

        const user = await User.findByIdAndUpdate(
            userId, 
            { $set: updateData }, 
            { new: true }
        ).populate('stores');

        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        res.json({ message: "Usuario actualizado con éxito", user });
    } catch (err) {
        console.error("❌ ERROR AL ACTUALIZAR USUARIO:", err);
        res.status(500).json({ error: "Error interno al guardar cambios", detalle: err.message });
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
        if (req.user.role.includes('admin')) {
            const allStores = await Store.find({}).sort({ name: 1 }).lean();
            return res.json(allStores);
        }
        const stores = await Store.find({ _id: { $in: req.user.stores || [] } }).sort({ name: 1 }).lean();
        res.json(stores);
    } catch (err) { res.json([]); }
});

app.post("/stores", auth, async (req, res) => {
    try {
        const newStore = new Store({ ...req.body });
        await newStore.save();
        res.json({ message: "Tienda añadida", store: newStore });
    } catch (err) { res.status(500).json({ error: "Error al crear tienda" }); }
});

app.delete("/stores/:id", auth, async (req, res) => {
    try {
        await Store.findByIdAndDelete(req.params.id);
        res.json({ message: "Tienda eliminada" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar tienda" }); }
});

// --- NAVEGACIÓN ---
app.get("/admin", (req, res) => res.sendFile(path.resolve(__dirname, "public", "Admin", "admin.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.resolve(__dirname, "public", "dashboard.html")));
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

app.get(/.*/, (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));

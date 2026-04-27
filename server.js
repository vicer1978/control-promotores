const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken"); // Nuevo: Para seguridad real
require("dotenv").config();
const XLSX = require('xlsx');



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

        // Filtro base por Agencia
        let query = { agencyId: agencyId };

        // SOLO filtrar por proyecto si el ID es válido y no es "null" string
        if (pid && pid !== "null" && pid !== "" && mongoose.Types.ObjectId.isValid(pid)) {
            query.projectId = pid;
        }

        const reports = await Report.find(query)
            .populate("userId", "name")
            .populate("storeId", "name")
            .sort({ createdAt: -1 })
            .limit(400)
            .lean();

        // Formateo para que el Admin no falle si faltan nombres
        const formatted = reports.map(r => ({
            ...r,
            userName: r.userId?.name || "S/N",
            storeName: r.storeId?.name || "S/T",
            reporte: r.reportType || r.reporte || "Reporte"
        }));

     console.log(`✅ Tabla lista con ${formatted.length} reportes formateados.`);
        res.json(formatted);


    
    } catch (err) {
        console.error("❌ Error en reportes:", err);
        res.status(500).json([]);
    }
});





app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        // --- 1. IDENTIFICACIÓN Y PREPARACIÓN ---
        console.log(`📝 Recibiendo reporte de: ${req.user.name} | Agencia: ${req.user.agencyId}`);
        
        // DECLARACIÓN INICIAL: Evita el ReferenceError
        let datosExtra = {}; 

        // --- 2. PROCESAMIENTO DINÁMICO (SaaS Ready) ---
        if (req.body.datosExtra) {
            try {
                datosExtra = typeof req.body.datosExtra === 'string' 
                    ? JSON.parse(req.body.datosExtra) 
                    : req.body.datosExtra;
            } catch (e) {
                // Si no es JSON válido, lo guardamos como texto para no perder la info
                datosExtra = { contenido_crudo: req.body.datosExtra };
            }
        }

        // --- 3. NORMALIZACIÓN Y LIMPIEZA DE LÓGICA (CORREGIDA) ---
const obs = req.body.observaciones || req.body.comentarios || "";
let tipoReporte = req.body.reportType || req.body.reporte || "otro";
const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

let vtas = 0;
let inv_i = 0;
let inv_f = 0;
let resurtido = Number(req.body.resurtido) || 0;
const tipoBajo = tipoReporte.toLowerCase();

// Lógica de limpieza por tipo de flujo
if (tipoBajo.includes('venta') || tipoBajo.includes('degustacion') || tipoBajo.includes('ranking')) {
    // FLUJO VENTAS / DEMOSTRADORA: Prioridad absoluta al dato de movimiento
    vtas = Number(req.body.ventas) || Number(req.body.cantidad) || 0;
    inv_i = 0; 
    inv_f = 0;
} else if (tipoBajo.includes('inventario') || tipoBajo.includes('agotado')) {
    // FLUJO PROMOTOR: Prioridad a stock
    inv_i = Number(req.body.inv_inicial) || Number(req.body.stock_inicial) || 0;
    inv_f = Number(req.body.inv_final) || (inv_i + resurtido);
    vtas = 0;
} else {
    // Otros (Precios, Competencia, etc.)
    vtas = Number(req.body.ventas) || Number(req.body.cantidad) || 0;
    inv_i = Number(req.body.inv_inicial) || 0;
}

// --- 4. ENSAMBLAJE FINAL DEL REPORTE ---
const reportData = {
    userId: req.user._id,
    agencyId: req.user.agencyId || "SIN_AGENCIA", 
    projectId: req.body.projectId || req.user.projectId,
    storeId: req.body.storeId,
    reportType: tipoReporte,
    photo: fotoUrl,
    foto_url: fotoUrl,
    
    // Si es pre-agotado, capturamos el booleano correctamente
    pre_agotados: req.body.pre_agotados === 'true' || req.body.pre_agotados === true || req.body.pre_agotados === "1",

    articulo: req.body.articulo || "N/A",
    inv_inicial: inv_i,
    resurtido: resurtido,
    ventas: vtas, 
    inv_final: inv_f,
    
    // Aseguramos que 'cantidad' siempre tenga el valor de ventas para el Admin
    cantidad: vtas > 0 ? vtas : (req.body.cantidad || 0),

    precio: Number(req.body.precio) || Number(req.body.precio_normal) || 0,
    precio_normal: Number(req.body.precio_normal) || Number(req.body.precio) || 0,
    precio_oferta: Number(req.body.precio_oferta) || 0,
    
    observaciones: obs,
    lat: Number(req.body.lat) || 0,
    lng: Number(req.body.lng) || 0,
    datosExtra: datosExtra, 
    timestamp: new Date()
};





        const report = new Report(reportData);
        await report.save();
        
        console.log(`✅ ÉXITO: Reporte ${report._id} guardado para Agencia: ${report.agencyId}`);
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


// ==========================================
// --- RUTAS EXCLUSIVAS SUPER ADMIN ---
// ==========================================

// 1. Obtener todas las agencias
app.get("/super/agencies", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const agencies = await Agency.find({}).sort({ name: 1 }).lean();
        res.json(agencies);
    } catch (err) { res.status(500).json({ error: "Error al obtener agencias" }); }
});

// 2. Crear nueva agencia y su Admin
app.post("/super/agencies", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) return res.status(400).json({ error: "Email ya registrado" });
        
        const newAgency = new Agency({ name, email: email.toLowerCase().trim(), password, isActive: true });
        await newAgency.save();

        const adminUser = new User({
            name: `${name} Admin`,
            email: email.toLowerCase().trim(),
            password: password.trim(),
            role: "Admin",
            agencyId: newAgency._id 
        });
        await adminUser.save();
        res.json({ message: "Agencia y Admin creados", agency: newAgency });
    } catch (err) { res.status(500).json({ error: "Error al crear agencia" }); }
});

// 3. Editar datos básicos de Agencia
app.put("/super/agencies/:id", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const { name, email, password } = req.body;
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email.toLowerCase().trim();
        if (password) updateData.password = password.trim();

        const agency = await Agency.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        res.json({ message: "Agencia actualizada", agency });
    } catch (err) { res.status(500).json({ error: "Error al actualizar" }); }
});

// 4. Cambiar estatus Activa/Pausada
app.put("/super/agencies/:id/status", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        await Agency.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive });
        res.json({ message: "Estatus actualizado" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// 5. Eliminar agencia
app.delete("/super/agencies/:id", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        await Agency.findByIdAndDelete(req.params.id);
        res.json({ message: "Agencia eliminada" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});



// --- CARGA MASIVA DE TIENDAS (SOLO SUPER ADMIN) ---
app.post("/stores/bulk-upload", auth, upload.single("excelFile"), async (req, res) => {
    try {
        if (req.user.role !== "super-admin") {
            return res.status(403).json({ error: "No autorizado" });
        }

        if (!req.file) return res.status(400).json({ error: "No se subió archivo" });

        const workbook = XLSX.readFile(req.file.path);
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        // --- EL BLOQUE MEJORADO ---
        const storesToInsert = data.map(row => {
            const nombre = row.Nombre || row.nombre || row.STORE || row.Tienda || row.Name;
            const estado = row.Estado || row.estado || row.ENTIDAD || row.State || "Ciudad de México";
            const direccion = row.Direccion || row.direccion || row.Dirección || row.ADDRESS || "";

            return {
                name: nombre ? nombre.toString().trim() : "Tienda Sin Nombre",
                address: direccion.toString().trim(),
                state: estado.toString().trim(),
                isGlobal: true,
                agencyId: null,
                isActive: true
            };
        }).filter(s => s.name !== "Tienda Sin Nombre" && s.name !== ""); 

        if (storesToInsert.length === 0) {
            return res.status(400).json({ error: "No se encontraron tiendas válidas en el archivo" });
        }

        const result = await Store.insertMany(storesToInsert);

        // Opcional: Borrar el archivo temporal de Excel después de procesarlo
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        res.json({ message: "Carga exitosa", count: result.length });

    } catch (err) {
        console.error("❌ Error en carga masiva:", err);
        res.status(500).json({ error: "Error al procesar Excel", detalle: err.message });
    }
});


// --- LISTADO DE TIENDAS PARA SUPER ADMIN (OPCIONAL) ---
// Útil para que el Super Admin vea el catálogo maestro sin filtros de agencia
app.get("/super/stores", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const stores = await Store.find({ isGlobal: true }).sort({ state: 1, name: 1 }).lean();
        res.json(stores);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener catálogo" });
    }
});




// ==========================================
// --- GESTIÓN DE USUARIOS GLOBALES (MARKETPLACE) ---
// ==========================================

// 1. Obtener todos los usuarios del sistema
app.get("/super/users", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const users = await User.find({}).populate("agencyId", "name").lean();
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios" }); }
});

// 2. Crear usuario desde cero
app.post("/super/users", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const { name, email, password, role, agencyId } = req.body;
        const newUser = new User({
            name,
            email: email.toLowerCase().trim(),
            password,
            role: role || "promotor",
            agencyId: agencyId || null
        });
        await newUser.save();
        res.json({ message: "Usuario creado con éxito", user: newUser });
    } catch (err) { res.status(500).json({ error: "Error al crear" }); }
});

// 3. Editar datos personales (Modal Editar)
app.put("/super/users/:id", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const { name, email, role, password } = req.body;
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email.toLowerCase().trim();
        if (role) updateData.role = role;
        if (password && password.trim() !== "") updateData.password = password.trim();

        const user = await User.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        res.json({ message: "Usuario actualizado", user });
    } catch (err) { res.status(500).json({ error: "Error al editar" }); }
});

// 4. Asignar/Mover a otra Agencia (Selector Tabla)
app.put("/super/users/:id/assign", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        let { agencyId } = req.body;
        if (!agencyId || agencyId === "" || agencyId === "null") agencyId = null;

        const user = await User.findByIdAndUpdate(req.params.id, { $set: { agencyId } }, { new: true });
        res.json({ message: "Agencia asignada", user });
    } catch (err) { res.status(500).json({ error: "Error en asignación" }); }
});

// 5. Eliminar usuario global
app.delete("/super/users/:id", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Usuario eliminado del sistema" });
    } catch (err) { res.status(500).json({ error: "Error al borrar" }); }
});


// ==========================================
// --- GESTIÓN DE USUARIOS DE AGENCIA ---
// ==========================================

app.get("/users", auth, async (req, res) => {
    try {
        // Solo usuarios de la agencia del admin logueado
        const filter = { agencyId: req.user.agencyId };
        
        // Filtro por proyecto si viene en el header
        const pid = req.headers.projectid;
        if (pid && mongoose.Types.ObjectId.isValid(pid)) {
            filter.projectId = pid;
        }

        const users = await User.find(filter).populate('stores').sort({ name: 1 }).lean();
        res.json(users);
    } catch (err) { 
        console.error("Error al cargar usuarios de agencia:", err);
        res.status(500).json({ error: "Error al cargar usuarios" }); 
    }
});

app.post("/users", auth, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: "Faltan campos obligatorios" });

        const newUser = new User({
            ...req.body,
            email: email.toLowerCase().trim(),
            agencyId: req.user.agencyId // Se vincula automáticamente a la agencia del Admin
        });
        await newUser.save();
        res.json({ message: "Usuario creado con éxito", user: newUser });
    } catch (err) { 
        console.error("Error al crear usuario de agencia:", err);
        res.status(500).json({ error: "Error al guardar usuario" }); 
    }
});

app.put("/users/:id", auth, async (req, res) => {
    try {
        const userId = req.params.id;
        const updateData = { ...req.body };

        if (updateData.email) updateData.email = updateData.email.toLowerCase().trim();

        // Validar que el admin solo edite usuarios de SU agencia
        const user = await User.findOneAndUpdate(
            { _id: userId, agencyId: req.user.agencyId },
            { $set: updateData },
            { new: true }
        ).populate('stores');

        if (!user) return res.status(404).json({ error: "Usuario no encontrado o no pertenece a tu agencia" });

        res.json({ message: "Usuario actualizado", user });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar usuario" });
    }
});

// --- RUTA DE ASISTENCIA PARA AGENCIA ---
app.get("/attendance", auth, async (req, res) => {
    try {
        const filter = { agencyId: req.user.agencyId };
        const pid = req.headers.projectid;
        if (pid && mongoose.Types.ObjectId.isValid(pid)) filter.projectId = pid;

        const attendance = await Checkin.find(filter)
            .populate("userId", "name")
            .populate("storeId", "name")
            .sort({ timestamp: -1 })
            .limit(1000)
            .lean();
        res.json(attendance);
    } catch (err) { 
        res.status(500).json({ error: "Error al cargar asistencia" }); 
    }
});

app.delete("/users/:id", auth, async (req, res) => {
    try {
        // Solo puede borrar si es de su agencia
        const result = await User.deleteOne({ _id: req.params.id, agencyId: req.user.agencyId });
        if (result.deletedCount === 0) return res.status(404).json({ error: "No encontrado" });
        res.json({ message: "Usuario eliminado" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar" }); }
});


app.get("/reports", auth, async (req, res) => {
    try {
        const agencyId = req.user.agencyId;
        
        if (!agencyId) {
            return res.status(400).json({ error: "El usuario no tiene una agencia vinculada" });
        }
        
        // Redirigimos a la ruta que ya tienes programada y que funciona
        // Esto es mucho más estable que intentar manejar el router manualmente
        res.redirect(`/reports/agency/${agencyId}`);
        
    } catch (err) { 
        console.error("Error en redirección de reportes:", err);
        res.status(500).json({ error: "Error interno al procesar reportes" }); 
    }
});





// --- GESTIÓN DE TIENDAS ---
app.get("/stores", auth, async (req, res) => {
    try {
        // 1. Si es Admin o Super-Admin: Ve las globales + las de su agencia
        if (req.user.role.includes('admin')) {
            const query = {
                $or: [
                    { agencyId: null }, // Globales
                    { agencyId: req.user.agencyId } // De su agencia
                ]
            };
            const stores = await Store.find(query).sort({ name: 1 }).lean();
            return res.json(stores);
        }

        // 2. Si es Promotor/Demostradora: Solo ve las que tiene asignadas
        // (Pero permitimos que vea las globales si están en su lista de IDs)
        const stores = await Store.find({ 
            _id: { $in: req.user.stores || [] } 
        }).sort({ name: 1 }).lean();
        
        res.json(stores);

    } catch (err) { 
        console.error("Error en /stores:", err);
        res.json([]); 
    }
});


app.post("/stores", auth, async (req, res) => {
    try {
        const storeData = { ...req.body };
        
        if (req.user.role === "super-admin") {
            storeData.isGlobal = true;  // Forzamos que sea del catálogo maestro
            storeData.agencyId = null;  // No pertenece a ninguna agencia en particular
        } else {
            storeData.agencyId = req.user.agencyId;
            storeData.isGlobal = false;
        }

        const newStore = new Store(storeData);
        await newStore.save();
        res.json({ message: "Tienda añadida con éxito", store: newStore });
    } catch (err) { 
        res.status(500).json({ error: "No se pudo guardar la tienda" }); 
    }
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
app.get("/login", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

// Solo carga login si entran a la raíz
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "public", "login.html")));

// Opcional: Manejo de 404 para archivos no encontrados
app.use((req, res) => {
    res.status(404).send("Página no encontrada en StorePulse");
});


// Manejador de errores global para Multer y otros
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "La imagen es muy pesada (máx 15MB)" });
        }
    }
    res.status(500).json({ error: err.message || "Error interno del servidor" });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT}`));

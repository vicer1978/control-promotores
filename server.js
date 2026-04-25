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

        // 1. Preparamos IDs (Texto y Objeto)
        let idsParaBuscar = [String(agencyId)];
        try { idsParaBuscar.push(new mongoose.Types.ObjectId(agencyId)); } catch(e) {}

        let query = { agencyId: { $in: idsParaBuscar } };

        // 2. Filtro de Proyecto si existe
        if (pid && pid !== "null" && pid !== "undefined" && String(pid).trim() !== "") {
            let pIds = [String(pid)];
            try { pIds.push(new mongoose.Types.ObjectId(pid)); } catch(e) {}
            query.projectId = { $in: pIds };
        }

        // 3. Consulta Nativa (La que funcionó)
        const reportsRaw = await Report.collection.find(query)
            .sort({ createdAt: -1 })
            .limit(200) // Subimos el límite para que veas más datos
            .toArray();

        // 4. RECUPERAR NOMBRES (Manual Populate)
        // Traemos todos los usuarios y tiendas de una vez para no saturar la DB
        const [users, stores] = await Promise.all([
            User.find({ agencyId: agencyId }, "name").lean(),
            Store.find({}, "name").lean()
        ]);

        // Creamos "diccionarios" para buscar rápido
        const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u.name]));
        const storeMap = Object.fromEntries(stores.map(s => [s._id.toString(), s.name]));

        // 5. Formateamos para el Admin
        const formatted = reportsRaw.map(r => {
            const uId = r.userId ? r.userId.toString() : "";
            const sId = r.storeId ? r.storeId.toString() : "";
            
            return {
                ...r,
                _id: r._id.toString(),
                // Si el nombre no existe, ponemos el ID o "N/A"
                userName: userMap[uId] || "Usuario Desconocido",
                storeName: storeMap[sId] || "Tienda no registrada",
                // Mapeamos para que tu frontend lea 'userId.name' si es necesario
                userId: { _id: uId, name: userMap[uId] || "N/A" },
                storeId: { _id: sId, name: storeMap[sId] || "N/A" },
                reporte: r.reportType || r.reporte || "Reporte"
            };
        });

        console.log(`✅ Tabla lista con ${formatted.length} reportes formateados.`);
        res.json(formatted);

    } catch (err) {
        console.error("❌ Error en formato final:", err);
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

        // --- 3. NORMALIZACIÓN DE CAMPOS ---
        const obs = req.body.observaciones || req.body.comentarios || "";
        let tipoReporte = req.body.reportType || req.body.reporte || "otro";
        const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

                // --- 4. ENSAMBLAJE DEL REPORTE (VERSION CORREGIDA) ---
                const reportData = {
            userId: req.user._id,
            agencyId: req.user.agencyId || req.body.agencyId || "SIN_AGENCIA", 
            projectId: req.body.projectId || req.user.projectId,
            storeId: req.body.storeId,
            reportType: tipoReporte,
            photo: fotoUrl,
            foto_url: fotoUrl,
            
            // --- INVENTARIO Y VENTAS ---
            articulo: req.body.articulo || "N/A",
            inv_inicial: Number(req.body.inv_inicial) || Number(req.body.stock_inicial) || 0,
            resurtido: Number(req.body.resurtido) || 0,
            ventas: Number(req.body.ventas) || 0, 
            inv_final: Number(req.body.inv_final) || 
                       ((Number(req.body.inv_inicial) || 0) + (Number(req.body.resurtido) || 0) - (Number(req.body.ventas) || 0)),

            // --- CANTIDAD (Soporte para Degustación y Ventas) ---
            cantidad: tipoReporte === "Degustación" ? (req.body.cantidad || "N/A") : (Number(req.body.cantidad) || 0),

            // --- SECCIÓN DE PRECIOS (CORREGIDA) ---
            // Esto asegura que si la App manda 'precio_normal', no se guarde un 0
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

// 1. Obtener todas las agencias (Ecosistema)
app.get("/super/agencies", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const agencies = await Agency.find({}).sort({ name: 1 }).lean();
        res.json(agencies);
    } catch (err) { res.status(500).json({ error: "Error al obtener agencias" }); }
});

// 2. Crear nueva agencia
app.post("/super/agencies", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        
        const { name, email, password } = req.body;

        // Validar si el usuario ya existe antes de crear la agencia
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(400).json({ error: "Este email ya está registrado como usuario" });
        }
        
        // 1. Crear la Agencia
        const newAgency = new Agency({ 
            name, 
            email: email.toLowerCase().trim(), 
            password,
            isActive: true 
        });
        await newAgency.save();

        // 2. Crear el Usuario Admin vinculado
        const adminUser = new User({
            name: `${name} Admin`,
            email: email.toLowerCase().trim(),
            password: password.trim(),
            role: "Admin",
            agencyId: newAgency._id 
        });
        await adminUser.save();

        res.json({ 
            message: "Agencia y Usuario Admin creados con éxito", 
            agency: newAgency,
            user: adminUser 
        });

    } catch (err) { 
        console.error("❌ Error en registro de agencia:", err);
        res.status(500).json({ error: "Error interno", detalle: err.message }); 
    }
});



// 3. Cambiar estatus de agencia (Activar/Desactivar)
app.put("/super/agencies/:id/status", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        await Agency.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive });
        res.json({ message: "Estatus actualizado" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// 4. Obtener TODOS los usuarios del sistema (Para contadores y gestión global)
app.get("/super/users", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        // Traemos usuarios con su agencia vinculada
        const users = await User.find({}).populate("agencyId", "name").lean();
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Error al obtener usuarios globales" }); }
});

// 5. Asignar usuario a agencia (Marketplace laboral)
app.put("/super/users/:id/assign", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        const { agencyId } = req.body;
        await User.findByIdAndUpdate(req.params.id, { agencyId: agencyId || null });
        res.json({ message: "Usuario asignado a agencia" });
    } catch (err) { res.status(500).json({ error: "Error en asignación" }); }
});

// 6. Eliminar agencia
app.delete("/super/agencies/:id", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        await Agency.findByIdAndDelete(req.params.id);
        res.json({ message: "Agencia eliminada" });
    } catch (err) { res.status(500).json({ error: "Error al eliminar agencia" }); }
});


// Editar datos de una agencia (Nombre, Email o Password)
app.put("/super/agencies/:id", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        
        const { name, email, password } = req.body;
        const updateData = {};
        
        if (name) updateData.name = name;
        if (email) updateData.email = email.toLowerCase().trim();
        if (password) updateData.password = password.trim();

        const agency = await Agency.findByIdAndUpdate(
            req.params.id, 
            { $set: updateData }, 
            { new: true }
        );

        if (!agency) return res.status(404).json({ error: "Agencia no encontrada" });
        
        res.json({ message: "Agencia actualizada con éxito", agency });
    } catch (err) {
        res.status(500).json({ error: "Error al actualizar la agencia" });
    }
});



// --- GESTIÓN DE USUARIOS ---

// Crear usuario desde el panel de Super Admin
app.post("/super/users", auth, async (req, res) => {
    try {
        if (req.user.role !== "super-admin") return res.status(403).json({ error: "No autorizado" });
        
        const { name, email, password, role, agencyId } = req.body;
        
        const newUser = new User({
            name,
            email: email.toLowerCase().trim(),
            password,
            role: role || "promotor",
            agencyId: agencyId || null // Puede crearse sin agencia y asignarse luego
        });

        await newUser.save();
        res.json({ message: "Usuario global creado con éxito", user: newUser });
    } catch (err) {
        console.error("Error en super/users POST:", err);
        res.status(500).json({ error: "Error al crear usuario", detalle: err.message });
    }
});



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


// AGREGAR ESTA RUTA A TU SERVER.JS
app.put("/super/users/:id", auth, async (req, res) => {
    try {
        // 1. Validar que sea Super Admin
        if (req.user.role !== "super-admin") {
            return res.status(403).json({ error: "No autorizado" });
        }
        
        const userIdToEdit = req.params.id;
        const { name, email, role, password } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email.toLowerCase().trim();
        if (role) updateData.role = role;
        
        // Si el password no viene vacío, lo actualizamos directamente
        // (Nota: Si usas bcrypt para encriptar, aquí deberías hashearla antes)
        if (password && password.trim() !== "") {
            updateData.password = password.trim();
        }

        const user = await User.findByIdAndUpdate(
            userIdToEdit, 
            { $set: updateData }, 
            { new: true }
        );

        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

        res.json({ message: "Usuario actualizado con éxito por Super Admin", user });
    } catch (err) {
        console.error("❌ ERROR EN /SUPER/USERS PUT:", err);
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

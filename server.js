// server.js – StorePulse PRO MAX SAAS 🔐 FINAL ACTUALIZADO
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

// MODELOS
const User = require("./models/User");
const Store = require("./models/Store");
const Agency = require("./models/Agency");
const Checkin = require("./models/Checkin");
const Report = require("./models/Report");

const app = express();

// =====================================================
// 🔹 MIDDLEWARE & CONFIGURACIÓN
// =====================================================
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "userId"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configuración de Almacenamiento para Fotos (Check-ins y Reportes)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// =====================================================
// 🔹 CONEXIÓN MONGO
// =====================================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => {
        console.error("❌ Error Mongo:", err.message);
        process.exit(1);
    });

// =====================================================
// 🔹 AUTH MIDDLEWARES
// =====================================================
async function auth(req, res, next) {
    try {
        const userId = req.headers.userid;
        if (!userId) return res.status(401).json({ error: "No autorizado" });
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario inválido" });
        req.user = user;
        next();
    } catch (err) {
        res.status(500).json({ error: "Error auth" });
    }
}

function onlyAdmin(req, res, next) {
    if (req.user.role !== "admin" && req.user.role !== "superadmin")
        return res.status(403).json({ error: "Acceso denegado" });
    next();
}

function onlySuper(req, res, next) {
    if (req.user.role !== "superadmin") return res.status(403).json({ error: "Solo superadmin" });
    next();
}

// =====================================================
// 🔹 LOGIN & REGISTRO
// =====================================================
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({
            email: email.trim().toLowerCase(),
            password: password.trim()
        });

        if (!user) return res.status(404).json({ message: "Usuario o contraseña incorrectos" });

        // Enviamos nombre y rol para que el frontend sepa qué mostrar
        res.json({
            userId: user._id,
            role: user.role,
            agencyId: user.agencyId,
            name: user.name 
        });
    } catch (err) {
        res.status(500).json({ error: "Error login" });
    }
});

app.post("/register", async (req, res) => {
    try {
        let { name, email, password, role } = req.body;
        email = email.trim().toLowerCase();
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: "Email ya registrado" });

        const user = new User({ name, email, password, role: role || "promotor" });
        await user.save();
        res.json({ message: "Usuario registrado" });
    } catch (err) {
        res.status(500).json({ error: "Error registro" });
    }
});

// =====================================================
// 🔹 USUARIOS & TIENDAS (API)
// =====================================================
app.get("/users/:id/stores", auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate("stores");
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        res.json(user.stores || []);
    } catch (err) {
        res.status(500).json({ error: "Error obteniendo tiendas" });
    }
});

app.get("/stores", auth, async (req, res) => {
    const stores = await Store.find().populate("agencyId");
    res.json(stores);
});

// =====================================================
// 🔹 LÓGICA DE CHECK-IN (GEOCERCA)
// =====================================================
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
}

app.post("/checkin", upload.single("photo"), async (req, res) => {
    try {
        const { userId, storeId, lat, lng } = req.body;
        const user = await User.findById(userId);
        const store = await Store.findById(storeId);

        if (!user || !store) return res.status(404).json({ error: "Datos inválidos" });

        const distancia = calcularDistancia(lat, lng, store.lat, store.lng);

        // Umbral de 120 metros para permitir el check-in
        if (distancia > 120) {
            return res.status(400).json({ error: "Fuera de rango", distancia: Math.round(distancia) });
        }

        await Checkin.create({
            userId,
            storeId,
            agencyId: user.agencyId,
            lat,
            lng,
            photo: req.file ? req.file.filename : null,
            date: new Date()
        });

        res.json({ message: "Check-in exitoso" });
    } catch (err) {
        res.status(500).json({ error: "Error en el servidor durante check-in" });
    }
});

// =====================================================
// 🔹 REPORTES DINÁMICOS (Soporta Fotos y Datos)
// =====================================================
app.post("/reports", auth, upload.single("photo"), async (req, res) => {
    try {
        const { storeId, type, articulo, cantidad, precio, inv_inicial, inv_final, comentarios } = req.body;

        // Construimos el objeto de datos basado en lo que llegue del formulario
        const reportData = {
            articulo,
            cantidad: cantidad ? Number(cantidad) : undefined,
            precio: precio ? Number(precio) : undefined,
            inv_inicial: inv_inicial ? Number(inv_inicial) : undefined,
            inv_final: inv_final ? Number(inv_final) : undefined,
            comentarios,
            foto_url: req.file ? req.file.filename : null
        };

        const report = new Report({
            userId: req.user._id,
            storeId,
            agencyId: req.user.agencyId,
            role: req.user.role,
            type,
            data: reportData,
            date: new Date()
        });

        await report.save();
        res.json({ message: "Reporte guardado correctamente" });

    } catch (err) {
        console.error("Error al guardar reporte:", err);
        res.status(500).json({ error: "Error al guardar el reporte" });
    }
});

// Obtener reportes para el Admin
app.get("/reports/agency/:agencyId", auth, onlyAdmin, async (req, res) => {
    try {
        const reports = await Report.find({ agencyId: req.params.agencyId })
            .populate("userId", "name")
            .populate("storeId", "name")
            .sort({ date: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener reportes" });
    }
});

// =====================================================
// 🔹 INICIO DEL SERVIDOR
// =====================================================
app.use((req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

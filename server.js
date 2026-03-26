const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const User = require("./models/User");
const Store = require("./models/Store");
const Agency = require("./models/Agency");
const Report = require("./models/Report");
const Checkin = require("./models/Checkin");

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], allowedHeaders: ["Content-Type", "userId"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Para procesar formularios si es necesario

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB conectado"))
    .catch(err => console.error("❌ Error DB:", err));

async function auth(req, res, next) {
    try {
        const userId = req.headers.userid || req.headers.userId; 
        if (!userId) return res.status(401).json({ error: "No autorizado" });
        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ error: "Usuario inválido" });
        req.user = user;
        next();
    } catch (err) { res.status(500).json({ error: "Error auth" }); }
}

// --- NUEVA RUTA: OBTENER TIENDAS DEL USUARIO (O AGENCIA) ---
app.get("/users/:userId/stores", auth, async (req, res) => {
    try {
        // Buscamos las tiendas que pertenecen a la misma agencia que el usuario
        const stores = await Store.find({ agencyId: req.user.agencyId });
        res.json(stores);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener tiendas" });
    }
});

// --- NUEVA RUTA: PROCESAR CHECK-IN ---
app.post("/checkin", auth, upload.none(), async (req, res) => {
    try {
        const { storeId, lat, lng } = req.body;
        
        // Aquí podrías añadir lógica de validación de distancia (geofencing)
        const newCheckin = new Checkin({
            userId: req.user._id,
            agencyId: req.user.agencyId,
            storeId,
            location: { lat, lng },
            date: new Date()
        });

        await newCheckin.save();
        res.json({ message: "Check-in exitoso" });
    } catch (err) {
        res.status(500).json({ error: "Error en el servidor durante check-in" });
    }
});

// --- RUTAS DE ADMINISTRACIÓN ---
app.get("/agencies", auth, async (req, res) => {
    const agencies = await Agency.find();
    res.json(agencies);
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase(), password: password.trim() });
        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
        res.json({ userId: user._id, role: user.role, agencyId: user.agencyId, name: user.name });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// Comodín para SPA (Dejar al final)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Puerto ${PORT}`));

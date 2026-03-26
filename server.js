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

// Middleware Global
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], allowedHeaders: ["Content-Type", "userId"] }));
app.use(express.json());

// Servir archivos estáticos
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

// Middleware de Auth
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

// --- RUTAS DE API ---
app.get("/agencies", auth, async (req, res) => {
    const agencies = await Agency.find();
    res.json(agencies);
});

app.post("/agencies", auth, async (req, res) => {
    const agency = new Agency(req.body);
    await agency.save();
    res.json(agency);
});

app.patch("/agencies/:id", auth, async (req, res) => {
    const agency = await Agency.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(agency);
});

app.delete("/agencies/:id", auth, async (req, res) => {
    const agencyId = req.params.id;
    await Report.deleteMany({ agencyId });
    await User.deleteMany({ agencyId });
    await Store.deleteMany({ agencyId });
    await Checkin.deleteMany({ agencyId });
    await Agency.findByIdAndDelete(agencyId);
    res.json({ message: "Agencia eliminada." });
});

app.get("/users", auth, async (req, res) => {
    const users = await User.find().populate("agencyId", "name");
    res.json(users);
});

app.get("/users/count", auth, async (req, res) => {
    const count = await User.countDocuments();
    res.json({ count });
});

app.delete("/users/:id", auth, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuario eliminado" });
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase(), password: password.trim() });
        if (!user) return res.status(404).json({ message: "Credenciales incorrectas" });
        res.json({ userId: user._id, role: user.role, agencyId: user.agencyId, name: user.name });
    } catch (err) { res.status(500).json({ message: "Error en login" }); }
});

// --- REDIRECCIÓN FINAL (Cualquier ruta no encontrada va al Login) ---
app.get('/*', (req, res) => {
    res.sendFile(path.resolve(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Puerto ${PORT}`));

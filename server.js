// server.js

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const User = require("./models/User");
const Store = require("./models/Store");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Servir archivos estáticos

// Puerto
const PORT = process.env.PORT || 3000;

// Conexión a MongoDB Atlas
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("❌ ERROR: No se encontró la variable de entorno MONGO_URI");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ ERROR al conectar MongoDB:", err);
    process.exit(1);
  });

// Configuración de multer para subir fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// -------------------- RUTAS DE API --------------------

// Registro de usuarios
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = new User({ name, email, password });
    await user.save();
    res.json({ message: "Usuario registrado correctamente" });
  } catch (error) {
    console.error("Error en /register:", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ message: "Login correcto", role: user.role, userId: user._id });
  } catch (error) {
    console.error("Error en /login:", error);
    res.status(500).json({ error: "Error al hacer login" });
  }
});

// Obtener todos los usuarios
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    console.error("Error en /users:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// Crear tienda
app.post("/stores", async (req, res) => {
  try {
    const { name, address, lat, lng } = req.body;
    const store = new Store({ name, address, lat, lng });
    await store.save();
    res.json({ message: "Tienda registrada" });
  } catch (error) {
    console.error("Error en /stores POST:", error);
    res.status(500).json({ error: "Error al registrar tienda" });
  }
});

// Obtener tiendas
app.get("/stores", async (req, res) => {
  try {
    const stores = await Store.find();
    res.json(stores);
  } catch (error) {
    console.error("Error en /stores GET:", error);
    res.status(500).json({ error: "Error al obtener tiendas" });
  }
});

// Check-in de promotores
app.post("/checkin", async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const stores = await Store.find();
    let dentro = false;
    stores.forEach((store) => {
      const distancia = Math.sqrt(Math.pow(lat - store.lat, 2) + Math.pow(lng - store.lng, 2));
      if (distancia < 0.01) dentro = true;
    });
    res.json({
      message: dentro ? "Check-in permitido, estás en la tienda" : "No estás dentro de una tienda autorizada",
    });
  } catch (error) {
    console.error("Error en /checkin:", error);
    res.status(500).json({ error: "Error en check-in" });
  }
});

// Subir foto
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se subió archivo" });
  res.json({ message: "Foto subida correctamente", file: req.file.filename });
});

// Asignar tienda a usuario
app.post("/assign-store", async (req, res) => {
  try {
    const { userId, storeId } = req.body;
    await User.findByIdAndUpdate(userId, { $push: { stores: storeId } });
    res.json({ message: "Tienda asignada al promotor" });
  } catch (error) {
    console.error("Error en /assign-store:", error);
    res.status(500).json({ error: "Error al asignar tienda" });
  }
});

// Obtener tiendas de un usuario
app.get("/user-stores/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("stores");
    res.json(user.stores);
  } catch (error) {
    console.error("Error en /user-stores/:id:", error);
    res.status(500).json({ error: "Error al obtener tiendas del usuario" });
  }
});

// -------------------- SERVIR FRONTEND --------------------

// Cualquier ruta que **no sea API** devuelve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------------------- INICIAR SERVIDOR --------------------
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
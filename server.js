// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

// Modelos
const User = require("./models/User");
const Store = require("./models/Store");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // archivos públicos
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // fotos subidas

// Puerto
const PORT = process.env.PORT || 3000;

// Conexión a MongoDB Atlas usando variable de entorno
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
  })
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.log("Error al conectar MongoDB:", err));

// Configuración de multer para subir fotos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

// ================== RUTAS ================== //

// Ruta principal
app.get("/", (req, res) => {
  res.send("API funcionando");
});

// Registrar usuario
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = new User({ name, email, password });
    await user.save();
    res.json({ message: "Usuario registrado correctamente" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener todos los usuarios
app.get("/users", async (req, res) => {
  try {
    const users = await User.find().populate("stores");
    res.json(users);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Registrar tienda
app.post("/stores", async (req, res) => {
  try {
    const { name, address, lat, lng } = req.body;
    const store = new Store({ name, address, lat, lng });
    await store.save();
    res.json({ message: "Tienda registrada correctamente" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener tiendas
app.get("/stores", async (req, res) => {
  try {
    const stores = await Store.find();
    res.json(stores);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Check-in en tienda
app.post("/checkin", async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const stores = await Store.find();
    let dentro = false;

    stores.forEach((store) => {
      const distancia = Math.sqrt(
        Math.pow(lat - store.lat, 2) + Math.pow(lng - store.lng, 2)
      );
      if (distancia < 0.01) dentro = true;
    });

    if (dentro) {
      res.json({ message: "Check-in permitido, estás en la tienda" });
    } else {
      res.json({ message: "No estás dentro de una tienda autorizada" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Subir foto
app.post("/upload-photo", upload.single("photo"), (req, res) => {
  try {
    res.json({ message: "Foto subida correctamente", file: req.file.filename });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Asignar tienda a usuario
app.post("/assign-store", async (req, res) => {
  try {
    const { userId, storeId } = req.body;
    await User.findByIdAndUpdate(userId, { $push: { stores: storeId } });
    res.json({ message: "Tienda asignada al promotor" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener tiendas de un usuario
app.get("/user-stores/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("stores");
    res.json(user.stores);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (!user) return res.json({ message: "Usuario no encontrado" });
    res.json({ message: "Login correcto", role: user.role, userId: user._id });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// ================== INICIAR SERVIDOR ================== //
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
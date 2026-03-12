const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const User = require("./models/User");
const Store = require("./models/Store");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    tls: true,
  })
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.log("Error al conectar MongoDB:", err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

// ================== RUTAS ================== //

app.get("/", (req, res) => res.send("API funcionando"));

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = new User({ name, email, password });
    await user.save();
    res.json({ message: "Usuario registrado correctamente" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await User.find().populate("stores");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/stores", async (req, res) => {
  try {
    const { name, address, lat, lng } = req.body;
    const store = new Store({ name, address, lat, lng });
    await store.save();
    res.json({ message: "Tienda registrada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/stores", async (req, res) => {
  try {
    const stores = await Store.find();
    res.json(stores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/checkin", async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const stores = await Store.find();
    let dentro = false;

    stores.forEach((store) => {
      const distancia = Math.sqrt(Math.pow(lat - store.lat, 2) + Math.pow(lng - store.lng, 2));
      if (distancia < 0.01) dentro = true;
    });

    res.json({ message: dentro ? "Check-in permitido, estás en la tienda" : "No estás dentro de una tienda autorizada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/upload-photo", upload.single("photo"), (req, res) => {
  try {
    res.json({ message: "Foto subida correctamente", file: req.file.filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/assign-store", async (req, res) => {
  try {
    const { userId, storeId } = req.body;
    await User.findByIdAndUpdate(userId, { $push: { stores: storeId } });
    res.json({ message: "Tienda asignada al promotor" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/user-stores/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("stores");
    res.json(user.stores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (!user) return res.json({ message: "Usuario no encontrado" });
    res.json({ message: "Login correcto", role: user.role, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== INICIAR SERVIDOR ================== //
app.listen(PORT, () => console.log("Servidor corriendo en puerto " + PORT));
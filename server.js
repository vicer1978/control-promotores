const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");

const User = require("./models/User");
const Store = require("./models/Store");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

mongoose.connect("mongodb+srv://admin:Promotores123@cluster0.xxxxx.mongodb.net/promotores");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.send("API funcionando");
});

app.post("/register", async (req, res) => {
  try {
    const user = new User({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
    });

    await user.save();

    res.json({
      message: "Usuario registrado correctamente",
    });
  } catch (error) {
    res.status(500).json({
      error: "Error al registrar usuario",
    });
  }
});

app.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

app.post("/stores", async (req, res) => {
  const store = new Store({
    name: req.body.name,
    address: req.body.address,
    lat: req.body.lat,
    lng: req.body.lng,
  });

  await store.save();

  res.json({ message: "Tienda registrada" });
});

app.get("/stores", async (req, res) => {
  const stores = await Store.find();
  res.json(stores);
});

app.post("/checkin", async (req, res) => {
  const { lat, lng } = req.body;

  const stores = await Store.find();

  let dentro = false;

  stores.forEach((store) => {
    const distancia = Math.sqrt(
      Math.pow(lat - store.lat, 2) + Math.pow(lng - store.lng, 2)
    );

    if (distancia < 0.01) {
      dentro = true;
    }
  });

  if (dentro) {
    res.json({ message: "Check-in permitido, estás en la tienda" });
  } else {
    res.json({ message: "No estás dentro de una tienda autorizada" });
  }
});

app.post("/upload-photo", upload.single("photo"), (req, res) => {
  res.json({
    message: "Foto subida correctamente",
    file: req.file.filename,
  });
});

app.post("/assign-store", async (req, res) => {
  const { userId, storeId } = req.body;

  await User.findByIdAndUpdate(userId, {
    $push: { stores: storeId },
  });

  res.json({ message: "Tienda asignada al promotor" });
});

app.get("/user-stores/:id", async (req, res) => {
  const user = await User.findById(req.params.id).populate("stores");

  res.json(user.stores);
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, password });

  if (!user) {
    return res.json({ message: "Usuario no encontrado" });
  }

  res.json({
    message: "Login correcto",
    role: user.role,
    userId: user._id,
  });
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
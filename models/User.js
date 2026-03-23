// models/User.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // 🔥 Roles unificados con frontend
  role: { 
    type: String, 
    enum: ["user", "admin", "superadmin"], // agregado superadmin
    default: "user" 
  },

  // 🏪 Tiendas asignadas
  stores: [{ type: Schema.Types.ObjectId, ref: "Store" }],

  // 📍 Ubicación para mapa en vivo
  lastLocation: {
    lat: Number,
    lng: Number,
    date: Date
  },

  // 🏢 Agencia a la que pertenece
  agencyId: { 
    type: Schema.Types.ObjectId, 
    ref: "Agency" 
  }
});

module.exports = mongoose.model("User", userSchema);
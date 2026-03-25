// models/User.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // 🔥 Roles
  role: { 
    type: String, 
    enum: ["promotor", "demostradora", "admin", "superadmin"], 
    default: "promotor" 
  },

  // 🏪 Tiendas asignadas
  stores: [{ type: Schema.Types.ObjectId, ref: "Store" }],

  // 📍 Última ubicación
  lastLocation: {
    lat: Number,
    lng: Number,
    date: Date
  },

  // 🏢 Agencia
  agencyId: { 
    type: Schema.Types.ObjectId, 
    ref: "Agency",
    default: null
  },

  // 🔐 Recuperación de password
  resetToken: String,
  resetTokenExpire: Date
}, { timestamps: true }); // Agrega createdAt y updatedAt automáticamente

module.exports = mongoose.model("User", userSchema);
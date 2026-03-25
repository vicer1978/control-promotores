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
    enum: ["user", "promotor", "demostradora", "admin", "superadmin"],
    default: "user" 
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
    ref: "Agency" 
  },

  // 🔐 RECUPERACIÓN DE PASSWORD (AQUÍ VA 🔥)
  resetToken: String,
  resetTokenExpire: Date

});

module.exports = mongoose.model("User", userSchema);
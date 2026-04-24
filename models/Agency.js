// models/Agency.js
const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, lowercase: true, trim: true }, // Para contacto
  isActive: { type: Boolean, default: true }           // Para el control de estatus
}, { timestamps: true });

module.exports = mongoose.model("Agency", agencySchema);

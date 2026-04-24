// models/Agency.js
const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // <-- Nueva casilla de contraseña
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Agency", agencySchema);

// models/User.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["promotor", "administrador"], default: "promotor" },
  stores: [{ type: Schema.Types.ObjectId, ref: "Store" }], // Tiendas asignadas
});

module.exports = mongoose.model("User", userSchema);
// models/Checkin.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const checkinSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: "Agency",
    required: true
  },
  storeId: { // Agregado: para saber en qué tienda se hizo el registro
    type: Schema.Types.ObjectId,
    ref: "Store",
    required: true
  },
  // Cambiado: agrupado en 'location' para coincidir con el server.js
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  // Agregado: CRUCIAL para diferenciar Check-in de Check-out
  type: {
    type: String,
    enum: ["checkin", "checkout"],
    required: true
  },
  photo: String,
  timestamp: { // Usamos este campo para la hora exacta del evento
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model("Checkin", checkinSchema);

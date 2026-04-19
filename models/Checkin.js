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
  storeId: { 
    type: Schema.Types.ObjectId,
    ref: "Store",
    required: true
  },
  // NUEVO: Vinculación de la asistencia a un Proyecto/Cliente específico
  projectId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Project',
    index: true 
  },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  type: {
    type: String,
    enum: ["checkin", "checkout"],
    required: true
  },
  // Mantenemos photo por compatibilidad
  photo: String, 
  
  // Agregado: para guardar la ruta de la imagen de evidencia (asistencia)
  foto_url: { 
    type: String, 
    default: null 
  },
  
  timestamp: { 
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true // Crea automáticamente createdAt y updatedAt
});

module.exports = mongoose.model("Checkin", checkinSchema);

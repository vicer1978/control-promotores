const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, // Evita agencias duplicadas
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true,
    select: false // No se incluye en los resultados de búsqueda por defecto (Seguridad)
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

module.exports = mongoose.model("Agency", agencySchema);

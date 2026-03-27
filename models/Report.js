const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true }, // ¡IMPORTANTE! Para que el Admin filtre rápido
    
    type: { type: String, required: true }, // "entrada", "salida", "degustacion", "inventario", "agotado"
    
    // Campos para Promotores (Ruta)
    articulo: { type: String },
    cantidad: { type: Number },
    precio: { type: Number },
    
    // Campos para Demostradoras (Fijo)
    personas: { type: Number }, // Cuántas personas probaron producto
    comentarios: { type: String }, // Notas de la degustación o del cliente
    observaciones: { type: String }, // General
    
    foto_url: { type: String },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);

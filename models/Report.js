const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // --- FLEXIBILIDAD DE IDS ---
    // Usamos String para evitar errores de validación entre ObjectId y Texto
    agencyId: { type: String, required: true, index: true },
    projectId: { type: String, index: true }, 
    
    // Estos se quedan como ObjectId para poder usar .populate()
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },

    // --- DATOS DEL REPORTE ---
    reportType: { 
        type: String, 
        required: true, 
        trim: true 
    },

    // Campos de Inventario / Ventas
    articulo:      { type: String, default: "N/A" },
    inv_inicial:   { type: Number, default: 0 },
    resurtido:     { type: Number, default: 0 }, 
    ventas:         { type: Number, default: 0 }, 
    cantidad:      { type: String, default: "0" }, 
    inv_final:     { type: Number, default: 0 },
    
    // Campos de Precios
    precio:        { type: Number, default: 0 }, 
    precio_normal: { type: Number, default: 0 }, 
    precio_oferta: { type: Number, default: 0 }, 
    
    // Otros datos estándar
    personas:      { type: Number, default: 0 }, 
    observaciones: { type: String, default: "" }, 
    photo:         { type: String, default: null }, 
    foto_url:      { type: String, default: null }, 

    // Ubicación
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },

    // --- EXTENSIBILIDAD ---
    datosExtra: { type: mongoose.Schema.Types.Mixed, default: {} }

}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);

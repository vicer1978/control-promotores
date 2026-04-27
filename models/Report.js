const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // --- IDENTIFICADORES ---
    // Usamos Mixed o String si realmente prefieres flexibilidad, 
    // pero ObjectId es mejor para la integridad de los datos.
    agencyId: { type: String, required: true, index: true },
    projectId: { type: String, index: true }, 

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },

    // --- DATOS DEL REPORTE ---
    reportType: { type: String, required: true, index: true },

    // Campos Numéricos (Cambiados a Number para analítica)
    articulo:      { type: String, default: "N/A" },
    inv_inicial:   { type: Number, default: 0 },
    resurtido:     { type: Number, default: 0 }, 
    ventas:        { type: Number, default: 0 }, 
    cantidad:      { type: Number, default: 0 }, // Cambiado a Number
    inv_final:     { type: Number, default: 0 },
    
    // Precios
    precio:        { type: Number, default: 0 }, 
    precio_normal: { type: Number, default: 0 }, 
    precio_oferta: { type: Number, default: 0 }, 
    
    // Contenido
    observaciones: { type: String, default: "" }, 
    photo:         { type: String, default: null }, 
    foto_url:      { type: String, default: null }, 

    // Ubicación
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },

    // Booleano para alertas rápidas (ej. si marcaron agotado en el front)
    pre_agotados: { type: Boolean, default: false },

    // --- EXTENSIBILIDAD ---
    datosExtra: { type: mongoose.Schema.Types.Mixed, default: {} }

}, { 
    timestamps: true // Esto crea createdAt y updatedAt automáticamente
});

// ÍNDICE COMPUESTO: Optimiza las búsquedas del Admin (Agencia -> Proyecto -> Fecha)
ReportSchema.index({ agencyId: 1, projectId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);

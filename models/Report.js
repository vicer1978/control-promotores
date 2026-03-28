const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    
    // --- CAMBIO CRUCIAL AQUÍ ---
    reporte: { // Cambiado de reportType a reporte para que coincida con tu server.js
        type: String, 
        required: true, 
        // Agregamos 'checkin' y 'checkout' a la lista permitida
        enum: ['ventas', 'ranking', 'inventario', 'agotado', 'competencia', 'reporte_diario', 'checkin', 'checkout'] 
    },

    articulo: { type: String, default: "N/A" },
    inv_inicial: { type: Number, default: 0 },
    resurtido:   { type: Number, default: 0 }, 
    cantidad:    { type: Number, default: 0 }, 
    inv_final:   { type: Number, default: 0 },
    precio:      { type: Number, default: 0 },
    personas:    { type: Number, default: 0 }, 
    observaciones: { type: String }, 
    foto_url:    { type: String },
    location: {
        lat: Number,
        lng: Number
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Report', ReportSchema);

// models/Report.js
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // --- RELACIONES ---
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    storeId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Store', 
        required: true 
    },
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency', 
        required: true 
    },
    
    // --- CLASIFICACIÓN ---
    reporte: { 
        type: String, 
        required: true, 
        trim: true, 
        // Se incluyen 'precios' y otros tipos para evitar el Error 500
        enum: [
            'ventas', 
            'ranking', 
            'inventario', 
            'agotado', 
            'competencia', 
            'reporte_diario', 
            'precios',    // <--- Agregado para chequeo de precios
            'checkin', 
            'checkout'
        ] 
    },

    // --- DATOS DEL PRODUCTO ---
    articulo: { 
        type: String, 
        default: "N/A" 
    },
    
    // --- FLUJO DE INVENTARIO Y VENTAS ---
    inv_inicial: { type: Number, default: 0 },
    resurtido:   { type: Number, default: 0 }, 
    cantidad:    { type: Number, default: 0 }, 
    inv_final:   { type: Number, default: 0 },
    
    // --- CAMPOS DE PRECIOS ---
    precio:        { type: Number, default: 0 }, // Usado como Precio Normal
    precio_oferta: { type: Number, default: 0 }, // <--- Nuevo campo para ofertas
    
    // --- DATOS DE CAMPO ---
    personas: { 
        type: Number, 
        default: 0 
    }, 
    observaciones: { 
        type: String,
        default: ""
    }, 
    
    // --- EVIDENCIA ---
    foto_url: { 
        type: String,
        default: null
    },

    // --- GEOLOCALIZACIÓN ---
    location: {
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 }
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Report', ReportSchema);

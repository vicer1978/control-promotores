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
        trim: true, // Elimina espacios accidentales del frontend
        // Se incluyen todos los tipos posibles para evitar Error 500
        enum: [
            'ventas', 
            'ranking', 
            'inventario', 
            'agotado', 
            'competencia', 
            'reporte_diario', 
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
    cantidad:    { type: Number, default: 0 }, // Ventas Realizadas
    inv_final:   { type: Number, default: 0 },
    precio:      { type: Number, default: 0 },
    
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
    timestamps: true // Crea automáticamente createdAt y updatedAt
});

module.exports = mongoose.model('Report', ReportSchema);

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
        // Se incluyen todos los tipos nuevos para evitar Error 500
        enum: [
            'ventas', 
            'ranking', 
            'inventario', 
            'inventarios',      // <--- Agregado (Promotor)
            'agotado', 
            'agotados',        // <--- Agregado (Promotor)
            'preagotados',     // <--- Agregado (Promotor)
            'competencia', 
            'competencia_p',   // <--- Agregado (Promotor)
            'reporte_diario', 
            'precios',         
            'exhibiciones',    // <--- Agregado (Promotor)
            'fotos_anaquel',   // <--- Agregado (Promotor)
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
    ventas:      { type: Number, default: 0 }, // <--- Agregado para compatibilidad con Demos
    cantidad:    { type: Number, default: 0 }, 
    inv_final:   { type: Number, default: 0 },
    
    // --- CAMPOS DE PRECIOS ---
    precio:        { type: Number, default: 0 }, // Usado como Precio Normal
    precio_normal: { type: Number, default: 0 }, // <--- Agregado para consistencia
    precio_oferta: { type: Number, default: 0 }, 
    
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

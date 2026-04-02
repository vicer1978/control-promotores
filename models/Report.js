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
        // Se incluyen todos los tipos posibles para evitar errores de validación (Enum)
        enum: [
            'ventas', 
            'ranking', 
            'inventario', 
            'inventarios',      
            'agotado', 
            'agotados',        
            'preagotados',     
            'competencia', 
            'competencia_p',   
            'reporte_diario', 
            'precios',         
            'exhibicion',      // <--- Agregado para corregir el error de validación
            'exhibiciones',    
            'fotos_anaquel',   
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
    ventas:      { type: Number, default: 0 }, 
    cantidad:    { type: Number, default: 0 }, 
    inv_final:   { type: Number, default: 0 },
    
    // --- CAMPOS DE PRECIOS ---
    precio:        { type: Number, default: 0 }, 
    precio_normal: { type: Number, default: 0 }, 
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

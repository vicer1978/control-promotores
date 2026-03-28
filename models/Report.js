const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // --- RELACIONES ---
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    // Si manejas agencias, asegúrate de que el userId siempre traiga una vinculada
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    
    // --- CLASIFICACIÓN ---
    reportType: { 
    type: String, 
    required: true, 
    // Agregamos 'reporte_diario' y 'ranking' para que coincidan con tus botones
    enum: ['ventas', 'ranking', 'inventario', 'agotado', 'competencia', 'reporte_diario'] 
},

    
    // --- DATOS DEL PRODUCTO ---
    articulo: { type: String, default: "N/A" },
    
    // --- FLUJO COMPLETO (VENTAS E INVENTARIO) ---
    // Usar nombres claros ayuda a que el backend procese el "Mega Formulario" sin confusiones
    inv_inicial: { type: Number, default: 0 },
    resurtido:   { type: Number, default: 0 }, 
    cantidad:    { type: Number, default: 0 }, // Ventas Realizadas
    inv_final:   { type: Number, default: 0 },
    
    precio:      { type: Number, default: 0 },
    
    // --- DATOS DE DEGUSTACIÓN / CAMPO ---
    personas: { type: Number, default: 0 }, // Impactos o personas degustadas
    observaciones: { type: String }, 
    
    // --- EVIDENCIA Y TIEMPO ---
    foto_url: { type: String },

    // --- GEOLOCALIZACIÓN (Opcional pero RECOMENDADO) ---
    // Para validar que el reporte se hizo REALMENTE en la tienda
    location: {
        lat: Number,
        lng: Number
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Report', ReportSchema);

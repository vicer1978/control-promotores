const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // --- RELACIONES ---
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    
    // --- CLASIFICACIÓN ---
    // Usamos 'reportType' para evitar conflictos con la palabra 'type' de Mongoose
    reportType: { 
        type: String, 
        required: true, 
        enum: ['ventas', 'degustacion', 'inventario', 'agotado', 'competencia', 'reporte_diario'] 
    },
    
    // --- DATOS DEL PRODUCTO ---
    articulo: { type: String },
    cantidad: { type: Number, default: 0 }, // Ventas o unidades dadas
    precio: { type: Number, default: 0 },
    
    // --- CONTROL DE INVENTARIO (Para Demoras/Promotores) ---
    inv_inicial: { type: Number, default: 0 },
    inv_final: { type: Number, default: 0 },
    
    // --- DATOS DE DEGUSTACIÓN / CAMPO ---
    personas: { type: Number, default: 0 }, 
    observaciones: { type: String }, // Aquí caerán los comentarios de "3 cajas y 2 piezas"
    
    // --- EVIDENCIA Y TIEMPO ---
    foto_url: { type: String },
    date: { type: Date, default: Date.now }
}, { 
    timestamps: true // Esto crea automáticamente 'createdAt' y 'updatedAt'
});

module.exports = mongoose.model('Report', ReportSchema);

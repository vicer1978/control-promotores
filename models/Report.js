const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // --- RELACIONES ---
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    
    // --- CLASIFICACIÓN ---
    reportType: { 
        type: String, 
        required: true, 
        // Agregamos 'degustacion' para que coincida con el mapeo del frontend
        enum: ['ventas', 'degustacion', 'inventario', 'agotado', 'competencia', 'reporte_diario'] 
    },
    
    // --- DATOS DEL PRODUCTO ---
    articulo: { type: String, default: "N/A" },
    cantidad: { type: Number, default: 0 }, // Aquí se guardan las "Ventas Realizadas"
    precio: { type: Number, default: 0 },
    
    // --- CONTROL DE INVENTARIO (CORREGIDO) ---
    inv_inicial: { type: Number, default: 0 },
    resurtido: { type: Number, default: 0 }, // <-- AGREGAR ESTO para el Reporte Diario
    inv_final: { type: Number, default: 0 },
    
    // --- DATOS DE DEGUSTACIÓN / CAMPO ---
    personas: { type: Number, default: 0 }, 
    observaciones: { type: String }, 
    
    // --- EVIDENCIA Y TIEMPO ---
    foto_url: { type: String },
    // Eliminamos 'date' manual porque 'timestamps: true' ya crea 'createdAt'
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Report', ReportSchema);

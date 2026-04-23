// models/Report.js
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    // Relaciones principales
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    
    // agencyId: Lo ideal es String para evitar errores de validación si solo manejas el ID plano
    agencyId: { type: String, required: true },

    // Tipo de reporte (Ventas, Degustación, etc.)
    reportType: { 
        type: String, 
        required: true, 
        trim: true 
    },

    // Campos de Inventario / Ventas
    articulo:      { type: String, default: "N/A" },
    inv_inicial:   { type: Number, default: 0 },
    resurtido:     { type: Number, default: 0 }, 
    ventas:        { type: Number, default: 0 }, 
    cantidad:      { type: String, default: "0" }, // String para soportar "5 piezas" o "N/A"
    inv_final:     { type: Number, default: 0 },
    
    // Campos de Precios
    precio:        { type: Number, default: 0 }, 
    precio_normal: { type: Number, default: 0 }, 
    precio_oferta: { type: Number, default: 0 }, 
    
    // Otros datos estándar
    personas:      { type: Number, default: 0 }, 
    observaciones: { type: String, default: "" }, 
    photo:         { type: String, default: null }, // URL de la imagen en /uploads
    foto_url:      { type: String, default: null }, // Duplicado por compatibilidad con tu App vieja

    // Ubicación
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },

    // --- EL CAMPO MÁGICO ---
    // Aquí puedes meter CUALQUIER cosa que pida una agencia nueva
    datosExtra: { type: mongoose.Schema.Types.Mixed, default: {} }

}, { timestamps: true }); // timestamps crea 'createdAt' y 'updatedAt' automáticamente

module.exports = mongoose.model('Report', ReportSchema);

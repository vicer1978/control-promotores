// models/Report.js
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    
    // CAMBIO 1: Cambiamos 'reporte' por 'reportType' para que coincida con el frontend
    // Y quitamos el enum estricto temporalmente para que no falle por mayúsculas
    reportType: { 
        type: String, 
        required: true, 
        trim: true 
    },

    articulo: { type: String, default: "N/A" },
    inv_inicial: { type: Number, default: 0 },
    resurtido:   { type: Number, default: 0 }, 
    ventas:      { type: Number, default: 0 }, 
    cantidad:    { type: String, default: "0" }, 
    inv_final:   { type: Number, default: 0 },
    
    precio:        { type: Number, default: 0 }, 
    precio_normal: { type: Number, default: 0 }, 
    precio_oferta: { type: Number, default: 0 }, 
    
    personas: { type: Number, default: 0 }, 
    observaciones: { type: String, default: "" }, 
    
    // CAMBIO 2: Cambiamos 'foto_url' por 'photo' si es que así lo guardas en el server
    photo: { type: String, default: null },

    // CAMBIO 3: Simplificamos la ubicación para que sea más fácil de guardar
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }

}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);

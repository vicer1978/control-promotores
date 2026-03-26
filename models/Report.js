const mongoose = require('mongoose');
const ReportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    type: { type: String, required: true }, // Ej: "entrada", "inventario"
    articulo: { type: String },
    cantidad: { type: Number },
    foto_url: { type: String },
    date: { type: Date, default: Date.now }
}, { timestamps: true });
module.exports = mongoose.model('Report', ReportSchema);

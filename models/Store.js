const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String },
    state: { type: String, required: true }, 
    isActive: { type: Boolean, default: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', default: null, index: true },
    isGlobal: { type: Boolean, default: false }
}, { timestamps: true });

// LA CORRECCIÓN AQUÍ: Asegúrate que el segundo argumento coincida con el nombre de arriba
module.exports = mongoose.model("Store", StoreSchema); 

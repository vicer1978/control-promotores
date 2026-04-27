// Store.js sugerido
const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String },
    state: { type: String, required: true }, 
    isActive: { type: Boolean, default: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', default: null, index: true },
    isGlobal: { type: Boolean, default: false }
    // Quitamos projectId de aquí para que la tienda sea libre
}, { timestamps: true });

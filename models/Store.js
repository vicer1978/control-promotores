const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, default: 'Sin dirección registrada' },
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        index: true // Importante para que cada Admin vea solo SUS tiendas
    }
}, { timestamps: true }); // Útil para auditoría

module.exports = mongoose.model('Store', StoreSchema);

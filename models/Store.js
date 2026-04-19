const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, default: 'Sin dirección registrada' },
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        index: true // Importante para que cada Admin vea solo SUS tiendas
    },
    // NUEVO: Vinculación de la tienda a un Proyecto/Cliente específico
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        index: true // Optimiza el filtrado de tiendas por cliente
    }
}, { timestamps: true }); // Útil para auditoría

module.exports = mongoose.model('Store', StoreSchema);

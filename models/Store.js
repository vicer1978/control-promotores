const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    address: { 
        type: String 
    },
    state: { 
        type: String, 
        required: true 
    }, 
    isActive: { 
        type: Boolean, 
        default: true 
    },
    
    // Si agencyId es null, la tienda es GLOBAL (la ven todos)
    // Si tiene un ID, solo la ve esa agencia.
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        default: null, 
        index: true 
    },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null,
        index: true 
    },

    // Flag para identificar rápidamente tiendas del catálogo oficial
    isGlobal: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true }); // Los timestamps van aquí, al final del objeto del esquema

module.exports = mongoose.model('Store', StoreSchema);

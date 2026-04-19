const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },

    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true, 
        trim: true 
    },

    password: { type: String, required: true },

    role: { 
        type: String, 
        default: 'Promotor',
        trim: true,
        // Se agregaron 'cliente' y 'Cliente' para resolver el ValidationError de los logs
        enum: [
            'Promotor', 'Demostradora', 'Admin', 'Super-Admin', 
            'promotor', 'demostradora', 'ADMIN', 'PROMOTOR', 
            'DEMOSTRADORA', 'cliente', 'Cliente'
        ] 
    }, 

    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        index: true 
    },

    // Referencia al Proyecto/Cliente específico
    projectId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Project',
        index: true,
        default: null // Asegura que pueda ser nulo si no se asigna de inmediato
    },

    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }]

}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

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
        default: 'promotor',
        enum: ['promotor', 'demostradora', 'admin', 'super-admin'] // Añadimos restricción de roles
    }, 
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        index: true // Optimiza el filtrado en el panel Admin
    },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

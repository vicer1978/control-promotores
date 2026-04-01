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
        default: 'Promotor', // Sugerencia: Usar Capitalizado para coincidir con tu UI
        trim: true,
        enum: ['Promotor', 'Demostradora', 'Admin', 'Super-Admin', 'promotor', 'demostradora'] 
    }, 
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        index: true 
    },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

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
        lowercase: true, 
        trim: true,
        enum: ['promotor', 'demostradora', 'admin', 'super-admin', 'cliente'] 
    }, 
    agencyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Agency',
        index: true,
        default: null // Es importante el null aquí para los nuevos registros
    },
    projectId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Project',
        index: true,
        default: null 
    },
    stores: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
        default: [] 
    },
    
    // --- NUEVOS CAMPOS AGREGADOS ADENTRO DEL ESQUEMA ---
    status: { 
        type: String, 
        default: 'activo' // activo, pendiente, inactivo
    }, 
    city: { 
        type: String 
    }
    // ---------------------------------------------------

}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

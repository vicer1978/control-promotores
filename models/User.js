const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Actualizamos el enum para que coincida con tu frontend
    role: { 
        type: String, 
        enum: ['admin', 'promotor', 'demostradora', 'Demostradora (Fijo)', 'super-admin'],
        default: 'promotor'
    },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }] 
});

module.exports = mongoose.model('User', UserSchema);

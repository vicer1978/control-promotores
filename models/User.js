const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    // Dejamos String para flexibilidad, pero establecemos un default simple
    role: { type: String, default: 'promotor' }, 
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }]
}, { timestamps: true }); // Añadido para saber cuándo se creó el usuario

module.exports = mongoose.model('User', UserSchema);

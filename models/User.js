const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Eliminamos el enum para que acepte "Promotor (Ruta)" y "Demostradora (Fijo)" sin errores
    role: { type: String, default: 'Promotor (Ruta)' },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }]
});

module.exports = mongoose.model('User', UserSchema);

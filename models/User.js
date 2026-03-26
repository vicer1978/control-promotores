const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'promotor', 'demostradora'] },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }] // Aquí se guardan las asignaciones
});
module.exports = mongoose.model('User', UserSchema);

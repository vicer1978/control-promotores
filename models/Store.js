const mongoose = require('mongoose');
const StoreSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' } // Para filtrar por agencia
});
module.exports = mongoose.model('Store', StoreSchema);

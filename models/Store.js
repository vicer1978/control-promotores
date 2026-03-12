// models/Store.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const storeSchema = new Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  lat: { type: Number, required: true }, // Latitud
  lng: { type: Number, required: true }, // Longitud
});

module.exports = mongoose.model("Store", storeSchema);
// models/Agency.js

const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema({
  name: { type: String, required: true },
}, { timestamps: true }); // createdAt y updatedAt automáticamente

module.exports = mongoose.model("Agency", agencySchema);
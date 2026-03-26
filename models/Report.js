const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({

  userId: { type: mongoose.Schema.Types.ObjectId, ref:"User" },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref:"Store" },
  agencyId: { type: mongoose.Schema.Types.ObjectId, ref:"Agency" },

  role: String, // promotor o demostradora
  type: String, // ventas, inventario, degustacion, etc

  data: Object, // 🔥 aquí guardamos todo dinámico

  date: { type: Date, default: Date.now }

});

module.exports = mongoose.model("Report", reportSchema);
const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema({
  name: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Agency", agencySchema);
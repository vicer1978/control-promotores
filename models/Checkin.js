const mongoose = require("mongoose");

const checkinSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  agencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agency"
  },
  lat: Number,
  lng: Number,
  photo: String,
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Checkin", checkinSchema);
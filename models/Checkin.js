// models/Checkin.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const checkinSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: "Agency",
    required: true
  },
  lat: Number,
  lng: Number,
  photo: String,
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true }); // createdAt y updatedAt automáticamente

module.exports = mongoose.model("Checkin", checkinSchema);
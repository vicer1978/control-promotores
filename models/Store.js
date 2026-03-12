const mongoose = require("mongoose")

const StoreSchema = new mongoose.Schema({

name:{
type:String,
required:true
},

address:{
type:String
},

lat:{
type:Number
},

lng:{
type:Number
}

})

module.exports = mongoose.model("Store", StoreSchema)
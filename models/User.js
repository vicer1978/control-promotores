const mongoose = require("mongoose")

const UserSchema = new mongoose.Schema({

name:String,

email:String,

password:String,

role:{
type:String,
default:"promotor"
},

stores:[
{
type: mongoose.Schema.Types.ObjectId,
ref:"Store"
}
]

})

module.exports = mongoose.model("User",UserSchema)
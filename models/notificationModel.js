const mongoose = require('mongoose');

const nofiticationSchema = new mongoose.Schema({
    userIds:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
    message:{
        type:String,
        maxlength: [500, 'Message cannot exceed 500 characters'],
        required:true,
        trim:true,
        lowercase:true,
    },
    sender:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
    isSeen:{
        type:Boolean,
        default:false
    },
},{timestamps: true});

const Notification = mongoose.model('Notification', nofiticationSchema);

module.exports = Notification;
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [50, 'Name cannot exceed 50 characters'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: [true, 'An admin with this email already exists'],
        trim:true,
        match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please fill a valid email address'],
    },
    password:{
        type: String,
        required: true
    },
    newUser: {
        type: Boolean,
        default: true,
    }
});

const Admin = mongoose.model('Admin', adminSchema);
module.exports = Admin;
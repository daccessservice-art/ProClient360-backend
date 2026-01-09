const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name:{
        type: String,
        required: [true, 'name is required'],
        trim: true,
        minlength: [2, 'name must be at least 2 characters long'],
        maxlength: [300, 'name cannot exceed 300 characters'],
        validate: {
            validator: function (value) {
                // Regex to allow letters, numbers, spaces, commas, and periods
                const regex = /^[a-zA-Z0-9\s,\.]+$/;
                return regex.test(value);
            },
            message: 'name can only contain letters, numbers, spaces, commas, and periods',
        },
    },
    email: {
        type: String,
        required: [true,'Email is required'],
        unique: [true, 'An company with this email already exists'],
        trim:true,
        match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please fill a valid email address'],
    },
    GST:{
        type:String,
        required:[true, 'GST number is required'],
        unique:[true, 'An company with this GST number already exists'],
        minLength: [15, 'GST number must be at least 15 characters long'],
        maxLength: [15, 'GST number cannot exceed 15 characters'],
        validate: {
            validator: function (value) {
                // Regex to match GST number format
                const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9]{1}Z[a-zA-Z0-9]{1}$/;
                return gstRegex.test(value);
            },
            message: 'Invalid GST number format',
        },
    },
    Address:{
        add:{
            type:String,
            maxlength: [500, 'Address cannot exceed 500 characters'],
            required:[true, 'Address is required'],
        },
        city:{
            type:String,
            maxLength: [50, 'City cannot exceed 50 characters'],
            maxLength: [50, 'City cannot exceed 50 characters'],
            required:[true,'City is required'],
        },
        state:{
            type:String,
            maxLength: [50, 'State cannot exceed 50 characters'],
            maxLength: [50, 'State cannot exceed 50 characters'],
            required:[true, 'State is required'],
        },
        country:{
            type:String,
            maxLength: [50, 'Country cannot exceed 50 characters'],
            required:[true, 'Country is required'   ],
        },
        pincode:{
            type:Number,
            maxLength: [6, 'Pincode cannot exceed 6 digits'],
            required:[true, 'Pincode is required'],
        },
    },
    admin:{
        type: String,
        required: [true, 'Admin Name name is required'],
        minlength: [3, 'Admin name must be at least 3 characters long'],
        maxlength: [50, 'Admin name cannot exceed 20 characters'],
        trim: true,
    },
    mobileNo:{
        type:Number,
        maxlength:[10, 'Mobile number cannot exceed 10 digits'],
        required:[true, 'Mobile number is required'],
        unique:[true, 'An company with this mobile number already exists'],
    },
    landlineNo:{
        type:Number,
        maxlength:[13, 'Landline number cannot exceed 13 digits'],
    },
    password:{
        type:String, 
        required: true
    },
    subDate:{
        type:Date,
        default:Date.now,
        validate:{
            validator: function(value) {
            const currentDate = new Date();
            return value >= currentDate;
        },
        message: 'Subscription date must be in the future',
        },
        
    },
    logo:{
        type:String
    },
    tradeIndiaConfig:{
        userid:{
            type: String,
            trim: true,
        },
        profile_id:{
            type: String,
            trim: true,
        },
         apiKey:{
            type: String,
            trim: true,
        }
    },
    subAmount:{
        type:Number,
        min:[0, 'Subscription amount cannot be less than 0'],
        required:[true, 'Subscription amount is required'],
    },
    newUser:{
        type: Boolean,
        default: true,
    }
},{
    timestamps: true,
  });

const Company = mongoose.model('Company',companySchema);

module.exports = Company;
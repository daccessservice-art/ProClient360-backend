const mongoose= require('mongoose');
const Schema = mongoose.Schema;

const ticketSchema = new Schema({

    company:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
    },
    date:{
        type: Date,
        required: true,
        default: Date.now(),
    },
    client:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
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
            required:[true, 'City is required'],
        },
        state:{
            type:String,
            maxLength: [50, 'State cannot exceed 50 characters'],
            required:[true, 'State is required'],
        },
        country:{
            type:String,
            maxLength: [50, 'Country cannot exceed 50 characters'],
            required:[true, 'Country is required'],
        },
        pincode:{
            type:Number,
            maxLength: [6, 'Pincode cannot exceed 6 digits'],
            required:[true, 'Pincode is required'],
        },
    },
    details:{
        type: String,
        required: [true, 'Details are required'],
        maxlength: [500, 'Details cannot exceed 500 characters'],
        lowercase: true,
        
    },
    product:{
        type:String,
        enum: [
        'CCTV System',
        'TA System',
        'Hajeri',
        'SmartFace',
        'ZKBioSecurity',
        'Access Control System',
        'Turnkey Project',
        'Alleviz',
        'CafeLive',
        'WorksJoy',
        'WorksJoy Blu',
        'Fire Alarm System',
        'Fire Hydrant System',
        'IDS',
        'AI Face Machines',
        'Entrance Automation',
        'Guard Tour System',
        'Home Automation',
        'IP PA and Communication System',
        'CRM',
        'KMS',
        'VMS',
        'PMS',
        'Boom Barrier System',
        'Tripod System',
        'Flap Barrier System',
        'EPBX System',  
        'CMS',
        'Lift Eliviter System',
        'AV6',
        'Walky Talky System',
        'Device Management System'                     
        ],
        required: true,
    },
    contactPersonEmail:{
        type: String,
        required: [true, 'Contact person email is required'],
        trim:true,
        match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please fill a valid email address'],
        lowercase: true,
    },
    contactPerson:{
        type: String,
        required: [true, 'Contact person name is required'],
        trim: true,
        maxlength: [50, 'Contact person name cannot exceed 50 characters'],
    },
    contactNumber:{
        type: Number,
        required: [true, 'Contact number is required'],
        maxlength: [10, 'Contact number cannot exceed 10 digits'],
    },
    source:{
        type: String,
        enum: [
            'Email',
            'Call',
            'WhatsApp',
            'SMS',
            'Direct',
        ],
        required: [true, 'Source is required'],
    },
    service:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        default: null,
    },
    registerBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
},
{
    timestamps: true,
}
);

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;
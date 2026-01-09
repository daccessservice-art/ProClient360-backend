const mongoose= require('mongoose');
const Schema = mongoose.Schema;


const serviceSchema = new Schema({
    company:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
   ticket:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
   },
    serviceType:{
            type: String,
            enum:[
                'AMC',
                'Warranty',
                'One Time',
            ],
            required: [true, 'Service Type is required'],
    },
   priority:{
        type: String,
        enum:[
            'High',
            'Medium',
            'Low',
        ],
        required: [true, 'Priority is required'],
   },
   
   allotmentDate: {
        type: Date,
        required: [true, 'allotmentDate is required'],
    },
   allotTo:[
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee',
        }
    ],
   workMode:{
        type: String,
        enum:[
            'Onsite',
            'Remote',
        ],
        required: [true, 'Work Mode is required'],
    },
    status:{
        type: String,
        enum:[
            'Pending',
            'Inprogress',
            'Completed',
            'Stuck',
        ],
        default: 'Pending',
        required: [true, 'Status is required'],
    },
    complateLevel:{
        type: Number,
        min: [0, 'Completed percentage cannot be less than 0'], 
        max: [100, 'Completed percentage cannot exceed 100'],
        default: 0,
    },
    completionDate:{
        type: Date,
    },
    Days:{
        type: Number,
    },
    stuckResponsible:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
    stuckReason:{
        type: String,
        maxlength: [500, 'Stuck Reason cannot exceed 500 characters'],
        validate: {
            validator: function (value) {
                // Regex to allow letters, numbers, spaces, commas, and periods
                const regex = /^[a-zA-Z0-9\s,\.]+$/;
                return regex.test(value);
            },
            message: 'stuckReason can only contain letters, numbers, spaces, commas, and periods',
        },
    },
    stuckBy:{
        type: String,
        enum: ['Company', 'Client', 'Contractor'],
    },
    actualCompletionDate:{
        type: Date,
    },
    feedback:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Feedback',
        default: null,
    }

});

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
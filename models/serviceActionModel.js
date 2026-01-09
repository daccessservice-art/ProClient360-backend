const mongoose= require('mongoose');
const Schema = mongoose.Schema;


const serviceActionSchema = new Schema({
    service:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service"
    },
    action: {
        type: String,
        maxlength: [500, 'Action cannot exceed 500 characters'],
        lowercase: true,
    },
    actionBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
    },
    startTime: {
        type: Date,
        required: false,
    },
    actionStatus:{
        type: String,
        enum: ['Pending', 'Inprogress', 'Completed', 'Stuck'],
        default: 'Pending',
        required: true,
    },
    endTime: {
        type: Date,
        required: false,
        validate: {
            validator: function(value) {
                // Check if endTime is greater than startTime
                return this.startTime ? value >= this.startTime : true;
            },
            message: 'endTime must be greater than startTime.'
        }
    }
});

const ServiceAction = mongoose.model('ServiceAction', serviceActionSchema);

module.exports = ServiceAction;
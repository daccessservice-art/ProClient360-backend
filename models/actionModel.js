
const mongoose= require('mongoose');
const Schema = mongoose.Schema;

const actionSchema = new Schema({
    task:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "TaskSheet",
        required: true
    },
    action: {
        type: String,
        maxlength: [500, 'Action cannot exceed 500 characters'],
        required: [true, 'Action Is required'],
        lowercase: true,
    },
    actionBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },
    startTime: {
        type: Date,
        required: false,
    },
    endTime: {
        type: Date,
        required: false,
        validate: {
            validator: function (value) {
                // Check if startTime is defined and less than endTime
                if (this.startTime) {
                    return this.startTime <= value;
                }
                return true; // If startTime is not defined, validation passes
            },
            message: 'endTime must be greater than startTime',
        },
    },
    complated:{
        type: Number,
        min: [0, 'Completed percentage cannot be less than 0'], 
        max: [100, 'Completed percentage cannot exceed 100'],
        default: 0,
    },
    taskStatus: {
        type: String,
        enum: ['stuck','inprocess', 'completed', 'upcomming'],
        default: 'upcomming'
    },
    remark:{
        type: String,
        maxlength: [200, 'Remark cannot exceed 200 characters'],
        lowercase: true,
    }
});

const Action = mongoose.model('Action', actionSchema);

module.exports = Action;
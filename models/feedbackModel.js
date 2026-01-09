const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    company:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
    },
   service:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
    },
    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5'],
    },
    message: {
        type: String,
        required: [true, 'Message is required'],
        maxlength: [500, 'Message cannot exceed 500 characters'],
        trim: true,
    },
    submmitedBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;
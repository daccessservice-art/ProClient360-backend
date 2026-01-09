const Ticket = require('../models/ticketModel');
const data= require('./ticketData');
const connectDB = require('../config/db');

connectDB();

const initTicket =async ()=>{
    try {
        await Ticket.insertMany(data);
        console.log('Ticket data imported successfully');
        const tickets= await Ticket.find({company:'67613b840ff7c4842f1a20ff'});
        // console.log(tickets);
        console.log(tickets.length);
        process.exit();
    } catch (error) {
        console.error('Error while importing ticket data:', error);
        process.exit(1);
    }
}


initTicket();
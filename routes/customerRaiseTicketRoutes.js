const express = require('express');
const router = express.Router();

const {
  createRaiseTicket,
  getTicketsByCustomer,
  getTicketById,
  updateRaiseTicket,
  deleteRaiseTicket,
} = require('../controllers/customerRaiseTicketController');

const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');

// Create a new raise ticket
router.post('/', permissionMiddleware(['createCustomer', 'createLead']), createRaiseTicket);

// Get all tickets for a specific customer
router.get('/customer/:customerId', permissionMiddleware(['viewCustomer']), getTicketsByCustomer);

// Get single ticket
router.get('/:id', permissionMiddleware(['viewCustomer']), getTicketById);

// Update ticket
router.put('/:id', permissionMiddleware(['updateCustomer']), updateRaiseTicket);

// Delete ticket
router.delete('/:id', permissionMiddleware(['deleteCustomer']), deleteRaiseTicket);

module.exports = router;
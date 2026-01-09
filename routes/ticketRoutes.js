const express = require('express');
const router= express.Router();

const ticketController = require('../controllers/ticketController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/',isLoggedIn, ticketController.showAll);

router.post('/',isLoggedIn ,ticketController.create);

router.put('/:id',isLoggedIn ,ticketController.update);

router.delete('/:id',isLoggedIn ,ticketController.delete);

module.exports= router;
const express = require('express');
const router= express.Router();

const actionController = require('../controllers/actionController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/:taskId', isLoggedIn ,actionController.showAll);

router.post('/',isLoggedIn, actionController.create);

router.put('/:id',isLoggedIn, actionController.update);

router.delete('/:id',isLoggedIn, actionController.delete);

module.exports= router;
const express = require('express');
const router= express.Router();

const serviceActionController = require('../controllers/serviceActionController');
const { isLoggedIn } = require('../middlewares/auth');

router.get('/:serviceId',isLoggedIn ,serviceActionController.showAll);

router.post('/',isLoggedIn ,serviceActionController.create);

// no need to update service action
router.put('/:id',isLoggedIn,serviceActionController.update);

router.delete('/:id',isLoggedIn, serviceActionController.delete);

module.exports= router;
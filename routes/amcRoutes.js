const express = require('express');
const router = express.Router();
const amcController = require('../controllers/amcController');
const {permissionMiddleware, isLoggedIn} = require('../middlewares/auth');

router.get('/',permissionMiddleware(['viewAMC']),amcController.showAll);
router.get('/search',permissionMiddleware(['viewAMC']), amcController.search);
router.post('/', permissionMiddleware(['createAMC']),amcController.create);
router.delete('/:id', permissionMiddleware(['deleteAMC']), amcController.deleteAMC);
router.put('/:id', permissionMiddleware(['updateAMC']), amcController.updateAMC);   
router.get('/:id', permissionMiddleware(['viewAMC']), amcController.getAMC);

module.exports = router;
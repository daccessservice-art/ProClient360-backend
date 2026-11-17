const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middlewares/auth');
const mrf = require('../controllers/projectMrfController');

// Every route: logged in + (company OR designation has an MRF-related permission)
router.use(isLoggedIn, mrf.requireMRFAccess);

// Named routes BEFORE /:id
router.get('/products/search', mrf.searchProducts);
router.get('/project/:projectId', mrf.listByProject);
router.get('/', mrf.listAll);

router.get('/:id', mrf.getOne);
router.post('/', mrf.create);
router.put('/:id', mrf.update);
router.post('/:id/send', mrf.send);
router.delete('/:id', mrf.remove);

module.exports = router;
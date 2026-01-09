const express = require('express');
const router = express.Router();
const { fetchTradeIndiaLeads } = require('../controllers/tradeIndiaLeadController');

// Manual trigger endpoint (for testing or ad-hoc fetching)
router.get('/fetch-leads', async (req, res) => {
  try {
    await fetchTradeIndiaLeads();
    res.status(200).json({ message: 'TradeIndia leads fetch triggered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error triggering TradeIndia leads fetch', error: error.message });
  }
});

module.exports = router;
const axios = require('axios');
const mongoose = require('mongoose');
const cron = require('node-cron');
const winston = require('winston');

const Company = require('../models/companyModel');
const Lead = require('../models/leadsModel.js');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Helper to get 24-hour date range
const getDateRange = () => {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
  const formatDate = (date) => date.toISOString().split('T')[0]; // YYYY-MM-DD
  return {
    from_date: formatDate(fromDate),
    to_date: formatDate(toDate)
  };
};

// Controller to fetch leads
const fetchTradeIndiaLeads = async () => {
  try {
    // Find companies with valid TradeIndia credentials
    const companies = await Company.find({
      'tradeIndiaConfig.userid': { $exists: true, $ne: '' },
      'tradeIndiaConfig.profile_id': { $exists: true, $ne: '' },
      'tradeIndiaConfig.apiKey': { $exists: true, $ne: '' }
    });

    if (!companies || companies.length === 0) {
      logger.error('No companies with valid TradeIndia credentials found');
      return;
    }

    for (const company of companies) {
      const { userid, profile_id, apiKey } = company.tradeIndiaConfig;
      const { from_date, to_date } = getDateRange();

      // API call parameters
      const params = {
        userid,
        profile_id: profile_id,
        key: apiKey,
        from_date,
        to_date,
        limit: 10,
        page_no: 1
      };

      // Make API call with retry logic
      let retries = 3;
      let response;
      while (retries > 0) {
        try {
          response = await axios.get('https://www.tradeindia.com/utils/my_inquiry.html', { params });
          break;
        } catch (error) {
          retries--;
          if (retries === 0) {
            logger.error(`API call failed for company ${company._id} after 3 retries: ${error.message}`);
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }

      const leads = response.data; // Adjust based on actual API response structure
      if (!leads || !Array.isArray(leads)) {
        logger.warn(`No leads found or invalid response format for company ${company._id}`);
        continue;
      }

      // Store leads in MongoDB
      for (const lead of leads) {
        try {
          const leadData = {
            company: company._id,
            UNIQUE_ID_TRADEINDIA: lead.rfi_id,
            SOURCE: 'TradeIndia',
            SENDER_NAME: lead.sender_name || '',
            SENDER_EMAIL: lead.sender_email || '',
            SENDER_MOBILE: lead.sender_mobile || '',
            SUBJECT: lead.subject || '',
            SENDER_COMPANY: lead.sender_company || '',
            SENDER_ADDRESS: lead.sender_address || '',
            SENDER_CITY: lead.sender_city || '',
            SENDER_STATE: lead.sender_state || '',
            SENDER_PINCODE: lead.sender_pincode || '',
            SENDER_COUNTRY_ISO: lead.sender_country_iso || '',
            QUERY_PRODUCT_NAME: lead.query_product_name || '',
            QUERY_MESSAGE: lead.query_message || ''
          };

          await Lead.updateOne(
            { UNIQUE_ID_TRADEINDIA: lead.rfi_id },
            { $set: leadData },
            { upsert: true }
          );

        } catch (error) {
          logger.error(`Failed to store lead ${lead.rfi_id} for company ${company._id}: ${error.message}`);
        }
      }

      console.log(`Fetched and stored ${leads.length} leads for company ${company._id}`);

      logger.info(`Successfully fetched and stored ${leads.length} leads for company ${company._id}`);
    }
  } catch (error) {
    logger.error(`Error in fetchTradeIndiaLeads: ${error.message}`);
  }
};

// Schedule the task every 3 hours (12AM, 3AM, 6AM, 9AM, 12PM, 3PM, 6PM, 9PM)
cron.schedule('0 0 */3 * * *', () => {
  logger.info('Running scheduled TradeIndia API fetch');
  fetchTradeIndiaLeads();
});

// Export for manual trigger or testing
module.exports = { fetchTradeIndiaLeads };
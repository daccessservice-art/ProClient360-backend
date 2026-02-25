const axios = require('axios');
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
  const fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
  const formatDate = (date) => date.toISOString().split('T')[0];
  return {
    from_date: formatDate(fromDate),
    to_date: formatDate(toDate)
  };
};

// ─────────────────────────────────────────────────────────────
// FIX 1: Parse actual inquiry time from TradeIndia response
// TradeIndia returns date in formats like "2026-02-25 14:30:00"
// or "25-02-2026" – we handle both safely
// ─────────────────────────────────────────────────────────────
const parseLeadDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    // TradeIndia format: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;

    // Fallback: "DD-MM-YYYY HH:MM:SS"
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('-');
    if (dateParts.length === 3 && dateParts[0].length === 2) {
      const iso = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}${parts[1] ? ' ' + parts[1] : ''}`;
      const fallback = new Date(iso);
      if (!isNaN(fallback.getTime())) return fallback;
    }
  } catch (e) {
    logger.warn(`Could not parse date: ${dateStr}`);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// FIX 2: Normalize field names from TradeIndia API response
// TradeIndia API can return camelCase OR snake_case field names
// depending on their API version. We handle both.
// ─────────────────────────────────────────────────────────────
const mapLeadFields = (lead, companyId) => {

  // --- DEBUG: Log raw lead on first run to verify field names ---
  // Remove this line after confirming field names are correct
  logger.info('RAW TradeIndia lead sample: ' + JSON.stringify(lead));

  return {
    company: companyId,
    SOURCE: 'TradeIndia',

    // Unique ID - try all possible field names TradeIndia uses
    UNIQUE_ID_TRADEINDIA:
      lead.rfi_id       ||
      lead.RFI_ID       ||
      lead.unique_id    ||
      lead.inquiry_id   ||
      '',

    // Sender Name
    SENDER_NAME:
      lead.sender_name  ||
      lead.SenderName   ||
      lead.buyer_name   ||
      lead.name         ||
      '',

    // ✅ FIX: Company Name - TradeIndia may return as company_name or sender_company
    SENDER_COMPANY:
      lead.sender_company   ||
      lead.company_name     ||
      lead.CompanyName      ||
      lead.buyer_company    ||
      lead.organization     ||
      '',

    // Email
    SENDER_EMAIL:
      lead.sender_email ||
      lead.email        ||
      lead.Email        ||
      '',

    // Mobile
    SENDER_MOBILE:
      lead.sender_mobile  ||
      lead.mobile         ||
      lead.phone          ||
      lead.Mobile         ||
      '',

    // Subject
    SUBJECT:
      lead.subject        ||
      lead.Subject        ||
      lead.inquiry_subject||
      '',

    // ✅ FIX: Product Name - TradeIndia may return as product_name or query_product_name
    QUERY_PRODUCT_NAME:
      lead.query_product_name ||
      lead.product_name       ||
      lead.ProductName        ||
      lead.product            ||
      lead.item_name          ||
      '',

    // Message
    QUERY_MESSAGE:
      lead.query_message  ||
      lead.message        ||
      lead.Message        ||
      lead.inquiry_message||
      '',

    // Address fields
    SENDER_ADDRESS:     lead.sender_address   || lead.address      || '',
    SENDER_CITY:        lead.sender_city      || lead.city         || '',
    SENDER_STATE:       lead.sender_state     || lead.state        || '',
    SENDER_PINCODE:     lead.sender_pincode   || lead.pincode      || lead.zip || '',
    SENDER_COUNTRY_ISO: lead.sender_country_iso || lead.country    || '',

    // ✅ FIX: Save actual inquiry time from TradeIndia, NOT the cron job run time
    // TradeIndia returns the real inquiry time in these fields:
    QUERY_TIME:
      parseLeadDate(lead.rfi_date)        ||
      parseLeadDate(lead.inquiry_date)    ||
      parseLeadDate(lead.created_at)      ||
      parseLeadDate(lead.CreatedAt)       ||
      parseLeadDate(lead.date)            ||
      null,  // null = will fall back to createdAt in frontend
  };
};

// Main controller

const fetchTradeIndiaLeads = async () => {
  try {
    const companies = await Company.find({
      'tradeIndiaConfig.userid':     { $exists: true, $ne: '' },
      'tradeIndiaConfig.profile_id': { $exists: true, $ne: '' },
      'tradeIndiaConfig.apiKey':     { $exists: true, $ne: '' }
    });

    if (!companies || companies.length === 0) {
      logger.warn('No companies with valid TradeIndia credentials found');
      return;
    }

    for (const company of companies) {
      const { userid, profile_id, apiKey } = company.tradeIndiaConfig;
      const { from_date, to_date } = getDateRange();

      const params = {
        userid,
        profile_id,
        key: apiKey,
        from_date,
        to_date,
        limit: 10,
        page_no: 1
      };

      // API call with retry logic
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
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // FIX: TradeIndia API wraps leads in a key - handle all possible response shapes
      let leads = response.data;

      // Common response wrappers TradeIndia uses:
      if (leads && leads.data)           leads = leads.data;
      else if (leads && leads.leads)     leads = leads.leads;
      else if (leads && leads.inquiries) leads = leads.inquiries;
      else if (leads && leads.Results)   leads = leads.Results;
      else if (leads && leads.result)    leads = leads.result;

      if (!leads || !Array.isArray(leads)) {
        logger.warn(`No leads or invalid response for company ${company._id}. Response: ${JSON.stringify(response.data)}`);
        continue;
      }

      let savedCount = 0;
      let skippedCount = 0;

      for (const lead of leads) {
        try {
          const uniqueId =
            lead.rfi_id     ||
            lead.RFI_ID     ||
            lead.unique_id  ||
            lead.inquiry_id ||
            null;

          if (!uniqueId) {
            logger.warn(`Lead has no unique ID, skipping: ${JSON.stringify(lead)}`);
            skippedCount++;
            continue;
          }

          const leadData = mapLeadFields(lead, company._id);

          // FIX: Use $setOnInsert for createdAt so existing leads don't get their
          // creation time overwritten on subsequent cron runs
          const existingLead = await Lead.findOne({ UNIQUE_ID_TRADEINDIA: uniqueId });

          if (existingLead) {
            // Lead already exists — only update fields that were empty/missing before
            const updateFields = {};
            if (!existingLead.SENDER_COMPANY  && leadData.SENDER_COMPANY)  updateFields.SENDER_COMPANY  = leadData.SENDER_COMPANY;
            if (!existingLead.QUERY_PRODUCT_NAME && leadData.QUERY_PRODUCT_NAME) updateFields.QUERY_PRODUCT_NAME = leadData.QUERY_PRODUCT_NAME;
            if (!existingLead.QUERY_TIME       && leadData.QUERY_TIME)       updateFields.QUERY_TIME       = leadData.QUERY_TIME;

            if (Object.keys(updateFields).length > 0) {
              await Lead.updateOne({ _id: existingLead._id }, { $set: updateFields });
              logger.info(`Updated missing fields for lead ${uniqueId}`);
            }
            skippedCount++;
          } else {
            // New lead — create it
            await Lead.create(leadData);
            savedCount++;
          }

        } catch (error) {
          logger.error(`Failed to store lead for company ${company._id}: ${error.message}`);
        }
      }

      console.log(`Company ${company._id}: ${savedCount} new leads saved, ${skippedCount} already existed`);
      logger.info(`Company ${company._id}: ${savedCount} new, ${skippedCount} skipped`);
    }
  } catch (error) {
    logger.error(`Error in fetchTradeIndiaLeads: ${error.message}`);
    console.error('fetchTradeIndiaLeads error:', error.message);
  }
};

// Schedule every 3 hours
cron.schedule('0 0 */3 * * *', () => {
  logger.info('Running scheduled TradeIndia API fetch');
  fetchTradeIndiaLeads();
});

module.exports = { fetchTradeIndiaLeads };
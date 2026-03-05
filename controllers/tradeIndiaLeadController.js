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
// ✅ FIXED: parseLeadDate — treats TradeIndia time as IST
//
// OLD BUG:
//   new Date("2026-03-05 10:45:00") → JS treats as UTC
//   10:45 UTC stored → shows as 16:15 IST in frontend ❌
//
// FIX:
//   Append +05:30 so JS knows it's IST
//   "2026-03-05 10:45:00" → "2026-03-05T10:45:00+05:30"
//   Stored as 05:15 UTC → shows as 10:45 IST ✅
// ─────────────────────────────────────────────────────────────
const parseLeadDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const str = String(dateStr).trim();

    // Format 1: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD HH:MM" ← TradeIndia most common
    const fmt1 = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
    if (fmt1) {
      const parsed = new Date(`${fmt1[1]}T${fmt1[2]}+05:30`); // ✅ force IST
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // Format 2: "DD-MM-YYYY HH:MM:SS" or "DD-MM-YYYY"
    const fmt2 = str.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?$/);
    if (fmt2) {
      const [, dd, mm, yyyy, time] = fmt2;
      const timepart = time || '00:00:00';
      const parsed = new Date(`${yyyy}-${mm}-${dd}T${timepart}+05:30`); // ✅ force IST
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // Format 3: Already has timezone (Z or +HH:MM) — trust it directly
    if (/Z$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    logger.warn(`[TradeIndia] Unrecognized date format: "${str}"`);
  } catch (e) {
    logger.warn(`[TradeIndia] Could not parse date: "${dateStr}" — ${e.message}`);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// Normalize field names from TradeIndia API response
// ─────────────────────────────────────────────────────────────
const mapLeadFields = (lead, companyId) => {
  logger.info('RAW TradeIndia lead sample: ' + JSON.stringify(lead));

  return {
    company: companyId,
    SOURCE: 'TradeIndia',

    UNIQUE_ID_TRADEINDIA:
      lead.rfi_id       ||
      lead.RFI_ID       ||
      lead.unique_id    ||
      lead.inquiry_id   ||
      '',

    SENDER_NAME:
      lead.sender_name  ||
      lead.SenderName   ||
      lead.buyer_name   ||
      lead.name         ||
      '',

    SENDER_COMPANY:
      lead.sender_company   ||
      lead.company_name     ||
      lead.CompanyName      ||
      lead.buyer_company    ||
      lead.organization     ||
      '',

    SENDER_EMAIL:
      lead.sender_email ||
      lead.email        ||
      lead.Email        ||
      '',

    SENDER_MOBILE:
      lead.sender_mobile  ||
      lead.mobile         ||
      lead.phone          ||
      lead.Mobile         ||
      '',

    SUBJECT:
      lead.subject        ||
      lead.Subject        ||
      lead.inquiry_subject||
      '',

    QUERY_PRODUCT_NAME:
      lead.query_product_name ||
      lead.product_name       ||
      lead.ProductName        ||
      lead.product            ||
      lead.item_name          ||
      '',

    QUERY_MESSAGE:
      lead.query_message  ||
      lead.message        ||
      lead.Message        ||
      lead.inquiry_message||
      '',

    SENDER_ADDRESS:     lead.sender_address     || lead.address  || '',
    SENDER_CITY:        lead.sender_city        || lead.city     || '',
    SENDER_STATE:       lead.sender_state       || lead.state    || '',
    SENDER_PINCODE:     lead.sender_pincode     || lead.pincode  || lead.zip || '',
    SENDER_COUNTRY_ISO: lead.sender_country_iso || lead.country  || '',

    // ✅ FIXED: parseLeadDate now correctly appends +05:30 (IST)
    QUERY_TIME:
      parseLeadDate(lead.rfi_date)        ||
      parseLeadDate(lead.inquiry_date)    ||
      parseLeadDate(lead.created_at)      ||
      parseLeadDate(lead.CreatedAt)       ||
      parseLeadDate(lead.date)            ||
      null,
  };
};

// ─────────────────────────────────────────────────────────────
// Main fetch function
// ─────────────────────────────────────────────────────────────
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

      // Handle all possible TradeIndia response shapes
      let leads = response.data;
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
          const existingLead = await Lead.findOne({ UNIQUE_ID_TRADEINDIA: uniqueId });

          if (existingLead) {
            const updateFields = {};
            if (!existingLead.SENDER_COMPANY     && leadData.SENDER_COMPANY)     updateFields.SENDER_COMPANY     = leadData.SENDER_COMPANY;
            if (!existingLead.QUERY_PRODUCT_NAME && leadData.QUERY_PRODUCT_NAME) updateFields.QUERY_PRODUCT_NAME = leadData.QUERY_PRODUCT_NAME;
            if (!existingLead.QUERY_TIME         && leadData.QUERY_TIME)         updateFields.QUERY_TIME         = leadData.QUERY_TIME;

            if (Object.keys(updateFields).length > 0) {
              await Lead.updateOne({ _id: existingLead._id }, { $set: updateFields });
              logger.info(`Updated missing fields for lead ${uniqueId}`);
            }
            skippedCount++;
          } else {
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
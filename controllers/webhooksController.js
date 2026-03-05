const Company = require('../models/companyModel');
const Lead = require('../models/leadsModel.js');

// ─────────────────────────────────────────────────────────────
// ✅ FIXED: parseIndiaMartTime
//
// IndiaMart sends time in IST (no timezone marker)
// e.g. lead came at 14:17 IST → IndiaMart sends "14:17:00" (IST, no timezone)
//
// REAL BUG: new Lead(r) was spreading raw r object
//           Mongoose parsed QUERY_TIME string as UTC automatically
//           So 14:17 IST string → stored as 14:17 UTC → showed as 19:47 IST ❌
//
// FIX: Build lead manually (not new Lead(r)) + append +05:30 to force IST
//      "14:17:00" + "+05:30" → stored as 08:47 UTC → shows as 14:17 IST ✅
// ─────────────────────────────────────────────────────────────
const parseIndiaMartTime = (rawStr) => {
  if (!rawStr) return null;
  const str = String(rawStr).trim();

  // Already has explicit timezone at end → trust it directly
  if (/Z$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // "DD-Mon-YYYY HH:MM:SS" e.g. "05-Mar-2026 14:17:00" → treat as IST
  const months = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12'
  };
  const matchDMY = str.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (matchDMY) {
    const [, dd, mon, yyyy, time] = matchDMY;
    const mm = months[mon.toLowerCase()];
    if (mm) {
      const parsed = new Date(`${yyyy}-${mm}-${dd}T${time}+05:30`); // ✅ IST
      if (!isNaN(parsed.getTime())) {
        console.log(`[IndiaMart] Parsed IST: ${parsed.toISOString()} → IST display: ${parsed.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        return parsed;
      }
    }
  }

  // "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" → treat as IST
  const matchYMD = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (matchYMD) {
    const parsed = new Date(`${matchYMD[1]}T${matchYMD[2]}+05:30`); // ✅ IST
    if (!isNaN(parsed.getTime())) {
      console.log(`[IndiaMart] Parsed IST: ${parsed.toISOString()} → IST display: ${parsed.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      return parsed;
    }
  }

  // "DD-MM-YYYY HH:MM:SS" → treat as IST
  const matchDMYNum = str.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?$/);
  if (matchDMYNum) {
    const [, dd, mm, yyyy, time] = matchDMYNum;
    const timepart = time || '00:00:00';
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${timepart}+05:30`); // ✅ IST
    if (!isNaN(parsed.getTime())) return parsed;
  }

  console.warn(`[IndiaMart] Unrecognized date format: "${str}"`);
  return null;
};

exports.indiaMartWebhook = async (req, res) => {
    const { id } = req.params;
    const leadData = req.body;

    try {
        const company = await Company.findOne({ indiamartId: id });
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }

        const existingLead = await Lead.findOne({
            UNIQUE_QUERY_ID_IndiaMart: leadData.RESPONSE?.UNIQUE_QUERY_ID,
            company: company._id
        });
        if (existingLead) {
            return res.status(200).json({ error: "Lead already exists", lead: existingLead });
        }

        if (leadData.STATUS === "SUCCESS") {
            const r = leadData.RESPONSE;

            // DEBUG logs
            console.log("=== IndiaMart RAW RESPONSE ===");
            console.log(JSON.stringify(r, null, 2));
            console.log("IndiaMart TIME fields:", {
              QUERY_TIME:   r.QUERY_TIME,
              query_time:   r.query_time,
              CREATED_ON:   r.CREATED_ON,
              created_on:   r.created_on,
              INQUIRY_DATE: r.INQUIRY_DATE,
              inquiry_date: r.inquiry_date,
              QUERY_DATE:   r.QUERY_DATE,
              query_date:   r.query_date,
              DATE:         r.DATE,
              date:         r.date,
            });

            // ✅ Build lead manually — do NOT use new Lead(r)
            // new Lead(r) lets Mongoose auto-parse QUERY_TIME string as UTC ❌
            const newLead = new Lead();
            newLead.company                   = company._id;
            newLead.SOURCE                    = "IndiaMart";
            newLead.UNIQUE_QUERY_ID_IndiaMart = r.UNIQUE_QUERY_ID;
            newLead.SENDER_NAME               = r.SENDER_NAME        || '';
            newLead.SENDER_EMAIL              = r.SENDER_EMAIL       || '';
            newLead.SENDER_MOBILE             = r.SENDER_MOBILE      || '';
            newLead.SUBJECT                   = r.SUBJECT            || '';
            newLead.SENDER_COMPANY            = r.SENDER_COMPANY     || '';
            newLead.SENDER_ADDRESS            = r.SENDER_ADDRESS     || '';
            newLead.SENDER_CITY               = r.SENDER_CITY        || '';
            newLead.SENDER_STATE              = r.SENDER_STATE       || '';
            newLead.SENDER_PINCODE            = r.SENDER_PINCODE     || '';
            newLead.SENDER_COUNTRY_ISO        = r.SENDER_COUNTRY_ISO || '';
            newLead.QUERY_PRODUCT_NAME        = r.QUERY_PRODUCT_NAME || '';
            newLead.QUERY_MESSAGE             = r.QUERY_MESSAGE      || '';

            // Try all possible time field names IndiaMart might send
            const rawTimeStr =
                r.QUERY_TIME        ||
                r.query_time        ||
                r.CREATED_ON        ||
                r.created_on        ||
                r.INQUIRY_DATE      ||
                r.inquiry_date      ||
                r.QUERY_DATE        ||
                r.query_date        ||
                r.DATE              ||
                r.date              ||
                null;

            // ✅ FIXED: parse as IST (IndiaMart sends IST time without timezone marker)
            const parsedTime = parseIndiaMartTime(rawTimeStr);
            newLead.QUERY_TIME = parsedTime || new Date();

            // Verification logs
            console.log("rawTimeStr from IndiaMart:", rawTimeStr);
            console.log("QUERY_TIME stored (UTC):", newLead.QUERY_TIME.toISOString());
            console.log("QUERY_TIME display (IST):", newLead.QUERY_TIME.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

            await newLead.save();
            return res.status(200).json({ message: "Lead created successfully" });
        }

        return res.status(400).json({ error: "Lead creation failed", details: leadData });

    } catch (error) {
        console.error("Error in IndiaMart webhook:", error);
        return res.status(500).json({ error: "Internal Server Error: " + error.message });
    }
};

exports.googleWebhook = async (req, res) => {
    const { id } = req.params;
    const leadData = req.body;
    try {
        console.log("Google Webhook Data:", leadData);
        return res.status(400).json({ error: "Lead creation failed", details: leadData });
    } catch (error) {
        console.error("Error in Google webhook:", error);
        return res.status(500).json({ error: "Internal Server Error: " + error.message });
    }
};
const Company = require('../models/companyModel');
const Lead = require('../models/leadsModel.js');

exports.indiaMartWebhook = async (req, res) => {
    const { id } = req.params;
    const leadData = req.body;

    try {
        const company = await Company.findOne({ indiamartId: id });
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }

        const existingLead = await Lead.findOne({
            UNIQUE_QUERY_ID_IndiaMart: leadData.RESPONSE.UNIQUE_QUERY_ID,
            company: company._id
        });
        if (existingLead) {
            return res.status(200).json({ error: "Lead already exists", lead: existingLead });
        }

        if (leadData.STATUS === "SUCCESS") {
            const r = leadData.RESPONSE;

            // ✅ DEBUG: Log raw IndiaMart response to find exact time field name
            console.log("IndiaMart RAW RESPONSE fields:", JSON.stringify(r, null, 2));

            const newLead = new Lead(r);
            newLead.company = company._id;
            newLead.UNIQUE_QUERY_ID_IndiaMart = r.UNIQUE_QUERY_ID;
            newLead.SOURCE = "IndiaMart";

            // ✅ FIX: Save actual IndiaMart inquiry time into QUERY_TIME
            // IndiaMart sends time in one of these fields:
            const rawTime =
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

            // If IndiaMart sends time → save it, else save current time (webhook receive time)
            newLead.QUERY_TIME = rawTime ? new Date(rawTime) : new Date();

            console.log("IndiaMart QUERY_TIME saved as:", newLead.QUERY_TIME);

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
const Company = require('../models/companyModel');
const  Lead= require('../models/leadsModel.js');

exports.indiaMartWebhook = async (req, res) => {
    const {id} = req.params;
    const leadData = req.body;

    try {

        const company = await Company.findOne({ indiamartId: id });        
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }

        const exestingLead = await Lead.findOne({ UNIQUE_QUERY_ID_IndiaMart: leadData.RESPONSE.UNIQUE_QUERY_ID, company: company._id });
        if (exestingLead) {
            return res.status(200).json({ error: "Lead already exists", lead: exestingLead });
        }

        if(leadData.STATUS === "SUCCESS"){
            // save the unique query ID with india mart tag for unique identification
            const newLead =new Lead(leadData.RESPONSE);
            newLead.company = company._id;
            newLead.UNIQUE_QUERY_ID_IndiaMart = leadData.RESPONSE.UNIQUE_QUERY_ID;
            newLead.SOURCE = "IndiaMart";
            await newLead.save();
            return res.status(200).json({ message: "Lead created successfully"});
        }
        return res.status(400).json({ error: "Lead creation failed", details: leadData });
    }catch (error) {
        console.error("Error in IndiaMart webhook:", error);
        return res.status(500).json({ error: "Internal Server Error: " + error.message });
    }

}


exports.googleWebhook = async (req, res) => {
    const {id} = req.params;
    const leadData = req.body;

    try {

        console.log("Google Webhook Data:", leadData);
        return res.status(400).json({ error: "Lead creation failed", details: leadData });
    }catch (error) {
        console.error("Error in Google webhook:", error);
        return res.status(500).json({ error: "Internal Server Error: " + error.message });
    }
} 
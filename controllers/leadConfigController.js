const Compony = require('../models/companyModel');

exports.getLeadConfig = async (req, res) => {
    try {
        const user =  req.user;
        const company = await Compony.findById(user._id).select('tradeIndiaApiKey', 'name');
        if(!company) {
            return res.status(404).json({ error: 'Invalid user' });
        }
        return res.status(200).json({
            success: true,
            tradeIndiaApiKey: company.tradeIndiaApiKey,
            companyName: company.name
        });
    }catch (error) {
        console.error('Error fetching lead config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

exports.updateLeadConfig= async (req, res) => {
    try{
        const user = req.user;
        const { tradeIndiaConfig } = req.body;

        if (!tradeIndiaConfig.userid) {
            return res.status(400).json({ error: 'userid is required' });
        }
        if(!tradeIndiaConfig.profile_id) {
            return res.status(400).json({ error: 'profile_id is required' });
        }
        if(!tradeIndiaConfig.apiKey) {
            return res.status(400).json({ error: 'key is required' });
        }

        const company = await Compony.findById(user._id);
        if(!company){
            return res.status(404).json({ error: 'Invalid user' });
        }

        company.tradeIndiaConfig = tradeIndiaConfig;
        await company.save();

        return res.status(200).json({
           success: true,
            message: 'Lead configuration updated successfully',
            
        });
    }catch(error){
        console.error('Error updating lead config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
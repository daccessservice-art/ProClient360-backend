const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');

// Function to auto-mark leads as "not-feasible" if no action taken for 30 days
const autoMarkStaleLeads = async () => {
  try {
    console.log('Running auto-mark stale leads job...');
    
    // Calculate date 30 days ago from today
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    
    console.log('Marking leads created before:', thirtyDaysAgo.toISOString());
    
    // Find all leads that:
    // 1. Were created more than 30 days ago
    // 2. Still have feasibility = "none" (no action taken)
    const staleLeads = await Lead.find({
      createdAt: { $lt: thirtyDaysAgo },
      feasibility: 'none'
    });
    
    console.log(`Found ${staleLeads.length} stale leads to mark as not-feasible`);
    
    if (staleLeads.length > 0) {
      // Update all stale leads
      const result = await Lead.updateMany(
        {
          createdAt: { $lt: thirtyDaysAgo },
          feasibility: 'none'
        },
        {
          $set: {
            feasibility: 'not-feasible',
            remark: `Automatically marked as not feasible - No action taken for 30 days (since ${thirtyDaysAgo.toLocaleDateString()})`,
            autoMarkedDate: new Date()
          }
        }
      );
      
      console.log(`Successfully marked ${result.modifiedCount} leads as not-feasible`);
      
      // Log the IDs of the leads that were updated for verification
      const updatedLeads = await Lead.find({
        createdAt: { $lt: thirtyDaysAgo },
        feasibility: 'not-feasible',
        autoMarkedDate: { $exists: true }
      }).select('_id SENDER_COMPANY createdAt');
      
      console.log('Updated leads:');
      updatedLeads.forEach(lead => {
        console.log(`- ID: ${lead._id}, Company: ${lead.SENDER_COMPANY}, Created: ${lead.createdAt}`);
      });
    }
    
    return {
      success: true,
      markedCount: staleLeads.length,
      date: new Date()
    };
  } catch (error) {
    console.error('Error in autoMarkStaleLeads:', error);
    return {
      success: false,
      error: error.message,
      date: new Date()
    };
  }
};

module.exports = { autoMarkStaleLeads };
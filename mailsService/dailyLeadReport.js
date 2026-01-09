const transporter = require("./emailTransporter");
const Lead = require('../models/leadsModel.js');
const Employee = require('../models/employeeModel');
const {formatDate} = require('../utils/formatDate');
const cron = require('node-cron');

// Function to send emails in batches to prevent suspension
const sendEmailInBatches = async (recipients, mailOptions, companyName) => {
  const MAX_RECIPIENTS_PER_EMAIL = 5; // Limit recipients per email
  const batches = [];
  
  // Split recipients into batches of 5 or fewer
  for (let i = 0; i < recipients.length; i += MAX_RECIPIENTS_PER_EMAIL) {
    batches.push(recipients.slice(i, i + MAX_RECIPIENTS_PER_EMAIL));
  }
  
  console.log(`Sending to ${recipients.length} recipients in ${batches.length} batches for ${companyName}`);
  
  // Send each batch with a delay
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchOptions = {
      ...mailOptions,
      to: batch.join(','),
      subject: `${mailOptions.subject} [Batch ${i+1}/${batches.length}]`
    };
    
    try {
      const result = await new Promise((resolve, reject) => {
        transporter.sendMail(batchOptions, (error, info) => {
          if (error) {
            console.error(`Batch ${i+1} failed for ${companyName}:`, error.message);
            reject(error);
          } else {
            console.log(`✅ Batch ${i+1}/${batches.length} sent to ${batch.length} recipients for ${companyName}`);
            resolve(info);
          }
        });
      });
      
      // Wait 5 seconds between batches (except after the last one)
      if (i < batches.length - 1) {
        console.log(`Waiting 5 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`Error sending batch ${i+1} for ${companyName}:`, error.message);
      // Continue with next batch even if one fails
    }
  }
};

// Function to send the daily lead report
const sendDailyLeadReport = async (isScheduledRun = false) => {
  try {
    // Check if this is a scheduled run or if we're in production
    // If it's not a scheduled run and we're in development, don't send emails
    if (!isScheduledRun && process.env.NODE_ENV === 'development') {
      console.log('🔍 Development mode detected. Skipping email sending to avoid hitting daily limit.');
      console.log('📊 Report would be generated but emails are not sent in development mode.');
    }
    
    // In production, only send emails if this is a scheduled run
    if (process.env.NODE_ENV === 'production' && !isScheduledRun) {
      console.log('🔍 Production mode detected but not a scheduled run. Skipping email sending.');
      console.log('📊 Report would be generated but emails are not sent outside scheduled times.');
    }
    
    console.log('=== Starting daily lead report generation at:', new Date().toISOString(), '===');
    console.log('🔧 Environment:', process.env.NODE_ENV || 'Not set');
    console.log('📧 Email Sending:', isScheduledRun ? 'ENABLED (Scheduled Run)' : 'DISABLED (Manual Run)');
    
    // Get today's date range
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // First, get the designation IDs for the target designations
    const Designation = require('../models/designationModel');
    const targetDesignationNames = [
      'Director Customer Delight',
      'CEO & Founder',
      'Director Digi Solution',
      'Junior Software Developer'
    ];
    
    const targetDesignations = await Designation.find({
      name: { $in: targetDesignationNames }
    }).select('_id');
    
    const designationIds = targetDesignations.map(d => d._id);
    console.log('Found target designation IDs:', designationIds);

    // Get all companies that have employees with the target designations
    const companies = await Employee.distinct('company', { 
      designation: { $in: designationIds }
    });

    console.log(`Found ${companies.length} companies to send reports to`);

    // Process companies with delays between them
    for (let i = 0; i < companies.length; i++) {
      const companyId = companies[i];
      
      try {
        console.log(`Processing company ${i+1}/${companies.length}: ${companyId}`);
        
        // DEBUGGING: Check if IndiaMart leads exist in the database
        // Use case-insensitive query to find any variations of "IndiaMart"
        const allIndiaMartLeads = await Lead.find({ 
          company: companyId,
          SOURCE: { $regex: /IndiaMart/i } // Case-insensitive regex
        }).lean();
        
        console.log(`🔍 DEBUG: Found ${allIndiaMartLeads.length} total IndiaMart leads for company ${companyId}`);
        
        // If in development mode and no IndiaMart leads exist, create some sample data
        if (process.env.NODE_ENV === 'development' && allIndiaMartLeads.length === 0) {
          console.log(`🔍 DEVELOPMENT MODE: No IndiaMart leads found for company ${companyId}. Creating sample data...`);
          
          // Create some sample IndiaMart leads for testing
          const sampleLeads = [
            {
              company: companyId,
              SENDER_COMPANY: 'Sample IndiaMart Company 1',
              SENDER_NAME: 'John Doe',
              SENDER_MOBILE: '9876543210',
              QUERY_PRODUCT_NAME: 'Sample Product 1',
              SOURCE: 'IndiaMart',
              feasibility: 'feasible',
              createdAt: new Date()
            },
            {
              company: companyId,
              SENDER_COMPANY: 'Sample IndiaMart Company 2',
              SENDER_NAME: 'Jane Smith',
              SENDER_MOBILE: '9876543211',
              QUERY_PRODUCT_NAME: 'Sample Product 2',
              SOURCE: 'IndiaMart',
              feasibility: 'not-feasible',
              remark: 'Out of service area',
              createdAt: new Date()
            },
            {
              company: companyId,
              SENDER_COMPANY: 'Sample IndiaMart Company 3',
              SENDER_NAME: 'Bob Johnson',
              SENDER_MOBILE: '9876543212',
              QUERY_PRODUCT_NAME: 'Sample Product 3',
              SOURCE: 'IndiaMart',
              feasibility: 'none',
              createdAt: new Date()
            }
          ];
          
          await Lead.insertMany(sampleLeads);
          console.log(`🔍 DEVELOPMENT MODE: Created ${sampleLeads.length} sample IndiaMart leads for company ${companyId}`);
          
          // Refresh the allIndiaMartLeads after creating sample data
          const updatedIndiaMartLeads = await Lead.find({ 
            company: companyId,
            SOURCE: { $regex: /IndiaMart/i }
          }).lean();
          
          console.log(`🔍 DEBUG: After creating samples, now have ${updatedIndiaMartLeads.length} IndiaMart leads for company ${companyId}`);
        }
        
        // Get today's leads from TradeIndia, IndiaMart, and manually added (Direct)
        // Use case-insensitive query for IndiaMart
        const todayLeads = await Lead.find({
          company: companyId,
          createdAt: {
            $gte: startOfToday,
            $lt: endOfToday
          },
          $or: [
            { SOURCE: 'TradeIndia' },
            { SOURCE: { $regex: /IndiaMart/i } }, // Case-insensitive regex for IndiaMart
            { SOURCE: 'Direct' }
          ]
        }).lean();

        // DEBUGGING: Check leads by source
        const tradeIndiaLeads = todayLeads.filter(lead => 
          lead.SOURCE === 'TradeIndia' || lead.SOURCE === 'TradeIndia '
        );
        const indiaMartLeads = todayLeads.filter(lead => 
          lead.SOURCE && lead.SOURCE.match(/IndiaMart/i) // Case-insensitive match
        );
        const directLeads = todayLeads.filter(lead => 
          lead.SOURCE === 'Direct' || lead.SOURCE === 'Direct '
        );
        
        console.log(`🔍 DEBUG: Today's leads for company ${companyId}:`);
        console.log(`  - TradeIndia: ${tradeIndiaLeads.length} leads`);
        console.log(`  - IndiaMart: ${indiaMartLeads.length} leads`);
        console.log(`  - Direct: ${directLeads.length} leads`);
        
        // If no IndiaMart leads found today, check if there are any recent ones
        if (indiaMartLeads.length === 0 && allIndiaMartLeads.length > 0) {
          const recentIndiaMartLeads = allIndiaMartLeads
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);
          
          console.log(`🔍 DEBUG: Most recent IndiaMart leads for company ${companyId}:`);
          recentIndiaMartLeads.forEach((lead, index) => {
            console.log(`  ${index + 1}. ${lead.SENDER_COMPANY} - ${lead.createdAt} - SOURCE: "${lead.SOURCE}"`);
          });
        }

        // Count leads by feasibility
        const allLeadsCount = todayLeads.length;
        const feasibleLeads = todayLeads.filter(lead => lead.feasibility === 'feasible');
        const notFeasibleLeads = todayLeads.filter(lead => lead.feasibility === 'not-feasible');
        const pendingLeads = todayLeads.filter(lead => lead.feasibility === 'none');

        // Get ONLY employees with the target designations and valid emails
        const recipients = await Employee.find({
          company: companyId,
          designation: { $in: designationIds },
          email: { $exists: true, $ne: '' }
        }).select('name email designation').populate('designation', 'name');

        if (recipients.length === 0) {
          console.log(`No recipients with target designations found for company ${companyId}`);
          continue;
        }

        // Get company name
        const company = await Employee.findById(companyId).select('name');
        const companyName = company ? company.name : 'Your Company';

        // Group leads by source
        const leadsBySource = {
          'TradeIndia': tradeIndiaLeads,
          'IndiaMart': indiaMartLeads,
          'Direct': directLeads
        };

        // Group recipients by designation for reporting
        const recipientsByDesignation = {
          'Director Customer Delight': recipients.filter(r => r.designation && r.designation.name === 'Director Customer Delight'),
          'CEO & Founder': recipients.filter(r => r.designation && r.designation.name === 'CEO & Founder'),
          'Director Digi Solution': recipients.filter(r => r.designation && r.designation.name === 'Director Digi Solution'),
          'Junior Software Developer': recipients.filter(r => r.designation && r.designation.name === 'Junior Software Developer')
        };

        // Create HTML email content
        const emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Daily Lead Report</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f7fa; }
              .container { max-width: 900px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
              .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 16px; }
              .content { padding: 30px; }
              .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
              .stat-card { background: white; border-radius: 8px; padding: 20px; text-align: center; border-left: 4px solid; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
              .stat-card.all { border-color: #3b82f6; }
              .stat-card.feasible { border-color: #10b981; }
              .stat-card.not-feasible { border-color: #ef4444; }
              .stat-card.pending { border-color: #f59e0b; }
              .stat-number { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
              .stat-label { color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
              .section-title { font-size: 20px; font-weight: 600; margin: 30px 0 15px 0; color: #1f2937; }
              .source-section { margin-bottom: 25px; }
              .source-name { font-weight: 600; color: #4b5563; margin-bottom: 10px; display: inline-block; background: #f3f4f6; padding: 5px 12px; border-radius: 20px; font-size: 14px; }
              .lead-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              .lead-table th, .lead-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
              .lead-table th { background-color: #f9fafb; font-weight: 600; color: #374151; }
              .lead-table tr:hover { background-color: #f9fafb; }
              .feasibility-badge { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
              .badge-feasible { background-color: #d1fae5; color: #065f46; }
              .badge-not-feasible { background-color: #fee2e2; color: #991b1b; }
              .badge-pending { background-color: #fed7aa; color: #92400e; }
              .no-leads { text-align: center; color: #9ca3af; padding: 20px; font-style: italic; }
              .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; }
              .footer p { margin: 5px 0; }
              .recipients-info { background-color: #f0f9ff; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
              .recipients-title { font-weight: 600; margin-bottom: 8px; color: #1e40af; }
              .recipients-list { display: flex; flex-wrap: wrap; gap: 10px; }
              .recipient-badge { background-color: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 12px; font-size: 12px; }
              ${!isScheduledRun ? '.dev-notice { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px; color: #92400e; }' : ''}
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📊 Daily Lead Report</h1>
                <p>${companyName} - ${formatDate(today)}</p>
              </div>
              
              <div class="content">
                ${!isScheduledRun ? 
                  '<div class="dev-notice">⚠️ PREVIEW MODE: This is a preview of the report. No emails were sent.</div>' : 
                  ''
                }
                
                <div class="recipients-info">
                  <div class="recipients-title">This report has been sent to key personnel:</div>
                  <div class="recipients-list">
                    ${Object.entries(recipientsByDesignation).map(([designation, people]) => 
                      people.length > 0 ? 
                        `<span class="recipient-badge">${designation} (${people.length})</span>` : ''
                    ).join('')}
                  </div>
                </div>
                
                <div class="stats-grid">
                  <div class="stat-card all">
                    <div class="stat-number">${allLeadsCount}</div>
                    <div class="stat-label">All Leads</div>
                  </div>
                  <div class="stat-card feasible">
                    <div class="stat-number">${feasibleLeads.length}</div>
                    <div class="stat-label">Feasible</div>
                  </div>
                  <div class="stat-card not-feasible">
                    <div class="stat-number">${notFeasibleLeads.length}</div>
                    <div class="stat-label">Not Feasible</div>
                  </div>
                  <div class="stat-card pending">
                    <div class="stat-number">${pendingLeads.length}</div>
                    <div class="stat-label">Pending Review</div>
                  </div>
                </div>
                
                ${allLeadsCount > 0 ? `
                  <div>
                    <h2 class="section-title">📋 Lead Details by Source</h2>
                    ${Object.entries(leadsBySource).map(([source, leads]) => `
                      ${leads.length > 0 ? `
                        <div class="source-section">
                          <span class="source-name">${source} (${leads.length} leads)</span>
                          <table class="lead-table">
                            <thead>
                              <tr>
                                <th>Company Name</th>
                                <th>Contact Person</th>
                                <th>Product</th>
                                <th>Mobile</th>
                                <th>Feasibility</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${leads.map(lead => `
                                <tr>
                                  <td>${lead.SENDER_COMPANY || 'N/A'}</td>
                                  <td>${lead.SENDER_NAME || 'N/A'}</td>
                                  <td>${lead.QUERY_PRODUCT_NAME || 'N/A'}</td>
                                  <td>${lead.SENDER_MOBILE || 'N/A'}</td>
                                  <td>
                                    <span class="feasibility-badge ${
                                      lead.feasibility === 'feasible' ? 'badge-feasible' : 
                                      lead.feasibility === 'not-feasible' ? 'badge-not-feasible' : 
                                      'badge-pending'
                                    }">
                                      ${lead.feasibility === 'feasible' ? '✅ Feasible' : 
                                        lead.feasibility === 'not-feasible' ? '❌ Not Feasible' : 
                                        '⏳ Pending'}
                                    </span>
                                  </td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                      ` : ''}
                    `).join('')}
                  </div>
                  
                  ${notFeasibleLeads.length > 0 ? `
                    <div>
                      <h2 class="section-title">❌ Not Feasible Reasons</h2>
                      <table class="lead-table">
                        <thead>
                          <tr>
                            <th>Company Name</th>
                            <th>Contact Person</th>
                            <th>Source</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${notFeasibleLeads.map(lead => `
                            <tr>
                              <td>${lead.SENDER_COMPANY || 'N/A'}</td>
                              <td>${lead.SENDER_NAME || 'N/A'}</td>
                              <td>${lead.SOURCE || 'N/A'}</td>
                              <td>${lead.remark || 'No reason provided'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  ` : ''}
                ` : '<div class="no-leads">No leads received today from TradeIndia, IndiaMart, or manual entry.</div>'}
              </div>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} ProClient360. All rights reserved.</p>
                <p>This automated report is sent at 10:00 AM and 6:00 PM daily. Last updated: ${new Date().toLocaleTimeString()}</p>
                ${!isScheduledRun ? 
                  '<p>🔍 Preview Mode - This is a preview of the report. No emails were sent.</p>' : 
                  ''
                }
              </div>
            </div>
          </body>
          </html>
        `;

        // Send email to all recipients with valid emails
        const recipientEmails = recipients
          .map(r => r.email)
          .filter(email => email && email.includes('@'));
        
        // Only send emails if this is a scheduled run (both in development and production)
        if (recipientEmails.length > 0 && isScheduledRun) {
          const mailOptions = {
            from: `ProClient360 <${process.env.EMAIL}>`,
            subject: `📊 Daily Lead Report - ${companyName} - ${formatDate(today)}`,
            html: emailContent
          };

          // Send emails in batches to prevent suspension
          await sendEmailInBatches(recipientEmails, mailOptions, companyName);
          
          // Log recipients by designation for tracking
          console.log(`Recipients by designation for ${companyName}:`, {
            'Director Customer Delight': recipientsByDesignation['Director Customer Delight'].length,
            'CEO & Founder': recipientsByDesignation['CEO & Founder'].length,
            'Director Digi Solution': recipientsByDesignation['Director Digi Solution'].length,
            'Junior Software Developer': recipientsByDesignation['Junior Software Developer'].length
          });
        } else if (recipientEmails.length === 0) {
          console.log(`No valid email addresses found for company ${companyId}`);
        } else if (!isScheduledRun) {
          console.log(`🔍 PREVIEW MODE: Email content generated but not sent (not a scheduled run)`);
        }
        
        // Add delay between companies to prevent rate limiting
        if (i < companies.length - 1) {
          console.log(`Waiting 10 seconds before processing next company...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      } catch (companyError) {
        console.error(`Error processing company ${companyId}:`, companyError.message);
        // Continue with next company even if one fails
      }
    }
    
    console.log('=== Daily lead report generation completed at:', new Date().toISOString(), '===');
    return true;
  } catch (error) {
    console.error("Error in sendDailyLeadReport:", error.message);
    return false;
  }
};

// Initialize the scheduler
let scheduledTask = null;

const initializeDailyLeadReportScheduler = () => {
  // If a task is already scheduled, destroy it first
  if (scheduledTask) {
    scheduledTask.destroy();
  }
  
  // Schedule the daily lead report to run at 10:00 AM and 6:00 PM
  // This will run at: 10:00 and 18:00 each day
  scheduledTask = cron.schedule('0 10,18 * * *', async () => {
    console.log('⏰ CRON JOB: Running daily lead report scheduler at:', new Date().toISOString());
    const result = await sendDailyLeadReport(true); // Pass true to indicate this is a scheduled run
    if (result) {
      console.log('✅ CRON JOB: Daily lead report sent successfully.');
    } else {
      console.log('❌ CRON JOB: Failed to send daily lead report.');
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust timezone as needed
  });
  
  console.log('📅 Daily lead report scheduler initialized to run at 10:00 AM and 6:00 PM daily.');
  
  // Don't run at startup in production to avoid duplicate emails
  // In development, we can still run it for testing if needed
  if (process.env.NODE_ENV === 'development') {
    setTimeout(async () => {
      console.log('🚀 DEVELOPMENT MODE: Running initial daily lead report at startup for testing...');
      const result = await sendDailyLeadReport(true); // Pass true to indicate this is a scheduled run
      if (result) {
        console.log('✅ DEVELOPMENT MODE: Initial daily lead report sent successfully.');
      }
    }, 10000); // Wait 10 seconds after server start
  }
};

// Export the functions
module.exports = {
  sendDailyLeadReport,
  initializeDailyLeadReportScheduler
};
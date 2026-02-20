const transporter = require("./emailTransporter");
const Lead = require('../models/leadsModel.js');
const Employee = require('../models/employeeModel');
const {formatDate} = require('../utils/formatDate');
const cron = require('node-cron');

// Function to send emails in batches to prevent suspension
const sendEmailInBatches = async (recipients, mailOptions, companyName) => {
  const MAX_RECIPIENTS_PER_EMAIL = 5;
  const batches = [];
  
  for (let i = 0; i < recipients.length; i += MAX_RECIPIENTS_PER_EMAIL) {
    batches.push(recipients.slice(i, i + MAX_RECIPIENTS_PER_EMAIL));
  }
  
  console.log(`Sending to ${recipients.length} recipients in ${batches.length} batches for ${companyName}`);
  
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
      
      if (i < batches.length - 1) {
        console.log(`Waiting 5 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`Error sending batch ${i+1} for ${companyName}:`, error.message);
    }
  }
};

// Function to send the daily lead report
const sendDailyLeadReport = async (isScheduledRun = false) => {
  try {
    if (!isScheduledRun && process.env.NODE_ENV === 'development') {
      console.log('🔍 Development mode detected. Skipping email sending to avoid hitting daily limit.');
      console.log('📊 Report would be generated but emails are not sent in development mode.');
    }
    
    if (process.env.NODE_ENV === 'production' && !isScheduledRun) {
      console.log('🔍 Production mode detected but not a scheduled run. Skipping email sending.');
      console.log('📊 Report would be generated but emails are not sent outside scheduled times.');
    }
    
    console.log('=== Starting daily lead report generation at:', new Date().toISOString(), '===');
    console.log('🔧 Environment:', process.env.NODE_ENV || 'Not set');
    console.log('📧 Email Sending:', isScheduledRun ? 'ENABLED (Scheduled Run)' : 'DISABLED (Manual Run)');
    
    // Report sends at 10 AM today → shows YESTERDAY's leads
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const reportDate = yesterday;
    const startOfReportDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 0, 0, 0, 0);
    const endOfReportDay   = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 23, 59, 59, 999);

    console.log(`📅 Report covers: ${startOfReportDay.toISOString()} → ${endOfReportDay.toISOString()}`);

    const Designation = require('../models/designationModel');
    const targetDesignationNames = [
      'Director Customer Delight',
      'CEO & Founder',
      'Director Digi Solution',
      'Junior Software Developer',
      'Sales Manager',
      'Marketing'
    ];
    
    const targetDesignations = await Designation.find({
      name: { $in: targetDesignationNames }
    }).select('_id');
    
    const designationIds = targetDesignations.map(d => d._id);
    console.log('Found target designation IDs:', designationIds);

    const companies = await Employee.distinct('company', { 
      designation: { $in: designationIds }
    });

    console.log(`Found ${companies.length} companies to send reports to`);

    for (let i = 0; i < companies.length; i++) {
      const companyId = companies[i];
      
      try {
        console.log(`Processing company ${i+1}/${companies.length}: ${companyId}`);

        // ✅ FIXED: populate assignedTo so name shows in email
        const reportLeads = await Lead.find({
          company: companyId,
          createdAt: {
            $gte: startOfReportDay,
            $lte: endOfReportDay
          },
          $or: [
            { SOURCE: 'TradeIndia' },
            { SOURCE: { $regex: /IndiaMart/i } },
            { SOURCE: 'Direct' }
          ]
        })
        .populate('assignedTo', 'name')
        .lean();

        const tradeIndiaLeads = reportLeads.filter(lead => 
          lead.SOURCE === 'TradeIndia' || lead.SOURCE === 'TradeIndia '
        );
        const indiaMartLeads = reportLeads.filter(lead => 
          lead.SOURCE && lead.SOURCE.match(/IndiaMart/i)
        );
        const directLeads = reportLeads.filter(lead => 
          lead.SOURCE === 'Direct' || lead.SOURCE === 'Direct '
        );
        
        console.log(`🔍 Yesterday's leads for company ${companyId}:`);
        console.log(`  - TradeIndia: ${tradeIndiaLeads.length} leads`);
        console.log(`  - IndiaMart: ${indiaMartLeads.length} leads`);
        console.log(`  - Direct: ${directLeads.length} leads`);

        const allLeadsCount        = reportLeads.length;
        const feasibleLeads        = reportLeads.filter(lead => lead.feasibility === 'feasible');
        const notFeasibleLeads     = reportLeads.filter(lead => lead.feasibility === 'not-feasible');
        const pendingLeads         = reportLeads.filter(lead => lead.feasibility === 'none');
        const callUnansweredLeads  = reportLeads.filter(lead => lead.feasibility === 'call-unanswered');

        const recipients = await Employee.find({
          company: companyId,
          designation: { $in: designationIds },
          email: { $exists: true, $ne: '' }
        }).select('name email designation').populate('designation', 'name');

        if (recipients.length === 0) {
          console.log(`No recipients with target designations found for company ${companyId}`);
          continue;
        }

        const company = await Employee.findById(companyId).select('name');
        const companyName = company ? company.name : 'Your Company';

        const leadsBySource = {
          'TradeIndia': tradeIndiaLeads,
          'IndiaMart': indiaMartLeads,
          'Direct': directLeads
        };

        const recipientsByDesignation = {
          'Director Customer Delight': recipients.filter(r => r.designation && r.designation.name === 'Director Customer Delight'),
          'CEO & Founder': recipients.filter(r => r.designation && r.designation.name === 'CEO & Founder'),
          'Director Digi Solution': recipients.filter(r => r.designation && r.designation.name === 'Director Digi Solution'),
          'Junior Software Developer': recipients.filter(r => r.designation && r.designation.name === 'Junior Software Developer'),
          'Sales Manager': recipients.filter(r => r.designation && r.designation.name === 'Sales Manager'),
          'Marketing': recipients.filter(r => r.designation && r.designation.name === 'Marketing')
        };

        // ✅ FIXED: formatLeadTime now uses IST timezone (Asia/Kolkata)
        const formatLeadTime = (date) => {
          if (!date) return '<span style="color:#9ca3af;">N/A</span>';
          const d = new Date(date);
          const datePart = d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
          });
          const timePart = d.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
          }).toUpperCase();
          return `
            <div style="line-height:1.5;">
              <div style="font-size:12px; color:#374151; font-weight:600; white-space:nowrap;">
                🗓 ${datePart}
              </div>
              <div style="font-size:12px; color:#6366f1; font-weight:600; white-space:nowrap; margin-top:2px;">
                🕐 ${timePart}
              </div>
            </div>
          `;
        };

        const getFeasibilityCell = (lead) => {
          if (lead.feasibility === 'feasible') {
            return `<span class="feasibility-badge badge-feasible">✅ Feasible</span>`;
          } else if (lead.feasibility === 'not-feasible') {
            return `
              <span class="feasibility-badge badge-not-feasible">❌ Not Feasible</span>
              ${lead.remark ? `<div class="reason-text">📝 ${lead.remark}</div>` : ''}
            `;
          } else if (lead.feasibility === 'call-unanswered') {
            const callCount  = lead.callHistory ? lead.callHistory.length : 0;
            const uniqueDays = lead.callHistory
              ? [...new Set(lead.callHistory.map(c => c.day))].length
              : 0;
            return `
              <span class="feasibility-badge badge-call-unanswered">📵 Call Unanswered</span>
              ${lead.remark ? `<div class="reason-text">📝 ${lead.remark}</div>` : ''}
              <div class="reason-text">📞 ${callCount} call(s) over ${uniqueDays} day(s)</div>
            `;
          } else {
            return `<span class="feasibility-badge badge-pending">⏳ Pending</span>`;
          }
        };

        // ✅ FIXED: Added "Assigned To" column in lead rows
        const buildLeadRows = (leads) => leads.map(lead => `
          <tr>
            <td>${lead.SENDER_COMPANY || 'N/A'}</td>
            <td>${lead.SENDER_NAME || 'N/A'}</td>
            <td>${lead.QUERY_PRODUCT_NAME || 'N/A'}</td>
            <td>${lead.SENDER_MOBILE || 'N/A'}</td>
            <td style="min-width:110px;">${formatLeadTime(lead.createdAt)}</td>
            <td>${getFeasibilityCell(lead)}</td>
            <td style="white-space:nowrap; font-size:13px;">
              ${lead.assignedTo && lead.assignedTo.name
                ? `<span style="
                    display:inline-block;
                    background:#dbeafe;
                    color:#1e40af;
                    padding:2px 8px;
                    border-radius:10px;
                    font-size:12px;
                    font-weight:600;">
                    👤 ${lead.assignedTo.name}
                  </span>`
                : '<span style="color:#9ca3af; font-size:12px;">Unassigned</span>'
              }
            </td>
          </tr>
        `).join('');

        const buildCallUnansweredSection = (leads) => {
          if (leads.length === 0) return '';
          return `
            <div>
              <h2 class="section-title">📵 Call Unanswered Leads</h2>
              <table class="lead-table">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Contact Person</th>
                    <th>Source</th>
                    <th>Mobile</th>
                    <th class="th-time">🕐 Lead Time</th>
                    <th>Calls Made</th>
                    <th>Assigned To</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${leads.map(lead => {
                    const callCount  = lead.callHistory ? lead.callHistory.length : 0;
                    const uniqueDays = lead.callHistory
                      ? [...new Set(lead.callHistory.map(c => c.day))].length
                      : 0;
                    const lastCall = lead.callHistory && lead.callHistory.length > 0
                      ? [...lead.callHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
                      : null;
                    const lastCallPlain = lastCall
                      ? new Date(lastCall.date).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                          hour12: true,
                          timeZone: 'Asia/Kolkata'
                        }).toUpperCase()
                      : null;
                    return `
                      <tr>
                        <td>${lead.SENDER_COMPANY || 'N/A'}</td>
                        <td>${lead.SENDER_NAME || 'N/A'}</td>
                        <td>${lead.SOURCE || 'N/A'}</td>
                        <td>${lead.SENDER_MOBILE || 'N/A'}</td>
                        <td style="min-width:110px;">${formatLeadTime(lead.createdAt)}</td>
                        <td>
                          <span class="feasibility-badge badge-call-unanswered">
                            📞 ${callCount} call(s) / ${uniqueDays} day(s)
                          </span>
                          ${lastCallPlain
                            ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;font-style:italic;">Last: ${lastCallPlain}</div>`
                            : ''
                          }
                        </td>
                        <td style="white-space:nowrap;">
                          ${lead.assignedTo && lead.assignedTo.name
                            ? `<span style="
                                display:inline-block;
                                background:#dbeafe;
                                color:#1e40af;
                                padding:2px 8px;
                                border-radius:10px;
                                font-size:12px;
                                font-weight:600;">
                                👤 ${lead.assignedTo.name}
                              </span>`
                            : '<span style="color:#9ca3af;font-size:12px;">Unassigned</span>'
                          }
                        </td>
                        <td>${lead.remark || 'No remark provided'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        };

        const emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Daily Lead Report</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f7fa; }
              .container { max-width: 960px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
              .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 16px; }
              .content { padding: 30px; }
              .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 30px; }
              .stat-card { border-radius: 10px; padding: 18px 12px; text-align: center; }
              .stat-card.all             { background-color: #EFF6FF; border-left: 4px solid #3b82f6; }
              .stat-card.feasible        { background-color: #ECFDF5; border-left: 4px solid #10b981; }
              .stat-card.not-feasible    { background-color: #FEF2F2; border-left: 4px solid #ef4444; }
              .stat-card.pending         { background-color: #FFFBEB; border-left: 4px solid #f59e0b; }
              .stat-card.call-unanswered { background-color: #FFF7ED; border-left: 4px solid #f97316; }
              .stat-number { font-size: 32px; font-weight: bold; margin-bottom: 5px; }
              .stat-card.all             .stat-number { color: #3b82f6; }
              .stat-card.feasible        .stat-number { color: #10b981; }
              .stat-card.not-feasible    .stat-number { color: #ef4444; }
              .stat-card.pending         .stat-number { color: #f59e0b; }
              .stat-card.call-unanswered .stat-number { color: #f97316; }
              .stat-label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
              .section-title { font-size: 18px; font-weight: 600; margin: 30px 0 12px 0; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
              .source-section { margin-bottom: 25px; }
              .source-name { font-weight: 600; color: #4b5563; margin-bottom: 10px; display: inline-block; background: #f3f4f6; padding: 5px 12px; border-radius: 20px; font-size: 14px; }
              .lead-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              .lead-table th, .lead-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: middle; }
              .lead-table th { background-color: #f9fafb; font-weight: 600; color: #374151; white-space: nowrap; }
              .lead-table tr:hover { background-color: #f9fafb; }
              .th-time { background-color: #ede9fe !important; color: #5b21b6 !important; }
              .feasibility-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
              .badge-feasible        { background-color: #d1fae5; color: #065f46; }
              .badge-not-feasible    { background-color: #fee2e2; color: #991b1b; }
              .badge-pending         { background-color: #fef9c3; color: #92400e; }
              .badge-call-unanswered { background-color: #ffedd5; color: #9a3412; }
              .reason-text { font-size: 11px; color: #6b7280; margin-top: 4px; font-style: italic; }
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
                <p>${companyName} — ${formatDate(reportDate)}</p>
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
                  <div class="stat-card call-unanswered">
                    <div class="stat-number">${callUnansweredLeads.length}</div>
                    <div class="stat-label">Call Unanswered</div>
                  </div>
                </div>
                
                ${allLeadsCount > 0 ? `
                  <div>
                    <h2 class="section-title">📋 Lead Details by Source</h2>
                    ${Object.entries(leadsBySource).map(([source, leads]) => `
                      ${leads.length > 0 ? `
                        <div class="source-section">
                          <span class="source-name">${source} (${leads.length} lead${leads.length > 1 ? 's' : ''})</span>
                          <table class="lead-table">
                            <thead>
                              <tr>
                                <th>Company Name</th>
                                <th>Contact Person</th>
                                <th>Product</th>
                                <th>Mobile</th>
                                <th class="th-time">🕐 Lead Time (IST)</th>
                                <th>Feasibility / Reason</th>
                                <th>Assigned To</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${buildLeadRows(leads)}
                            </tbody>
                          </table>
                        </div>
                      ` : ''}
                    `).join('')}
                  </div>

                  ${buildCallUnansweredSection(callUnansweredLeads)}

                ` : `<div class="no-leads">No leads received on ${formatDate(reportDate)} from TradeIndia, IndiaMart, or Direct entry.</div>`}
              </div>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} ProClient360. All rights reserved.</p>
                <p>This automated report is sent at <strong>10:00 AM daily (IST)</strong> and covers the previous day's leads.</p>
                ${!isScheduledRun ? 
                  '<p>🔍 Preview Mode — This is a preview of the report. No emails were sent.</p>' : 
                  ''
                }
              </div>
            </div>
          </body>
          </html>
        `;

        const recipientEmails = recipients
          .map(r => r.email)
          .filter(email => email && email.includes('@'));
        
        if (recipientEmails.length > 0 && isScheduledRun) {
          const mailOptions = {
            from: `ProClient360 <${process.env.EMAIL}>`,
            subject: `📊 Daily Lead Report - ${companyName} - ${formatDate(reportDate)}`,
            html: emailContent
          };

          await sendEmailInBatches(recipientEmails, mailOptions, companyName);
          
          console.log(`Recipients by designation for ${companyName}:`, {
            'Director Customer Delight': recipientsByDesignation['Director Customer Delight'].length,
            'CEO & Founder': recipientsByDesignation['CEO & Founder'].length,
            'Director Digi Solution': recipientsByDesignation['Director Digi Solution'].length,
            'Junior Software Developer': recipientsByDesignation['Junior Software Developer'].length,
            'Sales Manager': recipientsByDesignation['Sales Manager'].length,
            'Marketing': recipientsByDesignation['Marketing'].length
          });
        } else if (recipientEmails.length === 0) {
          console.log(`No valid email addresses found for company ${companyId}`);
        } else if (!isScheduledRun) {
          console.log(`🔍 PREVIEW MODE: Email content generated but not sent (not a scheduled run)`);
        }
        
        if (i < companies.length - 1) {
          console.log(`Waiting 10 seconds before processing next company...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      } catch (companyError) {
        console.error(`Error processing company ${companyId}:`, companyError.message);
      }
    }
    
    console.log('=== Daily lead report generation completed at:', new Date().toISOString(), '===');
    return true;
  } catch (error) {
    console.error("Error in sendDailyLeadReport:", error.message);
    return false;
  }
};

let scheduledTask = null;

const initializeDailyLeadReportScheduler = () => {
  if (scheduledTask) {
    scheduledTask.destroy();
  }
  
  scheduledTask = cron.schedule('0 10 * * *', async () => {
    console.log('⏰ CRON JOB: Running daily lead report scheduler at:', new Date().toISOString());
    const result = await sendDailyLeadReport(true);
    if (result) {
      console.log('✅ CRON JOB: Daily lead report sent successfully.');
    } else {
      console.log('❌ CRON JOB: Failed to send daily lead report.');
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  console.log('📅 Daily lead report scheduler initialized to run at 10:00 AM IST daily.');
  
  if (process.env.NODE_ENV === 'development') {
    setTimeout(async () => {
      console.log('🚀 DEVELOPMENT MODE: Running initial daily lead report at startup for testing...');
      const result = await sendDailyLeadReport(true);
      if (result) {
        console.log('✅ DEVELOPMENT MODE: Initial daily lead report sent successfully.');
      }
    }, 10000);
  }
};

module.exports = {
  sendDailyLeadReport,
  initializeDailyLeadReportScheduler
};
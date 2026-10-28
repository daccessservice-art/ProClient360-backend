// ════════════════════════════════════════════════════════════════════
//  Lead Notification Service
//  Creates a Notification document + sends FCM push (mobile app)
//  whenever a lead is assigned / reassigned / transferred to a sales
//  employee, or a survey engineer is assigned.
//
//  All functions are NON-BLOCKING: they never throw, so a notification
//  failure can never break lead create / assign APIs.
// ════════════════════════════════════════════════════════════════════
const Notification = require('../models/notificationModel');
const Employee = require('../models/employeeModel');
const { admin } = require('../utils/firebase');

const TITLES = {
  lead_assigned:    'New Lead Assigned',
  lead_reassigned:  'Lead Reassigned To You',
  lead_transferred: 'Leads Transferred To You',
  survey_assigned:  'New Survey Assigned',
  survey_submitted: 'Survey Report Submitted',
  general:          'Notification',
};

const leadLabel = (lead) =>
  lead?.SENDER_COMPANY || lead?.SENDER_NAME || lead?.SENDER_MOBILE || 'a lead';

/**
 * Core sender.
 * @param {Object} p
 * @param {String|ObjectId} p.toEmployeeId  receiver employee id
 * @param {Object} p.fromUser               req.user (employee or company)
 * @param {String} p.type                   one of NOTIFICATION_TYPES
 * @param {String} p.message
 * @param {String} [p.title]
 * @param {Object} [p.lead]                 lead doc (for leadId + push data)
 */
const sendLeadNotification = async ({ toEmployeeId, fromUser, type, message, title, lead }) => {
  try {
    if (!toEmployeeId) return null;

    // Do not notify a user about an action they did themselves
    if (fromUser && String(fromUser._id) === String(toEmployeeId)) return null;

    const employee = await Employee.findById(toEmployeeId).select('name fcmToken');
    if (!employee) return null;

    const finalTitle = title || TITLES[type] || TITLES.general;

    const notification = await Notification.create({
      userIds:    employee._id,
      title:      finalTitle,
      message:    String(message).slice(0, 500),
      type:       type || 'general',
      leadId:     lead?._id || null,
      sender:     fromUser?._id || null,
      senderName: fromUser?.name || 'System',
    });

    // ── FCM push for mobile app ──
    if (employee.fcmToken) {
      try {
        await admin.messaging().send({
          token: employee.fcmToken,
          notification: { title: finalTitle, body: notification.message },
          data: {
            // FCM data values MUST be strings
            notificationId: String(notification._id),
            type:           String(notification.type),
            leadId:         lead?._id ? String(lead._id) : '',
            companyName:    lead?.SENDER_COMPANY ? String(lead.SENDER_COMPANY) : '',
            sender:         String(fromUser?.name || 'System'),
            profilePic:     String(fromUser?.profilePic || ''),
            message:        notification.message,
            time:           new Date().toISOString(),
            isSeen:         'false',
            screen:         'SalesLeads', // mobile app can deep-link with this
          },
          android: { priority: 'high', notification: { sound: 'default', channelId: 'lead_notifications' } },
          apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
        });
        console.log(`📲 Lead push sent to ${employee.name}`);
      } catch (pushErr) {
        console.error('⚠️ Lead FCM push failed (non-blocking):', pushErr.message);
        // invalid / expired token → clear it so we stop retrying
        if (pushErr.code === 'messaging/registration-token-not-registered' ||
            pushErr.code === 'messaging/invalid-registration-token') {
          await Employee.updateOne({ _id: employee._id }, { $set: { fcmToken: null } });
        }
      }
    }

    return notification;
  } catch (err) {
    console.error('⚠️ sendLeadNotification failed (non-blocking):', err.message);
    return null;
  }
};

// ── Helpers used by leadController ──────────────────────────────────

exports.notifyLeadAssigned = (lead, toEmployeeId, fromUser) =>
  sendLeadNotification({
    toEmployeeId, fromUser, lead,
    type: 'lead_assigned',
    message: `${fromUser?.name || 'Admin'} assigned you a new lead: ${leadLabel(lead)}` +
             (lead?.QUERY_PRODUCT_NAME ? ` (${lead.QUERY_PRODUCT_NAME})` : ''),
  });

exports.notifyLeadReassigned = (lead, toEmployeeId, fromUser, remark) =>
  sendLeadNotification({
    toEmployeeId, fromUser, lead,
    type: 'lead_reassigned',
    message: `${fromUser?.name || 'Admin'} reassigned lead ${leadLabel(lead)} to you` +
             (remark ? `. Remark: ${remark}` : ''),
  });

exports.notifyLeadsTransferred = (count, toEmployeeId, fromUser) =>
  sendLeadNotification({
    toEmployeeId, fromUser,
    type: 'lead_transferred',
    message: `${fromUser?.name || 'Admin'} transferred ${count} lead${count !== 1 ? 's' : ''} to you`,
  });

exports.notifySurveyAssigned = (lead, toEmployeeId, fromUser) =>
  sendLeadNotification({
    toEmployeeId, fromUser, lead,
    type: 'survey_assigned',
    message: `${fromUser?.name || 'Admin'} assigned you a site survey for ${leadLabel(lead)}` +
             (lead?.surveyDetails?.dateTime
               ? ` on ${new Date(lead.surveyDetails.dateTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}`
               : ''),
  });

exports.notifySurveySubmitted = (lead, toEmployeeId, fromUser, status) =>
  sendLeadNotification({
    toEmployeeId, fromUser, lead,
    type: 'survey_submitted',
    message: status === 'success'
      ? `${fromUser?.name || 'Survey engineer'} completed the survey for ${leadLabel(lead)}`
      : `${fromUser?.name || 'Survey engineer'} cancelled the survey for ${leadLabel(lead)}`,
  });

exports.sendLeadNotification = sendLeadNotification;
// ════════════════════════════════════════════════════════════════════
//  Service Notification Service
//  When a ticket is assigned (Assign Service) to one or more service
//  engineers, each engineer gets:
//    1. a Notification in DB  → web bell + count
//    2. an FCM push           → mobile app
//
//  NON-BLOCKING: never throws, so it can never break service APIs.
// ════════════════════════════════════════════════════════════════════
const Notification = require('../models/notificationModel');
const Employee = require('../models/employeeModel');
const Ticket = require('../models/ticketModel');
const { admin } = require('../utils/firebase');

const TITLES = {
  service_assigned:   'New Service Assigned',
  service_reassigned: 'Service Assigned To You',
};

const fmtDate = (d) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return ''; }
};

const toIdList = (allotTo) =>
  (Array.isArray(allotTo) ? allotTo : [allotTo])
    .filter(Boolean)
    .map((x) => String(x?._id || x));

// Build message text from service + ticket
const buildMessage = (fromUser, service, ticket, isReassign) => {
  const customer =
    ticket?.client?.custName ||
    (ticket?.uniqueTicketId?.startsWith('EXT-') ? 'SmartGate' : '') ||
    ticket?.contactPerson || 'a customer';
  const parts = [
    `${fromUser?.name || 'Admin'} ${isReassign ? 're-allotted' : 'assigned'} you a service for ${customer}`,
  ];
  if (ticket?.product) parts[0] += ` (${ticket.product})`;
  const extra = [];
  if (service?.priority) extra.push(`Priority: ${service.priority}`);
  if (service?.workMode) extra.push(service.workMode);
  if (service?.allotmentDate) extra.push(`Visit: ${fmtDate(service.allotmentDate)}`);
  if (ticket?.uniqueTicketId) extra.push(`Ticket: ${ticket.uniqueTicketId}`);
  return (parts[0] + (extra.length ? ` — ${extra.join(' | ')}` : '')).slice(0, 500);
};

const sendOne = async ({ employeeId, fromUser, type, message, service, ticket }) => {
  try {
    // never notify the person who did the action
    if (fromUser && String(fromUser._id) === String(employeeId)) return null;

    const employee = await Employee.findById(employeeId).select('name fcmToken');
    if (!employee) return null;

    const title = TITLES[type] || 'Notification';

    const notification = await Notification.create({
      userIds:    employee._id,
      title,
      message,
      type,
      serviceId:  service?._id || null,
      ticketId:   ticket?._id || null,
      sender:     fromUser?._id || null,
      senderName: fromUser?.name || 'System',
    });

    if (employee.fcmToken) {
      try {
        await admin.messaging().send({
          token: employee.fcmToken,
          notification: { title, body: message },
          data: {
            // FCM data values MUST be strings
            notificationId: String(notification._id),
            type:           String(type),
            serviceId:      service?._id ? String(service._id) : '',
            ticketId:       ticket?._id ? String(ticket._id) : '',
            uniqueTicketId: String(ticket?.uniqueTicketId || ''),
            customerName:   String(ticket?.client?.custName || ''),
            product:        String(ticket?.product || ''),
            priority:       String(service?.priority || ''),
            allotmentDate:  service?.allotmentDate ? new Date(service.allotmentDate).toISOString() : '',
            sender:         String(fromUser?.name || 'System'),
            message,
            time:           new Date().toISOString(),
            isSeen:         'false',
            screen:         'MyServices', // mobile app deep-link
          },
          android: { priority: 'high', notification: { sound: 'default', channelId: 'service_notifications' } },
          apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
        });
        console.log(`📲 Service push sent to ${employee.name}`);
      } catch (pushErr) {
        console.error('⚠️ Service FCM push failed (non-blocking):', pushErr.message);
        if (pushErr.code === 'messaging/registration-token-not-registered' ||
            pushErr.code === 'messaging/invalid-registration-token') {
          await Employee.updateOne({ _id: employee._id }, { $set: { fcmToken: null } });
        }
      }
    }
    return notification;
  } catch (err) {
    console.error('⚠️ Service notification failed (non-blocking):', err.message);
    return null;
  }
};

/**
 * Notify engineers about a service.
 * @param {Object} service       saved Service doc
 * @param {Array}  employeeIds   who to notify (ids)
 * @param {Object} fromUser      req.user
 * @param {Boolean} isReassign
 */
const notifyEngineers = async (service, employeeIds, fromUser, isReassign = false) => {
  try {
    const ids = [...new Set(toIdList(employeeIds))];
    if (!ids.length) return;

    const ticket = service?.ticket
      ? await Ticket.findById(service.ticket?._id || service.ticket)
          .select('product details client uniqueTicketId contactPerson')
          .populate('client', 'custName')
          .lean()
      : null;

    const type = isReassign ? 'service_reassigned' : 'service_assigned';
    const message = buildMessage(fromUser, service, ticket, isReassign);

    await Promise.all(ids.map((employeeId) =>
      sendOne({ employeeId, fromUser, type, message, service, ticket })
    ));
  } catch (err) {
    console.error('⚠️ notifyEngineers failed (non-blocking):', err.message);
  }
};

// New service → notify all allotted engineers
exports.notifyServiceAssigned = (service, fromUser) =>
  notifyEngineers(service, service?.allotTo, fromUser, false);

// Service updated → notify only engineers newly added to allotTo
exports.notifyServiceReassigned = (service, oldAllotTo, newAllotTo, fromUser) => {
  const oldIds = new Set(toIdList(oldAllotTo));
  const added = toIdList(newAllotTo).filter((id) => !oldIds.has(id));
  if (!added.length) return Promise.resolve();
  return notifyEngineers(service, added, fromUser, true);
};
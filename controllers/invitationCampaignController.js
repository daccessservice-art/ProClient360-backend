// controllers/invitationCampaignController.js
//
// INVITATION CAMPAIGN (DAccess) — event / meeting invitations on WhatsApp.
//   • Template = heading + Initial Message + optional image + up to 3 buttons
//   • Each button has its own auto-reply (e.g. "I want to register" → link)
//   • When the customer taps a button, handleInvitationButtonTap() sends
//     that button's reply. It is called from the existing DAccess webhook.
//
// Uses the existing DAccess WhatsApp service READ-ONLY (same number, same
// keys) — campaignWhatsAppService.js is not modified.

const InvitationTemplate = require('../models/invitationTemplateModel');
const InvitationLog = require('../models/invitationLogModel');
const InvitationResponse = require('../models/invitationResponseModel');
const wa = require('../services/campaignWhatsAppService');

const companyOf = (req) => req.user.company || req.user._id;
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Heading is shown bold as the first line of the message.
function buildBody(t) {
  const heading = (t.heading || '').trim();
  return heading ? `*${heading}*\n\n${t.bodyText}` : t.bodyText;
}

function cleanButtons(buttons) {
  return (buttons || [])
    .map((b) => ({ text: String(b.text || '').trim(), replyMessage: String(b.replyMessage || '').trim() }))
    .filter((b) => b.text);
}

function validate(body, isCreate) {
  const { title, bodyText, buttons } = body;
  if (isCreate && (!title || !title.trim())) return 'Invitation name is required.';
  if (isCreate && (!bodyText || !bodyText.trim())) return 'Initial Message is required.';
  if (buttons) {
    if (buttons.length > 3) return 'Maximum 3 buttons allowed.';
    for (const b of buttons) {
      if (!String(b.text || '').trim()) return 'Every button needs a label.';
      if (String(b.text).trim().length > 25) return 'Button label can be max 25 characters.';
      if (!String(b.replyMessage || '').trim()) return `Button "${b.text}" needs a reply message.`;
    }
  }
  return null;
}

// ── Templates ──────────────────────────────────────────────────────

// GET /api/invitation-campaigns/templates
exports.listTemplates = async (req, res) => {
  try {
    const templates = await InvitationTemplate.find({ company: companyOf(req) }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/invitation-campaigns/templates
exports.createTemplate = async (req, res) => {
  try {
    const err = validate(req.body, true);
    if (err) return res.status(400).json({ success: false, error: err });

    const { title, heading, bodyText, image, buttons, category, language } = req.body;
    const template = await InvitationTemplate.create({
      company: companyOf(req),
      title: title.trim(),
      heading: (heading || '').trim(),
      bodyText,
      image: { mediaId: image?.mediaId || null, headerHandle: image?.headerHandle || null },
      buttons: cleanButtons(buttons),
      // "inv_" prefix keeps these apart from product campaign template names on Meta
      metaTemplateName: `inv_${wa.slugify(title)}`.slice(0, 80),
      category: category || 'MARKETING',
      language: language || 'en',
      status: 'DRAFT',
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, message: 'Invitation saved as draft.', template });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'An invitation with a similar name already exists.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /api/invitation-campaigns/templates/:id
exports.updateTemplate = async (req, res) => {
  try {
    const template = await InvitationTemplate.findOne({ _id: req.params.id, company: companyOf(req) });
    if (!template) return res.status(404).json({ success: false, error: 'Invitation not found.' });

    const err = validate(req.body, false);
    if (err) return res.status(400).json({ success: false, error: err });

    const { title, heading, bodyText, image, buttons, category, language } = req.body;

    // What Meta reviews: heading/body text, button labels, header image.
    // Changing a button's REPLY message does NOT need re-approval.
    const oldLabels = JSON.stringify(template.buttons.map((b) => b.text));
    const newButtons = buttons !== undefined ? cleanButtons(buttons) : null;
    const metaChanged =
      (heading !== undefined && heading.trim() !== template.heading) ||
      (bodyText !== undefined && bodyText !== template.bodyText) ||
      (newButtons && JSON.stringify(newButtons.map((b) => b.text)) !== oldLabels) ||
      (image !== undefined && (image?.headerHandle || null) !== (template.image?.headerHandle || null));

    if (title !== undefined) template.title = title.trim();
    if (heading !== undefined) template.heading = heading.trim();
    if (bodyText !== undefined) template.bodyText = bodyText;
    if (image !== undefined) template.image = { mediaId: image?.mediaId || null, headerHandle: image?.headerHandle || null };
    if (newButtons) template.buttons = newButtons;
    if (category !== undefined) template.category = category;
    if (language !== undefined) template.language = language;

    if (metaChanged) {
      template.status = 'DRAFT';
      template.rejectionReason = '';
    }

    await template.save();
    res.status(200).json({
      success: true,
      message: metaChanged ? 'Invitation updated — submit to Meta again.' : 'Invitation updated.',
      template,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/invitation-campaigns/templates/:id
exports.deleteTemplate = async (req, res) => {
  try {
    const t = await InvitationTemplate.findOneAndDelete({ _id: req.params.id, company: companyOf(req) });
    if (!t) return res.status(404).json({ success: false, error: 'Invitation not found.' });
    res.status(200).json({ success: true, message: 'Invitation deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/invitation-campaigns/upload-image  (multipart, field "image")
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file uploaded.' });
    const mediaId = await wa.uploadMedia(req.file.buffer, req.file.mimetype, req.file.originalname);
    let headerHandle = null;
    let headerHandleError = null;
    try {
      headerHandle = await wa.uploadMediaForHeaderHandle(req.file.buffer, req.file.mimetype);
    } catch (e) {
      headerHandleError = e.response?.data?.error?.message || e.message;
    }
    if (!headerHandle) {
      return res.status(500).json({
        success: false,
        error: `Image could not be prepared for Meta approval (${headerHandleError || 'unknown error'}). Try a smaller JPG/PNG.`,
      });
    }
    res.status(200).json({ success: true, mediaId, headerHandle });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }
};

// POST /api/invitation-campaigns/templates/:id/submit
exports.submitTemplate = async (req, res) => {
  try {
    const template = await InvitationTemplate.findOne({ _id: req.params.id, company: companyOf(req) });
    if (!template) return res.status(404).json({ success: false, error: 'Invitation not found.' });
    if (template.status === 'APPROVED') {
      return res.status(200).json({ success: true, message: 'Already approved — nothing to submit.', template });
    }

    // Shape expected by the existing (unchanged) submitTemplateToMeta()
    const result = await wa.submitTemplateToMeta({
      metaTemplateName: template.metaTemplateName,
      metaTemplateId: template.metaTemplateId,
      category: template.category,
      language: template.language,
      bodyText: buildBody(template),
      buttons: template.buttons.map((b) => ({ text: b.text })),
      images: template.image?.headerHandle ? [{ headerHandle: template.image.headerHandle }] : [],
    });

    template.status = result.status || 'PENDING';
    template.rejectionReason = '';
    if (result.id && !template.metaTemplateId) template.metaTemplateId = result.id;
    await template.save();

    res.status(200).json({
      success: true,
      message: result.mode === 'edited' ? 'Changes submitted to Meta — back under review.' : 'Submitted to Meta for review.',
      template,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.error?.message || err.message });
  }
};

// POST /api/invitation-campaigns/templates/:id/sync-status
exports.syncTemplateStatus = async (req, res) => {
  try {
    const template = await InvitationTemplate.findOne({ _id: req.params.id, company: companyOf(req) });
    if (!template) return res.status(404).json({ success: false, error: 'Invitation not found.' });
    const status = await wa.checkTemplateStatus(template.metaTemplateName);
    if (status) template.status = status;
    await template.save();
    res.status(200).json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Sending ────────────────────────────────────────────────────────

// POST /api/invitation-campaigns/send
// Body: { templateId, customerIds?: [...], recipients?: [{ name, phone }] }
exports.sendInvitation = async (req, res) => {
  try {
    const Customer = require('../models/customerModel');
    const companyId = companyOf(req);
    const { templateId, customerIds, recipients } = req.body;

    if (!templateId) return res.status(400).json({ success: false, error: 'Select an invitation first.' });

    const template = await InvitationTemplate.findOne({ _id: templateId, company: companyId, status: 'APPROVED' });
    if (!template) return res.status(400).json({ success: false, error: 'Invitation not found or not yet approved by Meta.' });

    // Build one list: [{ customerId, name, phone }]
    let list = [];
    if (Array.isArray(customerIds) && customerIds.length) {
      const customers = await Customer.find({ _id: { $in: customerIds }, company: companyId }).select('custName phoneNumber1');
      list = customers.map((c) => ({ customerId: c._id, name: c.custName || 'Unnamed', phone: c.phoneNumber1 }));
    } else if (Array.isArray(recipients) && recipients.length) {
      list = recipients.map((r) => ({ customerId: null, name: r.name || 'Unnamed', phone: r.phone }));
    }

    if (list.length === 0) return res.status(400).json({ success: false, error: 'No recipients selected.' });
    if (list.length > 200) return res.status(400).json({ success: false, error: 'Max 200 recipients per send.' });

    const headerImageMediaId = template.image?.headerHandle ? template.image.mediaId : undefined;
    const logRecipients = [];
    let sentCount = 0;
    let skippedCount = 0;

    for (const r of list) {
      if (!r.phone) {
        logRecipients.push({ customerId: r.customerId, name: r.name, mobile: '', status: 'skipped', reason: 'No phone number.' });
        skippedCount++;
        continue;
      }
      const result = await wa.sendTemplateMessage(r.phone, template.metaTemplateName, template.language, headerImageMediaId);
      if (result.ok) {
        const messageId = result.data?.messages?.[0]?.id || result.data?.message_id || '';
        logRecipients.push({ customerId: r.customerId, name: r.name, mobile: r.phone, status: 'sent', messageId });
        sentCount++;
      } else {
        logRecipients.push({ customerId: r.customerId, name: r.name, mobile: r.phone, status: 'skipped', reason: result.reason });
        skippedCount++;
      }
      await new Promise((x) => setTimeout(x, 300)); // gentle pacing
    }

    const log = await InvitationLog.create({
      company: companyId,
      template: template._id,
      templateTitle: template.title,
      sentBy: req.user._id,
      recipients: logRecipients,
      sentCount,
      skippedCount,
    });

    res.status(200).json({ success: true, message: `Invitation sent: ${sentCount} sent, ${skippedCount} skipped.`, log });
  } catch (err) {
    console.error('[Invitation] send error:', err);
    res.status(500).json({ success: false, error: `Send failed: ${err.message}` });
  }
};

// GET /api/invitation-campaigns/logs
exports.listLogs = async (req, res) => {
  try {
    const logs = await InvitationLog.find({ company: companyOf(req) })
      .select('-recipients.messageId')
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/invitation-campaigns/responses?templateId=
exports.listResponses = async (req, res) => {
  try {
    const query = { company: companyOf(req) };
    if (req.query.templateId) query.template = req.query.templateId;
    const responses = await InvitationResponse.find(query)
      .populate('template', 'title')
      .sort({ createdAt: -1 })
      .limit(1000);
    res.status(200).json({ success: true, responses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Button tap → auto-reply (called from the existing DAccess webhook) ──

/**
 * Returns true if this inbound message was a tap on an invitation button
 * (and the reply was handled), false otherwise. Never throws.
 */
exports.handleInvitationButtonTap = async (msg, companyId) => {
  try {
    let tapped = null;
    if (msg?.type === 'button') tapped = msg.button?.text || msg.button?.payload;
    else if (msg?.type === 'interactive' && msg.interactive?.button_reply) tapped = msg.interactive.button_reply.title;
    if (!tapped) return false;

    const from = msg.from;
    const target = last10(from);
    if (!target) return false;
    const label = String(tapped).trim().toLowerCase();

    // Webhook retries: never reply twice to the same tap.
    if (msg.id && (await InvitationResponse.exists({ messageId: msg.id }))) return true;

    // 1) Exact link: the tap's context.id is the invitation message we sent.
    let log = null;
    const contextId = msg.context?.id;
    if (contextId) log = await InvitationLog.findOne({ 'recipients.messageId': contextId }).populate('template');

    // 2) Fallback: latest invitation sent to this number (last 60 days)
    //    whose buttons include the tapped label.
    if (!log || !log.template) {
      const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const recent = await InvitationLog.find({
        createdAt: { $gte: since },
        'recipients.mobile': { $regex: `${target}$` },
      }).sort({ createdAt: -1 }).limit(20).populate('template');
      log = recent.find((l) =>
        l.template &&
        l.recipients.some((r) => r.status === 'sent' && last10(r.mobile) === target) &&
        l.template.buttons.some((b) => b.text.trim().toLowerCase() === label)
      ) || null;
    }

    if (!log || !log.template) return false; // not an invitation tap → let the normal flow handle it

    const button = log.template.buttons.find((b) => b.text.trim().toLowerCase() === label);
    if (!button) return false;

    const recipient = log.recipients.find((r) => last10(r.mobile) === target);
    const sendResult = await wa.sendTextMessage(from, button.replyMessage);

    await InvitationResponse.create({
      company: log.template.company || companyId,
      template: log.template._id,
      customer: recipient?.customerId || null,
      name: recipient?.name || '',
      phone: from,
      buttonText: button.text,
      replySent: !!sendResult.ok,
      replyError: sendResult.ok ? '' : (sendResult.reason || ''),
      messageId: msg.id || '',
    });

    console.log(`[Invitation] "${button.text}" tapped by ${from} → reply ${sendResult.ok ? 'sent' : 'FAILED: ' + sendResult.reason}`);
    return true;
  } catch (err) {
    console.error('[Invitation] button tap error:', err);
    return false;
  }
};
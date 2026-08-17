// services/campaignWhatsAppService.js
//
// UPDATED: added sendListMessage() — sends a real, tappable WhatsApp List
// Message (up to 10 selectable rows), matching Pinnacle's documented
// format exactly (Partners API doc, "Send Interactive Message", type: list).
// This is genuinely different from a template: it can only be sent to a
// customer who has messaged you within the last 24 hours (WhatsApp's
// session-message rule), which is why campaignController.js only sends
// these in response to an inbound message, never in the initial blast.

const axios = require('axios');

const WABA_API_KEY         = process.env.WABA_API_KEY;
const WABA_PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
const WABA_ID               = process.env.WABA_ID;
const WABA_BASE_URL         = process.env.WABA_BASE_URL || 'https://partnersv1.pinbot.ai/v3';

if (!WABA_API_KEY || !WABA_PHONE_NUMBER_ID || !WABA_ID) {
  console.warn(
    '[Campaign WhatsApp] ⚠️ Missing env vars: ' +
    `WABA_API_KEY=${WABA_API_KEY ? 'set' : 'MISSING'}, ` +
    `WABA_PHONE_NUMBER_ID=${WABA_PHONE_NUMBER_ID ? 'set' : 'MISSING'}, ` +
    `WABA_ID=${WABA_ID ? 'set' : 'MISSING'}.`
  );
}

const client = axios.create({
  baseURL: WABA_BASE_URL,
  headers: { 'Content-Type': 'application/json', apikey: WABA_API_KEY },
  timeout: 15000,
});

function formatIndianMobile(rawNumber) {
  if (!rawNumber) return null;
  const digits = String(rawNumber).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return null;
}

function slugify(title) {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

/**
 * Submits a CampaignTemplate document to Meta.
 *
 * FIRST submission (no metaTemplateId yet): calls Pinnacle's CREATE
 * template API — POST /{{wabaid}}/message_templates — with UPPERCASE
 * component types (BODY, BUTTONS, QUICK_REPLY). Returns { id, status };
 * the caller must save that id as metaTemplateId for any future edit.
 *
 * RESUBMISSION (metaTemplateId already set, e.g. editing an approved or
 * rejected template): calls Pinnacle's separate EDIT template API —
 * POST /{{msgtemplateid}} — using the Meta-assigned numeric ID as the
 * URL itself, with lowercase component types (body, buttons,
 * quick_reply). This is a genuinely different endpoint and payload
 * shape per Pinnacle's docs — calling the CREATE endpoint again for an
 * already-submitted template is what was producing "Invalid parameter".
 */
async function submitTemplateToMeta(templateDoc) {
  if (!WABA_ID) throw new Error('WABA_ID is not set in .env.');

  if (!templateDoc.metaTemplateId) {
    // ── CREATE (first submission) ──
    const components = [
      { type: 'BODY', text: templateDoc.bodyText },
    ];
    if (templateDoc.buttons && templateDoc.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: templateDoc.buttons.map((b) => ({ type: 'QUICK_REPLY', text: b.text })),
      });
    }

    const payload = {
      name: templateDoc.metaTemplateName,
      category: templateDoc.category || 'MARKETING',
      language: templateDoc.language || 'en',
      components,
      allow_category_change: true,
    };

    const res = await client.post(`/${WABA_ID}/message_templates`, payload);
    return { id: res.data?.id || null, status: res.data?.status || 'PENDING', mode: 'created' };
  }

  // ── EDIT (resubmission of an already-created template) ──
  const components = [
    { type: 'body', text: templateDoc.bodyText },
  ];
  if (templateDoc.buttons && templateDoc.buttons.length > 0) {
    components.push({
      type: 'buttons',
      buttons: templateDoc.buttons.map((b) => ({ type: 'quick_reply', text: b.text })),
    });
  }

  const payload = {
    name: templateDoc.metaTemplateName,
    category: templateDoc.category || 'MARKETING',
    components,
    language: templateDoc.language || 'en',
    allow_category_change: true,
  };

  const res = await client.post(`/${templateDoc.metaTemplateId}`, payload);
  // Edit responses don't reliably include a fresh status — edits go back
  // to review, so the caller should treat this as PENDING regardless.
  return { id: templateDoc.metaTemplateId, status: 'PENDING', mode: 'edited', raw: res.data };
}

/**
 * Checks a template's current approval status directly with Meta by name.
 */
async function checkTemplateStatus(metaTemplateName) {
  if (!WABA_ID) throw new Error('WABA_ID is not set in .env.');
  const res = await client.get(`/${WABA_ID}/message_templates`, { params: { fields: 'name,status' } });
  const match = (res.data?.data || []).find((t) => t.name === metaTemplateName);
  return match ? match.status : null;
}

/**
 * Sends one approved template message to one phone number (the initial
 * outbound blast — static text, not clickable beyond its 3 quick-reply
 * buttons).
 */
async function sendTemplateMessage(toRawNumber, metaTemplateName, language) {
  const to = formatIndianMobile(toRawNumber);
  if (!to) return { ok: false, reason: `Invalid phone number: "${toRawNumber}"` };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: metaTemplateName,
      language: { code: language || 'en' },
    },
  };

  try {
    const res = await client.post(`/${WABA_PHONE_NUMBER_ID}/messages`, payload);
    return { ok: true, data: res.data };
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return { ok: false, reason };
  }
}

/**
 * NEW — sends a real, tappable List Message (one question, up to 10
 * selectable rows). This is a SESSION message, not a template: WhatsApp
 * only allows it within 24 hours of the customer's last inbound message
 * to you. Do not call this as part of the initial campaign blast — only
 * in response to an inbound webhook event.
 *
 * @param toRawNumber   customer's phone number
 * @param questionText  shown as the message body (max 1024 chars)
 * @param options       [{ title, description }] — 1 to 10 rows
 * @param buttonLabel   text on the "open list" button (max 20 chars)
 */
async function sendListMessage(toRawNumber, questionText, options, buttonLabel = 'Select') {
  const to = formatIndianMobile(toRawNumber);
  if (!to) return { ok: false, reason: `Invalid phone number: "${toRawNumber}"` };
  if (!options || options.length === 0) return { ok: false, reason: 'No options provided for this question.' };

  const rows = options.slice(0, 10).map((opt, i) => ({
    id: `opt_${i}`,
    title: String(opt.title).slice(0, 24),
    ...(opt.description ? { description: String(opt.description).slice(0, 72) } : {}),
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: String(questionText).slice(0, 1024) },
      action: {
        button: String(buttonLabel).slice(0, 20),
        sections: [
          { title: 'Options', rows },
        ],
      },
    },
  };

  try {
    const res = await client.post(`/${WABA_PHONE_NUMBER_ID}/messages`, payload);
    return { ok: true, data: res.data };
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return { ok: false, reason };
  }
}

/**
 * NEW — sends a plain session text message (used for the "thank you /
 * completed" message after the last question, and as a fallback).
 */
async function sendTextMessage(toRawNumber, body) {
  const to = formatIndianMobile(toRawNumber);
  if (!to) return { ok: false, reason: `Invalid phone number: "${toRawNumber}"` };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  };

  try {
    const res = await client.post(`/${WABA_PHONE_NUMBER_ID}/messages`, payload);
    return { ok: true, data: res.data };
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return { ok: false, reason };
  }
}

module.exports = {
  formatIndianMobile,
  slugify,
  submitTemplateToMeta,
  checkTemplateStatus,
  sendTemplateMessage,
  sendListMessage,
  sendTextMessage,
};
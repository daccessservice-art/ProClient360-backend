// services/enteroCampaignWhatsAppService.js
//
// ENTERO SYSTEMS INDIA PVT LTD — separate WhatsApp (Pinnacle) account.
// Exact copy of campaignWhatsAppService.js logic, but reads ENTERO_*
// env vars so it sends from Entero's own WABA number (+91 91127 31199),
// never from the DAccess number.

const axios = require('axios');

const WABA_API_KEY         = process.env.ENTERO_WABA_API_KEY;
const WABA_PHONE_NUMBER_ID = process.env.ENTERO_WABA_PHONE_NUMBER_ID;
const WABA_ID              = process.env.ENTERO_WABA_ID;
const WABA_BASE_URL        = process.env.ENTERO_WABA_BASE_URL || 'https://partnersv1.pinbot.ai/v3';

if (!WABA_API_KEY || !WABA_PHONE_NUMBER_ID || !WABA_ID) {
  console.warn(
    '[Entero WhatsApp] ⚠️ Missing env vars: ' +
    `ENTERO_WABA_API_KEY=${WABA_API_KEY ? 'set' : 'MISSING'}, ` +
    `ENTERO_WABA_PHONE_NUMBER_ID=${WABA_PHONE_NUMBER_ID ? 'set' : 'MISSING'}, ` +
    `ENTERO_WABA_ID=${WABA_ID ? 'set' : 'MISSING'}.`
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

// Resumable upload → header_handle (for template header image)
async function uploadMediaForHeaderHandle(fileBuffer, mimeType) {
  const step1 = await axios.post(
    `${WABA_BASE_URL}/app/uploads`,
    null,
    {
      params: { file_length: fileBuffer.length, file_type: mimeType },
      headers: { apikey: WABA_API_KEY },
      timeout: 15000,
    }
  );
  const sessionId = step1.data?.id;
  if (!sessionId) throw new Error('Pinnacle did not return an upload session id.');

  const step2 = await axios.post(
    `${WABA_BASE_URL}/${sessionId}`,
    fileBuffer,
    { headers: { apikey: WABA_API_KEY, 'Content-Type': 'application/octet-stream' }, timeout: 15000 }
  );
  const handle = step2.data?.h;
  if (!handle) throw new Error('Pinnacle did not return a file handle.');
  return handle;
}

async function submitTemplateToMeta(templateDoc) {
  if (!WABA_ID) throw new Error('ENTERO_WABA_ID is not set in .env.');

  const headerHandle = templateDoc.images?.[0]?.headerHandle;

  if (!templateDoc.metaTemplateId) {
    // ── CREATE (first submission) ──
    const components = [];
    if (headerHandle) {
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerHandle] } });
    }
    components.push({ type: 'BODY', text: templateDoc.bodyText });
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

  // ── EDIT (resubmission) ──
  const components = [];
  if (headerHandle) {
    components.push({ type: 'header', format: 'image', example: { header_handle: [headerHandle] } });
  }
  components.push({ type: 'body', text: templateDoc.bodyText });
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
  return { id: templateDoc.metaTemplateId, status: 'PENDING', mode: 'edited', raw: res.data };
}

async function checkTemplateStatus(metaTemplateName) {
  if (!WABA_ID) throw new Error('ENTERO_WABA_ID is not set in .env.');
  const res = await client.get(`/${WABA_ID}/message_templates`, { params: { fields: 'name,status' } });
  const match = (res.data?.data || []).find((t) => t.name === metaTemplateName);
  return match ? match.status : null;
}

async function sendTemplateMessage(toRawNumber, metaTemplateName, language, headerImageMediaId) {
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
      ...(headerImageMediaId
        ? { components: [{ type: 'header', parameters: [{ type: 'image', image: { id: headerImageMediaId } }] }] }
        : {}),
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

async function sendListMessage(toRawNumber, questionText, options, buttonLabel = 'Select', headerText = 'Please choose an option') {
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
      header: { type: 'text', text: String(headerText).slice(0, 60) },
      body: { text: String(questionText).slice(0, 1024) },
      action: {
        button: String(buttonLabel).slice(0, 20),
        sections: [{ title: 'Options', rows }],
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

async function uploadMedia(fileBuffer, mimeType, filename) {
  if (!WABA_PHONE_NUMBER_ID) throw new Error('ENTERO_WABA_PHONE_NUMBER_ID is not set in .env.');

  const FormData = require('form-data');
  const form = new FormData();
  form.append('sheet', fileBuffer, { filename, contentType: mimeType });

  const res = await axios.post(
    `${WABA_BASE_URL}/${WABA_PHONE_NUMBER_ID}/media`,
    form,
    { headers: { ...form.getHeaders(), apikey: WABA_API_KEY }, timeout: 30000 }
  );

  const mediaId = res.data?.response?.id;
  if (!mediaId) throw new Error('Pinnacle did not return a media id for the uploaded file.');
  return mediaId;
}

async function sendImageMessage(toRawNumber, mediaId, caption = '') {
  const to = formatIndianMobile(toRawNumber);
  if (!to) return { ok: false, reason: `Invalid phone number: "${toRawNumber}"` };
  if (!mediaId) return { ok: false, reason: 'No mediaId provided.' };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { id: mediaId, ...(caption ? { caption } : {}) },
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
  uploadMedia,
  sendImageMessage,
  uploadMediaForHeaderHandle,
};
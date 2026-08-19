// controllers/campaignController.js
//
// Product-wise WhatsApp campaign module, sending to your Customer Master.
//
// UPDATED — the real clickable-questionnaire flow:
//   1. sendCampaign() sends the template AND creates a PENDING CampaignSession
//      per customer (if the template has questions defined).
//   2. receiveWhatsAppReply() is the engine: when a customer's first reply
//      arrives, it starts the session and sends Question 1 as a tappable
//      List Message. Each subsequent list_reply tap advances to the next
//      question, until all are answered.
//   3. listSessions() lets the app show the structured Q&A that resulted.

const CampaignTemplate = require('../models/campaignTemplateModel');
const CampaignLog = require('../models/campaignLogModel');
const CampaignReply = require('../models/campaignReplyModel');
const CampaignSession = require('../models/campaignSessionModel');
const wa = require('../services/campaignWhatsAppService');

// ── Templates ──────────────────────────────────────────────────────

// GET /api/campaigns/templates
exports.listTemplates = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const templates = await CampaignTemplate.find({ company: companyId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/campaigns/templates/approved
exports.listApprovedTemplates = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const templates = await CampaignTemplate.find({ company: companyId, status: 'APPROVED' })
      .select('title metaTemplateName language questions')
      .sort({ title: 1 });
    res.status(200).json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/campaigns/templates
// Body may include:
//   buttons:   [{ text: "CALL ME" }]                          — max 3
//   questions: [{ questionText, options: [{title, description}] }] — max 10
exports.createTemplate = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const { title, category, language, bodyText, buttons, questions, images } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'Product name (title) is required.' });
    if (!bodyText || !bodyText.trim()) return res.status(400).json({ success: false, error: 'bodyText is required.' });
    if (buttons && buttons.length > 3) {
      return res.status(400).json({ success: false, error: 'Maximum 3 quick-reply buttons allowed.' });
    }
    if (questions && questions.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 questions allowed.' });
    }
    if (images && images.length > 5) {
      return res.status(400).json({ success: false, error: 'Maximum 5 images allowed.' });
    }

    const template = await CampaignTemplate.create({
      company: companyId,
      title: title.trim(),
      metaTemplateName: wa.slugify(title),
      category: category || 'MARKETING',
      language: language || 'en',
      bodyText,
      buttons: buttons || [],
      questions: questions || [],
      images: images || [],
      status: 'DRAFT',
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, message: 'Template saved as draft.', template });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A template with a similar product name already exists.' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /api/campaigns/templates/:id
exports.updateTemplate = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const { title, category, language, bodyText, buttons, questions, images } = req.body;

    const template = await CampaignTemplate.findOne({ _id: req.params.id, company: companyId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found.' });

    if (buttons && buttons.length > 3) {
      return res.status(400).json({ success: false, error: 'Maximum 3 quick-reply buttons allowed.' });
    }
    if (questions && questions.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 questions allowed.' });
    }
    if (images && images.length > 5) {
      return res.status(400).json({ success: false, error: 'Maximum 5 images allowed.' });
    }

    const bodyChanged = bodyText !== undefined && bodyText !== template.bodyText;
    const buttonsChanged = buttons !== undefined && JSON.stringify(buttons) !== JSON.stringify(template.buttons.map(b => ({ text: b.text })));

    if (title !== undefined) template.title = title.trim();
    if (category !== undefined) template.category = category;
    if (language !== undefined) template.language = language;
    if (bodyText !== undefined) template.bodyText = bodyText;
    if (buttons !== undefined) template.buttons = buttons;
    if (questions !== undefined) template.questions = questions;
    if (images !== undefined) template.images = images; // session images, never require re-approval

    if (bodyChanged || buttonsChanged) {
      template.status = 'DRAFT';
      template.rejectionReason = '';
    }

    await template.save();
    res.status(200).json({ success: true, message: 'Template updated.', template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/campaigns/templates/:id
exports.deleteTemplate = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const template = await CampaignTemplate.findOneAndDelete({ _id: req.params.id, company: companyId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found.' });
    res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/campaigns/templates/upload-image
// multipart/form-data, field name "image". Returns a mediaId to attach
// to a template's images array — does NOT save it to any template itself,
// the frontend does that via the normal create/update calls.
exports.uploadTemplateImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file uploaded.' });

    const mediaId = await wa.uploadMedia(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.status(200).json({ success: true, mediaId });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(500).json({ success: false, error: msg });
  }
};

// POST /api/campaigns/templates/:id/submit
exports.submitTemplate = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const template = await CampaignTemplate.findOne({ _id: req.params.id, company: companyId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found.' });

    // FIXED: previously this ALWAYS called Meta, even when the template
    // was already APPROVED and only images/questions had been added —
    // neither of which Meta reviews at all. Re-submitting identical
    // body/buttons content that's already approved is pointless and was
    // triggering an "Invalid parameter" rejection. Since createTemplate/
    // updateTemplate already reset status back to DRAFT whenever body or
    // buttons genuinely change, an APPROVED status here means nothing
    // Meta-relevant changed — skip the call entirely.
    if (template.status === 'APPROVED') {
      return res.status(200).json({
        success: true,
        message: 'No changes requiring Meta review — template is already approved. Images/questions are saved and active immediately.',
        template,
      });
    }

    const result = await wa.submitTemplateToMeta(template);
    template.status = result.status || 'PENDING';
    template.rejectionReason = '';
    if (result.id && !template.metaTemplateId) template.metaTemplateId = result.id; // only set once, on first create
    await template.save();

    const message = result.mode === 'edited'
      ? 'Changes submitted to Meta — back under review.'
      : 'Submitted to Meta for review.';

    res.status(200).json({ success: true, message, template });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(500).json({ success: false, error: msg });
  }
};

// POST /api/campaigns/templates/:id/sync-status
exports.syncTemplateStatus = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const template = await CampaignTemplate.findOne({ _id: req.params.id, company: companyId });
    if (!template) return res.status(404).json({ success: false, error: 'Template not found.' });

    const status = await wa.checkTemplateStatus(template.metaTemplateName);
    if (status) template.status = status;
    await template.save();

    res.status(200).json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Sending (targets Customer Master) ─────────────────────────────

// POST /api/campaigns/send
exports.sendCampaign = async (req, res) => {
  try {
    const Customer = require('../models/customerModel');
    const companyId = req.user.company || req.user._id;
    const { templateId, customerIds } = req.body;

    if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required.' });
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No customers selected.' });
    }
    if (customerIds.length > 200) {
      return res.status(400).json({ success: false, error: 'Max 200 customers per campaign.' });
    }

    const template = await CampaignTemplate.findOne({ _id: templateId, company: companyId, status: 'APPROVED' });
    if (!template) {
      return res.status(400).json({ success: false, error: 'Template not found or not yet approved by Meta.' });
    }

    const customers = await Customer.find({ _id: { $in: customerIds }, company: companyId });

    const recipients = [];
    let sentCount = 0;
    let skippedCount = 0;

    for (const customer of customers) {
      const name = customer.custName || 'Unnamed customer';

      if (!customer.phoneNumber1) {
        recipients.push({ customerId: customer._id, name, mobile: '', status: 'skipped', reason: 'No phone number on file.' });
        skippedCount++;
        continue;
      }

      const result = await wa.sendTemplateMessage(customer.phoneNumber1, template.metaTemplateName, template.language);

      if (result.ok) {
        recipients.push({ customerId: customer._id, name, mobile: customer.phoneNumber1, status: 'sent' });
        sentCount++;

        // FIXED: previously used $setOnInsert, which only applied when NO
        // session existed yet for this customer+template. If this customer
        // was ever sent this same product before (even in an old test),
        // clicking "Send Campaign" again silently did nothing to their
        // existing session — it could already be COMPLETED or mid-way
        // through questions, meaning images and Question 1 would never
        // fire again for them. Every send now genuinely restarts the
        // conversation from scratch for that customer, as the person
        // clicking "Send" would reasonably expect.
        // FIXED: previously only created a session when the template had
        // QUESTIONS — meaning an image-only template (no questions) never
        // got a session at all, so advanceSession would never find
        // anything to act on and images would silently never send.
        const hasImages = template.images && template.images.length > 0;
        const hasQuestions = template.questions && template.questions.length > 0;
        if (hasImages || hasQuestions) {
          await CampaignSession.findOneAndUpdate(
            { company: companyId, phone: customer.phoneNumber1, template: template._id },
            {
              $set: {
                company: companyId,
                customer: customer._id,
                template: template._id,
                phone: customer.phoneNumber1,
                status: 'PENDING',
                currentQuestionIndex: -1,
                answers: [],
                startedAt: null,
                completedAt: null,
              },
            },
            { upsert: true, new: true }
          );
        }
      } else {
        recipients.push({ customerId: customer._id, name, mobile: customer.phoneNumber1, status: 'skipped', reason: result.reason });
        skippedCount++;
      }

      await new Promise((r) => setTimeout(r, 300)); // gentle pacing to avoid rate limits
    }

    const log = await CampaignLog.create({
      company: companyId,
      template: template._id,
      templateTitle: template.title,
      sentBy: req.user._id,
      recipients,
      sentCount,
      skippedCount,
    });

    res.status(200).json({
      success: true,
      message: `Campaign done: ${sentCount} sent, ${skippedCount} skipped.`,
      log,
    });
  } catch (err) {
    console.error('sendCampaign error:', err);
    res.status(500).json({ success: false, error: `Campaign failed: ${err.message}` });
  }
};

// GET /api/campaigns/logs
exports.listCampaignLogs = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const logs = await CampaignLog.find({ company: companyId })
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Replies (raw inbound messages, text or button/list taps) ─────

// GET /api/campaigns/replies
// GET /api/campaigns/replies?customerId=<id>
exports.listReplies = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const { customerId } = req.query;

    const query = { company: companyId };
    if (customerId) query.customer = customerId;

    const replies = await CampaignReply.find(query)
      .populate('customer', 'custName phoneNumber1')
      .sort({ createdAt: -1 })
      .limit(200);

    res.status(200).json({ success: true, replies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/campaigns/replies/customers?page=&limit=
// NEW — inbox-style view: one row per customer (grouped), showing their
// most recent message, a total reply count, and whether their last
// message was a typed reply or a tapped button. Paginated so this stays
// fast and readable even with hundreds of replies across many customers.
exports.listReplyCustomers = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 15));
    const skip = (page - 1) * limit;

    const Customer = require('../models/customerModel');

    const mongoose = require('mongoose');
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const grouped = await CampaignReply.aggregate([
      { $match: { company: companyObjectId } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $ifNull: ['$customer', '$phone'] },
          customer: { $first: '$customer' },
          phone: { $first: '$phone' },
          lastMessage: { $first: '$message' },
          lastIsButtonClick: { $first: '$isButtonClick' },
          lastAt: { $first: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastAt: -1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'total' }],
        },
      },
    ]);

    const rows = grouped[0]?.rows || [];
    const total = grouped[0]?.totalCount[0]?.total || 0;

    // Fill in real customer names for rows that have a linked customer.
    const customerIds = rows.filter((r) => r.customer).map((r) => r.customer);
    const customers = customerIds.length
      ? await Customer.find({ _id: { $in: customerIds } }).select('custName phoneNumber1')
      : [];
    const customerMap = new Map(customers.map((c) => [String(c._id), c]));

    const items = rows.map((r) => {
      const cust = r.customer ? customerMap.get(String(r.customer)) : null;
      return {
        customerId: r.customer || null,
        custName: cust?.custName || null,
        phone: cust?.phoneNumber1 || r.phone,
        lastMessage: r.lastMessage,
        lastIsButtonClick: r.lastIsButtonClick,
        lastAt: r.lastAt,
        count: r.count,
      };
    });

    res.status(200).json({
      success: true,
      items,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        totalItems: total,
        limit,
        hasNextPage: skip + rows.length < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Sessions (structured Q&A answers) ─────────────────────────────

// GET /api/campaigns/sessions
// GET /api/campaigns/sessions?customerId=<id>
// This is the NEW structured view — the actual filled-in answers from
// the tap-through questionnaire, as opposed to raw free-text replies.
exports.listSessions = async (req, res) => {
  try {
    const companyId = req.user.company || req.user._id;
    const { customerId } = req.query;

    const query = { company: companyId };
    if (customerId) query.customer = customerId;

    const sessions = await CampaignSession.find(query)
      .populate('customer', 'custName phoneNumber1')
      .populate('template', 'title')
      .sort({ updatedAt: -1 })
      .limit(200);

    res.status(200).json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Inbound webhook — this is the engine that drives the question flow ──

function last10Digits(phone) {
  if (!phone) return null;
  return String(phone).replace(/\D/g, '').slice(-10);
}

/**
 * Advances (or starts) a customer's question session in response to any
 * inbound event. Returns nothing — fire-and-forget, errors are logged
 * not thrown, since this must never block the webhook's fast ack.
 */
async function advanceSession(phone, listReplyId, listReplyTitle) {
  // NOTE: intentionally NOT filtering by company here. sendCampaign()
  // creates the session using the logged-in user's real company ID, but
  // this webhook only has DEFAULT_WHATSAPP_COMPANY_ID from .env — if
  // those two values aren't byte-for-byte identical, filtering by
  // company here would silently find nothing and Question 1 would never
  // fire, no matter how many times the customer replies. Since one WABA
  // phone number webhook effectively belongs to one company in this
  // architecture anyway, matching on phone + status is safe and removes
  // that fragile dependency entirely.
  // FIXED: previously this searched PENDING and IN_PROGRESS together and
  // just took whichever was most recently touched. If a customer has been
  // sent multiple different products (common during testing — same test
  // number, many campaigns), that could pick a brand-new PENDING session
  // from an unrelated campaign instead of the conversation the customer
  // is actually mid-way through, silently losing their answer. An
  // IN_PROGRESS session — an active back-and-forth already happening —
  // always takes priority; only fall back to PENDING (starting fresh)
  // if nothing is currently in progress.
  let session = await CampaignSession.findOne({
    phone,
    status: 'IN_PROGRESS',
  }).sort({ updatedAt: -1 }).populate('template');

  if (!session) {
    session = await CampaignSession.findOne({
      phone,
      status: 'PENDING',
    }).sort({ updatedAt: -1 }).populate('template');
  }

  if (!session || !session.template) return;

  const questions = session.template.questions || [];

  // FIXED: images used to be completely blocked whenever a template had
  // zero questions, because the old code returned early BEFORE reaching
  // the image-sending block below. Images must send on their own,
  // independent of whether any questions exist — moved this check to
  // happen only for the question-advancing logic further down, not here.

  // NEW — first time this session becomes active (still PENDING, about to
  // start), send any attached images before Question 1. Session-only
  // content — never affects Meta approval status.
  const isStarting = session.status === 'PENDING';
  if (isStarting) {
    const imageCount = session.template.images ? session.template.images.length : 0;
    console.log(`[Campaign Session] Starting session for ${phone}, template "${session.template.title}" has ${imageCount} image(s) attached.`);

    if (imageCount > 0) {
      for (const img of session.template.images) {
        const imgResult = await wa.sendImageMessage(phone, img.mediaId, img.caption);
        if (imgResult.ok) {
          console.log(`[Campaign Session] Image sent successfully to ${phone}, mediaId: ${img.mediaId}`);
        } else {
          console.error(`[Campaign Session] Failed to send image to ${phone}:`, imgResult.reason);
        }
      }
    }
  }

  // Only questions need at least one to proceed — images above already
  // sent regardless. If there are no questions, mark the session done
  // right after the images (if any) go out.
  if (questions.length === 0) {
    if (isStarting) {
      session.status = 'COMPLETED';
      session.completedAt = new Date();
      await session.save();
    }
    return;
  }

  // If this inbound event is a tap on the CURRENT question's list, record it.
  if (session.status === 'IN_PROGRESS' && listReplyId != null) {
    const current = questions[session.currentQuestionIndex];
    if (current) {
      const optIndex = parseInt(String(listReplyId).replace('opt_', ''), 10);
      const chosen = current.options[optIndex];
      session.answers.push({
        questionText: current.questionText,
        answerTitle: listReplyTitle || chosen?.title || '',
        answerDescription: chosen?.description || '',
      });
    }
  }

  const nextIndex = session.currentQuestionIndex + 1;

  if (nextIndex < questions.length) {
    // Send the next question.
    const nextQ = questions[nextIndex];
    const result = await wa.sendListMessage(
      phone,
      nextQ.questionText,
      nextQ.options,
      'Select',
      session.template.title || 'Please choose an option'
    );
    if (result.ok) {
      session.currentQuestionIndex = nextIndex;
      session.status = 'IN_PROGRESS';
      if (!session.startedAt) session.startedAt = new Date();
    } else {
      console.error(`[Campaign Session] Failed to send question ${nextIndex} to ${phone}:`, result.reason);
    }
  } else {
    // All questions answered.
    session.status = 'COMPLETED';
    session.completedAt = new Date();
    await wa.sendTextMessage(phone, 'Thank you! We\'ve got your details and our team will reach out shortly.');
  }

  await session.save();
}

exports.receiveWhatsAppReply = async (req, res) => {
  res.sendStatus(200); // ack fast — Meta/Pinnacle retries if you don't respond quickly

  try {
    const Customer = require('../models/customerModel');
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const incomingMessages = value?.messages;

    if (incomingMessages && incomingMessages.length > 0) {
      const companyId = process.env.DEFAULT_WHATSAPP_COMPANY_ID;
      if (!companyId) {
        console.warn('[Campaign Webhook] DEFAULT_WHATSAPP_COMPANY_ID not set — cannot match customers.');
        return;
      }

      for (const msg of incomingMessages) {
        const from = msg.from;
        const target = last10Digits(from);
        if (!target) continue;

        // Detect the exact event type Meta sends.
        let text;
        let isButtonClick = false;
        let listReplyId = null;
        let listReplyTitle = null;

        if (msg.type === 'button' && msg.button?.text) {
          // Tap on a template's quick-reply button.
          text = msg.button.text;
          isButtonClick = true;
        } else if (msg.type === 'interactive' && msg.interactive?.list_reply) {
          // Tap on a List Message row — this is what the question flow uses.
          text = msg.interactive.list_reply.title;
          isButtonClick = true;
          listReplyId = msg.interactive.list_reply.id;
          listReplyTitle = msg.interactive.list_reply.title;
        } else if (msg.type === 'interactive' && msg.interactive?.button_reply) {
          text = msg.interactive.button_reply.title;
          isButtonClick = true;
        } else {
          text = msg.text?.body || `[${msg.type} message]`;
        }

        const customers = await Customer.find({
          company: companyId,
          phoneNumber1: { $regex: `${target}$` },
        }).limit(1);
        const customer = customers[0] || null;

        // Always log the raw event, same as before.
        await CampaignReply.create({
          company: companyId,
          customer: customer ? customer._id : null,
          phone: from,
          message: text,
          messageId: msg.id || '',
          isButtonClick,
        });

        // NEW — drive the question flow forward.
        try {
          await advanceSession(from, listReplyId, listReplyTitle);
        } catch (sessErr) {
          console.error('[Campaign Session] advanceSession error:', sessErr);
        }

        console.log(
          customer
            ? `[Campaign Webhook] ${isButtonClick ? 'Click' : 'Reply'} stored, matched customer ${customer._id}`
            : `[Campaign Webhook] ${isButtonClick ? 'Click' : 'Reply'} stored, no matching customer for ${from}`
        );
      }
    }

    const statuses = value?.statuses;
    if (statuses) {
      statuses.forEach((s) => console.log(`[Campaign Webhook] Status: ${s.recipient_id} -> ${s.status}`));
    }
  } catch (err) {
    console.error('[Campaign Webhook] Error:', err);
  }
};
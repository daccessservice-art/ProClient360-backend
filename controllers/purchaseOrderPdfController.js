const PDFDocument = require('pdfkit');
const PurchaseOrder = require('../models/purchaseOrderModel');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// ROBUST LOGO LOADER — tries multiple paths + URL fallback
// ═══════════════════════════════════════════════════════════════════════════════

const ASSET_SEARCH_PATHS = [
  path.join(__dirname, '..', 'assets'),
  path.join(__dirname, '..', '..', 'assets'),
  path.join(process.cwd(), 'assets'),
  path.join(__dirname, '..', 'public', 'assets'),
];

// ── Signature search paths: checks the same "assets" folder as the
// company logos FIRST (most reliable, since backend can already read
// ENTERO.png / DACCESS.png from there), then falls back to various
// frontend build/public locations in case those are available too. ──
const SIGNATURE_SEARCH_PATHS = [
  path.join(__dirname, '..', 'assets'),
  path.join(__dirname, '..', '..', 'assets'),
  path.join(process.cwd(), 'assets'),
  path.join(__dirname, '..', 'public', 'assets'),
  path.join(__dirname, '..', 'public', 'static', 'assets', 'img'),
  path.join(__dirname, '..', '..', 'public', 'static', 'assets', 'img'),
  path.join(__dirname, '..', 'frontend', 'build', 'static', 'assets', 'img'),
  path.join(__dirname, '..', '..', 'frontend', 'build', 'static', 'assets', 'img'),
  path.join(__dirname, '..', 'frontend', 'public', 'static', 'assets', 'img'),
  path.join(__dirname, '..', '..', 'frontend', 'public', 'static', 'assets', 'img'),
  path.join(process.cwd(), 'public', 'static', 'assets', 'img'),
  path.join(process.cwd(), 'frontend', 'build', 'static', 'assets', 'img'),
  path.join(process.cwd(), 'frontend', 'public', 'static', 'assets', 'img'),
];

function findFile(filename) {
  for (const dir of ASSET_SEARCH_PATHS) {
    const fp = path.join(dir, filename);
    try {
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        if (stat.size > 100) {
          console.log(`[PDF-LOGO] ✅ Found ${filename} at: ${fp} (${stat.size} bytes)`);
          return fp;
        }
        console.warn(`[PDF-LOGO] ⚠️  ${fp} exists but only ${stat.size} bytes — likely corrupt, skipping`);
      }
    } catch (_) {}
  }
  console.warn(`[PDF-LOGO] ❌ ${filename} NOT found. Searched:`, ASSET_SEARCH_PATHS.map(p => path.join(p, filename)));
  return null;
}

function findSignatureFile(filename) {
  for (const dir of SIGNATURE_SEARCH_PATHS) {
    const fp = path.join(dir, filename);
    try {
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        if (stat.size > 100) {
          console.log(`[PDF-SIGN] ✅ Found ${filename} at: ${fp} (${stat.size} bytes)`);
          return fp;
        }
        console.warn(`[PDF-SIGN] ⚠️  ${fp} exists but only ${stat.size} bytes — likely corrupt, skipping`);
      } else {
        console.log(`[PDF-SIGN]   … not at ${fp}`);
      }
    } catch (_) {}
  }
  console.warn(`[PDF-SIGN] ❌ ${filename} NOT found in any search path.`);
  return null;
}

function isValidImage(buf) {
  if (!buf || buf.length < 8) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  return false;
}

function readImageFile(filepath) {
  try {
    const buf = fs.readFileSync(filepath);
    const fmt = isValidImage(buf);
    if (!fmt) {
      console.warn(`[PDF-LOGO] ⚠️  ${filepath} is NOT a valid PNG/JPEG (magic bytes: ${buf.slice(0, 4).toString('hex')})`);
      return null;
    }
    console.log(`[PDF-LOGO] ✅ Loaded ${path.basename(filepath)} as ${fmt.toUpperCase()} (${buf.length} bytes)`);
    return buf;
  } catch (err) {
    console.warn(`[PDF-LOGO] ❌ Error reading ${filepath}:`, err.message);
    return null;
  }
}

function downloadBuffer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location, timeout).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const fmt = isValidImage(buf);
        if (!fmt) {
          return reject(new Error(`Downloaded data is not a valid image (magic: ${buf.slice(0, 4).toString('hex')})`));
        }
        console.log(`[PDF-LOGO] ✅ Downloaded from URL as ${fmt.toUpperCase()} (${buf.length} bytes)`);
        resolve(buf);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

const logoCache = { entero: null, daccess: null, signature: null };
let logoInitPromise = null;

async function ensureLogos() {
  if (logoCache.entero && logoCache.daccess && logoCache.signature) return;

  console.log('[PDF-LOGO] ── Initializing logos/signature (ensureLogos) ──');

  const enteroPath = findFile('ENTERO.png');
  if (enteroPath) logoCache.entero = readImageFile(enteroPath);
  if (!logoCache.entero) {
    const enteroJpg = findFile('ENTERO.jpg') || findFile('ENTERO.jpeg');
    if (enteroJpg) logoCache.entero = readImageFile(enteroJpg);
  }
  if (!logoCache.entero) {
    try {
      logoCache.entero = await downloadBuffer(
        'https://image2url.com/r2/default/images/1771396818586-be570726-9409-4f91-97bd-dee0ec030a0b.png'
      );
    } catch (e) {
      console.warn('[PDF-LOGO] ❌ Entero URL download failed:', e.message);
    }
  }

  const daccessPath = findFile('DACCESS.png');
  if (daccessPath) logoCache.daccess = readImageFile(daccessPath);
  if (!logoCache.daccess) {
    const daccessJpg = findFile('DACCESS.jpg') || findFile('DACCESS.jpeg');
    if (daccessJpg) logoCache.daccess = readImageFile(daccessJpg);
  }
  if (!logoCache.daccess) {
    const daccessUrl = process.env.DACCESS_LOGO_URL;
    if (daccessUrl) {
      try {
        logoCache.daccess = await downloadBuffer(daccessUrl);
      } catch (e) {
        console.warn('[PDF-LOGO] ❌ DAccess URL download failed:', e.message);
      }
    }
  }

  // ── sign.png: file search (checks backend "assets" folder first), then
  // URL fallback via SIGN_URL env var ──
  if (!logoCache.signature) {
    const signPath = findSignatureFile('sign.png');
    if (signPath) logoCache.signature = readImageFile(signPath);
  }
  if (!logoCache.signature) {
    const signJpg = findSignatureFile('sign.jpg') || findSignatureFile('sign.jpeg');
    if (signJpg) logoCache.signature = readImageFile(signJpg);
  }
  if (!logoCache.signature) {
    const signUrl = process.env.SIGN_URL;
    if (signUrl) {
      try {
        logoCache.signature = await downloadBuffer(signUrl);
        console.log('[PDF-SIGN] ✅ Loaded signature from SIGN_URL env var');
      } catch (e) {
        console.warn('[PDF-SIGN] ❌ SIGN_URL download failed:', e.message);
      }
    }
  }

  console.log('[PDF-LOGO]   Entero:', logoCache.entero ? `✅ ${logoCache.entero.length} bytes` : '❌ MISSING');
  console.log('[PDF-LOGO]   DAccess:', logoCache.daccess ? `✅ ${logoCache.daccess.length} bytes` : '❌ MISSING');
  console.log('[PDF-SIGN]   Signature:', logoCache.signature ? `✅ ${logoCache.signature.length} bytes` : '❌ MISSING — copy sign.png into the backend "assets" folder (same place as ENTERO.png/DACCESS.png), or set SIGN_URL env var.');
}

(function initSync() {
  const ep = findFile('ENTERO.png');
  if (ep) logoCache.entero = readImageFile(ep);
  if (!logoCache.entero) {
    const epJ = findFile('ENTERO.jpg') || findFile('ENTERO.jpeg');
    if (epJ) logoCache.entero = readImageFile(epJ);
  }
  const dp = findFile('DACCESS.png');
  if (dp) logoCache.daccess = readImageFile(dp);
  if (!logoCache.daccess) {
    const dpJ = findFile('DACCESS.jpg') || findFile('DACCESS.jpeg');
    if (dpJ) logoCache.daccess = readImageFile(dpJ);
  }
  const sp = findSignatureFile('sign.png');
  if (sp) logoCache.signature = readImageFile(sp);
  if (!logoCache.signature) {
    const spJ = findSignatureFile('sign.jpg') || findSignatureFile('sign.jpeg');
    if (spJ) logoCache.signature = readImageFile(spJ);
  }
})();


// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════
const COMPANY_CONFIGS = {
  entero: {
    name:          'ENTERO SYSTEMS INDIA PVT. LTD.',
    address:       'Factory Address: Gate No: Shop No.3, Sr.No.170, Gavhane Industrial Estate, Devkar vasti, Bhosari, Pune - 411039, Maharashtra, India',
    gstin:         '27AAJCE1335Q1Z8',
    getLogoBuffer: () => logoCache.entero,
  },
  daccess: {
    name:          'DACCESS SECURITY SYSTEMS PVT. LTD.',
    address:       'Office No.05, 3rd Floor, Revati Arcade-II, Opposite to Kapil Malhar Society, Baner, Pune - 411045, Maharashtra, India',
    gstin:         '27AACCD7325G1ZR',
    getLogoBuffer: () => logoCache.daccess,
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// NUMBER TO WORDS
// ═══════════════════════════════════════════════════════════════════════════════
const numberToWords = (num) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (n) => {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' ';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + 'Crore ' + convert(n % 10000000);
  };
  if (!num || num === 0) return 'Zero Indian Rupee';
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);
  let result   = convert(rupees).trim() + ' Indian Rupee';
  if (paise > 0) result += ' and ' + convert(paise).trim() + ' Paise';
  return result;
};


// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const COLOR_RED        = '#DC3232';
const COLOR_TABLE_HDR  = '#B4B49A';
const COLOR_LIGHT_GREY = '#F5F5F5';
const COLOR_PINK       = '#FFD2D2';
const COLOR_BLACK      = '#000000';
const COLOR_DARK_GREY  = '#444444';
const COLOR_BORDER     = '#BBBBBB';

const fillRect = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fill(color).restore();
};
const strokeRect = (doc, x, y, w, h, color = COLOR_BORDER, lineWidth = 0.5) => {
  doc.save().rect(x, y, w, h).lineWidth(lineWidth).stroke(color).restore();
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Measure how many lines a text string will wrap to at given width/size
// ═══════════════════════════════════════════════════════════════════════════════
function estimateLines(doc, text, width, fontSize, font = 'Helvetica') {
  if (!text) return 0;
  doc.font(font).fontSize(fontSize);
  const lineHeight = fontSize * 1.2;
  const h = doc.heightOfString(text, { width });
  return Math.ceil(h / lineHeight);
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════
exports.downloadPurchaseOrderPDF = async (req, res) => {
  // Tracks whether doc.pipe(res) has started streaming. Once true, we can
  // no longer send a JSON error response — we must instead abort the
  // stream so the client's request actually finishes instead of hanging.
  let streamingStarted = false;
  let doc = null;

  try {
    const { id } = req.params;

    await ensureLogos();

    const printAs       = (req.query.printAs || 'daccess').toLowerCase();
    const companyKey    = printAs === 'entero' ? 'entero' : 'daccess';
    const companyConfig = COMPANY_CONFIGS[companyKey];
    const LOGO_BUFFER   = companyConfig.getLogoBuffer();

    const po = await PurchaseOrder.findById(id)
      .populate('vendor',    'vendorName billingAddress manualAddress typeOfVendor GSTNo phoneNumber1 email')
      .populate('project',   'name')
      .populate('createdBy', 'name email')
      .populate('company',   'name')
      .lean();

    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    console.log(`[PDF-SIGN] PO ${po.orderNumber || id} → status="${po.status}" | signature buffer loaded: ${!!logoCache.signature}`);

    const items      = po.items || [];
    const totalAmt   = Number(po.totalAmount) || 0;
    const totalTax   = Number(po.totalTax)    || 0;
    const grandTotal = Number(po.grandTotal)  || 0;
    const cgst       = totalTax / 2;
    const sgst       = totalTax / 2;
    const totalQty   = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

    const pt = po.paymentTerms || {};
    let paymentText = '';
    if (Number(pt.advance) === 100) {
      paymentText = '100% ADVANCE';
    } else {
      const parts = [];
      if (Number(pt.advance)            > 0) parts.push(`Advance: ${pt.advance}%`);
      if (Number(pt.payAgainstDelivery) > 0) parts.push(`Against Delivery: ${pt.payAgainstDelivery}%`);
      if (Number(pt.payAfterCompletion) > 0) parts.push(`After Completion: ${pt.payAfterCompletion}%`);
      if (Number(pt.creditPeriod)       > 0) parts.push(`Credit Period: ${pt.creditPeriod} days`);
      paymentText = parts.join(' | ') || 'As per agreement';
    }

    doc = new PDFDocument({ margin: 0, size: 'A4' });
    const filename = `PO_${po.orderNumber || id}.pdf`;

    doc.on('error', (streamErr) => {
      console.error('[PDF] ❌ PDFDocument stream error:', streamErr.message);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    streamingStarted = true;

    const PW = doc.page.width;
    const M  = 20;
    const CW = PW - M * 2;
    let y = M;

    // ════════════════════════════════════════════════════════════
    // 1. HEADER
    // ════════════════════════════════════════════════════════════
    const LOGO_H    = 38;
    const LOGO_MAXW = 110;
    const HEADER_H  = 50;

    if (LOGO_BUFFER) {
      try {
        doc.image(LOGO_BUFFER, M, y + 4, { fit: [LOGO_MAXW, LOGO_H] });
      } catch (e) {
        console.error(`[PDF] ❌ doc.image() FAILED:`, e.message);
        doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR_RED)
           .text(companyConfig.name.split(' ')[0], M, y + 12, { lineBreak: false });
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR_RED)
         .text(companyConfig.name.split(' ')[0], M, y + 12, { lineBreak: false });
    }

    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_RED)
       .text('Purchase Order', M, y + 14, { width: CW, align: 'center' });

    y += HEADER_H;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_BLACK)
       .text(companyConfig.name, M, y);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text(`GSTIN/UIN: ${companyConfig.gstin}`, M, y, { width: CW, align: 'right' });

    y += 14;

    doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
       .text(companyConfig.address, M, y, { width: CW * 0.70 });

    y += 20;

    doc.save().moveTo(M, y).lineTo(PW - M, y).lineWidth(0.5).stroke(COLOR_BORDER).restore();
    y += 6;

    // ════════════════════════════════════════════════════════════
    // 2. VENDOR DETAILS + INVOICE DETAILS
    // ════════════════════════════════════════════════════════════
    const leftW  = CW * 0.52;
    const rightW = CW - leftW - 2;
    const rightX = M + leftW + 2;

    const vendor = po.vendor || {};

    const vendorAddress = vendor.typeOfVendor === 'Import'
      ? (vendor.manualAddress || null)
      : vendor.billingAddress?.add
        ? [
            vendor.billingAddress.add,
            vendor.billingAddress.city,
            vendor.billingAddress.state,
            vendor.billingAddress.country,
          ].filter(Boolean).join(', ')
        : null;

    const vendorNameH    = 13;
    const vendorAddrH    = vendorAddress
      ? doc.font('Helvetica').fontSize(8).heightOfString(vendorAddress, { width: leftW - 8 })
      : 0;
    const vendorGstH     = vendor.GSTNo ? 12 : 0;
    const vendorPadding  = 18;
    const boxH = Math.max(68, vendorNameH + vendorAddrH + vendorGstH + vendorPadding);

    fillRect(doc, M, y, leftW, 14, COLOR_TABLE_HDR);
    strokeRect(doc, M, y, leftW, 14);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text('VENDOR DETAILS', M + 4, y + 4);

    fillRect(doc, rightX, y, rightW, 14, COLOR_TABLE_HDR);
    strokeRect(doc, rightX, y, rightW, 14);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text('INVOICE DETAILS', rightX + 4, y + 4);

    y += 14;

    strokeRect(doc, M, y, leftW, boxH);

    let vy = y + 5;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BLACK)
       .text(vendor.vendorName || 'N/A', M + 4, vy, { width: leftW - 8 });
    vy += vendorNameH;

    if (vendorAddress) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
         .text(vendorAddress, M + 4, vy, { width: leftW - 8 });
      vy += vendorAddrH + 3;
    }

    if (vendor.GSTNo) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BLACK)
         .text(`GSTIN/UIN: ${vendor.GSTNo}`, M + 4, vy, { width: leftW - 8 });
    }

    strokeRect(doc, rightX, y, rightW, boxH);
    const invoiceFields = [
      ['Order No.',        po.orderNumber || 'N/A'],
      ['Order Date:',      po.orderDate ? new Date(po.orderDate).toLocaleDateString('en-GB').replace(/\//g, '-') : 'N/A'],
      ['Currency:',        'INR'],
      ['Conversion Rate:', '1.00'],
    ];
    let iy = y + 6;
    invoiceFields.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK).text(label, rightX + 4, iy);
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BLACK).text(String(value), rightX + 90, iy);
      iy += 13;
    });

    y += boxH + 6;

    // ════════════════════════════════════════════════════════════
    // 3. ITEMS TABLE
    // ════════════════════════════════════════════════════════════
    const itemCols = [
      { key: 'sr',       label: 'SR.',            w: 18,  align: 'center' },
      { key: 'item',     label: 'ITEM DETAILS',   w: 128, align: 'left'   },
      { key: 'hsn',      label: 'HSN/SAC',        w: 38,  align: 'center' },
      { key: 'uom',      label: 'UOM',            w: 24,  align: 'center' },
      { key: 'qty',      label: 'QTY',            w: 26,  align: 'right'  },
      { key: 'rate',     label: 'RATE',           w: 38,  align: 'right'  },
      { key: 'disc',     label: 'DISC.%',         w: 28,  align: 'center' },
      { key: 'warranty', label: 'WARRANTY',       w: 40,  align: 'center' },
      { key: 'totalAmt', label: 'TOTAL AMT.(Rs)', w: 44,  align: 'right'  },
      { key: 'grossAmt', label: 'GROSS AMT.(Rs)', w: 48,  align: 'right'  },
      { key: 'gst',      label: 'GST%/AMT.',      w: 38,  align: 'center' },
      { key: 'net',      label: 'NET AMT.(Rs)',   w: 74,  align: 'right'  },
    ];

    const rowH     = 16;
    const emptyRowH = 16;
    const itemColW  = 128;
    const itemTextW = itemColW - 4;

    let cx = M;
    itemCols.forEach(col => {
      fillRect(doc, cx, y, col.w, rowH, COLOR_TABLE_HDR);
      strokeRect(doc, cx, y, col.w, rowH);
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLOR_BLACK)
         .text(col.label, cx + 2, y + 5, { width: col.w - 4, align: col.align, lineBreak: false });
      cx += col.w;
    });
    y += rowH;

    const rowsToShow = Math.max(items.length, 8);

    for (let i = 0; i < rowsToShow; i++) {
      const item = items[i];
      const bg   = i % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
      cx = M;

      if (item) {
        const qty     = Number(item.quantity)        || 0;
        const rate    = Number(item.price)           || 0;
        const disc    = Number(item.discountPercent) || 0;
        const taxPct  = Number(item.taxPercent)      || 0;
        const lineAmt = qty * rate * (1 - disc / 100);
        const taxAmt  = lineAmt * taxPct / 100;
        const netVal  = lineAmt + taxAmt;
        const gstText  = taxPct > 0 ? `@${taxPct}%  ${taxAmt.toFixed(2)}` : '-';
        const discText = disc > 0 ? `${disc}%` : '-';

        const itemNameLine = item.productName || item.brandName || '-';

        const brandModelParts = [
          item.brandName ? `Brand: ${item.brandName}` : null,
          item.modelNo   ? `Model: ${item.modelNo}`   : null,
        ].filter(Boolean);
        const brandModelLine = brandModelParts.length > 0 ? brandModelParts.join('   ') : null;

        const descLine = (item.description && item.description.trim() !== '')
          ? item.description.trim()
          : null;

        const nameLinesH = doc.font('Helvetica-Bold').fontSize(7)
          .heightOfString(itemNameLine, { width: itemTextW });

        const brandModelH = brandModelLine
          ? doc.font('Helvetica').fontSize(6).heightOfString(brandModelLine, { width: itemTextW })
          : 0;

        const descH = descLine
          ? doc.font('Helvetica').fontSize(6).heightOfString(descLine, { width: itemTextW })
          : 0;

        const contentH    = nameLinesH + (brandModelH > 0 ? brandModelH + 2 : 0) + (descH > 0 ? descH + 2 : 0);
        const currentRowH = Math.max(emptyRowH, contentH + 10);

        const rowData = [
          { text: String(i + 1),                    align: 'center' },
          { text: itemNameLine,                      align: 'left', brandModelLine, descLine },
          { text: item.hsnSac || '-',               align: 'center' },
          { text: item.baseUOM || item.unit || '-', align: 'center' },
          { text: qty.toFixed(2),                   align: 'right'  },
          { text: rate.toFixed(2),                  align: 'right'  },
          { text: discText,                          align: 'center' },
          { text: item.warranty || '-',             align: 'center' },
          { text: lineAmt.toFixed(2),               align: 'right'  },
          { text: lineAmt.toFixed(2),               align: 'right'  },
          { text: gstText,                           align: 'center' },
          { text: netVal.toFixed(2),                align: 'right'  },
        ];

        itemCols.forEach((col, ci) => {
          fillRect(doc, cx, y, col.w, currentRowH, bg);
          strokeRect(doc, cx, y, col.w, currentRowH);

          if (col.key === 'item') {
            let lineY = y + 4;
            doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR_BLACK)
               .text(itemNameLine, cx + 2, lineY, { width: itemTextW, align: 'left' });
            lineY += nameLinesH + 2;

            if (brandModelLine) {
              doc.font('Helvetica').fontSize(6).fillColor(COLOR_DARK_GREY)
                 .text(brandModelLine, cx + 2, lineY, { width: itemTextW, align: 'left' });
              lineY += brandModelH + 2;
            }

            if (descLine) {
              doc.font('Helvetica').fontSize(6).fillColor('#666666')
                 .text(descLine, cx + 2, lineY, { width: itemTextW, align: 'left' });
            }
          } else {
            const textY = y + (currentRowH / 2) - 4;
            doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_BLACK)
               .text(String(rowData[ci].text), cx + 2, textY, {
                 width: col.w - 4, align: rowData[ci].align, lineBreak: false, ellipsis: true,
               });
          }
          cx += col.w;
        });

        y += currentRowH;
      } else {
        itemCols.forEach(col => {
          fillRect(doc, cx, y, col.w, emptyRowH, bg);
          strokeRect(doc, cx, y, col.w, emptyRowH);
          cx += col.w;
        });
        y += emptyRowH;
      }
    }

    cx = M;
    const totalRowData = [
      { text: '',                     align: 'center' },
      { text: 'Total',               align: 'right',  bold: true },
      { text: '',                     align: 'center' },
      { text: '',                     align: 'center' },
      { text: totalQty.toFixed(2),   align: 'right',  bold: true },
      { text: '',                     align: 'right'  },
      { text: '',                     align: 'center' },
      { text: '',                     align: 'center' },
      { text: totalAmt.toFixed(2),   align: 'right',  bold: true },
      { text: totalAmt.toFixed(2),   align: 'right',  bold: true },
      { text: totalTax.toFixed(2),   align: 'right',  bold: true },
      { text: grandTotal.toFixed(2), align: 'right',  bold: true },
    ];
    itemCols.forEach((col, ci) => {
      fillRect(doc, cx, y, col.w, rowH, COLOR_LIGHT_GREY);
      strokeRect(doc, cx, y, col.w, rowH);
      const d = totalRowData[ci];
      doc.font(d.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(COLOR_BLACK)
         .text(String(d.text), cx + 2, y + 4, { width: col.w - 4, align: d.align, lineBreak: false });
      cx += col.w;
    });
    y += rowH + 6;

    // ════════════════════════════════════════════════════════════
    // 4. HSN/SAC SUMMARY + TOTALS SUMMARY
    // ════════════════════════════════════════════════════════════
    const hsnW = CW * 0.58;
    const sumW = CW - hsnW - 4;
    const sumX = M + hsnW + 4;
    const hsnSectionStartY = y;

    const hsnCols = [
      { label: 'HSN/SAC',      w: hsnW * 0.18,  align: 'left'   },
      { label: 'TAXABLE AMT.', w: hsnW * 0.25,  align: 'right'  },
      { label: 'GST RATE',     w: hsnW * 0.18,  align: 'center' },
      { label: 'CGST',         w: hsnW * 0.195, align: 'right'  },
      { label: 'SGST',         w: hsnW * 0.195, align: 'right'  },
    ];

    let hx = M;
    hsnCols.forEach(col => {
      fillRect(doc, hx, y, col.w, rowH, COLOR_TABLE_HDR);
      strokeRect(doc, hx, y, col.w, rowH);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR_BLACK)
         .text(col.label, hx + 2, y + 5, { width: col.w - 4, align: col.align, lineBreak: false });
      hx += col.w;
    });
    y += rowH;

    fillRect(doc, M, y, hsnW, rowH, COLOR_LIGHT_GREY);
    strokeRect(doc, M, y, hsnW, rowH);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR_BLACK)
       .text('HSN/SAC & CESS SUMMARY', M + 2, y + 5, { width: hsnW - 4, align: 'center' });
    y += rowH;

    const hsnRows = Math.max(items.length, 5);
    for (let i = 0; i < hsnRows; i++) {
      const item = items[i];
      hx = M;
      if (item) {
        const qty     = Number(item.quantity)        || 0;
        const rate    = Number(item.price)           || 0;
        const disc    = Number(item.discountPercent) || 0;
        const taxPct  = Number(item.taxPercent)      || 0;
        const lineAmt = qty * rate * (1 - disc / 100);
        const taxAmt  = lineAmt * taxPct / 100;
        const rowData = [
          item.hsnSac || '-',
          lineAmt.toFixed(2),
          `${taxPct}%`,
          (taxAmt / 2).toFixed(2),
          (taxAmt / 2).toFixed(2),
        ];
        hsnCols.forEach((col, ci) => {
          strokeRect(doc, hx, y, col.w, rowH);
          doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_BLACK)
             .text(rowData[ci], hx + 2, y + 5, { width: col.w - 4, align: col.align, lineBreak: false });
          hx += col.w;
        });
      } else {
        hsnCols.forEach(col => { strokeRect(doc, hx, y, col.w, rowH); hx += col.w; });
      }
      y += rowH;
    }

    hx = M;
    const hsnTotalData = [
      { text: 'Total',             align: 'left',  bold: true },
      { text: totalAmt.toFixed(2), align: 'right', bold: true },
      { text: '',                  align: 'center' },
      { text: cgst.toFixed(2),     align: 'right', bold: true },
      { text: sgst.toFixed(2),     align: 'right', bold: true },
    ];
    hsnCols.forEach((col, ci) => {
      fillRect(doc, hx, y, col.w, rowH, COLOR_LIGHT_GREY);
      strokeRect(doc, hx, y, col.w, rowH);
      const d = hsnTotalData[ci];
      doc.font(d.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(COLOR_BLACK)
         .text(d.text, hx + 2, y + 5, { width: col.w - 4, align: d.align, lineBreak: false });
      hx += col.w;
    });

    let sy = hsnSectionStartY;
    const summaryRows = [
      { label: 'Total Amount',       value: totalAmt.toFixed(2),   bold: false },
      { label: 'Total Gross Amount', value: totalAmt.toFixed(2),   bold: false },
      { label: 'CGST',               value: cgst.toFixed(2),       bold: false },
      { label: 'SGST',               value: sgst.toFixed(2),       bold: false },
      { label: 'Total Net Amount',   value: grandTotal.toFixed(2), bold: true  },
      { label: 'Round-Off',          value: '0.00',                bold: false },
    ];
    summaryRows.forEach(row => {
      const bg = row.bold ? '#EBEBEB' : '#FFFFFF';
      fillRect(doc, sumX, sy, sumW, rowH, bg);
      strokeRect(doc, sumX, sy, sumW, rowH);
      doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLOR_BLACK)
         .text(row.label, sumX + 4, sy + 5, { width: sumW * 0.60, align: 'left',  lineBreak: false });
      doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLOR_BLACK)
         .text(row.value, sumX + 4, sy + 5, { width: sumW - 8,    align: 'right', lineBreak: false });
      sy += rowH;
    });

    y += rowH + 4;

    // ════════════════════════════════════════════════════════════
    // 5. TOTAL IN WORDS + GRAND TOTAL
    // ════════════════════════════════════════════════════════════
    const wordsW   = CW * 0.60;
    const totalBW  = CW - wordsW - 4;
    const totalBX  = M + wordsW + 4;
    const wordRowH = 28;

    strokeRect(doc, M, y, wordsW, wordRowH);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BLACK)
       .text('Total Amount in Words:', M + 4, y + 4, { width: wordsW - 8, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_DARK_GREY)
       .text(numberToWords(grandTotal), M + 4, y + 16, {
         width: wordsW - 8, align: 'left', lineBreak: false, ellipsis: true,
       });

    fillRect(doc, totalBX, y, totalBW, wordRowH, COLOR_PINK);
    strokeRect(doc, totalBX, y, totalBW, wordRowH);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BLACK)
       .text('Total Amount (Rs)', totalBX + 5, y + 9, {
         width: totalBW * 0.58, align: 'left', lineBreak: false,
       });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BLACK)
       .text(grandTotal.toFixed(2), totalBX + 5, y + 9, {
         width: totalBW - 10, align: 'right', lineBreak: false,
       });

    y += wordRowH + 4;

    // ════════════════════════════════════════════════════════════
    // 6. PAYMENT TERMS + SIGNATURE
    // Signature-stamping code is wrapped in its own try/catch so ANY
    // failure there (bad buffer, pdfkit internal error, etc.) can NEVER
    // abort the whole PDF generation — it always falls back to the
    // placeholder text and the document still completes and downloads.
    // ════════════════════════════════════════════════════════════
    const footerH = 55;
    strokeRect(doc, M, y, CW, footerH);

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text('Payment Terms:', M + 6, y + 10);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BLACK)
       .text(paymentText, M + 6, y + 22, { width: CW * 0.55 });

    const sigX = M + CW * 0.62;
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
       .text(`For, ${companyConfig.name}`, sigX, y + 8, { width: CW * 0.36 });

    // Enlarged signature box (was 80x26) to match the bigger on-screen preview box
    const sigBoxX = sigX + 5;
    const sigBoxY = y + 16;
    const sigBoxW = 110;
    const sigBoxH = 40;

    strokeRect(doc, sigBoxX, sigBoxY, sigBoxW, sigBoxH, COLOR_BORDER);

    let signatureStamped = false;
    try {
      const isApproved = po.status === 'Approved';
      const SIGNATURE_BUFFER = logoCache.signature;

      if (isApproved && SIGNATURE_BUFFER) {
        doc.image(SIGNATURE_BUFFER, sigBoxX + 5, sigBoxY + 3, {
          fit: [sigBoxW - 10, sigBoxH - 6],
          align: 'center',
          valign: 'center',
        });
        signatureStamped = true;
        console.log('[PDF-SIGN] ✅ Signature stamped on PDF');
      } else if (isApproved && !SIGNATURE_BUFFER) {
        console.warn('[PDF-SIGN] ⚠️ PO is Approved but no signature buffer is loaded — falling back to placeholder text.');
      }
    } catch (e) {
      console.error('[PDF-SIGN] ❌ doc.image() for signature FAILED — falling back to placeholder text:', e.message);
      signatureStamped = false;
    }

    if (!signatureStamped) {
      doc.font('Helvetica').fontSize(7).fillColor('#AAAAAA')
         .text('Authorised Signatory', sigBoxX + 2, sigBoxY + (sigBoxH / 2) - 4, { width: sigBoxW - 4, align: 'center' });
    }

    doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
       .text('Signature', sigX + 40, y + 60);

    y += footerH + 6;

    if (po.remark) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK).text('Remarks:', M, y);
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
         .text(po.remark, M + 52, y, { width: CW - 52 });
    }

    doc.end();

  } catch (error) {
    console.error('Error generating Purchase Order PDF:', error.stack || error.message);

    if (!streamingStarted && !res.headersSent) {
      // Nothing was sent yet — safe to respond with a normal JSON error.
      return res.status(500).json({ success: false, error: 'Error generating PDF: ' + error.message });
    }

    // Streaming had already begun (headers sent) when the error hit. We
    // can't send JSON anymore, but we MUST terminate the response or the
    // client's request hangs forever with a spinner that never resolves.
    try {
      if (doc && typeof doc.destroy === 'function') doc.destroy();
    } catch (_) {}
    if (!res.writableEnded) {
      res.end();
    }
  }
};
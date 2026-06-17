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

const logoCache = { entero: null, daccess: null };
let logoInitPromise = null;

async function ensureLogos() {
  if (logoCache.entero && logoCache.daccess) return;
  if (logoInitPromise) return logoInitPromise;

  logoInitPromise = (async () => {
    console.log('[PDF-LOGO] ── Initializing logos ──');

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

    console.log('[PDF-LOGO]   Entero:', logoCache.entero ? `✅ ${logoCache.entero.length} bytes` : '❌ MISSING');
    console.log('[PDF-LOGO]   DAccess:', logoCache.daccess ? `✅ ${logoCache.daccess.length} bytes` : '❌ MISSING');
  })();

  return logoInitPromise;
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
  if (logoCache.entero && logoCache.daccess) logoInitPromise = Promise.resolve();
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

    const doc      = new PDFDocument({ margin: 0, size: 'A4' });
    const filename = `PO_${po.orderNumber || id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

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
    // ── FIX 1: Dynamic box height based on actual vendor address
    // length so long addresses are never clipped. GSTIN/UIN always
    // renders at the bottom of the vendor box.
    // ════════════════════════════════════════════════════════════
    const leftW  = CW * 0.52;
    const rightW = CW - leftW - 2;
    const rightX = M + leftW + 2;

    const vendor = po.vendor || {};

    // Build full vendor address string (same logic as UI)
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

    // ── Measure how tall the vendor box needs to be ──
    // Name: ~13px, address block: measured, GSTIN: ~12px, padding: 16px
    const vendorNameH    = 13;
    const vendorAddrH    = vendorAddress
      ? doc.font('Helvetica').fontSize(8).heightOfString(vendorAddress, { width: leftW - 8 })
      : 0;
    const vendorGstH     = vendor.GSTNo ? 12 : 0;
    const vendorPadding  = 18;
    // Minimum 68, grows as needed
    const boxH = Math.max(68, vendorNameH + vendorAddrH + vendorGstH + vendorPadding);

    // Header rows
    fillRect(doc, M, y, leftW, 14, COLOR_TABLE_HDR);
    strokeRect(doc, M, y, leftW, 14);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text('VENDOR DETAILS', M + 4, y + 4);

    fillRect(doc, rightX, y, rightW, 14, COLOR_TABLE_HDR);
    strokeRect(doc, rightX, y, rightW, 14);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text('INVOICE DETAILS', rightX + 4, y + 4);

    y += 14;

    // Vendor box — full dynamic height
    strokeRect(doc, M, y, leftW, boxH);

    let vy = y + 5;

    // Vendor name
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BLACK)
       .text(vendor.vendorName || 'N/A', M + 4, vy, { width: leftW - 8 });
    vy += vendorNameH;

    // Full address — rendered with word-wrap, never clipped
    if (vendorAddress) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
         .text(vendorAddress, M + 4, vy, { width: leftW - 8 });
      vy += vendorAddrH + 3;
    }

    // GSTIN — always shown after address
    if (vendor.GSTNo) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BLACK)
         .text(`GSTIN/UIN: ${vendor.GSTNo}`, M + 4, vy, { width: leftW - 8 });
    }

    // Invoice details box — same dynamic height
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
    // ── FIX 2: Description is now ALWAYS shown as a sub-line
    // (same as the UI which joins brand • model • description).
    // Previously description was skipped when it matched productName;
    // now all three lines render independently — product name (bold),
    // brand + model (grey, labeled), description (grey, smaller) —
    // matching the ViewPurchaseOrderPopUp UI exactly.
    // Row height auto-expands to fit all content lines.
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
    const itemColW  = 128; // ITEM DETAILS column width
    const itemTextW = itemColW - 4;

    // Column header row
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

        // ── Line 1: Product name (bold) ──────────────────────────────────
        const itemNameLine = item.productName || item.brandName || '-';

        // ── Line 2: Brand + Model (labeled, grey) — always shown if present
        const brandModelParts = [
          item.brandName ? `Brand: ${item.brandName}` : null,
          item.modelNo   ? `Model: ${item.modelNo}`   : null,
        ].filter(Boolean);
        const brandModelLine = brandModelParts.length > 0 ? brandModelParts.join('   ') : null;

        // ── Line 3: Description — FIX: ALWAYS shown when it exists,
        // regardless of whether it matches productName.
        // This matches the UI which always includes description in subParts.
        const descLine = (item.description && item.description.trim() !== '')
          ? item.description.trim()
          : null;

        // ── Measure each line height to auto-size the row ────────────────
        const nameLinesH = doc.font('Helvetica-Bold').fontSize(7)
          .heightOfString(itemNameLine, { width: itemTextW });

        const brandModelH = brandModelLine
          ? doc.font('Helvetica').fontSize(6).heightOfString(brandModelLine, { width: itemTextW })
          : 0;

        const descH = descLine
          ? doc.font('Helvetica').fontSize(6).heightOfString(descLine, { width: itemTextW })
          : 0;

        // Total content height + top/bottom padding (6px each)
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
            // Line 1: Product name (bold, 7pt)
            let lineY = y + 4;
            doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR_BLACK)
               .text(itemNameLine, cx + 2, lineY, { width: itemTextW, align: 'left' });
            lineY += nameLinesH + 2;

            // Line 2: Brand + Model (6pt, dark grey)
            if (brandModelLine) {
              doc.font('Helvetica').fontSize(6).fillColor(COLOR_DARK_GREY)
                 .text(brandModelLine, cx + 2, lineY, { width: itemTextW, align: 'left' });
              lineY += brandModelH + 2;
            }

            // Line 3: Description (6pt, grey) — always rendered when present
            if (descLine) {
              doc.font('Helvetica').fontSize(6).fillColor('#666666')
                 .text(descLine, cx + 2, lineY, { width: itemTextW, align: 'left' });
            }
          } else {
            // Other columns: vertically centered
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
        // Empty padding rows
        itemCols.forEach(col => {
          fillRect(doc, cx, y, col.w, emptyRowH, bg);
          strokeRect(doc, cx, y, col.w, emptyRowH);
          cx += col.w;
        });
        y += emptyRowH;
      }
    }

    // Total row
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

    strokeRect(doc, sigX + 10, y + 18, 80, 26, COLOR_BORDER);
    doc.font('Helvetica').fontSize(7).fillColor('#AAAAAA')
       .text('Authorised Signatory', sigX + 12, y + 28, { width: 76, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
       .text('Signature', sigX + 30, y + 46);

    y += footerH + 6;

    if (po.remark) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK).text('Remarks:', M, y);
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
         .text(po.remark, M + 52, y, { width: CW - 52 });
    }

    doc.end();

  } catch (error) {
    console.error('Error generating Purchase Order PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Error generating PDF: ' + error.message });
    }
  }
};
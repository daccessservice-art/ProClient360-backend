const PDFDocument = require('pdfkit');
const PurchaseOrder = require('../models/purchaseOrderModel');
const fs   = require('fs');
const path = require('path');

// ── Pre-load logo — searches ALL common production + local paths ─────────────
let LOGO_BUFFER = null;

const LOGO_SEARCH_PATHS = [
  // ── Your confirmed local path ──
  path.join(__dirname, '../../pms-front/public/static/assets/img/nav/DACCESS.png'),

  // ── Common production layouts ──
  path.join(__dirname, '../../../pms-front/public/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../../../pms-front/public/static/assets/img/nav/DACCESS.png'),

  // ── If frontend is built into "client" folder ──
  path.join(__dirname, '../../client/public/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../client/build/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../../client/public/static/assets/img/nav/DACCESS.png'),

  // ── If frontend is built into "frontend" folder ──
  path.join(__dirname, '../../frontend/public/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../frontend/build/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../../frontend/public/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../../frontend/build/static/assets/img/nav/DACCESS.png'),

  // ── If backend serves static files from public/ ──
  path.join(__dirname, '../public/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../public/static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../static/assets/img/nav/DACCESS.png'),
  path.join(__dirname, '../../static/assets/img/nav/DACCESS.png'),

  // ── From process.cwd() (project root) ──
  path.join(process.cwd(), 'pms-front/public/static/assets/img/nav/DACCESS.png'),
  path.join(process.cwd(), 'frontend/public/static/assets/img/nav/DACCESS.png'),
  path.join(process.cwd(), 'frontend/build/static/assets/img/nav/DACCESS.png'),
  path.join(process.cwd(), 'client/public/static/assets/img/nav/DACCESS.png'),
  path.join(process.cwd(), 'client/build/static/assets/img/nav/DACCESS.png'),
  path.join(process.cwd(), 'public/static/assets/img/nav/DACCESS.png'),
  path.join(process.cwd(), 'static/assets/img/nav/DACCESS.png'),
];

// ── Log every path checked so you can see EXACTLY what's happening ──
console.log('🔍 [PDF] __dirname       :', __dirname);
console.log('🔍 [PDF] process.cwd()   :', process.cwd());
console.log('🔍 [PDF] Searching for DACCESS.png...');

for (const p of LOGO_SEARCH_PATHS) {
  const exists = fs.existsSync(p);
  console.log(`   ${exists ? '✅ FOUND' : '❌ miss '} → ${p}`);
  if (exists) {
    try {
      LOGO_BUFFER = fs.readFileSync(p);
      console.log('✅ [PDF] Logo loaded successfully from:', p);
      break;
    } catch (e) {
      console.warn('⚠️  [PDF] Found but could not read:', p, e.message);
    }
  }
}

if (!LOGO_BUFFER) {
  console.warn('⚠️  [PDF] Logo NOT found in any path — text fallback will be used.');
  console.warn('    Run this on your server to find the file:');
  console.warn('    find / -name "DACCESS.png" 2>/dev/null');
}

// ── Number to Words ──────────────────────────────────────────────────────────
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

// ── Constants ────────────────────────────────────────────────────────────────
const COMPANY_NAME    = 'Daccess Security Systems Pvt Ltd';
const COMPANY_ADDRESS = 'Office No.05, 3rd Floor, Revati Arcade-II, Opposite to Kapil Malhar Society, Baner, Pune-411045, Maharashtra, India';
const COMPANY_GSTIN   = '27AACCD7325G1ZR';

const COLOR_RED        = '#DC3232';
const COLOR_TABLE_HDR  = '#B4B49A';
const COLOR_LIGHT_GREY = '#F5F5F5';
const COLOR_PINK       = '#FFD2D2';
const COLOR_BLACK      = '#000000';
const COLOR_DARK_GREY  = '#444444';
const COLOR_BORDER     = '#BBBBBB';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fillRect = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fill(color).restore();
};
const strokeRect = (doc, x, y, w, h, color = COLOR_BORDER, lineWidth = 0.5) => {
  doc.save().rect(x, y, w, h).lineWidth(lineWidth).stroke(color).restore();
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════
exports.downloadPurchaseOrderPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const po = await PurchaseOrder.findById(id)
      .populate('vendor',    'vendorName address gstin phoneNumber1 email')
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
    const PH = doc.page.height;
    const M  = 20;
    const CW = PW - M * 2;

    let y = M;

    // ════════════════════════════════════════════════════════════
    // 1. HEADER — Logo (left) | Title centered over full width
    // ════════════════════════════════════════════════════════════

    const HEADER_H  = 50;
    const LOGO_H    = 38;
    const LOGO_MAXW = 110;

    // Logo — absolute left position
    if (LOGO_BUFFER) {
      doc.image(LOGO_BUFFER, M, y + 4, { fit: [LOGO_MAXW, LOGO_H] });
    } else {
      strokeRect(doc, M, y + 8, 100, 30, '#6488A8', 1);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#6488A8')
         .text('D ACCESS', M + 8, y + 17);
    }

    // "Purchase Order" — centered across full page width
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_RED)
       .text('Purchase Order', M, y + 14, { width: CW, align: 'center' });

    y += HEADER_H;

    // Company name + GSTIN
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_BLACK)
       .text(COMPANY_NAME, M, y);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text(`GSTIN/UIN: ${COMPANY_GSTIN}`, M, y, { width: CW, align: 'right' });

    y += 14;

    doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
       .text(COMPANY_ADDRESS, M, y, { width: CW * 0.70 });

    y += 20;

    doc.save().moveTo(M, y).lineTo(PW - M, y).lineWidth(0.5).stroke(COLOR_BORDER).restore();
    y += 6;

    // ════════════════════════════════════════════════════════════
    // 2. VENDOR DETAILS  +  INVOICE DETAILS
    // ════════════════════════════════════════════════════════════

    const leftW  = CW * 0.52;
    const rightW = CW - leftW - 2;
    const rightX = M + leftW + 2;
    const boxH   = 68;

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
    const vendor = po.vendor || {};
    let vy = y + 5;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BLACK)
       .text(vendor.vendorName || 'N/A', M + 4, vy, { width: leftW - 8 });
    vy += 13;
    if (vendor.address) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
         .text(vendor.address, M + 4, vy, { width: leftW - 8 });
      vy += 20;
    }
    if (vendor.gstin) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BLACK)
         .text(`GSTIN/UIN: ${vendor.gstin}`, M + 4, vy, { width: leftW - 8 });
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
      { key: 'sr',       label: 'SR.',            w: 24,  align: 'center' },
      { key: 'item',     label: 'ITEM DETAILS',   w: 142, align: 'left'   },
      { key: 'hsn',      label: 'HSN/SAC',        w: 47,  align: 'center' },
      { key: 'uom',      label: 'UOM',            w: 32,  align: 'center' },
      { key: 'qty',      label: 'QTY',            w: 34,  align: 'right'  },
      { key: 'rate',     label: 'RATE',           w: 47,  align: 'right'  },
      { key: 'totalAmt', label: 'TOTAL AMT.(Rs)', w: 57,  align: 'right'  },
      { key: 'grossAmt', label: 'GROSS AMT.(Rs)', w: 65,  align: 'right'  },
      { key: 'gst',      label: 'GST%/AMT.',      w: 45,  align: 'center' },
      { key: 'net',      label: 'NET AMT.(Rs)',    w: 55,  align: 'right'  },
    ];

    const rowH = 16;
    let cx = M;
    itemCols.forEach(col => {
      fillRect(doc, cx, y, col.w, rowH, COLOR_TABLE_HDR);
      strokeRect(doc, cx, y, col.w, rowH);
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLOR_BLACK)
         .text(col.label, cx + 2, y + 5, { width: col.w - 4, align: col.align, lineBreak: false });
      cx += col.w;
    });
    y += rowH;

    const dataRowH   = 20;
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
        const gstText = taxPct > 0 ? `@${taxPct}%  ${taxAmt.toFixed(2)}` : '-';
        const itemName = [item.brandName, item.description || item.modelNo].filter(Boolean).join('  ');

        const rowData = [
          { text: String(i + 1),                    align: 'center' },
          { text: itemName,                          align: 'left'   },
          { text: item.hsnSac || '-',               align: 'center' },
          { text: item.baseUOM || item.unit || '-', align: 'center' },
          { text: qty.toFixed(2),                   align: 'right'  },
          { text: rate.toFixed(2),                  align: 'right'  },
          { text: lineAmt.toFixed(2),               align: 'right'  },
          { text: lineAmt.toFixed(2),               align: 'right'  },
          { text: gstText,                           align: 'center' },
          { text: netVal.toFixed(2),                align: 'right'  },
        ];

        itemCols.forEach((col, ci) => {
          fillRect(doc, cx, y, col.w, dataRowH, bg);
          strokeRect(doc, cx, y, col.w, dataRowH);
          doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_BLACK)
             .text(String(rowData[ci].text), cx + 2, y + 6, {
               width: col.w - 4, align: rowData[ci].align, lineBreak: false, ellipsis: true,
             });
          cx += col.w;
        });
      } else {
        itemCols.forEach(col => {
          fillRect(doc, cx, y, col.w, dataRowH, bg);
          strokeRect(doc, cx, y, col.w, dataRowH);
          cx += col.w;
        });
      }
      y += dataRowH;
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
    // 4. HSN/SAC SUMMARY  +  TOTALS SUMMARY
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
      { label: 'Total Amount',       value: totalAmt.toFixed(2),    bold: false },
      { label: 'Total Gross Amount', value: totalAmt.toFixed(2),    bold: false },
      { label: 'CGST',               value: cgst.toFixed(2),        bold: false },
      { label: 'SGST',               value: sgst.toFixed(2),        bold: false },
      { label: 'Total Net Amount',   value: grandTotal.toFixed(2),  bold: true  },
      { label: 'Round-Off',          value: '0.00',                 bold: false },
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
    // 5. TOTAL IN WORDS  +  GRAND TOTAL
    // ════════════════════════════════════════════════════════════

    const wordsW   = CW * 0.60;
    const totalBW  = CW - wordsW - 4;
    const totalBX  = M + wordsW + 4;
    const wordRowH = 28;

    // Words box — label on line 1, value on line 2
    strokeRect(doc, M, y, wordsW, wordRowH);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_BLACK)
       .text('Total Amount in Words:', M + 4, y + 4, { width: wordsW - 8, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_DARK_GREY)
       .text(numberToWords(grandTotal), M + 4, y + 16, {
         width: wordsW - 8, align: 'left', lineBreak: false, ellipsis: true,
       });

    // Grand total pink box
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
    // 6. PAYMENT TERMS  +  SIGNATURE
    // ════════════════════════════════════════════════════════════

    const footerH = 55;
    strokeRect(doc, M, y, CW, footerH);

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLACK)
       .text('Payment Terms:', M + 6, y + 10);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_BLACK)
       .text(paymentText, M + 6, y + 22, { width: CW * 0.55 });

    const sigX = M + CW * 0.62;
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_DARK_GREY)
       .text(`For, ${COMPANY_NAME}`, sigX, y + 8, { width: CW * 0.36 });

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
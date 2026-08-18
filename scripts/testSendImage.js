// scripts/testSendImage.js
//
// DIRECT TEST — uploads a test image and sends it to a real phone
// number, bypassing the whole campaign/webhook flow.
//
// Usage:
//   node scripts/testSendImage.js 9322604350 /path/to/test-image.jpg

require('dotenv').config();
const fs = require('fs');
const wa = require('../services/campaignWhatsAppService');

async function main() {
  const phone = process.argv[2];
  const imagePath = process.argv[3];

  if (!phone || !imagePath) {
    console.error('❌ Usage: node scripts/testSendImage.js <phone number> <path to image file>');
    process.exit(1);
  }
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ File not found: ${imagePath}`);
    process.exit(1);
  }

  console.log(`Uploading ${imagePath}...`);
  const buffer = fs.readFileSync(imagePath);
  const ext = imagePath.split('.').pop().toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  let mediaId;
  try {
    mediaId = await wa.uploadMedia(buffer, mimeType, imagePath.split('/').pop());
    console.log('✅ Upload succeeded, mediaId:', mediaId);
  } catch (err) {
    console.error('❌ Upload FAILED:', err.response?.data || err.message);
    process.exit(1);
  }

  console.log(`\nSending image to ${phone}...`);
  const result = await wa.sendImageMessage(phone, mediaId, 'Direct API test image');

  if (result.ok) {
    console.log('✅ SUCCESS — image sent.');
    console.log('Raw response:', JSON.stringify(result.data, null, 2));
  } else {
    console.log('❌ FAILED to send image.');
    console.log('Exact reason:', result.reason);
  }
}

main().catch((err) => {
  console.error('❌ Script crashed:', err.message);
  process.exit(1);
});
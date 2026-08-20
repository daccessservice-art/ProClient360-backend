// scripts/testHeaderHandleUpload.js
//
// DIRECT TEST — tests ONLY the Resumable Upload mechanism (the NEW
// 2-step process needed to attach an image to a template as its
// header). This has never been tested against Pinnacle's real server
// before — only simulated. This will show the exact error if it's
// failing, or confirm it works.
//
// Usage:
//   node scripts/testHeaderHandleUpload.js /path/to/image.jpg

require('dotenv').config();
const fs = require('fs');
const wa = require('../services/campaignWhatsAppService');

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('❌ Usage: node scripts/testHeaderHandleUpload.js <path to image file>');
    process.exit(1);
  }
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ File not found: ${imagePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(imagePath);
  const ext = imagePath.split('.').pop().toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  console.log(`Testing Resumable Upload for ${imagePath} (${buffer.length} bytes, ${mimeType})...\n`);

  try {
    const handle = await wa.uploadMediaForHeaderHandle(buffer, mimeType);
    console.log('✅✅✅ SUCCESS — got a real header handle:');
    console.log(handle);
    console.log('\nThe Resumable Upload mechanism works. If images still aren\'t');
    console.log('showing with the Initial Message, the issue is elsewhere (e.g.');
    console.log('the template needs to be resubmitted and approved again).');
  } catch (err) {
    console.log('❌❌❌ FAILED — this is the exact error from Pinnacle:');
    console.log(err.response?.data || err.message);
    console.log('\nThis is the real reason header images aren\'t working — paste this');
    console.log('exact error text and I\'ll fix the specific request format issue.');
  }
}

main().catch((err) => {
  console.error('❌ Script crashed:', err.message);
  process.exit(1);
});
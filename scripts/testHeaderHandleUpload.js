// scripts/testHeaderHandleUpload.js
//
// STEP 1 of rebuilding the "image with first message" feature.
// Tests ONLY the Resumable Upload mechanism in complete isolation —
// no templates, no campaigns, nothing else. This is the exact piece
// that caused instability before. We confirm THIS works on its own,
// with a real, current server, before writing any code that depends
// on it.
//
// Usage:
//   node scripts/testHeaderHandleUpload.js /path/to/image.jpg

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const WABA_API_KEY = process.env.WABA_API_KEY;
const WABA_BASE_URL = process.env.WABA_BASE_URL || 'https://partnersv1.pinbot.ai/v3';

async function uploadMediaForHeaderHandle(fileBuffer, mimeType) {
  console.log('Step 1a: requesting an upload session...');
  const step1 = await axios.post(
    `${WABA_BASE_URL}/app/uploads`,
    null,
    {
      params: { file_length: fileBuffer.length, file_type: mimeType },
      headers: { apikey: WABA_API_KEY },
      timeout: 15000,
    }
  );
  console.log('Step 1a raw response:', JSON.stringify(step1.data));
  const sessionId = step1.data?.id;
  if (!sessionId) throw new Error('Pinnacle did not return an upload session id.');

  console.log('\nStep 1b: uploading the actual file bytes to that session...');
  const step2 = await axios.post(
    `${WABA_BASE_URL}/${sessionId}`,
    fileBuffer,
    { headers: { apikey: WABA_API_KEY, 'Content-Type': 'application/octet-stream' }, timeout: 15000 }
  );
  console.log('Step 1b raw response:', JSON.stringify(step2.data));
  const handle = step2.data?.h;
  if (!handle) throw new Error('Pinnacle did not return a file handle.');
  return handle;
}

async function main() {
  let imagePath = process.argv[2];
  if (!imagePath || !fs.existsSync(imagePath)) {
    imagePath = 'test-image.jpg';
    if (!fs.existsSync(imagePath)) {
      fs.writeFileSync(imagePath, Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=', 'base64'));
    }
  }

  const buffer = fs.readFileSync(imagePath);
  const ext = imagePath.split('.').pop().toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  console.log(`Testing with ${imagePath} (${buffer.length} bytes, ${mimeType})\n`);
  console.log('='.repeat(50));

  try {
    const handle = await uploadMediaForHeaderHandle(buffer, mimeType);
    console.log('\n' + '='.repeat(50));
    console.log('✅✅✅ SUCCESS — got a real header handle:');
    console.log(handle);
    console.log('\nThis mechanism works. Safe to proceed to Step 2 of rebuilding the feature.');
  } catch (err) {
    console.log('\n' + '='.repeat(50));
    console.log('❌❌❌ FAILED — this is the exact error from Pinnacle:');
    console.log(JSON.stringify(err.response?.data || err.message, null, 2));
    console.log('\nDo NOT proceed to integrate this yet — paste this exact error');
    console.log('so the real problem can be diagnosed first.');
  }
}

main().catch((err) => {
  console.error('❌ Script crashed:', err.message);
  process.exit(1);
});
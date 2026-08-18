// scripts/testSendListMessage.js
//
// DIRECT TEST — sends ONE real tappable question to ONE real phone
// number, completely bypassing the webhook/session/campaign flow.
// This answers exactly one question: does Pinnacle actually accept
// the list message payload, or reject it?
//
// IMPORTANT: the number you test with MUST have messaged your WhatsApp
// business number within the last 24 hours, or Pinnacle will reject
// this the same way it would reject the real flow — that's a WhatsApp
// platform rule, not a bug in this script.
//
// Usage:
//   node scripts/testSendListMessage.js 9322604350

require('dotenv').config();
const wa = require('../services/campaignWhatsAppService');

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('❌ Usage: node scripts/testSendListMessage.js <phone number>');
    process.exit(1);
  }

  console.log(`Sending a test tappable question to ${phone}...`);
  console.log('(If this number has not messaged your business number in the last 24 hours, this WILL fail — that is expected WhatsApp behavior, not a bug.)\n');

  const result = await wa.sendListMessage(
    phone,
    'This is a direct API test. Please pick an option:',
    [
      { title: 'Option A', description: 'First test option' },
      { title: 'Option B', description: 'Second test option' },
    ],
    'Select',
    'Test Question'
  );

  console.log('');
  if (result.ok) {
    console.log('✅ SUCCESS — Pinnacle accepted the request.');
    console.log('Raw response:', JSON.stringify(result.data, null, 2));
    console.log('\nCheck the phone now — a tappable list should have arrived.');
    console.log('If it did NOT arrive despite this success response, the issue is on');
    console.log('Meta/Pinnacle delivery, not your code — contact Pinnacle support with this response.');
  } else {
    console.log('❌ FAILED — Pinnacle rejected the request.');
    console.log('Exact reason:', result.reason);
    console.log('\nThis is the real error message — paste this exact text to get it fixed.');
  }
}

main().catch((err) => {
  console.error('❌ Script crashed:', err.message);
  process.exit(1);
});
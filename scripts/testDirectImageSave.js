// scripts/testDirectImageSave.js
//
// THE DEFINITIVE TEST. Bypasses the browser, the upload button, the API
// route — everything except the database itself. This directly tests:
// "can this template's images field even be saved and read back at all?"
//
// If this WORKS: the backend/database is fine, and the real problem is
// somewhere in the browser not sending the right data (a stale/old build).
//
// If this FAILS: there's a genuine deeper bug in the database schema
// itself, and I need the exact error this prints to fix it.
//
// Usage:
//   node scripts/testDirectImageSave.js charger

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const productName = process.argv[2];
  if (!productName) {
    console.error('❌ Usage: node scripts/testDirectImageSave.js <product name>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to database.\n');

  const CampaignTemplate = require('../models/campaignTemplateModel');

  const template = await CampaignTemplate.findOne({
    title: { $regex: productName, $options: 'i' },
  });

  if (!template) {
    console.log(`❌ No template found matching "${productName}".`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found template: "${template.title}"`);
  console.log('Images BEFORE this test:', JSON.stringify(template.images));

  // Directly set and save — the exact same operation updateTemplate does.
  template.images = [{ mediaId: 'TEST_MEDIA_ID_12345', caption: 'Direct save test' }];

  try {
    await template.save();
    console.log('\n✅ .save() completed without throwing an error.');
  } catch (err) {
    console.log('\n❌ .save() THREW AN ERROR:');
    console.log(err.message);
    if (err.errors) {
      console.log('Validation errors:', JSON.stringify(err.errors, null, 2));
    }
    await mongoose.disconnect();
    return;
  }

  // Re-fetch fresh from the database — not from memory — to prove it
  // actually persisted, not just that the in-memory object looks right.
  const reFetched = await CampaignTemplate.findById(template._id);
  console.log('\nImages AFTER re-fetching fresh from database:', JSON.stringify(reFetched.images));

  if (reFetched.images && reFetched.images.length > 0 && reFetched.images[0].mediaId === 'TEST_MEDIA_ID_12345') {
    console.log('\n✅✅✅ CONFIRMED: the database CAN save and read back images correctly.');
    console.log('This means the backend/database is NOT the problem.');
    console.log('The bug must be in the browser/frontend not sending the right data.');
  } else {
    console.log('\n❌❌❌ CONFIRMED BUG: the database did NOT actually save the image,');
    console.log('even though .save() reported success. This is a real schema-level issue.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Script crashed:', err.message);
  process.exit(1);
});
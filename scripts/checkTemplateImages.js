// scripts/checkTemplateImages.js
//
// Connects DIRECTLY to MongoDB and prints exactly what's stored for a
// template by name — bypassing the API, the frontend, and any caching.
// This tells us definitively: did the image actually get saved to the
// database, or not?
//
// Usage:
//   node scripts/checkTemplateImages.js charger

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const productName = process.argv[2];
  if (!productName) {
    console.error('❌ Usage: node scripts/checkTemplateImages.js <product name>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to database.\n');

  const CampaignTemplate = require('../models/campaignTemplateModel');

  const templates = await CampaignTemplate.find({
    title: { $regex: productName, $options: 'i' },
  }).select('title status images questions updatedAt');

  if (templates.length === 0) {
    console.log(`❌ No template found matching "${productName}".`);
  } else {
    templates.forEach((t) => {
      console.log(`── Template: "${t.title}" ──`);
      console.log('   Status:', t.status);
      console.log('   Last updated:', t.updatedAt);
      console.log('   Images stored in database:', JSON.stringify(t.images, null, 2));
      console.log('   Questions stored:', t.questions.length);
      console.log('');
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Script crashed:', err.message);
  process.exit(1);
});
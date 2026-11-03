require('dotenv').config();
const mongoose = require('mongoose');
const TaskSheet = require('../models/taskSheetModel');
const { syncSharedTaskProgress } = require('../helpers/myTaskProgress');

(async () => {
  await mongoose.connect(process.env.MONGO_URI); // use the same env name as your config/db.js
  const tasks = await TaskSheet.find({ 'employees.1': { $exists: true } }).select('_id');
  console.log(`Fixing ${tasks.length} shared tasks...`);
  for (const t of tasks) {
    await syncSharedTaskProgress(t._id);
  }
  console.log('Done');
  process.exit(0);
})();
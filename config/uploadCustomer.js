const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');

// Import your Customer model
const Customer = require('../models/customerModel'); // Adjust the path to your Customer model

// MongoDB Atlas connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/proClient360');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Function to process and upload CSV data
const uploadCustomers = async () => {
  const customers = [];
  const errors = [];

  // Read CSV file
  fs.createReadStream('./custData.csv') // Replace with your CSV file path
    .pipe(csv())
    .on('data', (row) => {
      try {
        // Map CSV row to customerSchema
        const customer = {
          createdBy: row.createdBy && mongoose.isValidObjectId(row.createdBy) ? new mongoose.Types.ObjectId(row.createdBy) : null, // Validate ObjectId
          email: row.email || 'info@daccess.co.in',
          custName: row.custName || 'Daccess',
          billingAddress: {
            add: row['billingAddress.add'] || "Office No. 5, SR. No. 1/1A/1/7/2 & 3, Revati Arcade II, Baner",
            city: row['billingAddress.city'] || "Pune",
            state: row['billingAddress.state']|| "Maharashtra",
            country: row['billingAddress.country'] || "India",
            pincode: parseInt(row['billingAddress.pincode'], 10) || 412207,
          },
          company: mongoose.isValidObjectId('6877816a58bc9d68bc599633') ? new mongoose.Types.ObjectId('6877816a58bc9d68bc599633') : null, // Validate ObjectId
          GSTNo: row.GSTNo || 'N/A',
          customerContactPersonName1: row.customerContactPersonName1 || 'daccessdemo',
          phoneNumber1: row.phoneNumber1 || '9325713320',
          customerContactPersonName2: row.customerContactPersonName2 || 'demo daccess',
          phoneNumber2: row.phoneNumber2 || '18002097799',
          zone: row.zone || "North",
        };

        customers.push(customer);
      } catch (error) {
        errors.push({ row, error: error.message });
      }
    })
    .on('end', async () => {
      console.log(`Parsed ${customers.length} customers from CSV`);

      try {
        // Bulk insert into MongoDB
        const result = await Customer.insertMany(customers, {ordered: false});
        console.log(`${result.length} customers inserted successfully`);
      } catch (error) {
        console.error('Error inserting customers:', error);
        if (error.writeResult) {
          console.log('Write Errors:', error.writeResult.writeErrors);
        }
        if (error.errors) {
          console.log('Validation Errors:', error.errors);
        }
      } finally {
        mongoose.connection.close();
        console.log('MongoDB connection closed');
      }
    });
};

// Execute the script
const run = async () => {
  await connectDB();
  await uploadCustomers();
};

run();
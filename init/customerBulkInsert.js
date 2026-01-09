const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser'); // Install this with `npm install csv-parser`

const Customer = require('./models/Customer'); // Path to your customer schema

const MONGO_URI = 'mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/<database-name>';

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

const bulkInsertCustomers = async () => {
  const customers = [];

  fs.createReadStream('data.csv') // Path to your CSV file
    .pipe(csv())
    .on('data', (row) => {
      customers.push({
        email: row.email,
        custName: row.custName,
        billingAddress: {
          add: row['billingAddress.add'],
          city: row['billingAddress.city'],
          state: row['billingAddress.state'],
          country: row['billingAddress.country'],
          pincode: parseInt(row['billingAddress.pincode'], 10),
        },
        company: row.company,
        GSTNo: row.GSTNo,
        customerContactPersonName1: row.customerContactPersonName1,
        phoneNumber1: row.phoneNumber1,
        customerContactPersonName2: row.customerContactPersonName2,
        phoneNumber2: row.phoneNumber2,
        zone: row.zone,
      });
    })
    .on('end', async () => {
      try {
        const result = await Customer.insertMany(customers);
        console.log(`Inserted ${result.length} customers into the database`);
        mongoose.disconnect();
      } catch (err) {
        console.error('Error inserting customers:', err);
      }
    });
};

bulkInsertCustomers();

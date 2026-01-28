const express = require('express');
const connectDB = require('./config/db');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

// const { Server } = require('socket.io');

const dotenv = require('dotenv');

const { initializeDailyLeadReportScheduler } = require('./mailsService/dailyLeadReport');

const employeeRoutes = require('./routes/employeeRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const companyRoutes = require('./routes/companyRoutes');
const customerRoutes = require('./routes/customerRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskSheetRoutes = require('./routes/taskSheetRoutes');
const taskRoutes = require('./routes/taskRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const designationRoutes = require('./routes/designationRoutes');
const actionRoutes = require('./routes/actionRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const serviceRoutes = require('./routes/serviceRoutes')
const feedbackRoutes = require('./routes/feedbackRoutes');
const serviceActionRoutes = require('./routes/serviceActionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const webhookRoutes = require('./routes/webhooksRoutes');
const leadsRoutes = require('./routes/leadRoutes');

const amcRoutes = require('./routes/amcRoutes');

const inventoryRoutes = require('./routes/inventoryRoutes');

const vendorRoutes = require('./routes/vendorRoutes');

const productRoutes = require('./routes/productRoutes');

const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');

const grnRoutes = require('./routes/grnRoutes');

const qcRoutes = require('./routes/qcRoutes');

const dcRoutes = require('./routes/dcRoutes');

const mrfRoutes = require('./routes/mrfRoutes');

dotenv.config();


const app = express();

const PORT = process.env.PORT || 5443;


const startSever= async () =>{

  await connectDB();
   // Initialize the daily lead report scheduler after database connection
  console.log('Initializing daily lead report scheduler...');
  initializeDailyLeadReportScheduler();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Standard CORS configuration for regular API requests
app.use(cors({
  origin: ["https://pms-front-qvyb.onrender.com", "http://localhost:3000","https://proclient360.com" ],
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition", "X-Total-Count"]
}));

// Special CORS configuration for export endpoints (blob responses)
app.use('/api/customer/export', cors({
  origin: ["https://pms-front-qvyb.onrender.com", "http://localhost:3000","https://proclient360.com" ],
  credentials: true,
  methods: "GET,OPTIONS",
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, 'frontend/build')));

// API routes here
app.get('/api', (req, res) => {
    res.json({ message: 'Server is Up and Running...' });
});


app.use('/api/employee', employeeRoutes);

app.use('/api', authRoutes);

app.use('/api/admin', adminRoutes);

app.use('/api/company', companyRoutes);

app.use('/api/customer', customerRoutes);

app.use('/api/project', projectRoutes);

app.use('/api/tasksheet', taskSheetRoutes);

app.use('/api/task', taskRoutes);

app.use('/api/designation',designationRoutes);

app.use('/api/department',departmentRoutes);

app.use('/api/action', actionRoutes);

app.use('/api/ticket', ticketRoutes);

app.use('/api/service', serviceRoutes);

app.use('/api/serviceAction', serviceActionRoutes);

app.use('/api/feedback', feedbackRoutes);

app.use('/api/notification', notificationRoutes);

app.use('/api/webhook', webhookRoutes);

app.use('/api/leads', leadsRoutes);

app.use('/api/tradeIndia', require('./routes/tradeIndiaRoutes'));

app.use('/api/amc', amcRoutes);

app.use('/api/inventory', inventoryRoutes);

app.use('/api/vendor', vendorRoutes);

app.use('/api/product', productRoutes);

app.use('/api/purchaseOrder', purchaseOrderRoutes);

app.use('/api/grn', grnRoutes);

app.use('/api/qc', qcRoutes);

app.use('/api/dc', dcRoutes);

app.use('/api/mrf', mrfRoutes);

// const io = new Server(server, {
//   cors: {
//     origin: '*',
//   },
// });
// app.set('io', io);

// io.use(authenticateSocket);

// io.on('connection', (socket) => {
//   console.log('A user connected');

//   // Join the user to a room with their userId
//   const userId = socket.user.userId;
//   socket.join(userId);

//   // Handle disconnection
//   socket.on('disconnect', () => {
//     console.log('User disconnected');
//   });
// });

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error:'+err.message });
  });

app.use('*', (req, res, next) => {
  res.status(404).json({ error: 'Page Not Found' });
});

// The "catchall" handler: for any request that doesn't
// match one above, send back the React app.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html')); 
});

app.use((err, req, res, next) => {
  console.error(err); // Log the error for debugging
  res.status(500).json({
    message: 'Something went wrong, please try again later.',
  });
});

startSever();
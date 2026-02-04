const express = require('express');
const connectDB = require('./config/db');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

// const { Server } = require('socket.io');

const dotenv = require('dotenv');
dotenv.config();

const { initializeDailyLeadReportScheduler } = require('./mailsService/dailyLeadReport');

const { autoMarkStaleLeads } = require('./scripts/autoMarkStaleLeads');

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
const serviceRoutes = require('./routes/serviceRoutes');
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


const app = express();

const PORT = process.env.PORT || 5443;

const startServer = async () => {
  try {
    console.log('=================================================');
    console.log('Starting Server...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', PORT);
    console.log('=================================================');

    await connectDB();
    
    // Initialize the daily lead report scheduler after database connection
    console.log('Initializing daily lead report scheduler...');
    initializeDailyLeadReportScheduler();
    
    // Schedule auto-mark stale leads job - runs every day at 2 AM
    console.log('Initializing auto-mark stale leads scheduler...');
    cron.schedule('0 2 * * *', async () => {
      console.log('Running scheduled auto-mark stale leads job...');
      try {
        const result = await autoMarkStaleLeads();
        console.log('Scheduled auto-mark result:', result);
      } catch (error) {
        console.error('Error in scheduled auto-mark job:', error);
      }
    });

    // Also run once on startup
    console.log('Running initial auto-mark stale leads check...');
    try {
      const result = await autoMarkStaleLeads();
      console.log('Initial auto-mark result:', result);
    } catch (error) {
      console.error('Error in initial auto-mark:', error);
    }

    app.listen(PORT, () => {
      console.log('=================================================');
      console.log(`Server running on port ${PORT}`);
      console.log('=================================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Standard CORS configuration for regular API requests
app.use(cors({
  origin: ["https://pms-front-qvyb.onrender.com", "http://localhost:3000", "https://proclient360.com"],
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition", "X-Total-Count"]
}));

// Special CORS configuration for export endpoints (blob responses)
app.use('/api/customer/export', cors({
  origin: ["https://pms-front-qvyb.onrender.com", "http://localhost:3000", "https://proclient360.com"],
  credentials: true,
  methods: "GET,OPTIONS",
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, 'frontend/build')));

// API routes here
console.log('=================================================');
console.log('📋 Registering API Routes...');
console.log('=================================================');

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

console.log('Registering /api/leads routes...');
app.use('/api/leads', leadsRoutes);
console.log('Lead routes registered at /api/leads');

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

console.log('=================================================');
console.log('✅ All API routes registered successfully');
console.log('=================================================');

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error: ' + err.message });
});

// 404 handler for API routes
app.use('/api/*', (req, res, next) => {
  console.error('API Route Not Found:', req.originalUrl);
  res.status(404).json({ 
    error: 'API Route Not Found',
    path: req.originalUrl,
    message: `The endpoint ${req.originalUrl} does not exist on this server.`
  });
});

// The "catchall" handler: for any request that doesn't
// match one above, send back the React app.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html')); 
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    message: 'Something went wrong, please try again later.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

startServer();
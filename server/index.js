//import dotenv from 'dotenv';
//dotenv.config({ path: '../../.fs-env' });

import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production-fleetscore";

// Define Middleware 
const authenticateToken = (req, res, next) => {
  const token = req.cookies.sessionId; 

  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication required." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: "Invalid or expired session." });
    }
    
    req.user = user; 
    next();
  });
};

import express from 'express';
import cors from 'cors';
import { pool } from './src/db.js';
import aboutRoutes from './src/routes/about.js';
import loginRoutes from './src/routes/login.js';
import adminCatalogsRoutes from './src/routes/admin-catalogs.js';
import adminUsersRoutes from './src/routes/admin-users.js';
import adminReportsRoutes from './src/routes/admin-reports.js';
import adminEventsRoutes from './src/routes/admin-events.js';
import userRoute from './src/routes/users.js';
import sponsorRoute from './src/routes/sponsors.js';
import storeRoutes from './src/routes/store.js';
import driverCatalogsRoutes from './src/routes/driver-catalogs.js';
import sponsorCatalogsRoutes from './src/routes/sponsor-catalogs.js';
import sponsorReportsRoutes from './src/routes/sponsor-reports.js';
import adminRoute from './src/routes/admins.js';
import driverRoute from './src/routes/drivers.js';
import accountsRoute from './src/routes/accounts.js';
import reviewRoutes from './src/routes/reviews.js';


const app = express();

app.set('pool', pool);

//app.use(cors());
app.use(cors({
  origin: '*', // Allows requests from any origin (Postman, Frontend, etc.)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
}));
app.use(express.json());

// TODO: Make sure that all client files are using a consistent API route scheme and that both the client and server schemes match.
app.use('/api/about', aboutRoutes);
app.use('/api/auth', loginRoutes);
app.use('/api/user', userRoute);
app.use('/api/accounts', accountsRoute);
app.use('/api/sponsors', sponsorRoute);
app.use('/api/drivers', driverRoute);
app.use('/api/admin/store', storeRoutes);
app.use('/api/admin/catalogs', adminCatalogsRoutes);
app.use('/api/admin', adminUsersRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/audit-logs', adminEventsRoutes);
app.use('/api/driver/:userId/catalogs', driverCatalogsRoutes);
app.use('/api/sponsor/:userId/catalogs', sponsorCatalogsRoutes);
app.use('/api/sponsor/:userId/reports', sponsorReportsRoutes);
app.use('/api/reviews', authenticateToken, reviewRoutes);
//app.use('/api/admin', adminRoute);

app.get("/api/test-sudo", (req, res) => {
  console.log("Sudo route hit!"); // Add this to see it in your terminal
  
  const token = jwt.sign({
    UserID: 123457247, 
    Username: 'driver_to_test',
    UserType: 'driver',
    originalUser: {
      UserID: 1,
      Username: 'kyledemo',
      UserType: 'admin'
    }
  }, process.env.JWT_SECRET || "dev-secret-change-in-production-fleetscore");

  res.cookie('sessionId', token, { httpOnly: true, path: '/' });
  res.redirect('http://localhost:5173/'); 
});

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
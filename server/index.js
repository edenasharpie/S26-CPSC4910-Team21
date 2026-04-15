//import dotenv from 'dotenv';
//dotenv.config({ path: '../../.fs-env' });

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { pool, verifyDatabaseConnection, initializeSystemAuditUserCache } from './src/db.js';
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
import driverOrdersRoutes from './src/routes/driver-orders.js';
import imagesRoutes from './src/routes/images.js';
import { startDailyReportScheduler } from './src/services/daily-report-scheduler.js';
import { attachSessionContext } from './src/middleware/session-context.js';
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
app.use(attachSessionContext);
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// TODO: Make sure that all client files are using a consistent API route scheme and that both the client and server schemes match.
app.use('/api/about', aboutRoutes);
app.use('/api/auth', loginRoutes);
app.use('/api/user', userRoute);
app.use('/api/accounts', accountsRoute);
app.use('/api/sponsors', sponsorRoute);
app.use('/api/drivers', driverRoute);
app.use('/api/admin/store', storeRoutes);
app.use('/api/admin', adminRoute);
app.use('/api/admin/catalogs', adminCatalogsRoutes);
app.use('/api/admin', adminUsersRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/audit-logs', adminEventsRoutes);
app.use('/api/images', imagesRoutes);
app.use('/api/driver/:userId/catalogs', driverCatalogsRoutes);
app.use('/api/driver/:userId/orders', driverOrdersRoutes);
app.use('/api/sponsor/:userId/catalogs', sponsorCatalogsRoutes);
app.use('/api/sponsor/:userId/reports', sponsorReportsRoutes);
app.use('/api/sponsor/:userId/reviews', reviewRoutes);


app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const DB_STARTUP_MAX_ATTEMPTS = Number(
  process.env.DB_STARTUP_MAX_ATTEMPTS || (process.env.NODE_ENV === 'test' ? 20 : 8)
);
const DB_STARTUP_RETRY_MS = Number(process.env.DB_STARTUP_RETRY_MS || 3000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initializeDatabaseWithRetry() {
  let lastError;

  for (let attempt = 1; attempt <= DB_STARTUP_MAX_ATTEMPTS; attempt += 1) {
    try {
      await verifyDatabaseConnection();
      await initializeSystemAuditUserCache();

      if (attempt > 1) {
        console.log(`[startup] Database became available on attempt ${attempt}.`);
      }

      return;
    } catch (error) {
      lastError = error;
      console.error(
        `[startup] Database init attempt ${attempt}/${DB_STARTUP_MAX_ATTEMPTS} failed: ${error?.message || error}`
      );

      if (attempt < DB_STARTUP_MAX_ATTEMPTS) {
        await sleep(DB_STARTUP_RETRY_MS);
      }
    }
  }

  throw lastError;
}

const startServer = async () => {
  await initializeDatabaseWithRetry();

  app.listen(PORT, HOST, () => {
    console.log(`Backend running on ${HOST}:${PORT}`);
    startDailyReportScheduler();
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend server:', error);
  process.exit(1);
});
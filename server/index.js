//import dotenv from 'dotenv';
//dotenv.config({ path: '../../.fs-env' });

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { PROFILE_IMAGE_UPLOAD_DIR } from './src/utils/profile-image-upload.js';
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
import driverNotificationsRoutes from './src/routes/driver-notifications.js';
import sponsorNotificationsRoutes from './src/routes/sponsor-notifications.js';
import adminNotificationsRoutes from './src/routes/admin-notifications.js';
import imagesRoutes from './src/routes/images.js';
import { startDailyReportScheduler } from './src/services/daily-report-scheduler.js';
import { attachSessionContext } from './src/middleware/session-context.js';
import reviewRoutes from './src/routes/reviews.js';


const app = express();

const NOTIFICATION_ROUTE_PATTERN = /^\/api\/(?:driver|sponsors|admin)\/\d+\/notifications(?:\/.*)?$/;
const DEFAULT_NOTIFICATION_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parseConfiguredOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const notificationCorsOriginSet = new Set([
  ...DEFAULT_NOTIFICATION_CORS_ORIGINS,
  ...parseConfiguredOrigins(process.env.NOTIFICATION_CORS_ORIGINS),
]);

const notificationCors = cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }

    callback(null, notificationCorsOriginSet.has(origin));
  },
  methods: ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
});

const publicCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.set('pool', pool);

app.use((req, res, next) => {
  if (NOTIFICATION_ROUTE_PATTERN.test(req.path)) {
    return notificationCors(req, res, next);
  }

  return publicCors(req, res, next);
});
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
app.use('/api/admin/:userId/notifications', adminNotificationsRoutes);
app.use('/api/admin/store', storeRoutes);
app.use('/api/admin', adminRoute);
app.use('/api/admin/catalogs', adminCatalogsRoutes);
app.use('/api/admin', adminUsersRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/audit-logs', adminEventsRoutes);
app.use('/api/images/u', express.static(PROFILE_IMAGE_UPLOAD_DIR));
app.use('/api/images', imagesRoutes);
app.use('/api/driver/:userId/catalogs', driverCatalogsRoutes);
app.use('/api/driver/:userId/orders', driverOrdersRoutes);
app.use('/api/driver/:userId/notifications', driverNotificationsRoutes);
app.use('/api/sponsor/:userId/catalogs', sponsorCatalogsRoutes);
app.use('/api/sponsor/:userId/reports', sponsorReportsRoutes);
app.use('/api/sponsor/:userId/reviews', reviewRoutes);
app.use('/api/sponsors/:userId/notifications', sponsorNotificationsRoutes);


app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  await verifyDatabaseConnection();
  await initializeSystemAuditUserCache();

  app.listen(PORT, HOST, () => {
    console.log(`Backend running on ${HOST}:${PORT}`);
    startDailyReportScheduler();
  });
};

startServer().catch((error) => {
  console.error('Failed to start backend server:', error);
  process.exit(1);
});
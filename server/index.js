import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './src/db.js';
import aboutRoutes from './src/routes/about.js';
import catalogRoutes from './src/routes/catalogs.js';
//import userRoute from './src/routes/users.js';
import sponsorRoute from './src/routes/sponsors.js';
import storeRoutes from './src/routes/store.js';

dotenv.config({ path: '../../.fs-env' });

const app = express();

app.set('pool', pool);

app.use(cors());
app.use(express.json());

app.use('/api/about', aboutRoutes);
app.use('/api/admin/catalogs', catalogRoutes);
//app.use('/api/user', userRoute); 
app.use('/api/sponsors', sponsorRoute);
app.use('/api/admin/store', storeRoutes); 
//app.use('/api/admin', adminRoute);     
//app.use('/api/drivers', driverRoute);

//Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
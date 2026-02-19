const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: '../../.fs-env' });

// API endpoints
const aboutRoutes = require('./src/routes/about');
const catalogRoutes = require('./src/routes/catalogs');
const userRoute = require('./src/routes/user');
const sponsorRoute = require('./src/routes/sponsors');
const adminRoute = require('./src/routes/admin');
const driverRoute = require('./src/routes/drivers');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/about', aboutRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/user', userRoute);
app.use('/api/sponsors', sponsorRoute); 
app.use('/api/admin', adminRoute);     
app.use('/api/drivers', driverRoute);

app.listen(process.env.PORT || 5000, () => {
  console.log(`Backend running on port ${process.env.PORT || 5000}`);
});
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: '../../.fs-env' });

// API endpoints
const aboutRoutes = require('./src/routes/about');
const catalogRoutes = require('./src/routes/catalogs');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/about', aboutRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/user', userRoute); 
app.use('/api/sponsors', sponsorRoute); 
//app.use('/api/admins', adminRoute);     
app.use('/api/drivers', driverRoute);

app.listen(process.env.PORT || 5000, () => {
  console.log(`Backend running on port ${process.env.PORT || 5000}`);
});
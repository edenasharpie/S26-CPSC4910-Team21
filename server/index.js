const express = require("express");
const cors = require("cors");
const { pool } = require('./src/db'); 

require("dotenv").config({ path: '../../.fs-env' });

const app = express();

app.set('pool', pool);

app.use(cors());
app.use(express.json());

// API endpoints
const aboutRoutes = require('./src/routes/about');
const catalogRoutes = require('./src/routes/catalogs');
const userRoute = require('./src/routes/users');
const sponsorRoute = require('./src/routes/sponsors');
//const adminRoute = require('./src/routes/admisn');
//const driverRoute = require('./src/routes/drivers');

app.use('/api/about', aboutRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/user', userRoute); 
app.use('/api/sponsors', sponsorRoute); 
//app.use('/api/admins', adminRoute);     
//app.use('/api/drivers', driverRoute);

//Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
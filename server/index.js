const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: '../../.fs-env' });

// API endpoints
const catalogRoutes = require('./src/routes/catalogs');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/catalogs', catalogRoutes);

app.listen(process.env.PORT || 5000, () => {
  console.log(`Backend running on port ${process.env.PORT || 5000}`);
});
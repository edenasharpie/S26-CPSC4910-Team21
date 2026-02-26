import dotenv from 'dotenv';
dotenv.config({ path: '../../.fs-env' });

import express from 'express';
import cors from 'cors';
//import dotenv from 'dotenv';
import { pool } from './src/db.js';
import aboutRoutes from './src/routes/about.js';
import catalogRoutes from './src/routes/catalogs.js';
import userRoute from './src/routes/users.js';
import sponsorRoute from './src/routes/sponsors.js';
import { authenticateUser } from './src/utils/auth.js';


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

app.use('/api/about', aboutRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/user', userRoute); 
app.use('/api/sponsors', sponsorRoute); 
//app.use('/api/admin', adminRoute);     
//app.use('/api/drivers', driverRoute);

app.post('/api/login', async (req, res) => {
  console.log("1. Postman reached the server"); // If you see this, CORS is fine
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    console.log("2. Calling authenticateUser for:", username);
    const result = await authenticateUser(pool, username, password, String(ip));
    
    console.log("3. Result from auth function:", result); // This tells us the status code
    res.status(result.status).json(result);
  } catch (error) {
    console.error("4. Login Route Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//Start the server
//const PORT = process.env.PORT || 5000;
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import attendanceRoutes from './routes/attendance.js';
import requestRoutes from './routes/requests.js';
import notesRoutes from './routes/notes.js';
import usersRoutes from './routes/users.js';
import notificationRoutes from './routes/notifications.js';
import statsRoutes from './routes/stats.js';
import attendanceModuleRoutes from './routes/attendanceModule.js';
import { seedData } from './data/seed.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sduml';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Seed data on startup
seedData();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/faculty', attendanceModuleRoutes); // Mounting for faculty endpoints
app.use('/api/student', attendanceModuleRoutes); // Mounting for student endpoints
app.use('/api/admin', attendanceModuleRoutes); // Mounting for attendance overview
app.use('/api/requests', requestRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

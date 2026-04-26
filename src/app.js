require('express-async-errors');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const managementRoutes = require('./routes/management');
const elderlyRoutes = require('./routes/elderly');
const guardianRoutes = require('./routes/guardian');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Key', 'X-Device-Id', 'X-Api-Key'],
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(generalLimiter);

// Trust proxy (for correct IP behind load balancer)
app.set('trust proxy', 1);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SARS Elderly Health Monitoring System',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

// API routes
const API_BASE = `/api/${process.env.API_VERSION || 'v1'}`;
app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/admin`, adminRoutes);
app.use(`${API_BASE}/management`, managementRoutes);
app.use(`${API_BASE}/elderly`, elderlyRoutes);
app.use(`${API_BASE}/guardian`, guardianRoutes);

// API documentation endpoint
app.get(`${API_BASE}`, (req, res) => {
  res.json({
    service: 'SARS Elderly Health Monitoring API',
    version: process.env.API_VERSION || 'v1',
    endpoints: {
      auth: `${API_BASE}/auth`,
      admin: `${API_BASE}/admin`,
      management: `${API_BASE}/management`,
      elderly: `${API_BASE}/elderly`,
      guardian: `${API_BASE}/guardian`,
    },
    roles: ['admin', 'management', 'elderly', 'guardian', 'device'],
    realtime: 'Socket.IO on same port — connect with JWT token',
    docs: 'See README.md for full API documentation',
  });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initSocketIO } = require('./services/socketService');
const { setSocketIO: setAlertSocket } = require('./services/alertService');
const { setSocketIO: setReportSocket } = require('./services/reportService');
const { startCronJobs, stopCronJobs } = require('./services/cronService');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT) || 3000;

const httpServer = http.createServer(app);

const bootstrap = async () => {
  try {
    // Connect to PostgreSQL
    await connectDatabase();

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connection established');

    // Initialize Socket.IO
    const io = initSocketIO(httpServer);

    // Wire Socket.IO into services
    setAlertSocket(io);
    setReportSocket(io);

    // Start cron jobs (30-min reports + device offline check)
    startCronJobs();

    // Start HTTP + WebSocket server
    httpServer.listen(PORT, () => {
      logger.info('='.repeat(60));
      logger.info('  SARS — Smart Automated Response System');
      logger.info('  Elderly Health Monitoring Platform v1.0.0');
      logger.info('='.repeat(60));
      logger.info(`  HTTP  : http://localhost:${PORT}`);
      logger.info(`  API   : http://localhost:${PORT}/api/v1`);
      logger.info(`  WS    : ws://localhost:${PORT}`);
      logger.info(`  Mode  : ${process.env.NODE_ENV || 'development'}`);
      logger.info('='.repeat(60));
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  stopCronJobs();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

bootstrap();

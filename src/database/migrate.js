require('dotenv').config();
const { sequelize } = require('../config/database');
require('../models/index');
const logger = require('../utils/logger');

(async () => {
  try {
    await sequelize.authenticate();
    logger.info('Connected to database');
    await sequelize.sync({ alter: true });
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  }
})();

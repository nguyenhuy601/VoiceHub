require('dotenv').config();
const app = require('./app');
const { connectRedis, disconnectRedis, logger } = require('@enterprise/shared');
const {
  runDashboardProjectionConsumerLoop,
  stopDashboardProjectionConsumer,
} = require('./workers/dashboardProjectionConsumer');

const PORT = process.env.PORT || 3025;

try {
  connectRedis();
} catch (e) {
  logger.warn('report-service redis skip', e.message);
}

runDashboardProjectionConsumerLoop();

const server = app.listen(PORT, () => {
  logger.info(`report-service đang chạy trên cổng ${PORT}`);
});

process.on('SIGTERM', async () => {
  try {
    await stopDashboardProjectionConsumer();
  } catch (e) {
    logger.error('stopDashboardProjectionConsumer', e.message);
  }
  try {
    await disconnectRedis();
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
});

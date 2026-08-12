require('dotenv').config();
const { assertTestUnlockSafeForBoot } = require('./utils/rbacTestUnlock');
assertTestUnlockSafeForBoot();
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('@enterprise/shared');

const PORT = process.env.PORT || 3015;

// Kết nối MongoDB
const {
  runRbacProjectionConsumerLoop,
  stopRbacProjectionConsumer,
} = require('./workers/rbacProjectionConsumer');

connectDB()
  .then(async () => {
    // Kết nối Redis
    connectRedis();

    try {
      const rbacV2Service = require('./services/rbacV2.service');
      await rbacV2Service.seedSystemTemplates();
      logger.info('RBAC V2 system templates seeded');
    } catch (seedErr) {
      logger.warn('RBAC V2 template seed skipped/failed', seedErr.message);
    }

    runRbacProjectionConsumerLoop();

    // Khởi động server
    app.listen(PORT, () => {
      logger.info(`Role & Permission Service đang chạy trên cổng ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  try {
    await stopRbacProjectionConsumer();
  } catch (e) {
    logger.error('stopRbacProjectionConsumer', e.message);
  }
  await disconnectDB();
  process.exit(0);
});


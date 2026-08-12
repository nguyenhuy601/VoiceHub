require('dotenv').config();
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('@enterprise/shared');

const PORT = process.env.PORT || 3013;
let memberImportConsumer = null;

// Kết nối MongoDB
connectDB()
  .then(() => {
    connectRedis();

    app.listen(PORT, () => {
      logger.info(`Organization Service đang chạy trên cổng ${PORT}`);
    });

    // Consumer async — không block listen; inline fallback nếu RabbitMQ down
    setImmediate(async () => {
      try {
        const { startMemberImportConsumer } = require('./messaging/memberImport.consumer');
        memberImportConsumer = await startMemberImportConsumer();
      } catch (e) {
        logger.warn('[memberImport] consumer start failed (inline fallback still OK)', e?.message || e);
      }
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
    if (memberImportConsumer?.stop) await memberImportConsumer.stop();
  } catch {
    /* ignore */
  }
  await disconnectDB();
  process.exit(0);
});

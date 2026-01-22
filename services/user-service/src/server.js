require('dotenv').config();
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('/shared');

const PORT = process.env.PORT || 3004;

// Kết nối MongoDB
connectDB()
  .then(() => {
    // Kết nối Redis
    connectRedis();

    // Khởi động server
    app.listen(PORT, () => {
      logger.info(`User Service đang chạy trên cổng ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await disconnectDB();
  process.exit(0);
});


require('dotenv').config();
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, disconnectRedis, logger } = require('@enterprise/shared');
const { runTaskFromFileWorkerLoop, stopTaskFromFileWorker } = require('./workers/taskFromFileWorker');
const {
  startSprintAutoCompleteRemindersJob,
  stopSprintAutoCompleteRemindersJob,
} = require('./jobs/sprintAutoCompleteReminders.job');
const {
  startTaskDueRemindersJob,
  stopTaskDueRemindersJob,
} = require('./jobs/taskDueReminders.job');

const PORT = process.env.PORT || 3009;

// Kết nối MongoDB
connectDB()
  .then(async () => {
    // Kết nối Redis
    connectRedis();

    try {
      const Task = require('./models/Task');
      await Task.syncIndexes();
      logger.info('[Task] syncIndexes done');
    } catch (err) {
      logger.warn('[Task] syncIndexes failed: %s', err?.message || err);
    }

    runTaskFromFileWorkerLoop();
    startSprintAutoCompleteRemindersJob();
    startTaskDueRemindersJob();

    // Khởi động server
    const server = app.listen(PORT, () => {
      logger.info(`Task Service đang chạy trên cổng ${PORT}`);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        try {
          stopSprintAutoCompleteRemindersJob();
        } catch (e) {
          logger.error('stopSprintAutoCompleteRemindersJob', e.message);
        }
        try {
          stopTaskDueRemindersJob();
        } catch (e) {
          logger.error('stopTaskDueRemindersJob', e.message);
        }
        try {
          await stopTaskFromFileWorker();
        } catch (e) {
          logger.error('stopTaskFromFileWorker', e.message);
        }
        try {
          await disconnectRedis();
          await disconnectDB();
        } catch (e) {
          /* ignore */
        }
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });


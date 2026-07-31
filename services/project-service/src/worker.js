require('dotenv').config();
const { connectDB, connectRedis, disconnectDB, disconnectRedis, logger } = require('@enterprise/shared');
const {
  runTaskFromFileWorkerLoop,
  stopTaskFromFileWorker,
} = require('./workers/taskFromFileWorker');

async function start() {
  await connectDB();
  connectRedis();
  runTaskFromFileWorkerLoop();
  logger.info('[task-worker] started');
}

async function shutdown() {
  logger.info('[task-worker] shutting down');
  try {
    await stopTaskFromFileWorker();
  } catch (e) {
    logger.error('[task-worker] stop worker failed:', e.message);
  }
  try {
    await disconnectRedis();
    await disconnectDB();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  logger.error('[task-worker] failed to start:', err);
  process.exit(1);
});

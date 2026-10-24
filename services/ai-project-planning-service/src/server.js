const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = require('./app');
const {
  connectDB,
  disconnectDB,
  connectRedis,
  disconnectRedis,
} = require('@enterprise/shared');
const { recoverRunsOnStartup, failInterruptedRuns } = require('./controllers/internalPlanning.controller');
const { isTransientSocketError } = require('./orchestration/transientSocketError');

const PORT = process.env.PORT || 3025;
const mongoUri =
  (process.env.AI_PROJECT_PLANNING_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

connectDB(mongoUri)
  .then(() => {
    connectRedis();
    recoverRunsOnStartup()
      .catch((error) => {
        console.error('[planning] recover runs', error?.message || error);
      });
    const server = app.listen(PORT, () => {
      console.log(`AI Project Planning Service listening on ${PORT}`);
    });

    let fatalStopStarted = false;
    function stopAfterFatal(error) {
      if (isTransientSocketError(error)) {
        console.error(
          '[planning] transient socket (ignored)',
          error?.code || '',
          error?.message || error
        );
        return;
      }
      if (fatalStopStarted) return;
      fatalStopStarted = true;
      console.error('[planning] fatal', error?.message || error);
      failInterruptedRuns(`Lượt dừng vì lỗi: ${error?.message || error}`)
        .catch((stopError) => {
          console.error('[planning] stop after fatal', stopError?.message || stopError);
        })
        .finally(() => process.exit(1));
    }
    process.on('uncaughtException', stopAfterFatal);
    process.on('unhandledRejection', stopAfterFatal);

    process.on('SIGTERM', async () => {
      try {
        await failInterruptedRuns(
          'Service planning đã tắt trong lúc lượt vẫn đang chạy.'
        );
      } catch (stopError) {
        console.error('[planning] stop on SIGTERM', stopError?.message || stopError);
      }
      server.close(async () => {
        try {
          await disconnectRedis();
        } catch {
          /* ignore */
        }
        try {
          await disconnectDB();
        } catch {
          /* ignore */
        }
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    console.error('Failed to start ai-project-planning-service:', error);
    process.exit(1);
  });

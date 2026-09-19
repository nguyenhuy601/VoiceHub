const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = require('./app');
const { connectDB, disconnectDB } = require('@enterprise/shared');
const { recoverRunsOnStartup } = require('./controllers/internalPlanning.controller');

const PORT = process.env.PORT || 3025;
const mongoUri =
  (process.env.AI_PROJECT_PLANNING_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

connectDB(mongoUri)
  .then(() => {
    recoverRunsOnStartup()
      .catch((error) => {
        console.error('[planning] recover runs', error?.message || error);
      });
    const server = app.listen(PORT, () => {
      console.log(`AI Project Planning Service listening on ${PORT}`);
    });

    process.on('SIGTERM', async () => {
      server.close(async () => {
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

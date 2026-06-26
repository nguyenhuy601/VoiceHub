const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = require('./app');
const { connectDB, disconnectDB } = require('@enterprise/shared');
const { closeRabbit } = require('./messaging/rabbit');

const PORT = process.env.PORT || 3021;
const mongoUri = (process.env.SUMMARY_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

connectDB(mongoUri)
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Summary Service đang chạy trên cổng ${PORT}`);
    });

    process.on('SIGTERM', async () => {
      server.close(async () => {
        try {
          await closeRabbit();
        } catch (e) {
          /* ignore */
        }
        try {
          await disconnectDB();
        } catch (e) {
          /* ignore */
        }
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    console.error('Failed to start summary-service:', error);
    process.exit(1);
  });

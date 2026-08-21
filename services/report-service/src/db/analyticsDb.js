const {
  resolveAnalyticsMongoUri,
} = require('@enterprise/shared/config/reportServiceFlags');
const { logger } = require('@enterprise/shared');
const mongoose = require('mongoose');

let connected = false;
let connecting = null;

async function connectAnalyticsDb() {
  if (connected && mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;
  const uri =
    resolveAnalyticsMongoUri() ||
    String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    logger.warn('[analytics-db] no ANALYTICS_MONGODB_URI / MONGODB_URI — warehouse disabled');
    return null;
  }
  connecting = mongoose
    .connect(uri)
    .then(() => {
      connected = true;
      logger.info('[analytics-db] connected');
      return mongoose;
    })
    .catch((err) => {
      connected = false;
      connecting = null;
      logger.warn('[analytics-db] connect failed', err.message);
      return null;
    });
  return connecting;
}

function isAnalyticsDbReady() {
  return connected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectAnalyticsDb,
  isAnalyticsDbReady,
};

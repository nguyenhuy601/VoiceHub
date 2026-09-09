/**
 * Standalone analytics ETL entry — sets ENABLE_ANALYTICS_ETL_CONSUMER and runs report-service consumer.
 * Prefer embedding consumer in report-service; this worker is for split deploy.
 */
require('dotenv').config();
process.env.ENABLE_ANALYTICS_ETL_CONSUMER = process.env.ENABLE_ANALYTICS_ETL_CONSUMER || 'true';

const path = require('path');
const { logger } = require('@enterprise/shared');

// Reuse report-service worker implementation
const consumerPath = path.join(
  __dirname,
  '..',
  '..',
  'report-service',
  'src',
  'workers',
  'analyticsEtlConsumer.js'
);

let runAnalyticsEtlConsumerLoop;
let stopAnalyticsEtlConsumer;
try {
  ({ runAnalyticsEtlConsumerLoop, stopAnalyticsEtlConsumer } = require(consumerPath));
} catch (err) {
  logger.error('[report-etl-worker] cannot load analyticsEtlConsumer', err.message);
  process.exit(1);
}

runAnalyticsEtlConsumerLoop();
logger.info('[report-etl-worker] started');

process.on('SIGTERM', async () => {
  try {
    await stopAnalyticsEtlConsumer();
  } catch {
    /* ignore */
  }
  process.exit(0);
});

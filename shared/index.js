/**
 * @enterprise/shared — platform utilities (mongo, redis, auth, crypto, logger).
 * Domain HTTP clients thuộc từng service (src/clients/*).
 */

const mongo = require('./config/mongo');
const redis = require('./config/redis');
const auth = require('./middleware/auth');
const logger = require('./utils/logger');

module.exports = {
  mongo,
  redis,
  auth,
  logger,
  connectDB: mongo.connectDB,
  disconnectDB: mongo.disconnectDB,
  connectRedis: redis.connectRedis,
  getRedisClient: redis.getRedisClient,
  disconnectRedis: redis.disconnectRedis,
  authenticate: auth.authenticate,
  socketAuth: auth.socketAuth,
  optionalAuth: auth.optionalAuth,
  ...require('./utils/fieldCrypto'),
  ...require('./utils/cryptoMetrics'),
  ...require('./utils/migration'),
  resolveFrontendUrl: require('./utils/resolveFrontendUrl').resolveFrontendUrl,
};

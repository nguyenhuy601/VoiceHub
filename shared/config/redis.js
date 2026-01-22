const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Kết nối Redis
 * @param {Object} options - Redis connection options
 * @returns {Redis}
 */
const connectRedis = (options = {}) => {
  if (!redisClient) {
    const defaultOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      ...options,
    };

    redisClient = new Redis(defaultOptions);

    redisClient.on('connect', () => {
      logger.info('Redis Connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis Ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Error:', err);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', (time) => {
      logger.info(`Redis reconnecting in ${time}ms`);
    });
  }

  return redisClient;
};

/**
 * Lấy Redis client
 * @returns {Redis}
 */
const getRedisClient = () => {
  if (!redisClient) {
    return connectRedis();
  }
  return redisClient;
};

/**
 * Đóng kết nối Redis
 */
const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  disconnectRedis,
};




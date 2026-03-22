const SENSITIVE_KEYS = new Set([
  'password',
  'authorization',
  'token',
  'accessToken',
  'refreshToken',
  'inviteToken',
  'phone',
  'content',
]);

function sanitizeForLog(value, depth = 0) {
  if (depth > 6) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 64 && /^[A-Za-z0-9._-]+$/.test(value)) return '[redacted-string]';
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeForLog(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = sanitizeForLog(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * Logger utility với các mức log khác nhau
 */
class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  /**
   * Kiểm tra có nên log không
   * @param {string} level - Mức log
   * @returns {boolean}
   */
  shouldLog(level) {
    const currentLevel = this.logLevels[this.logLevel] || 2;
    const messageLevel = this.logLevels[level] || 2;
    return messageLevel <= currentLevel;
  }

  /**
   * Format log message
   * @param {string} level - Mức log
   * @param {string} message - Message
   * @param {any} data - Dữ liệu bổ sung
   * @returns {string}
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      const safe = typeof data === 'object' ? sanitizeForLog(data) : data;
      return `${prefix} ${message} ${JSON.stringify(safe)}`;
    }
    
    return `${prefix} ${message}`;
  }

  /**
   * Log error
   * @param {string} message - Message
   * @param {any} error - Error object hoặc data
   */
  error(message, error = null) {
    if (this.shouldLog('error')) {
      const errorData = error instanceof Error 
        ? { message: error.message, stack: error.stack }
        : error;
      
      console.error(this.formatMessage('error', message, errorData));
    }
  }

  /**
   * Log warning
   * @param {string} message - Message
   * @param {any} data - Dữ liệu bổ sung
   */
  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  /**
   * Log info
   * @param {string} message - Message
   * @param {any} data - Dữ liệu bổ sung
   */
  info(message, data = null) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  /**
   * Log debug
   * @param {string} message - Message
   * @param {any} data - Dữ liệu bổ sung
   */
  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, data));
    }
  }
}

// Export singleton instance
const logger = new Logger();

module.exports = logger;




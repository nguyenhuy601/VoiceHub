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
      return `${prefix} ${message} ${JSON.stringify(data)}`;
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




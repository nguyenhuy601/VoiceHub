const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Middleware xác thực JWT cho HTTP requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const authenticate = (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Gắn user info vào request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        ...decoded,
      };

      logger.debug(`User authenticated: ${req.user.id}`);
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Token expired');
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }

      if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid token');
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message,
    });
  }
};

/**
 * Middleware xác thực JWT cho Socket.IO
 * @param {Object} socket - Socket.IO socket object
 * @param {Function} next - Next middleware function
 */
const socketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    
    logger.debug(`Socket authenticated: ${socket.user.id}`);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Socket token expired');
      return next(new Error('Authentication error: Token expired'));
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid socket token');
      return next(new Error('Authentication error: Invalid token'));
    }

    logger.error('Socket authentication error:', error);
    next(new Error('Authentication error: Invalid token'));
  }
};

/**
 * Optional authentication - không bắt buộc token
 * Nếu có token thì verify, không có thì bỏ qua
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
          id: decoded.id,
          email: decoded.email,
          ...decoded,
        };
      } catch (error) {
        // Ignore error, continue without user
        logger.debug('Optional auth failed, continuing without user');
      }
    }

    next();
  } catch (error) {
    // Ignore error, continue without user
    next();
  }
};

module.exports = {
  authenticate,
  socketAuth,
  optionalAuth,
};




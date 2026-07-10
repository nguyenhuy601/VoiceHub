const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { isTrustedGatewayForward } = require('./gatewayTrust');
const { isAccessTokenVersionValid } = require('../utils/tokenVersionAuth');
const { sendApiError, GENERIC_5XX_MESSAGE } = require('./httpErrorResponse');

const getJwtSecret = () => String(process.env.JWT_SECRET || '').trim();

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;

  let token = String(rawToken).trim();
  if (!token) return null;

  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }

  // Handle accidentally stringified localStorage values like "\"ey...\""
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  if (!token || token === 'null' || token === 'undefined') {
    return null;
  }

  return token;
};

/**
 * Middleware xác thực JWT cho HTTP requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const getHeader = (headers, key) =>
  headers?.[key] ?? headers?.[key.toLowerCase()];

const authenticate = (req, res, next) => {
  Promise.resolve(authenticateAsync(req, res, next)).catch((error) => {
    logger.error('Authentication error:', error);
    return sendApiError(res, 500, {
      errorCode: 'GATEWAY_INTERNAL_ERROR',
      message: 'Authentication error',
      messageUser: GENERIC_5XX_MESSAGE,
    });
  });
};

async function authenticateAsync(req, res, next) {
  const existingId = req.user?.id || req.user?.userId || req.user?._id;
  if (existingId) {
    return next();
  }

  const forwardedUserId = getHeader(req.headers, 'x-user-id');
  if (forwardedUserId && isTrustedGatewayForward(req)) {
    const systemRole = String(getHeader(req.headers, 'x-user-system-role') || '')
      .trim()
      .toLowerCase();
    req.user = {
      id: String(forwardedUserId).trim(),
      userId: String(forwardedUserId).trim(),
      email: getHeader(req.headers, 'x-user-email') || null,
      ...(systemRole ? { systemRole } : {}),
    };
    return next();
  }

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    logger.error('JWT_SECRET is not configured');
    return sendApiError(res, 500, {
      errorCode: 'GATEWAY_INTERNAL_ERROR',
      message: 'Authentication service misconfigured',
      messageUser: GENERIC_5XX_MESSAGE,
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendApiError(res, 401, {
      errorCode: 'AUTH_NO_TOKEN',
      message: 'No token provided',
      messageUser: 'Vui lòng đăng nhập lại.',
    });
  }

  const token = normalizeToken(authHeader.split(' ')[1]);

  if (!token) {
    return sendApiError(res, 401, {
      errorCode: 'AUTH_NO_TOKEN',
      message: 'No token provided',
      messageUser: 'Vui lòng đăng nhập lại.',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.id || decoded.userId || decoded._id;

    const versionOk = await isAccessTokenVersionValid(userId, decoded.tv);
    if (!versionOk) {
      return sendApiError(res, 401, {
        errorCode: 'AUTH_TOKEN_INVALID',
        message: 'Token revoked',
        messageUser: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    req.user = {
      id: userId,
      email: decoded.email,
      ...decoded,
    };

    logger.debug(`User authenticated: ${req.user.id}`);
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expired');
      return sendApiError(res, 401, {
        errorCode: 'AUTH_TOKEN_EXPIRED',
        message: 'Token expired',
        messageUser: 'Phiên đăng nhập đã hết hạn.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid token');
      return sendApiError(res, 401, {
        errorCode: 'AUTH_TOKEN_INVALID',
        message: 'Invalid token',
        messageUser: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    throw error;
  }
}

/**
 * Middleware xác thực JWT cho Socket.IO
 * @param {Object} socket - Socket.IO socket object
 * @param {Function} next - Next middleware function
 */
const socketAuth = (socket, next) => {
  (async () => {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not configured');
      return next(new Error('Authentication service misconfigured'));
    }

    const authHeader = socket.handshake.headers?.authorization;
    const tokenFromHeader = authHeader?.split?.(' ')?.[1];
    const rawToken = socket.handshake.auth?.token || tokenFromHeader;
    const token = normalizeToken(rawToken);

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.id || decoded.userId || decoded._id;

    const versionOk = await isAccessTokenVersionValid(userId, decoded.tv);
    if (!versionOk) {
      return next(new Error('Authentication error: Token revoked'));
    }

    const normalizedUser = {
      ...decoded,
      id: userId,
      userId: decoded.userId || decoded.id || decoded._id,
    };

    if (!normalizedUser.id) {
      return next(new Error('Authentication error: Invalid token payload'));
    }

    socket.user = normalizedUser;
    socket.data = socket.data || {};
    socket.data.user = normalizedUser;

    logger.debug(`Socket authenticated: ${socket.user.id}`);
    return next();
  })().catch((error) => {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Socket token expired');
      return next(new Error('Authentication error: Token expired'));
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid socket token');
      return next(new Error('Authentication error: Invalid token'));
    }

    logger.error('Socket authentication error:', error);
    return next(new Error('Authentication error: Invalid token'));
  });
};

/**
 * Optional authentication - không bắt buộc token
 * Nếu có token thì verify, không có thì bỏ qua
 */
const optionalAuth = (req, res, next) => {
  Promise.resolve(optionalAuthAsync(req, res, next)).catch(() => next());
};

async function optionalAuthAsync(req, res, next) {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = normalizeToken(authHeader.split(' ')[1]);
      if (!token) {
        return next();
      }

      try {
        const decoded = jwt.verify(token, jwtSecret);
        const userId = decoded.id || decoded.userId || decoded._id;
        const versionOk = await isAccessTokenVersionValid(userId, decoded.tv);
        if (!versionOk) {
          return next();
        }
        req.user = {
          id: decoded.id,
          email: decoded.email,
          ...decoded,
        };
      } catch (error) {
        logger.debug('Optional auth failed, continuing without user');
      }
    }

    next();
  } catch (error) {
    next();
  }
}

module.exports = {
  authenticate,
  socketAuth,
  optionalAuth,
};




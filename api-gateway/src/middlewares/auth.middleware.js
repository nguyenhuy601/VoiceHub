const jwt = require('jsonwebtoken');
const { isPublicRoute } = require('../config/services');
const { isAccessTokenVersionValid } = require('@enterprise/shared/utils/tokenVersionAuth');
const { sendApiError } = require('@enterprise/shared/middleware/httpErrorResponse');

const getJwtSecret = () => String(process.env.JWT_SECRET || '').trim();

/**
 * Middleware xác thực JWT
 * Verify JWT token và gắn req.user
 */
const authMiddleware = (req, res, next) => {
  Promise.resolve(authMiddlewareAsync(req, res, next)).catch((error) => {
    console.error('[API-Gateway] authMiddleware:', error);
    return sendApiError(res, 500, {
      errorCode: 'GATEWAY_INTERNAL_ERROR',
      message: 'Authentication error',
      messageUser: 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.',
    });
  });
};

async function authMiddlewareAsync(req, res, next) {
  // Lấy path không có query string để check public route (Express 5 / proxy: dùng thêm originalUrl)
  const pathWithoutQuery = req.path.split('?')[0];
  const fromOriginal = String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/\/+/g, '/');

  // Bỏ qua các route public
  if (
    isPublicRoute(pathWithoutQuery) ||
    isPublicRoute(fromOriginal) ||
    pathWithoutQuery === '/api/health/gateway-trust' ||
    fromOriginal.endsWith('/api/health/gateway-trust')
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API-Gateway] Public route: ${pathWithoutQuery}`);
    }
    return next();
  }

  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return sendApiError(res, 500, {
        errorCode: 'GATEWAY_INTERNAL_ERROR',
        message: 'Authentication service misconfigured',
        messageUser: 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.',
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

    const token = authHeader.split(' ')[1];

    if (!token) {
      return sendApiError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        message: 'No token provided',
        messageUser: 'Vui lòng đăng nhập lại.',
      });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const userId = decoded.id || decoded.userId || decoded._id;
      const normalizedUserId = userId != null ? String(userId).trim() : '';
      if (!normalizedUserId) {
        return sendApiError(res, 401, {
          errorCode: 'AUTH_TOKEN_INVALID',
          message: 'Invalid token',
          messageUser: 'Phiên đăng nhập không hợp lệ.',
        });
      }

      const versionOk = await isAccessTokenVersionValid(normalizedUserId, decoded.tv);
      if (!versionOk) {
        return sendApiError(res, 401, {
          errorCode: 'AUTH_TOKEN_INVALID',
          message: 'Token revoked',
          messageUser: 'Phiên đăng nhập không hợp lệ.',
        });
      }

      req.user = {
        id: normalizedUserId,
        email: decoded.email,
        ...decoded,
      };

      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return sendApiError(res, 401, {
          errorCode: 'AUTH_TOKEN_EXPIRED',
          message: 'Token expired',
          messageUser: 'Phiên đăng nhập đã hết hạn.',
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return sendApiError(res, 401, {
          errorCode: 'AUTH_TOKEN_INVALID',
          message: 'Invalid token',
          messageUser: 'Phiên đăng nhập không hợp lệ.',
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[API-Gateway] authMiddleware:', error);
    return sendApiError(res, 500, {
      errorCode: 'GATEWAY_INTERNAL_ERROR',
      message: 'Authentication error',
      messageUser: 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.',
    });
  }
}

module.exports = authMiddleware;

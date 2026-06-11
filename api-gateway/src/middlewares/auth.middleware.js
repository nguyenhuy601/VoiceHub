const jwt = require('jsonwebtoken');
const { isPublicRoute } = require('../config/services');
const { isAccessTokenVersionValid } = require('@enterprise/shared/utils/tokenVersionAuth');

const getJwtSecret = () => String(process.env.JWT_SECRET || '').trim();

/**
 * Middleware xác thực JWT
 * Verify JWT token và gắn req.user
 */
const authMiddleware = (req, res, next) => {
  Promise.resolve(authMiddlewareAsync(req, res, next)).catch((error) => {
    console.error('[API-Gateway] authMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
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
      return res.status(500).json({
        success: false,
        message: 'Authentication service misconfigured',
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const userId = decoded.id || decoded.userId || decoded._id;
      const normalizedUserId = userId != null ? String(userId).trim() : '';
      if (!normalizedUserId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }

      const versionOk = await isAccessTokenVersionValid(normalizedUserId, decoded.tv);
      if (!versionOk) {
        return res.status(401).json({
          success: false,
          message: 'Token revoked',
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
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[API-Gateway] authMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
}

module.exports = authMiddleware;





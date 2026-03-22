const jwt = require('jsonwebtoken');
const { isPublicRoute } = require('../config/services');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Middleware xác thực JWT
 * Verify JWT token và gắn req.user
 */
const authMiddleware = (req, res, next) => {
  // Lấy path không có query string để check public route
  const pathWithoutQuery = req.path.split('?')[0];
  
  // Bỏ qua các route public
  if (isPublicRoute(pathWithoutQuery)) {
    console.log(`[API-Gateway] Public route detected: ${pathWithoutQuery}, skipping authentication`);
    return next();
  }
  
  console.log(`[API-Gateway] Protected route: ${req.path}, checking authentication...`);

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
        id: decoded.id || decoded.userId || decoded._id,
        email: decoded.email,
        ...decoded,
      };

      next();
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
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message,
    });
  }
};

module.exports = authMiddleware;





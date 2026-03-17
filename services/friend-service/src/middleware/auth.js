const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    // Auth /me trả về data: { id, email } hoặc data: { user: { ... } }
    const user = response.data?.data?.user || response.data?.data || response.data?.user;
    if (!user || !(user.id || user._id)) {
      return res.status(401).json({ status: 'fail', message: 'Invalid token' });
    }
    if (!user._id && user.id) user._id = user.id;
    req.user = user;
    next();
  } catch (error) {
    // Chỉ trả 401 khi auth-service xác định token sai/hết hạn → client mới logout
    // Lỗi mạng / auth-service down → trả 503 để client không thoát đăng nhập
    if (error.response?.status === 401) {
      return res.status(401).json({ status: 'fail', message: error.response?.data?.message || 'Invalid token' });
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        status: 'fail',
        message: 'Auth service unavailable. Please try again later.',
      });
    }
    return res.status(503).json({
      status: 'fail',
      message: error.response?.data?.message || 'Service temporarily unavailable',
    });
  }
};

const AppError = require('../utils/appError');

module.exports = (err, req, res, next) => {
  // Bỏ qua lỗi nếu request đã bị abort hoặc response đã được gửi
  if (req.aborted || res.headersSent) {
    return;
  }

  // Xử lý lỗi request aborted
  if (err.message && (err.message.includes('aborted') || err.message.includes('ECONNRESET'))) {
    console.log('Request aborted or connection reset');
    return;
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    } else {
      console.error('ERROR 💥', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong',
      });
    }
  }
};

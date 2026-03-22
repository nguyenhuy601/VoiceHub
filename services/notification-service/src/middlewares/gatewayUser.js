/**
 * API Gateway verify JWT rồi forward header x-user-id xuống microservice.
 * Notification-service không tự verify JWT — cần gắn req.user từ header để controller lấy userId.
 */
function gatewayUserMiddleware(req, res, next) {
  const uid = req.headers['x-user-id'];
  if (uid && !req.user?.id) {
    req.user = {
      ...(req.user || {}),
      id: String(uid).trim(),
    };
  }
  next();
}

module.exports = gatewayUserMiddleware;

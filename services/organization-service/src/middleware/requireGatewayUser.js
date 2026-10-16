/**
 * Yêu cầu req.user từ gateway trust — từ chối gọi thẳng service không qua gateway.
 */
function requireGatewayUser(req, res, next) {
  const userId = req.user?.id || req.userContext?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  return next();
}

module.exports = requireGatewayUser;

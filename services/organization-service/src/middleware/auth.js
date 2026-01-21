const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    // Verify token with auth service
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    req.user = response.data.data.user;
    next();
  } catch (error) {
    res.status(401).json({ status: 'fail', message: 'Invalid token' });
  }
};

exports.authorize = (roles) => {
  return async (req, res, next) => {
    const Membership = require('../models/Membership');
    const orgId = req.params.orgId || req.params.id;

    const membership = await Membership.findOne({
      user: req.user.id || req.user._id,
      organization: orgId,
    });

    if (!membership || !roles.includes(membership.role)) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    req.membership = membership;
    next();
  };
};

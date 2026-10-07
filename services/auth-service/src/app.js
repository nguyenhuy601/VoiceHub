const express = require('express');
const rateLimit = require('express-rate-limit');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { shouldSkipAuthRouteRateLimit } = require('./utils/shouldSkipAuthRouteRateLimit');
require('dotenv').config();

const app = express();

// Sau reverse proxy / API Gateway request thường có X-Forwarded-For.
// express-rate-limit v7+ bắt buộc trust proxy khớp, nếu không sẽ ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
function resolveTrustProxy() {
  const v = process.env.TRUST_PROXY;
  if (v === '0' || v === 'false') return false;
  if (v === 'true' || v === '1') return true;
  if (v != null && String(v).trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return 1; // mặc định: một hop (gateway → service)
}
app.set('trust proxy', resolveTrustProxy());
app.disable('x-powered-by');

const AUTH_JSON_LIMIT = String(process.env.AUTH_JSON_LIMIT || '').trim() || '100kb';

// Middleware
app.use(createCorsMiddleware());

const authRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX_PER_MIN || 120),
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipAuthRouteRateLimit,
});
app.use('/api/auth', authRouteLimiter);

// Body parser với limit và error handling
app.use(express.json({ 
  limit: AUTH_JSON_LIMIT,
  verify: (req, res, buf) => {
    // Lưu raw body nếu cần
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: AUTH_JSON_LIMIT 
}));

// Error handler cho body parser
app.use((err, req, res, next) => {
  const isBodyParseError =
    err?.type === 'entity.parse.failed' ||
    err?.type === 'entity.too.large' ||
    (err instanceof SyntaxError && err.status === 400 && 'body' in err);
  if (!isBodyParseError) return next(err);
  const { sendErrorFromCatch } = require('./middleware/sendServiceError');
  return sendErrorFromCatch(res, err, 400);
});

// Handle request aborted errors
app.use((req, res, next) => {
  req.on('aborted', () => {
    console.log('Request aborted by client');
  });
  req.on('close', () => {
    if (!res.headersSent) {
      console.log('Request closed before response sent');
    }
  });
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Email service status endpoint (debug only — không expose trên production)
app.get('/email-status', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const { sendServiceError } = require('./middleware/sendServiceError');
    return sendServiceError(res, 404, {
      errorCode: 'AUTH_ROUTE_NOT_FOUND',
      messageUser: 'Không tìm thấy tài nguyên.',
      message: 'Not found',
    });
  }
  const emailService = require('./utils/email');
  const available = emailService.isAvailable();
  const configured = !!process.env.EMAIL_USER && !!process.env.EMAIL_PASSWORD;
  res.json({ emailService: { available, configured } });
});

// Auth routes
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

app.use((req, res) => {
  const { sendServiceError } = require('./middleware/sendServiceError');
  return sendServiceError(res, 404, {
    errorCode: 'AUTH_ROUTE_NOT_FOUND',
    messageUser: 'Không tìm thấy tài nguyên.',
    message: 'Not found',
  });
});

// Error handler middleware (phải đặt sau routes)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;





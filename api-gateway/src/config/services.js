const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!AUTH_SERVICE_URL) throw new Error('Thiếu biến môi trường: AUTH_SERVICE_URL');
const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!USER_SERVICE_URL) throw new Error('Thiếu biến môi trường: USER_SERVICE_URL');
const FRIEND_SERVICE_URL = String(process.env.FRIEND_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!FRIEND_SERVICE_URL) throw new Error('Thiếu biến môi trường: FRIEND_SERVICE_URL');
const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const ROLE_PERMISSION_SERVICE_URL = String(process.env.ROLE_PERMISSION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ROLE_PERMISSION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ROLE_PERMISSION_SERVICE_URL');
const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!CHAT_SERVICE_URL) throw new Error('Thiếu biến môi trường: CHAT_SERVICE_URL');
const VOICE_SERVICE_URL = String(process.env.VOICE_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!VOICE_SERVICE_URL) throw new Error('Thiếu biến môi trường: VOICE_SERVICE_URL');
const { isReportServiceEnabled, resolveReportServiceUrl } = require('@enterprise/shared/config/reportServiceFlags');

const PROJECT_SERVICE_URL = String(process.env.PROJECT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!PROJECT_SERVICE_URL) throw new Error('Thiếu biến môi trường: PROJECT_SERVICE_URL');
/**
 * Optional — AI Project Planning is S2S from project-service (browser never calls it).
 * If unset, skip proxy registration so existing .env keeps working.
 */
const AI_PROJECT_PLANNING_SERVICE_URL = String(
  process.env.AI_PROJECT_PLANNING_SERVICE_URL || ''
)
  .trim()
  .replace(/\/+$/, '');
/** Optional — ADR-003 report-service (C2/C4); chỉ mount khi URL + REPORT_AGGREGATOR_MODE. */
const REPORT_SERVICE_URL = isReportServiceEnabled() ? resolveReportServiceUrl() : '';
const DOCUMENT_SERVICE_URL = String(process.env.DOCUMENT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!DOCUMENT_SERVICE_URL) throw new Error('Thiếu biến môi trường: DOCUMENT_SERVICE_URL');
const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!NOTIFICATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: NOTIFICATION_SERVICE_URL');
const SOCKET_SERVICE_URL = String(process.env.SOCKET_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!SOCKET_SERVICE_URL) throw new Error('Thiếu biến môi trường: SOCKET_SERVICE_URL');
// Cấu hình các microservices — URL chỉ từ biến môi trường (không hardcode hostname nội bộ).
const services = {
  auth: {
    url: AUTH_SERVICE_URL,
    routes: ['/api/auth'],
  },
  user: {
    url: USER_SERVICE_URL,
    routes: ['/api/users'],
  },
  friend: {
    url: FRIEND_SERVICE_URL,
    routes: ['/api/friends'],
  },
  organization: {
    url: ORGANIZATION_SERVICE_URL,
    routes: ['/api/organizations'],
  },
  rolePermission: {
    url: ROLE_PERMISSION_SERVICE_URL,
    routes: ['/api/roles', '/api/permissions'],
  },
  chat: {
    url: CHAT_SERVICE_URL,
    routes: ['/api/messages'],
  },
  voice: {
    url: VOICE_SERVICE_URL,
    routes: ['/api/voice', '/api/meetings'],
  },
  project: {
    url: PROJECT_SERVICE_URL,
    routes: ['/api/projects'],
  },
  task: {
    url: PROJECT_SERVICE_URL,
    // /api/projects giữ để workspace boards (getServiceByPath ưu tiên project trước; boards workspace dùng isWorkspaceTaskBoardPath).
    routes: ['/api/tasks', '/api/projects'],
  },
  // Internal-only diagnostic proxy (optional). Primary path: project → S2S Docker DNS.
  ...(AI_PROJECT_PLANNING_SERVICE_URL
    ? {
        aiProjectPlanning: {
          url: AI_PROJECT_PLANNING_SERVICE_URL,
          routes: ['/api/ai/project-planning'],
        },
      }
    : {}),
  ...(REPORT_SERVICE_URL
    ? {
        report: {
          url: REPORT_SERVICE_URL,
          routes: ['/api/reports'],
        },
      }
    : {}),
  document: {
    url: DOCUMENT_SERVICE_URL,
    routes: ['/api/documents'],
  },
  notification: {
    url: NOTIFICATION_SERVICE_URL,
    routes: ['/api/notifications'],
  },
  socket: {
    url: SOCKET_SERVICE_URL,
    routes: [],
  },
};

// Routes không cần authentication
const publicRoutes = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh-token',
  '/api/auth/forgot-password',
  '/api/auth/resend-verification',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/verify-email-change',
  '/api/organizations/company-invites/accept',
  '/api/health/gateway-trust',
  '/api/docs',
  '/api/docs.json',
  '/api/docs.yaml',
  '/api/docs-assets',
  '/health',
  '/metrics',
  '/favicon.ico',
];

// Chuẩn hóa path: gateway có thể mount tại '/' hoặc '/api', route luôn có dạng /api/...
const normalizePath = (path) => (path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

/** Path API đầy đủ từ request (Express 5 / proxy: ưu tiên originalUrl). */
const resolveReqApiPath = (req) => {
  const fromOriginal = String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/\/+/g, '/');
  if (fromOriginal.startsWith('/api')) return fromOriginal;
  return normalizePath(String(req.path || '').split('?')[0]);
};

/** Task boards theo workspace slug — proxy project-service, không organization-service. */
const isWorkspaceTaskBoardPath = (path) => {
  const normalized = normalizePath(path);
  return /^\/api\/workspaces\/[^/]+\/task-boards(\/|$)/i.test(normalized);
};

// Tìm service theo path
const getServiceByPath = (path) => {
  const normalized = normalizePath(path);
  if (isWorkspaceTaskBoardPath(normalized)) {
    return {
      name: 'task',
      url: services.task.url,
    };
  }
  for (const [serviceName, config] of Object.entries(services)) {
    for (const route of config.routes) {
      if (normalized.startsWith(route)) {
        return {
          name: serviceName,
          url: config.url,
        };
      }
    }
  }
  return null;
};

/** Route public — khớp chính xác hoặc prefix có dấu `/` sau (tránh `/health` khớp `/healthcare`). */
const isPublicRoute = (path) => {
  const normalized = String(path || '').split('?')[0].replace(/\/+/g, '/');
  return publicRoutes.some((route) => {
    if (normalized === route) return true;
    if (route.endsWith('/')) return normalized.startsWith(route);
    return normalized.startsWith(`${route}/`);
  });
};

/** Route S2S bootstrap — không JWT user ở gateway (auth + org internal). */
function isAuthInternalS2SPath(path) {
  const normalized = String(path || '').split('?')[0].replace(/\/+/g, '/');
  return (
    normalized.startsWith('/api/auth/internal/') ||
    normalized.startsWith('/api/organizations/internal/') ||
    normalized.startsWith('/api/friends/internal/')
  );
}

/**
 * Header token/cờ nội bộ do client có thể gắn. Gateway không forward;
 * S2S Docker gọi thẳng service, không đi qua proxy này.
 */
const CLIENT_SUPPLIED_INTERNAL_HEADERS = [
  'x-internal-token',
  'x-chat-internal-token',
  'x-internal-notification-token',
  'x-realtime-token',
  'x-vh-org-documents-internal',
];

function stripClientSuppliedInternalHeaders(headers) {
  if (!headers || typeof headers !== 'object') return;
  for (const name of CLIENT_SUPPLIED_INTERNAL_HEADERS) {
    delete headers[name];
  }
}

/**
 * Browser không được gọi /internal trừ 3 prefix S2S.
 * Segment `internal` (không phân biệt hoa thường) để chặn biến thể chữ hoa.
 */
function isUserBlockedInternalPath(path) {
  const raw = String(path || '').split('?')[0].replace(/\/+/g, '/');
  if (!raw) return false;
  const withApi = raw.startsWith('/api') ? raw : normalizePath(raw);
  const hasInternal = withApi
    .split('/')
    .some((segment) => segment.toLowerCase() === 'internal');
  if (!hasInternal) return false;
  if (isAuthInternalS2SPath(withApi) || isAuthInternalS2SPath(raw)) return false;
  return true;
}

module.exports = {
  services,
  getServiceByPath,
  isPublicRoute,
  isAuthInternalS2SPath,
  isUserBlockedInternalPath,
  stripClientSuppliedInternalHeaders,
  CLIENT_SUPPLIED_INTERNAL_HEADERS,
  normalizePath,
  resolveReqApiPath,
  isWorkspaceTaskBoardPath,
};

/**
 * EN+VI keyword matching for AI Analysis heuristics (fold diacritics).
 * Canonical labels (entity/skill/layer) stay English when mapped.
 */

const FR_LANGUAGE_CUE =
  'FR text may be Vietnamese or English; interpret verbs and nouns in either language.';

function foldVi(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/**
 * Phrase match on folded text. ASCII single tokens use soft word edges.
 */
function hasPhrase(folded, phrase) {
  const p = foldVi(phrase);
  if (!p) return false;
  if (/^[a-z0-9]+$/.test(p)) {
    return new RegExp(`(?:^|[^a-z0-9])${p}(?:[^a-z0-9]|$)`).test(folded);
  }
  return folded.includes(p);
}

function hasAnyPhrase(folded, phrases) {
  return (phrases || []).some((p) => hasPhrase(folded, p));
}

function hasRegex(folded, re) {
  return re.test(folded);
}

const CRUD_CREATE_PHRASES = [
  'create',
  'add',
  'register',
  'insert',
  'sign up',
  'signup',
  'them',
  'tao',
  'tao moi',
  'dang ky',
  'nhap moi',
  'ghi nhan',
];

const CRUD_READ_PHRASES = [
  'read',
  'view',
  'list',
  'get',
  'fetch',
  'display',
  'show',
  'search',
  'query',
  'xem',
  'liet ke',
  'tra cuu',
  'tim kiem',
  'hien thi',
  'doc',
  'danh sach',
];

const CRUD_UPDATE_PHRASES = [
  'update',
  'edit',
  'modify',
  'change',
  'patch',
  'sua',
  'cap nhat',
  'chinh sua',
  'thay doi',
];

const CRUD_DELETE_PHRASES = [
  'delete',
  'remove',
  'revoke',
  'deactivate',
  'cancel',
  'xoa',
  'huy',
  'vo hieu',
  'loai bo',
];

/**
 * RULE-02: quan ly → create+read+update (not delete unless delete phrases present).
 * @returns {{ create: boolean, read: boolean, update: boolean, delete: boolean }}
 */
function detectCrudFromText(text) {
  const t = foldVi(text);
  const flags = {
    create: hasAnyPhrase(t, CRUD_CREATE_PHRASES) || hasRegex(t, /\bnew\b/),
    read: hasAnyPhrase(t, CRUD_READ_PHRASES),
    update: hasAnyPhrase(t, CRUD_UPDATE_PHRASES),
    delete: hasAnyPhrase(t, CRUD_DELETE_PHRASES),
  };
  if (hasPhrase(t, 'quan ly') || hasRegex(t, /\bquan\s+ly\b/)) {
    flags.create = true;
    flags.read = true;
    flags.update = true;
  }
  return flags;
}

/** [phrases[], canonicalEnName] */
const ENTITY_DOMAIN_BAGS = [
  [
    [
      'user',
      'account',
      'profile',
      'session',
      'credential',
      'password',
      'nhan vien',
      'ho so',
      'nguoi dung',
      'tai khoan',
      'mat khau',
    ],
    'User',
  ],
  [
    [
      'order',
      'cart',
      'checkout',
      'invoice',
      'payment',
      'billing',
      'don hang',
      'gio hang',
      'thanh toan',
      'hoa don',
    ],
    'Order',
  ],
  [
    ['product', 'catalog', 'inventory', 'sku', 'san pham', 'kho hang', 'danh muc'],
    'Product',
  ],
  [
    [
      'message',
      'chat',
      'notification',
      'email',
      'sms',
      'tin nhan',
      'thong bao',
    ],
    'Message',
  ],
  [
    [
      'file',
      'document',
      'attachment',
      'upload',
      'tai lieu',
      'tep',
      'van ban',
      'dinh kem',
    ],
    'Document',
  ],
  [
    ['role', 'permission', 'rbac', 'grant', 'vai tro', 'quyen', 'phan quyen'],
    'Role',
  ],
  [
    [
      'report',
      'analytics',
      'dashboard',
      'metric',
      'bao cao',
      'thong ke',
      'bang dieu khien',
    ],
    'Report',
  ],
  [
    [
      'organization',
      'company',
      'tenant',
      'workspace',
      'to chuc',
      'cong ty',
      'doanh nghiep',
    ],
    'Organization',
  ],
  [
    ['task', 'ticket', 'issue', 'project', 'cong viec', 'viec', 'du an', 'phieu'],
    'Task',
  ],
];

/**
 * @returns {string[]} canonical English entity names (max caller-sliced)
 */
function detectEntityCanonicalNames(text) {
  const t = foldVi(text);
  const found = [];
  for (const [phrases, name] of ENTITY_DOMAIN_BAGS) {
    if (hasAnyPhrase(t, phrases)) found.push(name);
  }
  return found;
}

const AMBIGUOUS_PHRASES = [
  'tbd',
  'todo',
  'unclear',
  'maybe',
  'etc',
  'chua xac dinh',
  'can lam ro',
  'can xac dinh',
  'co the',
  'v.v',
  'vv.',
  '…',
  '...',
];

function hasAmbiguousLanguage(text) {
  const t = foldVi(text);
  if (t.includes('…') || t.includes('...')) return true;
  return hasAnyPhrase(t, AMBIGUOUS_PHRASES);
}

function hasPossibleContradiction(text) {
  const t = foldVi(text);
  const positive =
    hasPhrase(t, 'must') ||
    hasPhrase(t, 'shall') ||
    hasPhrase(t, 'phai') ||
    hasPhrase(t, 'bat buoc');
  const negative =
    hasRegex(t, /\bmust\s+not\b/) ||
    hasRegex(t, /\bshall\s+not\b/) ||
    hasPhrase(t, 'khong duoc') ||
    hasPhrase(t, 'cam') ||
    hasRegex(t, /\bkhong\s+phai\b/);
  return positive && negative;
}

const INTEGRATION_PHRASES = [
  'api',
  'integration',
  'external',
  'payment',
  'oauth',
  'third party',
  'third-party',
  'gateway',
  'tich hop',
  'he thong ngoai',
  'ben thu ba',
  'thanh toan',
  'cong thanh toan',
];

function hasIntegrationHint(text) {
  return hasAnyPhrase(foldVi(text), INTEGRATION_PHRASES);
}

const DATA_HINT_PHRASES = [
  'store',
  'persist',
  'database',
  'data',
  'record',
  'entity',
  'pii',
  'luu tru',
  'co so du lieu',
  'csdl',
  'ban ghi',
  'du lieu',
  'thuc the',
];

function hasDataHint(text) {
  return hasAnyPhrase(foldVi(text), DATA_HINT_PHRASES);
}

function inferSensitivityLocale(text, fallback) {
  const t = foldVi(text);
  if (
    hasAnyPhrase(t, [
      'password',
      'ssn',
      'pii',
      'secret',
      'token',
      'oauth',
      'mat khau',
      'cccd',
      'cmnd',
      'bi mat',
      'du lieu ca nhan',
      'bao mat',
      'ma hoa',
    ]) ||
    hasRegex(t, /credit\s*card/) ||
    hasPhrase(t, 'the tin dung')
  ) {
    return 'confidential';
  }
  if (
    hasAnyPhrase(t, [
      'email',
      'phone',
      'address',
      'profile',
      'user data',
      'so dien thoai',
      'dia chi',
      'ho so',
      'thong tin ca nhan',
    ])
  ) {
    return 'internal';
  }
  return fallback || 'internal';
}

function inferNfrSensitivityLocale(blob) {
  const t = foldVi(blob);
  if (
    hasAnyPhrase(t, [
      'pii',
      'personal data',
      'gdpr',
      'privacy',
      'confidential',
      'secret',
      'encrypt',
      'du lieu ca nhan',
      'bao mat',
      'rieng tu',
      'ma hoa',
    ])
  ) {
    return 'confidential';
  }
  if (
    hasAnyPhrase(t, ['internal', 'staff only', 'employee', 'noi bo', 'nhan vien'])
  ) {
    return 'internal';
  }
  if (hasAnyPhrase(t, ['public', 'open data', 'cong khai'])) {
    return 'public';
  }
  return '';
}

/**
 * @returns {{ name: string, level?: number }[]}
 */
function detectSkillHints(text) {
  const t = foldVi(text);
  const skills = [];
  const push = (name, level) => {
    if (skills.some((s) => s.name === name)) return;
    skills.push(level != null ? { name, level } : { name });
  };
  if (
    hasAnyPhrase(t, [
      'auth',
      'login',
      'password',
      'oauth',
      'jwt',
      'session',
      'dang nhap',
      'xac thuc',
      'mat khau',
    ])
  ) {
    push('Authentication', 3);
  }
  if (hasAnyPhrase(t, ['api', 'rest', 'graphql', 'endpoint', 'dich vu api'])) {
    push('REST API', 3);
  }
  if (
    hasAnyPhrase(t, [
      'ui',
      'screen',
      'page',
      'frontend',
      'react',
      'form',
      'giao dien',
      'man hinh',
      'trang',
      'bieu mau',
    ])
  ) {
    push('React', 3);
  }
  if (
    hasAnyPhrase(t, [
      'db',
      'database',
      'sql',
      'mongo',
      'persist',
      'store',
      'co so du lieu',
      'csdl',
      'luu tru',
    ])
  ) {
    push('Database', 3);
  }
  if (hasAnyPhrase(t, ['payment', 'billing', 'invoice', 'thanh toan', 'hoa don'])) {
    push('Payments', 3);
  }
  if (
    hasAnyPhrase(t, [
      'notif',
      'email',
      'sms',
      'push',
      'thong bao',
      'tin nhan',
    ])
  ) {
    push('Notifications', 2);
  }
  if (
    hasAnyPhrase(t, [
      'report',
      'analytics',
      'dashboard',
      'bao cao',
      'thong ke',
    ])
  ) {
    push('Reporting', 2);
  }
  if (
    hasAnyPhrase(t, [
      'security',
      'encrypt',
      'rbac',
      'permission',
      'bao mat',
      'phan quyen',
      'ma hoa',
    ])
  ) {
    push('Security', 3);
  }
  return skills;
}

function inferLayerLocale(text) {
  const t = foldVi(text);
  if (
    hasAnyPhrase(t, [
      'auth',
      'login',
      'oauth',
      'jwt',
      'session',
      'rbac',
      'permission',
      'dang nhap',
      'xac thuc',
      'phan quyen',
    ])
  ) {
    return 'auth';
  }
  if (
    hasAnyPhrase(t, [
      'react',
      'vue',
      'angular',
      'ui',
      'frontend',
      'screen',
      'page',
      'css',
      'giao dien',
      'man hinh',
    ])
  ) {
    return 'frontend';
  }
  if (
    hasAnyPhrase(t, [
      'mongo',
      'sql',
      'postgres',
      'database',
      'persist',
      'schema',
      'entity',
      'co so du lieu',
      'csdl',
      'thuc the',
    ])
  ) {
    return 'database';
  }
  if (
    hasAnyPhrase(t, [
      'api',
      'rest',
      'graphql',
      'endpoint',
      'gateway',
      'cong api',
    ])
  ) {
    return 'api';
  }
  if (
    hasAnyPhrase(t, [
      'docker',
      'k8s',
      'kubernetes',
      'ci/cd',
      'deploy',
      'nginx',
      'infra',
      'ha tang',
      'trien khai',
    ])
  ) {
    return 'infrastructure';
  }
  if (
    hasAnyPhrase(t, [
      'encrypt',
      'security',
      'tls',
      'cors',
      'owasp',
      'bao mat',
      'ma hoa',
    ])
  ) {
    return 'security';
  }
  if (
    hasAnyPhrase(t, [
      'payment',
      'external',
      'third party',
      'third-party',
      'vendor',
      'stripe',
      'he thong ngoai',
      'ben thu ba',
      'thanh toan',
    ])
  ) {
    return 'external';
  }
  if (hasAnyPhrase(t, ['deploy', 'release', 'pipeline', 'phat hanh', 'trien khai'])) {
    return 'deployment';
  }
  if (
    hasAnyPhrase(t, [
      'node',
      'express',
      'service',
      'backend',
      'server',
      'may chu',
      'dich vu',
    ])
  ) {
    return 'backend';
  }
  return 'backend';
}

function inferAreaLocale(text) {
  const t = foldVi(text);
  if (
    hasAnyPhrase(t, [
      'react',
      'vue',
      'angular',
      'ui',
      'frontend',
      'screen',
      'page',
      'giao dien',
      'man hinh',
    ])
  ) {
    return 'frontend';
  }
  if (hasAnyPhrase(t, ['qa', 'test', 'selenium', 'cypress', 'kiem thu'])) {
    return 'qa';
  }
  if (hasAnyPhrase(t, ['design', 'figma', 'ux', 'ui/ux', 'thiet ke'])) {
    return 'design';
  }
  if (
    hasAnyPhrase(t, [
      'docker',
      'k8s',
      'devops',
      'ci/cd',
      'deploy',
      'ha tang',
      'trien khai',
    ])
  ) {
    return 'infrastructure';
  }
  if (hasAnyPhrase(t, ['auth', 'oauth', 'jwt', 'login', 'dang nhap', 'xac thuc'])) {
    return 'auth';
  }
  if (
    hasAnyPhrase(t, [
      'db',
      'database',
      'mongo',
      'sql',
      'persist',
      'co so du lieu',
      'csdl',
    ])
  ) {
    return 'database';
  }
  if (hasAnyPhrase(t, ['api', 'rest', 'graphql', 'endpoint'])) {
    return 'api';
  }
  if (
    hasAnyPhrase(t, [
      'pm',
      'manage',
      'planning',
      'scrum',
      'quan ly',
      'ke hoach',
    ])
  ) {
    return 'management';
  }
  return 'backend';
}

module.exports = {
  FR_LANGUAGE_CUE,
  foldVi,
  hasPhrase,
  hasAnyPhrase,
  detectCrudFromText,
  detectEntityCanonicalNames,
  hasAmbiguousLanguage,
  hasPossibleContradiction,
  hasIntegrationHint,
  hasDataHint,
  inferSensitivityLocale,
  inferNfrSensitivityLocale,
  detectSkillHints,
  inferLayerLocale,
  inferAreaLocale,
};

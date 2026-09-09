const ROLE_SCOPES = Object.freeze(['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PERSONAL']);
const PERMISSION_PACK_SCOPE = 'ORGANIZATION';

/** Role gắn vị trí cây tổ chức (tag div_/dep_/team_ hoặc nhãn Khối/Phòng/Team). */
function isHierarchyRoleName(name) {
  const lower = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Hỗ trợ cả id dài (ObjectId 24 chars) và slug scope bất kỳ.
  if (/(?:^|\s|[•·_-])(div|dep|team)_[a-z0-9_-]{6,}\b/.test(lower)) return true;
  if (/^(khoi|khối|phong ban|phòng ban|phong|phòng|team|chi nhanh|chi nhánh)\b/.test(lower)) return true;
  if (/\b(khoi|khối|phong ban|phòng ban|phong|phòng|team)\s*:/.test(lower)) return true;
  return false;
}

/**
 * Gói Permission (không hierarchy name): scope chỉ ORGANIZATION.
 * Role cây phòng/team giữ nguyên scope yêu cầu.
 */
function coercePermissionPackScope(roleName, scope) {
  const normalized = String(scope || PERMISSION_PACK_SCOPE).toUpperCase();
  if (!ROLE_SCOPES.includes(normalized)) {
    const err = new Error('Phạm vi (scope) không hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'ROLE_SCOPE_INVALID';
    throw err;
  }
  if (!isHierarchyRoleName(roleName)) return PERMISSION_PACK_SCOPE;
  return normalized;
}

module.exports = {
  ROLE_SCOPES,
  PERMISSION_PACK_SCOPE,
  isHierarchyRoleName,
  coercePermissionPackScope,
};

/**
 * Chuẩn hóa danh sách phòng ban / team hub — bỏ synthetic và clone seed.
 */

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || value.userId || '');
  return String(value);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function memberLen(entity) {
  if (Array.isArray(entity?.members)) return entity.members.length;
  const n = Number(entity?.memberCount ?? entity?.membersCount ?? entity?.totalMembers ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function preferRicher(prev, next) {
  const prevMembers = memberLen(prev);
  const nextMembers = memberLen(next);
  if (nextMembers > prevMembers) return next;
  return prev;
}

/** Mô tả seed/demo nội bộ — không hiển thị trên hub. */
const DEMO_DESCRIPTION_RE =
  /\bdeep-demo\b|\bdemo chính\b|\bkhông deep-demo\b|\(không deep|\bdemo board\b/i;

export function sanitizeDepartmentDescription(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (DEMO_DESCRIPTION_RE.test(text)) return '';
  return text;
}

/**
 * Loại synthetic + trùng `_id` + clone cùng tên trong cùng khối (`divisionId|name`).
 * Không gộp theo tên toàn org (giữ HR hợp lệ ở khối khác).
 */
export function uniqueDepartmentsForHub(departments = []) {
  const byId = new Map();
  for (const department of Array.isArray(departments) ? departments : []) {
    if (department?.isSynthetic) continue;
    const id = asId(department);
    if (!id || byId.has(id)) continue;
    byId.set(id, department);
  }

  const byFingerprint = new Map();
  for (const department of byId.values()) {
    const divisionId = asId(department?.division || department?.divisionId);
    const name = normalizeName(department?.name);
    if (!name) continue;
    // Thiếu division: không gộp theo tên — giữ từng bản theo _id đã qua bước trên
    const fingerprint = divisionId ? `${divisionId}|${name}` : `id:${asId(department)}`;
    const prev = byFingerprint.get(fingerprint);
    if (!prev) {
      byFingerprint.set(fingerprint, department);
      continue;
    }
    byFingerprint.set(fingerprint, preferRicher(prev, department));
  }
  return Array.from(byFingerprint.values());
}

/**
 * Loại synthetic + trùng `_id` + clone cùng tên trong cùng phòng (`departmentId|name`).
 */
export function uniqueTeamsForHub(teams = []) {
  const byId = new Map();
  for (const team of Array.isArray(teams) ? teams : []) {
    if (team?.isSynthetic) continue;
    const id = asId(team);
    if (!id || byId.has(id)) continue;
    byId.set(id, team);
  }

  const byFingerprint = new Map();
  for (const team of byId.values()) {
    const departmentId = asId(team?.department || team?.departmentId);
    const name = normalizeName(team?.name);
    if (!name) continue;
    const fingerprint = departmentId ? `${departmentId}|${name}` : `id:${asId(team)}`;
    const prev = byFingerprint.get(fingerprint);
    if (!prev) {
      byFingerprint.set(fingerprint, team);
      continue;
    }
    byFingerprint.set(fingerprint, preferRicher(prev, team));
  }
  return Array.from(byFingerprint.values());
}

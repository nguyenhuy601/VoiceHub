/** Intake slots bước 2 wizard: đúng 1 user / cột; kiêm nhiệm = 1 seed row nhiều keys. */

export const INTAKE_LEAD_ROLE_KEYS = Object.freeze([
  'product_owner',
  'project_manager',
  'business_analyst',
  'tech_lead',
]);

export const INTAKE_LEAD_LABEL_KEYS = Object.freeze({
  product_owner: 'adminTasks.wizardColPo',
  project_manager: 'adminTasks.wizardColPm',
  business_analyst: 'adminTasks.wizardColBa',
  tech_lead: 'adminTasks.wizardColTl',
});

export function emptyIntakeSlots() {
  return {
    product_owner: null,
    project_manager: null,
    business_analyst: null,
    tech_lead: null,
  };
}

function slotUserId(slot) {
  return String(slot?.userId || '').trim();
}

/**
 * Merge intake slots → seedMembers. Cùng user nhiều cột → 1 row, nhiều projectRoleKeys.
 * @param {Record<string, { userId?: string, displayName?: string }|null>} slots
 */
export function slotsToSeedMembers(slots = {}) {
  const byUser = new Map();
  for (const roleKey of INTAKE_LEAD_ROLE_KEYS) {
    const slot = slots[roleKey];
    const userId = slotUserId(slot);
    if (!userId) continue;
    const existing = byUser.get(userId) || {
      userId,
      projectRoleKeys: [],
      displayName: '',
    };
    if (!existing.projectRoleKeys.includes(roleKey)) {
      existing.projectRoleKeys.push(roleKey);
    }
    const name = String(slot?.displayName || '').trim();
    if (name && !existing.displayName) existing.displayName = name;
    byUser.set(userId, existing);
  }
  return [...byUser.values()].map((row) =>
    row.displayName ? row : { userId: row.userId, projectRoleKeys: row.projectRoleKeys }
  );
}

export function intakeSlotsFromSeedMembers(seedMembers = []) {
  const slots = emptyIntakeSlots();
  for (const row of Array.isArray(seedMembers) ? seedMembers : []) {
    const userId = String(row?.userId || '').trim();
    if (!userId) continue;
    const keys = Array.isArray(row.projectRoleKeys) ? row.projectRoleKeys : [];
    for (const raw of keys) {
      const key = String(raw || '').trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(slots, key)) continue;
      if (slots[key]) continue;
      slots[key] = {
        userId,
        displayName: String(row.displayName || '').trim(),
      };
    }
  }
  return slots;
}

export const ROLE_SUGGEST_PAGE_SIZE = 3;

export function intakeSlotFilled(slots, roleKey) {
  return Boolean(slotUserId(slots?.[roleKey]));
}

/** Gate WHAT = review phân tích yêu cầu. Gate HOW = review lập kế hoạch. */
export const GATE_PROCESS_KEYS = Object.freeze(['what', 'how']);

/**
 * Nhãn vị trí tổ chức dùng để gợi ý người cho từng vai trò dự án.
 * Khớp ROLE_ORG_POSITION_CODES (master HR + mã vị trí cũ).
 */
export const ROLE_POSITION_HINTS = Object.freeze({
  product_owner: ['Product Manager', 'Product Owner'],
  project_manager: ['Team Lead', 'Project Manager'],
  business_analyst: ['Business Analyst'],
  tech_lead: ['Technical Lead', 'Engineering Manager'],
  technical_lead: ['Technical Lead', 'Engineering Manager'],
  solution_architect: ['Technical Lead'],
  architect: ['Technical Lead'],
  scrum_master: ['Scrum Master'],
  qa_engineer: ['QA Engineer'],
  qa_lead: ['QA Engineer'],
  qa: ['QA Engineer'],
  tester: ['QA Engineer'],
  backend_developer: ['Software Developer'],
  frontend_developer: ['Software Developer'],
  mobile_developer: ['Software Developer'],
  fullstack_developer: ['Software Developer'],
  developer: ['Software Developer'],
  senior_developer: ['Software Developer'],
  junior: ['Software Developer'],
  ui_ux_designer: ['UX Designer'],
  devops_engineer: ['DevOps Engineer'],
  release_manager: ['DevOps Engineer'],
});

export function emptyGateSlots() {
  return { what: {}, how: {} };
}

export function positionHintsForRole(roleKey) {
  const key = String(roleKey || '').trim().toLowerCase();
  const hints = ROLE_POSITION_HINTS[key];
  return Array.isArray(hints) ? hints : [];
}

function normalizeSlotMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [roleKey, slot] of Object.entries(raw)) {
    const key = String(roleKey || '').trim().toLowerCase();
    if (!key) continue;
    if (!slot || !slotUserId(slot)) {
      out[key] = slot ? { ...slot, userId: '' } : null;
      continue;
    }
    out[key] = {
      userId: slotUserId(slot),
      displayName: String(slot.displayName || '').trim(),
      positionName: String(slot.positionName || slot.jobTitle || '').trim(),
    };
  }
  return out;
}

export function normalizeGateSlots(raw) {
  return {
    what: normalizeSlotMap(raw?.what),
    how: normalizeSlotMap(raw?.how),
  };
}

/** Vai trò đã thêm vào một cổng, kể cả chưa gán người. */
export function gateRoleKeys(slots, processKey) {
  const bag = slots?.[processKey];
  if (!bag || typeof bag !== 'object') return [];
  return Object.keys(bag);
}

export function countAssignedGateSlots(slots, processKey) {
  return gateRoleKeys(slots, processKey).filter((key) => intakeSlotFilled(slots?.[processKey], key))
    .length;
}

/**
 * Gộp hai cổng → seed members. Cùng user nhiều vai trò → 1 row.
 * @param {{ what?: object, how?: object }} gateSlots
 */
export function gateSlotsToSeedMembers(gateSlots = {}) {
  const normalized = normalizeGateSlots(gateSlots);
  const byUser = new Map();
  for (const processKey of GATE_PROCESS_KEYS) {
    for (const [roleKey, slot] of Object.entries(normalized[processKey])) {
      const userId = slotUserId(slot);
      if (!userId) continue;
      const existing = byUser.get(userId) || {
        userId,
        projectRoleKeys: [],
        displayName: '',
      };
      if (!existing.projectRoleKeys.includes(roleKey)) {
        existing.projectRoleKeys.push(roleKey);
      }
      const name = String(slot?.displayName || '').trim();
      if (name && !existing.displayName) existing.displayName = name;
      byUser.set(userId, existing);
    }
  }
  return [...byUser.values()].map((row) =>
    row.displayName ? row : { userId: row.userId, projectRoleKeys: row.projectRoleKeys }
  );
}

/** Append page, bỏ trùng userId (giữ item cũ). */
export function mergeRoleSuggestItems(current = [], incoming = []) {
  const out = Array.isArray(current) ? [...current] : [];
  const seen = new Set(out.map((row) => String(row?.userId || '').trim()).filter(Boolean));
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const userId = String(item?.userId || '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    out.push(item);
  }
  return out;
}

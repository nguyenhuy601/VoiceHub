/** Intake slots bước 2 wizard: đúng 1 user / cột; kiêm nhiệm = 1 seed row nhiều keys. */

export const INTAKE_LEAD_ROLE_KEYS = Object.freeze([
  'product_owner',
  'project_manager',
  'business_analyst',
]);

export const INTAKE_LEAD_LABEL_KEYS = Object.freeze({
  product_owner: 'adminTasks.wizardColPo',
  project_manager: 'adminTasks.wizardColPm',
  business_analyst: 'adminTasks.wizardColBa',
});

export function emptyIntakeSlots() {
  return {
    product_owner: null,
    project_manager: null,
    business_analyst: null,
  };
}

function slotUserId(slot) {
  return String(slot?.userId || '').trim();
}

/**
 * Merge 3 slot → seedMembers. Cùng user nhiều cột → 1 row, nhiều projectRoleKeys.
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

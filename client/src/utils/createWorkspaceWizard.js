/** Khớp ORG_TEXT_LIMITS.name ở organization-service. */
export const ORG_NAME_MAX = 120;
export const ORG_NAME_MIN = 2;
export const WORKSPACE_SLUG_MIN = 3;
export const WORKSPACE_STEP_COUNT = 5;

/** Khớp giới hạn slice() của normalizeHierarchyBlueprint ở organization-service. */
export const WORKSPACE_COUNT_LIMITS = Object.freeze({
  branch: { min: 1, max: 20 },
  divisionPerBranch: { min: 1, max: 20 },
  departmentPerDivision: { min: 1, max: 30 },
  teamPerDepartment: { min: 1, max: 30 },
});

function isCountInRange(value, { min, max }) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

function validateNameStep(form) {
  const name = String(form?.name || '').trim();
  if (!name) return 'organizations.orgNameRequired';
  if (name.length < ORG_NAME_MIN) return 'organizations.wizardErrNameMin';
  if (name.length > ORG_NAME_MAX) return 'organizations.wizardErrNameMax';
  return '';
}

function validateSlugStep(form) {
  const slug = String(form?.slug || '');
  return slug.length < WORKSPACE_SLUG_MIN ? 'organizations.workspaceSlugMin' : '';
}

function validateStructureStep(form) {
  const counts = form?.counts || {};
  const countsValid = Object.entries(WORKSPACE_COUNT_LIMITS).every(([key, range]) =>
    isCountInRange(counts[key], range)
  );
  if (!countsValid) return 'organizations.wizardErrCountRange';
  const names = Array.isArray(form?.structureNames) ? form.structureNames : [];
  if (names.some((name) => String(name || '').trim().length > ORG_NAME_MAX)) {
    return 'organizations.wizardErrNameMax';
  }
  return '';
}

const STEP_VALIDATORS = {
  1: validateNameStep,
  2: validateSlugStep,
  4: validateStructureStep,
};

/**
 * Kiểm tra một bước của wizard tạo workspace. Bước cuối kiểm tra lại toàn bộ để chặn submit.
 * @returns {{ ok: boolean, errorKey: string, step: number }}
 */
export function validateWorkspaceStep(step, form) {
  const steps = step >= WORKSPACE_STEP_COUNT ? [1, 2, 4] : [step];
  for (const current of steps) {
    const errorKey = STEP_VALIDATORS[current]?.(form) || '';
    if (errorKey) return { ok: false, errorKey, step: current };
  }
  return { ok: true, errorKey: '', step };
}

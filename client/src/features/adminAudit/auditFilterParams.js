export const AUDIT_ACTION_PATTERN = /^[a-z0-9_.:-]{1,64}$/;
export const AUDIT_RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const AUDIT_FILTER_MAX_LENGTH = 64;

export function normalizeAuditAction(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeAuditResourceId(value) {
  return String(value ?? '').trim();
}

/**
 * Builds GET /projects/audit-events filter params; empty values drop the param.
 * @returns {{ params: Record<string, string>, errors: { action?: boolean, resourceId?: boolean } }}
 */
export function buildAuditFilterParams({ resourceType, action, resourceId } = {}) {
  const params = {};
  const errors = {};

  const type = String(resourceType ?? '').trim();
  if (type) params.resourceType = type;

  const act = normalizeAuditAction(action);
  if (act) {
    if (AUDIT_ACTION_PATTERN.test(act)) params.action = act;
    else errors.action = true;
  }

  const rid = normalizeAuditResourceId(resourceId);
  if (rid) {
    if (AUDIT_RESOURCE_ID_PATTERN.test(rid)) params.resourceId = rid;
    else errors.resourceId = true;
  }

  return { params, errors };
}

export function hasAuditFilterErrors(errors) {
  return Boolean(errors?.action || errors?.resourceId);
}

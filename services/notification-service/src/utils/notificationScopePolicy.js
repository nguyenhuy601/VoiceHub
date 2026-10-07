const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

/**
 * Pure helpers for notification list / mark-all / delete-all scope.
 * omit / unknown scope → personal (backward-compat).
 */

function isObjectIdString(value) {
  return OBJECT_ID_RE.test(String(value || '').trim());
}

/**
 * @param {{ scope?: string, organizationId?: string }} raw
 * @param {{ defaultScope?: 'personal'|'organization' }} [opts]
 * @returns {{
 *   ok: true, scope: 'personal'|'organization', organizationId: string
 * } | {
 *   ok: false, status: number, errorCode: string, message: string
 * }}
 */
function resolveNotificationScope(raw = {}, opts = {}) {
  const defaultScope = opts.defaultScope === 'organization' ? 'organization' : 'personal';
  const rawScope = raw.scope != null && String(raw.scope).trim() !== ''
    ? String(raw.scope).trim().toLowerCase()
    : defaultScope;

  if (rawScope !== 'personal' && rawScope !== 'organization') {
    return {
      ok: false,
      status: 400,
      errorCode: 'NOTIFICATION_VALIDATION_ERROR',
      message: 'scope must be personal or organization',
    };
  }

  const organizationId = String(raw.organizationId || '').trim();

  if (rawScope === 'organization') {
    if (!organizationId) {
      return {
        ok: false,
        status: 400,
        errorCode: 'NOTIFICATION_ORG_REQUIRED',
        message: 'organizationId is required when scope=organization',
      };
    }
    if (!isObjectIdString(organizationId)) {
      return {
        ok: false,
        status: 400,
        errorCode: 'NOTIFICATION_VALIDATION_ERROR',
        message: 'organizationId is invalid',
      };
    }
    return { ok: true, scope: 'organization', organizationId };
  }

  return { ok: true, scope: 'personal', organizationId: '' };
}

function buildPersonalScopeFilter() {
  return {
    $and: [
      {
        $or: [
          { 'data.organizationId': { $exists: false } },
          { 'data.organizationId': null },
          { 'data.organizationId': '' },
        ],
      },
      {
        $or: [
          { 'data.workspaceId': { $exists: false } },
          { 'data.workspaceId': null },
          { 'data.workspaceId': '' },
        ],
      },
    ],
  };
}

function buildOrganizationScopeFilter(organizationId) {
  const oid = String(organizationId || '').trim();
  return {
    $or: [
      { 'data.organizationId': oid },
      { 'data.workspaceId': oid },
    ],
  };
}

/**
 * Mongo filter fragment for scoped bulk ops (mark-all / delete-all).
 * @param {'personal'|'organization'} scope
 * @param {string} [organizationId]
 */
function buildScopedUserFilter(userId, scope, organizationId = '') {
  const filter = { userId };
  if (scope === 'organization') {
    Object.assign(filter, buildOrganizationScopeFilter(organizationId));
  } else {
    Object.assign(filter, buildPersonalScopeFilter());
  }
  return filter;
}

module.exports = {
  isObjectIdString,
  resolveNotificationScope,
  buildPersonalScopeFilter,
  buildOrganizationScopeFilter,
  buildScopedUserFilter,
};

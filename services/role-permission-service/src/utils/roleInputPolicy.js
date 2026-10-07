const ROLE_SCOPES = new Set(['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PERSONAL']);

const ROLE_NAME_MAX = 120;
const ROLE_DESC_MAX = 1000;
const ROLE_PRIORITY_MIN = 0;
const ROLE_PRIORITY_MAX = 10000;
const ROLE_PERMISSIONS_MAX = 200;
const ROLE_RESOURCE_MAX = 100;
const ROLE_ACTIONS_MAX = 50;
const ROLE_ACTION_LEN_MAX = 64;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function fail(message) {
  return { ok: false, errorCode: 'ROLE_VALIDATION_ERROR', message };
}

function validatePermissions(permissions) {
  if (permissions === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(permissions)) {
    return fail('permissions must be an array');
  }
  if (permissions.length > ROLE_PERMISSIONS_MAX) {
    return fail(`permissions must have at most ${ROLE_PERMISSIONS_MAX} entries`);
  }
  const normalized = [];
  for (const entry of permissions) {
    if (!entry || typeof entry !== 'object') {
      return fail('each permission must be an object');
    }
    const resource = String(entry.resource || '').trim();
    if (!resource || resource.length > ROLE_RESOURCE_MAX) {
      return fail(`permission.resource must be 1–${ROLE_RESOURCE_MAX} characters`);
    }
    if (!Array.isArray(entry.actions)) {
      return fail('permission.actions must be an array');
    }
    if (entry.actions.length > ROLE_ACTIONS_MAX) {
      return fail(`permission.actions must have at most ${ROLE_ACTIONS_MAX} items`);
    }
    const actions = [];
    for (const a of entry.actions) {
      const s = String(a || '').trim();
      if (!s || s.length > ROLE_ACTION_LEN_MAX) {
        return fail(`each action must be 1–${ROLE_ACTION_LEN_MAX} characters`);
      }
      actions.push(s);
    }
    normalized.push({ resource, actions });
  }
  return { ok: true, value: normalized };
}

function validateSharedFields(body, { partial = false } = {}) {
  const value = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > ROLE_NAME_MAX) {
      return fail(`name must be 1–${ROLE_NAME_MAX} characters`);
    }
    value.name = name;
  }

  if (body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    if (description.length > ROLE_DESC_MAX) {
      return fail(`description must be at most ${ROLE_DESC_MAX} characters`);
    }
    value.description = description;
  }

  if (body.color !== undefined) {
    const color = String(body.color || '').trim();
    if (!COLOR_RE.test(color)) {
      return fail('color must be #RRGGBB');
    }
    value.color = color;
  }

  if (body.priority !== undefined) {
    const priority = body.priority;
    if (
      typeof priority !== 'number' ||
      !Number.isInteger(priority) ||
      priority < ROLE_PRIORITY_MIN ||
      priority > ROLE_PRIORITY_MAX
    ) {
      return fail(`priority must be an integer ${ROLE_PRIORITY_MIN}–${ROLE_PRIORITY_MAX}`);
    }
    value.priority = priority;
  }

  if (body.scope !== undefined) {
    const scope = String(body.scope || '').trim().toUpperCase();
    if (!ROLE_SCOPES.has(scope)) {
      return fail('scope is invalid');
    }
    value.scope = scope;
  }

  if (body.permissions !== undefined) {
    const perms = validatePermissions(body.permissions);
    if (!perms.ok) return perms;
    value.permissions = perms.value;
  }

  if (body.isDefault !== undefined) {
    value.isDefault = Boolean(body.isDefault);
  }

  return { ok: true, value };
}

function validateRoleCreateInput(body = {}) {
  return validateSharedFields(body, { partial: false });
}

function validateRoleUpdateInput(body = {}) {
  if (!body || typeof body !== 'object') {
    return fail('invalid body');
  }
  const keys = Object.keys(body);
  if (!keys.length) {
    return { ok: true, value: {} };
  }
  return validateSharedFields(body, { partial: true });
}

/**
 * User không được xóa / đổi tên role isDefault. Internal được phép.
 * @returns {null | { status, errorCode, message }}
 */
function assertRoleMutationAllowed({ role, update, isInternal, action }) {
  if (isInternal || !role?.isDefault) return null;
  if (action === 'delete') {
    return {
      status: 403,
      errorCode: 'ROLE_PROTECTED',
      message: 'Default roles cannot be deleted',
    };
  }
  if (action === 'update' && update && update.name !== undefined) {
    const next = String(update.name || '').trim();
    const current = String(role.name || '').trim();
    if (next && next !== current) {
      return {
        status: 403,
        errorCode: 'ROLE_PROTECTED',
        message: 'Default role names cannot be changed',
      };
    }
  }
  return null;
}

function canUseBlankLegacy({ isInternal, body }) {
  if (!isInternal) return false;
  return Boolean(body?.allowBlankLegacy);
}

function mapMongoDuplicateError(error) {
  if (error?.code === 11000 || String(error?.codeName || '') === 'DuplicateKey') {
    const err = new Error('Tên vai trò đã tồn tại trong tổ chức');
    err.statusCode = 409;
    err.errorCode = 'ROLE_NAME_EXISTS';
    return err;
  }
  return null;
}

function mapCastError(error) {
  const name = String(error?.name || '');
  if (name === 'CastError' || name === 'BSONError') {
    const err = new Error('Invalid id');
    err.statusCode = 400;
    err.errorCode = 'ROLE_VALIDATION_ERROR';
    return err;
  }
  return null;
}

module.exports = {
  ROLE_NAME_MAX,
  ROLE_DESC_MAX,
  ROLE_PRIORITY_MIN,
  ROLE_PRIORITY_MAX,
  ROLE_PERMISSIONS_MAX,
  validateRoleCreateInput,
  validateRoleUpdateInput,
  assertRoleMutationAllowed,
  canUseBlankLegacy,
  mapMongoDuplicateError,
  mapCastError,
};

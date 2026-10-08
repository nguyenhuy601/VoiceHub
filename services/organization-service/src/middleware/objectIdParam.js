const { orgFail } = require('../utils/orgApiError');

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

function isObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/** Handler cho `router.param(name, objectIdParam)` — chặn id sai trước khi chạm Mongo. */
function objectIdParam(req, res, next, value) {
  if (!isObjectIdString(value)) {
    return orgFail(res, 400, 'Mã định danh không hợp lệ.', 'ORG_INVALID_ID');
  }
  return next();
}

function registerObjectIdParams(router, names) {
  names.forEach((name) => router.param(name, objectIdParam));
}

/** `router.param` không chạy cho param nằm ở mount path (mergeParams) — kiểm trực tiếp req.params. */
function requireMountedObjectIds(names) {
  return function checkMountedObjectIds(req, res, next) {
    const invalid = names.some((name) => req.params[name] !== undefined && !isObjectIdString(req.params[name]));
    if (invalid) {
      return orgFail(res, 400, 'Mã định danh không hợp lệ.', 'ORG_INVALID_ID');
    }
    return next();
  };
}

module.exports = { objectIdParam, isObjectIdString, registerObjectIdParams, requireMountedObjectIds };

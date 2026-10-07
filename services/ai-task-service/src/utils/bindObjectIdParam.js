const { mongoose } = require('@enterprise/shared/config/mongo');

function isObjectIdString(value) {
  const s = String(value || '').trim();
  return Boolean(s) && mongoose.isValidObjectId(s);
}

/**
 * @param {import('express').Response} res
 * @param {unknown} value
 * @param {string} label
 * @returns {string|null}
 */
function requireObjectId(res, value, label = 'id') {
  const s = String(value || '').trim();
  if (!s || !mongoose.isValidObjectId(s)) {
    res.status(400).json({
      success: false,
      message: `${label} không hợp lệ`,
      errorCode: 'VALIDATION_INVALID_ID',
      messageUser: `${label} không hợp lệ`,
    });
    return null;
  }
  return s;
}

/**
 * @param {import('express').Router} router
 * @param {string} name
 * @param {string} [label]
 */
function bindObjectIdParam(router, name, label = name) {
  router.param(name, (req, res, next, val) => {
    const id = requireObjectId(res, val, label);
    if (!id) return undefined;
    req.params[name] = id;
    return next();
  });
}

/**
 * @param {import('express').Router} router
 * @param {string[]} names
 */
function bindObjectIdParams(router, names) {
  for (const name of names) {
    bindObjectIdParam(router, name);
  }
}

module.exports = {
  isObjectIdString,
  requireObjectId,
  bindObjectIdParam,
  bindObjectIdParams,
};

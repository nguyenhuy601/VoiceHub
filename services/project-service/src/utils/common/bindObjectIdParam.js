const { requireObjectId } = require('./validateInput');

/**
 * Bind express router.param so invalid ObjectIds return 400 before controllers/DB.
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
  bindObjectIdParam,
  bindObjectIdParams,
};

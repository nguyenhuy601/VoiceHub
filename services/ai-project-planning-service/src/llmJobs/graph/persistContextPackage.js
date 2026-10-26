/**
 * Persist / load context+facts blobs referenced by contextRef / factsRef.
 * Memory map for unit tests; optional Redis/file later.
 */

const { randomUUID } = require('crypto');

/** @type {Map<string, object>} */
const memoryPackages = new Map();

function resetContextPackagesForTests() {
  memoryPackages.clear();
}

/**
 * @param {object} packageData
 * @param {{ prefix?: string }} [opts]
 * @returns {string} ref id
 */
function persistContextPackage(packageData, opts = {}) {
  const ref = `${opts.prefix || 'ctx'}-${randomUUID()}`;
  memoryPackages.set(ref, packageData && typeof packageData === 'object' ? { ...packageData } : {});
  return ref;
}

/**
 * @param {string|null|undefined} ref
 * @param {NodeJS.ProcessEnv} [_env]
 */
function loadContextPackage(ref, _env = process.env) {
  const id = String(ref || '').trim();
  if (!id) return null;
  return memoryPackages.get(id) || null;
}

module.exports = {
  persistContextPackage,
  loadContextPackage,
  resetContextPackagesForTests,
};

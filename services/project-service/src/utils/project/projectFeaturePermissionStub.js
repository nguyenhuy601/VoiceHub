/**
 * Stub deny helpers for Wiki / Meeting / Release until those domains ship (Phase 2 surface).
 * Call from future controllers: assertFeaturePermission(resolved, 'wiki:edit').
 */
const { hasPermission, assertPermission } = require('../utils/projectPermissionMatrix');

const STUB_FEATURES = Object.freeze({
  wiki: ['wiki:view', 'wiki:edit'],
  meeting: ['meeting:view', 'meeting:create'],
  release: ['release:view', 'release:create'],
});

function assertFeaturePermission(permissions, permissionKey, featureLabel = 'feature') {
  assertPermission(
    permissions,
    permissionKey,
    `Không có quyền ${permissionKey} trên ${featureLabel} (Phase 2 RBAC)`
  );
}

function canAccessStubFeature(permissions, feature) {
  const keys = STUB_FEATURES[feature] || [];
  return keys.some((k) => hasPermission(permissions, k));
}

module.exports = {
  STUB_FEATURES,
  assertFeaturePermission,
  canAccessStubFeature,
};

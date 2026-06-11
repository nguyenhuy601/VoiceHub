function isTestUnlockEnabled() {
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    return false;
  }
  return String(process.env.RBAC_TEST_UNLOCK || '').trim().toLowerCase() === 'true';
}

function assertTestUnlockSafeForBoot() {
  if (
    String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' &&
    String(process.env.RBAC_TEST_UNLOCK || '').trim().toLowerCase() === 'true'
  ) {
    throw new Error('RBAC_TEST_UNLOCK cannot be enabled when NODE_ENV=production');
  }
}

module.exports = {
  isTestUnlockEnabled,
  assertTestUnlockSafeForBoot,
};

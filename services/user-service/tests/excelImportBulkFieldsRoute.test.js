const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * TC-EX-010 / RCA: Excel fail «Not authenticated» dù bootstrap 200.
 * Org gọi POST /internal/profile/:userId/bulk-fields — phải đăng ký TRƯỚC router.use(protect).
 */
describe('Excel import S2S bulk-fields route (TC-EX-010 RCA)', () => {
  const routesPath = path.join(__dirname, '../src/routes/user.routes.js');
  const orgClientPath = path.join(
    __dirname,
    '../../organization-service/src/clients/userProfileBulkImport.client.js'
  );

  it('qa-rca-route: org client targets bulk-fields path', () => {
    const src = fs.readFileSync(orgClientPath, 'utf8');
    assert.match(src, /\/internal\/profile\/\$\{[^}]+\}\/bulk-fields/);
  });

  it('qa-rca-route: user-service registers POST bulk-fields before protect', () => {
    const src = fs.readFileSync(routesPath, 'utf8');
    const bulkIdx = src.indexOf("'/internal/profile/:userId/bulk-fields'");
    const protectIdx = src.indexOf('router.use(protect)');
    assert.ok(bulkIdx > 0, 'missing bulk-fields route — causes 401 Not authenticated');
    assert.ok(protectIdx > bulkIdx, 'bulk-fields must be registered before protect middleware');
    assert.match(src, /internalServiceAuth/);
  });

  it('qa-rca-route: deactivate compensate path registered before protect', () => {
    const src = fs.readFileSync(routesPath, 'utf8');
    const deactIdx = src.indexOf("'/internal/profile/:userId/deactivate'");
    const protectIdx = src.indexOf('router.use(protect)');
    assert.ok(deactIdx > 0, 'missing deactivate route for Excel rollback compensate');
    assert.ok(protectIdx > deactIdx, 'deactivate must be before protect');
  });

  it('TC-EX-009: protect returns Not authenticated without token (message contract)', () => {
    const authMw = fs.readFileSync(
      path.join(__dirname, '../src/middleware/auth.js'),
      'utf8'
    );
    assert.match(authMw, /Not authenticated/);
  });
});

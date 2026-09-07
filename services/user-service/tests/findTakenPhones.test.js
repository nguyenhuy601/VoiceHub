const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { phoneBlindIndex } = require('@enterprise/shared/utils/fieldCrypto');

/**
 * Precheck SĐT Excel — contract service + route trước protect.
 */
describe('findTakenPhones contract', () => {
  it('service exports findTakenPhones', () => {
    const UserService = require('../src/services/user.service');
    assert.equal(typeof UserService.findTakenPhones, 'function');
  });

  it('returns [] for empty input without DB', async () => {
    const UserService = require('../src/services/user.service');
    assert.deepEqual(await UserService.findTakenPhones([]), []);
    assert.deepEqual(await UserService.findTakenPhones(null), []);
  });

  it('phoneBlindIndex is stable for same normalized phone', () => {
    const a = phoneBlindIndex('0901234567');
    const b = phoneBlindIndex('0901234567');
    assert.ok(a);
    assert.equal(a, b);
    assert.notEqual(a, phoneBlindIndex('0901234568'));
  });
});

describe('phones/taken S2S route (Excel preview precheck)', () => {
  const routesPath = path.join(__dirname, '../src/routes/user.routes.js');
  const orgClientPath = path.join(
    __dirname,
    '../../organization-service/src/clients/phoneLookup.client.js'
  );

  it('org client targets phones/taken path', () => {
    const src = fs.readFileSync(orgClientPath, 'utf8');
    assert.match(src, /\/internal\/phones\/taken/);
  });

  it('user-service registers POST phones/taken before protect', () => {
    const src = fs.readFileSync(routesPath, 'utf8');
    const takenIdx = src.indexOf("'/internal/phones/taken'");
    const protectIdx = src.indexOf('router.use(protect)');
    assert.ok(takenIdx > 0, 'missing phones/taken route');
    assert.ok(protectIdx > takenIdx, 'phones/taken must be registered before protect');
    assert.match(src, /internalFindTakenPhones/);
  });
});

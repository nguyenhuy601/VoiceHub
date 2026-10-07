const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateRoleCreateInput,
  validateRoleUpdateInput,
  assertRoleMutationAllowed,
  canUseBlankLegacy,
  mapMongoDuplicateError,
  ROLE_NAME_MAX,
} = require('../src/utils/roleInputPolicy');

describe('roleInputPolicy', () => {
  it('validateRoleCreateInput: name rỗng / quá dài / color sai / priority không integer', () => {
    assert.equal(validateRoleCreateInput({ name: '' }).ok, false);
    assert.equal(validateRoleCreateInput({ name: 'a'.repeat(ROLE_NAME_MAX + 1) }).ok, false);
    assert.equal(validateRoleCreateInput({ name: 'ok', color: 'red' }).ok, false);
    assert.equal(validateRoleCreateInput({ name: 'ok', priority: 1.5 }).ok, false);
    assert.equal(validateRoleCreateInput({ name: 'ok', priority: -1 }).ok, false);
    assert.equal(validateRoleCreateInput({ name: 'ok', priority: 10001 }).ok, false);
    const ok = validateRoleCreateInput({
      name: '  Dev  ',
      color: '#abcdef',
      priority: 80,
      permissions: [{ resource: 'task', actions: ['view'] }],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.name, 'Dev');
  });

  it('permissions string hoặc >200 phần tử → ROLE_VALIDATION_ERROR', () => {
    assert.equal(validateRoleUpdateInput({ permissions: 'read' }).ok, false);
    assert.equal(
      validateRoleUpdateInput({
        permissions: Array.from({ length: 201 }, () => ({ resource: 'x', actions: ['a'] })),
      }).ok,
      false
    );
  });

  it('assertRoleMutationAllowed: user không xóa/đổi tên isDefault; internal được phép', () => {
    const role = { isDefault: true, name: 'Admin' };
    assert.equal(
      assertRoleMutationAllowed({ role, isInternal: false, action: 'delete' })?.errorCode,
      'ROLE_PROTECTED'
    );
    assert.equal(
      assertRoleMutationAllowed({
        role,
        update: { name: 'Other' },
        isInternal: false,
        action: 'update',
      })?.errorCode,
      'ROLE_PROTECTED'
    );
    assert.equal(
      assertRoleMutationAllowed({
        role,
        update: { description: 'x' },
        isInternal: false,
        action: 'update',
      }),
      null
    );
    assert.equal(
      assertRoleMutationAllowed({ role, isInternal: true, action: 'delete' }),
      null
    );
  });

  it('canUseBlankLegacy chỉ internal', () => {
    assert.equal(canUseBlankLegacy({ isInternal: false, body: { allowBlankLegacy: true } }), false);
    assert.equal(canUseBlankLegacy({ isInternal: true, body: { allowBlankLegacy: true } }), true);
    assert.equal(canUseBlankLegacy({ isInternal: true, body: {} }), false);
  });

  it('mapMongoDuplicateError → 409 ROLE_NAME_EXISTS', () => {
    const mapped = mapMongoDuplicateError({ code: 11000 });
    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.errorCode, 'ROLE_NAME_EXISTS');
  });
});

describe('roleInputPolicy source-contract', () => {
  it('authenticateOrInternal dùng compareGatewayToken; app body limit 512kb/100kb', () => {
    const root = path.join(__dirname, '..', 'src');
    const auth = fs.readFileSync(path.join(root, 'middleware', 'authenticateOrInternal.js'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(auth, /compareGatewayToken/);
    assert.match(app, /limit:\s*'512kb'/);
    assert.match(app, /limit:\s*'100kb'/);
  });

  it('controller validate create/update; service assertRoleMutationAllowed + canUseBlankLegacy', () => {
    const root = path.join(__dirname, '..', 'src');
    const ctl = fs.readFileSync(path.join(root, 'controllers', 'role.controller.js'), 'utf8');
    const svc = fs.readFileSync(path.join(root, 'services', 'role.service.js'), 'utf8');
    assert.match(ctl, /validateRoleCreateInput/);
    assert.match(ctl, /validateRoleUpdateInput/);
    assert.match(svc, /assertRoleMutationAllowed/);
    assert.match(svc, /canUseBlankLegacy/);
  });
});

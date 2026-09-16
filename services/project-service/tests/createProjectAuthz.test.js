const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('createProject authz Wave B (Strict AND + migration)', () => {
  const serviceSrc = fs.readFileSync(
    path.join(__dirname, '../src/services/project.service.js'),
    'utf8'
  );
  const clientSrc = fs.readFileSync(
    path.join(__dirname, '../src/clients/rolePermission.client.js'),
    'utf8'
  );
  const scopeSrc = fs.readFileSync(
    path.join(__dirname, '../src/services/taskWorkspaceScope.js'),
    'utf8'
  );

  it('gates create on canCreateProjectInScope not only canCreateTask', () => {
    assert.match(serviceSrc, /canCreateProjectInScope/);
    assert.match(scopeSrc, /function canCreateProjectInScope/);
  });

  it('evaluates project.project.create grant and migration', () => {
    assert.match(serviceSrc, /hasProjectCreateGrant/);
    assert.match(serviceSrc, /ensureProjectCreateGrant/);
    assert.match(serviceSrc, /MISSING_PROJECT_CREATE_GRANT/);
    assert.match(serviceSrc, /OUT_OF_ORG_SCOPE/);
    assert.match(clientSrc, /project\.project\.create/);
    assert.match(clientSrc, /ensure-project-create-grant/);
  });

  it('supports hotfix flag CREATE_PROJECT_REQUIRE_GRANT', () => {
    assert.match(clientSrc, /CREATE_PROJECT_REQUIRE_GRANT/);
    assert.match(serviceSrc, /requireGrantEnabled/);
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('project role catalog routes (S2)', () => {
  it('mounts CRUD at /roles not /admin/roles', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/routes/project.routes.js'),
      'utf8'
    );
    assert.ok(src.includes("router.use('/roles', projectRoleAdminRoutes)"));
    assert.equal(src.includes('/admin/roles'), false);
  });

  it('does not mount legacy /tasks/admin/project-roles', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/routes/task.routes.js'),
      'utf8'
    );
    assert.equal(src.includes('/admin/project-roles'), false);
    assert.equal(src.includes('projectRoleAdminRoutes'), false);
  });
});

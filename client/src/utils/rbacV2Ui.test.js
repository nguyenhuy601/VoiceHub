import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countMasterGrants,
  flattenCatalogTree,
  grantKeysFromDraft,
  grantStripOptionsForTemplate,
  grantsDraftFromList,
  isOrgCloneableTemplate,
  isProjectMasterPermission,
  isProjectPackTemplateKey,
  isToggleableMasterGrant,
  ORG_ALLOWED_PROJECT_GRANTS,
} from './rbacV2Ui.js';

test('isProjectMasterPermission', () => {
  assert.equal(isProjectMasterPermission('project.task.view'), true);
  assert.equal(isProjectMasterPermission('organization.team.create'), false);
});

test('isOrgCloneableTemplate uses projectPackTemplateKeys', () => {
  const catalog = { projectPackTemplateKeys: ['project_admin'] };
  assert.equal(isOrgCloneableTemplate({ key: 'project_admin', grants: [] }, catalog), false);
  assert.equal(isOrgCloneableTemplate({ key: 'organization_admin', grants: [] }, catalog), true);
});

test('isOrgCloneableTemplate allows Wave B create-only on org templates', () => {
  const catalog = { projectPackTemplateKeys: ['project_manager'] };
  assert.equal(
    isOrgCloneableTemplate(
      { key: 'organization_admin', grants: ['organization.employee.view', 'project.project.create'] },
      catalog
    ),
    true
  );
  assert.equal(
    isOrgCloneableTemplate(
      { key: 'custom', grants: ['organization.employee.view', 'project.task.view'] },
      catalog
    ),
    false
  );
});

test('isOrgCloneableTemplate fail-closed on project.* grants when keys missing', () => {
  assert.equal(
    isOrgCloneableTemplate({ key: 'custom', grants: ['project.task.view'] }, {}),
    false
  );
  assert.equal(
    isOrgCloneableTemplate({ key: 'viewer', grants: ['organization.team.view'] }, {}),
    true
  );
  assert.equal(
    isOrgCloneableTemplate({ key: 'viewer', grants: ['project.project.create'] }, {}),
    true
  );
});

test('flattenCatalogTree and countMasterGrants', () => {
  const rows = flattenCatalogTree([
    {
      key: 'organization',
      label: 'ORG',
      modules: [
        {
          key: 'organization.team',
          label: 'Team',
          permissions: [{ key: 'organization.team.view', action: 'view', label: 'view' }],
        },
      ],
    },
  ]);
  assert.equal(rows[0].key, 'organization.team.view');
  assert.equal(countMasterGrants(['organization.team.view', 'organization.team.view']), 1);
});

test('grantsDraftFromList org mode strips project.* except create', () => {
  const opts = { stripProject: true, stripProjectExcept: [...ORG_ALLOWED_PROJECT_GRANTS] };
  const draft = grantsDraftFromList(
    ['organization.team.view', 'project.task.view', 'project.project.create'],
    opts
  );
  assert.equal(draft['organization.team.view'], true);
  assert.equal(draft['project.project.create'], true);
  assert.equal(draft['project.task.view'], undefined);
  assert.deepEqual(
    grantKeysFromDraft(
      {
        'organization.team.view': true,
        'project.task.create': true,
        'project.project.create': true,
      },
      opts
    ).sort(),
    ['organization.team.view', 'project.project.create']
  );
});

test('grantsDraftFromList projectPack mode preserves project.*', () => {
  const draft = grantsDraftFromList(
    ['organization.team.view', 'project.task.view', 'project.project.create'],
    { stripProject: false }
  );
  assert.equal(draft['project.task.view'], true);
  assert.equal(draft['project.project.create'], true);
  assert.deepEqual(
    grantKeysFromDraft(
      { 'project.task.view': true, 'organization.team.view': true },
      { stripProject: false }
    ).sort(),
    ['organization.team.view', 'project.task.view']
  );
});

test('grantStripOptionsForTemplate dual-mode', () => {
  const catalog = { projectPackTemplateKeys: ['project_manager', 'project_admin'] };
  assert.equal(isProjectPackTemplateKey('project_manager', catalog), true);
  assert.deepEqual(grantStripOptionsForTemplate('project_manager', catalog), { stripProject: false });
  assert.deepEqual(grantStripOptionsForTemplate('organization_admin', catalog), {
    stripProject: true,
    stripProjectExcept: ['project.project.create'],
  });
  assert.deepEqual(grantStripOptionsForTemplate('department_manager', catalog), {
    stripProject: true,
    stripProjectExcept: ['project.project.create'],
  });
});

test('isToggleableMasterGrant', () => {
  assert.equal(isToggleableMasterGrant('organization.team.view', { isProjectPack: false }), true);
  assert.equal(isToggleableMasterGrant('project.project.create', { isProjectPack: false }), true);
  assert.equal(isToggleableMasterGrant('project.task.view', { isProjectPack: false }), false);
  assert.equal(isToggleableMasterGrant('project.task.view', { isProjectPack: true }), true);
});

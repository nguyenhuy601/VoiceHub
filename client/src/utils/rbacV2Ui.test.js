import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countMasterGrants,
  flattenCatalogTree,
  grantKeysFromDraft,
  grantsDraftFromList,
  isOrgCloneableTemplate,
  isProjectMasterPermission,
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

test('isOrgCloneableTemplate fail-closed on project.* grants when keys missing', () => {
  assert.equal(
    isOrgCloneableTemplate({ key: 'custom', grants: ['project.task.view'] }, {}),
    false
  );
  assert.equal(
    isOrgCloneableTemplate({ key: 'viewer', grants: ['organization.team.view'] }, {}),
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

test('grantsDraftFromList strips project.*', () => {
  const draft = grantsDraftFromList(['organization.team.view', 'project.task.view']);
  assert.equal(draft['organization.team.view'], true);
  assert.equal(draft['project.task.view'], undefined);
  assert.deepEqual(grantKeysFromDraft({ 'organization.team.view': true, 'project.task.create': true }), [
    'organization.team.view',
  ]);
});

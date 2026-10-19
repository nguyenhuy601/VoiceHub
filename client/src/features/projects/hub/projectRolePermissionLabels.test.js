import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTranslator } from '../../../locales/buildStrings.js';
import {
  PROJECT_PERM_GROUP_IDS,
  PROJECT_PERM_KEYS_FOR_LABELS,
} from './projectRolePermissionGroups.js';
import {
  labelProjectPermGroup,
  labelProjectPermission,
  projectPermLocaleKey,
} from './projectRolePermissionLabels.js';

describe('projectRolePermissionLabels', () => {
  const tVi = createTranslator('vi');
  const tEn = createTranslator('en');

  it('maps colon keys to locale segments', () => {
    assert.equal(projectPermLocaleKey('project:view'), 'project_view');
    assert.equal(projectPermLocaleKey('delivery_phase:change'), 'delivery_phase_change');
  });

  it('covers every group id in vi and en', () => {
    for (const id of PROJECT_PERM_GROUP_IDS) {
      const vi = labelProjectPermGroup(id, tVi);
      const en = labelProjectPermGroup(id, tEn);
      assert.notEqual(vi, id, `missing vi group ${id}`);
      assert.notEqual(en, id, `missing en group ${id}`);
      assert.notEqual(vi, `adminRbac.projPermGroup.${id}`);
      assert.notEqual(en, `adminRbac.projPermGroup.${id}`);
    }
  });

  it('covers every permission key in vi and en', () => {
    for (const key of PROJECT_PERM_KEYS_FOR_LABELS) {
      const vi = labelProjectPermission(key, tVi);
      const en = labelProjectPermission(key, tEn);
      const action = key.includes(':') ? key.split(':').pop() : key;
      assert.notEqual(vi, key, `vi fell through to raw key ${key}`);
      assert.notEqual(en, key, `en fell through to raw key ${key}`);
      assert.notEqual(vi, action, `vi fell through to action ${key}`);
      assert.notEqual(en, action, `en fell through to action ${key}`);
      assert.notEqual(vi, `adminRbac.projPerm.${projectPermLocaleKey(key)}`);
      assert.notEqual(en, `adminRbac.projPerm.${projectPermLocaleKey(key)}`);
    }
  });

  it('falls back to action when locale missing', () => {
    const t = () => undefined;
    assert.equal(labelProjectPermission('project:view', t), 'view');
  });
});

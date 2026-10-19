import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTranslator } from '../../locales/buildStrings.js';
import {
  CATALOG_CATEGORY_KEYS,
  CATALOG_MODULE_KEYS,
  CATALOG_PERMISSION_KEYS_FOR_LABELS,
  labelCategory,
  labelModule,
  labelPermission,
} from './permissionCatalogLabels.js';

describe('permissionCatalogLabels', () => {
  const tVi = createTranslator('vi');
  const tEn = createTranslator('en');

  it('covers every category with a non-path label (vi)', () => {
    for (const key of CATALOG_CATEGORY_KEYS) {
      const label = labelCategory(key, tVi);
      assert.notEqual(label, key, `missing permCat.${key}`);
      assert.notEqual(label, `adminDomains.rbac.permCat.${key}`);
    }
  });

  it('covers every module with a non-path label (vi)', () => {
    for (const key of CATALOG_MODULE_KEYS) {
      const label = labelModule(key, tVi);
      assert.notEqual(label, key, `missing permMod.${key}`);
      assert.notEqual(label, `adminDomains.rbac.permMod.${key}`);
    }
  });

  it('covers every visible permission key with a descriptive label (vi)', () => {
    for (const key of CATALOG_PERMISSION_KEYS_FOR_LABELS) {
      const label = labelPermission(key, tVi);
      const action = key.split('.').pop();
      assert.notEqual(label, key, `missing perm.${key}`);
      assert.notEqual(label, `adminDomains.rbac.perm.${key}`);
      assert.notEqual(label, action, `perm.${key} still falls back to action`);
    }
  });

  it('covers every visible permission key in en', () => {
    for (const key of CATALOG_PERMISSION_KEYS_FOR_LABELS) {
      const label = labelPermission(key, tEn);
      const action = key.split('.').pop();
      assert.notEqual(label, action, `en perm.${key} still falls back to action`);
      assert.notEqual(label, `adminDomains.rbac.perm.${key}`);
    }
  });

  it('falls back to action when permission string is missing', () => {
    const t = () => undefined;
    assert.equal(labelPermission('organization.employee.view', t), 'view');
  });

  it('falls back to raw key for unknown category', () => {
    assert.equal(labelCategory('unknown_cat', tVi), 'unknown_cat');
  });
});

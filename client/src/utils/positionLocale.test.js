import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isRedundantPositionAliasRow,
  localizedPositionLabel,
  resolvePositionCanonicalKey,
} from './positionLocale.js';

const tVi = (path) =>
  ({
    'adminRbac.positionLabel.CEO': 'Tổng giám đốc',
    'adminRbac.positionLabel.PRODUCT_MANAGER': 'Quản lý sản phẩm',
    'adminRbac.positionLabel.BUSINESS_ANALYST': 'Phân tích nghiệp vụ',
  })[path] || path;

const tEn = (path) =>
  ({
    'adminRbac.positionLabel.CEO': 'Chief Executive Officer',
    'adminRbac.positionLabel.PRODUCT_MANAGER': 'Product Manager',
  })[path] || path;

describe('positionLocale', () => {
  it('canonical key UPPER', () => {
    assert.equal(resolvePositionCanonicalKey('product_manager'), 'PRODUCT_MANAGER');
    assert.equal(resolvePositionCanonicalKey('BUSINESS_ANALYST'), 'BUSINESS_ANALYST');
  });

  it('localized theo locale — không tin title EN khi UI VI', () => {
    assert.equal(localizedPositionLabel('CEO', 'Chief Executive Officer', tVi), 'Tổng giám đốc');
    assert.equal(
      localizedPositionLabel('PRODUCT_MANAGER', 'Product Manager', tVi),
      'Quản lý sản phẩm'
    );
    assert.equal(localizedPositionLabel('CEO', 'Tổng giám đốc', tEn), 'Chief Executive Officer');
  });

  it('ẩn trùng lowercase/UPPER', () => {
    const rows = [
      { key: 'business_analyst', title: 'Business Analyst' },
      { key: 'BUSINESS_ANALYST', title: 'Business Analyst' },
      { key: 'CEO', title: 'Chief Executive Officer' },
    ];
    assert.equal(isRedundantPositionAliasRow(rows[0], rows), false);
    assert.equal(isRedundantPositionAliasRow(rows[1], rows), true);
    assert.equal(isRedundantPositionAliasRow(rows[2], rows), false);
  });
});

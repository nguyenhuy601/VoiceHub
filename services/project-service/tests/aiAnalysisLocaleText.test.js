'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  foldVi,
  detectCrudFromText,
  detectEntityCanonicalNames,
  hasAmbiguousLanguage,
} = require('../src/utils/aiAnalysis/aiAnalysisLocaleText');

describe('aiAnalysisLocaleText', () => {
  it('foldVi strips diacritics', () => {
    assert.equal(foldVi('Quản lý'), 'quan ly');
    assert.equal(foldVi('Đăng ký'), 'dang ky');
  });

  it('crud: Quản lý hồ sơ nhân viên → create+read+update (not delete)', () => {
    const crud = detectCrudFromText('Quản lý hồ sơ nhân viên');
    assert.equal(crud.create, true);
    assert.equal(crud.read, true);
    assert.equal(crud.update, true);
    assert.equal(crud.delete, false);
  });

  it('crud: quan ly (no diacritics) same policy', () => {
    const crud = detectCrudFromText('quan ly ho so nhan vien');
    assert.equal(crud.create, true);
    assert.equal(crud.read, true);
    assert.equal(crud.update, true);
    assert.equal(crud.delete, false);
  });

  it('crud: Xem danh sách → read only', () => {
    const crud = detectCrudFromText('Xem danh sách nhân viên');
    assert.equal(crud.create, false);
    assert.equal(crud.read, true);
    assert.equal(crud.update, false);
    assert.equal(crud.delete, false);
  });

  it('crud: Thêm / Sửa / Xóa map C/U/D', () => {
    assert.equal(detectCrudFromText('Thêm nhân viên mới').create, true);
    assert.equal(detectCrudFromText('Sửa thông tin hồ sơ').update, true);
    assert.equal(detectCrudFromText('Xóa bản ghi cũ').delete, true);
  });

  it('entity: nhân viên / hồ sơ → User', () => {
    const names = detectEntityCanonicalNames('Quản lý hồ sơ nhân viên');
    assert.ok(names.includes('User'));
  });

  it('ambiguous: chưa xác định / cần làm rõ / v.v.', () => {
    assert.equal(hasAmbiguousLanguage('Trạng thái chưa xác định'), true);
    assert.equal(hasAmbiguousLanguage('Cần làm rõ quy tắc'), true);
    assert.equal(hasAmbiguousLanguage('Các trường hợp v.v.'), true);
    assert.equal(hasAmbiguousLanguage('Requirement TBD'), true);
    assert.equal(hasAmbiguousLanguage('Xem danh sách nhân viên'), false);
  });
});

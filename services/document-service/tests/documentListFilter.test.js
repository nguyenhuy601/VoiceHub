const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildDocumentListFilter } = require('../src/utils/documentListFilter');

const USER = '507f1f77bcf86cd799439011';
const ORG = '507f1f77bcf86cd799439012';
const PROJECT = '507f1f77bcf86cd799439013';

describe('buildDocumentListFilter', () => {
  it('thiếu projectId → không gắn field (compat)', () => {
    const { filter, error } = buildDocumentListFilter({ organizationId: ORG }, USER);
    assert.equal(error, undefined);
    assert.equal(filter.organizationId, ORG);
    assert.equal(filter.projectId, undefined);
    assert.equal(filter.isActive, true);
  });

  it('projectId hợp lệ → lọc additive', () => {
    const { filter, error } = buildDocumentListFilter(
      { organizationId: ORG, projectId: PROJECT },
      USER
    );
    assert.equal(error, undefined);
    assert.equal(filter.projectId, PROJECT);
    assert.equal(filter.organizationId, ORG);
  });

  it('projectId không hợp lệ → 400', () => {
    const { filter, error } = buildDocumentListFilter({ projectId: 'not-an-id' }, USER);
    assert.equal(filter, null);
    assert.equal(error.statusCode, 400);
  });

  it('không org/server/uploadedBy → uploadedBy = user', () => {
    const { filter } = buildDocumentListFilter({}, USER);
    assert.equal(filter.uploadedBy, USER);
  });

  it('uploadedBy khác user → 403', () => {
    const { error } = buildDocumentListFilter({ uploadedBy: ORG }, USER);
    assert.equal(error.statusCode, 403);
  });
});

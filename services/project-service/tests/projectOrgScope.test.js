/**
 * Unit — Project org-level scope (không load project.service — tránh env).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveBoardScope } = require('../src/utils/boardIdentityPatch');

describe('resolveBoardScope organization', () => {
  it('defaults to organization when no unit scope', () => {
    const next = resolveBoardScope({
      organizationId: '64a1b2c3d4e5f67890123456',
    });
    assert.equal(next.scopeType, 'organization');
    assert.equal(next.scopeId, '64a1b2c3d4e5f67890123456');
  });

  it('still parses legacy department for dual-read', () => {
    const next = resolveBoardScope({
      scopeType: 'department',
      scopeId: '64a1b2c3d4e5f67890123499',
    });
    assert.equal(next.scopeType, 'department');
    assert.equal(next.scopeId, '64a1b2c3d4e5f67890123499');
  });
});

describe('Project model org scope', () => {
  it('enum includes organization and defaults to it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/models/Project.js'), 'utf8');
    assert.match(src, /'organization'/);
    assert.match(src, /default:\s*'organization'/);
  });
});

describe('createProject maps to organization', () => {
  it('service forces organization scope on create', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/services/project.service.js'),
      'utf8'
    );
    assert.match(src, /scopeType:\s*'organization'/);
    assert.match(src, /legacy unit scope ignored/);
  });
});

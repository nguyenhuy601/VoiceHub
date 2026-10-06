const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Source-contract: org-default ProjectRole upsert must not put projectId
 * on both $set and $setOnInsert (Mongo: conflict at 'projectId').
 */
describe('ensureOrgProjectRoles upsert operators', () => {
  it('does not put projectId on $set when $setOnInsert already has it', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/projectTeam.service.js'),
      'utf8'
    );
    const start = src.indexOf('async function ensureOrgProjectRoles');
    const end = src.indexOf('async function getRoleByKey');
    assert.ok(start >= 0, 'ensureOrgProjectRoles not found');
    assert.ok(end > start, 'getRoleByKey must follow ensureOrgProjectRoles');
    const fn = src.slice(start, end);

    const upsertMatch = fn.match(
      /findOneAndUpdate\(\s*orgDefaultFilter[\s\S]*?\$set:\s*\{([^}]*)\}[\s\S]*?\$setOnInsert:\s*\{([^}]*)\}/
    );
    assert.ok(upsertMatch, 'org-default findOneAndUpdate $set/$setOnInsert not found');
    const setBody = upsertMatch[1];
    const setOnInsertBody = upsertMatch[2];
    assert.match(setOnInsertBody, /projectId\s*:/, '$setOnInsert must keep projectId');
    assert.doesNotMatch(setBody, /projectId\s*:/, '$set must not include projectId');
  });
});

describe('setUserProjectRoles clearAllRoles', () => {
  it('has explicit clearAllRoles wipe path (empty keys default remains no-op)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/projectTeam.service.js'),
      'utf8'
    );
    const start = src.indexOf('async function setUserProjectRoles');
    assert.ok(start >= 0, 'setUserProjectRoles not found');
    const fn = src.slice(start, start + 14000);

    assert.match(fn, /clearAllRoles\s*=\s*false/, 'clearAllRoles param default false');
    assert.match(
      fn,
      /if\s*\(\s*clearAllRoles\s*\)\s*\{[\s\S]*?ProjectMembership\.deleteMany\(\s*\{\s*projectId:\s*pid,\s*userId/,
      'clearAllRoles must deleteMany memberships'
    );
    assert.match(
      fn,
      /TaskBoardMember\.deleteMany/,
      'clearAllRoles must drop board ACL so migrate cannot re-seed roles'
    );
    assert.match(
      fn,
      /\/\/ ACL-only payload[\s\S]*?if\s*\(\s*!resolvedKeys\.length\s*\)/,
      'empty keys still guarded'
    );
  });
});

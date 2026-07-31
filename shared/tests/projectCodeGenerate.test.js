const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectCodeBase,
  allocateUniqueProjectCode,
  deptKeyword,
  nameKeyword,
} = require('../utils/projectCodeGenerate');

describe('projectCodeGenerate', () => {
  it('T1: VoiceHub Q2 + Phòng IT + DEP + due → DEP-IT-…-20260723', () => {
    const code = buildProjectCodeBase({
      title: 'VoiceHub Q2',
      scopeType: 'department',
      scopeLabel: 'Phòng IT',
      dueDate: '2026-07-23',
    });
    assert.match(code, /^DEP-/);
    assert.ok(code.includes('-IT-'), code);
    assert.ok(code.includes('VOICEHUB'), code);
    assert.ok(code.endsWith('-20260723'), code);
  });

  it('deptKeyword: short last token', () => {
    assert.equal(deptKeyword('Phòng IT'), 'IT');
    assert.equal(deptKeyword(''), 'UNIT');
  });

  it('nameKeyword: first two tokens', () => {
    assert.equal(nameKeyword('VoiceHub Q2'), 'VOICEHUBQ2');
  });

  it('T2: collision → -2', () => {
    const base = 'DEP-IT-VOICEHUBQ2-20260723';
    assert.equal(allocateUniqueProjectCode(base, []), base);
    assert.equal(allocateUniqueProjectCode(base, [base]), `${base}-2`);
    assert.equal(allocateUniqueProjectCode(base, [base, `${base}-2`]), `${base}-3`);
  });

  it('scopeType organization → ORG', () => {
    const code = buildProjectCodeBase({
      title: 'ERP',
      scopeType: 'organization',
      scopeLabel: 'ORG',
      now: new Date('2026-01-15T12:00:00'),
    });
    assert.match(code, /^ORG-/);
  });

  it('scopeType team → TEAM', () => {
    const code = buildProjectCodeBase({
      title: 'Alpha',
      scopeType: 'team',
      scopeLabel: 'Core',
      now: new Date('2026-01-15T12:00:00'),
    });
    assert.match(code, /^TEAM-CORE-ALPHA-20260115$/);
  });
});

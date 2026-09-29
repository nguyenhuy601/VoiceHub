/**
 * G4 normalize + signals — structured fields first.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeFr } = require('../src/engines/g4/normalize');
const { extractFrSignals } = require('../src/engines/g4/extractSignals');
const { buildSemanticPrompt } = require('../src/engines/g4/semanticProjection');

describe('g4NormalizeFields', () => {
  it('reads module from moduleLabel', () => {
    const row = normalizeFr({
      externalId: 'CR-001',
      name: 'Search',
      moduleLabel: 'Attendance',
      actor: 'Student',
      acceptanceCriteria: 'Listed',
      priority: 'High',
    });
    assert.equal(row.id, 'CR-001');
    assert.equal(row.module, 'Attendance');
    assert.equal(row.actorsRaw, 'Student');
    assert.equal(row.ac, 'Listed');
  });

  it('prefers actor field over regex inventing campus-specific actors', () => {
    const fr = normalizeFr({
      externalId: 'CR-002',
      name: 'Export report',
      moduleLabel: 'Reports',
      actor: 'Manager',
      acceptanceCriteria: 'CSV downloaded',
    });
    const signals = extractFrSignals(fr);
    assert.deepEqual(signals.actors, ['Manager']);
    assert.equal(signals.module, 'Reports');
    assert.equal(signals.acceptanceCriteria, 'CSV downloaded');
  });

  it('puts structured fields into the semantic prompt', () => {
    const prompt = buildSemanticPrompt([
      {
        frId: 'CR-001',
        name: 'Login',
        description: '',
        module: 'Auth',
        actors: ['Student'],
        acceptanceCriteria: 'Token issued',
        priority: 'High',
        text: 'Login',
        actions: [],
        objects: [],
        fields: [],
        flags: [],
      },
    ]);
    assert.match(prompt, /"moduleLabel":"Auth"/);
    assert.match(prompt, /"actor":"Student"/);
    assert.match(prompt, /"acceptanceCriteria":"Token issued"/);
    assert.match(prompt, /"priority":"High"/);
  });
});

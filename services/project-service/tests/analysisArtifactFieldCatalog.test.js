const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getArtifactFieldCatalog,
  listCatalogKinds,
  listEditableKeys,
  pickAllowedArtifactUpdate,
  resolveArtifactDraftUpdate,
  EDITABLE_STATUSES,
} = require('../src/constants/analysisArtifactFieldCatalog');

describe('analysisArtifactFieldCatalog (all RA kinds)', () => {
  it('lists all analysis kinds', () => {
    assert.deepEqual(listCatalogKinds().sort(), [
      'BG',
      'BPM',
      'BR',
      'FR',
      'NFR',
      'SCOPE',
      'UC',
    ]);
  });

  it('FR catalog includes workbook-sourced structured keys', () => {
    const fr = getArtifactFieldCatalog('FR');
    assert.ok(fr);
    const keys = fr.structured.map((f) => f.key);
    assert.ok(keys.includes('level'));
    assert.ok(keys.includes('acceptanceCriteria'));
    assert.ok(keys.includes('mainBehavior'));
    assert.ok(keys.includes('dataEntities'));
    assert.ok(keys.includes('relatedUcKeys'));
    assert.ok(keys.includes('brIds'));
    assert.ok(keys.includes('sourceReference'));
    assert.ok(keys.includes('traceRelationship'));
    assert.ok(!keys.includes('suggestedSkills'));
    assert.ok(!keys.includes('estimateHours'));
    assert.ok(fr.topLevel.some((f) => f.key === 'title' && f.required));
  });

  it('UC catalog matches seed keys (alternativeFlow singular + BA fields)', () => {
    const uc = getArtifactFieldCatalog('uc');
    assert.ok(uc);
    const keys = uc.structured.map((f) => f.key);
    for (const k of [
      'actor',
      'precondition',
      'mainFlow',
      'relatedFrKeys',
      'alternativeFlow',
      'exceptionFlow',
      'secondaryActor',
      'goal',
      'postconditions',
    ]) {
      assert.ok(keys.includes(k), `missing ${k}`);
    }
  });

  it('UC accepts seed alternativeFlow; rejects unknown AI key', () => {
    const r = pickAllowedArtifactUpdate({
      kind: 'UC',
      status: 'draft',
      body: {
        title: 'Login UC',
        structured: {
          alternativeFlow: 'Alt path',
          suggestedSkills: ['x'],
        },
      },
    });
    assert.equal(r.allowed, true);
    assert.equal(r.structured.alternativeFlow, 'Alt path');
    assert.deepEqual(r.rejectedStructured, ['suggestedSkills']);
  });

  it('SCOPE/BG/BR/BPM/NFR catalogs expose workbook/seed keys', () => {
    assert.ok(getArtifactFieldCatalog('SCOPE').structured.some((f) => f.key === 'scopeType'));
    assert.ok(getArtifactFieldCatalog('BG').structured.some((f) => f.key === 'successMetric'));
    assert.ok(getArtifactFieldCatalog('BR').structured.some((f) => f.key === 'relatedBgKey'));
    assert.ok(getArtifactFieldCatalog('BPM').structured.some((f) => f.key === 'processName'));
    assert.ok(getArtifactFieldCatalog('NFR').structured.some((f) => f.key === 'verification'));
  });

  it('G3: legacy flags on catalog; PATCH still allows legacy keys', () => {
    const br = getArtifactFieldCatalog('BR').structured;
    assert.equal(br.find((f) => f.key === 'whenApplies')?.legacy, true);
    assert.equal(br.find((f) => f.key === 'exception')?.legacy, true);
    assert.equal(br.find((f) => f.key === 'description')?.legacy, undefined);
    assert.equal(getArtifactFieldCatalog('FR').structured.find((f) => f.key === 'dataEntities')?.legacy, true);
    assert.equal(
      getArtifactFieldCatalog('BPM').structured.find((f) => f.key === 'relatedSystems')?.legacy,
      true
    );
    assert.equal(getArtifactFieldCatalog('NFR').structured.find((f) => f.key === 'verification')?.legacy, true);
    assert.equal(
      getArtifactFieldCatalog('UC').structured.find((f) => f.key === 'alternativeFlows')?.legacy,
      true
    );

    const r = pickAllowedArtifactUpdate({
      kind: 'BR',
      status: 'draft',
      body: { structured: { whenApplies: 'Always', exception: 'None', description: 'Rule' } },
    });
    assert.equal(r.allowed, true);
    assert.equal(r.structured.whenApplies, 'Always');
    assert.equal(r.structured.exception, 'None');
    assert.equal(r.structured.description, 'Rule');
  });

  it('BG draft patch allows statement via catalog', () => {
    const r = resolveArtifactDraftUpdate({
      kind: 'BG',
      status: 'draft',
      body: { structured: { statement: 'New goal', successMetric: 'KPI' } },
      existingStructured: { priority: 'Medium' },
    });
    assert.equal(r.mode, 'catalog');
    assert.equal(r.structured.statement, 'New goal');
    assert.equal(r.structured.priority, 'Medium');
  });

  it('editable keys empty when status approved', () => {
    const keys = listEditableKeys('FR', 'approved');
    assert.deepEqual(keys.topKeys, []);
    assert.deepEqual(keys.structuredKeys, []);
  });

  it('editable keys non-empty for draft FR', () => {
    assert.ok(EDITABLE_STATUSES.includes('draft'));
    const keys = listEditableKeys('FR', 'draft');
    assert.ok(keys.topKeys.includes('title'));
    assert.ok(keys.structuredKeys.includes('priority'));
  });

  it('pickAllowedArtifactUpdate strips unknown top + structured keys', () => {
    const r = pickAllowedArtifactUpdate({
      kind: 'FR',
      status: 'draft',
      body: {
        title: 'Login',
        summary: 'User can login',
        externalKey: 'FR-HACK',
        aiHallucination: true,
        structured: {
          priority: 'High',
          fakeAiField: 'nope',
          relatedUcKeys: ['UC-1'],
        },
      },
    });
    assert.equal(r.allowed, true);
    assert.equal(r.top.title, 'Login');
    assert.equal(r.top.summary, 'User can login');
    assert.ok(!('externalKey' in r.top));
    assert.ok(!('aiHallucination' in r.top));
    assert.deepEqual(r.rejectedTop.sort(), ['aiHallucination', 'externalKey']);
    assert.equal(r.structured.priority, 'High');
    assert.deepEqual(r.structured.relatedUcKeys, ['UC-1']);
    assert.deepEqual(r.rejectedStructured, ['fakeAiField']);
  });

  it('pickAllowedArtifactUpdate rejects non-editable status', () => {
    const r = pickAllowedArtifactUpdate({
      kind: 'FR',
      status: 'ba_review',
      body: { title: 'X' },
    });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'STATUS_NOT_EDITABLE');
  });

  it('pickAllowedArtifactUpdate allows NFR catalog fields', () => {
    const r = pickAllowedArtifactUpdate({
      kind: 'NFR',
      status: 'draft',
      body: { title: 'Latency', structured: { category: 'Perf', fakeAi: 1 } },
    });
    assert.equal(r.allowed, true);
    assert.equal(r.top.title, 'Latency');
    assert.equal(r.structured.category, 'Perf');
    assert.deepEqual(r.rejectedStructured, ['fakeAi']);
  });
});

describe('resolveArtifactDraftUpdate Wave 2', () => {
  it('FR catalog mode merges structured and strips unknown', () => {
    const r = resolveArtifactDraftUpdate({
      kind: 'FR',
      status: 'draft',
      existingStructured: { level: 'Requirement', priority: 'Low', fakeOld: 'keep?' },
      body: {
        title: 'New title',
        aiJunk: true,
        structured: { priority: 'High', suggestedSkills: ['nope'] },
      },
    });
    assert.equal(r.mode, 'catalog');
    assert.equal(r.top.title, 'New title');
    assert.ok(!('aiJunk' in r.top));
    assert.equal(r.structured.priority, 'High');
    assert.equal(r.structured.level, 'Requirement');
    assert.ok(!('fakeOld' in r.structured));
    assert.ok(!('suggestedSkills' in r.structured));
    assert.deepEqual(r.rejectedTop, ['aiJunk']);
    assert.deepEqual(r.rejectedStructured, ['suggestedSkills']);
  });

  it('throws on approved status', () => {
    assert.throws(
      () =>
        resolveArtifactDraftUpdate({
          kind: 'FR',
          status: 'approved',
          body: { title: 'X' },
        }),
      (err) => err.errorCode === 'STATUS_NOT_EDITABLE' && err.statusCode === 400
    );
  });

  it('strictUnknown throws when junk fields present', () => {
    assert.throws(
      () =>
        resolveArtifactDraftUpdate({
          kind: 'FR',
          status: 'draft',
          body: { title: 'Ok', junk: 1 },
          strictUnknown: true,
        }),
      (err) => err.errorCode === 'ARTIFACT_FIELD_NOT_ALLOWED'
    );
  });

  it('BG catalog mode merges structured (no longer legacy)', () => {
    const r = resolveArtifactDraftUpdate({
      kind: 'BG',
      status: 'draft',
      existingStructured: { statement: 'old', priority: 'Medium' },
      body: { title: 'Goal', structured: { successMetric: 'KPI', junk: 'x' } },
    });
    assert.equal(r.mode, 'catalog');
    assert.equal(r.top.title, 'Goal');
    assert.equal(r.structured.statement, 'old');
    assert.equal(r.structured.successMetric, 'KPI');
    assert.equal(r.structured.priority, 'Medium');
    assert.ok(!('junk' in r.structured));
  });
});

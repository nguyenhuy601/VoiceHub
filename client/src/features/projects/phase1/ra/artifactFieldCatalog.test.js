/**
 * FE catalog mirror + draft form diff helpers (Wave 3).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTIFACT_EDITABLE_STATUSES,
  buildArtifactFormState,
  buildArtifactUpdateBody,
  getArtifactFieldCatalog,
  inputToTags,
  isArtifactContentEditable,
  isLegacyFormField,
  isSoftTraceFormField,
  listCatalogKinds,
  listVisibleStructuredFields,
  listVisibleTopFields,
  tagsToInput,
} from './artifactFieldCatalog.js';

describe('artifactFieldCatalog (FE)', () => {
  it('exposes catalogs for all RA kinds', () => {
    assert.deepEqual(listCatalogKinds().sort(), [
      'BG',
      'BPM',
      'BR',
      'FR',
      'NFR',
      'SCOPE',
      'UC',
    ]);
    assert.ok(getArtifactFieldCatalog('fr'));
    assert.ok(getArtifactFieldCatalog('UC'));
    assert.ok(getArtifactFieldCatalog('BR'));
    assert.ok(getArtifactFieldCatalog('SCOPE'));
  });

  it('editable only draft/rejected', () => {
    assert.deepEqual([...ARTIFACT_EDITABLE_STATUSES], ['draft', 'rejected']);
    assert.equal(isArtifactContentEditable('draft'), true);
    assert.equal(isArtifactContentEditable('rejected'), true);
    assert.equal(isArtifactContentEditable('approved'), false);
    assert.equal(isArtifactContentEditable('ba_review'), false);
  });

  it('tags round-trip', () => {
    assert.equal(tagsToInput(['A', 'B']), 'A, B');
    assert.deepEqual(inputToTags('A, B; C'), ['A', 'B', 'C']);
  });

  it('buildArtifactUpdateBody diffs only changed catalog fields', () => {
    const artifact = {
      title: 'T1',
      summary: 'S1',
      body: '',
      structured: { priority: 'Must', relatedUcKeys: ['UC-1'] },
    };
    const baseline = buildArtifactFormState(artifact, 'FR');
    const form = {
      top: { ...baseline.top, title: 'T2' },
      structured: { ...baseline.structured, priority: 'Should', relatedUcKeys: 'UC-1, UC-2' },
    };
    const body = buildArtifactUpdateBody(form, baseline, 'FR');
    assert.equal(body.title, 'T2');
    assert.equal(body.structured.priority, 'Should');
    assert.deepEqual(body.structured.relatedUcKeys, ['UC-1', 'UC-2']);
    assert.equal(body.summary, undefined);
  });

  it('FR structured keys include acceptanceCriteria and dataEntities', () => {
    const keys = getArtifactFieldCatalog('FR').structured.map((f) => f.key);
    assert.ok(keys.includes('acceptanceCriteria'));
    assert.ok(keys.includes('dataEntities'));
    assert.ok(!keys.includes('suggestedSkills'));
  });

  it('hydrates alias keys into catalog fields (BG goal→statement, NFR metric→target)', () => {
    const bg = buildArtifactFormState(
      {
        title: 'BG',
        summary: 'fallback summary',
        structured: { goal: 'from-goal', successMetric: 'KPI', owner: 'PO' },
      },
      'BG'
    );
    assert.equal(bg.structured.statement, 'from-goal');
    assert.equal(bg.structured.stakeholder, 'PO');
    assert.equal(bg.structured.successMetric, 'KPI');

    const nfr = buildArtifactFormState(
      {
        title: 'NFR',
        summary: '',
        structured: { category: 'Perf', metric: 'p95 < 2s', priority: 'Should' },
      },
      'NFR'
    );
    assert.equal(nfr.structured.target, 'p95 < 2s');
    assert.equal(nfr.structured.measurement, 'p95 < 2s');

    const bpm = buildArtifactFormState(
      {
        title: 'Proc title',
        summary: '',
        structured: { processName: '', actors: 'PM, BA', action: 'do' },
      },
      'BPM'
    );
    assert.equal(bpm.structured.actor, 'PM, BA');
    assert.equal(bpm.structured.processName, 'Proc title');

    const br = buildArtifactFormState(
      {
        title: 'BR',
        summary: 'sum',
        structured: { statement: 'rule text', relatedBgKey: 'BG-1' },
      },
      'BR'
    );
    assert.equal(br.structured.description, 'rule text');
  });

  it('G3: legacy fields hide when empty and show when DB has value', () => {
    const brLegacy = getArtifactFieldCatalog('BR').structured.filter((f) => isLegacyFormField(f));
    assert.ok(brLegacy.some((f) => f.key === 'whenApplies'));
    assert.ok(brLegacy.some((f) => f.key === 'exception'));
    assert.ok(getArtifactFieldCatalog('FR').structured.find((f) => f.key === 'dataEntities')?.legacy);
    assert.ok(getArtifactFieldCatalog('BPM').structured.find((f) => f.key === 'relatedSystems')?.legacy);
    assert.ok(getArtifactFieldCatalog('NFR').structured.find((f) => f.key === 'verification')?.legacy);
    assert.ok(getArtifactFieldCatalog('FR').topLevel.find((f) => f.key === 'body')?.legacy);

    const emptyBr = listVisibleStructuredFields('BR', {
      structured: { description: 'rule', relatedBgKey: 'BG-1' },
    });
    assert.ok(!emptyBr.some((f) => f.key === 'whenApplies'));
    assert.ok(!emptyBr.some((f) => f.key === 'exception'));
    assert.ok(!emptyBr.some((f) => f.key === 'baNote'));
    assert.ok(emptyBr.some((f) => f.key === 'description'));
    assert.ok(emptyBr.some((f) => f.key === 'relatedBgKey'));

    const filledBr = listVisibleStructuredFields('BR', {
      structured: { description: 'rule', whenApplies: 'Always', exception: 'None' },
    });
    assert.ok(filledBr.some((f) => f.key === 'whenApplies'));
    assert.ok(filledBr.some((f) => f.key === 'exception'));

    const emptyFr = listVisibleStructuredFields('FR', { structured: { priority: 'Must' } });
    assert.ok(!emptyFr.some((f) => f.key === 'dataEntities'));
    assert.ok(!emptyFr.some((f) => f.key === 'baNote'));
    assert.ok(emptyFr.some((f) => f.key === 'priority'));
    const filledFr = listVisibleStructuredFields('FR', {
      structured: { priority: 'Must', dataEntities: 'Meeting' },
    });
    assert.ok(filledFr.some((f) => f.key === 'dataEntities'));

    const topEmpty = listVisibleTopFields('FR', { title: 'T', summary: 'S', body: '' });
    assert.ok(!topEmpty.some((f) => f.key === 'body'));
    const topFilled = listVisibleTopFields('FR', { title: 'T', summary: 'S', body: 'long' });
    assert.ok(topFilled.some((f) => f.key === 'body'));
  });

  it('R3: soft-trace keys always visible even when empty; other legacy still hide-empty', () => {
    assert.ok(isSoftTraceFormField({ key: 'relatedUcKeys' }));
    assert.ok(isSoftTraceFormField({ key: 'relatedFrKeys' }));
    assert.ok(isSoftTraceFormField({ key: 'relatedBgKey' }));
    assert.ok(isSoftTraceFormField({ key: 'relatedBrKey' }));
    assert.ok(!isSoftTraceFormField({ key: 'whenApplies' }));
    assert.ok(!isSoftTraceFormField({ key: 'dataEntities' }));

    const emptyFr = listVisibleStructuredFields('FR', { structured: { priority: 'Must' } });
    assert.ok(emptyFr.some((f) => f.key === 'relatedUcKeys'), 'FR relatedUcKeys visible when empty');
    assert.ok(!emptyFr.some((f) => f.key === 'dataEntities'));

    const emptyNfr = listVisibleStructuredFields('NFR', { structured: { category: 'Perf' } });
    assert.ok(emptyNfr.some((f) => f.key === 'relatedFrKeys'));
    assert.ok(!emptyNfr.some((f) => f.key === 'verification'));

    const emptyBpm = listVisibleStructuredFields('BPM', {
      structured: { processName: 'P', actor: 'A' },
    });
    assert.ok(emptyBpm.some((f) => f.key === 'relatedBrKey'));
    assert.ok(!emptyBpm.some((f) => f.key === 'relatedSystems'));
  });
});

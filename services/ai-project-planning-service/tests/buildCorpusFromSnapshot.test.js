const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCorpusFromSnapshot,
  CORPUS_CAP,
} = require('../src/retrieval/buildCorpusFromSnapshot');
const { attachG1Catalogs } = require('../src/knowledge/attachG1Catalogs');

describe('buildCorpusFromSnapshot', () => {
  it('emits skill_def and metric_def from G1-attached snapshot', () => {
    const { snapshot } = attachG1Catalogs({
      snapshotId: 'snap-1',
      projected: {
        skillCatalog: { version: 'v1', skills: ['React'] },
        functionalRequirements: [
          { id: 'FR-1', name: 'Login', description: 'User signs in' },
        ],
        evidenceSpans: [{ id: 'EV-1', text: 'acceptance: login works' }],
      },
    });

    const docs = buildCorpusFromSnapshot(snapshot);
    assert.ok(docs.some((d) => d.docType === 'skill_def' && /React/i.test(d.text)));
    assert.ok(docs.some((d) => d.docType === 'metric_def' && d.sourceId === 'available_capacity'));
    assert.ok(docs.some((d) => d.docType === 'srs_canonical' && d.sourceId === 'FR-1'));
    assert.ok(docs.some((d) => d.docType === 'evidence_span' && d.sourceId === 'EV-1'));
    assert.ok(docs.every((d) => d.metadata?.snapshotId === 'snap-1'));
  });

  it('does not invent cross-project skills — only this snapshot', () => {
    const docs = buildCorpusFromSnapshot({
      snapshotId: 'a',
      projected: {
        skillCatalog: { version: 'v1', skills: ['Kotlin'] },
      },
      // stray field must not become corpus
      otherProjectSkills: ['ShouldNotAppear'],
    });
    assert.ok(docs.some((d) => /Kotlin/i.test(d.text)));
    assert.ok(!docs.some((d) => /ShouldNotAppear/i.test(d.text)));
  });

  it('employee_history has no email / PII fields in text', () => {
    const docs = buildCorpusFromSnapshot({
      snapshotId: 's',
      projected: {
        skillCatalog: { version: 'v1', skills: [] },
        employees: [
          {
            employeeId: 'e1',
            email: 'secret@example.com',
            history: [{ role: 'Backend', domain: 'fintech', months: 12 }],
          },
        ],
      },
      g1Catalogs: { metricCatalog: [] },
    });
    const hist = docs.filter((d) => d.docType === 'employee_history');
    assert.equal(hist.length, 1);
    assert.match(hist[0].text, /Backend/);
    assert.ok(!/secret@|example\.com/i.test(hist[0].text));
  });

  it('returns empty for null and respects cap', () => {
    assert.deepEqual(buildCorpusFromSnapshot(null), []);
    const skills = Array.from({ length: CORPUS_CAP + 50 }, (_, i) => `Skill${i}`);
    const docs = buildCorpusFromSnapshot({
      projected: { skillCatalog: { version: 'v1', skills } },
      g1Catalogs: { metricCatalog: [] },
    });
    assert.ok(docs.length <= CORPUS_CAP);
  });
});

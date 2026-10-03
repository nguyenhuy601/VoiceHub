/**
 * Data Lineage P0 — analysis-freeze pack; no live analysis overflow (RULE-DL-02).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPackObjectFromSnapshot,
  preferNonEmpty,
  buildSnapshotPayload,
} = require('../src/utils/aiAnalysis/pipeline/buildPipeline');
const { buildPackContentHash } = require('../src/utils/aiAnalysis/aiAnalysisCompactPolicy');

describe('preferNonEmpty (legacy helper)', () => {
  it('uses live when snap is empty array', () => {
    const live = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(preferNonEmpty([], live), live);
  });

  it('keeps non-empty snap', () => {
    const snap = [{ id: 's' }];
    const live = [{ id: 'l' }];
    assert.deepEqual(preferNonEmpty(snap, live), snap);
  });
});

describe('buildPackObjectFromSnapshot analysis freeze', () => {
  it('T1: snap NFR=[] does NOT fallback to live NFR', () => {
    const liveNfr = Array.from({ length: 10 }, (_, i) => ({
      externalId: `NFR-${i + 1}`,
      requirement: `Req ${i + 1}`,
      category: 'Performance',
    }));
    const liveFr = Array.from({ length: 3 }, (_, i) => ({
      externalId: `FR-${i + 1}`,
      name: `FR ${i + 1}`,
    }));
    const livePack = {
      functionalRequirements: liveFr,
      nonFunctionalRequirements: liveNfr,
      useCases: [{ externalId: 'UC-LIVE', name: 'Live UC' }],
      overview: { requirementName: 'Live' },
    };
    const snapshot = {
      projected: {
        srs: {
          functionalRequirements: [],
          nonFunctionalRequirements: [],
          businessGoals: [],
          businessRules: [],
          scope: [],
          businessProcesses: [],
          interfaces: [],
          useCases: [],
          entities: [],
          glossary: [],
          assumptions: [],
          overview: { name: 'Snap' },
        },
      },
    };

    const view = buildPackObjectFromSnapshot(livePack, snapshot);
    assert.equal(view.nonFunctionalRequirements.length, 0);
    assert.equal(view.functionalRequirements.length, 0);
    assert.equal(view.useCases.length, 0);
    assert.equal(view.overview.requirementName, 'Snap');
  });

  it('keeps Customer Raw intake markers + canonicalRaw for derive gate', () => {
    const livePack = {
      functionalRequirements: [{ externalId: 'FR-1', name: 'A', level: 'Requirement' }],
      nonFunctionalRequirements: [],
      overview: { expectedUsers: 'HR, Admin' },
      aiAnalysis: {
        workbookDiagnostic: { intakeKind: 'customer_raw' },
        customerRawRows: {
          businessRequests: [{ requestId: 'BRQ-001', businessGoal: 'G' }],
        },
        canonicalRaw: { registryVersion: 'raw-sem-v1', templateVersion: '1.1-raw' },
      },
    };
    const snapshot = {
      canonicalRaw: {
        registryVersion: 'raw-sem-v1',
        templateVersion: '1.1-raw',
        content: { businessGoals: ['Snap goal'] },
      },
      projected: {
        srs: {
          functionalRequirements: [{ externalId: 'FR-1', name: 'A' }],
          nonFunctionalRequirements: [],
          businessGoals: [],
          businessRules: [],
          scope: [],
          businessProcesses: [],
          interfaces: [],
          useCases: [],
          entities: [],
          glossary: [],
          assumptions: [],
          overview: { name: 'Emp', expectedUsers: 'HR' },
        },
      },
    };
    const view = buildPackObjectFromSnapshot(livePack, snapshot);
    assert.equal(view.aiAnalysis?.workbookDiagnostic?.intakeKind, 'customer_raw');
    assert.equal(view.aiAnalysis?.customerRawRows?.businessRequests?.[0]?.requestId, 'BRQ-001');
    assert.equal(view.aiAnalysis?.canonicalRaw?.content?.businessGoals?.[0], 'Snap goal');
    assert.equal(view.overview.expectedUsers, 'HR');
  });

  it('keeps snap rows when present; ignores divergent live UC', () => {
    const livePack = {
      functionalRequirements: [{ externalId: 'FR-L' }],
      nonFunctionalRequirements: [{ externalId: 'NFR-L' }],
      useCases: [{ externalId: 'UC-LIVE', name: 'Live' }],
    };
    const snapshot = {
      projected: {
        srs: {
          functionalRequirements: [{ externalId: 'FR-S', name: 'Snap FR' }],
          nonFunctionalRequirements: [{ externalId: 'NFR-S' }],
          businessGoals: [],
          businessRules: [],
          scope: [],
          businessProcesses: [],
          interfaces: [],
          useCases: [{ externalId: 'UC-SNAP', name: 'Snap UC' }],
          entities: [],
          glossary: [],
          assumptions: [],
        },
        employees: [{ employeeId: 'e1', userId: 'e1', role: 'Dev' }],
        skillCatalog: { version: 'v1', skills: ['Node'] },
        calendar: { workingCalendar: { timezone: 'UTC' }, holidays: [] },
      },
    };
    const view = buildPackObjectFromSnapshot(livePack, snapshot);
    assert.equal(view.nonFunctionalRequirements[0].externalId, 'NFR-S');
    assert.equal(view.functionalRequirements[0].externalId, 'FR-S');
    assert.equal(view.useCases[0].externalId, 'UC-SNAP');
    assert.equal(view.employees.length, 1);
    assert.equal(view.skillCatalog.skills[0], 'Node');
    assert.equal(view.calendar.workingCalendar.timezone, 'UTC');
  });
});

describe('buildPackContentHash v2 NFR', () => {
  it('T2: hash changes when NFR added (same FR)', () => {
    const base = {
      functionalRequirements: [{ externalId: 'FR-1', name: 'A' }],
      nonFunctionalRequirements: [],
      overview: {},
    };
    const withNfr = {
      ...base,
      nonFunctionalRequirements: [{ externalId: 'NFR-1', requirement: 'x' }],
    };
    const h1 = buildPackContentHash(base);
    const h2 = buildPackContentHash(withNfr);
    assert.notEqual(h1, h2);
    assert.equal(h2.length, 32);
  });
});

describe('snapshot projection FR/NFR volume', () => {
  it('T3: buildSnapshotPayload projects FR≥50 and NFR≥10; empty freeze stays empty', () => {
    const fr = Array.from({ length: 54 }, (_, i) => ({
      externalId: `CR-${String(i + 1).padStart(3, '0')}`,
      name: `Requirement ${i + 1}`,
      description: `Desc ${i + 1}`,
    }));
    const nfr = Array.from({ length: 10 }, (_, i) => ({
      externalId: `NFR-${String(i + 1).padStart(3, '0')}`,
      requirement: `NFR req ${i + 1}`,
      category: 'Performance',
    }));
    const pack = {
      overview: { requirementName: 'StudentManagement' },
      functionalRequirements: fr,
      nonFunctionalRequirements: nfr,
      staffingPlan: {},
    };
    const snap = buildSnapshotPayload({
      pack,
      poolItems: [],
      calendar: {},
      skillCatalog: { version: 1, skills: [] },
      packContentHash: 'testhash',
      packStatus: 'draft',
    });
    assert.ok(snap.projected.srs.functionalRequirements.length >= 50);
    assert.ok(snap.projected.srs.nonFunctionalRequirements.length >= 10);

    const emptySnap = {
      projected: {
        srs: {
          functionalRequirements: [],
          nonFunctionalRequirements: [],
          businessGoals: [],
          businessRules: [],
          scope: [],
          businessProcesses: [],
          interfaces: [],
          useCases: [],
          entities: [],
          glossary: [],
          assumptions: [],
        },
      },
    };
    const view = buildPackObjectFromSnapshot(pack, emptySnap);
    assert.equal(view.functionalRequirements.length, 0);
    assert.equal(view.nonFunctionalRequirements.length, 0);
  });
});

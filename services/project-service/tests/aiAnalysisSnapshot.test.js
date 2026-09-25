/**
 * T1 — Analysis Snapshot payload idempotency (packContentHash) + version pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildPackContentHash } = require('../src/utils/aiAnalysis/aiAnalysisCompactPolicy');
const {
  buildSnapshotPayload,
  buildJobInputFromSnapshot,
  buildPackObjectFromSnapshot,
} = require('../src/utils/aiAnalysis/pipeline/buildPipeline');
const { buildDatasetVersions } = require('../src/utils/aiAnalysis/pipeline/datasetVersions');
const { isSnapshotPipelineEnabled } = require('../src/utils/aiAnalysis/pipeline/pipelineConstants');
const { applyJobFilter } = require('../src/utils/aiAnalysis/pipeline/jobFilters');

function samplePack(frCount = 3) {
  const functionalRequirements = [];
  for (let i = 1; i <= frCount; i += 1) {
    functionalRequirements.push({
      externalId: `FR-${String(i).padStart(3, '0')}`,
      name: `Requirement ${i}`,
      level: 'Requirement',
      moduleLabel: 'Auth',
      description: `Detailed description for requirement ${i}`,
      acceptanceCriteria: `AC for ${i}`,
      suggestedSkills: i === 1 ? ['PostgreSQL', 'React'] : ['Node.js'],
      suggestedRoleKey: i === 1 ? 'Backend Dev' : 'FE Developer',
    });
  }
  return {
    versionNumber: 3,
    templateVersion: '1.0',
    status: 'approved',
    overview: {
      requirementName: 'Demo Pack',
      projectObjective: 'Ship MVP',
      platform: ['Web'],
      priority: 'High',
      startDate: '2026-01-01',
      deadline: '2026-06-01',
    },
    staffingPlan: {
      requiredSkills: [{ name: 'PostgreSQL', requiredLevel: 3 }],
      requiredRoles: [{ roleKey: 'Backend Dev', requiredCount: 2 }],
      startDate: '2026-01-01',
    },
    requirementSkills: [
      {
        externalId: 'FR-001',
        skillNameSnapshot: 'PostgreSQL',
        importance: 'required',
      },
    ],
    technology: [{ name: 'React Native', mandatory: true }],
    functionalRequirements,
    nonFunctionalRequirements: [],
  };
}

function samplePool() {
  return [
    {
      userId: 'u1',
      jobTitle: 'Backend Developer',
      availability: 'available',
      allocatedPct: 20,
      availablePct: 80,
      isActive: true,
      capability: {
        skills: [{ name: 'PostgreSQL', level: 4 }, { name: 'Node.js', level: 3 }],
      },
    },
    {
      userId: 'u2',
      jobTitle: 'Frontend Dev',
      availability: 'busy',
      allocatedPct: 90,
      availablePct: 10,
      isActive: true,
      capability: { skills: [{ name: 'React', level: 5 }] },
    },
    {
      userId: 'u3',
      jobTitle: 'QA',
      availability: 'overallocated',
      allocatedPct: 120,
      availablePct: 0,
      isActive: true,
      capability: { skills: [{ name: 'Playwright', level: 3 }] },
    },
  ];
}

describe('aiAnalysisSnapshot', () => {
  it('snapshot pipeline is enabled by default', () => {
    assert.equal(isSnapshotPipelineEnabled(), true);
  });

  it('same packContentHash yields identical projected employee/srs version pins', () => {
    const pack = samplePack();
    const hash = buildPackContentHash(pack);
    const a = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: { workingCalendar: { timezone: 'Asia/Ho_Chi_Minh' }, holidays: [] },
      skillCatalog: { version: 'cap-whitelist-v1', skills: ['PostgreSQL', 'React'] },
      packContentHash: hash,
      packStatus: 'approved',
    });
    const b = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: { workingCalendar: { timezone: 'Asia/Ho_Chi_Minh' }, holidays: [] },
      skillCatalog: { version: 'cap-whitelist-v1', skills: ['PostgreSQL', 'React'] },
      packContentHash: hash,
      packStatus: 'approved',
    });

    assert.equal(a.packContentHash, b.packContentHash);
    assert.equal(a.versions.srs, b.versions.srs);
    assert.equal(a.versions.employee, b.versions.employee);
    assert.equal(a.versions.skill, b.versions.skill);
    assert.equal(a.versions.calendar, b.versions.calendar);
    assert.equal(a.projected.employees.length, 3);
    assert.ok(a.commonFiltered);
    assert.ok(a.canonical);
    assert.ok(a.merged);
  });

  it('changing pack content changes packContentHash and srs version pin', () => {
    const pack = samplePack();
    const other = samplePack(4);
    other.overview.requirementName = 'Other Pack';
    const ha = buildPackContentHash(pack);
    const hb = buildPackContentHash(other);
    assert.notEqual(ha, hb);

    const va = buildDatasetVersions({
      packVersionNumber: 3,
      packContentHash: ha,
      projectedEmployees: [],
      calendar: {},
    });
    const vb = buildDatasetVersions({
      packVersionNumber: 3,
      packContentHash: hb,
      projectedEmployees: [],
      calendar: {},
    });
    assert.notEqual(va.srs, vb.srs);
  });

  it('matching toolData pool is frozen list (no live fetch shape required)', () => {
    const pack = samplePack();
    const hash = buildPackContentHash(pack);
    const snap = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: {},
      skillCatalog: { version: 'cap-whitelist-v1', skills: [] },
      packContentHash: hash,
    });
    snap._id = 'snap-match';
    const input = buildJobInputFromSnapshot(snap, 'employeeMatching');
    assert.ok(input.toolData.employees.every((e) => e.userId));
    // overallocated out; skill overlap with required PostgreSQL keeps u1 only
    assert.equal(input.toolData.employees.length, 1);
    assert.equal(input.toolData.employees[0].userId, 'u1');
    assert.ok(input.preparedSummary || input.jobFiltered);
    assert.ok(snap.preparedByJob?.employeeMatching);
    assert.equal(input.jobFiltered.filterMeta.materializedFromPrepared, true);
    assert.deepEqual(
      (input.toolData.employees || []).map((e) => e.userId),
      snap.preparedByJob.employeeMatching.employeeIds
    );

    const packObj = buildPackObjectFromSnapshot(pack, snap, {
      job: 'employeeMatching',
      jobFiltered: input.jobFiltered,
    });
    assert.ok(Array.isArray(packObj.functionalRequirements));
    assert.deepEqual(
      (packObj.functionalRequirements || []).map((r) => r.externalId),
      snap.preparedByJob.employeeMatching.frIds
    );
  });

  it('legacy snapshot without preparedByJob falls back to applyJobFilter', () => {
    const pack = samplePack();
    const hash = buildPackContentHash(pack);
    const snap = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: {},
      skillCatalog: { version: 'cap-whitelist-v1', skills: [] },
      packContentHash: hash,
    });
    const expected = applyJobFilter('employeeMatching', snap.commonFiltered);
    delete snap.preparedByJob;
    const input = buildJobInputFromSnapshot(snap, 'employeeMatching');
    assert.equal(input.preparedSummary, null);
    assert.equal(
      (input.toolData.employees || []).length,
      (expected.employees || []).length
    );
    assert.notEqual(input.jobFiltered.filterMeta.materializedFromPrepared, true);
  });
});

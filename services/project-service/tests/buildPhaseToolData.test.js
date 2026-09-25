/**
 * T1 — buildPhaseToolData hydrates HOW from SNAP; WHAT stays empty.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildPackContentHash } = require('../src/utils/aiAnalysis/aiAnalysisCompactPolicy');
const { buildSnapshotPayload } = require('../src/utils/aiAnalysis/pipeline/buildPipeline');
const { buildPhaseToolData } = require('../src/utils/aiAnalysis/pipeline/buildPhaseToolData');

function samplePack() {
  return {
    versionNumber: 3,
    templateVersion: '1.0',
    status: 'approved',
    overview: {
      requirementName: 'Demo Pack',
      startDate: '2026-01-01',
      deadline: '2026-06-01',
    },
    staffingPlan: {
      requiredSkills: [{ name: 'PostgreSQL', requiredLevel: 3 }],
      requiredRoles: [{ roleKey: 'Backend Dev', requiredCount: 1 }],
      startDate: '2026-01-01',
    },
    requirementSkills: [
      {
        externalId: 'FR-001',
        skillNameSnapshot: 'PostgreSQL',
        importance: 'required',
      },
    ],
    technology: [],
    functionalRequirements: [
      {
        externalId: 'FR-001',
        name: 'Req 1',
        level: 'Requirement',
        suggestedSkills: ['PostgreSQL'],
        suggestedRoleKey: 'Backend Dev',
      },
    ],
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
        skills: [{ name: 'PostgreSQL', level: 4 }],
      },
    },
    {
      userId: 'u2',
      jobTitle: 'Frontend',
      availability: 'busy',
      allocatedPct: 90,
      availablePct: 10,
      isActive: true,
      capability: { skills: [{ name: 'React', level: 5 }] },
    },
  ];
}

describe('buildPhaseToolData', () => {
  it('phase_how returns employees + calendar + overview from SNAP', () => {
    const pack = samplePack();
    const snap = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: {
        workingCalendar: { timezone: 'Asia/Ho_Chi_Minh' },
        holidays: ['2026-09-02'],
      },
      skillCatalog: { version: 'cap-whitelist-v1', skills: ['PostgreSQL'] },
      packContentHash: buildPackContentHash(pack),
      packStatus: 'approved',
    });
    snap._id = 'snap-phase-how';

    const toolData = buildPhaseToolData(snap, 'phase_how');
    assert.ok(Array.isArray(toolData.employees));
    assert.ok(toolData.employees.length >= 1);
    assert.equal(toolData.employees[0].userId, 'u1');
    assert.deepEqual(toolData.calendar.holidays, ['2026-09-02']);
    assert.equal(toolData.overview.startDate, '2026-01-01');
    assert.equal(toolData.overview.deadline, '2026-06-01');
    assert.equal(toolData.snapshotId, 'snap-phase-how');
    assert.equal(toolData.filterMeta.hydrate, 'phase_how');
  });

  it('phase_what returns empty object (RULE-HT-02)', () => {
    const pack = samplePack();
    const snap = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: { holidays: ['2026-09-02'] },
      skillCatalog: { version: 'v1', skills: [] },
      packContentHash: buildPackContentHash(pack),
    });
    snap._id = 'snap-what';
    assert.deepEqual(buildPhaseToolData(snap, 'phase_what'), {});
    assert.deepEqual(buildPhaseToolData(snap, 'what'), {});
  });

  it('alias how maps to phase_how hydrate', () => {
    const pack = samplePack();
    const snap = buildSnapshotPayload({
      pack,
      poolItems: samplePool(),
      calendar: { holidays: [] },
      skillCatalog: { version: 'v1', skills: [] },
      packContentHash: buildPackContentHash(pack),
    });
    snap._id = 'snap-alias';
    const toolData = buildPhaseToolData(snap, 'how');
    assert.ok(Array.isArray(toolData.employees));
  });
});

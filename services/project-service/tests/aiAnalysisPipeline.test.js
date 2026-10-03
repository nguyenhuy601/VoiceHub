/**
 * Pipeline preprocess — resolve/project/ingest/canon/merge/common/job/prepared.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { canonicalizeRole } = require('../src/utils/aiAnalysis/pipeline/canonicalRoleMap');
const { canonicalizeTech } = require('../src/utils/aiAnalysis/pipeline/canonicalTechMap');
const { canonicalizeSkill } = require('../src/utils/aiAnalysis/pipeline/canonicalSkillMap');
const { canonicalizeProjected } = require('../src/utils/aiAnalysis/pipeline/canonicalize');
const { semanticMerge } = require('../src/utils/aiAnalysis/pipeline/semanticMerge');
const { applyCommonFilter } = require('../src/utils/aiAnalysis/pipeline/commonFilter');
const { applyJobFilter, materializePreparedJob } = require('../src/utils/aiAnalysis/pipeline/jobFilters');
const { resolveSources } = require('../src/utils/aiAnalysis/pipeline/resolveSources');
const { projectAllSources, projectEmployee } = require('../src/utils/aiAnalysis/pipeline/fieldProjection');
const { projectSnapshotForJob } = require('../src/utils/aiAnalysis/pipeline/jobProjectionProfiles');
const { applyIngestionQuality } = require('../src/utils/aiAnalysis/pipeline/ingestionQuality');
const {
  buildSnapshotPayload,
  buildJobInputFromSnapshot,
  buildPackObjectFromSnapshot,
} = require('../src/utils/aiAnalysis/pipeline/buildPipeline');
const { PIPELINE_VERSION } = require('../src/utils/aiAnalysis/pipeline/pipelineConstants');

describe('aiAnalysisPipeline', () => {
  it('canonicalizes role / tech / skill aliases', () => {
    assert.equal(canonicalizeRole('Backend Dev').canonicalId, 'ROLE-BACKEND-DEV');
    assert.equal(canonicalizeRole('BE Developer').canonicalId, 'ROLE-BACKEND-DEV');
    assert.equal(canonicalizeTech('React Native').canonicalId, 'TECH-034');
    assert.equal(canonicalizeSkill('PostgreSQL').canonicalId, 'SK-018');
    assert.equal(canonicalizeSkill('postgres').canonicalId, 'SK-018');
  });

  it('resolveSources lists all sources for ingest; per-job is narrower', () => {
    const sources = resolveSources();
    assert.deepEqual(
      sources.map((s) => s.id),
      ['srs_pack', 'employee_pool', 'skill_catalog', 'org_calendar']
    );
    const matching = resolveSources({ job: 'employeeMatching' }).map((s) => s.id);
    assert.ok(matching.includes('employee_pool'));
    assert.ok(matching.includes('srs_pack'));
    const hier = resolveSources({ job: 'hierarchyDecomposition' }).map((s) => s.id);
    assert.deepEqual(hier, ['srs_pack']);
  });

  it('employee projection has no email/avatar/displayName', () => {
    const emp = projectEmployee({
      userId: 'u1',
      email: 'x@y.com',
      avatar: 'http://a',
      displayName: 'Secret',
      jobTitle: 'Backend Dev',
      availability: 'available',
      allocatedPct: 10,
      availablePct: 90,
      capability: { skills: [{ name: 'PostgreSQL', level: 3 }] },
      isActive: true,
    });
    assert.equal(emp.email, undefined);
    assert.equal(emp.avatar, undefined);
    assert.equal(emp.displayName, undefined);
    assert.equal(emp.employeeId, 'u1');
    assert.ok(emp.workload);
    assert.ok(Array.isArray(emp.history));
  });

  it('hierarchy profile projection omits employees', () => {
    const projected = {
      srs: { overview: { name: 'P' }, functionalRequirements: [] },
      employees: [{ employeeId: 'u1', userId: 'u1' }],
      calendar: { workingCalendar: {}, holidays: [] },
      skillCatalog: { version: 'v', skills: [] },
    };
    const slim = projectSnapshotForJob(projected, 'hierarchyDecomposition');
    assert.equal(slim.employees, undefined);
    assert.ok(slim.srs);
  });

  it('merge links FR-021 style refs; common before job filter order', () => {
    const projected = {
      srs: {
        overview: { name: 'P' },
        functionalRequirements: [
          {
            externalId: 'FR-021',
            level: 'Requirement',
            name: 'Persist orders in PostgreSQL',
            description: 'Use PostgreSQL for order storage',
            suggestedSkills: ['PostgreSQL'],
          },
        ],
        technology: [{ name: 'PostgreSQL', mandatory: true }],
        staffingPlan: {
          requiredSkills: [{ name: 'PostgreSQL' }],
          requiredRoles: [{ roleKey: 'Backend Dev' }],
        },
        requirementSkills: [
          { externalId: 'FR-021', skillNameSnapshot: 'PostgreSQL', importance: 'required' },
        ],
        frSlices: [{ id: 'FR-021', title: 'Persist orders' }],
        nonFunctionalRequirements: [],
      },
      employees: [
        {
          userId: 'u1',
          employeeId: 'u1',
          role: 'Backend Developer',
          isActive: true,
          availability: 'available',
          availablePct: 50,
          skills: [{ name: 'PostgreSQL' }],
        },
        {
          userId: 'u-off',
          employeeId: 'u-off',
          isActive: false,
          availability: 'available',
          availablePct: 100,
          skills: [],
        },
      ],
      skillCatalog: { version: 'v1', skills: ['PostgreSQL'] },
      calendar: { workingCalendar: {}, holidays: [] },
    };

    const cleaned = applyIngestionQuality(projected).projected;
    const canonical = canonicalizeProjected(cleaned);
    const merged = semanticMerge(canonical);
    assert.ok(merged.requiredSkillIds.includes('SK-018'));
    assert.ok(merged.edges.some((e) => e.from === 'FR-021' && e.to === 'SK-018'));

    const common = applyCommonFilter(canonical, merged);
    assert.equal(common.employees.some((e) => e.userId === 'u-off'), false);

    const matching = applyJobFilter('employeeMatching', common);
    assert.equal(matching.employees.length, 1);
    assert.ok(matching.filterMeta.focus.includes('skill'));

    const what = applyJobFilter('requirementAnalysis', common);
    assert.ok(what.filterMeta.focus.includes('hot_fr'));
    assert.equal(what.employees, undefined);
  });

  it('buildSnapshotPayload persists preparedByJob and pipelineVersion', () => {
    const pack = {
      versionNumber: 3,
      templateVersion: '1.0',
      overview: { requirementName: 'Demo', projectObjective: 'Ship MVP' },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Requirement',
          name: 'Login',
          description: 'User can log in with email and password securely',
          acceptanceCriteria: 'Given valid credentials when login then session created',
        },
      ],
      staffingPlan: { requiredSkills: [], requiredRoles: [] },
      requirementSkills: [],
      technology: [],
    };
    const payload = buildSnapshotPayload({
      pack,
      poolItems: [
        {
          userId: 'u1',
          email: 'a@b.c',
          jobTitle: 'Backend Dev',
          availability: 'available',
          availablePct: 80,
          allocatedPct: 20,
          isActive: true,
          capability: { skills: [{ name: 'Node.js' }] },
        },
      ],
      calendar: { workingCalendar: { timezone: 'Asia/Ho_Chi_Minh' }, holidays: [] },
      skillCatalog: { version: 'cap-whitelist-v2', skills: ['Node.js'] },
      packContentHash: 'abc123',
      packStatus: 'approved',
    });

    assert.equal(payload.pipelineVersion, PIPELINE_VERSION);
    assert.ok(payload.preparedByJob);
    assert.ok(payload.preparedByJob.employeeMatching);
    assert.ok(payload.preparedByJob.requirementAnalysis);
    assert.ok(payload.ingestionValidation);
    assert.ok(payload.projected.employees.every((e) => e.email === undefined));
  });

  it('materializePreparedJob matches prepared frIds/employeeIds (SoT)', () => {
    const projected = {
      srs: {
        overview: { name: 'P', objective: 'Ship' },
        functionalRequirements: [
          {
            externalId: 'FR-021',
            level: 'Requirement',
            name: 'Persist orders in PostgreSQL',
            description: 'Use PostgreSQL for order storage with enough detail',
            acceptanceCriteria: 'Orders persist after submit successfully',
            suggestedSkills: ['PostgreSQL'],
          },
          {
            externalId: 'FR-022',
            level: 'Requirement',
            name: 'Tiny',
            description: 'x',
            acceptanceCriteria: 'y',
          },
        ],
        technology: [{ name: 'PostgreSQL', mandatory: true }],
        staffingPlan: {
          requiredSkills: [{ name: 'PostgreSQL' }],
          requiredRoles: [{ roleKey: 'Backend Dev' }],
        },
        requirementSkills: [
          { externalId: 'FR-021', skillNameSnapshot: 'PostgreSQL', importance: 'required' },
        ],
        frSlices: [
          { id: 'FR-021', title: 'Persist' },
          { id: 'FR-022', title: 'Tiny' },
        ],
        nonFunctionalRequirements: [],
      },
      employees: [
        {
          userId: 'u1',
          employeeId: 'u1',
          role: 'Backend Developer',
          isActive: true,
          availability: 'available',
          availablePct: 50,
          skills: [{ name: 'PostgreSQL' }],
        },
        {
          userId: 'u2',
          employeeId: 'u2',
          role: 'FE',
          isActive: true,
          availability: 'available',
          availablePct: 80,
          skills: [{ name: 'React' }],
        },
      ],
      skillCatalog: { version: 'v1', skills: ['PostgreSQL'] },
      calendar: { workingCalendar: {}, holidays: [] },
    };

    const cleaned = applyIngestionQuality(projected).projected;
    const canonical = canonicalizeProjected(cleaned);
    const merged = semanticMerge(canonical);
    const common = applyCommonFilter(canonical, merged);
    const filtered = applyJobFilter('employeeMatching', common);
    const prepared = {
      filterMeta: filtered.filterMeta,
      frIds: (filtered.fr || []).map((r) => r.externalId).filter(Boolean),
      employeeIds: (filtered.employees || []).map((e) => e.employeeId || e.userId),
      nfrCount: 0,
    };
    const mat = materializePreparedJob(common, prepared, 'employeeMatching');
    assert.deepEqual(
      (mat.employees || []).map((e) => e.userId),
      prepared.employeeIds
    );
    assert.equal(mat.filterMeta.materializedFromPrepared, true);

    const effortThin = applyJobFilter('effortRoleAnalysis', {
      ...common,
      fr: [
        { externalId: 'FR-X', level: 'Requirement', name: 'X', description: 'short', acceptanceCriteria: '' },
        {
          externalId: 'FR-Y',
          level: 'Requirement',
          name: 'Y',
          description: 'Long enough description for complexity gate',
          acceptanceCriteria: 'Also long enough AC text',
        },
      ],
    });
    assert.equal(effortThin.fr.length, 1);
    assert.equal(effortThin.fr[0].externalId, 'FR-Y');
  });

  it('buildJobInput uses prepared SoT without re-scoring; pack FR matches prepared', () => {
    const pack = {
      versionNumber: 1,
      templateVersion: '1.0',
      overview: { requirementName: 'Demo', projectObjective: 'Ship MVP' },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Requirement',
          name: 'Login',
          description: 'User can log in with email and password securely',
          acceptanceCriteria: 'Given valid credentials when login then session created',
        },
        {
          externalId: 'FR-002',
          level: 'Requirement',
          name: 'Logout',
          description: 'User can log out and clear session tokens cleanly',
          acceptanceCriteria: 'Given session when logout then cookie cleared',
        },
      ],
      staffingPlan: {
        requiredSkills: [{ name: 'PostgreSQL' }],
        requiredRoles: [],
      },
      requirementSkills: [
        { externalId: 'FR-001', skillNameSnapshot: 'PostgreSQL', importance: 'required' },
      ],
      technology: [],
      nonFunctionalRequirements: [{ externalId: 'NFR-1', requirement: 'p95 < 200ms' }],
    };
    const payload = buildSnapshotPayload({
      pack,
      poolItems: [
        {
          userId: 'u1',
          jobTitle: 'Backend Dev',
          availability: 'available',
          availablePct: 80,
          allocatedPct: 20,
          isActive: true,
          capability: { skills: [{ name: 'PostgreSQL' }] },
        },
        {
          userId: 'u2',
          jobTitle: 'FE',
          availability: 'overallocated',
          availablePct: 0,
          allocatedPct: 120,
          isActive: true,
          capability: { skills: [{ name: 'React' }] },
        },
      ],
      calendar: {},
      skillCatalog: { version: 'v2', skills: ['PostgreSQL'] },
      packContentHash: 'sot-1',
    });

    // Pin a custom prepared slice to prove consume does not re-filter from scratch
    payload.preparedByJob.requirementAnalysis = {
      filterMeta: { job: 'requirementAnalysis', focus: ['hot_fr'], frKept: 1 },
      frIds: ['FR-002'],
      employeeIds: [],
      nfrCount: 1,
    };

    const input = buildJobInputFromSnapshot(payload, 'requirementAnalysis');
    assert.deepEqual(
      (input.jobFiltered.fr || []).map((r) => r.externalId),
      ['FR-002']
    );
    assert.equal(input.jobFiltered.filterMeta.materializedFromPrepared, true);
    assert.equal(input.preparedSummary.frIds[0], 'FR-002');

    const packObj = buildPackObjectFromSnapshot(pack, payload, {
      job: 'requirementAnalysis',
      jobFiltered: input.jobFiltered,
    });
    assert.deepEqual(
      (packObj.functionalRequirements || []).map((r) => r.externalId),
      ['FR-002']
    );

    const matching = buildJobInputFromSnapshot(payload, 'employeeMatching');
    assert.deepEqual(
      (matching.toolData.employees || []).map((e) => e.userId),
      payload.preparedByJob.employeeMatching.employeeIds
    );
  });

  it('overlay FR recomputes filter; employees stay pinned from prepared', () => {
    const pack = {
      versionNumber: 1,
      templateVersion: '1.0',
      overview: { requirementName: 'Demo', projectObjective: 'Ship' },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Requirement',
          name: 'Old',
          description: 'Old requirement with enough description text',
          acceptanceCriteria: 'Old AC that is long enough',
        },
      ],
      staffingPlan: { requiredSkills: [{ name: 'PostgreSQL' }], requiredRoles: [] },
      requirementSkills: [
        { externalId: 'FR-001', skillNameSnapshot: 'PostgreSQL', importance: 'required' },
      ],
      technology: [],
    };
    const payload = buildSnapshotPayload({
      pack,
      poolItems: [
        {
          userId: 'u1',
          jobTitle: 'Backend Dev',
          availability: 'available',
          availablePct: 80,
          allocatedPct: 20,
          isActive: true,
          capability: { skills: [{ name: 'PostgreSQL' }] },
        },
      ],
      calendar: {},
      skillCatalog: { version: 'v2', skills: [] },
      packContentHash: 'overlay-1',
    });

    const overlay = [
      {
        externalId: 'FR-100',
        level: 'Requirement',
        name: 'New confirmed FR',
        description: 'Confirmed hierarchy FR with enough description detail',
        acceptanceCriteria: 'Confirmed AC text that is long enough',
      },
    ];
    const input = buildJobInputFromSnapshot(payload, 'requirementAnalysis', {
      overlayFrList: overlay,
    });
    const frIds = (input.jobFiltered.fr || []).map((r) => r.externalId);
    assert.ok(frIds.includes('FR-100'));
    assert.equal(input.jobFiltered.filterMeta.materializedFromPrepared, undefined);

    const matchInput = buildJobInputFromSnapshot(payload, 'employeeMatching', {
      overlayFrList: overlay,
    });
    assert.deepEqual(
      (matchInput.toolData.employees || []).map((e) => e.userId),
      payload.preparedByJob.employeeMatching.employeeIds
    );
    assert.equal(matchInput.jobFiltered.filterMeta.employeesFromPrepared, true);
  });
});

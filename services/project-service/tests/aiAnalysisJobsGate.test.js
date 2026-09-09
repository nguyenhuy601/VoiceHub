/**
 * T1 — AI Analysis job gate + migrate v1→v2 + hierarchyDecomposition.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AI_ANALYSIS_SCHEMA_VERSION,
  AI_ANALYSIS_USER_JOBS,
  parseJobId,
  previousUserJob,
} = require('../src/constants/aiAnalysisJobs.constants');
const {
  ensureAiAnalysisContainer,
  createEmptyAiAnalysisContainer,
} = require('../src/utils/aiAnalysis/aiAnalysisContainer');
const {
  migrateAiAnalysisJobsV1ToV2,
  needsJobMigration,
  ensureHierarchyDecompositionMigrated,
} = require('../src/utils/aiAnalysis/aiAnalysisMigrateJobs');

describe('aiAnalysisJobsGate', () => {
  it('has 11 user jobs in designed order', () => {
    assert.equal(AI_ANALYSIS_USER_JOBS.length, 11);
    assert.deepEqual(AI_ANALYSIS_USER_JOBS, [
      'hierarchyDecomposition',
      'requirementAnalysis',
      'capabilityAnalysis',
      'wbsGeneration',
      'dependencyAnalysis',
      'architectureRiskAnalysis',
      'effortRoleAnalysis',
      'sequencingCpm',
      'employeeMatching',
      'scheduleCapacity',
      'projectPlan',
    ]);
    assert.equal(AI_ANALYSIS_SCHEMA_VERSION, 2);
  });

  it('previousUserJob chains correctly', () => {
    assert.equal(previousUserJob('hierarchyDecomposition'), null);
    assert.equal(previousUserJob('requirementAnalysis'), 'hierarchyDecomposition');
    assert.equal(previousUserJob('capabilityAnalysis'), 'requirementAnalysis');
    assert.equal(previousUserJob('wbsGeneration'), 'capabilityAnalysis');
    assert.equal(previousUserJob('projectPlan'), 'scheduleCapacity');
  });

  it('parseJobId rejects legacy ids', () => {
    assert.throws(() => parseJobId('roleSkillAnalysis'), (err) => {
      assert.equal(err.errorCode, 'AI_ANALYSIS_INVALID_JOB');
      return true;
    });
    assert.throws(() => parseJobId('employeeAssignment'), (err) => {
      assert.equal(err.errorCode, 'AI_ANALYSIS_INVALID_JOB');
      return true;
    });
    assert.equal(parseJobId('sequencingCpm'), 'sequencingCpm');
    assert.equal(parseJobId('hierarchyDecomposition'), 'hierarchyDecomposition');
  });

  it('migrate v1→v2 maps legacy job meta to stale new keys', () => {
    const raw = {
      schemaVersion: 1,
      jobs: {
        wbsGeneration: { status: 'confirmed', generatedAt: 't1' },
        architectureRiskAnalysis: { status: 'confirmed', generatedAt: 't2' },
        roleSkillAnalysis: { status: 'ready', generatedAt: 't3' },
        employeeMatching: { status: 'ready', generatedAt: 't4' },
        employeeAssignment: { status: 'confirmed', generatedAt: 't5' },
      },
    };
    assert.equal(needsJobMigration(raw), true);
    const { jobs, migrated } = migrateAiAnalysisJobsV1ToV2(raw.jobs);
    assert.equal(migrated, true);
    assert.equal(jobs.capabilityAnalysis.status, 'stale');
    assert.equal(jobs.dependencyAnalysis.status, 'stale');
    assert.equal(jobs.effortRoleAnalysis.status, 'stale');
    assert.equal(jobs.scheduleCapacity.status, 'stale');
    assert.equal(jobs.sequencingCpm.status, 'stale');

    const ensured = ensureAiAnalysisContainer(raw);
    assert.equal(ensured.schemaVersion, 2);
    assert.ok(ensured.jobs.capabilityAnalysis);
    assert.ok(ensured.jobs.hierarchyDecomposition);
    assert.ok(ensured.planning.criticalWorkIds);
    assert.ok(Array.isArray(ensured.resource.schedule));
  });

  it('createEmptyAiAnalysisContainer includes hierarchy job + analyses.hierarchy', () => {
    const c = createEmptyAiAnalysisContainer();
    assert.equal(c.schemaVersion, 2);
    assert.equal(c.jobs.hierarchyDecomposition.status, 'empty');
    assert.equal(c.jobs.projectPlan.status, 'empty');
    assert.equal(c.jobs.final.status, 'empty');
    assert.equal(c.planning.executionPlan, null);
    assert.ok(c.analyses.hierarchy);
    assert.deepEqual(c.analyses.hierarchy.proposedFeatures, []);
    assert.deepEqual(c.analyses.hierarchy.proposedRequirements, []);
    assert.equal(c.analyses.hierarchy.meta.agileMap.Module, 'Epic');
  });

  it('ensureHierarchy: pack with Requirement → hierarchy confirmed skip', () => {
    const raw = {
      schemaVersion: 2,
      jobs: {
        requirementAnalysis: { status: 'confirmed' },
      },
      analyses: {},
    };
    const ensured = ensureAiAnalysisContainer(raw);
    const { container, changed } = ensureHierarchyDecompositionMigrated(
      ensured,
      [
        {
          externalId: 'FR-001',
          level: 'Module',
          name: 'M',
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'F',
        },
        {
          externalId: 'FR-003',
          level: 'Requirement',
          parentExternalId: 'FR-002',
          name: 'R',
        },
      ],
      { jobWasMissing: true }
    );
    assert.equal(changed, true);
    assert.equal(container.jobs.hierarchyDecomposition.status, 'confirmed');
    assert.equal(container.analyses.hierarchy.meta.migratedSkip, true);
    assert.deepEqual(container.analyses.hierarchy.proposedFeatures, []);
    assert.deepEqual(container.analyses.hierarchy.proposedRequirements, []);
  });

  it('ensureHierarchy: pack without Requirement → hierarchy empty', () => {
    const raw = {
      schemaVersion: 2,
      jobs: {
        requirementAnalysis: { status: 'empty' },
      },
      analyses: {},
    };
    const ensured = ensureAiAnalysisContainer(raw);
    const { container, changed } = ensureHierarchyDecompositionMigrated(
      ensured,
      [
        {
          externalId: 'FR-001',
          level: 'Module',
          name: 'M',
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'F',
        },
      ],
      { jobWasMissing: true }
    );
    assert.equal(changed, true);
    assert.equal(container.jobs.hierarchyDecomposition.status, 'empty');
    assert.notEqual(container.analyses.hierarchy?.meta?.migratedSkip, true);
  });
});

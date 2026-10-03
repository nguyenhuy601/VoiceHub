/**
 * Info-control matrix + requirementInsights SRS-only profile + history matching bonus.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { AI_ANALYSIS_USER_JOBS } = require('../src/constants/aiAnalysisJobs.constants');
const {
  JOB_PROJECTION_PROFILES,
  getJobProjectionProfile,
  projectSnapshotForJob,
} = require('../src/utils/aiAnalysis/pipeline/jobProjectionProfiles');
const { splitContext, LLM_JOBS } = require('../src/utils/aiAnalysis/pipeline/splitContext');
const {
  historyOverlapBonus,
  scorePoolItemForTask,
  normalizePoolItemsForMatching,
} = require('../../ai-project-planning-service/src/engines/employeeMatching');


/** Expected control flags (calendar / employees). */
const MATRIX = Object.freeze({
  hierarchyDecomposition: {
    includeEmployees: false,
    includeCalendar: false,
    llmToolDataNull: true,
  },
  requirementAnalysis: {
    includeEmployees: false,
    includeCalendar: false,
    llmToolDataNull: true,
  },
  capabilityAnalysis: {
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: true,
    llmToolDataNull: true,
  },
  requirementInsights: {
    includeEmployees: false,
    includeCalendar: false,
    includeSkillCatalog: false,
  },
  wbsGeneration: {
    includeEmployees: false,
    includeCalendar: false,
    llmToolDataNull: true,
  },
  dependencyAnalysis: {
    includeEmployees: false,
    includeCalendar: false,
    llmToolDataNull: true,
  },
  architectureRiskAnalysis: {
    includeEmployees: false,
    includeCalendar: false,
    llmToolDataNull: true,
  },
  effortRoleAnalysis: {
    includeEmployees: false,
    includeCalendar: false,
    engineOnly: true,
  },
  sequencingCpm: {
    includeEmployees: false,
    includeCalendar: false,
    engineOnly: true,
  },
  employeeMatching: {
    includeEmployees: true,
    includeCalendar: false,
    engineOnly: true,
  },
  scheduleCapacity: {
    includeEmployees: true,
    includeCalendar: true,
    engineOnly: true,
  },
  projectPlan: {
    includeEmployees: false,
    includeCalendar: true,
    engineOnly: true,
  },
});

describe('AI phase info-control matrix', () => {
  it('every user job has an explicit JOB_PROJECTION_PROFILES entry', () => {
    for (const job of AI_ANALYSIS_USER_JOBS) {
      assert.ok(MATRIX[job], `matrix row missing for ${job}`);
      assert.ok(JOB_PROJECTION_PROFILES[job], `profile missing for ${job}`);
      const profile = getJobProjectionProfile(job);
      assert.equal(profile.includeEmployees, MATRIX[job].includeEmployees, job);
      assert.equal(profile.includeCalendar, MATRIX[job].includeCalendar, job);
    }
  });

  it('requirementInsights is SRS-only (no pool/calendar fallback)', () => {
    const profile = JOB_PROJECTION_PROFILES.requirementInsights;
    assert.deepEqual(profile.sources, ['srs_pack']);
    assert.equal(profile.includeEmployees, false);
    assert.equal(profile.includeCalendar, false);
    assert.equal(profile.includeSkillCatalog, false);

    const projected = projectSnapshotForJob(
      {
        srs: { overview: { name: 'X' }, functionalRequirements: [] },
        employees: [{ userId: 'u1', role: 'dev' }],
        calendar: { holidays: ['2026-01-01'] },
      },
      'requirementInsights'
    );
    assert.equal(projected.employees, undefined);
    assert.equal(projected.calendar, undefined);
  });

  it('JOB_PROJECTION_PROFILES matches matrix calendar/employee flags', () => {
    for (const [job, expect] of Object.entries(MATRIX)) {
      const profile = JOB_PROJECTION_PROFILES[job];
      assert.equal(profile.includeEmployees, expect.includeEmployees, `${job}.includeEmployees`);
      assert.equal(profile.includeCalendar, expect.includeCalendar, `${job}.includeCalendar`);
      if (expect.includeSkillCatalog != null) {
        assert.equal(profile.includeSkillCatalog, expect.includeSkillCatalog, `${job}.skill`);
      }
    }
  });

  it('splitContext: WHAT LLM jobs get aiContext without employees/calendar in toolData', () => {
    const filtered = {
      overview: { name: 'P', deadline: '2026-12-01' },
      fr: [{ externalId: 'FR-1', name: 'A', level: 'Requirement' }],
      frSlices: [],
      employees: [{ userId: 'u1', email: 'x@y.z' }],
      calendar: { holidays: ['2026-01-01'] },
      skillCatalog: { skills: [] },
    };

    for (const job of [
      'hierarchyDecomposition',
      'requirementAnalysis',
      'capabilityAnalysis',
      'wbsGeneration',
      'architectureRiskAnalysis',
    ]) {
      assert.ok(LLM_JOBS.has(job), `${job} in LLM_JOBS`);
      const { aiContext, toolData } = splitContext(job, filtered, { snapshotId: 's1' });
      assert.ok(aiContext, `${job} aiContext`);
      assert.equal(toolData, null, `${job} toolData must be null`);
    }
  });

  it('splitContext: scheduleCapacity toolData carries calendar; matching profile excludes calendar', () => {
    const filtered = {
      overview: { name: 'P', startDate: '2026-01-01', deadline: '2026-06-01' },
      employees: [{ userId: 'u1', history: [{ role: 'backend_developer' }] }],
      calendar: { workingCalendar: { timezone: 'Asia/Ho_Chi_Minh' }, holidays: ['2026-04-30'] },
      staffing: {},
    };
    const sched = splitContext('scheduleCapacity', filtered, { snapshotId: 's1' });
    assert.equal(sched.aiContext, null);
    assert.deepEqual(sched.toolData.calendar.holidays, ['2026-04-30']);

    assert.equal(JOB_PROJECTION_PROFILES.employeeMatching.includeCalendar, false);
  });

  it('audit: scheduleCapacity uses holidays / working-day skip', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../../ai-project-planning-service/src/engines/scheduleCapacity.js'
      ),
      'utf8'
    );
    assert.match(src, /function holidaySet/);
    assert.match(src, /function nextWorkingDay/);
    assert.match(src, /calendar\?\.holidays/);
  });
});

describe('employeeMatching history soft bonus (RULE-F2)', () => {
  it('normalizePoolItemsForMatching preserves history', () => {
    const [row] = normalizePoolItemsForMatching([
      {
        userId: 'u1',
        jobTitle: 'Backend',
        history: [{ role: 'backend_developer', domain: 'payments', months: 12 }],
      },
    ]);
    assert.equal(row.history.length, 1);
    assert.equal(row.history[0].role, 'backend_developer');
  });

  it('historyOverlapBonus caps at 0.1 and is zero without history', () => {
    assert.equal(historyOverlapBonus({ history: [] }, { suggestedRoleKey: 'backend_developer' }, new Set()), 0);
    const bonus = historyOverlapBonus(
      {
        history: [
          { role: 'backend_developer', domain: 'react' },
          { role: 'qa', domain: 'nodejs' },
        ],
      },
      { suggestedRoleKey: 'backend_developer' },
      new Set(['react', 'nodejs'])
    );
    assert.ok(bonus > 0);
    assert.ok(bonus <= 0.1);
  });

  it('scorePoolItemForTask increases when history overlaps role', () => {
    const task = { id: 't1', suggestedRoleKey: 'backend_developer', sourceCapabilityIds: [] };
    const base = scorePoolItemForTask({
      item: {
        userId: 'u1',
        jobTitle: 'other',
        skills: [],
        capacityRemaining: 1,
        history: [],
      },
      task,
      container: { analyses: {} },
      blockers: new Set(),
      criticalIds: new Set(),
    });
    const withHist = scorePoolItemForTask({
      item: {
        userId: 'u1',
        jobTitle: 'other',
        skills: [],
        capacityRemaining: 1,
        history: [{ role: 'backend_developer', domain: 'api' }],
      },
      task,
      container: { analyses: {} },
      blockers: new Set(),
      criticalIds: new Set(),
    });
    assert.ok(withHist > base);
    assert.ok(withHist - base <= 0.1 + 1e-9);
  });
});

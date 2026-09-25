const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
process.env.ORGANIZATION_SERVICE_URL ||= 'http://organization-service:3003';
const {
  startRun,
  serializeRemoteRunInput,
} = require('../src/clients/aiProjectPlanning.client');
const {
  shouldRunRemoteAiPlanning,
  isAiPlanningRemoteEnabled,
  isDuplicateRemoteRun,
  applyRemoteHowJobResult,
} = require('../src/services/aiAnalysis.service');
const {
  applyJobResult,
} = require('../src/controllers/aiPlanningInternal.controller');
const RequirementPack = require('../src/models/RequirementPack');
const {
  createEmptyAiAnalysisContainer,
} = require('../src/utils/aiAnalysis/aiAnalysisContainer');

describe('AI planning remote cutover', () => {
  it('serializes immutable nested container and tool data without dropping fields', () => {
    const payload = serializeRemoteRunInput({
      job: 'employeeMatching',
      snapshotId: 'snap-1',
      input: {
        container: { planning: { tasks: [{ id: 'T1', effortHours: 8 }] } },
        toolData: {
          employees: [{ userId: 'u1', history: [{ role: 'backend_developer' }] }],
          calendar: { holidays: ['2026-09-02'] },
        },
      },
    });
    assert.equal(payload.input.container.planning.tasks[0].id, 'T1');
    assert.equal(payload.input.toolData.employees[0].history[0].role, 'backend_developer');
    assert.deepEqual(payload.input.toolData.calendar.holidays, ['2026-09-02']);
  });

  it('rejects null or array containers before S2S dispatch', () => {
    assert.throws(
      () => serializeRemoteRunInput({ input: { container: null } }),
      (error) => error.code === 'RUN_INPUT_REQUIRED'
    );
    assert.throws(
      () => serializeRemoteRunInput({ input: { container: [] } }),
      (error) => error.code === 'RUN_INPUT_REQUIRED'
    );
  });

  it('routes all AI Analysis user jobs remotely via APS job registry', () => {
    assert.equal(shouldRunRemoteAiPlanning('effortRoleAnalysis'), true);
    assert.equal(shouldRunRemoteAiPlanning('scheduleCapacity'), true);
    assert.equal(shouldRunRemoteAiPlanning('sequencingCpm'), true);
    assert.equal(shouldRunRemoteAiPlanning('employeeMatching'), true);
    assert.equal(shouldRunRemoteAiPlanning('wbsGeneration'), true);
    assert.equal(shouldRunRemoteAiPlanning('dependencyAnalysis'), true);
    assert.equal(shouldRunRemoteAiPlanning('architectureRiskAnalysis'), true);
    assert.equal(shouldRunRemoteAiPlanning('projectPlan'), true);
    assert.equal(shouldRunRemoteAiPlanning('hierarchyDecomposition'), true);
    assert.equal(shouldRunRemoteAiPlanning('requirementAnalysis'), true);
    assert.equal(shouldRunRemoteAiPlanning('capabilityAnalysis'), true);
    assert.equal(shouldRunRemoteAiPlanning('requirementInsights'), true);
  });

  it('keeps HOW remote even when AI_PLANNING_REMOTE=0 (flag no longer reopens in-process)', () => {
    const previous = process.env.AI_PLANNING_REMOTE;
    try {
      delete process.env.AI_PLANNING_REMOTE;
      assert.equal(isAiPlanningRemoteEnabled(), true);
      process.env.AI_PLANNING_REMOTE = '0';
      assert.equal(isAiPlanningRemoteEnabled(), false);
      // HOW routing ignores the env flag — always remote.
      assert.equal(shouldRunRemoteAiPlanning('sequencingCpm'), true);
      assert.equal(shouldRunRemoteAiPlanning('effortRoleAnalysis'), true);
      process.env.AI_PLANNING_REMOTE = 'unexpected';
      assert.equal(isAiPlanningRemoteEnabled(), true);
    } finally {
      if (previous == null) delete process.env.AI_PLANNING_REMOTE;
      else process.env.AI_PLANNING_REMOTE = previous;
    }
  });

  it('posts to the internal run URL with the gateway token', async () => {
    const axios = require('axios');
    const originalPost = axios.post;
    const previousUrl = process.env.AI_PROJECT_PLANNING_SERVICE_URL;
    const previousToken = process.env.GATEWAY_INTERNAL_TOKEN;
    let observed;
    process.env.AI_PROJECT_PLANNING_SERVICE_URL = 'http://planning:3025/';
    process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';
    axios.post = async (...args) => {
      observed = args;
      return { status: 202, data: { runId: 'run-1' } };
    };
    try {
      await startRun({
        job: 'sequencingCpm',
        input: { container: { jobs: {} } },
      });
      assert.equal(observed[0], 'http://planning:3025/internal/runs');
      assert.equal(
        observed[2].headers['x-gateway-internal-token'],
        'test-token'
      );
    } finally {
      axios.post = originalPost;
      if (previousUrl == null) delete process.env.AI_PROJECT_PLANNING_SERVICE_URL;
      else process.env.AI_PROJECT_PLANNING_SERVICE_URL = previousUrl;
      if (previousToken == null) delete process.env.GATEWAY_INTERNAL_TOKEN;
      else process.env.GATEWAY_INTERNAL_TOKEN = previousToken;
    }
  });

  it('guards the project callback route with internal auth', () => {
    const source = readFileSync(
      join(__dirname, '../src/routes/project.routes.js'),
      'utf8'
    );
    assert.match(
      source,
      /['"]\/internal\/ai-planning\/job-result['"]\s*,\s*internalGatewayAuth\s*,/
    );
  });

  it('detects callback replay by runId on phaseRuns', () => {
    const container = {
      phaseRuns: { phase_how: { remoteRunId: 'run-123', status: 'ready' } },
    };
    assert.equal(isDuplicateRemoteRun(container, 'phase_how', 'run-123'), true);
    assert.equal(isDuplicateRemoteRun(container, 'phase_how', 'run-456'), false);
  });

  it('applies a completed phase_how callback once and treats replay as idempotent', async () => {
    const originalFindOne = RequirementPack.findOne;
    let saveCount = 0;
    const pack = {
      _id: 'pack-1',
      projectId: 'project-1',
      organizationId: 'org-1',
      isActive: true,
      aiAnalysisActiveSnapshotId: 'snapshot-1',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      markModified() {},
      async save() {
        saveCount += 1;
        return this;
      },
      toObject() {
        return this;
      },
    };
    pack.aiAnalysis.phaseRuns = {
      phase_how: {
        status: 'pending',
        snapshotId: 'snapshot-1',
        remoteRunId: 'run-1',
      },
    };
    RequirementPack.findOne = async () => pack;
    const callback = {
      runId: 'run-1',
      status: 'completed',
      job: 'phase_how',
      projectId: 'project-1',
      packId: 'pack-1',
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      result: {
        job: 'phase_how',
        container: {
          planning: {
            tasks: [{ id: 'A', effortHours: 8 }],
          },
          phaseRuns: {
            phase_how: { status: 'ready', hitl: 'gate2' },
          },
        },
        result: { hitl: 'gate2' },
      },
    };
    try {
      const first = await applyRemoteHowJobResult(callback);
      const replay = await applyRemoteHowJobResult(callback);
      assert.equal(first.applied, true);
      assert.equal(replay.idempotent, true);
      assert.equal(saveCount, 1);
      assert.equal(pack.aiAnalysis.phaseRuns.phase_how.status, 'ready');
      assert.equal(pack.aiAnalysis.phaseRuns.phase_how.remoteRunId, 'run-1');
      assert.equal(pack.aiAnalysis.jobs, undefined);
    } finally {
      RequirementPack.findOne = originalFindOne;
    }
  });

  it('ACKs failed callback for pending phase_how without requiring jobs shells', async () => {
    const originalFindOne = RequirementPack.findOne;
    const pack = {
      projectId: 'project-1',
      organizationId: 'org-1',
      isActive: true,
      aiAnalysisActiveSnapshotId: 'snapshot-1',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      markModified() {},
      async save() {
        return this;
      },
      toObject() {
        return this;
      },
    };
    pack.aiAnalysis.phaseRuns = {
      phase_how: {
        status: 'pending',
        snapshotId: 'snapshot-1',
        remoteRunId: 'run-new',
      },
    };
    RequirementPack.findOne = async () => pack;
    try {
      const result = await applyRemoteHowJobResult({
        runId: 'run-new',
        status: 'failed',
        job: 'phase_how',
        projectId: 'project-1',
        packId: 'pack-1',
        organizationId: 'org-1',
        snapshotId: 'snapshot-1',
        error: { code: 'OLD' },
      });
      assert.equal(result.applied, true);
      assert.equal(pack.aiAnalysis.phaseRuns.phase_how.status, 'failed');
    } finally {
      RequirementPack.findOne = originalFindOne;
    }
  });

  it('validates callback job, project and stale snapshot identifiers', async () => {
    const originalFindOne = RequirementPack.findOne;
    RequirementPack.findOne = async () => ({
      projectId: 'project-expected',
      organizationId: 'org-1',
      isActive: true,
      aiAnalysisActiveSnapshotId: 'snapshot-active',
      aiAnalysis: {
        ...createEmptyAiAnalysisContainer(),
        phaseRuns: {
          phase_how: { status: 'pending', remoteRunId: 'run-1', snapshotId: 'snapshot-active' },
        },
      },
      functionalRequirements: [],
      markModified() {},
      async save() {
        return this;
      },
      toObject() {
        return this;
      },
    });
    const base = {
      runId: 'run-1',
      status: 'failed',
      job: 'phase_how',
      packId: 'pack-1',
      organizationId: 'org-1',
      snapshotId: 'snapshot-active',
      error: { code: 'TEST' },
    };
    try {
      await assert.rejects(
        () =>
          applyRemoteHowJobResult({
            ...base,
            job: 'notARealRemoteJob',
          }),
        (error) => error.errorCode === 'JOB_BY_JOB_REMOVED'
      );
      await assert.rejects(
        () =>
          applyRemoteHowJobResult({
            ...base,
            projectId: 'project-other',
          }),
        (error) => error.errorCode === 'REMOTE_RESULT_PROJECT_MISMATCH'
      );
      const stale = await applyRemoteHowJobResult({
        ...base,
        projectId: 'project-expected',
        snapshotId: 'snapshot-old',
      });
      assert.equal(stale.stale, true);
      assert.equal(stale.reason, 'snapshot_not_active');
    } finally {
      RequirementPack.findOne = originalFindOne;
    }
  });

  it('applies phase_how callback via internal controller', async () => {
    const originalFindOne = RequirementPack.findOne;
    const pack = {
      _id: 'pack-1',
      projectId: 'project-1',
      organizationId: 'org-1',
      isActive: true,
      aiAnalysisActiveSnapshotId: 'snapshot-1',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      markModified() {},
      async save() {
        return this;
      },
      toObject() {
        return this;
      },
    };
    pack.aiAnalysis.phaseRuns = {
      phase_how: {
        status: 'pending',
        snapshotId: 'snapshot-1',
        remoteRunId: 'run-1',
      },
    };
    const callback = {
      runId: 'run-1',
      status: 'completed',
      job: 'phase_how',
      projectId: 'project-1',
      packId: 'pack-1',
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      result: {
        job: 'phase_how',
        container: {
          planning: { tasks: [{ id: 'A' }] },
          phaseRuns: { phase_how: { status: 'ready' } },
        },
      },
    };
    RequirementPack.findOne = async () => pack;
    const makeResponse = () => ({
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    });
    try {
      const response = makeResponse();
      await applyJobResult({ body: callback }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.success, true);
      assert.equal(pack.aiAnalysis.phaseRuns.phase_how.status, 'ready');
    } finally {
      RequirementPack.findOne = originalFindOne;
    }
  });

  it('phase planning start uses buildPhaseToolData (no empty toolData hardcode)', () => {
    const source = readFileSync(
      join(__dirname, '../src/services/aiAnalysis.service.js'),
      'utf8'
    );
    assert.match(source, /buildPhaseToolData/);
    assert.match(source, /startPhaseAiPlanningRun/);
    assert.doesNotMatch(source, /toolData:\s*\{\s*\}/);
    assert.doesNotMatch(source, /runEffortEngine\s*\(/);
    assert.doesNotMatch(source, /runEmployeeMatching\s*\(/);
    assert.doesNotMatch(source, /runSequencingCpm\s*\(/);
    assert.doesNotMatch(source, /runScheduleCapacity\s*\(/);
    assert.match(source, /validateAssignmentsAgainstShortlist/);
  });
});

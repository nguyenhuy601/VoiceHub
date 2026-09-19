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

  it('routes only deterministic HOW jobs remotely (LLM WHAT stays local)', () => {
    assert.equal(shouldRunRemoteAiPlanning('effortRoleAnalysis'), true);
    assert.equal(shouldRunRemoteAiPlanning('scheduleCapacity'), true);
    assert.equal(shouldRunRemoteAiPlanning('sequencingCpm'), true);
    assert.equal(shouldRunRemoteAiPlanning('employeeMatching'), true);
    assert.equal(shouldRunRemoteAiPlanning('requirementAnalysis'), false);
    assert.equal(shouldRunRemoteAiPlanning('architectureRiskAnalysis'), false);
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

  it('detects callback replay by runId', () => {
    const container = {
      jobs: { sequencingCpm: { remoteRunId: 'run-123', status: 'ready' } },
    };
    assert.equal(isDuplicateRemoteRun(container, 'sequencingCpm', 'run-123'), true);
    assert.equal(isDuplicateRemoteRun(container, 'sequencingCpm', 'run-456'), false);
  });

  it('applies a completed callback once and treats replay as idempotent', async () => {
    const originalFindOne = RequirementPack.findOne;
    const originalFindOneAndUpdate = RequirementPack.findOneAndUpdate;
    let updateCount = 0;
    let conditionalFilter;
    const pack = {
      _id: 'pack-1',
      projectId: 'project-1',
      aiAnalysisActiveSnapshotId: 'snapshot-1',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      markModified() {},
      toObject() {
        return this;
      },
    };
    pack.aiAnalysis.jobs.sequencingCpm = {
      ...pack.aiAnalysis.jobs.sequencingCpm,
      status: 'pending',
      snapshotId: 'snapshot-1',
      remoteRunId: 'run-1',
    };
    RequirementPack.findOne = async () => pack;
    RequirementPack.findOneAndUpdate = async (filter, update) => {
      conditionalFilter = filter;
      updateCount += 1;
      pack.aiAnalysis = update.$set.aiAnalysis;
      return pack;
    };
    const callback = {
      runId: 'run-1',
      status: 'completed',
      job: 'sequencingCpm',
      projectId: 'project-1',
      packId: 'pack-1',
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      result: {
        job: 'sequencingCpm',
        container: {
          planning: {
            sequence: { waves: [['A']] },
            theoreticalCpm: { projectDurationHours: 8 },
            criticalWorkIds: ['A'],
          },
          jobs: {
            sequencingCpm: { status: 'ready', generatedAt: '2026-09-19T00:00:00.000Z' },
          },
        },
      },
    };
    try {
      const first = await applyRemoteHowJobResult(callback);
      const replay = await applyRemoteHowJobResult(callback);
      assert.equal(first.applied, true);
      assert.equal(replay.idempotent, true);
      assert.equal(updateCount, 1);
      assert.equal(
        conditionalFilter['aiAnalysis.jobs.sequencingCpm.remoteRunId'],
        'run-1'
      );
      assert.equal(
        conditionalFilter['aiAnalysis.jobs.sequencingCpm.snapshotId'],
        'snapshot-1'
      );
      assert.equal(
        conditionalFilter['aiAnalysis.jobs.sequencingCpm.status'],
        'pending'
      );
      assert.equal(pack.aiAnalysis.jobs.sequencingCpm.remoteRunId, 'run-1');
    } finally {
      RequirementPack.findOne = originalFindOne;
      RequirementPack.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  it('ACKs an older out-of-order run as stale without updating', async () => {
    const originalFindOne = RequirementPack.findOne;
    const originalFindOneAndUpdate = RequirementPack.findOneAndUpdate;
    const pack = {
      projectId: 'project-1',
      aiAnalysisActiveSnapshotId: 'snapshot-1',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      toObject() {
        return this;
      },
    };
    pack.aiAnalysis.jobs.employeeMatching = {
      status: 'pending',
      snapshotId: 'snapshot-1',
      remoteRunId: 'run-new',
    };
    RequirementPack.findOne = async () => pack;
    RequirementPack.findOneAndUpdate = async () => {
      assert.fail('stale callback must not update');
    };
    try {
      const result = await applyRemoteHowJobResult({
        runId: 'run-old',
        status: 'failed',
        job: 'employeeMatching',
        projectId: 'project-1',
        packId: 'pack-1',
        organizationId: 'org-1',
        snapshotId: 'snapshot-1',
        error: { code: 'OLD' },
      });
      assert.equal(result.applied, false);
      assert.equal(result.stale, true);
    } finally {
      RequirementPack.findOne = originalFindOne;
      RequirementPack.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  it('validates callback job, project and stale snapshot identifiers', async () => {
    const originalFindOne = RequirementPack.findOne;
    RequirementPack.findOne = async () => ({
      projectId: 'project-expected',
      aiAnalysisActiveSnapshotId: 'snapshot-active',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      toObject() {
        return this;
      },
    });
    const base = {
      runId: 'run-1',
      status: 'failed',
      job: 'sequencingCpm',
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
            job: 'requirementAnalysis',
          }),
        (error) => error.errorCode === 'REMOTE_HOW_JOB_INVALID'
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

  it('returns non-ACK on CAS miss, then applies the callback retry', async () => {
    const originalFindOne = RequirementPack.findOne;
    const originalFindOneAndUpdate = RequirementPack.findOneAndUpdate;
    let updateAttempts = 0;
    const pack = {
      _id: 'pack-1',
      projectId: 'project-1',
      organizationId: 'org-1',
      isActive: true,
      updatedAt: new Date('2026-09-19T00:00:00.000Z'),
      aiAnalysisActiveSnapshotId: 'snapshot-1',
      aiAnalysis: createEmptyAiAnalysisContainer(),
      functionalRequirements: [],
      toObject() {
        return this;
      },
    };
    pack.aiAnalysis.jobs.sequencingCpm = {
      status: 'pending',
      snapshotId: 'snapshot-1',
      remoteRunId: 'run-1',
    };
    const callback = {
      runId: 'run-1',
      status: 'completed',
      job: 'sequencingCpm',
      projectId: 'project-1',
      packId: 'pack-1',
      organizationId: 'org-1',
      snapshotId: 'snapshot-1',
      result: {
        job: 'sequencingCpm',
        container: {
          planning: {
            sequence: { waves: [['A']] },
            theoreticalCpm: { projectDurationHours: 8 },
            criticalWorkIds: ['A'],
          },
          jobs: { sequencingCpm: { status: 'ready' } },
        },
      },
    };
    RequirementPack.findOne = async () => {
      const {
        toObject: _toObject,
        ...plainPack
      } = pack;
      const fresh = structuredClone(plainPack);
      fresh.toObject = function toObject() {
        return this;
      };
      return fresh;
    };
    RequirementPack.findOneAndUpdate = async (_filter, update) => {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        pack.updatedAt = new Date('2026-09-19T00:00:01.000Z');
        return null;
      }
      pack.aiAnalysis = update.$set.aiAnalysis;
      return pack;
    };
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
      const firstResponse = makeResponse();
      await applyJobResult({ body: callback }, firstResponse);
      assert.equal(firstResponse.statusCode, 409);
      assert.equal(firstResponse.body.errorCode, 'REMOTE_RESULT_CAS_RETRY');
      assert.equal(pack.aiAnalysis.jobs.sequencingCpm.status, 'pending');

      const retryResponse = makeResponse();
      await applyJobResult({ body: callback }, retryResponse);
      assert.equal(retryResponse.statusCode, 200);
      assert.equal(retryResponse.body.success, true);
      assert.equal(pack.aiAnalysis.jobs.sequencingCpm.status, 'ready');
    } finally {
      RequirementPack.findOne = originalFindOne;
      RequirementPack.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  it('strips in-process HOW engine calls from aiAnalysis.service', () => {
    const source = readFileSync(
      join(__dirname, '../src/services/aiAnalysis.service.js'),
      'utf8'
    );
    assert.doesNotMatch(source, /runEffortEngine\s*\(/);
    assert.doesNotMatch(source, /runEmployeeMatching\s*\(/);
    assert.doesNotMatch(source, /runSequencingCpm\s*\(/);
    assert.doesNotMatch(source, /runScheduleCapacity\s*\(/);
    assert.doesNotMatch(source, /runRoleSkillPlanning\s*\(/);
    assert.match(source, /HOW_INPROCESS_REMOVED/);
    assert.match(source, /buildExecutionPlanFromContainer/);
    assert.match(source, /applyProjectPlanToContainer/);
    assert.match(source, /validateAssignmentsAgainstShortlist/);
  });
});

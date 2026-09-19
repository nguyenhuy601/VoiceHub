const { describe, it, test } = require('node:test');
const assert = require('node:assert/strict');

const { PlanningRun } = require('../src/run/PlanningRun.model');
const {
  claimRunExecution,
  deliverRunCallback,
  processRunAsync,
  recoverExpiredCallbackLeases,
  validateStartBody,
} = require('../src/controllers/internalPlanning.controller');

function installRunModelStub(initial) {
  const originalFindById = PlanningRun.findById;
  const originalFindOneAndUpdate = PlanningRun.findOneAndUpdate;
  const state = structuredClone(initial);
  PlanningRun.findById = () => ({
    lean: async () => structuredClone(state),
  });
  PlanningRun.findOneAndUpdate = (filter, mutation) => ({
    lean: async () => {
      const matches = (candidate) => {
        for (const [key, expected] of Object.entries(candidate)) {
          if (key === '$or') {
            if (!expected.some(matches)) return false;
          } else if (expected && typeof expected === 'object' && '$lt' in expected) {
            if (!(Number(state[key] || 0) < expected.$lt)) return false;
          } else if (expected && typeof expected === 'object' && '$lte' in expected) {
            if (!(new Date(state[key] || 0) <= expected.$lte)) return false;
          } else if (expected && typeof expected === 'object' && '$ne' in expected) {
            if (state[key] === expected.$ne) return false;
          } else if (String(state[key]) !== String(expected)) {
            return false;
          }
        }
        return true;
      };
      if (!matches(filter)) return null;
      Object.assign(state, mutation.$set || {});
      for (const [key, amount] of Object.entries(mutation.$inc || {})) {
        state[key] = Number(state[key] || 0) + amount;
      }
      for (const key of Object.keys(mutation.$unset || {})) delete state[key];
      return structuredClone(state);
    },
  });
  return {
    state,
    restore() {
      PlanningRun.findById = originalFindById;
      PlanningRun.findOneAndUpdate = originalFindOneAndUpdate;
    },
  };
}

function pendingRun() {
  return {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    status: 'callback_pending',
    activeKey: 'pack-1|sequencingCpm',
    callbackAttempts: 0,
    callbackPayload: {
      runId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'completed',
      job: 'sequencingCpm',
    },
  };
}

describe('authoritative callback lifecycle', () => {
  it('completes only after callback ACK', async () => {
    const stub = installRunModelStub(pendingRun());
    try {
      await deliverRunCallback(stub.state._id, {
        notify: async () => ({ status: 200, data: { success: true } }),
        scheduleRetry: false,
      });
      assert.equal(stub.state.status, 'completed');
      assert.equal(stub.state.callbackAttempts, 1);
      assert.ok(stub.state.callbackAckedAt);
      assert.equal(stub.state.activeKey, undefined);
    } finally {
      stub.restore();
    }
  });

  it('persists transient failure then succeeds on retry', async () => {
    const stub = installRunModelStub(pendingRun());
    let calls = 0;
    const notify = async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary');
        error.code = 'ECONNRESET';
        throw error;
      }
      return { status: 200, data: { success: true } };
    };
    try {
      await deliverRunCallback(stub.state._id, {
        notify,
        scheduleRetry: false,
      });
      assert.equal(stub.state.status, 'callback_pending');
      assert.equal(stub.state.callbackAttempts, 1);
      assert.equal(stub.state.callbackLastError.code, 'ECONNRESET');

      stub.state.callbackNextRetryAt = new Date(Date.now() - 1);
      await deliverRunCallback(stub.state._id, {
        notify,
        scheduleRetry: false,
      });
      assert.equal(stub.state.status, 'completed');
      assert.equal(stub.state.callbackAttempts, 2);
      assert.equal(calls, 2);
    } finally {
      stub.restore();
    }
  });

  it('does not redeliver an already completed run', async () => {
    const run = pendingRun();
    run.status = 'completed';
    const stub = installRunModelStub(run);
    let calls = 0;
    try {
      await deliverRunCallback(stub.state._id, {
        notify: async () => {
          calls += 1;
        },
        scheduleRetry: false,
      });
      assert.equal(calls, 0);
    } finally {
      stub.restore();
    }
  });

  it('atomically allows only one parallel callback delivery', async () => {
    const stub = installRunModelStub(pendingRun());
    let calls = 0;
    try {
      await Promise.all([
        deliverRunCallback(stub.state._id, {
          notify: async () => {
            calls += 1;
            await new Promise((resolve) => setImmediate(resolve));
          },
          scheduleRetry: false,
        }),
        deliverRunCallback(stub.state._id, {
          notify: async () => {
            calls += 1;
          },
          scheduleRetry: false,
        }),
      ]);
      assert.equal(calls, 1);
      assert.equal(stub.state.status, 'completed');
      assert.equal(stub.state.callbackAttempts, 1);
    } finally {
      stub.restore();
    }
  });

  it('honors callbackNextRetryAt before claiming delivery', async () => {
    const run = pendingRun();
    run.callbackNextRetryAt = new Date(Date.now() + 60_000);
    const stub = installRunModelStub(run);
    let calls = 0;
    try {
      await deliverRunCallback(stub.state._id, {
        notify: async () => {
          calls += 1;
        },
        scheduleRetry: false,
      });
      assert.equal(calls, 0);
      assert.equal(stub.state.status, 'callback_pending');
    } finally {
      stub.restore();
    }
  });
});

describe('remote run start validation', () => {
  it('requires identifiers, callback config and a non-null container', () => {
    const previousUrl = process.env.PROJECT_SERVICE_URL;
    const previousToken = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.PROJECT_SERVICE_URL = 'http://project-service:3007';
    process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';
    try {
      assert.throws(
        () =>
          validateStartBody({
            packId: 'pack-1',
            organizationId: 'org-1',
            snapshotId: 'snap-1',
            job: 'sequencingCpm',
            input: { container: null },
          }),
        (error) => error.code === 'RUN_INPUT_INVALID'
      );
      assert.throws(
        () =>
          validateStartBody({
            packId: 'pack-1',
            organizationId: 'org-1',
            snapshotId: 'snap-1',
            job: 'unknown',
            input: { container: {} },
          }),
        (error) => error.code === 'HOW_JOB_UNSUPPORTED'
      );
      assert.doesNotThrow(() =>
        validateStartBody({
          runId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          packId: 'pack-1',
          organizationId: 'org-1',
          snapshotId: 'snap-1',
          job: 'sequencingCpm',
          input: { container: {} },
        })
      );
    } finally {
      if (previousUrl == null) delete process.env.PROJECT_SERVICE_URL;
      else process.env.PROJECT_SERVICE_URL = previousUrl;
      if (previousToken == null) delete process.env.GATEWAY_INTERNAL_TOKEN;
      else process.env.GATEWAY_INTERNAL_TOKEN = previousToken;
    }
  });

  it('rejects oversized employee arrays', () => {
    const previousUrl = process.env.PROJECT_SERVICE_URL;
    const previousToken = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.PROJECT_SERVICE_URL = 'http://project-service:3007';
    process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';
    try {
      assert.throws(
        () =>
          validateStartBody({
            packId: 'pack-1',
            organizationId: 'org-1',
            snapshotId: 'snap-1',
            job: 'employeeMatching',
            input: {
              container: {},
              toolData: { employees: Array.from({ length: 201 }, () => ({})) },
            },
          }),
        (error) => error.code === 'RUN_INPUT_TOO_LARGE'
      );
    } finally {
      if (previousUrl == null) delete process.env.PROJECT_SERVICE_URL;
      else process.env.PROJECT_SERVICE_URL = previousUrl;
      if (previousToken == null) delete process.env.GATEWAY_INTERNAL_TOKEN;
      else process.env.GATEWAY_INTERNAL_TOKEN = previousToken;
    }
  });

  it('rejects oversized identifiers, request keys and object keys', () => {
    const previousUrl = process.env.PROJECT_SERVICE_URL;
    const previousToken = process.env.GATEWAY_INTERNAL_TOKEN;
    process.env.PROJECT_SERVICE_URL = 'http://project-service:3007';
    process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';
    const base = {
      packId: 'pack-1',
      organizationId: 'org-1',
      snapshotId: 'snap-1',
      job: 'sequencingCpm',
      input: { container: {} },
    };
    try {
      assert.throws(
        () => validateStartBody({ ...base, packId: 'p'.repeat(129) }),
        (error) => error.code === 'RUN_IDENTIFIERS_INVALID'
      );
      assert.throws(
        () => validateStartBody({ ...base, requestKey: 'r'.repeat(257) }),
        (error) => error.code === 'RUN_IDENTIFIERS_INVALID'
      );
      assert.throws(
        () =>
          validateStartBody({
            ...base,
            input: { container: { ['k'.repeat(129)]: true } },
          }),
        (error) => error.code === 'RUN_INPUT_TOO_LARGE'
      );
      assert.throws(
        () =>
          validateStartBody({
            ...base,
            input: {
              container: Object.fromEntries(
                Array.from({ length: 2001 }, (_, index) => [`k${index}`, true])
              ),
            },
          }),
        (error) => error.code === 'RUN_INPUT_TOO_LARGE'
      );
    } finally {
      if (previousUrl == null) delete process.env.PROJECT_SERVICE_URL;
      else process.env.PROJECT_SERVICE_URL = previousUrl;
      if (previousToken == null) delete process.env.GATEWAY_INTERNAL_TOKEN;
      else process.env.GATEWAY_INTERNAL_TOKEN = previousToken;
    }
  });
});

describe('execution claim and cancel fence', () => {
  function executableRun(overrides = {}) {
    return {
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      status: 'queued',
      attempt: 0,
      job: 'sequencingCpm',
      snapshotId: 'snap-1',
      packId: 'pack-1',
      organizationId: 'org-1',
      input: { container: { jobs: {}, planning: { tasks: [] }, analyses: {} } },
      ...overrides,
    };
  }

  it('claims a queued run after restart', async () => {
    const stub = installRunModelStub(executableRun());
    try {
      const claim = await claimRunExecution(stub.state._id, {
        now: new Date('2026-09-19T00:00:00.000Z'),
        executionLeaseOwner: 'worker-a',
      });
      assert.equal(claim.executionLeaseOwner, 'worker-a');
      assert.equal(stub.state.status, 'running');
      assert.equal(stub.state.attempt, 1);
    } finally {
      stub.restore();
    }
  });

  it('reclaims stale running but skips an active lease', async () => {
    const now = new Date('2026-09-19T00:00:00.000Z');
    const stale = installRunModelStub(
      executableRun({
        status: 'running',
        attempt: 1,
        executionLeaseExpiresAt: new Date(now.getTime() - 1),
      })
    );
    try {
      const claim = await claimRunExecution(stale.state._id, {
        now,
        executionLeaseOwner: 'worker-b',
      });
      assert.ok(claim);
      assert.equal(stale.state.attempt, 2);
    } finally {
      stale.restore();
    }

    const active = installRunModelStub(
      executableRun({
        status: 'running',
        attempt: 1,
        executionLeaseExpiresAt: new Date(now.getTime() + 60_000),
      })
    );
    try {
      const claim = await claimRunExecution(active.state._id, {
        now,
        executionLeaseOwner: 'worker-c',
      });
      assert.equal(claim, null);
      assert.equal(active.state.attempt, 1);
    } finally {
      active.restore();
    }

    const exhausted = installRunModelStub(
      executableRun({
        status: 'running',
        attempt: 3,
        executionLeaseExpiresAt: new Date(now.getTime() - 1),
      })
    );
    try {
      const claim = await claimRunExecution(exhausted.state._id, {
        now,
        executionLeaseOwner: 'worker-d',
      });
      assert.equal(claim, null);
      assert.equal(exhausted.state.attempt, 3);
    } finally {
      exhausted.restore();
    }
  });

  it('does not stage a callback when cancelled during engine execution', async () => {
    const stub = installRunModelStub(executableRun());
    let releaseEngine;
    const engineGate = new Promise((resolve) => {
      releaseEngine = resolve;
    });
    try {
      const processing = processRunAsync(stub.state._id, {
        runJob: async () => {
          await engineGate;
          return {
            job: 'sequencingCpm',
            container: {},
            evidence: [],
          };
        },
      });
      await new Promise((resolve) => setImmediate(resolve));
      stub.state.status = 'cancelled';
      stub.state.executionLeaseOwner = null;
      releaseEngine();
      await processing;
      assert.equal(stub.state.status, 'cancelled');
      assert.equal(stub.state.callbackPayload, undefined);
    } finally {
      stub.restore();
    }
  });
});

test('expired callback delivery lease returns to pending for recovery', async () => {
  const originalUpdateMany = PlanningRun.updateMany;
  const observed = [];
  PlanningRun.updateMany = async (filter, update) => {
    observed.push({ filter, update });
    return { modifiedCount: filter.callbackAttempts.$lt ? 1 : 0 };
  };
  const now = new Date('2026-09-19T00:00:00.000Z');
  try {
    const result = await recoverExpiredCallbackLeases(now);
    assert.equal(result.recoveredCount, 1);
    assert.equal(result.exhaustedCount, 0);
    assert.equal(observed[1].filter.status, 'callback_delivering');
    assert.deepEqual(observed[1].filter.callbackLeaseExpiresAt, { $lte: now });
    assert.deepEqual(observed[1].filter.callbackAttempts, { $lt: 5 });
    assert.equal(observed[1].update.$set.status, 'callback_pending');
    assert.equal(observed[1].update.$set.callbackNextRetryAt, now);
    assert.equal(observed[1].update.$set.callbackLeaseOwner, null);
  } finally {
    PlanningRun.updateMany = originalUpdateMany;
  }
});

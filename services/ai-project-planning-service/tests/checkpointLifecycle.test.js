const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LIFECYCLE,
  classifyCheckpointLifecycle,
  clearCheckpointIfTerminal,
} = require('../src/checkpoint/checkpointLifecycle');

describe('checkpointLifecycle', () => {
  it('completed/cancelled/expired → TERMINAL', () => {
    assert.equal(
      classifyCheckpointLifecycle({ status: 'completed' }),
      LIFECYCLE.TERMINAL
    );
    assert.equal(
      classifyCheckpointLifecycle({ status: 'cancelled' }),
      LIFECYCLE.TERMINAL
    );
    assert.equal(
      classifyCheckpointLifecycle({ status: 'expired' }),
      LIFECYCLE.TERMINAL
    );
  });

  it('failed + seekable checkpoint → RESUMABLE', () => {
    const lc = classifyCheckpointLifecycle({
      status: 'failed',
      error: { code: 'TOOL_TIMEOUT' },
      checkpoint: { currentToolIndex: 3, container: { analyses: {} } },
    });
    assert.equal(lc, LIFECYCLE.RESUMABLE);
  });

  it('failed + non-resumable → TERMINAL', () => {
    assert.equal(
      classifyCheckpointLifecycle({
        status: 'failed',
        error: { code: 'EXECUTION_RETRY_EXHAUSTED' },
        checkpoint: { currentToolIndex: 1 },
      }),
      LIFECYCLE.TERMINAL
    );
    assert.equal(
      classifyCheckpointLifecycle({
        status: 'failed',
        error: { code: 'AGENT_PHASE_FAILED' },
        checkpoint: null,
      }),
      LIFECYCLE.TERMINAL
    );
  });

  it('running → ACTIVE', () => {
    assert.equal(
      classifyCheckpointLifecycle({ status: 'running' }),
      LIFECYCLE.ACTIVE
    );
  });

  it('clearCheckpointIfTerminal deletes only TERMINAL', async () => {
    const deleted = [];
    const deps = {
      deleteCheckpoint: async (id) => {
        deleted.push(id);
      },
      env: { AGENT_STATE_KEEP_TERMINAL: '0' },
    };
    const keep = await clearCheckpointIfTerminal(
      'run-1',
      { status: 'failed', checkpoint: { currentToolIndex: 0, container: {} } },
      deps
    );
    assert.equal(keep.deleted, false);
    assert.equal(keep.lifecycle, LIFECYCLE.RESUMABLE);

    const gone = await clearCheckpointIfTerminal(
      'run-2',
      { status: 'completed' },
      deps
    );
    assert.equal(gone.deleted, true);
    assert.deepEqual(deleted, ['run-2']);
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  whitelistLiveRun,
  phaseNeedsLiveRun,
  resolveInFlightPhaseRun,
} = require('../src/utils/aiAnalysis/attachLiveRun');

describe('wave1 attachLiveRun', () => {
  it('whitelistLiveRun strips heavy fields', () => {
    const out = whitelistLiveRun({
      runId: 'r1',
      status: 'running',
      currentNode: 'executeG4',
      stage: 'executeG4',
      computeStatus: 'running',
      callbackStatus: 'none',
      result: { huge: true },
      evidence: [1, 2, 3],
    });
    assert.equal(out.runId, 'r1');
    assert.equal(out.result, undefined);
    assert.equal(out.evidence, undefined);
  });

  it('whitelistLiveRun keeps pipeline progress and caps gate preview', () => {
    const flagged = Array.from({ length: 40 }, (_, i) => ({
      frId: `FR-${i}`,
      title: `t${i}`,
      flags: ['missing_actor'],
    }));
    const out = whitelistLiveRun({
      runId: 'r2',
      status: 'waiting_human',
      pipelineStep: 2,
      pipelineSubstep: 'quality',
      gate: 'data_review',
      gatePreview: {
        frCount: 40,
        flagged,
        signals: [{ text: 'corpus' }],
      },
      checkpoint: { state: { corpus: 'nope' } },
      input: { snapshot: { raw: true } },
    });
    assert.equal(out.pipelineStep, 2);
    assert.equal(out.pipelineSubstep, 'quality');
    assert.equal(out.gate, 'data_review');
    assert.equal(out.gatePreview.flagged.length, 30);
    assert.equal(out.gatePreview.signals, undefined);
    assert.equal(out.checkpoint, undefined);
    assert.equal(out.input, undefined);
  });

  it('omits rows unless a page is requested', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      frId: `FR-${i}`,
      title: `title ${i}`,
      actors: ['BA'],
      actions: ['review'],
      signals: { text: 'secret' },
    }));
    const base = {
      runId: 'r3',
      status: 'waiting_human',
      gatePreview: { frCount: 25, rowTotal: 25, rows, flagged: [] },
    };
    const poll = whitelistLiveRun(base);
    assert.equal(poll.gatePreview.rowTotal, 25);
    assert.equal(poll.gatePreview.rows, undefined);
    assert.equal(poll.gatePreview.signals, undefined);

    const page = whitelistLiveRun(base, { offset: 0, limit: 20 });
    assert.equal(page.gatePreview.rows.length, 20);
    assert.equal(page.gatePreview.rows[0].frId, 'FR-0');
    assert.deepEqual(page.gatePreview.rows[0].actors, ['BA']);
    assert.equal(page.gatePreview.rows[0].signals, undefined);
  });

  it('phaseNeedsLiveRun only when pending+remoteRunId', () => {
    assert.equal(phaseNeedsLiveRun({ status: 'pending', remoteRunId: 'x' }), true);
    assert.equal(phaseNeedsLiveRun({ status: 'ready', remoteRunId: 'x' }), false);
    assert.equal(phaseNeedsLiveRun({ status: 'pending' }), false);
    assert.equal(phaseNeedsLiveRun({ status: 'waiting_human', remoteRunId: 'x' }), true);
  });

  it('resolveInFlightPhaseRun prefers what over how', () => {
    const picked = resolveInFlightPhaseRun({
      phase_what: { status: 'pending', remoteRunId: 'what-run' },
      phase_how: { status: 'pending', remoteRunId: 'how-run' },
    });
    assert.equal(picked.key, 'phase_what');
    assert.equal(picked.meta.remoteRunId, 'what-run');
  });

  it('resolveInFlightPhaseRun uses phase_how when what done', () => {
    const picked = resolveInFlightPhaseRun({
      phase_what: { status: 'ready', remoteRunId: 'what-run' },
      phase_how: { status: 'pending', remoteRunId: 'how-run' },
    });
    assert.equal(picked.key, 'phase_how');
    assert.equal(picked.meta.remoteRunId, 'how-run');
  });

  it('resolveInFlightPhaseRun null when neither in-flight', () => {
    assert.equal(
      resolveInFlightPhaseRun({
        phase_what: { status: 'ready', remoteRunId: 'what-run' },
        phase_how: { status: 'ready', remoteRunId: 'how-run' },
      }),
      null
    );
  });
});


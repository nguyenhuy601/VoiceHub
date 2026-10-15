import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPhaseInFlightStatus,
  protectPackDuringFreshRunAwait,
} from './freshRunUiGuard.js';

describe('freshRunUiGuard', () => {
  it('treats queued/pending as in-flight', () => {
    assert.equal(isPhaseInFlightStatus('queued'), true);
    assert.equal(isPhaseInFlightStatus('pending'), true);
    assert.equal(isPhaseInFlightStatus('ready'), false);
  });

  it('keeps optimistic WHAT clear when poll still returns ready pack', () => {
    const prev = {
      status: 'draft',
      aiAnalysis: {
        analyses: {},
        gate1: { activeSubmissionId: null },
        phaseRuns: {
          phase_what: { status: 'pending', remoteRunId: null },
        },
      },
    };
    const next = {
      status: 'under_review',
      liveRun: { status: 'completed', runId: 'old' },
      aiAnalysis: {
        analyses: { g4Understanding: { requirements: [{ id: '1' }] } },
        gate1: { activeSubmissionId: 'sub-1' },
        phaseRuns: {
          phase_what: { status: 'ready', remoteRunId: 'old' },
        },
      },
    };
    const { pack, release } = protectPackDuringFreshRunAwait(prev, next, 'what');
    assert.equal(release, false);
    assert.equal(pack.status, 'draft');
    assert.equal(pack.aiAnalysis.phaseRuns.phase_what.status, 'pending');
    assert.deepEqual(pack.aiAnalysis.analyses, {});
    assert.equal(pack.aiAnalysis.gate1.activeSubmissionId, null);
  });

  it('releases when server shows new in-flight phase', () => {
    const prev = {
      status: 'draft',
      aiAnalysis: {
        analyses: {},
        phaseRuns: { phase_what: { status: 'pending' } },
      },
    };
    const next = {
      status: 'draft',
      liveRun: { status: 'running', runId: 'new' },
      aiAnalysis: {
        analyses: {},
        phaseRuns: { phase_what: { status: 'pending', remoteRunId: 'new' } },
      },
    };
    const { pack, release } = protectPackDuringFreshRunAwait(prev, next, 'what');
    assert.equal(release, true);
    assert.equal(pack.liveRun.runId, 'new');
  });

  it('keeps cleared HOW planning while awaiting', () => {
    const prev = {
      status: 'approved',
      aiAnalysis: {
        planning: undefined,
        analyses: {},
        phaseRuns: { phase_how: { status: 'pending' } },
      },
    };
    const next = {
      status: 'approved',
      aiAnalysis: {
        planning: { tasks: [{ id: 't1' }] },
        analyses: { dependency: { edges: [] } },
        phaseRuns: { phase_how: { status: 'ready' } },
      },
    };
    const { pack, release } = protectPackDuringFreshRunAwait(prev, next, 'how');
    assert.equal(release, false);
    assert.equal(pack.aiAnalysis.planning, undefined);
    assert.equal(pack.aiAnalysis.phaseRuns.phase_how.status, 'pending');
  });
});

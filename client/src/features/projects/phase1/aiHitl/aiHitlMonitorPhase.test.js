import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAiHitlMonitorPhase } from './aiHitlMonitorPhase.js';

describe('resolveAiHitlMonitorPhase', () => {
  it('treats queued liveRun as WHAT in-flight (re-run clear)', () => {
    const phase = resolveAiHitlMonitorPhase({
      packStatus: 'draft',
      phaseWhat: { status: 'ready' },
      liveRun: { status: 'queued' },
    });
    assert.equal(phase, 'what');
  });

  it('keeps WHAT when phase_what is pending', () => {
    const phase = resolveAiHitlMonitorPhase({
      packStatus: 'under_review',
      phaseWhat: { status: 'pending' },
      liveRun: null,
    });
    assert.equal(phase, 'what');
  });
});

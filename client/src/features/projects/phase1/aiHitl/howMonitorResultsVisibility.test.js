import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowHowMonitorResults } from './howMonitorResultsVisibility.js';

describe('shouldShowHowMonitorResults', () => {
  it('false when pack empty', () => {
    assert.equal(shouldShowHowMonitorResults(null), false);
    assert.equal(shouldShowHowMonitorResults({}), false);
  });

  it('true when HOW planning has tasks', () => {
    const pack = {
      aiAnalysis: {
        phaseRuns: { phase_how: { status: 'ready' } },
        planning: {
          tasks: [{ id: 'T1', name: 'Build API', level: 'task', effortHours: 8 }],
        },
      },
    };
    assert.equal(shouldShowHowMonitorResults(pack), true);
  });
});

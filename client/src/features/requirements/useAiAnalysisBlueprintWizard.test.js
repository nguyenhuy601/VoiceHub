import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_ANALYSIS_JOB_WALL_MS,
  AI_ANALYSIS_POLL_SLACK_MS,
  pollAiAnalysisJob,
  resolveAiAnalysisPollTimeoutMs,
} from './aiAnalysisPolling.js';

test('pollAiAnalysisJob backs off until the remote job is ready', async () => {
  const statuses = ['pending', 'pending', 'ready'];
  const delays = [];
  const seen = [];
  const result = await pollAiAnalysisJob({
    job: 'sequencingCpm',
    fetchSummary: async () => ({
      jobs: { sequencingCpm: { status: statuses.shift() } },
    }),
    onSummary: (summary) => seen.push(summary.jobs.sequencingCpm.status),
    wait: async (delayMs) => delays.push(delayMs),
    initialDelayMs: 10,
    maxDelayMs: 20,
  });
  assert.deepEqual(seen, ['pending', 'pending', 'ready']);
  assert.deepEqual(delays, [10, 15]);
  assert.equal(result.jobs.sequencingCpm.status, 'ready');
});

test('pollAiAnalysisJob stops without another request after cancellation', async () => {
  let calls = 0;
  let cancelled = false;
  const result = await pollAiAnalysisJob({
    job: 'employeeMatching',
    fetchSummary: async () => {
      calls += 1;
      return { jobs: { employeeMatching: { status: 'pending' } } };
    },
    onSummary: () => {
      cancelled = true;
    },
    isCancelled: () => cancelled,
    wait: async () => {},
  });
  assert.equal(result, null);
  assert.equal(calls, 1);
});

test('resolveAiAnalysisPollTimeoutMs is wall + slack (covers BE 180s jobs)', () => {
  assert.equal(
    resolveAiAnalysisPollTimeoutMs('employeeMatching'),
    AI_ANALYSIS_JOB_WALL_MS.employeeMatching + AI_ANALYSIS_POLL_SLACK_MS
  );
  assert.equal(
    resolveAiAnalysisPollTimeoutMs('scheduleCapacity'),
    180_000 + AI_ANALYSIS_POLL_SLACK_MS
  );
  assert.equal(
    resolveAiAnalysisPollTimeoutMs('requirementAnalysis'),
    300_000 + AI_ANALYSIS_POLL_SLACK_MS
  );
  assert.ok(resolveAiAnalysisPollTimeoutMs('employeeMatching') > 120_000);
});

test('pollAiAnalysisJob does not timeout before wall+slack for long HOW jobs', async () => {
  let now = 0;
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    let calls = 0;
    await assert.rejects(
      () =>
        pollAiAnalysisJob({
          job: 'employeeMatching',
          timeoutMs: resolveAiAnalysisPollTimeoutMs('employeeMatching'),
          fetchSummary: async () => {
            calls += 1;
            // After first poll (~0ms), jump past legacy 120s but before wall+slack (240s).
            if (calls === 1) now = 130_000;
            // Next iterations advance past wall+slack to prove timeout still works.
            if (calls >= 3) now = 241_000;
            return { jobs: { employeeMatching: { status: 'pending' } } };
          },
          wait: async () => {
            now += 1;
          },
          initialDelayMs: 1,
          maxDelayMs: 1,
        }),
      (err) => err?.code === 'AI_ANALYSIS_POLL_TIMEOUT'
    );
    assert.ok(calls >= 3, 'should keep polling past 120s until wall+slack');
  } finally {
    Date.now = originalNow;
  }
});

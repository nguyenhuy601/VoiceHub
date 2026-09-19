import test from 'node:test';
import assert from 'node:assert/strict';
import { pollAiAnalysisJob } from './aiAnalysisPolling.js';

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

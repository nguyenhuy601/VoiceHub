import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirror unwrapTaskApiPayload — tránh import axios/vite trong unit node.
 * T3: sau interceptor body = { success, data }.
 */
function unwrapTaskApiPayload(res) {
  if (res == null) return null;
  const hasEnvelope =
    res?.data !== undefined && (res?.success !== undefined || res?.status !== undefined);
  const first = hasEnvelope ? res.data : res;
  if (
    first &&
    typeof first === 'object' &&
    first.data !== undefined &&
    (first.success !== undefined || first.status !== undefined)
  ) {
    return first.data;
  }
  return first;
}

describe('calendar feed unwrap', () => {
  it('unwraps interceptor body { success, data: { tasks } }', () => {
    const afterInterceptor = {
      success: true,
      data: { tasks: [{ _id: 't1', title: 'A', dueDate: '2026-09-10' }], total: 1 },
    };
    const payload = unwrapTaskApiPayload(afterInterceptor);
    assert.ok(payload);
    assert.equal(payload.tasks.length, 1);
    assert.equal(payload.tasks[0]._id, 't1');
    assert.equal(afterInterceptor.data?.data, undefined);
  });

  it('unwraps meetings shape', () => {
    const afterInterceptor = {
      success: true,
      data: { meetings: [{ _id: 'm1', startTime: '2026-09-10T10:00:00.000Z' }] },
    };
    const payload = unwrapTaskApiPayload(afterInterceptor);
    assert.equal(payload.meetings.length, 1);
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TASK_DOMAIN_EVENT_TYPES,
  isKnownTaskDomainEventType,
  buildTaskDomainEventEnvelope,
  routingKeyForTaskEventType,
} = require('../messaging/taskDomainEvents');

describe('taskDomainEvents', () => {
  it('knows catalog types', () => {
    assert.equal(isKnownTaskDomainEventType(TASK_DOMAIN_EVENT_TYPES.TASK_CREATED), true);
    assert.equal(isKnownTaskDomainEventType('task.v9.nope'), false);
  });

  it('builds v1 envelope', () => {
    const env = buildTaskDomainEventEnvelope({
      type: TASK_DOMAIN_EVENT_TYPES.WORKLOG_RECORDED,
      eventId: 'e1',
      organizationId: 'o1',
      taskId: 't1',
      payload: { hours: 2 },
    });
    assert.equal(env.schemaVersion, 1);
    assert.equal(env.type, TASK_DOMAIN_EVENT_TYPES.WORKLOG_RECORDED);
    assert.equal(env.payload.hours, 2);
  });

  it('rejects unknown type in envelope', () => {
    assert.throws(() => buildTaskDomainEventEnvelope({ type: 'nope' }));
  });

  it('routing key falls back to updated', () => {
    assert.equal(
      routingKeyForTaskEventType('unknown'),
      TASK_DOMAIN_EVENT_TYPES.TASK_UPDATED
    );
  });
});

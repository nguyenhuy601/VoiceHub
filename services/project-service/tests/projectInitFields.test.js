/**
 * Unit — G1 project init field validation (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectInitFields } = require('../src/utils/projectInitFields');

describe('buildProjectInitFields', () => {
  it('defaults to planning + kanban + internal on create', () => {
    const r = buildProjectInitFields({});
    assert.equal(r.ok, true);
    assert.equal(r.fields.status, 'planning');
    assert.equal(r.fields.methodology, 'kanban');
    assert.equal(r.fields.category, 'internal');
    assert.equal(r.fields.customer, undefined);
  });

  it('requires customer when category=customer', () => {
    const r = buildProjectInitFields({ category: 'customer' });
    assert.equal(r.ok, false);
    assert.match(r.message, /Customer/i);
  });

  it('accepts customer block', () => {
    const r = buildProjectInitFields({
      category: 'customer',
      customer: { name: 'Acme', company: 'Acme Co' },
    });
    assert.equal(r.ok, true);
    assert.equal(r.fields.customer.name, 'Acme');
  });

  it('validates scrum settings', () => {
    const r = buildProjectInitFields({
      methodology: 'scrum',
      sprintDurationDays: 14,
      sprintStartDay: 'monday',
    });
    assert.equal(r.ok, true);
    assert.equal(r.fields.methodologySettings.sprintDurationDays, 14);
  });

  it('partial patch can update status only', () => {
    const r = buildProjectInitFields({ status: 'ready_for_planning' }, { partial: true });
    assert.equal(r.ok, true);
    assert.equal(r.fields.status, 'ready_for_planning');
    assert.equal(r.fields.methodology, undefined);
  });
});

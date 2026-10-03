/**
 * FE unit — Planning list/form fields mirror Excel workbook catalog.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPlanningSubmitPayload,
  getPlanningListColumns,
} from './planningWorkbookFields.js';

describe('planningWorkbookFields', () => {
  it('list columns cover workbook fields + status/source', () => {
    const cols = getPlanningListColumns('WBS');
    const ids = cols.map((c) => c.id);
    assert.ok(ids.includes('externalKey'));
    assert.ok(ids.includes('startDate'));
    assert.ok(ids.includes('sourceFrKey'));
    assert.ok(ids.includes('status'));
    assert.ok(ids.includes('source'));

    const arch = getPlanningListColumns('ARCHITECTURE');
    assert.ok(arch.some((c) => c.id === 'techStack'));
    assert.ok(arch.some((c) => c.id === 'body'));
    assert.ok(!arch.some((c) => c.id === 'parentExternalKey'), 'parent only on WBS');

    const wbs = getPlanningListColumns('WBS');
    assert.ok(wbs.some((c) => c.id === 'parentExternalKey'));

    const risk = getPlanningListColumns('RISK');
    assert.ok(risk.some((c) => c.id === 'impact'));
    assert.ok(risk.some((c) => c.id === 'mitigation'));
    assert.ok(!risk.some((c) => c.id === 'parentExternalKey'));

    const res = getPlanningListColumns('RESOURCE');
    assert.ok(res.some((c) => c.id === 'roles'));
    assert.ok(!res.some((c) => c.id === 'parentExternalKey'));
  });

  it('buildPlanningSubmitPayload maps structured DEPENDENCY fields', () => {
    const payload = buildPlanningSubmitPayload('DEPENDENCY', {
      externalKey: 'D1',
      title: 'Dep',
      summary: '',
      parentExternalKey: '',
      fromKey: 'A',
      toKey: 'B',
      dependencyType: 'SS',
      lagDays: '2',
    });
    assert.equal(payload.structured.fromKey, 'A');
    assert.equal(payload.structured.dependencyType, 'SS');
    assert.equal(payload.structured.lagDays, 2);
  });

  it('buildPlanningSubmitPayload maps RESOURCE rolesDraft', () => {
    const payload = buildPlanningSubmitPayload('RESOURCE', {
      externalKey: 'RES-1',
      title: 'Plan',
      summary: '',
      parentExternalKey: '',
      effortHours: '10',
      rolesDraft: [
        {
          roleKey: 'dev',
          title: 'Developer',
          count: 2,
          skillKeysText: 'fullstack,qa',
          effortHours: '40',
          notes: '',
        },
      ],
    });
    assert.equal(payload.structured.effortHours, 10);
    assert.equal(payload.structured.roles.length, 1);
    assert.equal(payload.structured.roles[0].roleKey, 'dev');
    assert.deepEqual(payload.structured.roles[0].skillKeys, ['fullstack', 'qa']);
  });
});

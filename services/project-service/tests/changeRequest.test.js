/**
 * Unit — Change Request Phase 1 types + list filter (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CHANGE_REQUEST_TYPES,
  CHANGE_REQUEST_PRIORITIES,
  CHANGE_REQUEST_STATUSES,
  normalizeChangeRequestType,
  normalizeChangeRequestPriority,
  normalizeChangeRequestStatus,
  buildChangeRequestListFilter,
  parseChangeRequestListQuery,
  assertRequiredChangeRequestDescription,
  normalizeOptionalChangeRequestCurrent,
  assertRequiredChangeRequestRequestedChange,
  assertChangeRequestStatusTransition,
  listAllowedChangeRequestStatusTransitions,
  emptyChangeRequestImpact,
  normalizeChangeRequestImpact,
  isChangeRequestApprovalTerminalStatus,
  isChangeRequestWorkItemLinked,
  pickWorkItemsForIds,
  shouldNotifyAssigneesOnCrStatus,
  rankWorkStatusKey,
  pickLowestLinkedWorkStatus,
  resolveChangeRequestWorkStatus,
  CR_LIST_DEFAULT_PAGE_SIZE,
  CR_LIST_MAX_PAGE_SIZE,
} = require('../src/utils/changeRequestTypes');

describe('ChangeRequest constants T1', () => {
  it('includes type / priority / status enums', () => {
    assert.deepEqual([...CHANGE_REQUEST_TYPES].sort(), [
      'design_change',
      'other',
      'requirement_change',
      'scope_change',
      'technical_change',
    ]);
    assert.deepEqual([...CHANGE_REQUEST_PRIORITIES], ['low', 'medium', 'high', 'critical']);
    assert.deepEqual([...CHANGE_REQUEST_STATUSES], [
      'draft',
      'pending',
      'reviewing',
      'approved',
      'rejected',
      'deferred',
    ]);
  });

  it('normalize DRAFT → draft; type lạ → null', () => {
    assert.equal(normalizeChangeRequestStatus('DRAFT'), 'draft');
    assert.equal(normalizeChangeRequestStatus('Pending'), 'pending');
    assert.equal(normalizeChangeRequestType('REQUIREMENT_CHANGE'), 'requirement_change');
    assert.equal(normalizeChangeRequestType('task'), null);
    assert.equal(normalizeChangeRequestPriority('HIGH'), 'high');
    assert.equal(normalizeChangeRequestPriority(''), 'medium');
    assert.equal(normalizeChangeRequestPriority('urgent'), null);
    assert.equal(normalizeChangeRequestStatus('IMPLEMENTING'), null);
  });
});

describe('buildChangeRequestListFilter T2', () => {
  it('type + status + priority + isActive', () => {
    const f = buildChangeRequestListFilter({
      projectId: 'p1',
      type: 'SCOPE_CHANGE',
      status: 'DRAFT',
      priority: 'HIGH',
    });
    assert.equal(f.projectId, 'p1');
    assert.equal(f.isActive, true);
    assert.equal(f.type, 'scope_change');
    assert.equal(f.status, 'draft');
    assert.equal(f.priority, 'high');
  });

  it('omit optional filters', () => {
    const f = buildChangeRequestListFilter({ projectId: 'p1' });
    assert.equal(f.projectId, 'p1');
    assert.equal(f.isActive, true);
    assert.equal(f.type, undefined);
    assert.equal(f.status, undefined);
    assert.equal(f.priority, undefined);
    assert.equal(f.$or, undefined);
  });

  it('q → $or code/title regex', () => {
    const f = buildChangeRequestListFilter({ projectId: 'p1', q: 'CR-1' });
    assert.equal(f.isActive, true);
    assert.ok(Array.isArray(f.$or));
    assert.equal(f.$or.length, 2);
    assert.equal(f.$or[0].code.$options, 'i');
    assert.equal(f.$or[1].title.$regex, 'CR-1');
  });

  it('type / status / priority lạ → 400', () => {
    assert.throws(
      () => buildChangeRequestListFilter({ projectId: 'p1', type: 'task' }),
      (e) => e.statusCode === 400
    );
    assert.throws(
      () => buildChangeRequestListFilter({ projectId: 'p1', status: 'completed' }),
      (e) => e.statusCode === 400
    );
    assert.throws(
      () => buildChangeRequestListFilter({ projectId: 'p1', priority: 'urgent' }),
      (e) => e.statusCode === 400
    );
  });
});

describe('parseChangeRequestListQuery T1', () => {
  it('mặc định sort -createdAt; page/size clamp', () => {
    const d = parseChangeRequestListQuery({});
    assert.equal(d.q, '');
    assert.equal(d.sortField, 'createdAt');
    assert.equal(d.sortDir, -1);
    assert.deepEqual(d.sortMongo, { createdAt: -1 });
    assert.equal(d.page, 1);
    assert.equal(d.size, CR_LIST_DEFAULT_PAGE_SIZE);
    assert.equal(d.skip, 0);

    const p = parseChangeRequestListQuery({ sort: 'title', page: '2', size: '10' });
    assert.equal(p.sortField, 'title');
    assert.equal(p.sortDir, 1);
    assert.equal(p.page, 2);
    assert.equal(p.size, 10);
    assert.equal(p.skip, 10);

    const big = parseChangeRequestListQuery({ size: '999', page: '0' });
    assert.equal(big.size, CR_LIST_MAX_PAGE_SIZE);
    assert.equal(big.page, 1);
  });

  it('q trim; sort lạ → 400', () => {
    const q = parseChangeRequestListQuery({ q: '  CR-2  ', sort: '-updatedAt' });
    assert.equal(q.q, 'CR-2');
    assert.equal(q.sortField, 'updatedAt');
    assert.equal(q.sortDir, -1);
    assert.throws(() => parseChangeRequestListQuery({ sort: 'hack' }), (e) => e.statusCode === 400);
  });
});

describe('ChangeRequest description bắt buộc T1', () => {
  it('thiếu / rỗng → 400 description là bắt buộc', () => {
    assert.throws(
      () => assertRequiredChangeRequestDescription(''),
      (e) => e.statusCode === 400 && e.message === 'description là bắt buộc'
    );
    assert.throws(
      () => assertRequiredChangeRequestDescription('   '),
      (e) => e.statusCode === 400 && e.message === 'description là bắt buộc'
    );
    assert.throws(
      () => assertRequiredChangeRequestDescription(undefined),
      (e) => e.statusCode === 400 && e.message === 'description là bắt buộc'
    );
  });

  it('trim và trả về description hợp lệ', () => {
    assert.equal(assertRequiredChangeRequestDescription('  mô tả  '), 'mô tả');
  });
});

describe('ChangeRequest requestedChange bắt buộc T1', () => {
  it('thiếu / rỗng → 400 requestedChange là bắt buộc', () => {
    assert.throws(
      () => assertRequiredChangeRequestRequestedChange(''),
      (e) => e.statusCode === 400 && e.message === 'requestedChange là bắt buộc'
    );
    assert.throws(
      () => assertRequiredChangeRequestRequestedChange('   '),
      (e) => e.statusCode === 400 && e.message === 'requestedChange là bắt buộc'
    );
    assert.throws(
      () => assertRequiredChangeRequestRequestedChange(undefined),
      (e) => e.statusCode === 400 && e.message === 'requestedChange là bắt buộc'
    );
  });

  it('trim requestedChange; current optional T2', () => {
    assert.equal(assertRequiredChangeRequestRequestedChange('  tăng SLA  '), 'tăng SLA');
    assert.equal(normalizeOptionalChangeRequestCurrent(''), '');
    assert.equal(normalizeOptionalChangeRequestCurrent(undefined), '');
    assert.equal(normalizeOptionalChangeRequestCurrent('  hiện tại  '), 'hiện tại');
  });
});

describe('ChangeRequest status transitions T1–T3', () => {
  it('T1 allowed draft→pending→reviewing→approved|rejected|deferred', () => {
    assert.equal(assertChangeRequestStatusTransition('draft', 'pending'), 'pending');
    assert.equal(assertChangeRequestStatusTransition('DRAFT', 'PENDING'), 'pending');
    assert.equal(assertChangeRequestStatusTransition('pending', 'reviewing'), 'reviewing');
    assert.equal(assertChangeRequestStatusTransition('reviewing', 'approved'), 'approved');
    assert.equal(assertChangeRequestStatusTransition('reviewing', 'rejected'), 'rejected');
    assert.equal(assertChangeRequestStatusTransition('reviewing', 'deferred'), 'deferred');
    assert.deepEqual(listAllowedChangeRequestStatusTransitions('reviewing'), [
      'approved',
      'rejected',
      'deferred',
    ]);
    assert.deepEqual(listAllowedChangeRequestStatusTransitions('approved'), []);
  });

  it('T2 forbidden rejected→approved, draft→approved, approved→deferred', () => {
    assert.throws(
      () => assertChangeRequestStatusTransition('rejected', 'approved'),
      (e) =>
        e.statusCode === 400 &&
        e.message === 'Không thể chuyển status từ rejected sang approved'
    );
    assert.throws(
      () => assertChangeRequestStatusTransition('draft', 'approved'),
      (e) => e.statusCode === 400
    );
    assert.throws(
      () => assertChangeRequestStatusTransition('approved', 'deferred'),
      (e) => e.statusCode === 400
    );
  });

  it('T3 same status → no-op', () => {
    assert.equal(assertChangeRequestStatusTransition('draft', 'draft'), 'draft');
    assert.equal(assertChangeRequestStatusTransition('reviewing', 'REVIEWING'), 'reviewing');
  });
});

describe('ChangeRequest impact + approval terminal T1', () => {
  it('normalize impact trim + merge', () => {
    const empty = emptyChangeRequestImpact();
    assert.equal(empty.risk, '');
    const merged = normalizeChangeRequestImpact(
      { risk: '  high  ', affectedSprint: 'Sprint 1' },
      empty
    );
    assert.equal(merged.risk, 'high');
    assert.equal(merged.affectedSprint, 'Sprint 1');
    assert.equal(merged.affectedTeam, '');
  });

  it('approval terminal statuses', () => {
    assert.equal(isChangeRequestApprovalTerminalStatus('approved'), true);
    assert.equal(isChangeRequestApprovalTerminalStatus('rejected'), true);
    assert.equal(isChangeRequestApprovalTerminalStatus('deferred'), false);
    assert.equal(isChangeRequestApprovalTerminalStatus('reviewing'), false);
  });
});

describe('ChangeRequest work link + notify helpers T1', () => {
  it('detects already linked work item', () => {
    const oid = '507f1f77bcf86cd799439011';
    assert.equal(isChangeRequestWorkItemLinked([oid], oid), true);
    assert.equal(isChangeRequestWorkItemLinked([oid], '507f1f77bcf86cd799439012'), false);
    assert.equal(isChangeRequestWorkItemLinked([], oid), false);
    assert.equal(isChangeRequestWorkItemLinked(null, oid), false);
  });

  it('status notify gate reviewing/approved/rejected', () => {
    assert.equal(shouldNotifyAssigneesOnCrStatus('reviewing'), true);
    assert.equal(shouldNotifyAssigneesOnCrStatus('approved'), true);
    assert.equal(shouldNotifyAssigneesOnCrStatus('rejected'), true);
    assert.equal(shouldNotifyAssigneesOnCrStatus('deferred'), false);
    assert.equal(shouldNotifyAssigneesOnCrStatus('pending'), false);
  });

  it('pickWorkItemsForIds maps + preserves order; skips missing', () => {
    const a = { _id: 'a1', title: 'Task A', issueType: 'task' };
    const b = { _id: 'b2', title: 'Bug B', issueType: 'bug' };
    const byId = new Map([
      ['a1', a],
      ['b2', b],
    ]);
    assert.deepEqual(pickWorkItemsForIds(['b2', 'missing', 'a1'], byId), [b, a]);
    assert.deepEqual(pickWorkItemsForIds([], byId), []);
    assert.deepEqual(pickWorkItemsForIds(null, byId), []);
  });
});

describe('ChangeRequest workStatus lowest rank T1', () => {
  it('rank: todo < in_progress < review < done; unknown = 5', () => {
    assert.equal(rankWorkStatusKey('todo'), 0);
    assert.equal(rankWorkStatusKey('open'), 0);
    assert.equal(rankWorkStatusKey('in_progress'), 1);
    assert.equal(rankWorkStatusKey('review'), 2);
    assert.equal(rankWorkStatusKey('done'), 4);
    assert.equal(rankWorkStatusKey('DONE'), 4);
    assert.equal(rankWorkStatusKey('custom_gate'), 5);
    assert.equal(rankWorkStatusKey(''), 5);
  });

  it('todo + done → todo; 1 work → key; 0 work → empty', () => {
    assert.equal(
      pickLowestLinkedWorkStatus([
        { status: 'done' },
        { status: 'todo' },
      ]),
      'todo'
    );
    assert.equal(pickLowestLinkedWorkStatus([{ status: 'in_progress' }]), 'in_progress');
    assert.equal(pickLowestLinkedWorkStatus([]), '');
    assert.equal(pickLowestLinkedWorkStatus(null), '');
  });

  it('same rank → smaller listOrder wins; statusKey preferred over status', () => {
    assert.equal(
      pickLowestLinkedWorkStatus([
        { status: 'doing', listOrder: 2000 },
        { status: 'in_progress', listOrder: 1000 },
      ]),
      'in_progress'
    );
    assert.equal(
      pickLowestLinkedWorkStatus([{ status: 'done', statusKey: 'todo' }]),
      'todo'
    );
  });

  it('T2 DTO: approvalStatus stays independent of computed workStatus', () => {
    assert.equal(resolveChangeRequestWorkStatus('done', [{ status: 'todo' }, { status: 'done' }]), 'todo');
    assert.equal(resolveChangeRequestWorkStatus('done', []), '');
    assert.equal(resolveChangeRequestWorkStatus('in_progress', undefined), 'in_progress');
    assert.equal(resolveChangeRequestWorkStatus('', null), '');
  });
});

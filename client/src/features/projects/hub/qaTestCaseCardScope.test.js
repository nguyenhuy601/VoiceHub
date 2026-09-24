/**
 * FE unit tests — Phase 3 TC catalog scoped to Ready-for-QA card.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTcLinkedToWorkItem,
  isTcUnlinked,
  isSuggestedCatalogForCard,
  partitionCatalogForCard,
  filterTcByResult,
  isWorkItemDone,
  enrichTestCasesWithBoardCue,
  isTcNeedsAttention,
  buildQaCardQueueGroups,
} from './qaTestCaseCardScope.js';

describe('qaTestCaseCardScope', () => {
  it('detects linked vs unlinked', () => {
    assert.equal(isTcLinkedToWorkItem({ workItemId: 'abc' }, 'abc'), true);
    assert.equal(isTcLinkedToWorkItem({ workItemId: 'abc' }, 'xyz'), false);
    assert.equal(isTcUnlinked({ workItemId: null }), true);
    assert.equal(isTcUnlinked({ workItemId: 'abc' }), false);
  });

  it('suggests unlinked TC when externalKey appears in card text', () => {
    const card = { title: 'Implement UC-001 Register', description: '' };
    assert.equal(
      isSuggestedCatalogForCard({ externalKey: 'UC-001', workItemId: null }, card),
      true
    );
    assert.equal(
      isSuggestedCatalogForCard({ externalKey: 'UC-999', workItemId: null }, card),
      false
    );
    assert.equal(
      isSuggestedCatalogForCard({ externalKey: 'UC-001', workItemId: 'x' }, card),
      false
    );
  });

  it('partitions linked / suggested / other', () => {
    const card = { title: 'UC-001 flow' };
    const items = [
      { _id: '1', workItemId: 'card1', externalKey: 'UC-001' },
      { _id: '2', workItemId: null, externalKey: 'UC-001' },
      { _id: '3', workItemId: null, externalKey: 'UC-002' },
      { _id: '4', workItemId: 'other', externalKey: 'UC-003' },
    ];
    const part = partitionCatalogForCard(items, 'card1', card);
    assert.equal(part.linked.length, 1);
    assert.equal(part.suggested.length, 1);
    assert.equal(part.unlinkedOther.length, 1);
  });

  it('prefers sourceUcKey match over title haystack (DEC D2)', () => {
    const card = { title: 'Implement login', sourceUcKey: 'UC-010' };
    assert.equal(
      isSuggestedCatalogForCard(
        { sourceUcKey: 'UC-010', externalKey: 'UC-010', workItemId: null },
        card
      ),
      true
    );
    assert.equal(
      isSuggestedCatalogForCard(
        { sourceUcKey: 'UC-999', externalKey: 'UC-999', workItemId: null },
        card
      ),
      false
    );
    const part = partitionCatalogForCard(
      [
        { _id: 'a', workItemId: null, sourceUcKey: 'UC-010', externalKey: 'UC-010' },
        { _id: 'b', workItemId: null, sourceUcKey: 'UC-011', externalKey: 'UC-011' },
      ],
      'card1',
      card
    );
    assert.equal(part.suggested.length, 1);
    assert.equal(part.suggested[0]._id, 'a');
    assert.equal(part.unlinkedOther.length, 1);
  });

  it('filters by result', () => {
    const items = [{ lastResult: 'pass' }, { lastResult: 'fail' }, { lastResult: null }];
    assert.equal(filterTcByResult(items, 'pass').length, 1);
    assert.equal(filterTcByResult(items, 'none').length, 1);
    assert.equal(filterTcByResult(items, 'all').length, 3);
  });

  it('isWorkItemDone uses board column over stale card.status', () => {
    const listsById = new Map([
      ['qa1', { _id: 'qa1', title: 'Ready for QA', statusKey: 'qa' }],
      ['done1', { _id: 'done1', title: 'Done', statusKey: 'done' }],
    ]);
    const onQa = { _id: 'c1', listId: 'qa1', status: 'done', title: 'Yêu cầu & xuất' };
    const onDone = { _id: 'c2', listId: 'done1', status: 'todo', title: 'Other' };
    assert.equal(isWorkItemDone('c1', [onQa], listsById), false);
    assert.equal(isWorkItemDone('c2', [onDone], listsById), true);
    assert.equal(isWorkItemDone('missing', [onQa], listsById), false);
  });

  it('enrichTestCasesWithBoardCue: parent on QA → needsRetest even if bug open', () => {
    const listsById = new Map([
      ['qa1', { _id: 'qa1', title: 'Ready for QA', statusKey: 'qa' }],
      ['todo1', { _id: 'todo1', title: 'To Do', statusKey: 'todo' }],
    ]);
    const parent = { _id: 'p1', listId: 'qa1' };
    const bug = { _id: 'b1', listId: 'todo1', issueType: 'bug' };
    const [row] = enrichTestCasesWithBoardCue(
      [{ _id: 'tc1', lastResult: 'fail', linkedBugId: 'b1', workItemId: 'p1' }],
      [parent, bug],
      listsById
    );
    assert.equal(row.needsRetest, true);
    assert.equal(row.cue, 'needs_retest');
  });

  it('isTcNeedsAttention: retest / fail / bug open', () => {
    assert.equal(isTcNeedsAttention({ needsRetest: true }), true);
    assert.equal(isTcNeedsAttention({ linkedBugOpen: true }), true);
    assert.equal(isTcNeedsAttention({ lastResult: 'fail' }), true);
    assert.equal(isTcNeedsAttention({ lastResult: 'pass' }), false);
    assert.equal(isTcNeedsAttention({ lastResult: null }), false);
  });

  it('buildQaCardQueueGroups: gom theo card + tách cần sửa / chờ duyệt', () => {
    const readyCards = [
      { id: 'c1', label: 'Tạo phiếu PR', card: { _id: 'c1', title: 'Tạo phiếu PR', listId: 'qa1' } },
      { id: 'c2', label: 'Khác', card: { _id: 'c2', title: 'Khác', listId: 'qa1' } },
    ];
    const listsById = new Map([['qa1', { _id: 'qa1', title: 'Ready for QA' }]]);
    const items = [
      { _id: 't1', workItemId: 'c1', title: 'o', lastResult: 'fail', needsRetest: true },
      { _id: 't2', workItemId: 'c1', title: 'a', lastResult: 'pass' },
      { _id: 't3', workItemId: 'c2', title: 'b', lastResult: null },
      { _id: 't4', workItemId: 'other', title: 'orphan', lastResult: 'pass' },
    ];
    const groups = buildQaCardQueueGroups({ items, readyCards, listsById });
    assert.equal(groups.length, 2);
    assert.equal(groups[0].cardId, 'c1');
    assert.equal(groups[0].attentionCount, 1);
    assert.equal(groups[0].awaitingCount, 1);
    assert.equal(groups[1].cardId, 'c2');
    assert.equal(groups[1].attentionCount, 0);
    assert.equal(groups[1].awaitingCount, 1);

    const focused = buildQaCardQueueGroups({
      items,
      readyCards,
      focusCardId: 'c2',
      listsById,
    });
    assert.equal(focused.length, 1);
    assert.equal(focused[0].cardId, 'c2');
  });
});

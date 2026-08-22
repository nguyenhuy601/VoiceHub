/**
 * Unit — resolveBoardParentTitle for Board cards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBoardParentTitle } from './projectHubBoardParent.js';

describe('resolveBoardParentTitle', () => {
  it('feature → epic parent title', () => {
    assert.equal(
      resolveBoardParentTitle(
        { kind: 'planning', issueType: 'feature', parentId: 'e1' },
        { epics: [{ _id: 'e1', title: 'Order Management' }] }
      ),
      'Order Management'
    );
  });

  it('task → feature title', () => {
    assert.equal(
      resolveBoardParentTitle(
        { issueType: 'task', featureId: 'f1' },
        { features: [{ _id: 'f1', title: 'Checkout' }] }
      ),
      'Checkout'
    );
  });

  it('story → epic when no feature', () => {
    assert.equal(
      resolveBoardParentTitle(
        { issueType: 'story', epicId: 'e2' },
        { epics: [{ _id: 'e2', title: 'Epic X' }] }
      ),
      'Epic X'
    );
  });

  it('empty when no parent', () => {
    assert.equal(resolveBoardParentTitle({ issueType: 'bug' }, {}), '');
  });
});

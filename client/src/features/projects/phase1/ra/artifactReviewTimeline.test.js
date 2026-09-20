import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listArtifactReviewTimeline,
  normalizeReviewStamp,
  REVIEW_GATE_ORDER,
} from './artifactReviewTimeline.js';

describe('artifactReviewTimeline (DEC R1)', () => {
  it('orders BA → Tech → PO', () => {
    assert.deepEqual([...REVIEW_GATE_ORDER], ['ba', 'tech', 'po']);
  });

  it('treats empty stamp as not done', () => {
    const stamp = normalizeReviewStamp(null);
    assert.equal(stamp.done, false);
    assert.equal(stamp.at, null);
    assert.equal(stamp.actorRef, '');
  });

  it('marks done when at or userId present', () => {
    const withAt = normalizeReviewStamp({
      userId: '507f1f77bcf86cd799439011',
      at: '2026-09-18T10:00:00.000Z',
    });
    assert.equal(withAt.done, true);
    assert.ok(withAt.actorRef.includes('439011') || withAt.actorRef.length > 0);
    assert.equal(withAt.at, '2026-09-18T10:00:00.000Z');
  });

  it('builds three rows from artifact.review', () => {
    const rows = listArtifactReviewTimeline({
      review: {
        ba: { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', at: '2026-09-01T00:00:00.000Z' },
        tech: {},
        po: null,
      },
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0].gate, 'ba');
    assert.equal(rows[0].stamp.done, true);
    assert.equal(rows[1].gate, 'tech');
    assert.equal(rows[1].stamp.done, false);
    assert.equal(rows[2].gate, 'po');
    assert.equal(rows[2].stamp.done, false);
    assert.ok(rows[0].labelKey.includes('Ba'));
  });
});

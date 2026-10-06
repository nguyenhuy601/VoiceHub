/**
 * Unit — resolveLinkedProjectId must not drop mongoose ObjectId to null.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Mirror of requirementPack.service resolveLinkedProjectId (keep in sync)
function resolveLinkedProjectId(projectId) {
  if (projectId == null || projectId === '') return null;

  if (typeof projectId === 'object') {
    const nested = projectId._id;
    if (nested != null && nested !== projectId) {
      return resolveLinkedProjectId(nested);
    }
    if (typeof projectId.toHexString === 'function') {
      try {
        return projectId.toHexString();
      } catch {
        /* fall through */
      }
    }
    const raw = typeof projectId.toString === 'function' ? projectId.toString() : String(projectId);
    const s = String(raw || '').trim();
    if (s && s !== '[object Object]' && mongoose.isValidObjectId(s)) return s;
    return null;
  }

  const s = String(projectId).trim();
  return s && s !== '[object Object]' ? s : null;
}

describe('resolveLinkedProjectId', () => {
  it('keeps mongoose ObjectId as 24-hex (not null)', () => {
    const oid = new mongoose.Types.ObjectId();
    const resolved = resolveLinkedProjectId(oid);
    assert.equal(resolved, oid.toHexString());
    assert.notEqual(resolved, null);
  });

  it('reads populated doc._id', () => {
    const oid = new mongoose.Types.ObjectId();
    assert.equal(resolveLinkedProjectId({ _id: oid, title: 'P' }), oid.toHexString());
  });

  it('passes through hex string', () => {
    const hex = '507f1f77bcf86cd799439011';
    assert.equal(resolveLinkedProjectId(hex), hex);
  });

  it('null/empty → null', () => {
    assert.equal(resolveLinkedProjectId(null), null);
    assert.equal(resolveLinkedProjectId(''), null);
  });
});

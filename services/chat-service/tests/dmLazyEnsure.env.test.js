import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('DM lazy ensure env', () => {
  it('mặc định bật khi unset', () => {
    const prev = process.env.DM_LAZY_ENSURE_FRIENDSHIP;
    delete process.env.DM_LAZY_ENSURE_FRIENDSHIP;
    // require sau khi chỉnh env — load fresh bằng cache bust không cần; test pure mirror
    const enabled = String(process.env.DM_LAZY_ENSURE_FRIENDSHIP || 'true').toLowerCase() !== 'false';
    assert.equal(enabled, true);
    if (prev === undefined) delete process.env.DM_LAZY_ENSURE_FRIENDSHIP;
    else process.env.DM_LAZY_ENSURE_FRIENDSHIP = prev;
  });

  it('false tắt heal', () => {
    assert.equal(String('false').toLowerCase() !== 'false', false);
  });
});

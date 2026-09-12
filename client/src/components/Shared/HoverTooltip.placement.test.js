import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirror computeStyle from HoverTooltip (giữ sync khi đổi placement).
 */
function computeStyle(rect, placement) {
  const gap = 8;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (placement === 'bottom') {
    return { left: cx, top: rect.bottom + gap, transform: 'translate(-50%, 0)' };
  }
  if (placement === 'left') {
    return { left: rect.left - gap, top: cy, transform: 'translate(-100%, -50%)' };
  }
  if (placement === 'right') {
    return { left: rect.right + gap, top: cy, transform: 'translate(0, -50%)' };
  }
  return { left: cx, top: rect.top - gap, transform: 'translate(-50%, -100%)' };
}

describe('HoverTooltip placement', () => {
  const rect = { left: 100, top: 200, width: 40, height: 36, right: 140, bottom: 236 };

  it('top: căn giữa phía trên trigger', () => {
    const s = computeStyle(rect, 'top');
    assert.equal(s.left, 120);
    assert.equal(s.top, 192);
    assert.equal(s.transform, 'translate(-50%, -100%)');
  });

  it('bottom: căn giữa phía dưới trigger', () => {
    const s = computeStyle(rect, 'bottom');
    assert.equal(s.left, 120);
    assert.equal(s.top, 244);
  });

  it('left: neo cạnh trái trigger', () => {
    const s = computeStyle(rect, 'left');
    assert.equal(s.left, 92);
    assert.equal(s.top, 218);
    assert.equal(s.transform, 'translate(-100%, -50%)');
  });
});

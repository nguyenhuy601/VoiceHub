const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { clampOverviewForPack } = require('../src/utils/requirement/requirementOverviewClamp');

describe('clampOverviewForPack', () => {
  it('truncates expectedUsers to 512', () => {
    const long = `Students, Academic Affairs staff — ${'x'.repeat(500)}`;
    assert.ok(long.length > 512);
    const out = clampOverviewForPack({ expectedUsers: long });
    assert.equal(out.expectedUsers.length, 512);
    assert.ok(out.expectedUsers.startsWith('Students'));
  });

  it('preserves platform array and other fields', () => {
    const out = clampOverviewForPack({
      expectedUsers: 'A'.repeat(600),
      platform: ['Web', 'Mobile'],
      budget: 1000,
    });
    assert.deepEqual(out.platform, ['Web', 'Mobile']);
    assert.equal(out.budget, 1000);
    assert.equal(out.expectedUsers.length, 512);
  });

  it('coerces free-text budget to null and clamps priority', () => {
    const out = clampOverviewForPack({
      budget: 'Chưa chốt - khách hàng dự kiến trong khoảng phê duyệt của năm tài chính 2026',
      priority: 'High - phải kịp đợt đăng ký học kỳ II năm học 2026-2027',
      platform: 'Web (responsive)',
    });
    assert.equal(out.budget, null);
    assert.equal(out.priority.length, 32);
    assert.deepEqual(out.platform, ['Web (responsive)']);
  });

  it('parses numeric budget strings', () => {
    const out = clampOverviewForPack({ budget: '1,500,000' });
    assert.equal(out.budget, 1500000);
  });
});

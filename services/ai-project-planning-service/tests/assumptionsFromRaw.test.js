/**
 * Deterministic assumptions from Customer Raw canonical constraints.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildAssumptionsFromRaw } = require('../src/srsProposal/engines/assumptionsFromRaw');

describe('assumptionsFromRaw', () => {
  it('builds from canonicalRaw.constraints.assumption + scopeOut', () => {
    const pack = {
      overview: {},
      aiAnalysis: {
        canonicalRaw: {
          constraints: {
            assumption: 'HR đã cấp danh sách nhân viên; SSO đã sẵn sàng',
            business_constraint: 'Phải tuân thủ quy định bảo mật nội bộ',
            platform_constraint: 'Web trước',
          },
          content: { scopeOut: ['App mobile native'] },
        },
      },
    };
    const out = buildAssumptionsFromRaw(pack);
    assert.ok(out.items.length >= 3, `expected >=3 got ${out.items.length}`);
    assert.equal(out.coverage.status, 'AVAILABLE');
    assert.equal(String(out.items[0].origin?.type || '').toUpperCase(), 'DERIVED');
    assert.ok(out.items.some((i) => /SSO/i.test(i.title)));
    assert.ok(out.items.some((i) => /Ngoài phạm vi/i.test(i.title)));
  });

  it('returns DERIVE_EMPTY when no sources', () => {
    const out = buildAssumptionsFromRaw({ overview: {} });
    assert.equal(out.items.length, 0);
    assert.equal(out.coverage.reason, 'DERIVE_EMPTY');
  });
});

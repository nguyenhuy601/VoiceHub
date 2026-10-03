/**
 * Gate1 section columns — status on scope/interface/glossary + i18n headers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE1_SECTION_COLUMNS,
  getGate1ColumnsForSection,
} from './gate1SectionTableConfig.js';

const tVi = (key) => {
  const map = {
    'requirements.phase1ColItemStatus': 'Trạng thái',
    'requirements.phase1ScopeIn': 'Trong phạm vi',
    'requirements.phase1ScopeOut': 'Ngoài phạm vi',
    'requirements.phase1StepsCount': '{count} bước',
    'requirements.phase1ItemStatus_PROPOSED': 'Đề xuất',
    'requirements.phase1Origin_DERIVED': 'Đã suy ra',
  };
  return map[key] || '';
};

describe('gate1SectionTableConfig', () => {
  for (const section of ['scope', 'interfaces', 'glossary']) {
    it(`${section} has status column`, () => {
      const cols = getGate1ColumnsForSection(section);
      assert.ok(cols.some((c) => c.key === 'status'), `${section} missing status`);
    });
  }

  it('every section column has headerKey under requirements.*', () => {
    for (const [section, cols] of Object.entries(GATE1_SECTION_COLUMNS)) {
      for (const col of cols) {
        assert.match(
          col.headerKey,
          /^requirements\./,
          `${section}.${col.key} headerKey`
        );
        assert.ok(col.headerFallback, `${section}.${col.key} fallback`);
      }
    }
  });

  it('localizes scope In/Out and status via t', () => {
    const cols = getGate1ColumnsForSection('scope');
    const inOut = cols.find((c) => c.key === 'inOut');
    const status = cols.find((c) => c.key === 'status');
    assert.equal(inOut.render({ inScope: true }, tVi), 'Trong phạm vi');
    assert.equal(inOut.render({ scopeType: 'out' }, tVi), 'Ngoài phạm vi');
    assert.equal(status.render({ status: 'PROPOSED' }, tVi), 'Đề xuất');
  });

  it('localizes BPM step count', () => {
    const cols = getGate1ColumnsForSection('processes');
    const steps = cols.find((c) => c.key === 'steps');
    assert.equal(steps.render({ steps: [1, 2, 3] }, tVi), '3 bước');
  });
});

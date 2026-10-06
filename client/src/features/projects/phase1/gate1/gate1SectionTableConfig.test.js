/**
 * Gate1 section columns — status on scope/interface/glossary + i18n headers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE1_SECTION_COLUMNS,
  getGate1ColumnsForSection,
  getGate1FieldValue,
  getGate1RowId,
  areGate1SectionDecisionsComplete,
  countGate1PendingDecisions,
  patchGate1EditedPayload,
  seedGate1EditedPayload,
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

  it('hides bulky text / related-FR columns from section tables', () => {
    const hidden = new Set(['description', 'relatedFr', 'protocol', 'definition']);
    for (const [section, cols] of Object.entries(GATE1_SECTION_COLUMNS)) {
      for (const col of cols) {
        assert.equal(
          hidden.has(col.key),
          false,
          `${section} still has column ${col.key}`
        );
      }
    }
  });

  it('FR section does not show origin (Nguồn gốc) column', () => {
    const cols = getGate1ColumnsForSection('functionalRequirements');
    assert.equal(
      cols.some((c) => c.key === 'origin'),
      false
    );
  });

  it('FR editable columns seed editedPayload with ac + acceptanceCriteria', () => {
    const cols = getGate1ColumnsForSection('functionalRequirements');
    const row = {
      logicalId: 'CR-001',
      title: 'Tạo hồ sơ',
      ac: 'Mã NV unique',
      status: 'EXTRACTED',
    };
    const payload = seedGate1EditedPayload(row, cols);
    assert.equal(payload.title, 'Tạo hồ sơ');
    assert.equal(payload.ac, 'Mã NV unique');
    assert.equal(payload.acceptanceCriteria, 'Mã NV unique');
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'status'), false);
  });

  it('patchGate1EditedPayload keeps ac and acceptanceCriteria in sync', () => {
    const next = patchGate1EditedPayload({ title: 'A' }, 'ac', 'AC mới');
    assert.equal(next.title, 'A');
    assert.equal(next.ac, 'AC mới');
    assert.equal(next.acceptanceCriteria, 'AC mới');
  });

  it('getGate1FieldValue prefers editedPayload over row', () => {
    const col = { field: 'title', editable: true };
    assert.equal(
      getGate1FieldValue({ title: 'Cũ' }, col, { title: 'Mới' }),
      'Mới'
    );
  });

  it('section columns declare defaultPx for resize', () => {
    for (const [section, cols] of Object.entries(GATE1_SECTION_COLUMNS)) {
      for (const col of cols) {
        assert.ok(
          Number(col.defaultPx) > 0,
          `${section}.${col.key} missing defaultPx`
        );
      }
    }
  });

  it('getGate1RowId prefers logicalId then id', () => {
    assert.equal(getGate1RowId({ logicalId: 'FR-1', id: 'x' }, 0), 'FR-1');
    assert.equal(getGate1RowId({ id: 'UC-2' }, 3), 'UC-2');
    assert.equal(getGate1RowId({}, 7), 'row-7');
  });

  it('areGate1SectionDecisionsComplete requires all sections', () => {
    const bySection = {
      functionalRequirements: [
        { logicalId: 'FR-1', status: 'EXTRACTED' },
        { logicalId: 'FR-2', status: 'EXTRACTED' },
      ],
      useCases: [{ logicalId: 'UC-1', status: 'PROPOSED' }],
    };
    assert.equal(areGate1SectionDecisionsComplete(bySection, {}), false);
    assert.equal(countGate1PendingDecisions(bySection, {}), 3);
    assert.equal(
      areGate1SectionDecisionsComplete(bySection, {
        'FR-1': { action: 'accept' },
        'FR-2': { action: 'reject' },
      }),
      false
    );
    assert.equal(
      areGate1SectionDecisionsComplete(bySection, {
        'FR-1': { action: 'accept' },
        'FR-2': { action: 'edit' },
        'UC-1': { action: 'accept' },
      }),
      true
    );
    assert.equal(
      countGate1PendingDecisions(bySection, {
        'FR-1': { action: 'accept' },
        'FR-2': { action: 'edit' },
        'UC-1': { action: 'accept' },
      }),
      0
    );
  });

  it('NEEDS_CONFIRMATION accept requires note + resolution', () => {
    const bySection = {
      functionalRequirements: [
        { logicalId: 'FR-N', status: 'NEEDS_CONFIRMATION' },
      ],
    };
    assert.equal(
      areGate1SectionDecisionsComplete(bySection, {
        'FR-N': { action: 'accept' },
      }),
      false
    );
    assert.equal(
      areGate1SectionDecisionsComplete(bySection, {
        'FR-N': { action: 'accept', note: 'ok', resolution: 'keep' },
      }),
      true
    );
  });
});

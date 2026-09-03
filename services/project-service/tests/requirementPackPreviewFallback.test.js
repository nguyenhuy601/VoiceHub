const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ensurePackPreviewViews,
  buildSyntheticExcelPreviewFromPack,
} = require('../src/utils/requirementPackPreviewFallback');

describe('requirementPackPreviewFallback', () => {
  const legacyPack = {
    sourceFileName: 'legacy.xlsx',
    overview: {
      requirementName: 'Demo',
      projectObjective: 'Obj',
      businessScope: 'Scope',
      platform: ['Web'],
      expectedUsers: 'HR',
      deadline: '2026-12-30T00:00:00.000Z',
      priority: 'High',
    },
    scope: [{ type: 'in', description: 'Auth' }],
    functionalRequirements: [
      {
        externalId: 'FR-001',
        level: 'Module',
        parentExternalId: '',
        name: 'Auth',
        description: 'Login module',
        priority: 'High',
        sortOrder: 0,
      },
      {
        externalId: 'FR-002',
        level: 'Feature',
        parentExternalId: 'FR-001',
        name: 'Login',
        description: 'Email login',
        priority: 'High',
        sortOrder: 1,
      },
    ],
    nonFunctionalRequirements: [
      {
        externalId: 'NFR-001',
        category: 'Performance',
        requirement: 'API latency',
        target: '< 2s',
        priority: 'High',
      },
    ],
  };

  it('ensurePackPreviewViews derives tree and excel for legacy pack', () => {
    const enriched = ensurePackPreviewViews({ ...legacyPack });
    assert.ok(Array.isArray(enriched.previewTree));
    assert.equal(enriched.previewTree.length, 1);
    assert.equal(enriched.previewTree[0].externalId, 'FR-001');
    assert.equal(enriched.previewTree[0].children.length, 1);
    assert.ok(enriched.excelPreview);
    assert.equal(enriched.excelPreview.derivedFromPack, true);
    assert.ok(enriched.excelPreview.sheetCount >= 2);
    assert.ok(enriched.excelPreview.sheets.some((s) => /Functional/i.test(s.name)));
  });

  it('ensurePackPreviewViews attaches planningPreview with rollup excel', () => {
    const enriched = ensurePackPreviewViews({ ...legacyPack });
    assert.ok(enriched.planningPreview);
    assert.ok(Array.isArray(enriched.planningPreview.issues));
    assert.equal(enriched.excelPreview.derivedFromPack, true);
  });

  it('ensurePackPreviewViews keeps existing previewTree but rebuilds excel from FR', () => {
    const existingTree = [{ externalId: 'KEEP', name: 'Keep', children: [] }];
    const existingExcel = {
      fileName: 'kept.xlsx',
      sheetCount: 1,
      totalRows: 2,
      sheets: [{ name: 'A', rowCount: 2, colCount: 1, truncated: false, rows: [] }],
    };
    const enriched = ensurePackPreviewViews({
      ...legacyPack,
      previewTree: existingTree,
      excelPreview: existingExcel,
    });
    assert.equal(enriched.previewTree, existingTree);
    assert.ok(enriched.planningPreview);
    assert.equal(enriched.excelPreview.derivedFromPack, true);
    assert.notEqual(enriched.excelPreview, existingExcel);
  });

  it('buildSyntheticExcelPreviewFromPack rolls up leaf hours on parent rows', () => {
    const pack = {
      ...legacyPack,
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Auth',
          description: 'Login module',
          priority: 'High',
          sortOrder: 0,
        },
        {
          externalId: 'FR-002',
          level: 'Requirement',
          parentExternalId: 'FR-001',
          name: 'Login email',
          description: 'Email login',
          priority: 'High',
          sortOrder: 1,
          estimateHours: 8,
        },
      ],
    };
    const preview = buildSyntheticExcelPreviewFromPack(pack);
    const fr = preview.sheets.find((s) => /Functional/i.test(s.name));
    assert.ok(fr);
    const header = fr.rows[0].cells;
    const idIdx = header.indexOf('ID');
    const hoursIdx = header.indexOf('Effort Hours');
    const byId = new Map(
      fr.rows.slice(1).map((row) => [String(row.cells[idIdx] || '').trim(), row.cells[hoursIdx]])
    );
    assert.equal(byId.get('FR-001'), '8');
    assert.equal(byId.get('FR-002'), '8');
  });

  it('buildSyntheticExcelPreviewFromPack includes overview header', () => {
    const preview = buildSyntheticExcelPreviewFromPack(legacyPack);
    assert.equal(preview.derivedFromPack, true);
    const overview = preview.sheets[0];
    assert.ok(overview);
    assert.deepEqual(overview.rows[0].cells.slice(0, 3), ['Field', 'Required', 'Value']);
  });
});

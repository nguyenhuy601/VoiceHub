const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPackPlanningPreview,
  HANDLED_IMPORT_WARNING_CODES,
} = require('../src/utils/requirementPackPlanningPreview');
const { SHEETS } = require('../src/constants/requirementTemplate.constants');

describe('requirementPackPlanningPreview', () => {
  const basePack = {
    sourceFileName: 'demo.xlsx',
    overview: { requirementName: 'Demo' },
    functionalRequirements: [
      {
        externalId: 'FR-001',
        level: 'Epic',
        parentExternalId: '',
        name: 'Auth',
        description: 'Module',
        priority: 'High',
        sortOrder: 0,
        estimateHours: 100,
      },
      {
        externalId: 'FR-002',
        level: 'Task',
        parentExternalId: 'FR-001',
        name: 'Login',
        description: 'Email login',
        priority: 'High',
        sortOrder: 1,
        estimateHours: 8,
        suggestedSkills: ['React'],
      },
    ],
  };

  it('rollup parent Effort Hours and omits REQ_FR_EFFORT_NON_LEAF', () => {
    const preview = buildPackPlanningPreview(basePack);
    const frSheet = preview.excelPreview.sheets.find((s) => s.name === SHEETS.FUNCTIONAL);
    assert.ok(frSheet);
    const header = frSheet.rows[0].cells;
    const idIdx = header.indexOf('ID');
    const hoursIdx = header.indexOf('Effort Hours');
    const byId = new Map(
      frSheet.rows.slice(1).map((row) => [String(row.cells[idIdx] || '').trim(), row.cells[hoursIdx]])
    );
    assert.equal(byId.get('FR-001'), '8');
    assert.ok(!preview.issues.some((i) => i.code === 'REQ_FR_EFFORT_NON_LEAF'));
    assert.ok(preview.issues.some((i) => i.code === 'REQ_PLANNING_EFFORT_CORRECTED'));
    assert.equal(preview.handledImportWarnings.includes('REQ_FR_EFFORT_NON_LEAF'), true);
  });

  it('emits REQ_PLANNING_SKILL_PENDING for registry PENDING skills', () => {
    const preview = buildPackPlanningPreview({
      ...basePack,
      functionalRequirements: [
        {
          externalId: 'FR-010',
          level: 'Task',
          parentExternalId: '',
          name: 'Query',
          description: 'SQL work',
          priority: 'High',
          sortOrder: 0,
          estimateHours: 4,
          suggestedSkills: ['SQL'],
        },
      ],
      requirementSkills: [
        {
          externalId: 'FR-010',
          skillNameSnapshot: 'SQL',
          rawInput: 'SQL',
          registryStatus: 'PENDING',
        },
      ],
    });
    const pending = preview.issues.find((i) => i.code === 'REQ_PLANNING_SKILL_PENDING');
    assert.ok(pending);
    assert.match(pending.message, /PENDING/i);
    assert.match(pending.message, /SQL/);
    assert.ok(!preview.issues.some((i) => i.code === 'REQ_FR_NEW_SKILL'));
    assert.equal(preview.handledImportWarnings.includes('REQ_FR_NEW_SKILL'), true);
  });

  it('falls back to importSkillMeta.newSkillsDetected for legacy packs', () => {
    const preview = buildPackPlanningPreview({
      ...basePack,
      functionalRequirements: [
        {
          externalId: 'FR-020',
          level: 'Task',
          parentExternalId: '',
          name: 'API',
          description: 'FastAPI',
          priority: 'High',
          sortOrder: 0,
          estimateHours: 6,
          suggestedSkills: ['FastAPI'],
        },
      ],
      requirementSkills: [],
      importSkillMeta: { newSkillsDetected: [{ name: 'FastAPI' }] },
    });
    assert.ok(preview.issues.some((i) => i.code === 'REQ_PLANNING_SKILL_PENDING'));
  });

  it('warns on REJECTED registry skills', () => {
    const preview = buildPackPlanningPreview({
      ...basePack,
      functionalRequirements: [
        {
          externalId: 'FR-030',
          level: 'Task',
          parentExternalId: '',
          name: 'Bad skill',
          description: 'Desc',
          priority: 'High',
          sortOrder: 0,
          estimateHours: 2,
          suggestedSkills: ['ObscureX'],
        },
      ],
      requirementSkills: [
        {
          externalId: 'FR-030',
          skillNameSnapshot: 'ObscureX',
          registryStatus: 'REJECTED',
        },
      ],
    });
    const rejected = preview.issues.find((i) => i.code === 'REQ_PLANNING_SKILL_REJECTED');
    assert.ok(rejected);
    assert.equal(rejected.severity, 'warning');
  });
});

describe('requirementPackPlanningPreview constants', () => {
  it('lists handled import warning codes', () => {
    assert.ok(HANDLED_IMPORT_WARNING_CODES.includes('REQ_FR_EFFORT_NON_LEAF'));
    assert.ok(HANDLED_IMPORT_WARNING_CODES.includes('REQ_FR_NEW_SKILL'));
  });
});

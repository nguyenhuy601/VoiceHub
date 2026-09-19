const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_TEMPLATE_VERSION,
  CUSTOMER_RAW_SHEETS,
} = require('../src/constants/customerRawTemplate.constants');
const {
  parseCustomerRawContext,
  isCustomerRawTemplateType,
} = require('../src/utils/requirement/customerRawContextParse');
const {
  mapCustomerRawToProjectIntakeDraft,
  mapPriorityToProject,
} = require('../src/utils/requirement/mapCustomerRawToProjectIntakeDraft');
const {
  buildCustomerRawTemplateBuffer,
} = require('../src/utils/requirement/customerRawTemplateBuilder');

function buildWorkbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('isCustomerRawTemplateType', () => {
  it('accepts CustomerRaw variants', () => {
    assert.equal(isCustomerRawTemplateType('CustomerRaw'), true);
    assert.equal(isCustomerRawTemplateType('customer raw'), true);
    assert.equal(isCustomerRawTemplateType('SRS'), false);
    assert.equal(isCustomerRawTemplateType(''), false);
  });
});

describe('parseCustomerRawContext', () => {
  it('parses template buffer from builder', async () => {
    const buf = Buffer.from(await buildCustomerRawTemplateBuffer());
    const parsed = parseCustomerRawContext(buf);
    assert.equal(parsed.isCustomerRaw, true);
    assert.equal(parsed.templateType, CUSTOMER_RAW_TEMPLATE_TYPE);
    assert.ok(parsed.contextSheetPresent);
    assert.equal(parsed.context.projectName, 'Course Registration Management');
    assert.equal(parsed.context.targetPlatform, 'Web');
    assert.equal(parsed.context.deadline, '2026-12-30');
    assert.equal(parsed.context.integration, 'University SSO');
  });

  it('maps label aliases (Customer Name, Platform, Expected Users)', () => {
    const buf = buildWorkbookBuffer([
      {
        name: CUSTOMER_RAW_SHEETS.META,
        rows: [
          ['Key', 'Value'],
          ['TemplateType', CUSTOMER_RAW_TEMPLATE_TYPE],
          ['TemplateVersion', CUSTOMER_RAW_TEMPLATE_VERSION],
          ['ProjectName', 'Meta Project'],
          ['CustomerName', 'Meta Customer'],
        ],
      },
      {
        name: CUSTOMER_RAW_SHEETS.CONTEXT,
        rows: [
          ['Field', 'Value', 'Guidance'],
          ['Customer Name', 'Acme Corp', ''],
          ['Platform', 'Mobile', ''],
          ['Expected Users / Scale', '10k users', ''],
          ['Constraints', 'Must use SSO', ''],
          ['Priority', 'High', ''],
          ['Deadline', '2027-01-15', ''],
          ['Project Objective', 'Launch portal', ''],
          ['Business Scope', 'Registration only', ''],
        ],
      },
    ]);
    const parsed = parseCustomerRawContext(buf);
    assert.equal(parsed.isCustomerRaw, true);
    assert.equal(parsed.context.customer, 'Acme Corp');
    assert.equal(parsed.context.targetPlatform, 'Mobile');
    assert.equal(parsed.context.targetUsers, '10k users');
    assert.equal(parsed.context.constraint, 'Must use SSO');
    assert.equal(parsed.context.priority, 'High');
  });

  it('skips empty Values', () => {
    const buf = buildWorkbookBuffer([
      {
        name: CUSTOMER_RAW_SHEETS.META,
        rows: [
          ['Key', 'Value'],
          ['TemplateType', CUSTOMER_RAW_TEMPLATE_TYPE],
        ],
      },
      {
        name: CUSTOMER_RAW_SHEETS.CONTEXT,
        rows: [
          ['Field', 'Value', 'Guidance'],
          ['Project Name', 'Named', ''],
          ['Priority', '', ''],
          ['Deadline', '', ''],
        ],
      },
    ]);
    const parsed = parseCustomerRawContext(buf);
    assert.equal(parsed.context.projectName, 'Named');
    assert.equal(parsed.context.priority, undefined);
    assert.equal(parsed.context.deadline, undefined);
  });
});

describe('mapCustomerRawToProjectIntakeDraft', () => {
  it('maps title, description sections, priority, dueDate, customer', () => {
    const draft = mapCustomerRawToProjectIntakeDraft({
      context: {
        projectName: 'Portal X',
        projectObjective: 'Ship MVP',
        businessScope: 'Web only',
        targetUsers: 'Staff',
        targetPlatform: 'Web',
        integration: 'SSO',
        constraint: 'PCI',
        priority: 'High',
        deadline: '2026-12-30',
        customer: 'Acme',
      },
      meta: {},
    });
    assert.equal(draft.title, 'Portal X');
    assert.equal(draft.customerName, 'Acme');
    assert.equal(draft.priority, 'high');
    assert.equal(draft.dueDate, '2026-12-30');
    assert.match(draft.description, /Project Objective/);
    assert.match(draft.description, /Ship MVP/);
    assert.match(draft.description, /Platform/);
    assert.match(draft.description, /Integration/);
    assert.match(draft.description, /Constraints/);
  });

  it('falls back to Meta ProjectName / CustomerName', () => {
    const draft = mapCustomerRawToProjectIntakeDraft({
      context: {},
      meta: { projectName: 'From Meta', customerName: 'Cust Meta' },
    });
    assert.equal(draft.title, 'From Meta');
    assert.equal(draft.customerName, 'Cust Meta');
    assert.equal(draft.description, '');
    assert.equal(draft.priority, null);
    assert.equal(draft.dueDate, '');
  });

  it('does not invent priority when unknown', () => {
    assert.equal(mapPriorityToProject(''), null);
    assert.equal(mapPriorityToProject('weird'), null);
    assert.equal(mapPriorityToProject('Critical'), 'urgent');
    assert.equal(mapPriorityToProject('medium'), 'medium');
  });

  it('end-to-end: builder buffer → draft', async () => {
    const buf = Buffer.from(await buildCustomerRawTemplateBuffer());
    const parsed = parseCustomerRawContext(buf);
    const draft = mapCustomerRawToProjectIntakeDraft(parsed);
    assert.equal(draft.title, 'Course Registration Management');
    assert.equal(draft.dueDate, '2026-12-30');
    assert.match(draft.description, /Platform/);
    assert.match(draft.description, /Web/);
    assert.equal(draft.priority, null);
  });
});

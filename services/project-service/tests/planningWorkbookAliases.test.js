const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  displayHeaderForKey,
  resolveInternalKeyFromHeader,
  remapRowHeadersToInternalKeys,
  exportHeadersForColumns,
} = require('../src/constants/planningWorkbookAliases');
const { mapKindSheetRow } = require('../src/utils/planning/planningWorkbookParse');
const { buildPlanningWorkbookBuffer } = require('../src/utils/planning/planningWorkbookBuilder');
const { parsePlanningWorkbookXlsx } = require('../src/utils/planning/planningWorkbookParse');
const { PLANNING_WORKBOOK_SCHEMA_VERSION } = require('../src/constants/planningWorkbookCatalog');

test('displayHeaderForKey maps Scrum labels', () => {
  assert.equal(displayHeaderForKey('externalKey'), 'Key');
  assert.equal(displayHeaderForKey('parentExternalKey'), 'Parent Key');
  assert.equal(displayHeaderForKey('effortHours'), 'Estimate Hours');
  assert.equal(displayHeaderForKey('endDate'), 'Due Date');
});

test('resolveInternalKeyFromHeader accepts legacy + display', () => {
  assert.equal(resolveInternalKeyFromHeader('externalKey'), 'externalKey');
  assert.equal(resolveInternalKeyFromHeader('Key'), 'externalKey');
  assert.equal(resolveInternalKeyFromHeader('Parent Key'), 'parentExternalKey');
  assert.equal(resolveInternalKeyFromHeader('Description'), 'summary');
  assert.equal(resolveInternalKeyFromHeader('Estimate Hours'), 'effortHours');
  assert.equal(resolveInternalKeyFromHeader('Due Date (Gợi ý)'), 'endDate');
  assert.equal(resolveInternalKeyFromHeader('Assignee Email (Gợi ý)'), 'assigneeEmail');
  assert.equal(resolveInternalKeyFromHeader('Assignee Name (Gợi ý)'), 'assigneeName');
});

test('remapRowHeadersToInternalKeys dual headers', () => {
  const legacy = remapRowHeadersToInternalKeys({
    externalKey: 'WBS-1',
    title: 'A',
    parentExternalKey: '',
  });
  assert.equal(legacy.externalKey, 'WBS-1');
  const scrum = remapRowHeadersToInternalKeys({
    Key: 'WBS-2',
    Title: 'B',
    'Parent Key': 'WBS-1',
    Description: 'desc',
    'Estimate Hours': '8',
  });
  assert.equal(scrum.externalKey, 'WBS-2');
  assert.equal(scrum.title, 'B');
  assert.equal(scrum.parentExternalKey, 'WBS-1');
  assert.equal(scrum.summary, 'desc');
  assert.equal(scrum.effortHours, '8');
});

test('mapKindSheetRow works after remap', () => {
  const item = remapRowHeadersToInternalKeys({
    Key: 'WBS-9',
    Title: 'Leaf',
    'Parent Key': 'WBS-1',
    'Estimate Hours': 16,
  });
  const row = mapKindSheetRow('WBS', item);
  assert.ok(row);
  assert.equal(row.externalKey, 'WBS-9');
  assert.equal(row.title, 'Leaf');
  assert.equal(row.parentExternalKey, 'WBS-1');
  assert.equal(row.structured.effortHours, 16);
});

test('exportHeadersForColumns uses display names', () => {
  const headers = exportHeadersForColumns([
    { key: 'externalKey' },
    { key: 'title' },
    { key: 'parentExternalKey' },
  ]);
  assert.deepEqual(headers, ['Key', 'Title', 'Parent Key']);
});

test('build + parse round-trip with display headers', () => {
  assert.equal(PLANNING_WORKBOOK_SCHEMA_VERSION, '1.2.0');
  const buf = buildPlanningWorkbookBuffer({
    project: { _id: 'p1', name: 'Demo' },
    seed: {
      byKind: {
        WBS: [
          {
            externalKey: 'WBS-RT',
            title: 'Roundtrip',
            parentExternalKey: '',
            effortHours: 4,
          },
        ],
      },
    },
  });
  const parsed = parsePlanningWorkbookXlsx(buf);
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  const wbs = parsed.rows.filter((r) => r.kind === 'WBS');
  assert.ok(wbs.some((r) => r.externalKey === 'WBS-RT'));

  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const wbsHeader = XLSX.utils.sheet_to_json(wb.Sheets.WBS, { header: 1 })[0];
  assert.ok(wbsHeader.includes('Due Date (Gợi ý)'));
  assert.ok(wbsHeader.includes('Assignee Email (Gợi ý)'));
  assert.ok(wbsHeader.includes('Assignee Name (Gợi ý)'));
  assert.equal(wbsHeader.includes('Start Date (Gợi ý)'), false);
  const scheduleHeader = XLSX.utils.sheet_to_json(wb.Sheets.SCHEDULE, { header: 1 })[0];
  assert.ok(scheduleHeader.includes('Due Date'));
  assert.equal(scheduleHeader.includes('Due Date (Gợi ý)'), false);
});

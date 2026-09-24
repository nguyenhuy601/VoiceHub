/**
 * Parse multi-sheet Planning workbook → dump rows (+ structured errors).
 * DEC D-WB3: RESOURCE_ROLES merged into RESOURCE.structured.roles.
 */

const { normalizeDumpRow } = require('./planningDumpParse');
const {
  META_SHEET,
  RESOURCE_ROLES_SHEET,
  PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET,
  PLANNING_WORKBOOK_MAX_ROWS_TOTAL,
  SHEET_COLUMNS,
  RESOURCE_ROLES_COLUMNS,
  isMultiSheetPlanningWorkbook,
  requiredKeysForSheet,
} = require('../../constants/planningWorkbookCatalog');

function asTrimmed(raw, max = 240) {
  return String(raw ?? '')
    .trim()
    .slice(0, max);
}

function pushError(errors, sheet, row, code, message) {
  errors.push({ sheet, row, code, message });
}

function splitSkillKeys(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

/**
 * Map flat sheet row → normalizeDumpRow input using catalog.
 */
function mapKindSheetRow(kind, item) {
  const cols = SHEET_COLUMNS[kind] || [];
  const structured = {};
  let body = '';
  for (const c of cols) {
    const raw = item[c.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    if (c.topLevel && c.key === 'body') {
      body = asTrimmed(raw, 20000);
      continue;
    }
    if (c.structured) {
      if (c.key === 'effortHours' || c.key === 'lagDays') {
        const n = Number(raw);
        if (Number.isFinite(n)) structured[c.key] = n;
      } else if (c.key === 'skillKeys') {
        structured.skillKeys = splitSkillKeys(raw);
      } else {
        structured[c.key] = asTrimmed(raw, c.key.includes('Date') ? 32 : 500);
      }
    }
  }
  const row = normalizeDumpRow({
    kind,
    externalKey: item.externalKey || item.key,
    title: item.title || item.name,
    summary: item.summary || item.description,
    parentExternalKey: item.parentExternalKey || item.parentKey,
    structured,
  });
  if (!row) return null;
  if (body) row.body = body;
  return row;
}

function validateRequired(kind, item, sheet, excelRow, errors) {
  const required = requiredKeysForSheet(kind);
  for (const key of required) {
    if (!asTrimmed(item[key], 500)) {
      pushError(errors, sheet, excelRow, 'REQUIRED', `Thiếu cột bắt buộc: ${key}`);
      return false;
    }
  }
  return true;
}

function parseResourceRolesSheet(jsonRows, errors) {
  const byResource = new Map();
  jsonRows.slice(0, PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET).forEach((item, idx) => {
    const excelRow = idx + 2;
    const resourceExternalKey = asTrimmed(item.resourceExternalKey, 64);
    const roleKey = asTrimmed(item.roleKey, 64);
    const title = asTrimmed(item.title, 240);
    if (!resourceExternalKey && !roleKey && !title) return;
    for (const c of RESOURCE_ROLES_COLUMNS) {
      if (c.required && !asTrimmed(item[c.key], 240)) {
        pushError(errors, RESOURCE_ROLES_SHEET, excelRow, 'REQUIRED', `Thiếu ${c.key}`);
        return;
      }
    }
    const role = {
      roleKey,
      title,
      count: Number.isFinite(Number(item.count)) ? Number(item.count) : 1,
      skillKeys: splitSkillKeys(item.skillKeys),
      effortHours: Number.isFinite(Number(item.effortHours)) ? Number(item.effortHours) : 0,
      notes: asTrimmed(item.notes, 500),
    };
    if (!byResource.has(resourceExternalKey)) byResource.set(resourceExternalKey, []);
    byResource.get(resourceExternalKey).push(role);
  });
  return byResource;
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} fileBuffer
 * @returns {{ rows: object[], errors: Array<{sheet,row,code,message}>, format: string, meta: object }}
 */
function parsePlanningWorkbookXlsx(fileBuffer) {
  const errors = [];
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (e) {
    return {
      rows: [],
      errors: [{ sheet: '', row: 0, code: 'XLSX', message: `xlsx không khả dụng: ${e.message}` }],
      format: 'xlsx_workbook',
      meta: {},
    };
  }

  const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);
  if (!buf.length) {
    return {
      rows: [],
      errors: [{ sheet: '', row: 0, code: 'EMPTY', message: 'empty file' }],
      format: 'xlsx_workbook',
      meta: {},
    };
  }

  let workbook;
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch (e) {
    return {
      rows: [],
      errors: [{ sheet: '', row: 0, code: 'READ', message: `Không đọc được .xlsx: ${e.message}` }],
      format: 'xlsx_workbook',
      meta: {},
    };
  }

  const sheetNames = workbook.SheetNames || [];
  if (!isMultiSheetPlanningWorkbook(sheetNames)) {
    return {
      rows: [],
      errors: [
        {
          sheet: '',
          row: 0,
          code: 'NOT_WORKBOOK',
          message: 'Không phải Planning workbook đa sheet',
        },
      ],
      format: 'xlsx_workbook',
      meta: {},
    };
  }

  const meta = {};
  if (sheetNames.includes(META_SHEET)) {
    const metaJson = XLSX.utils.sheet_to_json(workbook.Sheets[META_SHEET], {
      defval: '',
      raw: false,
    });
    for (const r of metaJson) {
      const k = asTrimmed(r.Key || r.key, 64);
      if (k) meta[k] = asTrimmed(r.Value ?? r.value, 2000);
    }
  }

  let rolesByResource = new Map();
  if (sheetNames.includes(RESOURCE_ROLES_SHEET)) {
    const roleJson = XLSX.utils.sheet_to_json(workbook.Sheets[RESOURCE_ROLES_SHEET], {
      defval: '',
      raw: false,
    });
    rolesByResource = parseResourceRolesSheet(roleJson, errors);
  }

  const rows = [];
  const kindSheets = Object.keys(SHEET_COLUMNS);

  for (const kind of kindSheets) {
    if (!sheetNames.includes(kind)) continue;
    const jsonRows = XLSX.utils.sheet_to_json(workbook.Sheets[kind], {
      defval: '',
      raw: false,
    });
    jsonRows.slice(0, PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET).forEach((item, idx) => {
      if (rows.length >= PLANNING_WORKBOOK_MAX_ROWS_TOTAL) return;
      const excelRow = idx + 2;
      const hasAny = Object.values(item).some((v) => String(v || '').trim());
      if (!hasAny) return;
      if (!validateRequired(kind, item, kind, excelRow, errors)) return;
      const mapped = mapKindSheetRow(kind, item);
      if (!mapped) {
        pushError(errors, kind, excelRow, 'INVALID', 'kind/externalKey/title không hợp lệ');
        return;
      }
      if (kind === 'RESOURCE') {
        const roles = rolesByResource.get(mapped.externalKey) || [];
        if (roles.length) {
          mapped.structured = { ...mapped.structured, roles };
        }
      }
      mapped._sheet = kind;
      mapped._row = excelRow;
      rows.push(mapped);
    });
  }

  for (const [resKey] of rolesByResource) {
    const has = rows.some((r) => r.kind === 'RESOURCE' && r.externalKey === resKey);
    if (!has) {
      pushError(
        errors,
        RESOURCE_ROLES_SHEET,
        0,
        'ORPHAN_ROLE',
        `RESOURCE_ROLES trỏ resourceExternalKey không có trên sheet RESOURCE: ${resKey}`
      );
    }
  }

  return { rows, errors, format: 'xlsx_workbook', meta };
}

module.exports = {
  parsePlanningWorkbookXlsx,
  mapKindSheetRow,
  parseResourceRolesSheet,
};

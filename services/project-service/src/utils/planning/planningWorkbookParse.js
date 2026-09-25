/**
 * Parse multi-sheet Planning workbook → dump rows (+ structured errors).
 * DEC D-WB3: RESOURCE_ROLES merged into RESOURCE.structured.roles.
 * v1.1: physical headers (ID/Name/…) → domain via catalog map; dual-read camelCase.
 */

const { normalizeDumpRow } = require('./planningDumpParse');
const {
  META_SHEET,
  RESOURCE_ROLES_SHEET,
  PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET,
  PLANNING_WORKBOOK_MAX_ROWS_TOTAL,
  SHEET_COLUMNS,
  RESOURCE_ROLES_COLUMNS,
  META_NAME_HEURISTIC_KEYS,
  isMultiSheetPlanningWorkbook,
  requiredKeysForSheet,
  domainItemFromPhysicalRow,
  physicalLabelForDomain,
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
 * Map flat domain sheet row → normalizeDumpRow input using catalog.
 * @param {string} kind
 * @param {Record<string, unknown>} item domain-keyed
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
      const label = physicalLabelForDomain(kind, key);
      pushError(errors, sheet, excelRow, 'REQUIRED', `Thiếu cột bắt buộc: ${label}`);
      return false;
    }
  }
  return true;
}

function parseResourceRolesSheet(jsonRows, errors) {
  const byResource = new Map();
  jsonRows.slice(0, PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET).forEach((rawItem, idx) => {
    const excelRow = idx + 2;
    const item = domainItemFromPhysicalRow(RESOURCE_ROLES_SHEET, rawItem);
    const resourceExternalKey = asTrimmed(item.resourceExternalKey, 64);
    const roleKey = asTrimmed(item.roleKey, 64);
    const title = asTrimmed(item.title, 240);
    if (!resourceExternalKey && !roleKey && !title) return;
    for (const c of RESOURCE_ROLES_COLUMNS) {
      if (c.required && !asTrimmed(item[c.key], 240)) {
        const label = physicalLabelForDomain(RESOURCE_ROLES_SHEET, c.key);
        pushError(errors, RESOURCE_ROLES_SHEET, excelRow, 'REQUIRED', `Thiếu ${label}`);
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
 * Parse 00_Meta: Key/Value (VoiceHub) or template Name-column heuristic.
 * @param {object[]} metaJson
 * @returns {Record<string, string>}
 */
function parseMetaRows(metaJson) {
  const meta = {};
  const rows = Array.isArray(metaJson) ? metaJson : [];
  let hasKeyValue = false;
  for (const r of rows) {
    const k = asTrimmed(r.Key || r.key, 64);
    if (k) {
      hasKeyValue = true;
      meta[k] = asTrimmed(r.Value ?? r.value, 2000);
    }
  }
  if (hasKeyValue) return meta;

  // Template layout: universal headers; sparse Name column values
  const nameValues = [];
  for (const r of rows) {
    const domain = domainItemFromPhysicalRow('WBS', r);
    const name = asTrimmed(domain.title || r.Name || r.name, 500);
    if (name) nameValues.push(name);
  }
  nameValues.slice(0, META_NAME_HEURISTIC_KEYS.length).forEach((val, i) => {
    meta[META_NAME_HEURISTIC_KEYS[i]] = val;
  });
  return meta;
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
          message:
            'Không phải Planning workbook đa sheet (thiếu 00_Meta / WBS…). Tải lại «workbook trống» hoặc «seed từ RA» rồi upload — đừng dùng file tải lỗi (nội dung "undefined").',
        },
      ],
      format: 'xlsx_workbook',
      meta: {},
    };
  }

  let meta = {};
  if (sheetNames.includes(META_SHEET)) {
    const metaJson = XLSX.utils.sheet_to_json(workbook.Sheets[META_SHEET], {
      defval: '',
      raw: false,
    });
    meta = parseMetaRows(metaJson);
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
    jsonRows.slice(0, PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET).forEach((rawItem, idx) => {
      if (rows.length >= PLANNING_WORKBOOK_MAX_ROWS_TOTAL) return;
      const excelRow = idx + 2;
      const hasAny = Object.values(rawItem).some((v) => String(v || '').trim());
      if (!hasAny) return;
      const item = domainItemFromPhysicalRow(kind, rawItem);
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
  parseMetaRows,
};

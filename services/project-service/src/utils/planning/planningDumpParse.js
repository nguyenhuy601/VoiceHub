/**
 * RULE-22 — parse bulk dump Planning (JSON array hoặc CSV đơn giản).
 * Không dùng AnalysisImportSet.
 */

const { PLANNING_ARTIFACT_KINDS } = require('../../constants/planningArtifact');

const KIND_SET = new Set(PLANNING_ARTIFACT_KINDS);

function asTrimmed(raw, max = 240) {
  return String(raw || '')
    .trim()
    .slice(0, max);
}

/**
 * @param {unknown} row
 * @returns {{ kind: string, externalKey: string, title: string, summary: string, structured: object, parentExternalKey: string }|null}
 */
function normalizeDumpRow(row) {
  if (!row || typeof row !== 'object') return null;
  const kind = asTrimmed(row.kind, 32).toUpperCase();
  if (!KIND_SET.has(kind)) return null;
  const externalKey = asTrimmed(row.externalKey || row.key, 64);
  const title = asTrimmed(row.title || row.name, 240);
  if (!externalKey || !title) return null;
  let structured = {};
  if (row.structured && typeof row.structured === 'object') {
    structured = row.structured;
  } else if (typeof row.structuredJson === 'string' && row.structuredJson.trim()) {
    try {
      structured = JSON.parse(row.structuredJson);
    } catch {
      structured = {};
    }
  }
  return {
    kind,
    externalKey,
    title,
    summary: asTrimmed(row.summary || row.description, 2000),
    structured: structured && typeof structured === 'object' ? structured : {},
    parentExternalKey: asTrimmed(row.parentExternalKey || row.parentKey, 64),
  };
}

/**
 * Parse JSON array string or already-parsed array.
 * @param {string|Array} raw
 * @returns {{ rows: object[], errors: string[] }}
 */
function parsePlanningDumpJson(raw) {
  const errors = [];
  let list = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return { rows: [], errors: ['empty'] };
    try {
      list = JSON.parse(text);
    } catch (e) {
      return { rows: [], errors: [`JSON không hợp lệ: ${e.message}`] };
    }
  }
  if (!Array.isArray(list)) {
    return { rows: [], errors: ['Payload phải là mảng artifact'] };
  }
  const rows = [];
  list.slice(0, 200).forEach((item, idx) => {
    const n = normalizeDumpRow(item);
    if (!n) {
      errors.push(`Dòng ${idx + 1}: thiếu kind/externalKey/title hoặc kind không hợp lệ`);
      return;
    }
    rows.push(n);
  });
  return { rows, errors };
}

/**
 * CSV header: kind,externalKey,title,summary,parentExternalKey
 * @param {string} text
 */
function parsePlanningDumpCsv(text) {
  const errors = [];
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ['empty'] };
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    kind: header.indexOf('kind'),
    externalKey: header.indexOf('externalkey') >= 0 ? header.indexOf('externalkey') : header.indexOf('key'),
    title: header.indexOf('title'),
    summary: header.indexOf('summary'),
    parentExternalKey: header.indexOf('parentexternalkey'),
    startDate: header.indexOf('startdate'),
    endDate: header.indexOf('enddate'),
    targetDate: header.indexOf('targetdate'),
    effortHours: header.indexOf('efforthours'),
  };
  if (idx.kind < 0 || idx.externalKey < 0 || idx.title < 0) {
    return {
      rows: [],
      errors: ['CSV cần header: kind,externalKey,title[,summary,parentExternalKey,startDate,endDate,targetDate]'],
    };
  }
  const rows = [];
  for (let i = 1; i < lines.length && rows.length < 200; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const structured = {};
    if (idx.startDate >= 0 && cols[idx.startDate]) structured.startDate = cols[idx.startDate];
    if (idx.endDate >= 0 && cols[idx.endDate]) structured.endDate = cols[idx.endDate];
    if (idx.targetDate >= 0 && cols[idx.targetDate]) structured.targetDate = cols[idx.targetDate];
    if (idx.effortHours >= 0 && cols[idx.effortHours]) {
      const n = Number(cols[idx.effortHours]);
      if (Number.isFinite(n)) structured.effortHours = n;
    }
    const n = normalizeDumpRow({
      kind: cols[idx.kind],
      externalKey: cols[idx.externalKey],
      title: cols[idx.title],
      summary: idx.summary >= 0 ? cols[idx.summary] : '',
      parentExternalKey: idx.parentExternalKey >= 0 ? cols[idx.parentExternalKey] : '',
      structured,
    });
    if (!n) {
      errors.push(`CSV dòng ${i + 1}: không hợp lệ`);
      continue;
    }
    rows.push(n);
  }
  return { rows, errors };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} fileBuffer
 * @returns {{ rows: object[], errors: string[] }}
 */
function parsePlanningDumpXlsx(fileBuffer) {
  const errors = [];
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (e) {
    return { rows: [], errors: [`xlsx không khả dụng: ${e.message}`] };
  }
  const buf = Buffer.isBuffer(fileBuffer)
    ? fileBuffer
    : Buffer.from(fileBuffer || []);
  if (!buf.length) return { rows: [], errors: ['empty file'] };
  let workbook;
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  } catch (e) {
    return { rows: [], errors: [`Không đọc được .xlsx: ${e.message}`] };
  }
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return { rows: [], errors: ['Workbook không có sheet'] };
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const rows = [];
  jsonRows.slice(0, 200).forEach((item, idx) => {
    const structured = {};
    if (item.startDate) structured.startDate = String(item.startDate).slice(0, 32);
    if (item.endDate) structured.endDate = String(item.endDate).slice(0, 32);
    if (item.targetDate) structured.targetDate = String(item.targetDate).slice(0, 32);
    if (item.effortHours !== undefined && item.effortHours !== '') {
      const n = Number(item.effortHours);
      if (Number.isFinite(n)) structured.effortHours = n;
    }
    if (item.fromKey) structured.fromKey = String(item.fromKey).slice(0, 64);
    if (item.toKey) structured.toKey = String(item.toKey).slice(0, 64);
    const n = normalizeDumpRow({
      kind: item.kind,
      externalKey: item.externalKey || item.key,
      title: item.title || item.name,
      summary: item.summary || item.description,
      parentExternalKey: item.parentExternalKey || item.parentKey,
      structured: Object.keys(structured).length ? structured : item.structured,
    });
    if (!n) {
      errors.push(`Sheet dòng ${idx + 2}: không hợp lệ`);
      return;
    }
    rows.push(n);
  });
  return { rows, errors };
}

/**
 * Build minimal xlsx buffer template for Planning dump.
 * @returns {Buffer}
 */
function buildPlanningDumpTemplateBuffer() {
  const XLSX = require('xlsx');
  const rows = [
    {
      kind: 'WBS',
      externalKey: 'WBS-01',
      title: 'Example work package',
      summary: 'Replace with real plan',
      parentExternalKey: '',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      targetDate: '',
      effortHours: 40,
    },
    {
      kind: 'MILESTONE',
      externalKey: 'MS-01',
      title: 'Phase 2 start',
      summary: '',
      parentExternalKey: '',
      startDate: '',
      endDate: '',
      targetDate: '2026-11-01',
      effortHours: '',
    },
    {
      kind: 'SCHEDULE',
      externalKey: 'SCH-01',
      title: 'Delivery schedule',
      summary: '',
      parentExternalKey: '',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      targetDate: '',
      effortHours: '',
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Planning');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * @param {string|Array|object} body
 * @returns {{ rows: object[], errors: string[], format: string }}
 */
function parsePlanningDumpPayload(body = {}) {
  if (Array.isArray(body)) {
    const parsed = parsePlanningDumpJson(body);
    return { ...parsed, format: 'json' };
  }
  if (body && typeof body === 'object') {
    const format = String(body.format || 'json')
      .trim()
      .toLowerCase();

    if (format === 'xlsx' || body.base64 || body.fileBase64) {
      const b64 = String(body.base64 || body.fileBase64 || '')
        .replace(/^data:[^;]+;base64,/, '')
        .trim();
      if (!b64) {
        return { rows: [], errors: ['Thiếu base64 file .xlsx'], format: 'xlsx' };
      }
      let buf;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch {
        return { rows: [], errors: ['base64 không hợp lệ'], format: 'xlsx' };
      }
      if (buf.length > 2 * 1024 * 1024) {
        return { rows: [], errors: ['File .xlsx vượt 2MB'], format: 'xlsx' };
      }
      const parsed = parsePlanningDumpXlsx(buf);
      return { ...parsed, format: 'xlsx' };
    }

    if (Array.isArray(body.items) || Array.isArray(body.artifacts)) {
      const parsed = parsePlanningDumpJson(body.items || body.artifacts);
      return { ...parsed, format: 'json' };
    }
    const raw = body.text != null ? body.text : body.csv != null ? body.csv : body.json;
    if (format === 'csv' || (typeof raw === 'string' && raw.includes('kind,') && raw.includes('externalKey'))) {
      const parsed = parsePlanningDumpCsv(String(raw || body.csv || ''));
      return { ...parsed, format: 'csv' };
    }
    if (raw != null) {
      const parsed = parsePlanningDumpJson(raw);
      return { ...parsed, format: 'json' };
    }
  }
  if (typeof body === 'string') {
    if (body.trim().startsWith('[')) {
      return { ...parsePlanningDumpJson(body), format: 'json' };
    }
    return { ...parsePlanningDumpCsv(body), format: 'csv' };
  }
  return { rows: [], errors: ['Không nhận diện được format dump'], format: 'unknown' };
}

module.exports = {
  normalizeDumpRow,
  parsePlanningDumpJson,
  parsePlanningDumpCsv,
  parsePlanningDumpXlsx,
  buildPlanningDumpTemplateBuffer,
  parsePlanningDumpPayload,
  KIND_SET,
};

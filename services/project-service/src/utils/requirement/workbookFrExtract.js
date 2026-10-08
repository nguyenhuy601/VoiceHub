/**
 * Deterministic structured FR extraction from an Excel buffer.
 * Full text and RAG never create functionalRequirements.
 */

const XLSX = require('xlsx');
const { normHeader, normId, normKey, normProse } = require('./requirementTemplateTextNorm');
const {
  PARSER_VERSION,
  emptyWorkbookDiagnostic,
  failedDiagnostic,
} = require('./workbookDiagnostic');

const HEADER_SCAN_LIMIT = 15;
const HEADER_MIN = 10;
const BLANK_GAP_ROWS = 2;
const MAP_WEIGHT = 10;
const TABLE_SCORE_MARGIN = 8;
const SHEET_SCORE_MARGIN = 8;
const NAME_ALIAS_SCORE = 50;
const NAME_NEGATIVE_SCORE = -80;

const SHEET_ALIASES = new Set([
  '03 requirement',
  'functional requirements',
  'functional requirement',
  'fr',
  'requirements',
  '03 functional requirements',
]);

const NEGATIVE_SHEET_NAMES = new Set([
  'requirement history',
  'mapping',
  'risk register',
]);

const FIELD_ALIASES = Object.freeze({
  id: ['requirement id', 'req id', 'fr id', 'id', 'requirement no'],
  requirement: ['requirement', 'feature', 'functional requirement', 'requirement statement'],
  description: ['description', 'details', 'detail'],
  module: ['module / area', 'module/area', 'module', 'area'],
  acceptanceCriteria: [
    'acceptance criteria',
    'acceptance / expected result',
    'acceptance',
    'expected result',
    'ac',
  ],
});

const ACTOR_ALIASES = ['user / actor', 'user/actor', 'actor', 'user'];
const PRIORITY_ALIASES = ['priority'];

/** Unequal unique-best collision. Not a customer header. */
const DUAL_UNEQUAL_HEADERS = Object.freeze({
  'id requirement': { id: 90, requirement: 60 },
});

const INCOMPATIBLE_FIELDS = new Set(['id', 'requirement', 'description', 'module', 'acceptanceCriteria']);

function sheetNameKey(name) {
  return normHeader(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function sheetNameScore(name) {
  const key = sheetNameKey(name);
  if (NEGATIVE_SHEET_NAMES.has(key)) return NAME_NEGATIVE_SCORE;
  if (SHEET_ALIASES.has(key)) return NAME_ALIAS_SCORE;
  return 0;
}

function colLetter(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellText(value) {
  if (value == null) return '';
  return String(value);
}

function readSheetGrid(ws) {
  const merges = Array.isArray(ws?.['!merges']) ? ws['!merges'] : [];
  const tablesDetected = Array.isArray(ws?.['!tables']) ? ws['!tables'].length : 0;
  const ref = ws?.['!ref'];
  if (!ref) return { rows: [], formulaCells: 0, merges, tablesDetected };
  const range = XLSX.utils.decode_range(ref);
  const rows = [];
  let formulaCells = 0;
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const line = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell?.f && (cell.v == null || cell.v === '')) {
        formulaCells += 1;
        line.push('');
        continue;
      }
      line.push(cell?.v == null ? '' : cell.v);
    }
    rows.push(line);
  }
  return { rows, formulaCells, merges, tablesDetected };
}

function hiddenSheetNames(workbook) {
  const hidden = new Set();
  const meta = workbook?.Workbook?.Sheets || [];
  (workbook?.SheetNames || []).forEach((name, index) => {
    const flag = meta[index]?.Hidden;
    if (flag === 1 || flag === 2) hidden.add(name);
  });
  return hidden;
}

function scoreHeaderCell(raw) {
  const key = normHeader(raw);
  if (!key) return [];
  if (DUAL_UNEQUAL_HEADERS[key]) {
    return Object.entries(DUAL_UNEQUAL_HEADERS[key]).map(([field, score]) => ({ field, score }));
  }
  const parts = key.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const hits = [];
    for (const part of parts) {
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.includes(part)) hits.push({ field, score: 100 });
      }
    }
    return hits;
  }
  const hits = [];
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(key)) hits.push({ field, score: 100 });
  }
  return hits;
}

function scoreHeaderRow(line) {
  const cells = (line || []).map((value) => cellText(value));
  const nonEmpty = cells.filter((value) => normHeader(value)).length;
  const cellScores = cells.map((value, index) => ({
    index,
    column: colLetter(index),
    header: normHeader(value),
    hits: scoreHeaderCell(value),
  }));
  const fields = new Set();
  cellScores.forEach((cell) => cell.hits.forEach((hit) => fields.add(hit.field)));
  const semantic = fields.size;
  const headerScore = nonEmpty + semantic * 10;
  return { nonEmpty, semantic, headerScore, cellScores };
}

function resolveMapping(headerScore) {
  const candidates = [];
  for (const cell of headerScore.cellScores) {
    for (const hit of cell.hits) {
      candidates.push({ column: cell.column, field: hit.field, score: hit.score, index: cell.index });
    }
  }
  for (const cell of headerScore.cellScores) {
    const byField = new Map();
    for (const hit of cell.hits) {
      const prev = byField.get(hit.field);
      if (!prev || hit.score > prev) byField.set(hit.field, hit.score);
    }
    const ranked = [...byField.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length >= 2 && ranked[0][1] > 0 && ranked[0][1] === ranked[1][1]) {
      return {
        mapping: {},
        indexes: {},
        mappingDiagnostic: {
          status: 'INCOMPLETE',
          required: ['id', 'requirement'],
          mapped: [],
          missing: ['id', 'requirement'],
          candidates,
          failureReason: 'MAPPING_AMBIGUOUS',
        },
      };
    }
  }

  const byField = new Map();
  for (const candidate of candidates) {
    if (!byField.has(candidate.field)) byField.set(candidate.field, []);
    byField.get(candidate.field).push(candidate);
  }
  for (const list of byField.values()) {
    list.sort((a, b) => b.score - a.score || a.index - b.index);
  }

  const incompatible = [];
  const fieldNames = [...byField.keys()].filter((field) => INCOMPATIBLE_FIELDS.has(field));
  for (let i = 0; i < fieldNames.length; i += 1) {
    for (let j = i + 1; j < fieldNames.length; j += 1) {
      const left = byField.get(fieldNames[i])[0];
      const right = byField.get(fieldNames[j])[0];
      const leftSecond = byField.get(fieldNames[i])[1]?.score || 0;
      const rightSecond = byField.get(fieldNames[j])[1]?.score || 0;
      if (
        left &&
        right &&
        left.index === right.index &&
        left.score > leftSecond &&
        right.score > rightSecond &&
        left.score !== right.score
      ) {
        incompatible.push(left.column);
      }
    }
  }
  if (incompatible.length) {
    return {
      mapping: {},
      mappingDiagnostic: {
        status: 'INVALID',
        required: ['id', 'requirement'],
        mapped: [],
        missing: ['id', 'requirement'],
        candidates,
        failureReason: 'MAPPING_INVALID',
      },
    };
  }

  const used = new Set();
  const indexes = {};
  const mapping = {};
  const rankedPairs = [...candidates].sort(
    (a, b) => b.score - a.score || a.index - b.index || a.field.localeCompare(b.field)
  );
  for (const pair of rankedPairs) {
    if (mapping[pair.field] || used.has(pair.index)) continue;
    mapping[pair.field] = pair.column;
    indexes[pair.field] = pair.index;
    used.add(pair.index);
  }

  const actorCell = headerScore.cellScores.find((cell) => ACTOR_ALIASES.includes(cell.header));
  const priorityCell = headerScore.cellScores.find((cell) => PRIORITY_ALIASES.includes(cell.header));
  if (actorCell && !used.has(actorCell.index)) indexes.actor = actorCell.index;
  if (priorityCell && !used.has(priorityCell.index)) indexes.priority = priorityCell.index;

  const mapped = Object.keys(mapping);
  const contentMapped = Boolean(mapping.requirement || mapping.description);
  const missing = [];
  if (!mapping.id) missing.push('id');
  if (!contentMapped) missing.push('requirement');
  let status = 'COMPLETE';
  let failureReason;
  if (!mapped.length) {
    status = 'EMPTY';
    failureReason = 'MAPPING_EMPTY';
  } else if (missing.length) {
    status = 'INCOMPLETE';
    failureReason = 'MAPPING_INCOMPLETE';
  }
  return {
    mapping,
    indexes,
    mappingDiagnostic: {
      status,
      required: ['id', 'requirement'],
      mapped,
      missing,
      candidates,
      ...(failureReason ? { failureReason } : {}),
    },
  };
}

function isSeparatorRow(line) {
  const values = (line || []).map((value) => normProse(cellText(value))).filter(Boolean);
  if (!values.length) return false;
  return values.every((value) => /^[-_.=*~]{3,}$/.test(value.replace(/\s/g, '')));
}

function isSectionRow(line, idIndex) {
  const values = (line || []).map((value) => normProse(cellText(value))).filter(Boolean);
  if (!values.length) return false;
  const joined = values.join(' ');
  const idText = idIndex == null ? '' : normProse(cellText(line[idIndex]));
  if (/^(module|section|area)\s*:/i.test(idText)) return true;
  if (/^(module|section|area)\s*:/i.test(joined) && !normId(idText)) return true;
  return values.length === 1 && /^(module|section|area)\b/i.test(values[0]);
}

function sectionModuleName(line) {
  const joined = (line || []).map((value) => normProse(cellText(value))).filter(Boolean).join(' ');
  const match = joined.match(/^(?:module|section|area)\s*:\s*(.+)$/i);
  return match ? normProse(match[1]).slice(0, 240) : '';
}

function mergeMasterValue(merges, rows, rowIndex, colIndex) {
  if (colIndex == null || !Array.isArray(merges)) return '';
  for (const merge of merges) {
    if (rowIndex < merge.s.r || rowIndex > merge.e.r) continue;
    if (colIndex < merge.s.c || colIndex > merge.e.c) continue;
    return cellText(rows[merge.s.r]?.[merge.s.c]);
  }
  return '';
}

function isSemanticHeaderRow(scored) {
  if (scored.semantic >= 2 && scored.headerScore >= HEADER_MIN) return true;
  const nonEmptyCells = scored.cellScores.filter((cell) => cell.header);
  if (!nonEmptyCells.length || scored.headerScore < HEADER_MIN) return false;
  const allAliased = nonEmptyCells.every((cell) => cell.hits.length > 0);
  const strong = nonEmptyCells.some((cell) => cell.hits.some(
    (hit) => hit.field === 'id' || hit.field === 'requirement' || hit.field === 'description'
  ));
  return allAliased && strong;
}

function buildTables(rows) {
  const semantic = [];
  rows.forEach((line, index) => {
    const scored = scoreHeaderRow(line);
    if (isSemanticHeaderRow(scored)) semantic.push({ rowIndex: index, ...scored });
  });
  if (!semantic.length) {
    let structural = null;
    const limit = Math.min(rows.length, HEADER_SCAN_LIMIT);
    for (let index = 0; index < limit; index += 1) {
      const scored = scoreHeaderRow(rows[index]);
      if (scored.nonEmpty >= 2 && (!structural || scored.headerScore > structural.headerScore)) {
        structural = { rowIndex: index, ...scored };
      }
    }
    if (!structural) return [];
    return [{ ...structural, endIndex: rows.length - 1 }];
  }

  return semantic.map((header, index) => {
    const next = semantic[index + 1];
    let endIndex = next ? next.rowIndex - 1 : rows.length - 1;
    let blanks = 0;
    for (let rowIndex = header.rowIndex + 1; rowIndex <= endIndex; rowIndex += 1) {
      const line = rows[rowIndex] || [];
      const empty = (line.every((value) => !normProse(cellText(value))) || isSeparatorRow(line));
      blanks = empty ? blanks + 1 : 0;
      if (blanks >= BLANK_GAP_ROWS) {
        endIndex = rowIndex - blanks;
        break;
      }
    }
    return { ...header, endIndex };
  });
}

function tableScoreOf(table, resolved, candidateCount) {
  const requiredHits = (resolved.mapping.id ? 1 : 0)
    + (resolved.mapping.requirement || resolved.mapping.description ? 1 : 0);
  return table.headerScore + requiredHits * MAP_WEIGHT + candidateCount;
}

function countQuickCandidates(rows, table, indexes) {
  if (indexes.id == null && indexes.requirement == null && indexes.description == null) return 0;
  let count = 0;
  for (let rowIndex = table.rowIndex + 1; rowIndex <= table.endIndex; rowIndex += 1) {
    const line = rows[rowIndex] || [];
    if (line.every((value) => !normProse(cellText(value)))) continue;
    if (isSeparatorRow(line) || isSectionRow(line, indexes.id)) continue;
    count += 1;
  }
  return count;
}

function classifyTableRows(rows, table, resolved, merges) {
  const indexes = resolved.indexes || {};
  const result = {
    rowsDetected: 0,
    frCandidates: 0,
    valid: [],
    invalid: [],
    missingId: 0,
    duplicateFr: 0,
    blankRowsSkipped: 0,
    duplicateSamples: [],
  };
  if (resolved.mappingDiagnostic.status !== 'COMPLETE') return result;

  let pendingSectionModule = '';
  const groups = new Map();
  for (let rowIndex = table.rowIndex + 1; rowIndex <= table.endIndex; rowIndex += 1) {
    const line = rows[rowIndex] || [];
    result.rowsDetected += 1;
    const excelRow = rowIndex + 1;
    if (line.every((value) => !normProse(cellText(value))) || isSeparatorRow(line)) {
      result.blankRowsSkipped += 1;
      pendingSectionModule = '';
      continue;
    }
    if (isSectionRow(line, indexes.id)) {
      pendingSectionModule = sectionModuleName(line);
      continue;
    }
    result.frCandidates += 1;
    const externalId = normId(cellText(line[indexes.id])).slice(0, 64);
    const requirementText = normProse(cellText(line[indexes.requirement])).slice(0, 500);
    const descriptionText = normProse(cellText(line[indexes.description])).slice(0, 4000);
    let moduleLabel = normProse(cellText(line[indexes.module])).slice(0, 240);
    if (!moduleLabel && indexes.module != null) {
      const mergedValue = normProse(mergeMasterValue(merges, rows, rowIndex, indexes.module)).slice(0, 240);
      if (mergedValue) moduleLabel = mergedValue;
      else if (pendingSectionModule) moduleLabel = pendingSectionModule;
    }
    pendingSectionModule = '';
    if (!externalId) {
      result.missingId += 1;
      continue;
    }
    const name = requirementText || descriptionText;
    if (!name) {
      result.invalid.push({ row: excelRow, reason: 'missing_requirement_content' });
      continue;
    }
    const fr = {
      externalId,
      level: 'Requirement',
      parentExternalId: '',
      name: name.slice(0, 500),
      // RULE-DESC-01: description only from the description column — never copy name.
      description: descriptionText.slice(0, 4000),
      moduleLabel,
      actor: normProse(cellText(line[indexes.actor])).slice(0, 240),
      acceptanceCriteria: normProse(cellText(line[indexes.acceptanceCriteria])).slice(0, 4000),
      priority: normKey(cellText(line[indexes.priority]), { kind: 'priority' }) || 'Medium',
      sourceRow: excelRow,
    };
    if (!groups.has(externalId)) groups.set(externalId, []);
    groups.get(externalId).push(fr);
  }

  for (const [externalId, list] of groups) {
    result.valid.push(list[0]);
    if (list.length > 1) {
      result.duplicateFr += list.length - 1;
      result.duplicateSamples.push({
        externalId,
        rows: list.map((row) => row.sourceRow),
      });
    }
  }
  return result;
}

function selectTables(rows, tables) {
  const scored = tables.map((table) => {
    const resolved = resolveMapping(table);
    const candidateCount = countQuickCandidates(rows, table, resolved.indexes || {});
    return {
      table,
      resolved,
      candidateCount,
      score: tableScoreOf(table, resolved, candidateCount),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.table.rowIndex - b.table.rowIndex);
  if (!scored.length) {
    return { selected: null, ambiguous: false, scored };
  }
  if (scored.length === 1) return { selected: scored[0], ambiguous: false, scored };
  const margin = scored[0].score - scored[1].score;
  if (margin < TABLE_SCORE_MARGIN) return { selected: null, ambiguous: true, scored };
  return { selected: scored[0], ambiguous: false, scored };
}

function sheetCandidate(name, grid) {
  const nameScore = sheetNameScore(name);
  if (nameScore < 0) {
    return {
      sheet: name,
      score: nameScore,
      signals: ['negative_sheet_name'],
      selectable: false,
    };
  }
  const tables = buildTables(grid.rows);
  const selection = selectTables(grid.rows, tables);
  const best = selection.scored[0];
  const semantic = best ? best.table.semantic : 0;
  const signals = [];
  if (nameScore > 0) signals.push('name_alias');
  if (semantic > 0) signals.push('header');
  if (best?.resolved?.mappingDiagnostic?.mapped?.length) signals.push('mapped_columns');
  if (best?.candidateCount) signals.push('data_rows');
  const selectable = nameScore > 0 || (nameScore === 0 && semantic > 0);
  const score = selectable
    ? nameScore + (best ? best.score : 0)
    : 0;
  return {
    sheet: name,
    score,
    signals,
    selectable,
    grid,
    selection,
  };
}

function applyStatus(diagnostic) {
  const reasons = diagnostic.reasonCodes;
  const mapping = diagnostic.mappingDiagnostic;
  const validFr = diagnostic.rows.validFr;
  const blocking = reasons.some((code) =>
    ['SHEET_NOT_FOUND', 'HEADER_NOT_FOUND', 'REQUIREMENT_ROWS_EMPTY', 'AMBIGUOUS_SOURCE', 'UNSUPPORTED_WORKBOOK', 'PARSER_ERROR'].includes(code)
  );
  const unresolvedTables = reasons.includes('MULTIPLE_REQUIREMENT_TABLES')
    && diagnostic.tableSelection.selectedHeaderRow == null;
  if (diagnostic.status === 'FAILED') return diagnostic;
  if (blocking || unresolvedTables || mapping.failureReason || mapping.status !== 'COMPLETE' || validFr <= 0) {
    diagnostic.status = 'NOT_READY';
    return diagnostic;
  }
  if (reasons.length) diagnostic.status = 'PARTIAL';
  else diagnostic.status = 'SUCCESS';
  return diagnostic;
}

function extractFromWorkbook(workbook, opts = {}) {
  const diagnostic = emptyWorkbookDiagnostic(opts.fileName);
  diagnostic.parserVersion = PARSER_VERSION;
  const names = workbook?.SheetNames || [];
  const hidden = hiddenSheetNames(workbook);
  diagnostic.workbook.sheetsDetected = names.length;
  diagnostic.warnings.hiddenSheets = hidden.size;
  const scanned = [];
  for (const name of names) {
    if (hidden.has(name)) continue;
    diagnostic.workbook.sheetsScanned += 1;
    const grid = readSheetGrid(workbook.Sheets[name]);
    diagnostic.warnings.formulaCellsDetected += grid.formulaCells;
    diagnostic.warnings.mergedCellsDetected += grid.merges.length;
    diagnostic.warnings.tablesDetected += grid.tablesDetected;
    scanned.push(sheetCandidate(name, grid));
  }
  diagnostic.sheetSelection.candidates = scanned
    .filter((item) => item.selectable || item.signals.includes('negative_sheet_name'))
    .map((item) => ({ sheet: item.sheet, score: item.score, signals: item.signals }));

  const selectable = scanned.filter((item) => item.selectable && item.score > 0);
  selectable.sort((a, b) => b.score - a.score || a.sheet.localeCompare(b.sheet));
  if (!selectable.length) {
    diagnostic.reasonCodes = ['SHEET_NOT_FOUND'];
    diagnostic.mappingDiagnostic = {
      status: 'EMPTY',
      required: ['id', 'requirement'],
      mapped: [],
      missing: ['id', 'requirement'],
      candidates: [],
    };
    return { functionalRequirements: [], diagnostic: applyStatus(diagnostic) };
  }
  if (selectable.length > 1 && selectable[0].score - selectable[1].score < SHEET_SCORE_MARGIN) {
    diagnostic.sheetSelection.ambiguous = true;
    diagnostic.reasonCodes = ['AMBIGUOUS_SOURCE'];
    diagnostic.mappingDiagnostic = {
      status: 'EMPTY',
      required: ['id', 'requirement'],
      mapped: [],
      missing: ['id', 'requirement'],
      candidates: [],
    };
    return { functionalRequirements: [], diagnostic: applyStatus(diagnostic) };
  }

  const chosen = selectable[0];
  diagnostic.sheetSelection.selected = chosen.sheet;
  const tables = chosen.selection;
  diagnostic.tableSelection.candidates = tables.scored.map((item) => ({
    sheet: chosen.sheet,
    headerRow: item.table.rowIndex + 1,
    score: item.score,
  }));
  const headerWindow = [];
  const limit = Math.min(chosen.grid.rows.length, HEADER_SCAN_LIMIT);
  for (let index = 0; index < limit; index += 1) {
    const scored = scoreHeaderRow(chosen.grid.rows[index]);
    if (scored.nonEmpty >= 2 || scored.semantic > 0) headerWindow.push(index + 1);
  }
  diagnostic.header.candidateRows = headerWindow;

  if (!tables.scored.length) {
    diagnostic.reasonCodes = ['HEADER_NOT_FOUND'];
    diagnostic.mappingDiagnostic = {
      status: 'EMPTY',
      required: ['id', 'requirement'],
      mapped: [],
      missing: ['id', 'requirement'],
      candidates: [],
    };
    return { functionalRequirements: [], diagnostic: applyStatus(diagnostic) };
  }
  if (tables.ambiguous) {
    diagnostic.reasonCodes = ['MULTIPLE_REQUIREMENT_TABLES'];
    diagnostic.mappingDiagnostic = tables.scored[0].resolved.mappingDiagnostic;
    diagnostic.mapping = tables.scored[0].resolved.mapping;
    return { functionalRequirements: [], diagnostic: applyStatus(diagnostic) };
  }

  const picked = tables.selected;
  diagnostic.tableSelection.selectedHeaderRow = picked.table.rowIndex + 1;
  diagnostic.header.selectedRow = picked.table.rowIndex + 1;
  diagnostic.header.columnsDetected = picked.table.nonEmpty;
  diagnostic.mapping = picked.resolved.mapping;
  diagnostic.mappingDiagnostic = picked.resolved.mappingDiagnostic;
  if (picked.resolved.mappingDiagnostic.failureReason) {
    return { functionalRequirements: [], diagnostic: applyStatus(diagnostic) };
  }
  if (tables.scored.length > 1) diagnostic.reasonCodes.push('MULTIPLE_REQUIREMENT_TABLES');

  const classified = classifyTableRows(
    chosen.grid.rows,
    picked.table,
    picked.resolved,
    chosen.grid.merges
  );
  diagnostic.rows = {
    rowsDetected: classified.rowsDetected,
    frCandidates: classified.frCandidates,
    validFr: classified.valid.length,
    invalidRows: classified.invalid.length,
    missingId: classified.missingId,
    duplicateFr: classified.duplicateFr,
  };
  diagnostic.warnings.blankRowsSkipped += classified.blankRowsSkipped;
  diagnostic.frSourceMap = classified.valid.map((row) => ({
    externalId: row.externalId,
    sheet: chosen.sheet,
    row: row.sourceRow,
  }));
  diagnostic.samples.invalidRows = classified.invalid.map((row) => ({
    sheet: chosen.sheet,
    row: row.row,
    reason: row.reason,
  }));
  diagnostic.samples.duplicateIds = classified.duplicateSamples;

  if (
    picked.resolved.mappingDiagnostic.status === 'COMPLETE' &&
    classified.frCandidates > 0 &&
    classified.invalid.length > 0
  ) {
    diagnostic.reasonCodes.push('INVALID_ROWS');
  }
  if (classified.missingId > 0) diagnostic.reasonCodes.push('MISSING_REQUIRED_ID');
  if (classified.duplicateFr > 0) diagnostic.reasonCodes.push('DUPLICATE_ID');
  if (classified.frCandidates === 0 && classified.rowsDetected >= 0 && diagnostic.rows.validFr === 0 && !classified.missingId && !classified.invalid.length) {
    diagnostic.reasonCodes.push('REQUIREMENT_ROWS_EMPTY');
  }
  const functionalRequirements = classified.valid.map((row) => {
    const next = { ...row };
    delete next.sourceRow;
    return next;
  });
  return { functionalRequirements, diagnostic: applyStatus(diagnostic) };
}

function extractWorkbookFr(buffer, opts = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return {
      functionalRequirements: [],
      diagnostic: failedDiagnostic('UNSUPPORTED_WORKBOOK', 'Workbook buffer is empty', opts.fileName),
    };
  }
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isZip) {
    return {
      functionalRequirements: [],
      diagnostic: failedDiagnostic('PARSER_ERROR', 'Workbook is not a readable xlsx package', opts.fileName),
    };
  }
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    return extractFromWorkbook(workbook, opts);
  } catch (err) {
    return {
      functionalRequirements: [],
      diagnostic: failedDiagnostic('PARSER_ERROR', err.message || 'Parser error', opts.fileName),
    };
  }
}

module.exports = {
  HEADER_MIN,
  BLANK_GAP_ROWS,
  MAP_WEIGHT,
  TABLE_SCORE_MARGIN,
  SHEET_SCORE_MARGIN,
  extractWorkbookFr,
  extractFromWorkbook,
};

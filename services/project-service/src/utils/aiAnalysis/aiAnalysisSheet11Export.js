/**
 * Export sheet 11_AI_Analysis_Output from confirmed aiAnalysis jobs (W2).
 */

const ExcelJS = require('exceljs');
const { SHEETS, SHEET_COLUMNS } = require('../../constants/requirementTemplate.constants');
const {
  AI_ANALYSIS_USER_JOBS,
  AI_ANALYSIS_JOB_OUTPUT_MAP,
} = require('../../constants/aiAnalysisJobs.constants');
const { ensureAiAnalysisContainer } = require('./aiAnalysisContainer');

function pushRow(rows, section, key, value) {
  let v = value;
  if (v == null) v = '';
  else if (typeof v === 'object') v = JSON.stringify(v);
  else v = String(v);
  if (v.length > 2000) v = `${v.slice(0, 1997)}...`;
  rows.push([section, key, v]);
}

function collectConfirmedRows(aiAnalysis) {
  const c = ensureAiAnalysisContainer(aiAnalysis);
  const rows = [];
  pushRow(rows, 'Meta', 'schemaVersion', c.schemaVersion);
  pushRow(rows, 'Meta', 'currentJob', c.currentJob || '');

  for (const job of AI_ANALYSIS_USER_JOBS) {
    const meta = c.jobs[job];
    if (meta.status !== 'confirmed') continue;
    const section = `Job:${job}`;
    pushRow(rows, section, 'status', meta.status);
    pushRow(rows, section, 'confirmedAt', meta.confirmedAt || '');
    pushRow(rows, section, 'model', meta.model || '');

    const map = AI_ANALYSIS_JOB_OUTPUT_MAP[job] || {};
    for (const key of map.analyses || []) {
      const block = c.analyses[key];
      pushRow(rows, section, `analyses.${key}.status`, block.status);
      pushRow(rows, section, `analyses.${key}.itemsCount`, (block.items || []).length);
      if (Array.isArray(block.entities) && block.entities.length) {
        pushRow(rows, section, `analyses.${key}.entitiesCount`, block.entities.length);
      }
      if (Array.isArray(block.dataFlows) && block.dataFlows.length) {
        pushRow(rows, section, `analyses.${key}.dataFlowsCount`, block.dataFlows.length);
      }
      if (Array.isArray(block.edges) && block.edges.length) {
        pushRow(rows, section, `analyses.${key}.edgesCount`, block.edges.length);
      }
      if (Array.isArray(block.orderHint) && block.orderHint.length) {
        pushRow(rows, section, `analyses.${key}.orderHintCount`, block.orderHint.length);
      }
      if (key === 'gap' && block.meta?.severityCounts) {
        pushRow(
          rows,
          section,
          `analyses.gap.severityCounts`,
          block.meta.severityCounts
        );
        pushRow(
          rows,
          section,
          `analyses.gap.hardBlockNextJob`,
          Boolean(block.meta.hardBlockNextJob)
        );
      }
      if (key === 'architectureImpact' && Array.isArray(block.chains) && block.chains.length) {
        pushRow(rows, section, `analyses.${key}.chainsCount`, block.chains.length);
      }
      if (key === 'risk' && block.meta?.bandCounts) {
        pushRow(rows, section, `analyses.risk.bandCounts`, block.meta.bandCounts);
        pushRow(
          rows,
          section,
          `analyses.risk.hardBlockNextJob`,
          Boolean(block.meta.hardBlockNextJob)
        );
      }
    }
    for (const key of map.planning || []) {
      const val = c.planning[key];
      if (Array.isArray(val)) {
        pushRow(rows, section, `planning.${key}.count`, val.length);
      } else {
        pushRow(rows, section, `planning.${key}`, val);
      }
    }
    for (const key of map.resource || []) {
      const val = c.resource[key];
      pushRow(rows, section, `resource.${key}.count`, Array.isArray(val) ? val.length : 0);
    }
  }
  return rows;
}

async function buildAiAnalysisSheet11Buffer(aiAnalysis) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEETS.AI_OUTPUT);
  ws.addRow(SHEET_COLUMNS[SHEETS.AI_OUTPUT]);
  for (const row of collectConfirmedRows(aiAnalysis)) {
    ws.addRow(row);
  }
  return wb.xlsx.writeBuffer();
}

module.exports = {
  collectConfirmedRows,
  buildAiAnalysisSheet11Buffer,
};

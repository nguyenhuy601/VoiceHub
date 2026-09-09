/**
 * Compact V2 flat prompts (TSV-ish FR rows) — short instructions for qwen2.5:3b.
 */

const { truncate } = require('./aiAnalysisFrSlice');
const { FR_LANGUAGE_CUE } = require('./aiAnalysisLocaleText');

function frRowsTsv(frSlices = [], { descMax = 80, acMax = 60 } = {}) {
  const lines = ['id|module|title|desc|ac'];
  for (const s of frSlices) {
    const desc = truncate(s.description || '', descMax).replace(/\|/g, '/');
    const ac = truncate(s.ac || '', acMax).replace(/\|/g, '/');
    const title = truncate(s.title || s.id, 80).replace(/\|/g, '/');
    const mod = truncate(s.module || 'General', 40).replace(/\|/g, '/');
    lines.push(`${s.id}|${mod}|${title}|${desc}|${ac}`);
  }
  return lines.join('\n');
}

function capsRowsCompact(caps = []) {
  return (caps || [])
    .slice(0, 40)
    .map((c) => {
      const id = c.capabilityId || c.id || '';
      const name = truncate(c.name || '', 60).replace(/\|/g, '/');
      const fr = Array.isArray(c.sourceFrIds) ? c.sourceFrIds.slice(0, 8).join(',') : '';
      return `${id}|${name}|${fr}`;
    })
    .join('\n');
}

function buildPassADataCapabilityPrompt({ context, frRows }) {
  return [
    'BA. Extract entities + capabilities from FR rows.',
    FR_LANGUAGE_CUE,
    'Return ONLY JSON:',
    '{"entities":[{"name":"","relatedFrIds":[],"crud":{"create":false,"read":true,"update":false,"delete":false}}],"caps":[{"name":"","module":"","sourceFrIds":[],"complexity":"low|medium|high"}]}',
    'Use only FR ids from input. Max 20 entities, 24 caps. crud optional. No markdown.',
    `Context:${JSON.stringify(context || {})}`,
    'FR:',
    frRows,
  ].join('\n');
}

function buildPassBGapPrompt({ context, flagRows, frRows }) {
  return [
    'BA. List requirement gaps for flagged FRs.',
    FR_LANGUAGE_CUE,
    'Return ONLY JSON: {"gaps":[{"type":"incomplete|ambiguous|missing_nfr|missing_integration|missing_requirement","relatedFrIds":[],"issue":"","severity":"low|medium|high"}]}',
    'Max 12 gaps. Use only FR ids from input. No markdown.',
    `Context:${JSON.stringify(context || {})}`,
    `Flags:${flagRows || ''}`,
    'FR:',
    frRows,
  ].join('\n');
}

function buildPassCWbsPrompt({ capsRows }) {
  return [
    'Tech lead. Generate WBS tasks from capabilities.',
    'Return ONLY JSON: {"tasks":[{"id":"","parentId":"","name":"","sourceCapabilityIds":[],"sourceFrIds":[],"suggestedRoleKey":"backend_developer","sortOrder":0}]}',
    '1 parent + up to 2 children per cap. Use only capability ids from input. No markdown.',
    'Caps (id|name|frIds):',
    capsRows,
  ].join('\n');
}

function buildPassDArchRiskPrompt({ context, capsRows, edgeHint }) {
  return [
    'Architect. Architecture impacts + risks.',
    'Return ONLY JSON:',
    '{"impacts":[{"component":"","layer":"frontend|backend|database|api|infrastructure","impactLevel":"low|medium|high","relatedFrIds":[],"capabilityIds":[]}],"risks":[{"title":"","probability":1,"impact":2,"relatedFrIds":[],"mitigation":""}]}',
    'probability/impact are 1-5 ints. Max 12 each. Ids from input only. No markdown.',
    `Context:${JSON.stringify(context || {})}`,
    `Edges:${edgeHint || 'none'}`,
    'Caps:',
    capsRows,
  ].join('\n');
}

function buildJsonRepairPrompt(rawText) {
  return [
    'Fix into valid JSON only. No markdown, no prose.',
    String(rawText || '').slice(0, 2500),
  ].join('\n');
}

function flagRowsCompact(qualityFlags = []) {
  return (qualityFlags || [])
    .slice(0, 30)
    .map((f) => `${f.id}|${(f.flags || []).join(',')}`)
    .join('\n');
}

module.exports = {
  frRowsTsv,
  capsRowsCompact,
  flagRowsCompact,
  buildPassADataCapabilityPrompt,
  buildPassBGapPrompt,
  buildPassCWbsPrompt,
  buildPassDArchRiskPrompt,
  buildJsonRepairPrompt,
};

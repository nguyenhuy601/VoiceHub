/**
 * On-demand A8 — requirement_classification
 */

const { makeFact, makeToolResult, hashInput } = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'requirement_classification';
const TOOL_VERSION = 1;

const CATALOG = Object.freeze([
  { category: 'Security', patterns: [/auth/i, /password/i, /encrypt/i, /rbac/i, /permission/i, /bảo mật/i] },
  { category: 'Performance', patterns: [/latency/i, /throughput/i, /response/i, /scale/i, /hiệu năng/i] },
  { category: 'Integration', patterns: [/api/i, /webhook/i, /sso/i, /third[- ]party/i, /tích hợp/i] },
  { category: 'Data', patterns: [/database/i, /gdpr/i, /pii/i, /export/i, /dữ liệu/i] },
  { category: 'UI', patterns: [/screen/i, /button/i, /layout/i, /ux/i, /giao diện/i] },
  { category: 'Compliance', patterns: [/audit/i, /sox/i, /iso/i, /tuân thủ/i, /regulation/i] },
  { category: 'Technical', patterns: [/docker/i, /microservice/i, /cache/i, /queue/i] },
  { category: 'Business', patterns: [/revenue/i, /kpi/i, /stakeholder/i, /nghiệp vụ/i] },
  { category: 'Functional', patterns: [/.*/] },
]);

function classifyText(text) {
  for (const entry of CATALOG) {
    if (entry.category === 'Functional') continue;
    if (entry.patterns.some((re) => re.test(text))) return entry.category;
  }
  return 'Functional';
}

function runRequirementClassification(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr) ? input.fr : [];
  const nfr = Array.isArray(input.nfr) ? input.nfr : [];
  const leaves = listFrLeaves(fr);
  const items = [];

  for (const leaf of leaves) {
    const text = `${leaf.name} ${leaf.description} ${leaf.ac}`;
    items.push({ id: leaf.id, kind: 'FR', category: classifyText(text) });
  }
  for (const n of nfr) {
    const text = `${n.category} ${n.requirement} ${n.target}`;
    const cat = n.category && String(n.category).trim() ? String(n.category).trim() : classifyText(text);
    items.push({ id: n.id, kind: 'NFR', category: cat });
  }

  const data = { items };
  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'classification.items',
      value: items,
      tool,
      version,
    }),
  ];

  return makeToolResult({ data, facts, warnings: [], tool, version, inputHash });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose: "Classify FR/NFR into functional/security/performance/… categories",
  algorithm: ["catalog_match","default_functional"],
  outputKeys: ["items"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['A8'],
  run: runRequirementClassification,
};

module.exports = { runRequirementClassification, descriptor, TOOL_NAME, CATALOG };

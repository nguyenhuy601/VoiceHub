/**
 * B1 — scope_analysis (extends T4)
 * Classes: in_scope | out_of_scope | mandatory | optional | undefined
 */

const {
  makeFact,
  makeWarning,
  makeToolResult,
  hashInput,
  nonEmptyString,
} = require('../toolContract');
const { getData, getContext, getPolicy } = require('../normalizeToolInput');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'scope_analysis';
const TOOL_VERSION = 1;

const MODAL_RE =
  /có thể|nếu cần|tùy chọn|maybe|should consider|optional|nice to have|phụ thuộc/i;

const CLASS_PRIORITY = Object.freeze({
  out_of_scope: 5,
  undefined: 4,
  optional: 3,
  mandatory: 2,
  in_scope: 1,
});

function pickClass(candidates) {
  let best = 'in_scope';
  let bestP = 0;
  for (const c of candidates) {
    const p = CLASS_PRIORITY[c] || 0;
    if (p > bestP) {
      bestP = p;
      best = c;
    }
  }
  return best;
}

function runScopeAnalysis(input = {}, ctx = {}) {
  const fr = Array.isArray(getData(input, 'fr'))
    ? getData(input, 'fr')
    : Array.isArray(getData(input, 'requirements'))
      ? getData(input, 'requirements')
      : [];
  const scopeRows = Array.isArray(getData(input, 'scope')) ? getData(input, 'scope') : [];
  const baseline = getData(input, 'baseline') || {};
  const baselineFrIds = new Set(
    Array.isArray(baseline.frIds) ? baseline.frIds.map(String) : []
  );
  const constraints = [
    ...(Array.isArray(getContext(input, 'constraints'))
      ? getContext(input, 'constraints')
      : []),
    ...(Array.isArray(input.context?.constraints) ? input.context.constraints : []),
  ].map(String);
  const technology = (
    Array.isArray(getContext(input, 'technology'))
      ? getContext(input, 'technology')
      : Array.isArray(input.context?.technology)
        ? input.context.technology
        : []
  ).map((t) => String(t).toLowerCase());

  const objective = String(
    getContext(input, 'objective') || input.context?.objective || ''
  );
  void objective;
  void getPolicy;

  const leaves = listFrLeaves(fr);
  const warnings = [];
  const classified = [];
  const signals = {
    overlap: [],
    gap: [],
    ambiguity: [],
    expansion: [],
  };

  const outScopeTexts = new Set(
    scopeRows
      .filter((s) => s?.type === 'out')
      .map((s) => String(s.description || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // overlap among scope descriptions
  const seenScope = new Map();
  for (const s of scopeRows) {
    const text = String(s.description || '').trim().toLowerCase();
    if (!text) continue;
    if (seenScope.has(text)) {
      signals.overlap.push({
        left: seenScope.get(text),
        right: s.type || 'scope',
        text,
      });
    } else {
      seenScope.set(text, s.type || 'scope');
    }
  }

  for (const leaf of leaves) {
    const text = `${leaf.name || ''} ${leaf.description || ''} ${leaf.ac || ''}`;
    const candidates = [];
    const ruleIds = [];

    for (const c of constraints) {
      const token = c.replace(/^no\s+/i, '').trim();
      if (token && new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
        if (/^no |không |cấm |out of scope/i.test(c) || /not in scope/i.test(c)) {
          candidates.push('out_of_scope');
          ruleIds.push('R-OUT-CONSTRAINT');
        }
      }
    }

    for (const outText of outScopeTexts) {
      if (outText && text.toLowerCase().includes(outText.slice(0, Math.min(40, outText.length)))) {
        candidates.push('out_of_scope');
        ruleIds.push('R-OUT-SCOPE-ROW');
      }
    }

    if (MODAL_RE.test(text)) {
      candidates.push('optional');
      ruleIds.push('R-OPT-MODAL');
      signals.ambiguity.push({ frId: leaf.id, reason: 'modal_optional_wording' });
    }

    if (!nonEmptyString(leaf.ac) || !nonEmptyString(leaf.actor)) {
      candidates.push('undefined');
      ruleIds.push(!nonEmptyString(leaf.ac) ? 'R-UND-NO-AC' : 'R-UND-NO-ACTOR');
      signals.ambiguity.push({ frId: leaf.id, reason: 'missing_ac_or_actor' });
      if (!nonEmptyString(leaf.ac)) {
        signals.gap.push({ frId: leaf.id, reason: 'missing_ac' });
      }
    }

    const prio = String(leaf.priority || '').toLowerCase();
    if (prio === 'critical' || leaf.mandatory === true) {
      candidates.push('mandatory');
      ruleIds.push('R-MANDATORY');
    }

    if (technology.length && /\b(oracle|mongodb|kafka|flutter)\b/i.test(text)) {
      const mentioned = text.match(/\b(oracle|mongodb|kafka|flutter)\b/gi) || [];
      for (const m of mentioned) {
        if (!technology.includes(m.toLowerCase())) {
          candidates.push('undefined');
          ruleIds.push('R-ASSUME-TECH');
        }
      }
    }

    if (candidates.length === 0) {
      candidates.push('in_scope');
      ruleIds.push('R-IN-DEFAULT');
    }

    const scopeClass = pickClass(candidates);
    classified.push({
      frId: leaf.id,
      scopeClass,
      ruleId: ruleIds[0],
      ruleIds,
      evidence: ruleIds.map((ref) => ({ type: 'rule', ref })),
    });
  }

  const currentIds = new Set(leaves.map((l) => l.id));
  if (baselineFrIds.size > 0) {
    for (const id of currentIds) {
      if (!baselineFrIds.has(id)) {
        signals.expansion.push({ frId: id, type: 'added' });
      }
    }
  }

  const counts = {
    in_scope: 0,
    out_of_scope: 0,
    mandatory: 0,
    optional: 0,
    undefined: 0,
  };
  for (const c of classified) {
    counts[c.scopeClass] = (counts[c.scopeClass] || 0) + 1;
  }

  const ambiguousCount =
    (counts.undefined || 0) +
    (counts.optional || 0) +
    signals.ambiguity.length;

  const data = {
    classified,
    counts,
    signals: {
      overlap: signals.overlap,
      gap: signals.gap,
      ambiguity: signals.ambiguity,
      expansion: signals.expansion,
    },
    creep: {
      added: signals.expansion.filter((e) => e.type === 'added').map((e) => e.frId),
      removed: [...baselineFrIds].filter((id) => !currentIds.has(id)),
      changed: [],
    },
  };

  if (leaves.length === 0) {
    warnings.push(
      makeWarning({
        code: 'EMPTY_REQUIREMENTS',
        severity: 'warn',
        message: 'No FR leaves for scope analysis',
      })
    );
  }

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'scope.counts',
      value: counts,
      tool,
      version,
    }),
    makeFact({
      key: 'scope.ambiguousCount',
      value: counts.undefined + counts.optional,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'scope.expansionCount',
      value: signals.expansion.length,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'scope.outOfScopeCount',
      value: counts.out_of_scope,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'scope.classified',
      value: classified,
      tool,
      version,
    }),
  ];

  return makeToolResult({
    data,
    facts,
    warnings,
    tool,
    version,
    inputHash,
    evidence: {
      sourceIds: leaves.map((l) => l.id).slice(0, 50),
      formula: 'priority(out>undefined>optional>mandatory>in)',
      policyVersion: getData(input, 'policy')?.version || input.policy?.version || 'scope-v1',
    },
  });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose:
    'Classify requirements into in/out/mandatory/optional/undefined scope and detect overlap/gap/ambiguity/expansion',
  algorithm: [
    'load_fr_scope_baseline',
    'rule_classify',
    'detect_overlap_gap_ambiguity',
    'detect_expansion',
    'emit_counts',
  ],
  outputKeys: ['classified', 'counts', 'signals', 'creep'],
  contextImpact: {
    objective: { affects: 'classification_bias', type: 'policy' },
    constraints: { affects: 'out_of_scope_rules', type: 'constraint' },
  },
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'recipe',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  input: { data: ['fr'], context: [], policy: [] },
  aliases: ['B1', 'T4'],
  run: runScopeAnalysis,
};

module.exports = { runScopeAnalysis, descriptor, TOOL_NAME, CLASS_PRIORITY };

/**
 * A1 / T1 — traceability_graph
 */

const { makeFact, makeWarning, makeToolResult, hashInput } = require('../toolContract');
const { listFrLeaves } = require('../projectCanonicalBundle');

const TOOL_NAME = 'traceability_graph';
const TOOL_VERSION = 1;

function inferNodeType(id, indexes) {
  if (indexes.fr.has(id)) return 'FR';
  if (indexes.nfr.has(id)) return 'NFR';
  if (indexes.uc.has(id)) return 'UC';
  if (indexes.bg.has(id)) return 'BG';
  if (indexes.br.has(id)) return 'BR';
  if (indexes.bpm.has(id)) return 'BPM';
  if (indexes.cap.has(id)) return 'CAP';
  if (indexes.task.has(id)) return 'TASK';
  if (/^CR[-_]?\d+/i.test(id) || indexes.cr.has(id)) return 'CR';
  return 'UNKNOWN';
}

function runTraceabilityGraph(input = {}, ctx = {}) {
  const fr = Array.isArray(input.fr) ? input.fr : Array.isArray(input.requirements) ? input.requirements : [];
  const nfr = Array.isArray(input.nfr) ? input.nfr : [];
  const uc = Array.isArray(input.uc) ? input.uc : Array.isArray(input.useCases) ? input.useCases : [];
  const bg = Array.isArray(input.bg) ? input.bg : [];
  const br = Array.isArray(input.br) ? input.br : [];
  const bpm = Array.isArray(input.bpm) ? input.bpm : [];
  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const traceLinks = Array.isArray(input.traceLinks) ? input.traceLinks : [];

  const warnings = [];
  if (fr.length === 0) {
    warnings.push(
      makeWarning({
        code: 'EMPTY_REQUIREMENTS',
        severity: 'error',
        message: 'No functional requirements in input',
      })
    );
  }

  const indexes = {
    fr: new Map(fr.map((x) => [x.id, x])),
    nfr: new Map(nfr.map((x) => [x.id, x])),
    uc: new Map(uc.map((x) => [x.id, x])),
    bg: new Map(bg.map((x) => [x.id, x])),
    br: new Map(br.map((x) => [x.id, x])),
    bpm: new Map(bpm.map((x) => [x.id, x])),
    cap: new Map(capabilities.map((x) => [x.id, x])),
    task: new Map(tasks.map((x) => [x.id, x])),
    cr: new Set(),
  };

  for (const row of fr) {
    for (const cr of row.crRefs || []) indexes.cr.add(cr);
  }
  for (const row of nfr) {
    for (const cr of row.crRefs || []) indexes.cr.add(cr);
  }

  // capability / task covers edges
  const edges = [...traceLinks];
  for (const cap of capabilities) {
    for (const frId of cap.frIds || []) {
      edges.push({ from: cap.id, to: frId, type: 'covers' });
    }
  }
  for (const task of tasks) {
    for (const frId of task.sourceFrIds || []) {
      edges.push({ from: task.id, to: frId, type: 'implements' });
    }
  }
  for (const row of nfr) {
    // NFR may constrain FRs via shared module — skip if no refs
  }
  for (const row of fr) {
    for (const nfrId of row.nfrRefs || []) {
      edges.push({ from: nfrId, to: row.id, type: 'constrains' });
    }
  }

  const nodeIds = new Set();
  const addNode = (id) => {
    if (id) nodeIds.add(String(id));
  };
  for (const list of [fr, nfr, uc, bg, br, bpm, capabilities, tasks]) {
    for (const row of list) addNode(row.id);
  }
  for (const cr of indexes.cr) addNode(cr);

  const dangling = [];
  const cleanEdges = [];
  let edgeSeq = 0;
  for (const e of edges) {
    const from = String(e.from || '').trim();
    const to = String(e.to || '').trim();
    const type = String(e.type || 'relates').trim();
    if (!from || !to) continue;
    if (from === to) {
      warnings.push(
        makeWarning({ code: 'SELF_LOOP', severity: 'warn', message: 'Self-loop dropped', refs: [from] })
      );
      continue;
    }
    if (!nodeIds.has(from)) {
      dangling.push({ from: '(missing)', ref: from, edgeTo: to });
      warnings.push(
        makeWarning({ code: 'DANGLING_REF', severity: 'warn', message: `Missing node ${from}`, refs: [from] })
      );
      continue;
    }
    if (!nodeIds.has(to)) {
      dangling.push({ from, ref: to });
      warnings.push(
        makeWarning({ code: 'DANGLING_REF', severity: 'warn', message: `Missing node ${to}`, refs: [to] })
      );
      continue;
    }
    edgeSeq += 1;
    cleanEdges.push({ id: `e${edgeSeq}`, from, to, type });
  }

  const nodes = [...nodeIds].map((id) => {
    const type = inferNodeType(id, indexes);
    const frNode = indexes.fr.get(id);
    return {
      id,
      type,
      level: frNode ? frNode.level : undefined,
    };
  });

  const inDegree = new Map([...nodeIds].map((id) => [id, 0]));
  const adj = new Map([...nodeIds].map((id) => [id, []]));
  for (const e of cleanEdges) {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    adj.get(e.from).push(e.to);
  }

  // orphan: non-CR with in-degree 0 (and not a Module root without parent — FR module ok)
  const orphans = [];
  for (const n of nodes) {
    if (n.type === 'CR') continue;
    if ((inDegree.get(n.id) || 0) === 0) {
      // FR with parent edge counts; module roots often orphan by design — still report
      orphans.push(n.id);
    }
  }

  const chains = [];
  for (const crId of indexes.cr) {
    const path = [crId];
    const queue = [crId];
    const visited = new Set([crId]);
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adj.get(cur) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        path.push(next);
        queue.push(next);
      }
    }
    chains.push({ crId, path });
  }

  const countByType = {};
  for (const n of nodes) {
    countByType[n.type] = (countByType[n.type] || 0) + 1;
  }

  let maxDepth = 0;
  for (const c of chains) {
    maxDepth = Math.max(maxDepth, (c.path || []).length);
  }

  const leaves = listFrLeaves(fr);
  if (tasks.length > 0) {
    const implemented = new Set();
    for (const e of cleanEdges) {
      if (e.type === 'implements') implemented.add(e.to);
    }
    for (const leaf of leaves) {
      if (!implemented.has(leaf.id)) {
        warnings.push(
          makeWarning({
            code: 'BROKEN_CHAIN_TO_TASK',
            severity: 'info',
            message: `FR leaf ${leaf.id} has no TASK implement edge`,
            refs: [leaf.id],
          })
        );
      }
    }
  }

  const data = {
    nodes,
    edges: cleanEdges,
    chains,
    orphans,
    dangling,
    stats: {
      nodeCount: nodes.length,
      edgeCount: cleanEdges.length,
      maxDepth,
      countByType,
      leafCount: leaves.length,
    },
  };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'trace.orphanCount',
      value: orphans.length,
      unit: 'count',
      tool,
      version,
      evidence: orphans.slice(0, 20).map((id) => ({ type: 'node', ref: id })),
    }),
    makeFact({
      key: 'trace.danglingCount',
      value: dangling.length,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'trace.maxDepth',
      value: maxDepth,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'trace.nodeCount',
      value: nodes.length,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'trace.edgeCount',
      value: cleanEdges.length,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'trace.graph',
      value: { nodeCount: nodes.length, edgeCount: cleanEdges.length },
      tool,
      version,
    }),
  ];

  return makeToolResult({ data, facts, warnings, tool, version, inputHash });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose: "Build requirement traceability graph and detect orphans/dangling refs",
  algorithm: ["build_graph","resolve_edges","validate_refs","detect_orphan","detect_dangling","coverage_stats"],
  outputKeys: ["nodes","edges","chains","orphans","dangling","stats"],
  contextImpact: {},
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'recipe',
  dependsOn: [],
  requiredContext: [],
  requiredData: ['fr'],
  aliases: ['requirement_traceability', 'A1'],
  run: runTraceabilityGraph,
};

module.exports = { runTraceabilityGraph, descriptor, TOOL_NAME };

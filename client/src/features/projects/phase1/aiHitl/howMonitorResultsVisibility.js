/**
 * When to show HOW results table on Monitor (all roles, read-only).
 * Gate1 scope/objectives rollup alone is not HOW propose output — require at least
 * one engine/heuristic row so Monitor does not treat "results ready" mid-run.
 * Also show when Dependency analysisStatus meta exists even with zero edge rows
 * (COMPLETE_NO_EDGES / FAILED / SKIPPED / …).
 */

import { buildGate2ProposalItems } from '../buildGate2ProposalItems.js';
import {
  DEP_ANALYSIS_STATUS,
  readDependencyAnalysisMeta,
} from '../gate2/dependencyDisplay.js';

const DEP_STATUS_SHOWS_PANEL = new Set([
  DEP_ANALYSIS_STATUS.COMPLETE_NO_EDGES,
  DEP_ANALYSIS_STATUS.DEPENDENCIES_FOUND,
  DEP_ANALYSIS_STATUS.INCOMPLETE,
  DEP_ANALYSIS_STATUS.SKIPPED,
  DEP_ANALYSIS_STATUS.FAILED,
  DEP_ANALYSIS_STATUS.PARTIAL,
  DEP_ANALYSIS_STATUS.INVALID,
  DEP_ANALYSIS_STATUS.SEMANTIC_INCOMPLETE,
]);

function resolveAiContainer(pack) {
  if (pack?.aiAnalysis && typeof pack.aiAnalysis === 'object') return pack.aiAnalysis;
  return pack && typeof pack === 'object' ? pack : {};
}

function isGate1RollupOnlyRow(row) {
  const prov = String(row?.provenance?.type || '')
    .trim()
    .toUpperCase();
  const origin = String(row?.origin?.type || '')
    .trim()
    .toUpperCase();
  return prov === 'GATE1_APPROVED' || origin === 'GATE1_APPROVED';
}

/**
 * True when analyses.dependency carries a known analysisStatus (0 edges OK).
 */
export function hasDependencyAnalysisStatusMeta(pack) {
  if (!pack) return false;
  const section = resolveAiContainer(pack)?.analyses?.dependency || {};
  const { analysisStatus } = readDependencyAnalysisMeta(section);
  return Boolean(analysisStatus && DEP_STATUS_SHOWS_PANEL.has(analysisStatus));
}

export function shouldShowHowMonitorResults(pack) {
  if (!pack) return false;
  if (hasDependencyAnalysisStatusMeta(pack)) return true;
  const bundle = buildGate2ProposalItems({ pack });
  const items = bundle.items || [];
  return items.some((row) => row && !isGate1RollupOnlyRow(row));
}

export default shouldShowHowMonitorResults;

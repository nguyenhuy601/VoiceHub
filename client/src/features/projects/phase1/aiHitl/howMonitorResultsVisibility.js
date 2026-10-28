/**
 * When to show HOW results table on Monitor (all roles, read-only).
 * Gate1 scope/objectives rollup alone is not HOW propose output — require at least
 * one engine/heuristic row so Monitor does not treat "results ready" mid-run.
 */

import { buildGate2ProposalItems } from '../buildGate2ProposalItems.js';

function isGate1RollupOnlyRow(row) {
  const prov = String(row?.provenance?.type || '')
    .trim()
    .toUpperCase();
  const origin = String(row?.origin?.type || '')
    .trim()
    .toUpperCase();
  return prov === 'GATE1_APPROVED' || origin === 'GATE1_APPROVED';
}

export function shouldShowHowMonitorResults(pack) {
  if (!pack) return false;
  const bundle = buildGate2ProposalItems({ pack });
  const items = bundle.items || [];
  return items.some((row) => row && !isGate1RollupOnlyRow(row));
}

export default shouldShowHowMonitorResults;

/**
 * When to show WHAT results table on Monitor (all roles, read-only).
 */

import { buildGate1ProposalItems } from '../buildGate1ProposalItems.js';
import { attachConflictAmbiguityToGate1Bundle } from '../gate1/resolveConflictAmbiguityUi.js';

export function buildWhatMonitorResultsBundle(pack) {
  if (!pack) return { items: [], sections: [], bySection: {} };
  const g4 =
    pack?.aiAnalysis?.analyses?.frUnderstanding ||
    pack?.aiAnalysis?.analyses?.g4Understanding;
  const proposal = pack?.aiAnalysis?.analyses?.srsProposal;
  return attachConflictAmbiguityToGate1Bundle(
    buildGate1ProposalItems({ pack, g4, proposal }),
    pack,
    g4
  );
}

export function shouldShowWhatMonitorResults(pack) {
  if (!pack) return false;
  const bundle = buildWhatMonitorResultsBundle(pack);
  return (bundle.items || []).length > 0;
}

export default shouldShowWhatMonitorResults;

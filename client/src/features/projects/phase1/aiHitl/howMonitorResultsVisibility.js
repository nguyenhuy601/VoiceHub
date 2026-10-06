/**
 * When to show HOW results table on Monitor (all roles, read-only).
 */

import { buildGate2ProposalItems } from '../buildGate2ProposalItems.js';

export function shouldShowHowMonitorResults(pack) {
  if (!pack) return false;
  const bundle = buildGate2ProposalItems({ pack });
  return (bundle.items || []).length > 0;
}

export default shouldShowHowMonitorResults;

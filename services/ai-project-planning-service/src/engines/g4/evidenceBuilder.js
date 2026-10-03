/**
 * G4.7 — Evidence builder merge tool + LLM projections.
 */

const { createEvidence } = require('../../evidence/evidence');

function buildEvidenceBundle({
  snapshotId,
  toolEvidence = [],
  semanticItems = [],
  conflicts = [],
  validation = null,
}) {
  const evidence = [...(Array.isArray(toolEvidence) ? toolEvidence : [])];

  for (const item of semanticItems) {
    for (const ev of item.evidence || []) {
      evidence.push({
        ...ev,
        frId: item.frId,
        source: 'llm_semantic',
      });
    }
    evidence.push(
      createEvidence({
        sourceType: 'llm_candidate',
        sourceId: item.frId,
        snapshotId,
        metric: 'semantic_projection',
        value: item.semanticInterpretation?.capability || item.frId,
        calculatedBy: 'G4:semanticProjection',
        ruleId: 'G4-SEM-001',
      })
    );
  }

  for (const c of conflicts) {
    evidence.push({
      type: 'conflict',
      frIds: c.frIds || [],
      issue: c.issue,
      evidence: c.evidence || [],
      source: 'llm_conflict',
    });
  }

  if (validation?.accepted) {
    for (const rel of validation.accepted) {
      if (Array.isArray(rel.evidence)) evidence.push(...rel.evidence);
    }
  }

  return evidence;
}

module.exports = {
  buildEvidenceBundle,
};

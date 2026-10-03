/**
 * FR Extract step — projects input into extracted requirement candidates.
 * Does not run LLM; preserves identity for G4 semantic engine.
 */

/**
 * @param {{ requirements?: object[], context?: object, actors?: object[], domain?: object, evidencePack?: object|null }} frInputProjection
 * @returns {{ extracted: object[], context: object, actors: object[], domain: object, evidencePack: object|null }}
 */
function extractFunctionalRequirements(frInputProjection = {}) {
  const proj =
    frInputProjection && typeof frInputProjection === 'object' ? frInputProjection : {};
  const requirements = Array.isArray(proj.requirements) ? proj.requirements : [];
  const extracted = requirements.map((r, idx) => {
    const id = r?.id || r?.frId || r?.key || `FR-EXTRACT-${idx + 1}`;
    return {
      ...r,
      id: String(id),
      status: r?.status || 'EXTRACTED',
      sourceKind: r?.sourceKind || 'document',
    };
  });
  return {
    extracted,
    context: proj.context && typeof proj.context === 'object' ? proj.context : {},
    actors: Array.isArray(proj.actors) ? proj.actors : [],
    domain: proj.domain && typeof proj.domain === 'object' ? proj.domain : {},
    evidencePack: proj.evidencePack || null,
  };
}

module.exports = { extractFunctionalRequirements };

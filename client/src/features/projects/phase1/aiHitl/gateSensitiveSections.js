/** Mirror BE RULE-03 — BA edit → PO (re)approval. */
export const SENSITIVE_GATE1_SECTIONS = Object.freeze([
  'functionalRequirements',
  'businessRules',
  'actors',
  'scope',
]);

export function isSensitiveGate1Section(section) {
  return SENSITIVE_GATE1_SECTIONS.includes(String(section || '').trim());
}

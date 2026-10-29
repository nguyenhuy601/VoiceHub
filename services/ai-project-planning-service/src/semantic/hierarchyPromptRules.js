/**
 * Shared Epic/Feature/Story/Task prompt rules for WHAT FR semantic (H1–H6).
 * Keep free of engine imports to avoid cycles with frProposeFromCrLlm.
 */

const HIERARCHY_PROMPT_RULES = [
  'Hierarchy (H1–H6):',
  'H1 Clarity: if beneficiary/outcome/AC unclear, keep faithful FR and note ambiguity — do not invent Epic/Feature.',
  'H2 Task exclusion: pure build/test work (API/UI/DB only) is Task (HOW) — do not emit as FR/Story.',
  'H3 Story-first: each FR node = one verifiable user outcome with AC (INVEST-ish). Split independent behaviors.',
  'H4 Feature: multiple Story-FRs of the same product capability → Feature group; not an Epic.',
  'H5 Epic: multiple different capabilities toward one business goal. Technical difficulty alone ≠ Epic.',
  'H6 Size: do not confirm sprint-fit; if many value slices, split FRs — Developers size later.',
].join(' ');

module.exports = { HIERARCHY_PROMPT_RULES };

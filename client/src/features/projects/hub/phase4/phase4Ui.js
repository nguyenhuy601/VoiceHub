/** Phase 4 shared chrome tokens (soft section cards via DS tokens). */
export const PHASE4_SECTION_SHELL =
  'overflow-hidden rounded-xl border border-border bg-surface shadow-sm';

export const PHASE4_SECTION_HEAD =
  'border-b border-border bg-primary/5 px-3.5 py-2.5';

export const PHASE4_PRIMARY_MODULES = Object.freeze([
  'overview',
  'handover',
  'deploy-evidence',
  'release-notes',
]);

export const PHASE4_LOOKUP_MODULES = Object.freeze([
  'list',
  'board',
  'test-cases',
  'change-requests',
  'files',
  'activity',
]);

export function isPhase4PrimaryModule(moduleKey) {
  return PHASE4_PRIMARY_MODULES.includes(String(moduleKey || '').trim().toLowerCase());
}

export function isPhase4DeliveryPhase(deliveryPhase) {
  return String(deliveryPhase || '').trim().toLowerCase() === 'release_handover';
}

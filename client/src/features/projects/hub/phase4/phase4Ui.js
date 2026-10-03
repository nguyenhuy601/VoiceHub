/** Phase 4 shared chrome tokens (soft-blue section cards). */
export const PHASE4_SECTION_SHELL =
  'overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950';

export const PHASE4_SECTION_HEAD =
  'border-b border-[#E8E8E8] bg-[#E8F4FC] px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/80';

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

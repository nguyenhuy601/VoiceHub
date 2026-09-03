const DEFAULT_ACCESS = Object.freeze({
  canView: false,
  canImport: false,
  canSubmit: false,
  canApprove: false,
  canCreateFromPack: false,
  canRunAiPlanning: false,
  canReviewSkills: false,
  showCollaborateNav: false,
  showAdminRequirements: false,
  isProductUser: false,
  persona: 'member',
  personasMatched: ['member'],
  visibleSections: Object.freeze({
    collaborateRequirements: false,
    adminRequirements: false,
  }),
});

export function normalizeRequirementAccess(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ACCESS };
  const visibleSections =
    raw.visibleSections && typeof raw.visibleSections === 'object'
      ? raw.visibleSections
      : {};
  return {
    canView: Boolean(raw.canView),
    canImport: Boolean(raw.canImport),
    canSubmit: Boolean(raw.canSubmit),
    canApprove: Boolean(raw.canApprove),
    canCreateFromPack: Boolean(raw.canCreateFromPack),
    canRunAiPlanning: Boolean(raw.canRunAiPlanning),
    canReviewSkills: Boolean(raw.canReviewSkills),
    showCollaborateNav: Boolean(raw.showCollaborateNav),
    showAdminRequirements: Boolean(raw.showAdminRequirements),
    isProductUser: Boolean(raw.isProductUser),
    persona: String(raw.persona || 'member'),
    personasMatched: Array.isArray(raw.personasMatched) ? raw.personasMatched : ['member'],
    visibleSections: {
      collaborateRequirements: Boolean(
        visibleSections.collaborateRequirements ?? raw.showCollaborateNav
      ),
      adminRequirements: Boolean(
        visibleSections.adminRequirements ?? raw.showAdminRequirements
      ),
    },
  };
}

export { DEFAULT_ACCESS };

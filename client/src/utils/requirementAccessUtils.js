const DEFAULT_ACCESS = Object.freeze({
  canView: false,
  canImport: false,
  canSubmit: false,
  canApprove: false,
  canCreateFromPack: false,
  canRunAiPlanning: false,
  showCollaborateNav: false,
  isProductUser: false,
});

export function normalizeRequirementAccess(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ACCESS };
  return {
    canView: Boolean(raw.canView),
    canImport: Boolean(raw.canImport),
    canSubmit: Boolean(raw.canSubmit),
    canApprove: Boolean(raw.canApprove),
    canCreateFromPack: Boolean(raw.canCreateFromPack),
    canRunAiPlanning: Boolean(raw.canRunAiPlanning),
    showCollaborateNav: Boolean(raw.showCollaborateNav),
    isProductUser: Boolean(raw.isProductUser),
  };
}

export { DEFAULT_ACCESS };

/**
 * Progressive create buttons for Projects Landing (A/B/C/D — page uses B APIs).
 * Grid must not wait on scope/requirement; buttons disable until those resolve.
 */
export function resolveLandingCreateActions({
  scopeLoading = false,
  canCreate = false,
  requirementAccessLoading = false,
  canCreateWithAi = false,
} = {}) {
  const showCreate = Boolean(scopeLoading || canCreate);
  const createDisabled = Boolean(scopeLoading || !canCreate);
  const showCreateWithAi = Boolean(
    showCreate && (scopeLoading || requirementAccessLoading || canCreateWithAi)
  );
  const createWithAiDisabled = Boolean(
    scopeLoading || requirementAccessLoading || !canCreateWithAi
  );
  return { showCreate, createDisabled, showCreateWithAi, createWithAiDisabled };
}

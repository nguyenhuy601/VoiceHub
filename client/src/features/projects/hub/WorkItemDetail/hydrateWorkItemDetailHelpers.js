/**
 * Pure helpers for hydrateWorkItemDetailFromHub — unit-testable without network.
 */
export function pickPlanningEpicsAndFeatures(planningItems = []) {
  const items = Array.isArray(planningItems) ? planningItems : [];
  return {
    epics: items.filter((p) => String(p.type || '').toLowerCase() === 'epic'),
    features: items.filter((p) => String(p.type || '').toLowerCase() === 'feature'),
  };
}

export function findBoardCardById(boardCards = [], entityId = '') {
  const id = String(entityId || '').trim();
  if (!id) return null;
  return (
    (Array.isArray(boardCards) ? boardCards : []).find(
      (c) => String(c._id || c.id || '').trim() === id
    ) || null
  );
}

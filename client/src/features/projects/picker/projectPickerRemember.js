/** Persist last selected project for Projects suite picker. */

export const LAST_PROJECT_ID_KEY = 'voicehub:last-project-id';

export function readStoredLastProjectId() {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(LAST_PROJECT_ID_KEY) || '').trim();
}

export function writeStoredLastProjectId(projectId) {
  if (typeof window === 'undefined') return;
  const id = String(projectId || '').trim();
  if (id) window.localStorage.setItem(LAST_PROJECT_ID_KEY, id);
  else window.localStorage.removeItem(LAST_PROJECT_ID_KEY);
}

/**
 * @param {string} projectId
 * @param {Array<{ _id?: string, projectId?: string }>} membershipList
 */
export function isRememberedProjectValid(projectId, membershipList = []) {
  const id = String(projectId || '').trim();
  if (!id) return false;
  return (membershipList || []).some((row) => {
    const rowId = String(row?._id || row?.projectId || '').trim();
    return rowId === id;
  });
}

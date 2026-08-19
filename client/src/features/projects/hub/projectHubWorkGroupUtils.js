/**
 * Work-group (nhóm làm việc) helpers for level-3 child creation.
 */

/**
 * Pick existing workGroupChannelId from a level-2 parent card.
 * @param {object|null} parentCard
 * @returns {string|null}
 */
export function pickExistingGroupChannelId(parentCard) {
  const id = parentCard?.workGroupChannelId;
  if (!id) return null;
  const s = typeof id === 'object' ? String(id._id || id.id || '') : String(id);
  return s || null;
}

/**
 * Should the UI prompt the user to create a work group?
 * Trigger: parent is level-2, child is level-3, no existing group, and
 * total children after creation >= 3.
 *
 * @param {{ existingCount: number, groupChannelId: string|null }} params
 * @returns {boolean}
 */
export function shouldPromptWorkGroup({ existingCount, groupChannelId }) {
  if (groupChannelId) return false;
  return (existingCount + 1) >= 3;
}

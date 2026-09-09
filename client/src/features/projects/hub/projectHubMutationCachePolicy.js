/**
 * Cache invalidation policy after board card mutations (List / Hub).
 * Field patches patch local boardDetail cache; avoid full hub refetch.
 */

/** Full hub invalidate (board + members + sprints + …) after card update/move — always off. */
export function shouldFullInvalidateAfterCardMutation() {
  return false;
}

/**
 * Move / status change affects overview summary & health counts.
 * @returns {boolean}
 */
export function overviewKeysTouchedByMove() {
  return true;
}

/**
 * @param {'update' | 'move'} kind
 * @returns {{ fullInvalidate: boolean, overviewInvalidate: boolean }}
 */
export function resolveCardMutationCachePolicy(kind) {
  const isMove = kind === 'move';
  return {
    fullInvalidate: shouldFullInvalidateAfterCardMutation(),
    overviewInvalidate: isMove && overviewKeysTouchedByMove(),
  };
}

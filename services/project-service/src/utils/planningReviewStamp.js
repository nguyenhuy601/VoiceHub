/**
 * Review stamps for a Planning gate step. Submit (draft → pm_review) is not a stamp.
 * Shared by single save and bulk updateMany so the two paths stay aligned.
 */

function planningReviewFieldUpdates(from, to, stamp) {
  const set = {};
  if (
    from === 'ba_review' &&
    (to === 'tech_review' ||
      to === 'pm_review' ||
      to === 'po_review' ||
      to === 'rejected' ||
      to === 'changes_requested')
  ) {
    set['review.ba'] = stamp;
  }
  if (
    from === 'tech_review' &&
    (to === 'pm_review' || to === 'po_review' || to === 'rejected' || to === 'changes_requested')
  ) {
    set['review.tech'] = stamp;
  }
  if (
    from === 'pm_review' &&
    (to === 'tech_review' || to === 'po_review' || to === 'rejected' || to === 'changes_requested')
  ) {
    set['review.pm'] = stamp;
  }
  if (from === 'po_review' && (to === 'approved' || to === 'rejected' || to === 'changes_requested')) {
    set['review.po'] = stamp;
  }
  return set;
}

/** Prior gate stamps the actor must not repeat (DEC D6). */
function priorStampsForPlanningTransition(from, to, review = {}) {
  const prior = [];
  if (from === 'tech_review') prior.push(review?.ba, review?.pm);
  if (from === 'po_review') prior.push(review?.ba, review?.tech, review?.pm);
  if (from === 'pm_review' && to === 'tech_review') prior.push(review?.ba);
  return prior;
}

module.exports = {
  planningReviewFieldUpdates,
  priorStampsForPlanningTransition,
};

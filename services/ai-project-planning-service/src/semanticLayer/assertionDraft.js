/**
 * An assertion stores `within` only when a separate excerpt states that scope.
 */

function draftAssertion(input = {}) {
  const excerpt = String(input.excerpt || '').trim();
  const evidenceExcerpt = String(input.withinEvidence?.excerpt || '').trim();
  const evidencedWithin =
    evidenceExcerpt && input.withinEvidence?.scope ? input.withinEvidence.scope : null;
  const openQuestions = [];
  if (input.value?.within && !evidencedWithin) {
    openQuestions.push({
      code: 'ASSERT_SCOPE_UNRESOLVED',
      message: 'Nguồn chưa xác định phạm vi kiểm tra.',
    });
  }

  const value = { ...(input.value || {}) };
  if (evidencedWithin) value.within = evidencedWithin;
  else delete value.within;

  return {
    assertion: {
      id: input.id,
      scope: {
        organizationId: input.scope?.organizationId || null,
        projectId: input.scope?.projectId || null,
      },
      subjectId: input.subjectId,
      predicate: input.predicate,
      value,
      provenanceType: 'EXTRACTED',
      reviewStatus: 'PENDING',
      lifecycleStatus: 'ACTIVE',
      sourceRefs: [
        {
          sourceRecordId: input.sourceRecordId,
          location: input.location || null,
          excerpt,
        },
      ],
      version: 1,
    },
    openQuestions,
  };
}

module.exports = {
  draftAssertion,
};

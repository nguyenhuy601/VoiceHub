import Gate1SectionReviewTable from './Gate1SectionReviewTable';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  if (value == null || value === '' || value === key) return fallback;
  return value;
}

/**
 * Epic→Story under the FR tab — not a catalog section tab.
 */
export default function Gate1FrBacklogSubpanel({
  rows = [],
  decisions = {},
  setDecision,
  showSubmit = false,
  busy = false,
  t,
}) {
  const heading = labelOf(
    t,
    'requirements.phase1FrBacklogHeading',
    'Epic / Story (phân rã từ FR)'
  );
  const empty = labelOf(
    t,
    'requirements.phase1FrBacklogEmpty',
    'Chưa phân rã Epic/Story từ FR đã đề xuất.'
  );

  return (
    <section className="mt-4 border-t border-border pt-3" aria-label={heading}>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{heading}</h3>
      {rows.length ? (
        <Gate1SectionReviewTable
          section="backlogStructure"
          rows={rows}
          decisions={decisions}
          setDecision={setDecision}
          showSubmit={showSubmit}
          busy={busy}
          t={t}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

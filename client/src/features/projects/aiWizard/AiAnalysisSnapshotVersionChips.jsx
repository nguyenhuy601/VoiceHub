/**
 * Slim version pins for AI Analysis Snapshot (SRS / Employee / Skill / Calendar).
 */
export default function AiAnalysisSnapshotVersionChips({ snapshot, t }) {
  if (!snapshot?.snapshotId && !snapshot?.versions) return null;
  const versions = snapshot.versions || {};
  const chips = [
    { key: 'srs', label: t?.('aiCreateWizard.snapshotVersionSrs') || 'SRS', value: versions.srs },
    {
      key: 'employee',
      label: t?.('aiCreateWizard.snapshotVersionEmployee') || 'Employee',
      value: versions.employee,
    },
    {
      key: 'skill',
      label: t?.('aiCreateWizard.snapshotVersionSkill') || 'Skill',
      value: versions.skill,
    },
    {
      key: 'calendar',
      label: t?.('aiCreateWizard.snapshotVersionCalendar') || 'Calendar',
      value: versions.calendar,
    },
  ].filter((c) => c.value);

  if (!chips.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t?.('aiCreateWizard.snapshotPinned') || 'Analysis Snapshot (pinned)'}
        {snapshot.snapshotId ? (
          <span className="ml-1 font-mono text-[10px] opacity-70">
            {String(snapshot.snapshotId).slice(-8)}
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.key}
            className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-background px-2 py-0.5 text-[11px] text-foreground ring-1 ring-border/70"
            title={String(c.value)}
          >
            <span className="shrink-0 font-semibold text-muted-foreground">{c.label}</span>
            <span className="truncate font-mono">{c.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

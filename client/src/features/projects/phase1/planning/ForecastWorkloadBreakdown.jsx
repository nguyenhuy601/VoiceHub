/**
 * Read-only Commitment / Forecast / Actual (Wave 1 placeholder) widget.
 */
export default function ForecastWorkloadBreakdown({ data, t, compact = false }) {
  if (!data) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('workspace.phase1ForecastNoData')}
      </p>
    );
  }

  const breakdown = data.breakdown || {};
  const actualLabel =
    data.actualStatus === 'insufficient_data'
      ? t('workspace.phase1ForecastActualInsufficient')
      : data.actualWorkloadPct != null
        ? `${data.actualWorkloadPct}%`
        : '—';

  return (
    <div className={`space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      {data.capacityStatus === 'missing_calendar' ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          {t('workspace.phase1ForecastMissingCalendar')}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workspace.phase1ForecastCommitment')}
          </p>
          <p className="font-semibold tabular-nums">
            {data.commitmentPct != null ? `${Math.round(data.commitmentPct)}%` : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workspace.phase1ForecastWorkload')}
          </p>
          <p className="font-semibold tabular-nums">
            {data.forecastWorkloadPct != null ? `${Math.round(data.forecastWorkloadPct)}%` : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('workspace.phase1ForecastActual')}
          </p>
          <p className="font-semibold tabular-nums">{actualLabel}</p>
        </div>
      </div>
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        <li>
          {t('workspace.phase1ForecastBudgetHours')}:{' '}
          <span className="tabular-nums text-foreground">
            {breakdown.unallocatedBudgetHours ?? 0}h
          </span>
        </li>
        <li>
          {t('workspace.phase1ForecastTaskHours')}:{' '}
          <span className="tabular-nums text-foreground">
            {breakdown.taskPlannedHours ?? 0}h
          </span>
        </li>
        <li>
          {t('workspace.phase1ForecastMeetingHours')}:{' '}
          <span className="tabular-nums text-foreground">
            {breakdown.plannedMeetingHours ?? 0}h
          </span>
        </li>
        <li>
          {t('workspace.phase1ForecastDemandTotal')}:{' '}
          <span className="tabular-nums text-foreground">
            {data.forecastDemandHours ?? 0}h
          </span>
          {' / '}
          <span className="tabular-nums">
            {data.availableHours != null ? `${data.availableHours}h` : '—'}
          </span>
        </li>
      </ul>
      <p className="text-[10px] text-muted-foreground">{t('workspace.phase1ForecastPlannedOnly')}</p>
    </div>
  );
}

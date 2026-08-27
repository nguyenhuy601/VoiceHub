/**
 * Overview Summary charts — SVG/CSS + DS tokens.
 * Callout (sm+) + tooltip hover/focus + click drilldown danh sách hạng mục.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import {
  listOverviewChartSegmentCards,
  overviewDonutAnnulusPath,
  overviewDonutCalloutPoints,
} from './projectHubUtils';

function hubBarLabel(row, t) {
  if (row.labelKey) {
    const translated = t(row.labelKey);
    if (translated && translated !== row.labelKey) return translated;
  }
  return row.label || row.key;
}

function HubChartLegend({
  items = [],
  valueMode = 'countPct',
  muted,
  titleCls,
  t,
  activeKey = null,
  onSelect,
}) {
  return (
    <ul className="min-w-0 w-full space-y-2" role="list">
      {items.map((seg) => {
        const label = hubBarLabel(seg, t);
        const value =
          valueMode === 'count'
            ? t('workspace.projectHubOverviewChartCount', { n: seg.count })
            : t('workspace.projectHubOverviewChartCountPct', {
                n: seg.count,
                pct: seg.pct,
              });
        const dimmed = !(Number(seg.count) > 0);
        const selected = activeKey === seg.key;
        const clickable = Number(seg.count) > 0 && typeof onSelect === 'function';
        return (
          <li key={seg.key}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(seg.key)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left text-xs transition ${
                dimmed ? 'opacity-50' : ''
              } ${clickable ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default'} ${
                selected ? 'bg-muted ring-1 ring-border' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${seg.barClass}`} aria-hidden />
                <span className={`truncate font-semibold uppercase tracking-wide ${titleCls}`}>
                  {label}
                </span>
              </span>
              <span className={`shrink-0 tabular-nums font-medium ${muted}`}>{value}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function HubDonutTooltip({ seg, valueMode, t, titleCls }) {
  if (!seg) return null;
  const label = hubBarLabel(seg, t);
  const text =
    valueMode === 'count'
      ? t('workspace.projectHubOverviewChartTooltipCount', { label, n: seg.count })
      : t('workspace.projectHubOverviewChartTooltipPct', {
          label,
          pct: seg.pct,
          n: seg.count,
        });
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-2 z-10 w-max max-w-[14rem] -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 shadow-md"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${seg.barClass}`} aria-hidden />
        <span className={`font-medium tabular-nums ${titleCls}`}>{text}</span>
      </div>
    </div>
  );
}

function OverviewChartDrilldown({
  title,
  items = [],
  muted,
  titleCls,
  t,
  onClose,
  onOpenCard,
}) {
  return (
    <div
      className="mt-3 rounded-lg border border-border bg-background p-3"
      role="region"
      aria-label={title}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${titleCls}`}>{title}</p>
          <p className={`text-[10px] ${muted}`}>
            {t('workspace.projectHubOverviewDrilldownCount', { n: items.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t('workspace.projectHubOverviewDrilldownClose')}
        >
          {t('workspace.projectHubOverviewDrilldownClose')}
        </button>
      </div>
      {items.length === 0 ? (
        <p className={`text-xs ${muted}`}>{t('workspace.projectHubOverviewDrilldownEmpty')}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {items.map((row) => (
            <li key={row.id || row.title}>
              <button
                type="button"
                onClick={() => row.id && onOpenCard?.(row.id)}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/70"
              >
                <span className={`min-w-0 flex-1 truncate font-medium ${titleCls}`}>{row.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HubDonutChart({
  segments = [],
  total = 0,
  centerValue,
  centerLabel,
  ariaLabel,
  emptyLabel,
  legendValueMode = 'countPct',
  muted,
  titleCls,
  t,
  selectedKey = null,
  onSelectSegment,
}) {
  const tipId = useId();
  const [hoverKey, setHoverKey] = useState(null);
  const hasWork = Number(total) > 0;
  const tipKey = hoverKey || null;
  const tipSeg = hasWork ? segments.find((s) => s.key === tipKey) : null;

  useEffect(() => {
    if (!selectedKey) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onSelectSegment?.(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, onSelectSegment]);

  const renderSlices = (cx, cy, outerR, innerR) =>
    segments.map((seg) => {
      if (!(Number(seg.sweepAngle) > 0)) return null;
      const d = overviewDonutAnnulusPath(cx, cy, outerR, innerR, seg.startAngle, seg.sweepAngle);
      if (!d) return null;
      const label = hubBarLabel(seg, t);
      const tipText =
        legendValueMode === 'count'
          ? t('workspace.projectHubOverviewChartTooltipCount', { label, n: seg.count })
          : t('workspace.projectHubOverviewChartTooltipPct', {
              label,
              pct: seg.pct,
              n: seg.count,
            });
      const selected = selectedKey === seg.key;
      return (
        <path
          key={seg.key}
          d={d}
          tabIndex={0}
          role="button"
          aria-label={tipText}
          aria-pressed={selected}
          aria-describedby={tipKey === seg.key ? tipId : undefined}
          className={`${seg.fillClass} stroke-surface cursor-pointer outline-none focus-visible:stroke-primary focus-visible:stroke-2 ${
            selected ? 'opacity-100' : selectedKey ? 'opacity-55' : ''
          }`}
          strokeWidth="1.5"
          onMouseEnter={() => setHoverKey(seg.key)}
          onMouseLeave={() => setHoverKey(null)}
          onFocus={() => setHoverKey(seg.key)}
          onBlur={() => setHoverKey(null)}
          onClick={(e) => {
            e.preventDefault();
            onSelectSegment?.(selected ? null : seg.key);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectSegment?.(selected ? null : seg.key);
            }
          }}
        />
      );
    });

  const callouts = hasWork
    ? overviewDonutCalloutPoints(segments, {
        cx: 100,
        cy: 80,
        rimR: 38,
        elbowR: 50,
        labelPad: 10,
        labelX: 168,
      })
    : [];

  const calloutValue = (row) =>
    legendValueMode === 'count'
      ? t('workspace.projectHubOverviewChartCount', { n: row.count })
      : t('workspace.projectHubOverviewChartPctOnly', { pct: row.pct });

  return (
    <div className="flex flex-col gap-3">
      <div className="relative hidden sm:block">
        <div className="relative mx-auto w-full max-w-[20rem]">
          <svg
            viewBox="0 0 200 160"
            className="h-44 w-full overflow-visible"
            role="img"
            aria-label={hasWork ? ariaLabel : emptyLabel}
          >
            <circle
              cx={100}
              cy={80}
              r={(36 + 22) / 2}
              className="fill-none stroke-muted"
              strokeWidth={14}
            />
            {hasWork ? renderSlices(100, 80, 36, 22) : null}
            {callouts.map((c) => {
              // rim → elbow → ngang cột chữ → dọc tới y đã tách (nếu collision).
              const linePts =
                Math.abs(Number(c.y3) - Number(c.y2)) > 0.5
                  ? `${c.x1},${c.y1} ${c.x2},${c.y2} ${c.x3},${c.y2} ${c.x3},${c.y3}`
                  : `${c.x1},${c.y1} ${c.x2},${c.y2} ${c.x3},${c.y3}`;
              return (
              <g key={`callout-${c.key}`} aria-hidden className="pointer-events-none">
                <polyline
                  points={linePts}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                  opacity={0.75}
                />
                <circle cx={c.x1} cy={c.y1} r="1.75" className="fill-muted-foreground" opacity={0.85} />
                <text
                  x={c.x3 + c.dx}
                  y={c.y3 - 3}
                  textAnchor={c.textAnchor}
                  className="fill-foreground text-[9px] font-bold uppercase"
                >
                  {hubBarLabel(c, t)}
                </text>
                <text
                  x={c.x3 + c.dx}
                  y={c.y3 + 9}
                  textAnchor={c.textAnchor}
                  className="fill-muted-foreground text-[9px] font-semibold tabular-nums"
                >
                  {calloutValue(c)}
                </text>
              </g>
              );
            })}
            <text
              x={100}
              y={78}
              textAnchor="middle"
              className="pointer-events-none fill-foreground text-[16px] font-bold tabular-nums"
            >
              {hasWork ? centerValue : '—'}
            </text>
            {centerLabel ? (
              <text
                x={100}
                y={92}
                textAnchor="middle"
                className="pointer-events-none fill-muted-foreground text-[8px] font-semibold uppercase"
              >
                {centerLabel}
              </text>
            ) : null}
          </svg>
          <div id={tipId} className="contents">
            <HubDonutTooltip seg={tipSeg} valueMode={legendValueMode} t={t} titleCls={titleCls} />
          </div>
        </div>
      </div>

      <div className="relative sm:hidden">
        <div className="relative mx-auto h-36 w-36">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full"
            role="img"
            aria-label={hasWork ? ariaLabel : emptyLabel}
          >
            <circle
              cx={50}
              cy={50}
              r={(38 + 24) / 2}
              className="fill-none stroke-muted"
              strokeWidth={14}
            />
            {hasWork ? renderSlices(50, 50, 38, 24) : null}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
            <span className={`text-xl font-bold tabular-nums leading-none ${titleCls}`}>
              {hasWork ? centerValue : '—'}
            </span>
            {centerLabel ? (
              <span className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
                {centerLabel}
              </span>
            ) : null}
          </div>
          <HubDonutTooltip seg={tipSeg} valueMode={legendValueMode} t={t} titleCls={titleCls} />
        </div>
      </div>

      {!hasWork ? (
        <p className={`text-sm ${muted}`}>{emptyLabel}</p>
      ) : (
        <HubChartLegend
          items={segments}
          valueMode={legendValueMode}
          muted={muted}
          titleCls={titleCls}
          t={t}
          activeKey={selectedKey}
          onSelect={(key) => onSelectSegment?.(selectedKey === key ? null : key)}
        />
      )}
    </div>
  );
}

function HubPriorityVerticalBars({
  items = [],
  emptyLabel,
  muted,
  titleCls,
  t,
  selectedKey = null,
  onSelectSegment,
}) {
  if (!items.length) {
    return <p className={`text-sm ${muted}`}>{emptyLabel}</p>;
  }

  const n = items.length;
  const maxCount = Math.max(...items.map((row) => Number(row.count) || 0), 1);
  const chartH = 100;
  const gap = 10;
  const barW = n <= 4 ? 28 : 22;
  const width = n * barW + Math.max(0, n - 1) * gap;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const svgW = width + padX * 2;
  const svgH = chartH + padTop + padBottom;
  const stubH = 4;

  return (
    <div className="flex flex-col gap-3">
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
        {t('workspace.projectHubOverviewPriorityAxis')}
      </p>
      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="h-40 w-full max-w-[15rem]"
          role="img"
          aria-label={t('workspace.projectHubOverviewPriorityBreakdown')}
        >
          {items.map((row, index) => {
            const count = Number(row.count) || 0;
            const h = count > 0 ? Math.max(Math.round((count / maxCount) * chartH), 6) : stubH;
            const x = padX + index * (barW + gap);
            const y = padTop + (chartH - h);
            const label = hubBarLabel(row, t);
            const selected = selectedKey === row.key;
            const clickable = count > 0;
            return (
              <g
                key={row.key}
                opacity={count > 0 ? (selectedKey && !selected ? 0.45 : 1) : 0.45}
                className={clickable ? 'cursor-pointer' : undefined}
                onClick={() => {
                  if (!clickable) return;
                  onSelectSegment?.(selected ? null : row.key);
                }}
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="3"
                  className={row.fillClass || 'fill-primary'}
                />
                <title>{`${label}: ${count}`}</title>
                <text
                  x={x + barW / 2}
                  y={count > 0 ? Math.max(padTop + 12, y - 5) : padTop + chartH - stubH - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-semibold"
                >
                  {count}
                </text>
                <text
                  x={x + barW / 2}
                  y={padTop + chartH + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[8px] font-medium"
                >
                  {label.length > 8 ? `${label.slice(0, 7)}…` : label}
                </text>
                <rect
                  x={x + 2}
                  y={padTop + chartH + 18}
                  width={barW - 4}
                  height="2"
                  rx="1"
                  className={row.fillClass || 'fill-primary'}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <HubChartLegend
        items={items}
        valueMode="countPct"
        muted={muted}
        titleCls={titleCls}
        t={t}
        activeKey={selectedKey}
        onSelect={(key) => onSelectSegment?.(selectedKey === key ? null : key)}
      />
    </div>
  );
}

export function ProjectHubOverviewCharts({
  charts,
  cards = [],
  lists = [],
  members = [],
  showAssigneeChart = true,
  muted,
  titleCls,
  cardCls,
  t,
  onOpenCard,
}) {
  const [drill, setDrill] = useState(null);

  const drillItems = useMemo(() => {
    if (!drill?.key) return [];
    return listOverviewChartSegmentCards({
      cards,
      lists,
      members,
      chart: drill.chart,
      segmentKey: drill.key,
    });
  }, [cards, lists, members, drill]);

  if (!charts) return null;

  const priorityEmpty = charts.hasPriorityData
    ? t('workspace.projectHubOverviewChartEmpty')
    : t('workspace.projectHubOverviewPriorityEmpty');

  const select = (chart, key, segments) => {
    if (!key) {
      setDrill(null);
      return;
    }
    const seg = (segments || []).find((s) => s.key === key);
    const label = seg ? hubBarLabel(seg, t) : key;
    setDrill((prev) =>
      prev?.chart === chart && prev?.key === key ? null : { chart, key, label }
    );
  };

  const drillFor = (chart) => (drill?.chart === chart ? drill : null);

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <section className={cardCls} aria-labelledby="overview-status-donut">
        <h3
          id="overview-status-donut"
          className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}
        >
          {t('workspace.projectHubOverviewStatusDonut')}
        </h3>
        <HubDonutChart
          segments={charts.statusSegments}
          total={charts.statusTotal}
          centerValue={String(charts.statusTotal || 0)}
          centerLabel={t('workspace.projectHubStatCards')}
          ariaLabel={t('workspace.projectHubOverviewStatusDonutAria', {
            n: charts.statusTotal || 0,
          })}
          emptyLabel={t('workspace.projectHubOverviewChartEmpty')}
          legendValueMode="countPct"
          muted={muted}
          titleCls={titleCls}
          t={t}
          selectedKey={drillFor('status')?.key || null}
          onSelectSegment={(key) => select('status', key, charts.statusSegments)}
        />
        {drillFor('status') ? (
          <OverviewChartDrilldown
            title={t('workspace.projectHubOverviewDrilldownTitle', {
              label: drillFor('status').label,
            })}
            items={drillItems}
            muted={muted}
            titleCls={titleCls}
            t={t}
            onClose={() => setDrill(null)}
            onOpenCard={onOpenCard}
          />
        ) : null}
      </section>

      <section className={cardCls} aria-labelledby="overview-priority-breakdown">
        <h3
          id="overview-priority-breakdown"
          className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}
        >
          {t('workspace.projectHubOverviewPriorityBreakdown')}
        </h3>
        <HubPriorityVerticalBars
          items={charts.prioritySegments}
          emptyLabel={priorityEmpty}
          muted={muted}
          titleCls={titleCls}
          t={t}
          selectedKey={drillFor('priority')?.key || null}
          onSelectSegment={(key) => select('priority', key, charts.prioritySegments)}
        />
        {drillFor('priority') ? (
          <OverviewChartDrilldown
            title={t('workspace.projectHubOverviewDrilldownTitle', {
              label: drillFor('priority').label,
            })}
            items={drillItems}
            muted={muted}
            titleCls={titleCls}
            t={t}
            onClose={() => setDrill(null)}
            onOpenCard={onOpenCard}
          />
        ) : null}
      </section>

      {showAssigneeChart ? (
      <section
        className={`${cardCls} sm:col-span-2 lg:col-span-1`}
        aria-labelledby="overview-assignee-donut"
      >
        <h3
          id="overview-assignee-donut"
          className={`mb-3 text-xs font-semibold uppercase tracking-wide ${muted}`}
        >
          {t('workspace.projectHubOverviewAssigneeDonut')}
        </h3>
        <HubDonutChart
          segments={charts.assigneeSegments}
          total={charts.assigneeTotal}
          centerValue={String(charts.assigneeTotal || 0)}
          centerLabel={t('workspace.projectHubOverviewAssigneeOpen')}
          ariaLabel={t('workspace.projectHubOverviewAssigneeAria', {
            n: charts.assigneeTotal || 0,
          })}
          emptyLabel={t('workspace.projectHubOverviewAssigneeEmpty')}
          legendValueMode="count"
          muted={muted}
          titleCls={titleCls}
          t={t}
          selectedKey={drillFor('assignee')?.key || null}
          onSelectSegment={(key) => select('assignee', key, charts.assigneeSegments)}
        />
        {drillFor('assignee') ? (
          <OverviewChartDrilldown
            title={t('workspace.projectHubOverviewDrilldownTitle', {
              label: drillFor('assignee').label,
            })}
            items={drillItems}
            muted={muted}
            titleCls={titleCls}
            t={t}
            onClose={() => setDrill(null)}
            onOpenCard={onOpenCard}
          />
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

export default ProjectHubOverviewCharts;

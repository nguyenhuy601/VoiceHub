import { useAppStrings } from '../../locales/appStrings';

export default function DashboardLineChart({ data, height = 240 }) {
  const { t } = useAppStrings();
  const width = 1000;
  const pad = { top: 12, right: 16, bottom: 28, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        {t('dashboard.chartNoData')}
      </div>
    );
  }

  const maxY = Math.max(
    1,
    ...rows.flatMap((r) => [Number(r.tasks) || 0, Number(r.messages) || 0, Number(r.meetings) || 0])
  );
  const xAt = (i) => pad.left + (i / Math.max(1, rows.length - 1)) * innerW;
  const yAt = (v) => pad.top + innerH - (v / maxY) * innerH;
  const linePath = (key) =>
    rows
      .map((row, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(Number(row[key]) || 0).toFixed(2)}`)
      .join(' ');
  const gridY = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full" role="img" aria-label={t('dashboard.chartAria')}>
      {gridY.map((ratio) => {
        const y = pad.top + innerH * (1 - ratio);
        return (
          <line
            key={ratio}
            x1={pad.left}
            x2={width - pad.right}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
        );
      })}
      <path d={linePath('tasks')} fill="none" stroke="#2563EB" strokeWidth="2.5" />
      <path d={linePath('messages')} fill="none" stroke="#10B981" strokeWidth="2" />
      <path d={linePath('meetings')} fill="none" stroke="#F97316" strokeWidth="2" />
      {rows.map((row, i) =>
        i % 4 === 0 ? (
          <text
            key={row.day + String(i)}
            x={xAt(i)}
            y={height - 8}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="11"
          >
            {row.day}
          </text>
        ) : null
      )}
      <g transform={`translate(${pad.left}, 8)`}>
        <circle cx="0" cy="0" r="4" fill="#2563EB" />
        <text x="10" y="4" fill="var(--muted-foreground)" fontSize="12">
          {t('dashboard.legendTasks')}
        </text>
        <circle cx="70" cy="0" r="4" fill="#10B981" />
        <text x="80" y="4" fill="var(--muted-foreground)" fontSize="12">
          {t('dashboard.legendMessages')}
        </text>
        <circle cx="165" cy="0" r="4" fill="#F97316" />
        <text x="175" y="4" fill="var(--muted-foreground)" fontSize="12">
          {t('dashboard.legendMeetings')}
        </text>
      </g>
    </svg>
  );
}

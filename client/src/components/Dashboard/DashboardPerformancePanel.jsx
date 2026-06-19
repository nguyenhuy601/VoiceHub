import { Activity } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_CARD,
  FIGMA_DASH_MINI_STAT_CELL,
  FIGMA_DASH_MINI_STAT_GRID,
  FIGMA_DASH_PROGRESS_FILL,
  FIGMA_DASH_PROGRESS_TRACK,
  FIGMA_DASH_SECTION_TITLE,
  FIGMA_DASH_SECTION_TITLE_ROW,
  FIGMA_DASH_WEEK_BADGE,
} from './figmaDashboardClasses';

export default function DashboardPerformancePanel({ performanceStats, miniStats }) {
  const { t } = useAppStrings();
  return (
    <div className={`${FIGMA_DASH_CARD} p-5`}>
      <div className={FIGMA_DASH_SECTION_TITLE_ROW}>
        <div className={FIGMA_DASH_SECTION_TITLE}>
          <Activity size={15} className="text-primary" />
          {t('dashboard.performancePanel.title')}
        </div>
        <span className={FIGMA_DASH_WEEK_BADGE}>{t('dashboard.performancePanel.weekBadge')}</span>
      </div>
      <div className="flex flex-col gap-4">
        {performanceStats.map((s) => {
          const Icon = s.icon;
          const pct = Math.round((s.value / s.target) * 100);
          return (
            <div key={s.label}>
              <div className="mb-[7px] flex items-center justify-between">
                <div className="flex items-center gap-[7px]">
                  <Icon size={13} style={{ color: s.color }} />
                  <span className="text-[0.8125rem] font-medium text-foreground">{s.label}</span>
                </div>
                <span className="text-[0.9375rem] font-bold tracking-[-0.02em]" style={{ color: s.color }}>
                  {s.value}
                  {s.unit || ''}{' '}
                  <span className="text-[0.6875rem] font-normal text-muted-foreground">
                    / {s.target}
                    {s.unit || ''}
                  </span>
                </span>
              </div>
              <div className={FIGMA_DASH_PROGRESS_TRACK}>
                <div
                  className={FIGMA_DASH_PROGRESS_FILL}
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: `linear-gradient(90deg, ${s.color}CC, ${s.color})`,
                  }}
                />
              </div>
              <div className="mt-[3px] flex justify-end">
                <span className="text-[0.6875rem] text-muted-foreground">
                  {pct}% {t('dashboard.performancePanel.targetLabel')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={FIGMA_DASH_MINI_STAT_GRID}>
        {miniStats.map((s) => (
          <div key={s.label} className={FIGMA_DASH_MINI_STAT_CELL}>
            <div className="text-[1.0625rem] font-bold leading-none tracking-[-0.03em]" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="mt-1 text-[0.625rem] leading-[1.3] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

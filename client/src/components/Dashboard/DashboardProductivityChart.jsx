import { BarChart2 } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import DashboardLineChart from './DashboardLineChart';
import {
  FIGMA_DASH_CHART_BADGE,
  FIGMA_DASH_CHART_CARD,
  FIGMA_DASH_CHART_HEADER,
  FIGMA_DASH_CHART_SUB,
  FIGMA_DASH_CHART_TITLE,
  FIGMA_DASH_CHART_TITLE_ROW,
} from './figmaDashboardClasses';

export default function DashboardProductivityChart({ productivity30d, productivityTrends }) {
  const { t } = useAppStrings();

  return (
    <div className={FIGMA_DASH_CHART_CARD}>
      <div className={FIGMA_DASH_CHART_HEADER}>
        <div>
          <div className={FIGMA_DASH_CHART_TITLE_ROW}>
            <BarChart2 size={16} className="text-primary" />
            <span className={FIGMA_DASH_CHART_TITLE}>{t('dashboard.teamProductivity')}</span>
            <span className={FIGMA_DASH_CHART_BADGE}>{t('dashboard.last30Days')}</span>
          </div>
          <p className={FIGMA_DASH_CHART_SUB}>{t('dashboard.productivitySub')}</p>
        </div>
        <div className="flex gap-4">
          {[
            { label: t('dashboard.legendTasks'), color: '#2563EB', value: productivityTrends.tasks },
            { label: t('dashboard.legendMessages'), color: '#10B981', value: productivityTrends.messages },
            { label: t('dashboard.legendMeetings'), color: '#F97316', value: productivityTrends.meetings },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xs font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-[0.6875rem] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <DashboardLineChart data={productivity30d} />
    </div>
  );
}

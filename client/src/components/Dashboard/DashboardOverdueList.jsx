import { AlertTriangle, Clock } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { formatDateForLocale } from '../../utils/localeFormat';
import {
  FIGMA_DASH_CARD,
  FIGMA_DASH_SECTION_TITLE,
  FIGMA_DASH_SECTION_TITLE_ROW,
} from './figmaDashboardClasses';

export default function DashboardOverdueList({ items = [], onItemClick }) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const rows = Array.isArray(items) ? items.slice(0, 8) : [];
  if (!rows.length) return null;

  return (
    <div className={`${FIGMA_DASH_CARD} p-5`}>
      <div className={FIGMA_DASH_SECTION_TITLE_ROW}>
        <div className={FIGMA_DASH_SECTION_TITLE}>
          <AlertTriangle size={15} className="text-destructive" />
          {t('dashboard.overdueListTitle')}
        </div>
        <span className="text-[0.6875rem] text-muted-foreground">{t('dashboard.overdueListSub')}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((item) => {
          const dueLabel = item?.dueDate
            ? formatDateForLocale(item.dueDate, locale, { month: 'short', day: 'numeric' })
            : '—';
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onItemClick?.(item)}
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-left transition hover:border-destructive/25 hover:bg-background"
              >
                <div className="truncate text-[0.8125rem] font-semibold text-foreground">
                  {item.title || item.id}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.625rem] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-destructive">
                    <Clock size={11} />
                    {t('dashboard.overdueListDue', { date: dueLabel })}
                  </span>
                  {item.boardName ? <span className="truncate">{item.boardName}</span> : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

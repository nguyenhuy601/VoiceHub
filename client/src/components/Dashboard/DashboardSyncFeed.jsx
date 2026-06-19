import { Bot, Repeat2 } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_CARD,
  FIGMA_DASH_SECTION_TITLE,
  FIGMA_DASH_SYNC_FOOTER,
  FIGMA_DASH_SYNC_ITEM,
  FIGMA_DASH_SYNC_LIVE,
} from './figmaDashboardClasses';

export default function DashboardSyncFeed({ items, onItemClick }) {
  const { t } = useAppStrings();

  return (
    <div className={`${FIGMA_DASH_CARD} p-5`}>
      <div className="mb-3.5 flex items-center justify-between">
        <div className={FIGMA_DASH_SECTION_TITLE}>
          <Repeat2 size={15} className="text-success" />
          {t('dashboard.syncFeedTitle')}
          {items.length > 0 && (
            <span className={FIGMA_DASH_SYNC_LIVE}>
              <span className="inline-block h-[5px] w-[5px] rounded-full bg-success shadow-[0_0_5px_#10B981]" />
              {t('dashboard.syncLinkedBadge')}
            </span>
          )}
        </div>
        <span className="text-[0.6875rem] text-muted-foreground">{t('dashboard.syncChatTaskLabel')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {t('dashboard.emptySyncFeed')}
          </p>
        ) : (
          items.map((item, i) => {
            const ItemIcon = item.icon;
            const isAI = item.color === '#F97316';
            return (
              <button
                key={`${item.item}-${i}`}
                type="button"
                onClick={() => onItemClick?.(item)}
                className={FIGMA_DASH_SYNC_ITEM}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${item.color}44`;
                  e.currentTarget.style.background = `${item.color}08`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--background)';
                }}
              >
                <div
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px]"
                  style={{ background: `${item.color}15` }}
                >
                  <ItemIcon size={13} style={{ color: item.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[0.8125rem] leading-relaxed text-foreground">
                    <span className="font-semibold" style={{ color: isAI ? '#F97316' : item.color }}>
                      {item.user}
                    </span>{' '}
                    <span className="text-muted-foreground">{item.action}</span>{' '}
                    <span className="font-medium">{item.item}</span>
                    {item.workspace ? (
                      <span className="font-medium text-primary"> {item.workspace}</span>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{item.time}</span>
              </button>
            );
          })
        )}
      </div>
      <div className={FIGMA_DASH_SYNC_FOOTER}>
        <Bot size={13} className="shrink-0 text-ai" />
        <span className="text-[0.7rem] text-muted-foreground">{t('dashboard.syncFeedFooter')}</span>
      </div>
    </div>
  );
}

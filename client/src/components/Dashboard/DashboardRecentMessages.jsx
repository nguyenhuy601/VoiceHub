import { ChevronRight, Hash, MessageCircle } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_LINK_BTN,
  FIGMA_DASH_MSG_AVATAR,
  FIGMA_DASH_MSG_ROW,
  FIGMA_DASH_MSG_UNREAD,
  FIGMA_DASH_PANEL,
  FIGMA_DASH_PANEL_HEADER,
  FIGMA_DASH_PANEL_TITLE,
} from './figmaDashboardClasses';

export default function DashboardRecentMessages({ messages, onViewAll, onMessageClick }) {
  const { t } = useAppStrings();

  return (
    <div className={FIGMA_DASH_PANEL}>
      <div className={FIGMA_DASH_PANEL_HEADER}>
        <div className={FIGMA_DASH_PANEL_TITLE}>
          <MessageCircle size={15} className="text-primary" />
          {t('dashboard.recentMessagesTitle')}
        </div>
        <button type="button" className={FIGMA_DASH_LINK_BTN} onClick={onViewAll}>
          {t('dashboard.viewAllShort')} <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex flex-col">
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
            {t('dashboard.emptyRecentMessages')}
          </p>
        ) : (
          messages.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => onMessageClick?.(msg)}
              className={FIGMA_DASH_MSG_ROW}
            >
              <div
                className={FIGMA_DASH_MSG_AVATAR}
                style={{ background: `${msg.color}15`, color: msg.color }}
              >
                {msg.type === 'channel' ? <Hash size={13} /> : msg.avatar}
                {msg.unread > 0 ? <div className={FIGMA_DASH_MSG_UNREAD}>{msg.unread}</div> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex justify-between gap-1.5">
                  <span
                    className={`truncate text-[0.8125rem] ${msg.unread > 0 ? 'font-semibold' : 'font-medium'} text-foreground`}
                  >
                    {msg.name}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{msg.time}</span>
                </div>
                <p className="m-0 truncate text-xs text-muted-foreground">{msg.msg}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

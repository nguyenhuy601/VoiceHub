import { Bot, Link2, Plus } from 'lucide-react';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import {
  FIGMA_WS_KANBAN_TOP_BAR,
  FIGMA_WS_SYNC_BADGE,
} from './figmaWorkspaceClasses';
import { useAppStrings } from '../../locales/appStrings';

export function resolveSyncedChannelLabel(card, channels = []) {
  const chId =
    card?.linkedChannelId ||
    card?.channelId ||
    card?.roomId ||
    card?.syncedChannelId ||
    card?.metadata?.channelId;
  if (!chId) {
    const raw = String(card?.syncedChannel || card?.metadata?.syncedChannel || '').trim();
    return raw || null;
  }
  const ch = (Array.isArray(channels) ? channels : []).find(
    (c) => String(c._id || c.id) === String(chId)
  );
  if (!ch) return null;
  const slug = channelNameToDisplaySlug(ch.name || ch.slug || '', 'vi');
  return slug ? `#${slug}` : null;
}

export function KanbanSyncedChannelBadge({ channelLabel, doneNotified = false, className = '' }) {
  if (!channelLabel) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[0.6rem] font-semibold ${
        doneNotified ? 'text-success' : 'text-ai'
      } ${className}`}
    >
      <Link2 size={9} />
      {doneNotified ? '✓ ' : ''}
      Synced to {channelLabel}
    </span>
  );
}

/** Extra footer cho thẻ done — hiển thị syncedChannel badge. */
export function kanbanCardSyncedExtra(card, channels = []) {
  const isDone = String(card?.status || '').toLowerCase() === 'done';
  if (!isDone) return null;
  const label = resolveSyncedChannelLabel(card, channels);
  if (!label) return null;
  return (
    <div className="mt-1.5">
      <KanbanSyncedChannelBadge channelLabel={label} doneNotified />
    </div>
  );
}

/**
 * Kanban wrapper — top bar Figma + Two-way Sync badge; thẻ done nhận syncedChannel qua renderCardExtra.
 */
export default function WorkspaceKanbanFigmaView({
  children,
  locale = 'vi',
  onCreateTask,
  className = '',
}) {
  const { t } = useAppStrings();

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${className}`}>
      <div className={FIGMA_WS_KANBAN_TOP_BAR}>
        <span className="text-xs font-semibold text-foreground">{t('workspace.kanbanTitle')}</span>
        <div className={FIGMA_WS_SYNC_BADGE}>
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_5px_var(--success)]" />
          <Bot size={12} />
          <span>{t('workspace.linkedSync')}</span>
        </div>
        {onCreateTask ? (
          <button
            type="button"
            onClick={() => onCreateTask?.()}
            className="ml-2 inline-flex h-8 items-center gap-1 rounded-lg bg-gradient-to-br from-primary to-primary-hover px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:shadow-md"
          >
            <Plus size={13} />
            {t('workspace.newTaskBtn')}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

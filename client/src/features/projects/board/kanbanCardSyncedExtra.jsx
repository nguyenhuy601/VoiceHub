import { Link2 } from 'lucide-react';
import { channelNameToDisplaySlug } from '../../../utils/orgEntityDisplay';

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

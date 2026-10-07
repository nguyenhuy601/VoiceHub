import { useMemo } from 'react';
import { Hash, Lock, Settings, Volume2 } from 'lucide-react';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import {
  channelsForDepartment,
  channelsForDivision,
  channelsForTeam,
  splitChatVoiceChannels,
} from '../../utils/orgChannelScope';
import { channelUnreadCount, voicePresenceLabel } from './organizationStructureTheme';
import { ent } from '../../theme/enterpriseWorkspace';

const SCOPE_SETTINGS_BTN_CLASS =
  'absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 group-hover:opacity-100 motion-reduce:transition-none';

const ROW_BASE_CLASS =
  'relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none';

function channelRowStateClass({ active, unread }) {
  if (active) return 'border-l-2 border-primary bg-primary/10 font-medium text-foreground';
  if (unread > 0) return 'font-medium text-foreground hover:bg-muted';
  return 'text-muted-foreground hover:bg-muted hover:text-foreground';
}

/**
 * Kênh chat/voice — tách khỏi cây tổ chức (enterprise IA).
 */
export default function OrganizationChannelListPanel({
  locale,
  t,
  channels = [],
  channelPermissionMatrix = {},
  selectedChannelId,
  selectedTeamId,
  selectedDepartmentId,
  selectedDivisionId,
  onSelectChannel,
  onCreateChannel,
  onOpenChannelSettings,
  canManageChannelRoleAccess = false,
  departmentWorkspaceActive = false,
}) {
  const getChannelPerm = (channelId) => {
    const row = channelPermissionMatrix?.[String(channelId)] || null;
    return {
      canSee: Boolean(row?.canSee ?? row?.canRead),
      canRead: Boolean(row?.canRead),
    };
  };

  const scopeChannels = useMemo(() => {
    let raw = [];
    if (selectedTeamId) {
      raw = channelsForTeam(channels, selectedTeamId);
    } else if (selectedDepartmentId) {
      raw = channelsForDepartment(channels, selectedDepartmentId).filter((ch) => !ch.team);
    } else if (selectedDivisionId) {
      raw = channelsForDivision(channels, selectedDivisionId);
    }
    return raw.filter((ch) => {
      const p = getChannelPerm(ch._id);
      return p.canSee || p.canRead;
    });
  }, [channels, selectedTeamId, selectedDepartmentId, selectedDivisionId, channelPermissionMatrix]);

  const { chat, voice } = useMemo(
    () => splitChatVoiceChannels(scopeChannels),
    [scopeChannels]
  );

  const openChannelSettings = (event, channel) => {
    if (!canManageChannelRoleAccess || !onOpenChannelSettings) return;
    event.preventDefault();
    onOpenChannelSettings(channel);
  };

  const renderSettings = (channel) => {
    if (!canManageChannelRoleAccess || !onOpenChannelSettings) return null;
    return (
      <button
        type="button"
        title={t('orgPanel.channelSettings')}
        aria-label={t('orgPanel.channelSettings')}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChannelSettings(channel);
        }}
        className={SCOPE_SETTINGS_BTN_CLASS}
      >
        <Settings className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  };

  const renderRow = (channel, { voice: isVoice }) => {
    const active = String(selectedChannelId) === String(channel._id);
    const unread = channelUnreadCount(channel);
    const perm = getChannelPerm(channel._id);
    const canSee = perm.canSee || perm.canRead;
    const canEnter = perm.canRead;
    const slug = channelNameToDisplaySlug(channel.name, locale);
    const presence = isVoice ? voicePresenceLabel(channel) : '';
    const ChannelIcon = isVoice ? Volume2 : Hash;

    if (!canSee) return null;

    if (canSee && !canEnter) {
      return (
        <div
          key={channel._id}
          className="group relative flex items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-sm text-muted-foreground"
          title={t('orgPanel.channelLocked')}
          onContextMenu={(e) => openChannelSettings(e, channel)}
        >
          <ChannelIcon className="h-3.5 w-3.5" aria-hidden />
          <span className="truncate">{slug}</span>
          <Lock className="ml-auto h-3 w-3 shrink-0" aria-label={t('orgPanel.channelLocked')} />
          {renderSettings(channel)}
        </div>
      );
    }

    return (
      <div key={channel._id} className="group relative">
        <button
          type="button"
          onClick={() => onSelectChannel?.(channel._id)}
          onContextMenu={(e) => openChannelSettings(e, channel)}
          aria-current={active ? 'page' : undefined}
          className={`${ROW_BASE_CLASS} ${channelRowStateClass({ active, unread })}`}
        >
          <ChannelIcon
            className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'opacity-70'}`}
            aria-hidden
          />
          <span className="truncate font-normal">{slug}</span>
          {unread > 0 ? (
            <span
              className="ml-auto rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground"
              aria-label={t('orgPanel.channelUnreadAria', { count: unread })}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : presence ? (
            <span className={`ml-auto text-[10px] tabular-nums ${ent.status.success}`}>{presence}</span>
          ) : null}
        </button>
        {renderSettings(channel)}
      </div>
    );
  };

  const hasScope =
    selectedTeamId || selectedDepartmentId || selectedDivisionId;
  const canShowCreateChannel =
    typeof onCreateChannel === 'function' &&
    (selectedTeamId ||
      (departmentWorkspaceActive && selectedDepartmentId && !selectedTeamId));

  return (
    <div className="shrink-0 rounded-b-xl border-t border-border bg-transparent px-2 pt-2">
      <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{t('orgPanel.channelsSection')}</span>
        {canShowCreateChannel ? (
          <button
            type="button"
            onClick={() => onCreateChannel?.()}
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {t('orgPanel.addShort')}
          </button>
        ) : null}
      </div>

      {!hasScope ? (
        <p className="px-1 pb-2 text-xs text-muted-foreground">{t('orgPanel.channelsPickScope')}</p>
      ) : null}

      {hasScope && chat.length === 0 && voice.length === 0 ? (
        <p className="px-1 pb-2 text-xs text-muted-foreground">{t('orgPanel.channelsEmpty')}</p>
      ) : null}

      <div className="scrollbar-overlay max-h-[min(40vh,320px)] space-y-0.5 overflow-y-auto pb-3">
        {chat.map((ch) => renderRow(ch, { voice: false }))}
        {voice.map((ch) => renderRow(ch, { voice: true }))}
      </div>
    </div>
  );
}

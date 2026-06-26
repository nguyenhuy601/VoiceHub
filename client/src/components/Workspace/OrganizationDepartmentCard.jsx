import { useState } from 'react';
import {
  ChevronRight,
  ClipboardList,
  MessageCircle,
  Mic,
  Pin,
  Settings,
  Star,
  Users,
  Video,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { departmentSquareClass } from '../Organization/organizationStructureTheme';
import { formatDeptRelativeTime } from '../../utils/buildDepartmentHubCard';
import { FIGMA_WS_CARD } from './figmaWorkspaceClasses';

const ACTIVITY_TONE = {
  hot: {
    labelKey: 'workspace.deptActivityHot',
    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    dot: 'bg-orange-500',
  },
  active: {
    labelKey: 'workspace.deptActivityActive',
    className: 'bg-success/15 text-success',
    dot: 'bg-success',
  },
  quiet: {
    labelKey: 'workspace.deptActivityQuiet',
    className: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
  normal: {
    labelKey: 'workspace.deptActivityNormal',
    className: 'bg-primary/10 text-primary',
    dot: 'bg-primary',
  },
};

const ROLE_LABEL = {
  owner: 'workspace.roleOwnerVi',
  admin: 'workspace.roleAdminVi',
  manager: 'workspace.roleManagerVi',
  lead: 'workspace.roleLeadVi',
  member: 'workspace.roleMemberVi',
  guest: 'workspace.roleGuestVi',
};

function OnlineDots({ online, total }) {
  const visible = Math.min(5, Math.max(0, online));
  const overflow = Math.max(0, total - visible);
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-1">
        {Array.from({ length: visible }).map((_, index) => (
          <span
            key={`dot-${index}`}
            className="h-2.5 w-2.5 rounded-full border-2 border-surface bg-success"
          />
        ))}
        {overflow > 0 ? (
          <span className="ml-2 text-[0.65rem] font-semibold text-muted-foreground">+{overflow}</span>
        ) : null}
      </div>
    </div>
  );
}

function TeamPreview({ names, t }) {
  if (!names.length) {
    return <span className="text-xs text-muted-foreground">{t('workspace.deptNoTeamsYet')}</span>;
  }
  const visible = names.slice(0, 2);
  const rest = names.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-semibold text-muted-foreground">{t('workspace.deptTeamsLabel')}</span>
      {visible.map((name) => (
        <span
          key={name}
          className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground"
        >
          {name}
        </span>
      ))}
      {rest > 0 ? (
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

export default function OrganizationDepartmentCard({
  card,
  starred = false,
  onToggleStar,
  onOpen,
  onQuickAction,
  onSettings,
}) {
  const { t, locale } = useAppStrings();
  const [hovered, setHovered] = useState(false);
  const activity = ACTIVITY_TONE[card.activityLevel] || ACTIVITY_TONE.normal;
  const roleKey = String(card.myRole || '').toLowerCase();
  const roleLabelKey = ROLE_LABEL[roleKey];
  const lastActivityTime = formatDeptRelativeTime(card.lastActivityAt, t, locale);
  const accentClass = departmentSquareClass(card.id);

  const stop = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(card.id, card.raw)}
      onKeyDown={(event) => event.key === 'Enter' && onOpen?.(card.id, card.raw)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`${FIGMA_WS_CARD} relative min-h-[320px] overflow-hidden`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accentClass}`} aria-hidden />

      <div className="flex items-start gap-3 pl-1">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-lg font-extrabold text-white shadow-md ${accentClass}`}
        >
          {card.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-bold text-foreground">{card.name}</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${activity.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${activity.dot}`} />
                  {t(activity.labelKey)}
                </span>
              </div>
              {card.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  stop(event);
                  onToggleStar?.(card.id);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition hover:border-border hover:bg-muted ${
                  starred ? 'text-amber-500' : 'text-muted-foreground'
                }`}
                aria-label={starred ? t('workspace.deptUnpin') : t('workspace.deptPin')}
              >
                {starred ? <Star size={15} fill="currentColor" /> : <Pin size={15} />}
              </button>
              <ChevronRight
                size={16}
                className={`text-muted-foreground transition ${hovered ? 'translate-x-0.5 text-primary' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        <span className="flex items-center gap-1.5">
          <Users size={13} className="shrink-0 text-primary" />
          <span>
            <strong className="text-foreground">{card.memberCount}</strong> {t('workspace.members')}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle size={13} className="shrink-0 text-sky-500" />
          <span>
            <strong className="text-foreground">{card.channelCount}</strong>{' '}
            {t('workspace.deptChannelsLabel')}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Users size={13} className="shrink-0 text-violet-500" />
          <span>
            <strong className="text-foreground">{card.teamCount}</strong> {t('workspace.deptTeamsShort')}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
          <span>
            <strong className="text-foreground">{card.onlineCount}</strong>/{card.memberCount || '—'}{' '}
            {t('workspace.online')}
          </span>
        </span>
      </div>

      {card.memberCount > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2">
          <OnlineDots online={card.onlineCount} total={card.memberCount} />
          <span className="text-[0.6875rem] text-muted-foreground">
            {t('workspace.deptOnlineSummary', {
              online: card.onlineCount,
              total: card.memberCount,
            })}
          </span>
        </div>
      ) : null}

      <TeamPreview names={card.teamNames} t={t} />

      {card.headName || roleLabelKey ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {card.headName ? (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{t('workspace.deptHeadLabel')}</span>{' '}
              {card.headName}
            </span>
          ) : null}
          {roleLabelKey ? (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              {t('workspace.deptYourRole')}: {t(roleLabelKey)}
            </span>
          ) : null}
        </div>
      ) : null}

      {(card.unread > 0 || card.voiceLive || card.activeTasks > 0) && (
        <div className="flex flex-wrap gap-2">
          {card.unread > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-[0.6875rem] font-semibold text-orange-600 dark:text-orange-400">
              {t('workspace.deptUnreadBadge', { count: card.unread })}
            </span>
          ) : null}
          {card.voiceLive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[0.6875rem] font-semibold text-success">
              <Video size={12} />
              {t('workspace.deptVoiceLive', { count: card.voiceParticipants || 0 })}
            </span>
          ) : null}
          {card.activeTasks > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[0.6875rem] font-semibold text-warning">
              <ClipboardList size={12} />
              {t('workspace.deptTasksBadge', { count: card.activeTasks })}
            </span>
          ) : null}
        </div>
      )}

      {card.lastActivityLabel ? (
        <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-wide text-muted-foreground">
            {t('workspace.deptRecentActivity')}
          </p>
          <p className="mt-1 truncate text-sm text-foreground">
            {card.lastActivityLabel}
            {lastActivityTime ? (
              <span className="text-muted-foreground"> · {lastActivityTime}</span>
            ) : null}
          </p>
        </div>
      ) : null}

      {hovered ? (
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 border-t border-border/80 bg-surface/95 px-4 py-3 backdrop-blur-sm"
          onClick={stop}
        >
          {[
            { id: 'open', label: t('workspace.deptActionOpen'), icon: ChevronRight },
            { id: 'chat', label: t('workspace.moduleChat'), icon: MessageCircle },
            { id: 'voice', label: t('workspace.moduleVoice'), icon: Mic },
            ...(onSettings
              ? [{ id: 'settings', label: t('workspace.deptActionSettings'), icon: Settings }]
              : []),
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={(event) => {
                  stop(event);
                  if (action.id === 'open') onOpen?.(card.id, card.raw);
                  else if (action.id === 'settings') onSettings?.(card.raw);
                  else onQuickAction?.(card.id, action.id, card.raw);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Icon size={13} />
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

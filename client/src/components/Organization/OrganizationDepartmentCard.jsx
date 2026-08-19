import {
  Activity,
  Calendar,
  ChevronRight,
  ClipboardList,
  FileText,
  Hash,
  MessageCircle,
  Pin,
  Settings,
  Star,
  Users,
  Video,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { formatDeptRelativeTime } from '../../utils/buildDepartmentHubCard';
import { FIGMA_WS_TEAM_CARD } from './figmaWorkspaceClasses';

const GRAD_PAIRS = [
  ['#475569', '#64748B'],
  ['#1D4ED8', '#3B82F6'],
  ['#7C3AED', '#A78BFA'],
  ['#059669', '#34D399'],
  ['#D97706', '#FBBF24'],
];

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

function pickGrad(seed) {
  const n = String(seed || '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRAD_PAIRS[n % GRAD_PAIRS.length];
}

export default function OrganizationDepartmentCard({
  card,
  starred = false,
  onToggleStar,
  onOpen,
  onModuleClick,
  onSettings,
}) {
  const { t, locale } = useAppStrings();
  const activity = ACTIVITY_TONE[card.activityLevel] || ACTIVITY_TONE.normal;
  const roleKey = String(card.myRole || '').toLowerCase();
  const roleLabelKey = ROLE_LABEL[roleKey];
  const lastActivityTime = formatDeptRelativeTime(card.lastActivityAt, t, locale);
  const [gradStart, gradEnd] = pickGrad(card.id);
  const channelTags = Array.isArray(card.channelTags) ? card.channelTags : [];

  const stop = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(card.id, card.raw)}
      onKeyDown={(event) => event.key === 'Enter' && onOpen?.(card.id, card.raw)}
      className={`${FIGMA_WS_TEAM_CARD} group`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-sm font-extrabold text-white shadow-md"
          style={{
            background: `linear-gradient(135deg, ${gradStart}, ${gradEnd})`,
            boxShadow: `0 4px 14px ${gradStart}44`,
          }}
        >
          {card.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h3 className="truncate text-base font-bold text-foreground">{card.name}</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide ${activity.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${activity.dot}`} />
                  {t(activity.labelKey)}
                </span>
              </div>
              {roleLabelKey ? (
                <span className="mt-1 inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary">
                  {t(roleLabelKey)}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={(event) => {
                  stop(event);
                  onToggleStar?.(card.id);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted ${
                  starred ? 'text-amber-500' : ''
                }`}
                aria-label={starred ? t('workspace.deptUnpin') : t('workspace.deptPin')}
              >
                {starred ? <Star size={14} fill="currentColor" /> : <Pin size={14} />}
              </button>
              {onSettings ? (
                <button
                  type="button"
                  onClick={(event) => {
                    stop(event);
                    onSettings?.(card.raw);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary"
                  aria-label={t('workspace.deptActionSettings')}
                >
                  <Settings size={14} />
                </button>
              ) : null}
              <ChevronRight
                size={14}
                className="text-muted-foreground transition group-hover:text-primary"
              />
            </div>
          </div>
          {card.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
          ) : card.teamNames?.length ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {t('workspace.teamsInDepartment', { count: card.teamCount })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users size={11} />
          {card.memberCount} {t('workspace.members')}
        </span>
        {card.onlineCount > 0 ? (
          <span className="flex items-center gap-1 font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {card.onlineCount} {t('workspace.online')}
          </span>
        ) : null}
        {card.teamCount > 0 ? (
          <span className="flex items-center gap-1">
            <Activity size={11} />
            {card.teamCount} {t('workspace.deptTeamsShort')}
          </span>
        ) : null}
        {card.activeTasks > 0 ? (
          <span className="ml-auto flex items-center gap-1">
            <ClipboardList size={11} />
            {card.activeTasks} {t('workspace.tasks')}
          </span>
        ) : null}
      </div>

      {channelTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {channelTags.map((ch, chIdx) => (
            <span
              key={`${card.id}-ch-${chIdx}-${ch}`}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[0.625rem] text-muted-foreground"
            >
              <Hash size={9} />
              {ch}
            </span>
          ))}
        </div>
      ) : null}

      {card.lastActivityLabel ? (
        <p className="truncate rounded-lg border border-border bg-background px-2.5 py-2 text-[0.6875rem] text-muted-foreground">
          {card.lastActivityLabel}
          {lastActivityTime ? ` · ${lastActivityTime}` : ''}
        </p>
      ) : null}

      {(card.deptUnread > 0 || card.deptVoiceLive) && (
        <div className="flex flex-wrap gap-1.5">
          {card.deptUnread > 0 ? (
            <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-[0.625rem] font-semibold text-orange-600 dark:text-orange-400">
              {t('workspace.deptUnreadBadge', { count: card.deptUnread })}
            </span>
          ) : null}
          {card.totalUnread > card.deptUnread ? (
            <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[0.625rem] font-medium text-orange-600/80 dark:text-orange-400/80">
              {t('workspace.deptUnreadFromTeams', {
                count: Math.max(0, (card.totalUnread || 0) - (card.deptUnread || 0)),
              })}
            </span>
          ) : null}
          {card.deptVoiceLive ? (
            <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[0.625rem] font-semibold text-success">
              {t('workspace.deptVoiceLiveDept', { count: card.deptVoiceParticipants || 0 })}
            </span>
          ) : null}
        </div>
      )}

      {onModuleClick ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {[
            {
              module: 'announcement',
              icon: MessageCircle,
              label: t('workspace.moduleAnnouncement'),
              badge: card.deptUnread || 0,
              color: 'text-primary',
            },
            {
              module: 'members',
              icon: Users,
              label: t('workspace.moduleMembers'),
              badge: 0,
              color: 'text-sky-600 dark:text-sky-400',
            },
            {
              module: 'documents',
              icon: FileText,
              label: t('workspace.moduleDocs'),
              badge: 0,
              color: 'text-violet-500 dark:text-violet-400',
            },
            {
              module: 'calendar',
              icon: Calendar,
              label: t('workspace.moduleCalendar'),
              badge: 0,
              color: 'text-amber-600 dark:text-amber-400',
            },
            {
              module: 'meetings',
              icon: Video,
              label: t('workspace.moduleMeetings'),
              badge: 0,
              color: 'text-success',
            },
          ].map((btn) => (
            <button
              key={btn.module}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onModuleClick(card.id, btn.module, card.raw);
              }}
              className="relative flex flex-col items-center justify-center gap-1 rounded-[10px] bg-muted px-1.5 py-2.5 text-[0.6875rem] font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary hover:shadow-sm"
            >
              {btn.badge > 0 ? (
                <span className="absolute right-1.5 top-1 min-w-[15px] rounded-full bg-primary px-1 text-[0.5rem] font-bold text-primary-foreground">
                  {btn.badge > 99 ? '99+' : btn.badge}
                </span>
              ) : null}
              <btn.icon size={15} className={btn.color} />
              {btn.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

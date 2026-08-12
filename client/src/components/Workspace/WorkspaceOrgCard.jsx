import { useState } from 'react';
import { ChevronRight, Clock, Crown, Globe, Hash, Lock, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { orgRecordId } from '../../utils/orgListUtils';
import { FIGMA_WS_CARD, FIGMA_WS_CARD_AVATAR } from './figmaWorkspaceClasses';

const ROLE_STYLE = {
  owner: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', labelKey: 'workspace.roleOwnerVi' },
  admin: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', labelKey: 'workspace.roleAdminVi' },
  manager: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', labelKey: 'workspace.roleManagerVi' },
  lead: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', labelKey: 'workspace.roleLeadVi' },
  member: { color: '#10B981', bg: 'rgba(16,185,129,0.12)', labelKey: 'workspace.roleMemberVi' },
  guest: { color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)', labelKey: 'workspace.roleGuestVi' },
};

const PLAN_STYLE = {
  enterprise: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  business: { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  starter: { color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
};

const GRAD_PAIRS = [
  ['#1D4ED8', '#3B82F6'],
  ['#7C3AED', '#A78BFA'],
  ['#D97706', '#FBBF24'],
  ['#059669', '#34D399'],
  ['#DC2626', '#F87171'],
];

function pickGrad(seed) {
  const n = String(seed || '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRAD_PAIRS[n % GRAD_PAIRS.length];
}

function normalizeTeams(org, gradStart) {
  if (Array.isArray(org.teams) && org.teams.length) {
    return org.teams.slice(0, 4).map((team) => {
      if (typeof team === 'string') return { name: team, color: gradStart };
      return { name: team.name || team.title || 'Team', color: team.color || gradStart };
    });
  }
  if (Array.isArray(org.teamPreview) && org.teamPreview.length) {
    return org.teamPreview.slice(0, 4).map((team) => ({
      name: team.name || String(team),
      color: team.color || gradStart,
    }));
  }
  return [];
}

function formatJoinedAt(org, locale) {
  const raw = org.joinedAt || org.createdAt || org.membershipCreatedAt || '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    month: '2-digit',
    year: 'numeric',
  });
}

function formatRelativeActivity(raw, t, locale) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('workspace.relNow');
  if (minutes < 60) return `${minutes}p`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    month: '2-digit',
    year: 'numeric',
  });
}

function titleCasePlan(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export default function WorkspaceOrgCard({ org, onEnter }) {
  const { t, locale } = useAppStrings();
  const [hovered, setHovered] = useState(false);
  const id = orgRecordId(org);
  const name = org.name || org.title || 'Organization';
  const initial = String(org.initial || name).trim().charAt(0).toUpperCase() || 'O';
  const roleKey = String(org.myRole || org.role || 'member').toLowerCase();
  const role = ROLE_STYLE[roleKey] || ROLE_STYLE.member;
  const rawPlan = org.plan || org.subscriptionPlan || org.billingPlan || '';
  const planKey = rawPlan ? String(rawPlan).toLowerCase() : '';
  const plan = PLAN_STYLE[planKey] || null;
  const planLabel = titleCasePlan(rawPlan);
  const [gradStart, gradEnd] = pickGrad(id || name);
  const isPublic = String(org.visibility || org.type || '').toLowerCase() === 'public';
  const memberRaw = org.memberCount ?? org.membersCount ?? org.totalMembers;
  const onlineRaw = org.onlineNow ?? org.onlineCount;
  const membersKnown = memberRaw !== undefined && memberRaw !== null;
  const onlineKnown = onlineRaw !== undefined && onlineRaw !== null;
  const members = membersKnown ? Number(memberRaw) || 0 : 0;
  const online = onlineKnown ? Number(onlineRaw) || 0 : 0;
  const teamRaw = org.teamCount ?? org.teamsCount ?? org.totalTeams;
  const teamCountKnown = teamRaw !== undefined && teamRaw !== null;
  const teamCount =
    (teamCountKnown ? Number(teamRaw) || 0 : 0) ||
    (Array.isArray(org.teams) ? org.teams.length : 0);
  const hasStructureMetric = teamCountKnown || (Array.isArray(org.teams) && org.teams.length > 0);
  const channelCount = Number(org.channelCount ?? org.channelsCount ?? org.totalChannels ?? 0) || 0;
  const pendingReviews = Number(org.pendingReviews || 0);
  const unread = Number(org.unreadCount ?? org.unread ?? org.unreadTotal ?? 0) + pendingReviews;
  const teams = normalizeTeams(org, gradStart);
  const joinedAt = formatJoinedAt(org, locale);
  const displayDescription =
    org.description ||
    org.summary ||
    org.tagline ||
    (teamCount > 0
      ? t('workspace.teamsProjectsMembers', { teams: teamCount, members })
      : t('workspace.membersInOrg', { members }));
  const lastActivity =
    org.lastActivity ||
    org.recentActivity ||
    (teamCount > 0
      ? t('workspace.structureSummary', {
          teams: teamCount,
          channels: channelCount > 0 ? t('workspace.structureChannels', { channels: channelCount }) : '',
        })
      : t('workspace.orgReady'));
  const lastActivityTime =
    org.lastActivityTime ||
    org.activityTime ||
    formatRelativeActivity(org.updatedAt || org.createdAt || org.joinedAt, t, locale);
  const cardDescription =
    !membersKnown && !hasStructureMetric && !org.description && !org.summary && !org.tagline
      ? t('workspace.syncingData')
      : displayDescription;
  const activityText =
    !membersKnown && !hasStructureMetric && !org.lastActivity && !org.recentActivity
      ? t('workspace.syncingData')
      : lastActivity;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEnter(org)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter(org)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={FIGMA_WS_CARD}
      style={{
        borderColor: hovered ? `${gradStart}50` : undefined,
        boxShadow: hovered ? `0 8px 28px ${gradStart}14, var(--shadow-md)` : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={FIGMA_WS_CARD_AVATAR}
          style={{
            background: `linear-gradient(135deg, ${gradStart}, ${gradEnd})`,
            boxShadow: `0 4px 14px ${gradStart}44`,
          }}
        >
          {roleKey === 'owner' ? <Crown size={20} fill="currentColor" /> : initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-base font-bold text-foreground">{name}</h3>
            {isPublic ? (
              <Globe size={12} className="shrink-0 text-muted-foreground/50" />
            ) : (
              <Lock size={12} className="shrink-0 text-muted-foreground/50" />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs leading-relaxed text-muted-foreground">
            {cardDescription}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {unread > 0 ? (
            <span
              className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[0.625rem] font-bold text-white"
              style={{ background: gradStart }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
          {plan ? (
            <span
              className="rounded px-1.5 py-px text-[0.5625rem] font-bold uppercase tracking-wider"
              style={{ background: plan.bg, color: plan.color }}
            >
              {planLabel || planKey}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users size={12} />
          {membersKnown
            ? `${members} ${t('workspace.members')}`
            : t('workspace.loading')}
        </span>
        {teamCount > 0 ? (
          <span className="flex items-center gap-1">
            <Hash size={12} />
            {teamCount} teams
          </span>
        ) : null}
        {onlineKnown && online > 0 ? (
          <span className="flex items-center gap-1 font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {online} {t('workspace.online')}
          </span>
        ) : null}
        <span
          className="ml-auto rounded px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider"
          style={{ background: role.bg, color: role.color }}
        >
          {t(role.labelKey)}
        </span>
      </div>

      {teams.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {teams.map((team) => (
            <span
              key={team.name}
              className="rounded-md px-2.5 py-1 text-[0.6875rem] font-semibold"
              style={{
                background: `${team.color}18`,
                color: team.color,
              }}
            >
              {team.name}
            </span>
          ))}
        </div>
      ) : null}

      {activityText ? (
        <div
          className="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2"
          style={{ background: `${gradStart}08`, borderColor: `${gradStart}18` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: gradStart }} />
          <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground">
            {activityText}
          </span>
          {lastActivityTime ? (
            <span className="shrink-0 text-[0.65rem] text-muted-foreground">{lastActivityTime}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[0.6875rem] text-muted-foreground">
          <Clock size={11} className="shrink-0" />
          {joinedAt ? t('workspace.joinedFrom', { date: joinedAt }) : t('workspace.workspaceAccess')}
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold"
          style={{ color: hovered ? gradStart : 'var(--color-primary, #2563eb)' }}
        >
          {t('workspace.enter')}
          <ChevronRight size={15} />
        </span>
      </div>
    </div>
  );
}

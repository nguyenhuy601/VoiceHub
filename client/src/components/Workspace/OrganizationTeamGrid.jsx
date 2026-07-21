import { useMemo, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Hash,
  Lock,
  MessageCircle,
  Mic,
  Plus,
  Search,
  Shield,
  Users,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { displayDepartmentName } from '../../utils/orgEntityDisplay';
import { uniqueTeamsForHub } from '../../utils/orgDepartmentHubUtils';
import { channelsForTeam } from '../../utils/orgChannelScope';
import { FIGMA_WS_TEAM_CARD, FIGMA_WS_TEAM_GRID } from './figmaWorkspaceClasses';

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

function memberInitials(member) {
  const name = member?.name || member?.displayName || member?.fullName || member?.email || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function collectTeamsFromBranches(branches = []) {
  const rows = [];
  branches.forEach((branch) => {
    (branch?.divisions || []).forEach((division) => {
      (division?.departments || []).forEach((department) => {
        (department?.teams || []).forEach((team) => {
          rows.push({
            ...team,
            branchId: branch._id || branch.id,
            branchName: branch.name,
            divisionId: division._id || division.id,
            divisionName: division.name,
            department: team.department || department._id || department.id,
            departmentId: department._id || department.id,
            departmentName: department.name,
          });
        });
      });
    });
  });
  return rows;
}

function buildFallbackDepartmentCards({ departments = [], channels = [] }) {
  return departments.map((department, idx) => ({
    ...department,
    _id: department._id || department.id || `department-${idx}`,
    departmentId: department._id || department.id,
    departmentName: department.name,
    channels: channels.filter((ch) => String(ch.department || '') === String(department._id || department.id)),
  }));
}

function collectTeamMemberIds(team) {
  const ids = new Set();
  (team?.members || []).forEach((member) => {
    const id =
      member == null || member === ''
        ? ''
        : typeof member === 'object'
          ? String(member._id || member.id || member.userId || '')
          : String(member);
    if (id) ids.add(id);
  });
  const leader =
    team?.leader == null || team?.leader === ''
      ? ''
      : typeof team.leader === 'object'
        ? String(team.leader._id || team.leader.id || team.leader.userId || '')
        : String(team.leader);
  if (leader) ids.add(leader);
  return ids;
}

function dedupeChannelTags(textChannels) {
  const seen = new Set();
  const tags = [];
  for (const ch of textChannels) {
    const label = `#${String(ch.name || ch.slug || 'channel').trim() || 'channel'}`;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(label);
    if (tags.length >= 3) break;
  }
  return tags;
}

function buildTeamCards({
  branches = [],
  departments = [],
  teams = [],
  channels = [],
  locale = 'vi',
  filterDepartmentId = '',
}) {
  const treeTeams = collectTeamsFromBranches(branches);
  const rawSource = treeTeams.length
    ? treeTeams
    : teams.length
      ? teams
      : buildFallbackDepartmentCards({ departments, channels });

  const deptFilter = String(filterDepartmentId || '').trim();
  const scopedSource = deptFilter
    ? rawSource.filter((item) => {
        const itemDeptId = String(item.departmentId || item.department || '');
        return itemDeptId === deptFilter;
      })
    : rawSource;

  const source = uniqueTeamsForHub(scopedSource);

  return source.map((item, idx) => {
    const id = item._id || item.id || item.departmentId || `team-${idx}`;
    const rawName = item.name || item.departmentName || 'Team';
    const name = displayDepartmentName(rawName, locale);
    const initial = String(name).trim().charAt(0).toUpperCase() || 'T';
    const [gradStart, gradEnd] = pickGrad(id);
    const teamChannels = item._id || item.id
      ? channelsForTeam(channels, id)
      : [];
    const textChannels = teamChannels.filter(
      (ch) => String(ch.type || 'text').toLowerCase() !== 'voice'
    );
    const role = String(item.myRole || item.role || item.membershipRole || '').trim();
    const membersRaw = Array.isArray(item.members)
      ? item.members
      : Array.isArray(item.memberAvatars)
        ? item.memberAvatars
        : [];
    const avatars = membersRaw.slice(0, 3).map((member, avatarIdx) => ({
      id: member._id || member.id || `${id}-member-${avatarIdx}`,
      name: member.name || member.displayName || member.fullName || member.email || '',
      initials: member.initials || memberInitials(member),
      color: pickGrad(member._id || member.id || member.email || avatarIdx)[0],
    }));
    const memberIds = collectTeamMemberIds(item);
    const memberCount =
      item.memberCount ??
      item.membersCount ??
      item.totalMembers ??
      (memberIds.size || (Array.isArray(item.members) ? item.members.length : 0));

    return {
      id,
      name,
      description: item.description || item.departmentName || '',
      initial,
      gradStart,
      gradEnd,
      role,
      type: item.type || item.visibility || 'private',
      members: Number(memberCount) || 0,
      avatars,
      online: Number(item.onlineCount ?? item.onlineNow ?? 0) || 0,
      channels: dedupeChannelTags(textChannels),
      unreadChat:
        Number(item.unreadChat ?? item.unreadCount ?? 0) ||
        teamChannels.reduce((sum, ch) => sum + Number(ch.unreadCount || ch.unread || 0), 0),
      unreadTask: Number(item.unreadTask ?? 0) || 0,
      activeTasks: Number(item.activeTasks ?? item.taskCount ?? item.tasksCount ?? 0) || 0,
      recentActivity: item.recentActivity || item.lastActivity || '',
      activityTime: item.activityTime || item.lastActivityTime || '',
      raw: item,
    };
  });
}

export default function OrganizationTeamGrid({
  organizationName = '',
  departmentName = '',
  filterDepartmentId = '',
  branches = [],
  departments = [],
  teams = [],
  channels = [],
  onBack,
  onCreateTeam,
  onSelectTeam,
  onModuleClick,
}) {
  const { t, locale } = useAppStrings();
  const [search, setSearch] = useState('');
  const cards = useMemo(
    () =>
      buildTeamCards({
        branches,
        departments,
        teams,
        channels,
        locale,
        filterDepartmentId,
      }),
    [branches, departments, teams, channels, locale, filterDepartmentId]
  );
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((card) => {
      const haystack = [card.name, card.description, card.channels.join(' '), card.recentActivity]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cards, search]);
  const totalOnline = cards.reduce((sum, card) => sum + Number(card.online || 0), 0);
  const totalTasks = cards.reduce((sum, card) => sum + Number(card.activeTasks || 0), 0);
  const primaryRole = cards.find((card) => card.role)?.role || t('workspace.memberRole');
  const orgInitial = String(organizationName || 'VoiceHub').trim().charAt(0).toUpperCase() || 'V';
  const metrics = [
    {
      key: 'teams',
      icon: Users,
      value: cards.length,
      label: t('workspace.yourTeams'),
      tone: 'text-primary bg-primary/10',
    },
    {
      key: 'online',
      icon: Activity,
      value: totalOnline,
      label: t('workspace.onlineNowLabel'),
      tone: 'text-success bg-success/10',
    },
    {
      key: 'tasks',
      icon: ClipboardList,
      value: totalTasks,
      label: t('workspace.activeTasks'),
      tone: 'text-warning bg-warning/10',
    },
    {
      key: 'role',
      icon: Shield,
      value: primaryRole,
      label: t('workspace.yourRole'),
      tone: 'text-destructive bg-destructive/10',
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-4 shadow-xs backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                aria-label={t('workspace.backToDepartments')}
              >
                <ChevronLeft size={20} />
              </button>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-md">
                {orgInitial}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-bold text-foreground">
                {departmentName || organizationName || t('workspace.organization')}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {departmentName
                  ? t('workspace.teamHubSubtitle', {
                      org: organizationName || t('workspace.organization'),
                      teams: cards.length,
                      online: totalOnline,
                    })
                  : t('workspace.orgSubtitle', { teams: cards.length, online: totalOnline })}
                {totalTasks > 0 ? t('workspace.orgSubtitleTasks', { tasks: totalTasks }) : ''}
              </p>
            </div>
          </div>
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('workspace.searchTeams')}
              className="h-10 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
            />
          </div>
          {onCreateTeam ? (
            <button
              type="button"
              onClick={onCreateTeam}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg"
            >
              <Plus size={16} />
              {t('workspace.createTeam')}
            </button>
          ) : null}
        </div>
      </div>
      <div className="px-6 py-6">
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition group-hover:scale-105 ${item.tone}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold leading-none text-foreground">{item.value}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{item.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredCards.length === 0 ? (
          <div className="mb-4 flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
            <Users size={40} className="mb-4 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">
              {search ? t('workspace.noMatchingTeams') : t('workspace.noTeamsYet')}
            </p>
            {onCreateTeam && !search ? (
              <button
                type="button"
                onClick={onCreateTeam}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
              >
                <Plus size={16} />
                {t('workspace.createFirstTeam')}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={FIGMA_WS_TEAM_GRID}>
          {filteredCards.map((card) => (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTeam?.(card.raw, card.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelectTeam?.(card.raw, card.id)}
              className={`${FIGMA_WS_TEAM_CARD} group`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-sm font-extrabold text-white shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${card.gradStart}, ${card.gradEnd})`,
                    boxShadow: `0 4px 14px ${card.gradStart}44`,
                  }}
                >
                  {card.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-base font-bold text-foreground">{card.name}</h3>
                        {String(card.type).toLowerCase() === 'public' ? null : (
                          <Lock size={12} className="shrink-0 text-muted-foreground/50" />
                        )}
                      </div>
                      {card.role ? (
                        <span className="mt-1 inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary">
                          {card.role}
                        </span>
                      ) : null}
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                  {card.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.description}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {card.avatars.length > 0 ? (
                  <span className="flex -space-x-2">
                    {card.avatars.map((avatar) => (
                      <span
                        key={avatar.id}
                        title={avatar.name}
                        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface text-[0.55rem] font-bold"
                        style={{ background: `${avatar.color}18`, color: avatar.color }}
                      >
                        {avatar.initials}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {card.members} {t('workspace.members')}
                </span>
                {card.online > 0 ? (
                  <span className="flex items-center gap-1 font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {card.online} {t('workspace.online')}
                  </span>
                ) : null}
                {card.activeTasks > 0 ? (
                  <span className="ml-auto flex items-center gap-1">
                    <ClipboardList size={11} />
                    {card.activeTasks} {t('workspace.tasks')}
                  </span>
                ) : null}
              </div>

              {card.channels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {card.channels.map((ch, chIdx) => (
                    <span
                      key={`${card.id}-ch-${chIdx}-${ch}`}
                      className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[0.625rem] text-muted-foreground"
                    >
                      <Hash size={9} />
                      {ch.replace(/^#/, '')}
                    </span>
                  ))}
                </div>
              ) : null}

              {card.recentActivity ? (
                <p className="truncate rounded-lg border border-border bg-background px-2.5 py-2 text-[0.6875rem] text-muted-foreground">
                  {card.recentActivity}
                  {card.activityTime ? ` · ${card.activityTime}` : ''}
                </p>
              ) : null}

              {onModuleClick ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { module: 'chat', icon: MessageCircle, label: t('workspace.moduleChat'), badge: card.unreadChat, color: 'text-primary' },
                    { module: 'voice', icon: Mic, label: t('workspace.moduleVoice'), badge: 0, color: 'text-success' },
                    { module: 'tasks', icon: ClipboardList, label: t('workspace.moduleTask'), badge: card.unreadTask, color: 'text-warning' },
                    { module: 'documents', icon: FileText, label: t('workspace.moduleDocs'), badge: 0, color: 'text-violet-500 dark:text-violet-400' },
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
                          {btn.badge}
                        </span>
                      ) : null}
                      <btn.icon size={15} className={btn.color} />
                      {btn.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {onCreateTeam && !search ? (
            <button
              type="button"
              onClick={onCreateTeam}
              className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface/60 p-4 text-center text-muted-foreground transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface hover:text-primary hover:shadow-md"
            >
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-current">
                <Plus size={22} />
              </span>
              <span className="text-base font-bold text-foreground">{t('workspace.addTeamProject')}</span>
              <span className="mt-1 text-xs leading-relaxed">{t('workspace.addTeamProjectDesc')}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

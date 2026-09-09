import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Link2, Plus, Search, ShieldCheck, Users, Zap } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import OrgPickerCard from './OrgPickerCard';
import { FIGMA_WS_GRID, FIGMA_WS_INNER, FIGMA_WS_PAGE, FIGMA_WS_TITLE } from './figmaOrganizationClasses';

const PRIMARY_ROLE_KEYS = {
  owner: 'workspace.roleOwner',
  admin: 'workspace.roleAdmin',
  lead: 'workspace.roleLead',
  member: 'workspace.roleMember',
};

export default function OrgPickerView({
  organizations = [],
  onEnterOrg,
  onCreateOrg,
  quickInviteValue = '',
  onQuickInviteChange,
  onQuickInviteSubmit,
  joiningQuickInvite = false,
  joinReviewCountByOrgId = {},
}) {
  const { t } = useAppStrings();
  const [search, setSearch] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((org) => {
      const name = String(org.name || org.title || '').toLowerCase();
      const desc = String(org.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [organizations, search]);

  const totalOnline = useMemo(
    () => organizations.reduce((sum, org) => sum + Number(org.onlineNow ?? org.onlineCount ?? 0), 0),
    [organizations]
  );

  const totalTeams = useMemo(
    () =>
      organizations.reduce((sum, org) => {
        const numeric = Number(org.teamCount ?? org.teamsCount ?? org.totalTeams ?? 0);
        if (Number.isFinite(numeric) && numeric > 0) return sum + numeric;
        if (Array.isArray(org.teams)) return sum + org.teams.length;
        return sum;
      }, 0),
    [organizations]
  );

  const totalUnread = useMemo(
    () =>
      organizations.reduce((sum, org) => {
        const id = org._id || org.id;
        return (
          sum +
          Number(org.unreadCount ?? org.unread ?? org.unreadTotal ?? org.pendingReviews ?? 0) +
          Number(joinReviewCountByOrgId[id] || 0)
        );
      }, 0),
    [organizations, joinReviewCountByOrgId]
  );

  const primaryRole = useMemo(() => {
    const priority = ['owner', 'admin', 'manager', 'lead', 'member', 'guest'];
    const roles = organizations.map((org) => String(org.myRole || org.role || 'member').toLowerCase());
    return priority.find((role) => roles.includes(role)) || 'member';
  }, [organizations]);

  const primaryRoleLabel = t(PRIMARY_ROLE_KEYS[primaryRole] || 'workspace.roleMember');

  const metricCards = [
    {
      key: 'orgs',
      icon: Building2,
      value: organizations.length,
      label: t('workspace.metricOrgs'),
      tone: 'text-primary bg-primary/10',
    },
    {
      key: 'online',
      icon: Users,
      value: totalOnline,
      label: t('workspace.onlineNowLabel'),
      tone: 'text-success bg-success/10',
    },
    {
      key: 'unread',
      icon: CheckCircle2,
      value: totalUnread,
      label: t('workspace.metricUnread'),
      tone: 'text-destructive bg-destructive/10',
    },
    {
      key: 'role',
      icon: ShieldCheck,
      value: primaryRoleLabel,
      label: t('workspace.metricPrimaryRole'),
      tone: 'text-warning bg-warning/10',
    },
  ];

  return (
    <div className={FIGMA_WS_PAGE}>
      <div className={FIGMA_WS_INNER}>
        <div className="sticky top-0 z-10 -mx-6 mb-5 flex min-h-14 items-center gap-3 border-b border-border bg-surface px-6 py-2 shadow-xs">
          <div className="min-w-0 shrink-0">
            <h1 className={`${FIGMA_WS_TITLE} text-base`}>{t('workspace.myOrganizations')}</h1>
            <p className="mt-0.5 whitespace-nowrap text-[0.6875rem] text-muted-foreground">
              {t('workspace.orgCount', { n: organizations.length })}
              {totalTeams > 0 ? (
                <>
                  {' '}
                  · {t('workspace.teamsProjects', { n: totalTeams })}
                </>
              ) : null}
              {totalOnline > 0 ? (
                <>
                  {' '}
                  · {totalOnline} {t('workspace.onlineNow')}
                </>
              ) : null}
            </p>
          </div>

          <div className="relative mx-auto min-w-[220px] flex-1 sm:max-w-[350px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('workspace.searchOrgs')}
              className="h-10 w-full rounded-lg border border-border bg-[var(--input-background)] pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
            />
          </div>

          <button
            type="button"
            onClick={onCreateOrg}
            className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary-hover px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25"
          >
            <Plus size={16} />
            {t('workspace.createOrg')}
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((item) => {
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
                  <div className="truncate text-xl font-bold leading-none text-foreground">{item.value}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{item.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? t('workspace.noMatchingOrgs') : t('workspace.noOrgsYet')}
            </p>
          </div>
        ) : (
          <div className={FIGMA_WS_GRID}>
            {filtered.map((org) => (
              <OrgPickerCard
                key={org._id || org.id}
                org={{
                  ...org,
                  pendingReviews: joinReviewCountByOrgId[org._id || org.id],
                }}
                onEnter={onEnterOrg}
              />
            ))}

            <button
              type="button"
              onClick={() => setJoinOpen((value) => !value)}
              className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface/60 p-5 text-center text-muted-foreground transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface hover:text-primary hover:shadow-md"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-current">
                <Link2 size={20} />
              </div>
              <h3 className="text-base font-bold text-foreground">{t('workspace.joinOrg')}</h3>
              <p className="mt-1 text-xs leading-relaxed">{t('workspace.joinOrgDesc')}</p>

              {joinOpen ? (
                <div className="mt-4 flex w-full max-w-[280px] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={quickInviteValue}
                    onChange={(e) => onQuickInviteChange?.(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onQuickInviteSubmit?.();
                    }}
                    placeholder={t('workspace.invitePlaceholder')}
                    className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none focus:border-primary"
                    autoFocus
                  />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={onQuickInviteSubmit}
                    onKeyDown={(e) => e.key === 'Enter' && onQuickInviteSubmit?.()}
                    aria-disabled={joiningQuickInvite || !quickInviteValue.trim()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover aria-disabled:pointer-events-none aria-disabled:opacity-50"
                  >
                    <Zap size={15} />
                    {joiningQuickInvite ? t('workspace.joining') : t('workspace.join')}
                  </span>
                </div>
              ) : null}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

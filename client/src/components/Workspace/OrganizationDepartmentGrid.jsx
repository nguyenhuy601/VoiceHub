import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { buildDepartmentHubCards } from '../../utils/buildDepartmentHubCard';
import { FIGMA_WS_GRID } from './figmaWorkspaceClasses';
import OrganizationDepartmentCard from './OrganizationDepartmentCard';

const FAVORITES_KEY = 'voicehub:dept-favorites';
const ACTIVITY_ORDER = { hot: 0, active: 1, normal: 2, quiet: 3 };

function loadFavoriteIds(organizationId) {
  if (!organizationId) return [];
  try {
    const raw = localStorage.getItem(`${FAVORITES_KEY}:${organizationId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveFavoriteIds(organizationId, ids) {
  if (!organizationId) return;
  try {
    localStorage.setItem(`${FAVORITES_KEY}:${organizationId}`, JSON.stringify(ids));
  } catch {
    // ignore quota errors
  }
}

export default function OrganizationDepartmentGrid({
  organizationId = '',
  organizationName = '',
  departments = [],
  teams = [],
  branches = [],
  channels = [],
  onlineUserIds = [],
  membershipScope = {},
  orgMyRole = '',
  onSelectDepartment,
  onDepartmentQuickAction,
  onDepartmentSettings,
  onCreateDepartment,
}) {
  const { t, locale } = useAppStrings();
  const [search, setSearch] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteIds(organizationId));

  useEffect(() => {
    setFavoriteIds(loadFavoriteIds(organizationId));
  }, [organizationId]);

  const cards = useMemo(
    () =>
      buildDepartmentHubCards({
        departments,
        teams,
        branches,
        channels,
        onlineUserIds,
        membershipScope,
        orgMyRole,
        locale,
      }),
    [
      departments,
      teams,
      branches,
      channels,
      onlineUserIds,
      membershipScope,
      orgMyRole,
      locale,
    ]
  );

  const favoriteSet = useMemo(() => new Set(favoriteIds.map(String)), [favoriteIds]);

  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const aStar = favoriteSet.has(String(a.id)) ? 0 : 1;
      const bStar = favoriteSet.has(String(b.id)) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;
      const aAct = ACTIVITY_ORDER[a.activityLevel] ?? 9;
      const bAct = ACTIVITY_ORDER[b.activityLevel] ?? 9;
      if (aAct !== bAct) return aAct - bAct;
      if (b.unread !== a.unread) return b.unread - a.unread;
      return a.name.localeCompare(b.name, locale === 'en' ? 'en' : 'vi');
    });
  }, [cards, favoriteSet, locale]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCards;
    return sortedCards.filter((card) => {
      const haystack = [
        card.name,
        card.description,
        card.headName,
        card.teamNames.join(' '),
        card.lastActivityLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sortedCards, search]);

  const totalTeams = cards.reduce((sum, card) => sum + Number(card.teamCount || 0), 0);
  const totalOnline = cards.reduce((sum, card) => sum + Number(card.onlineCount || 0), 0);
  const totalUnread = cards.reduce((sum, card) => sum + Number(card.unread || 0), 0);
  const orgInitial = String(organizationName || 'VoiceHub').trim().charAt(0).toUpperCase() || 'V';

  const handleToggleStar = useCallback(
    (departmentId) => {
      const id = String(departmentId);
      setFavoriteIds((prev) => {
        const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
        saveFavoriteIds(organizationId, next);
        return next;
      });
    },
    [organizationId]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-4 shadow-xs backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-md">
              {orgInitial}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-bold text-foreground">
                {organizationName || t('workspace.organization')}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t('workspace.deptHubSubtitle', {
                  departments: cards.length,
                  teams: totalTeams,
                })}
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
              placeholder={t('workspace.searchDepartments')}
              className="h-10 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
            />
          </div>
          {onCreateDepartment ? (
            <button
              type="button"
              onClick={onCreateDepartment}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg"
            >
              <Plus size={16} />
              {t('workspace.createDepartment')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:scale-105">
              <Building2 size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold leading-none text-foreground">{cards.length}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{t('workspace.yourDepartments')}</div>
            </div>
          </div>
          <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success transition group-hover:scale-105">
              <Users size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold leading-none text-foreground">{totalTeams}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{t('workspace.yourTeams')}</div>
            </div>
          </div>
          <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 transition group-hover:scale-105">
              <Users size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold leading-none text-foreground">{totalOnline}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{t('workspace.onlineNowLabel')}</div>
            </div>
          </div>
          <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 transition group-hover:scale-105">
              <Building2 size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-lg font-bold leading-none text-foreground">{totalUnread}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{t('workspace.deptUnreadTotal')}</div>
            </div>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">{t('workspace.pickDepartmentHint')}</p>

        {filteredCards.length === 0 ? (
          <div className="mb-4 flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
            <Building2 size={40} className="mb-4 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">
              {search ? t('workspace.noMatchingDepartments') : t('workspace.noDepartmentsYet')}
            </p>
          </div>
        ) : (
          <div className={FIGMA_WS_GRID}>
            {filteredCards.map((card) => (
              <OrganizationDepartmentCard
                key={card.id}
                card={card}
                starred={favoriteSet.has(String(card.id))}
                onToggleStar={handleToggleStar}
                onOpen={onSelectDepartment}
                onQuickAction={onDepartmentQuickAction}
                onSettings={onDepartmentSettings}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

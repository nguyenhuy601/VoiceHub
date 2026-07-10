import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Building2,
  MessageSquare,
  Phone,
  ListTodo,
  FolderOpen,
  BarChart3,
  Shield,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { ADMIN_RBAC_PERMISSION_GROUPS } from '../../config/adminRbacCatalog';

const GROUP_ICONS = {
  'user-management': Users,
  'org-structure': Building2,
  chat: MessageSquare,
  'voice-meeting': Phone,
  'task-management': ListTodo,
  file: FolderOpen,
  report: BarChart3,
  system: Shield,
};

function groupKeys(group) {
  const keys = [];
  for (const section of group.sections || []) {
    for (const perm of section.permissions || []) {
      keys.push(`${perm.resource}:${perm.action}`);
    }
  }
  return keys;
}

function countSelected(keys, draft) {
  return keys.reduce((n, key) => n + (draft?.[key] ? 1 : 0), 0);
}

function selectionState(selected, total) {
  if (selected <= 0) return 'none';
  if (selected >= total) return 'all';
  return 'partial';
}

/**
 * Enterprise RBAC permission editor — sidebar nhóm + bảng quyền nhóm đang chọn.
 * permDraft: { 'resource:action': boolean }
 */
export default function PermissionEditorGrid({
  permDraft,
  onToggle,
  onSetMany,
  editable = true,
  roleName = '',
  roleScope = '',
  compactSummary = false,
}) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const isEn = locale === 'en';
  const [activeGroupId, setActiveGroupId] = useState(ADMIN_RBAC_PERMISSION_GROUPS[0]?.id || '');
  const [query, setQuery] = useState('');
  const [expandedSidebar, setExpandedSidebar] = useState(() => new Set());

  const groupsMeta = useMemo(
    () =>
      ADMIN_RBAC_PERMISSION_GROUPS.map((group) => {
        const keys = groupKeys(group);
        const selected = countSelected(keys, permDraft);
        return {
          group,
          keys,
          total: keys.length,
          selected,
          state: selectionState(selected, keys.length),
          label: isEn ? group.label : group.labelVi,
        };
      }),
    [permDraft, isEn]
  );

  const totalSelected = useMemo(
    () => groupsMeta.reduce((sum, g) => sum + g.selected, 0),
    [groupsMeta]
  );
  const totalAll = useMemo(() => groupsMeta.reduce((sum, g) => sum + g.total, 0), [groupsMeta]);

  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!q) return groupsMeta;
    return groupsMeta.filter(({ group, label }) => {
      if (label.toLowerCase().includes(q)) return true;
      return (group.sections || []).some((section) =>
        (section.permissions || []).some(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            `${p.resource}:${p.action}`.includes(q)
        )
      );
    });
  }, [groupsMeta, q]);

  useEffect(() => {
    if (!filteredGroups.length) return;
    if (!filteredGroups.some((g) => g.group.id === activeGroupId)) {
      setActiveGroupId(filteredGroups[0].group.id);
    }
  }, [filteredGroups, activeGroupId]);

  const activeMeta = groupsMeta.find((g) => g.group.id === activeGroupId) || filteredGroups[0];
  const activeGroup = activeMeta?.group;

  const visibleSections = useMemo(() => {
    if (!activeGroup) return [];
    return (activeGroup.sections || [])
      .map((section) => {
        const perms = (section.permissions || []).filter((p) => {
          if (!q) return true;
          return (
            p.label.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            `${p.resource}:${p.action}`.includes(q)
          );
        });
        return { ...section, permissions: perms };
      })
      .filter((s) => s.permissions.length > 0);
  }, [activeGroup, q]);

  const setMany = (keys, value) => {
    if (!editable) return;
    if (typeof onSetMany === 'function') {
      onSetMany(keys, value);
      return;
    }
    for (const key of keys) {
      const current = Boolean(permDraft?.[key]);
      if (current !== value) onToggle?.(key);
    }
  };

  const selectAllGlobal = () => {
    const keys = groupsMeta.flatMap((g) => g.keys);
    setMany(keys, true);
  };

  const clearAllGlobal = () => {
    const keys = groupsMeta.flatMap((g) => g.keys);
    setMany(keys, false);
  };

  const toggleSidebarExpand = (groupId) => {
    setExpandedSidebar((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const sectionCols =
    visibleSections.length >= 2
      ? 'lg:grid-cols-2'
      : 'lg:grid-cols-1';

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/30">
      {/* Role summary */}
      <div
        className={`flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-muted/30 px-4 ${
          compactSummary ? 'py-2.5' : 'py-3'
        }`}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('adminRbac.summaryRole')}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {roleName?.trim() || t('adminRbac.summaryRoleUntitled')}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('adminRbac.summaryScope')}
          </p>
          <p className="text-sm font-medium text-foreground">{roleScope || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('adminRbac.summaryPermissions')}
          </p>
          <p className="text-sm font-medium text-foreground">
            {t('adminRbac.summarySelectedCount', { selected: totalSelected, total: totalAll })}
          </p>
        </div>
        {editable ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllGlobal}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted/50"
            >
              {t('adminRbac.selectAllPermissions')}
            </button>
            <button
              type="button"
              onClick={clearAllGlobal}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              {t('adminRbac.clearPermissions')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-[420px] lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="flex max-h-[min(70vh,640px)] flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('adminRbac.searchPermission')}
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-xs"
              />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {filteredGroups.map(({ group, selected, total, state, label }) => {
              const Icon = GROUP_ICONS[group.id] || Shield;
              const active = group.id === activeGroupId;
              const expanded = expandedSidebar.has(group.id);
              const selectedPerms = (group.sections || [])
                .flatMap((s) => s.permissions || [])
                .filter((p) => permDraft?.[`${p.resource}:${p.action}`]);

              return (
                <div key={group.id} className="mb-1">
                  <div
                    className={`flex items-stretch overflow-hidden rounded-lg border transition ${
                      active
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-transparent hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSidebarExpand(group.id)}
                      className="px-1.5 text-muted-foreground hover:text-foreground"
                      aria-label="expand"
                    >
                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveGroupId(group.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2 text-left"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                          state === 'all'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : state === 'partial'
                              ? 'bg-amber-500/20 text-amber-200'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">{label}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {selected}/{total}
                          {state === 'all' ? ` · ${t('adminRbac.groupStateAll')}` : null}
                          {state === 'partial' ? ` · ${t('adminRbac.groupStatePartial')}` : null}
                        </span>
                      </span>
                      {group.adminOnly ? (
                        <span className="shrink-0 rounded border border-amber-500/30 px-1 py-0.5 text-[9px] text-amber-200">
                          Admin
                        </span>
                      ) : null}
                    </button>
                  </div>
                  {expanded && selectedPerms.length ? (
                    <ul className="mb-1 ml-8 mt-1 space-y-0.5 border-l border-border/60 pl-2">
                      {selectedPerms.slice(0, 8).map((p) => (
                        <li key={`${p.resource}:${p.action}`} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400" />
                          <span className="truncate">{isEn ? p.label : p.description}</span>
                        </li>
                      ))}
                      {selectedPerms.length > 8 ? (
                        <li className="text-[10px] text-muted-foreground">+{selectedPerms.length - 8}</li>
                      ) : null}
                    </ul>
                  ) : null}
                  {expanded && !selectedPerms.length ? (
                    <p className="mb-1 ml-8 mt-1 text-[10px] text-muted-foreground">{t('adminRbac.groupNoneSelected')}</p>
                  ) : null}
                </div>
              );
            })}
            {!filteredGroups.length ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{t('adminRbac.noPermissionMatch')}</p>
            ) : null}
          </nav>
        </aside>

        {/* Detail panel */}
        <section className="flex max-h-[min(70vh,640px)] min-w-0 flex-col">
          {activeGroup && activeMeta ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {isEn ? activeGroup.label : activeGroup.labelVi}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({activeMeta.selected}/{activeMeta.total})
                    </span>
                  </h3>
                  {activeGroup.adminOnly ? (
                    <p className="text-[11px] text-amber-200/90">{t('adminRbac.systemAdminHint')}</p>
                  ) : null}
                </div>
                {editable ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMany(activeMeta.keys, true)}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted/50"
                    >
                      {t('adminRbac.selectGroupAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMany(activeMeta.keys, false)}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      {t('adminRbac.clearGroup')}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className={`flex-1 overflow-y-auto p-3 grid gap-3 ${sectionCols}`}>
                {visibleSections.map((section) => {
                  const sectionKeys = section.permissions.map((p) => `${p.resource}:${p.action}`);
                  const sectionSelected = countSelected(sectionKeys, permDraft);
                  const sectionAll = sectionSelected === sectionKeys.length && sectionKeys.length > 0;

                  return (
                    <div key={section.id} className="overflow-hidden rounded-lg border border-border bg-background/40">
                      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          {editable ? (
                            <input
                              type="checkbox"
                              checked={sectionAll}
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate = sectionSelected > 0 && !sectionAll;
                                }
                              }}
                              onChange={() => setMany(sectionKeys, !sectionAll)}
                              className="h-3.5 w-3.5 accent-emerald-500"
                            />
                          ) : null}
                          <span className="text-xs font-semibold text-foreground">
                            {isEn ? section.label : section.labelVi}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {sectionSelected}/{sectionKeys.length}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs">
                          <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="w-10 px-3 py-2">{t('adminRbac.colAccess')}</th>
                              <th className="px-3 py-2">{t('adminRbac.colPermissionName')}</th>
                              <th className="px-3 py-2">{t('adminRbac.colPermissionDesc')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.permissions.map((perm) => {
                              const key = `${perm.resource}:${perm.action}`;
                              const on = Boolean(permDraft?.[key]);
                              return (
                                <tr
                                  key={key}
                                  className={`border-t border-border/50 ${on ? 'bg-emerald-500/5' : ''}`}
                                >
                                  <td className="px-3 py-2 align-middle">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      disabled={!editable}
                                      onChange={() => editable && onToggle?.(key)}
                                      className="h-3.5 w-3.5 accent-emerald-500"
                                    />
                                  </td>
                                  <td className="px-3 py-2 font-medium text-foreground">{perm.label}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{perm.description}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {!visibleSections.length ? (
                  <p className="col-span-full px-2 py-8 text-center text-sm text-muted-foreground">
                    {t('adminRbac.noPermissionMatch')}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{t('adminRbac.noPermissionMatch')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

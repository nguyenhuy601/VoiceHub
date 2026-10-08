import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  List,
  Lock,
  MessageCircle,
  Plus,
  Settings,
  Shield,
  Users,
  GanttChart,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { useWorkspaceSuite, SUITE } from '../../context/WorkspaceSuiteContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useShellLayout } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import SidebarPositionFooter from './SidebarPositionFooter';
import {
  FIGMA_SIDEBAR,
  FIGMA_SIDEBAR_COLLAPSED,
  FIGMA_SIDEBAR_EXPANDED,
  FIGMA_SIDEBAR_EXPAND_BTN,
  FIGMA_SIDEBAR_FOOTER,
  FIGMA_SIDEBAR_NAV,
  FIGMA_SIDEBAR_SECTION_LABEL,
  FIGMA_SIDEBAR_SUITE_STRIP,
  SUITE_COLORS,
  figmaNavItemBg,
  figmaNavItemClass,
} from './figmaShellClasses';
import {
  getProjectMenuGroupLabelKey,
  getProjectsPostSelectNavItems,
  getProjectsPreSelectNavItems,
  normalizeProjectModule,
  PROJECT_MENU_GROUPS,
} from '../../utils/suiteNavConfig';
import {
  boardQueryFromSearch,
  buildProjectsModulePath,
  buildProjectsNewPath,
  buildProjectsPickerPath,
  getDefaultPathForSuite,
  resolveProjectOrganizationId,
  writeStoredLastOrganizationId,
} from '../../utils/suitePathUtils';
import {
  fetchProjectHubProject,
  fetchProjectHubRoleCatalog,
} from '../../features/projects/hub/useProjectHubQueries';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { coerceDeliveryPhase } from '../../utils/projectPhaseNav';
import { isAiHitlIncomplete } from '../../features/projects/phase1/aiHitl/aiHitlNavState';
import { loadLinkedPackForAiNav } from '../../features/projects/phase1/aiHitl/loadLinkedPackForAiNav';
import { resolveDeliveryRoleBadges } from './profileDeliveryRoleBadge';

const COLLAPSE_KEY = 'voicehub:sidebar-collapsed';

/** Strip catalog prefix «Dự án —» when showing role chips. */
function shortProjectRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
}

function humanizeRoleKey(key) {
  return String(key || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build display chips for the viewer's project roles (footer).
 * Prefers delivery badges (BA/PO/PM/Tech), then catalog label, then humanized key.
 */
function buildViewerRoleChips(roleKeys, catalog = []) {
  const keys = [
    ...new Set(
      (Array.isArray(roleKeys) ? roleKeys : [])
        .map((k) => String(k || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (!keys.length) return [];

  const labelByKey = new Map();
  for (const row of catalog || []) {
    const k = String(row?.key || '').trim().toLowerCase();
    if (!k) continue;
    labelByKey.set(k, shortProjectRoleLabel(row.label || row.name || row.key, k));
  }

  const delivery = resolveDeliveryRoleBadges(keys);
  const deliveryByKey = new Map(delivery.map((b) => [b.key, b]));
  const usedShort = new Set(delivery.map((b) => b.short));

  return keys.map((key) => {
    const badge = deliveryByKey.get(key);
    if (badge) {
      return {
        key,
        label: badge.short,
        title: labelByKey.get(key) || humanizeRoleKey(key),
        className: badge.className,
      };
    }
    const label = labelByKey.get(key) || humanizeRoleKey(key);
    const short =
      label.length <= 12 ? label : label.split(/\s+/)[0] || label.slice(0, 10);
    if (usedShort.has(short)) {
      return {
        key,
        label,
        title: label,
        className: 'bg-white/10 text-white/75 border border-white/15',
      };
    }
    usedShort.add(short);
    return {
      key,
      label: short,
      title: label,
      className: 'bg-white/10 text-white/75 border border-white/15',
    };
  });
}

const MODULE_ICONS = {
  overview: LayoutDashboard,
  list: List,
  planning: FolderKanban,
  board: LayoutGrid,
  timeline: GanttChart,
  changeRequests: FileSpreadsheet,
  requirements: FileSpreadsheet,
  files: FileText,
  chat: MessageCircle,
  calendar: Calendar,
  documents: FileText,
  members: Users,
  activity: Activity,
  settings: Settings,
  picker: FolderKanban,
  new: Plus,
  customerDocuments: FileText,
  'customer-documents': FileText,
  analysisBg: FileSpreadsheet,
  'analysis-bg': FileSpreadsheet,
  analysisBr: FileSpreadsheet,
  'analysis-br': FileSpreadsheet,
  analysisBpm: FileSpreadsheet,
  'analysis-bpm': FileSpreadsheet,
  analysisFr: FileSpreadsheet,
  'analysis-fr': FileSpreadsheet,
  analysisUc: FileSpreadsheet,
  'analysis-uc': FileSpreadsheet,
  analysisNfr: FileSpreadsheet,
  'analysis-nfr': FileSpreadsheet,
  analysisScope: FileSpreadsheet,
  'analysis-scope': FileSpreadsheet,
  traceability: GanttChart,
  analysisReviews: Activity,
  'analysis-reviews': Activity,
  srsBaselines: FolderKanban,
  'srs-baselines': FolderKanban,
  'ai-hitl': Bot,
  aiHitl: Bot,
  deliveryPlanning: FolderKanban,
  'delivery-planning': FolderKanban,
  'planning-overview': LayoutDashboard,
  'planning-wbs': FolderKanban,
  'planning-architecture': Settings,
  'planning-resources': Users,
  'planning-dependencies': GanttChart,
  'planning-schedule': Calendar,
  'planning-milestones': Activity,
  'planning-releases': FolderKanban,
  'planning-risks': FileText,
  'planning-approval': Activity,
};

function NavItem({ item, collapsed, suiteColor, isActive, expanded, onToggleExpand }) {
  const Icon = item.icon || LayoutDashboard;
  const locked = Boolean(item.locked);
  const readOnly = Boolean(item.readOnly) && !locked;
  const indent = !collapsed && item.navIndent ? Number(item.navIndent) : 0;
  const hasChildren = Boolean(item.hasChildren);
  const content = (
    <>
      {isActive && !locked && (
        <span
          className="absolute bottom-[18%] left-0 top-[18%] w-[3px] rounded-r-sm"
          style={{ background: suiteColor, boxShadow: `0 0 8px ${suiteColor}88` }}
        />
      )}
      {indent > 0 ? <span className="w-3 shrink-0" aria-hidden /> : null}
      <Icon size={15} className="shrink-0" style={{ color: isActive && !locked ? suiteColor : undefined }} />
      {!collapsed && (
        <span
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.8125rem] tracking-tight"
          style={{
            fontWeight: isActive && !locked ? 500 : 400,
            color: locked ? 'rgba(255,255,255,0.28)' : isActive ? '#E2E8F0' : undefined,
            fontSize: indent > 0 ? '0.75rem' : undefined,
          }}
        >
          {item.label}
        </span>
      )}
      {hasChildren && !collapsed && !locked ? (
        <span
          className="shrink-0 text-white/40"
          aria-hidden
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpand?.(item.key);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleExpand?.(item.key);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      ) : null}
      {readOnly && !collapsed ? (
        <span
          aria-hidden="true"
          className="inline-flex h-3.5 max-w-[2.75rem] shrink-0 items-center gap-0.5 overflow-hidden rounded px-0.5 text-[0.5rem] font-medium leading-none text-white/45"
          title={item.readOnlyHint || item.readOnlyBadge || ''}
        >
          <Lock size={8} strokeWidth={2.5} className="shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{item.readOnlyBadge || 'RO'}</span>
        </span>
      ) : null}
      {readOnly && collapsed ? (
        <Lock
          size={9}
          className="absolute right-0.5 top-0.5 text-white/40"
          strokeWidth={2.5}
          aria-hidden
        />
      ) : null}
    </>
  );
  const className = figmaNavItemClass(isActive && !locked, suiteColor, collapsed);
  const style = figmaNavItemBg(isActive && !locked, suiteColor);
  if (locked) {
    return (
      <div
        className="group relative block cursor-not-allowed opacity-60"
        title={item.lockHint || item.label}
      >
        <div className={className} style={style}>
          {content}
        </div>
      </div>
    );
  }
  const linkTitle = collapsed
    ? readOnly
      ? `${item.label} — ${item.readOnlyHint || item.readOnlyBadge || ''}`
      : item.label
    : readOnly
      ? item.readOnlyHint || undefined
      : undefined;
  const targetPath =
    hasChildren && item.defaultChildPathSeg
      ? item.path.replace(item.pathSeg, item.defaultChildPathSeg)
      : item.path;
  return (
    <Link
      to={targetPath}
      className="group relative block"
      title={linkTitle}
      onClick={() => {
        if (hasChildren) onToggleExpand?.(item.key, true);
      }}
    >
      <div className={className} style={style}>
        {content}
      </div>
    </Link>
  );
}

export default function ProjectsSidebar({ landingDemo = false } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSuitePicker, setShowSuitePicker] = useState(false);
  const [expandedNavParents, setExpandedNavParents] = useState(() => new Set(['planning-resources']));
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const { navigateToSuite } = useWorkspaceSuite();
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  const { canAccessHub, isSystemAdmin } = useCompanyAdminAccess();
  const showAdminSuite = canAccessHub && !isSystemAdmin;
  const { projectId: projectIdParam, module: moduleParam, planningModule } = useParams();
  const [searchParams] = useSearchParams();
  const { company, activeWorkspace } = useWorkspace();

  const projectId = String(projectIdParam || '').trim();
  const activeModule = planningModule
    ? `planning-${String(planningModule).toLowerCase()}`
    : normalizeProjectModule(moduleParam || '');

  const { data: projectRow } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const viewerRoleKeys = useMemo(() => {
    const raw =
      projectRow?.capabilities?.viewerProjectRoleKeys ||
      projectRow?.viewerProjectRoleKeys ||
      projectRow?.access?.membership?.projectRoleKeys ||
      [];
    return Array.isArray(raw) ? raw : [];
  }, [projectRow]);

  const { data: roleCatalog = [] } = useQuery({
    queryKey: queryKeys.projectHub.roleCatalog(projectId),
    queryFn: () => fetchProjectHubRoleCatalog(projectId),
    enabled: Boolean(projectId) && viewerRoleKeys.length > 0,
    staleTime: 120_000,
  });

  const viewerRoleChips = useMemo(
    () => buildViewerRoleChips(viewerRoleKeys, roleCatalog),
    [viewerRoleKeys, roleCatalog]
  );

  const workspaceOrgId = String(
    activeWorkspace?._id || company?.id || company?._id || ''
  ).trim();
  const orgId = resolveProjectOrganizationId({
    search: searchParams,
    projectRow,
    workspaceOrgId,
  });

  const needsAiHitlPack =
    Boolean(projectId && orgId && projectRow) &&
    (String(projectRow?.deliveryPhase || '').trim().toLowerCase() === 'requirement_analysis' ||
      !projectRow?.deliveryPhase);

  const { data: linkedPack } = useQuery({
    queryKey: ['aiHitlNavLinkedPack', String(orgId || ''), String(projectId || '')],
    queryFn: () => loadLinkedPackForAiNav(orgId, projectId),
    enabled: needsAiHitlPack,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (orgId) writeStoredLastOrganizationId(orgId);
  }, [orgId]);

  // Do not assume development while loading — that flashes Phase 2 menu for Phase 1 projects.
  const projectTitle = projectRow
    ? String(projectRow?.title || projectRow?.name || '').trim()
    : '';
  const aiHitlIncomplete = Boolean(
    projectRow && isAiHitlIncomplete({ project: projectRow, pack: linkedPack || null })
  );
  // Phase 0: empty deliveryPhase coerces to development — force RA nav while HITL incomplete.
  const deliveryPhase = projectRow
    ? aiHitlIncomplete
      ? 'requirement_analysis'
      : coerceDeliveryPhase(projectRow.deliveryPhase)
    : null;
  const projectCapabilities = projectRow?.capabilities || null;

  const suiteColor = SUITE_COLORS.projects || '#8B5CF6';
  const suiteLabels = {
    label: t('nav.suite.projects.label'),
    sublabel: t('nav.suite.projects.sublabel'),
  };

  useEffect(() => {
    closeMobileNav();
  }, [location.pathname, closeMobileNav]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) setCollapsed(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    if (next) setShowSuitePicker(false);
  };

  const preItems = useMemo(() => {
    return getProjectsPreSelectNavItems().map((item) => ({
      ...item,
      label: t(item.labelKey),
      icon: MODULE_ICONS[item.key] || FolderKanban,
      path:
        item.key === 'new'
          ? buildProjectsNewPath(orgId, { from: 'sidebar' })
          : buildProjectsPickerPath(orgId),
    }));
  }, [orgId, t]);

  const boardId = boardQueryFromSearch(searchParams);
  const packIdQs = String(searchParams.get('packId') || '').trim();

  const postItems = useMemo(() => {
    if (!projectId || !projectRow || deliveryPhase == null) return [];
    return getProjectsPostSelectNavItems(projectId, {
      deliveryPhase,
      capabilities: projectCapabilities,
      aiHitlIncomplete,
    }).map((item) => {
      const params = new URLSearchParams();
      if (boardId) params.set('boardId', boardId);
      if (
        (item.module === 'ai-hitl' || item.pathSeg === 'ai-hitl') &&
        packIdQs
      ) {
        params.set('packId', packIdQs);
      }
      const qs = params.toString();
      return {
        ...item,
        label: t(item.labelKey),
        lockHint: item.lockHintKey ? t(item.lockHintKey) : '',
        readOnlyHint: item.readOnlyHintKey ? t(item.readOnlyHintKey) : '',
        readOnlyBadge: item.readOnly ? t('workspace.phase1RaReadOnlyBadge') : '',
        icon: MODULE_ICONS[item.key] || MODULE_ICONS[item.module] || LayoutDashboard,
        path: item.pathSeg
          ? `/app/projects/${encodeURIComponent(projectId)}/${item.pathSeg}${
              qs ? `?${qs}` : ''
            }`
          : buildProjectsModulePath(projectId, item.module, {
              boardId,
              ...(item.module === 'ai-hitl' && packIdQs ? { packId: packIdQs } : {}),
            }),
      };
    });
  }, [
    projectId,
    orgId,
    boardId,
    packIdQs,
    t,
    deliveryPhase,
    projectCapabilities,
    projectRow,
    aiHitlIncomplete,
  ]);

  const groupedPost = useMemo(() => {
    const groups = [
      PROJECT_MENU_GROUPS.PHASE0_AI_HITL,
      PROJECT_MENU_GROUPS.PHASE1_RA,
      PROJECT_MENU_GROUPS.PHASE1_PLANNING,
      PROJECT_MENU_GROUPS.WORK,
      PROJECT_MENU_GROUPS.COLLAB,
      PROJECT_MENU_GROUPS.OPS,
    ];
    return groups
      .map((group) => ({
        group,
        label: t(getProjectMenuGroupLabelKey(group)),
        items: postItems.filter((i) => i.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [postItems, t]);

  const allowedSuites = useMemo(() => {
    const base = ['communicate', 'company', 'projects'];
    if (showAdminSuite) return ['communicate', 'company', 'projects', 'admin'];
    return base;
  }, [showAdminSuite]);

  const railCollapsed = collapsed && !mobileNavOpen;
  const widthClass = railCollapsed ? FIGMA_SIDEBAR_COLLAPSED : FIGMA_SIDEBAR_EXPANDED;
  const sidebarTranslate = mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';


  const isItemActive = (item) => {
    if (!projectId) {
      if (item.key === 'picker') {
        return location.pathname === '/app/projects' || location.pathname === '/app/projects/';
      }
      if (item.key === 'new') return location.pathname.startsWith('/app/projects/new');
      return false;
    }
    if (item.pathSeg && item.pathSeg.includes('/')) {
      if (item.navChildOf) {
        return location.pathname.includes(`/${item.pathSeg}`);
      }
      if (item.hasChildren) {
        return location.pathname.includes(`/${item.pathSeg}`);
      }
      return location.pathname.includes(`/${item.pathSeg}`);
    }
    return item.module === activeModule;
  };

  const toggleNavParent = (key, forceOpen = false) => {
    setExpandedNavParents((prev) => {
      const next = new Set(prev);
      if (forceOpen) next.add(key);
      else if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    for (const item of postItems) {
      if (item.navChildOf && location.pathname.includes(`/${item.pathSeg}`)) {
        setExpandedNavParents((prev) => {
          if (prev.has(item.navChildOf)) return prev;
          const next = new Set(prev);
          next.add(item.navChildOf);
          return next;
        });
      }
    }
  }, [location.pathname, postItems]);

  const visibleSectionItems = (items) =>
    items.filter((item) => {
      if (!item.navChildOf) return true;
      return expandedNavParents.has(item.navChildOf);
    });

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-[240] bg-black/50 lg:hidden"
          onClick={closeMobileNav}
        />
      ) : null}
      <div
        id="voicehub-mobile-nav"
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
        aria-label={t('nav.mainMenu')}
        className={`${FIGMA_SIDEBAR} ${widthClass} fixed inset-y-0 left-0 z-[250] transform transition-transform duration-200 ease-enterprise lg:relative lg:z-30 lg:translate-x-0 ${sidebarTranslate}`}
      >
        <div className={`relative ${FIGMA_SIDEBAR_SUITE_STRIP}`}>
          <div
            className={`flex w-full items-center gap-1.5 ${railCollapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'}`}
          >
            {!railCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowSuitePicker((s) => !s)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition"
                  style={{
                    background: showSuitePicker ? `${suiteColor}28` : `${suiteColor}18`,
                    borderColor: `${suiteColor}${showSuitePicker ? '44' : '22'}`,
                  }}
                  title={t('nav.switchSuite')}
                >
                  <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: suiteColor }} />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.6875rem] font-bold uppercase tracking-wider"
                    style={{ color: suiteColor }}
                  >
                    {suiteLabels.label}
                  </span>
                  <ChevronsRight
                    size={10}
                    className="shrink-0 opacity-70"
                    style={{ color: suiteColor, transform: showSuitePicker ? 'rotate(90deg)' : 'none' }}
                  />
                </button>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="hidden shrink-0 rounded-[5px] border-none bg-transparent p-0.5 text-white/30 transition hover:text-white/70 lg:inline-flex"
                  title={t('nav.collapseSidebar')}
                  aria-label={t('nav.collapseSidebar')}
                >
                  <ChevronsLeft size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={toggleCollapsed}
                title={t('nav.expandSidebar')}
                aria-label={t('nav.expandSidebar')}
                className={FIGMA_SIDEBAR_EXPAND_BTN}
                style={{
                  background: `${suiteColor}18`,
                  borderColor: `${suiteColor}44`,
                  color: suiteColor,
                }}
              >
                <ChevronsRight size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>

          {showSuitePicker && !railCollapsed && (
            <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-[200] animate-scale-in overflow-hidden rounded-xl border border-white/10 bg-[#0D0D1A] shadow-2xl">
              <div className="px-2.5 pb-1 pt-2 text-[0.575rem] font-bold uppercase tracking-widest text-white/25">
                {t('nav.chooseSpace')}
              </div>
              {allowedSuites.map((sId) => {
                const isCurrent = sId === 'projects';
                const labels = {
                  label: t(`nav.suite.${sId}.label`),
                  sublabel: t(`nav.suite.${sId}.sublabel`),
                };
                const sc = SUITE_COLORS[sId] || suiteColor;
                const suiteMap = {
                  communicate: SUITE.COMMUNICATE,
                  company: SUITE.COMPANY,
                  projects: SUITE.PROJECTS,
                  me: SUITE.ME,
                  admin: SUITE.ADMIN,
                };
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => {
                      navigateToSuite(suiteMap[sId], { path: getDefaultPathForSuite(suiteMap[sId]) });
                      setShowSuitePicker(false);
                    }}
                    className="flex w-full items-center gap-2.5 border-none px-3 py-2 text-left transition"
                    style={{
                      background: isCurrent ? `${sc}18` : 'transparent',
                      borderLeft: `3px solid ${isCurrent ? sc : 'transparent'}`,
                    }}
                  >
                    <div
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: sc, boxShadow: isCurrent ? `0 0 6px ${sc}` : 'none' }}
                    />
                    <div>
                      <div
                        className="text-[0.7812rem]"
                        style={{
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? sc : 'rgba(255,255,255,0.6)',
                        }}
                      >
                        {labels.label}
                      </div>
                      <div className="text-[0.625rem] text-white/25">{labels.sublabel}</div>
                    </div>
                  </button>
                );
              })}
              <div className="h-1.5" />
            </div>
          )}
        </div>

        {projectId && !railCollapsed ? (
          <div className="shrink-0 border-b border-sidebar-border px-2.5 py-2">
            <p className="truncate text-[0.6875rem] font-bold text-white/80">
              {projectTitle || t('workspace.projectHubUntitled')}
            </p>
            <button
              type="button"
              onClick={() => navigate(buildProjectsPickerPath(orgId))}
              className="mt-1 inline-flex items-center gap-1 text-[0.625rem] font-semibold text-white/40 transition hover:text-white/70"
            >
              <ArrowLeftRight size={10} />
              {t('nav.projectsSwitch')}
            </button>
          </div>
        ) : null}

        {!railCollapsed && (
          <div className={FIGMA_SIDEBAR_SECTION_LABEL}>
            {projectId ? t('nav.mainMenu') : t('nav.projectsPick')}
          </div>
        )}

        <nav className={FIGMA_SIDEBAR_NAV}>
          {!projectId
            ? preItems.map((item) => (
                <NavItem
                  key={item.key}
                  item={item}
                  collapsed={railCollapsed}
                  suiteColor={suiteColor}
                  isActive={isItemActive(item)}
                />
              ))
            : groupedPost.map((section) => (
                <div key={section.group} className="mb-1">
                  {!railCollapsed && section.label ? (
                    <div className="px-2.5 pb-0.5 pt-2 text-[0.55rem] font-bold uppercase tracking-wider text-white/25">
                      {section.label}
                    </div>
                  ) : null}
                  {visibleSectionItems(section.items).map((item) => (
                    <NavItem
                      key={item.key}
                      item={item}
                      collapsed={railCollapsed}
                      suiteColor={suiteColor}
                      isActive={isItemActive(item)}
                      expanded={expandedNavParents.has(item.key)}
                      onToggleExpand={toggleNavParent}
                    />
                  ))}
                </div>
              ))}
        </nav>

        <div className={FIGMA_SIDEBAR_FOOTER}>
          {projectId && viewerRoleChips.length ? (
            railCollapsed ? (
              <div
                className="flex flex-col items-center gap-1 py-0.5"
                title={viewerRoleChips.map((c) => c.title || c.label).join(' · ')}
              >
                <Shield size={14} className="text-white/35" aria-hidden />
                {viewerRoleChips.slice(0, 2).map((chip) => (
                  <span
                    key={chip.key}
                    className={`inline-flex max-w-full truncate rounded px-1 py-0.5 text-[0.55rem] font-bold tracking-wide ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="px-1.5 py-1">
                <div className="mb-1 flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-white/25">
                  <Shield size={10} aria-hidden />
                  {t('nav.yourRole')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {viewerRoleChips.map((chip) => (
                    <span
                      key={chip.key}
                      title={chip.title}
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
            )
          ) : projectId && !railCollapsed ? (
            <div className="px-1.5 py-1">
              <div className="mb-0.5 flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-white/25">
                <Shield size={10} aria-hidden />
                {t('nav.yourRole')}
              </div>
              <p className="text-[0.625rem] text-white/35">
                {t('nav.projectRoleUnassigned') || 'Chưa gán vai trò dự án'}
              </p>
            </div>
          ) : !projectId ? (
            <SidebarPositionFooter collapsed={railCollapsed} wrap={false} />
          ) : null}
        </div>
      </div>
    </>
  );
}

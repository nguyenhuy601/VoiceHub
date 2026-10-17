import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Bot,
  Calendar,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  List,
  Loader2,
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
import SidebarPositionFooter from './SidebarPositionFooter';
import NavCollapse from '../../motion/NavCollapse';
import { VH_NAV_CHEVRON } from '../../motion/classes';
import useMotionPresence from '../../motion/useMotionPresence';
import { VH_MOTION_BASE_MS } from '../../motion/tokens';
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

/**
 * Accordion section for project phase menu groups (RA / Planning / Work / …).
 * Expanded: AdminNavSectionGroup-style (NavCollapse + VH_NAV_CHEVRON).
 * Rail collapsed: AdminNavActionGroup-style flyout (fade-in), not a full icon dump.
 */
function ProjectNavSectionGroup({
  section,
  railCollapsed,
  suiteColor,
  isExpanded,
  onToggle,
  hasActive,
  children,
  flyoutItems = null,
  closeFlyoutSignal = '',
}) {
  const reactId = useId();
  const listId = `projects-nav-section-${section.group}-${reactId}`;
  const rootRef = useRef(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  useEffect(() => {
    if (!railCollapsed) setFlyoutOpen(false);
  }, [railCollapsed]);

  useEffect(() => {
    setFlyoutOpen(false);
  }, [closeFlyoutSignal]);

  useEffect(() => {
    if (!flyoutOpen) return undefined;
    const onDoc = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setFlyoutOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setFlyoutOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [flyoutOpen]);

  if (!section.label) {
    return <div className="mb-1">{children}</div>;
  }

  if (railCollapsed) {
    const LeadIcon = flyoutItems?.[0]?.icon || FolderKanban;
    return (
      <div ref={rootRef} className="relative mb-px">
        <button
          type="button"
          aria-expanded={flyoutOpen}
          aria-controls={listId}
          title={section.label}
          onClick={() => setFlyoutOpen((v) => !v)}
          className={`${figmaNavItemClass(hasActive, suiteColor, true)} w-full`}
          style={figmaNavItemBg(hasActive, suiteColor)}
        >
          <LeadIcon
            size={15}
            className="shrink-0"
            style={{ color: hasActive ? suiteColor : undefined }}
            aria-hidden
          />
        </button>
        {flyoutOpen ? (
          <div
            id={listId}
            role="menu"
            aria-label={section.label}
            className="absolute left-full top-0 z-40 ml-1 min-w-[12rem] rounded-lg border border-white/10 bg-[#0D0D1A] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.65)] motion-safe:animate-fade-in-fast"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[0.55rem] font-bold uppercase tracking-wider text-white/35">
              {section.label}
            </div>
            <div className="space-y-px px-1 pb-1">{children}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={listId}
        className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left transition ${
          hasActive
            ? 'text-white/90'
            : 'text-white/50 hover:bg-white/[0.05] hover:text-white/75'
        }`}
        style={
          hasActive
            ? { background: `${suiteColor}22`, color: suiteColor }
            : undefined
        }
      >
        <span className="text-[0.55rem] font-bold uppercase tracking-wider">{section.label}</span>
        <ChevronDown
          size={13}
          className={`${VH_NAV_CHEVRON} ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
          aria-hidden
        />
      </button>
      <NavCollapse
        open={isExpanded}
        id={listId}
        className="mb-1 ml-1.5 border-l border-white/10 pl-1"
      >
        <div className="mt-0.5 space-y-px">{children}</div>
      </NavCollapse>
    </div>
  );
}

function NavItem({
  item,
  collapsed,
  suiteColor,
  isActive,
  expanded,
  onToggleExpand,
  isPending = false,
  onNavigatePending,
}) {
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
      {isPending ? (
        <Loader2
          size={15}
          className="shrink-0 animate-spin"
          style={{ color: suiteColor }}
          aria-hidden
        />
      ) : (
        <Icon size={15} className="shrink-0" style={{ color: isActive && !locked ? suiteColor : undefined }} />
      )}
      {!collapsed && (
        <span
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.8125rem] tracking-tight"
          style={{
            fontWeight: isActive && !locked ? 500 : 400,
            color: locked ? 'rgba(255,255,255,0.28)' : isActive ? '#E2E8F0' : undefined,
            fontSize: indent > 0 ? '0.75rem' : undefined,
            opacity: isPending ? 0.7 : undefined,
          }}
        >
          {item.label}
        </span>
      )}
      {hasChildren && !collapsed && !locked ? (
        <span
          className={`${VH_NAV_CHEVRON} text-white/40 ${expanded ? 'rotate-0' : '-rotate-90'}`}
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
          <ChevronDown size={12} />
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
      aria-busy={isPending || undefined}
      onClick={() => {
        if (hasChildren) onToggleExpand?.(item.key, true);
        onNavigatePending?.(item.key);
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
  /** Accordion: one phase/menu group open at a time (Admin-style). */
  const [expandedMenuGroup, setExpandedMenuGroup] = useState(null);
  const [pendingModule, setPendingModule] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const { navigateToSuite } = useWorkspaceSuite();
  const { mobileNavOpen, closeMobileNav, showHeaderLoading, hideHeaderLoading } = useShellLayout();
  // /app/admin chỉ mở bằng systemRole=admin (AdminShellLayout), không từ sidebar dự án.
  const showAdminSuite = false;
  const { projectId: projectIdParam, module: moduleParam, planningModule } = useParams();
  const [searchParams] = useSearchParams();
  const { company, activeWorkspace } = useWorkspace();

  const projectId = String(projectIdParam || '').trim();
  const activeModule = planningModule
    ? `planning-${String(planningModule).toLowerCase()}`
    : normalizeProjectModule(moduleParam || '');

  const { data: projectRow, isPending: projectRowPending } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  useEffect(() => {
    setPendingModule(null);
    hideHeaderLoading();
  }, [location.pathname, hideHeaderLoading]);

  const onNavPending = useCallback(
    (moduleKey) => {
      setPendingModule(moduleKey);
      showHeaderLoading(t('nav.projectsModuleSwitching'));
    },
    [showHeaderLoading, t]
  );

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

  // Open the menu group that contains the active route (accordion SoT).
  useEffect(() => {
    if (!groupedPost.length) return;
    const activeSection = groupedPost.find((section) =>
      section.items.some((item) => isItemActive(item))
    );
    if (!activeSection) return;
    setExpandedMenuGroup((prev) =>
      prev === activeSection.group ? prev : activeSection.group
    );
  }, [location.pathname, activeModule, groupedPost, projectId]);

  const toggleMenuGroup = (group) => {
    setExpandedMenuGroup((prev) => (prev === group ? null : group));
  };

  // Section body always shows labels (accordion panel or rail flyout) — never the thin icon rail.
  const renderSectionNav = (items) => {
    const roots = items.filter((item) => !item.navChildOf);
    return roots.map((item) => {
      const children = items.filter((child) => child.navChildOf === item.key);
      const parentOpen = expandedNavParents.has(item.key);
      return (
        <div key={item.key} className="mb-px">
          <NavItem
            item={item}
            collapsed={false}
            suiteColor={suiteColor}
            isActive={isItemActive(item)}
            expanded={expandedNavParents.has(item.key)}
            onToggleExpand={toggleNavParent}
            isPending={pendingModule === item.key}
            onNavigatePending={onNavPending}
          />
          {children.length > 0 ? (
            <NavCollapse open={parentOpen} className="ml-0.5 border-l border-white/10 pl-0.5">
              {children.map((child) => (
                <NavItem
                  key={child.key}
                  item={child}
                  collapsed={false}
                  suiteColor={suiteColor}
                  isActive={isItemActive(child)}
                  isPending={pendingModule === child.key}
                  onNavigatePending={onNavPending}
                />
              ))}
            </NavCollapse>
          ) : null}
        </div>
      );
    });
  };

  const { mounted: suitePickerMounted, phase: suitePickerPhase } = useMotionPresence(
    showSuitePicker && !railCollapsed,
    { durationMs: VH_MOTION_BASE_MS }
  );

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
                    className={`${VH_NAV_CHEVRON} ${showSuitePicker ? 'rotate-90' : 'rotate-0'}`}
                    style={{ color: suiteColor }}
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

          {suitePickerMounted ? (
            <div
              className="absolute left-2 right-2 top-[calc(100%+4px)] z-[200] overflow-hidden rounded-xl border border-white/10 bg-[#0D0D1A] shadow-2xl vh-presence-overlay vh-motion-respect"
              data-motion-phase={suitePickerPhase || 'enter'}
              role="menu"
            >
              <div className="vh-presence-panel px-0 py-0">
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
            </div>
          ) : null}
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

        <nav className={FIGMA_SIDEBAR_NAV} aria-busy={Boolean(pendingModule) || undefined}>
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
            : projectRowPending && !projectRow
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`nav-skel-${idx}`}
                    className={`mx-2 mb-1.5 rounded-md bg-white/10 animate-pulse ${
                      railCollapsed ? 'h-8 w-8' : 'h-8'
                    }`}
                    aria-hidden
                  />
                ))
              : groupedPost.map((section) => {
                  const sectionHasActive = section.items.some((item) => isItemActive(item));
                  const roots = section.items.filter((item) => !item.navChildOf);
                  return (
                    <ProjectNavSectionGroup
                      key={section.group}
                      section={section}
                      railCollapsed={railCollapsed}
                      suiteColor={suiteColor}
                      isExpanded={expandedMenuGroup === section.group}
                      onToggle={() => toggleMenuGroup(section.group)}
                      hasActive={sectionHasActive}
                      flyoutItems={roots}
                      closeFlyoutSignal={location.pathname}
                    >
                      {renderSectionNav(section.items)}
                    </ProjectNavSectionGroup>
                  );
                })}
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

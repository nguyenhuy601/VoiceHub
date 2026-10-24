import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
  Hash,
  Kanban,
  KeyRound,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ADMIN_DOMAIN_STORAGE_KEY,
  ADMIN_SUITE_COLOR,
  applyOrgLevelFilterToDomain,
  flattenAdminNavItems,
  getVisibleAdminDomains,
  normalizeAdminPath,
  resolveAdminDomainFromPath,
  splitNavSectionItems,
} from '../../config/adminDomainsConfig';
import { useShellLayout } from '../../context/ShellLayoutContext';
import { useAppStrings } from '../../locales/appStrings';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { useAdminNavLoading } from '../../hooks/useAdminShellLoading';
import useOrgStructureLevels from '../../hooks/useOrgStructureLevels';
import {
  filterAdminDomainByGrant,
  firstAllowedAdminLeafPath,
  listAdminDomainsForActor,
} from '../../config/rbacUiGrantMap';
import OrgStructureSetupModal from '../../features/adminOrgStructure/OrgStructureSetupModal';
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
  figmaNavItemBg,
  figmaNavItemClass,
} from './figmaShellClasses';

function firstVisibleNavPath(domain) {
  const item = flattenAdminNavItems(domain || {}).find((entry) => entry?.nav !== 'hidden' && entry?.path);
  return item?.path || domain?.path || '/app/admin';
}

const COLLAPSE_KEY = 'vh_admin_sidebar_collapsed';
const ADMIN_COLOR = ADMIN_SUITE_COLOR;

const DOMAIN_ICONS = {
  Users,
  KeyRound,
  Building2,
  Shield,
  Hash,
  MessageSquare,
  Mic,
  Kanban,
  FolderOpen,
  Bell,
  Sparkles,
  Lock,
  ScrollText,
  Database,
  Settings,
  Activity,
  BarChart3,
  LayoutGrid,
};

function AdminDomainPicker({ domains, selectedDomain, onSelect }) {
  const { t } = useAppStrings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [selectedDomain?.id]);

  const Icon = selectedDomain ? DOMAIN_ICONS[selectedDomain.icon] || LayoutGrid : LayoutGrid;

  return (
    <div ref={rootRef} className="relative z-20 mb-3 px-1">
      <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wider text-white/35">
        {t('adminDomains.selectDomain')}
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-lg border border-red-500/25 bg-[#0f0a12] py-2 pl-2.5 pr-2 text-left outline-none transition hover:border-red-500/40 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30"
      >
        <Icon size={14} className="shrink-0 text-red-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-white/90">
          {selectedDomain ? t(selectedDomain.labelKey) : t('adminDomains.allDomains')}
        </span>
        <ChevronDown
          size={14}
          className={`${VH_NAV_CHEVRON} text-white/40 ${open ? 'rotate-180' : 'rotate-0'}`}
          aria-hidden
        />
      </button>

      <AdminDomainPickerMenu
        open={open}
        domains={domains}
        selectedDomain={selectedDomain}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
        t={t}
        anchorRef={triggerRef}
      />
    </div>
  );
}

function AdminDomainPickerMenu({ open, domains, selectedDomain, onSelect, onClose, t, anchorRef }) {
  const { mounted, phase } = useMotionPresence(open, { durationMs: VH_MOTION_BASE_MS });
  const [menuBox, setMenuBox] = useState(null);

  useEffect(() => {
    if (!open || !anchorRef?.current) {
      setMenuBox(null);
      return undefined;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuBox({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  if (!mounted || typeof document === 'undefined' || !menuBox) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-[260] cursor-default bg-black/40"
        onClick={onClose}
      />
      <div
        role="listbox"
        data-motion-phase={phase || 'enter'}
        style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
        className="fixed z-[270] max-h-[min(16rem,42vh)] overflow-y-auto rounded-lg border border-red-500/30 bg-[#12080A] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.65)] vh-presence-overlay vh-motion-respect"
      >
        <div className="vh-presence-panel px-0 py-0 shadow-none border-0 bg-transparent rounded-none max-h-none">
          {domains.map((domain) => {
            const DomainItemIcon = DOMAIN_ICONS[domain.icon] || LayoutGrid;
            const active = domain.id === selectedDomain?.id;
            return (
              <button
                key={domain.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelect(domain);
                  onClose();
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-[0.8125rem] transition duration-fast ease-enterprise motion-reduce:transition-none ${
                  active
                    ? 'bg-red-500/20 font-medium text-red-100'
                    : 'text-white/80 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <DomainItemIcon
                  size={14}
                  className={`shrink-0 ${active ? 'text-red-400' : 'text-white/45'}`}
                  aria-hidden
                />
                <span className="truncate">{t(domain.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body
  );
}

function AdminNavItem({ item, collapsed, isActive, badge = 0, onNavigate }) {
  const { t } = useAppStrings();
  const label = t(item.labelKey);

  return (
    <Link
      to={item.path}
      onClick={() => {
        if (!isActive) onNavigate?.();
      }}
      className={`${figmaNavItemClass(isActive, ADMIN_COLOR, collapsed)} ${isActive ? '!text-white' : ''}`}
      style={figmaNavItemBg(isActive, ADMIN_COLOR)}
      title={collapsed ? label : undefined}
    >
      <span
        className={`h-[6px] w-[6px] shrink-0 rounded-full ${isActive ? 'bg-red-400' : 'bg-white/25'}`}
        aria-hidden
      />
      {!collapsed ? (
        <>
          <span className={`flex-1 truncate text-[0.8125rem] ${isActive ? 'font-medium text-white' : ''}`}>
            {label}
          </span>
          {badge > 0 ? (
            <span
              className="rounded-full px-1.5 py-px text-[0.625rem] font-bold text-white"
              style={{ background: ADMIN_COLOR }}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function AdminNavActionGroup({ items, labelKey, collapsed, isActivePath, badgeForItem, onNavigate }) {
  const { t } = useAppStrings();
  const rootRef = useRef(null);
  const listId = useId();
  const hasActive = items.some((item) => isActivePath(item));
  const [open, setOpen] = useState(hasActive);
  const label = t(labelKey);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (!hasActive) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (!hasActive) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hasActive]);

  return (
    <div ref={rootRef} className="relative mb-px">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={`${figmaNavItemClass(hasActive, ADMIN_COLOR, collapsed)} w-full ${hasActive ? '!text-white' : ''}`}
        style={figmaNavItemBg(hasActive, ADMIN_COLOR)}
        title={collapsed ? label : undefined}
      >
        <span
          className={`h-[6px] w-[6px] shrink-0 rounded-full ${hasActive ? 'bg-red-400' : 'bg-white/25'}`}
          aria-hidden
        />
        {!collapsed ? (
          <>
            <span className={`flex-1 truncate text-left text-[0.8125rem] ${hasActive ? 'font-medium text-white' : ''}`}>
              {label}
            </span>
            <ChevronDown
              size={13}
              className={`${VH_NAV_CHEVRON} ${open ? 'rotate-180' : 'rotate-0'}`}
              aria-hidden
            />
          </>
        ) : null}
      </button>
      {collapsed ? (
        open ? (
          <div
            id={listId}
            className="absolute left-full top-0 z-40 ml-1 min-w-[11rem] rounded-lg border border-red-500/30 bg-[#12080A] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.65)] motion-safe:animate-fade-in-fast"
          >
            {items.map((item) => (
              <AdminNavItem
                key={item.id}
                item={item}
                collapsed={false}
                isActive={isActivePath(item)}
                badge={badgeForItem(item)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null
      ) : (
        <NavCollapse open={open} id={listId} className="mb-1 ml-1.5 border-l border-red-500/20 pl-1">
          <div className="mt-0.5 space-y-px">
            {items.map((item) => (
              <AdminNavItem
                key={item.id}
                item={item}
                collapsed={false}
                isActive={isActivePath(item)}
                badge={badgeForItem(item)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </NavCollapse>
      )}
    </div>
  );
}

function renderNavRows({ items, collapsed, isActivePath, badgeForItem, onNavigate }) {
  return splitNavSectionItems(items).map((row) => {
    if (row.type === 'group') {
      return (
        <AdminNavActionGroup
          key={`group-${row.id}`}
          items={row.items}
          labelKey={row.labelKey}
          collapsed={collapsed}
          isActivePath={isActivePath}
          badgeForItem={badgeForItem}
          onNavigate={onNavigate}
        />
      );
    }
    return (
      <AdminNavItem
        key={row.item.id}
        item={row.item}
        collapsed={collapsed}
        isActive={isActivePath(row.item)}
        badge={badgeForItem(row.item)}
        onNavigate={onNavigate}
      />
    );
  });
}

function AdminNavSectionGroup({
  section,
  collapsed,
  isAccordion,
  isExpanded,
  onToggle,
  isActivePath,
  badgeForItem,
  onNavigate,
}) {
  const { t } = useAppStrings();
  const hasActive = section.items.some((item) => isActivePath(item));

  if (!section.labelKey || !isAccordion) {
    return (
      <div className="mb-2">
        {!collapsed && section.labelKey ? (
          <div className={FIGMA_SIDEBAR_SECTION_LABEL}>{t(section.labelKey)}</div>
        ) : null}
        {renderNavRows({ items: section.items, collapsed, isActivePath, badgeForItem, onNavigate })}
      </div>
    );
  }

  return (
    <div className="mb-1">
      {!collapsed ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left transition ${
            hasActive
              ? 'bg-red-500/15 text-red-200'
              : 'text-white/50 hover:bg-white/[0.05] hover:text-white/75'
          }`}
        >
          <span className="text-[0.625rem] font-bold uppercase tracking-[0.08em]">{t(section.labelKey)}</span>
          <ChevronDown
            size={13}
            className={`${VH_NAV_CHEVRON} ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
            aria-hidden
          />
        </button>
      ) : null}
      <NavCollapse
        open={Boolean(isExpanded && !collapsed)}
        className="mb-1 ml-1.5 border-l border-red-500/20 pl-1"
      >
        <div className="mt-0.5 space-y-px">
          {renderNavRows({ items: section.items, collapsed, isActivePath, badgeForItem, onNavigate })}
        </div>
      </NavCollapse>
    </div>
  );
}

export default function AdminNavigationSidebar() {
  const { t } = useAppStrings();
  const location = useLocation();
  const navigate = useNavigate();
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  const { markNavigating } = useAdminNavLoading();
  const { isSystemAdmin, orgId } = useCompanyAdminAccess();
  const { hasGrant, scopeOf } = useEffectiveMasterGrants(orgId);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'false');
    } catch {
      return false;
    }
  });
  const [expandedSectionByDomain, setExpandedSectionByDomain] = useState({});

  const grantCtx = useMemo(
    () => ({ hasGrant, scopeOf, isSystemAdmin: Boolean(isSystemAdmin) }),
    [hasGrant, scopeOf, isSystemAdmin]
  );

  const visibleDomains = useMemo(
    () => listAdminDomainsForActor(getVisibleAdminDomains(), grantCtx),
    [grantCtx]
  );

  const currentPath = normalizeAdminPath(location.pathname);
  const activeDomain = resolveAdminDomainFromPath(currentPath);

  const [selectedDomainId, setSelectedDomainId] = useState(() => {
    if (activeDomain?.id) return activeDomain.id;
    try {
      return localStorage.getItem(ADMIN_DOMAIN_STORAGE_KEY) || 'users';
    } catch {
      return 'users';
    }
  });

  const {
    schemaLevels: orgStructureLevels,
    setupCompleted: orgStructureSetupCompleted,
    reload: reloadOrgStructureLevels,
  } = useOrgStructureLevels(orgId, {
    enabled: Boolean(orgId) && selectedDomainId === 'org-structure',
  });

  const enrichDomain = useCallback(
    (raw) => {
      if (!raw) return null;
      const leveled =
        raw.id === 'org-structure'
          ? applyOrgLevelFilterToDomain(raw, orgStructureLevels, {
              setupCompleted: orgStructureSetupCompleted === true,
            })
          : raw;
      return filterAdminDomainByGrant(leveled, grantCtx);
    },
    [orgStructureLevels, orgStructureSetupCompleted, grantCtx]
  );

  /** Cùng nguồn với Trung tâm quản trị — domain còn mục sau lọc grant. */
  const selectableDomains = useMemo(
    () =>
      listAdminDomainsForActor(
        visibleDomains.map((raw) =>
          raw.id === 'org-structure'
            ? applyOrgLevelFilterToDomain(raw, orgStructureLevels, {
                setupCompleted: orgStructureSetupCompleted === true,
              })
            : raw
        ),
        grantCtx
      ),
    [visibleDomains, orgStructureLevels, orgStructureSetupCompleted, grantCtx]
  );

  useEffect(() => {
    if (activeDomain?.id && visibleDomains.some((d) => d.id === activeDomain.id)) {
      setSelectedDomainId(activeDomain.id);
      localStorage.setItem(ADMIN_DOMAIN_STORAGE_KEY, activeDomain.id);
    }
  }, [activeDomain?.id, visibleDomains]);

  useEffect(() => {
    if (!visibleDomains.length) return;
    if (visibleDomains.some((d) => d.id === selectedDomainId)) return;
    const next = visibleDomains[0];
    setSelectedDomainId(next.id);
    localStorage.setItem(ADMIN_DOMAIN_STORAGE_KEY, next.id);
  }, [visibleDomains, selectedDomainId]);

  const selectedDomain = useMemo(() => {
    const fromSelectable =
      selectableDomains.find((d) => d.id === selectedDomainId) || selectableDomains[0] || null;
    if (fromSelectable) return fromSelectable;
    const raw = visibleDomains.find((d) => d.id === selectedDomainId) || visibleDomains[0] || null;
    if (!raw) return raw;
    if (raw.id !== 'org-structure') return raw;
    return applyOrgLevelFilterToDomain(raw, orgStructureLevels, {
      setupCompleted: orgStructureSetupCompleted === true,
    });
  }, [visibleDomains, selectedDomainId, orgStructureLevels, orgStructureSetupCompleted]);

  const isActivePath = (item) => {
    const base = String(item.path || '').split('?')[0].replace(/\/+$/, '');
    const current = currentPath.replace(/\/+$/, '');
    if (item.end) return current === base;
    return current === base || current.startsWith(`${base}/`);
  };

  useEffect(() => {
    if (!selectedDomain?.navAccordion) return;
    const activeSection = selectedDomain.sections.find((section) =>
      section.items.some((item) => isActivePath(item))
    );
    if (!activeSection) return;
    setExpandedSectionByDomain((prev) => {
      if (prev[selectedDomain.id] === activeSection.id) return prev;
      return {
        ...prev,
        [selectedDomain.id]: activeSection.id,
      };
    });
  }, [selectedDomain, currentPath]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
  };

  const handleDomainSelect = useCallback(
    (domain) => {
      setSelectedDomainId(domain.id);
      localStorage.setItem(ADMIN_DOMAIN_STORAGE_KEY, domain.id);
      const leafPath = firstAllowedAdminLeafPath(domain, grantCtx) || domain.path;
      if (normalizeAdminPath(leafPath) !== currentPath) {
        markNavigating();
      }
      navigate(leafPath);
    },
    [currentPath, grantCtx, markNavigating, navigate]
  );

  const toggleNavSection = (sectionId) => {
    if (!selectedDomain) return;
    setExpandedSectionByDomain((prev) => ({
      ...prev,
      [selectedDomain.id]: prev[selectedDomain.id] === sectionId ? null : sectionId,
    }));
  };

  const isSectionExpanded = (section) => {
    if (!selectedDomain?.navAccordion || !section.labelKey) return true;
    return expandedSectionByDomain[selectedDomain.id] === section.id;
  };

  const badgeForItem = () => 0;

  const widthClass = mobileNavOpen || !collapsed ? FIGMA_SIDEBAR_EXPANDED : FIGMA_SIDEBAR_COLLAPSED;
  const sidebarTranslate = mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';

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
        className={`${FIGMA_SIDEBAR} ${widthClass} fixed inset-y-0 left-0 z-[250] transform border-r-[#EF444422] transition-transform duration-200 ease-enterprise lg:relative lg:z-30 lg:translate-x-0 ${sidebarTranslate}`}
        style={{ background: 'linear-gradient(180deg, #12080A 0%, #0D0D1A 55%, #0A0A14 100%)' }}
      >
        <div className={`relative ${FIGMA_SIDEBAR_SUITE_STRIP}`}>
          <div
            className={`flex w-full items-center gap-1.5 ${collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'}`}
          >
            {!collapsed ? (
              <>
                <Link
                  to="/app/admin"
                  onClick={() => {
                    if (currentPath !== '/app/admin') markNavigating();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1 transition hover:opacity-90"
                  style={{
                    background: `${ADMIN_COLOR}18`,
                    borderColor: `${ADMIN_COLOR}22`,
                  }}
                >
                  <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: ADMIN_COLOR }} />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.6875rem] font-bold uppercase tracking-wider"
                    style={{ color: ADMIN_COLOR }}
                  >
                    {t('nav.suite.admin.label')}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="shrink-0 rounded-[5px] border-none bg-transparent p-0.5 text-white/30 transition hover:text-white/70"
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
                  background: `${ADMIN_COLOR}18`,
                  borderColor: `${ADMIN_COLOR}44`,
                  color: ADMIN_COLOR,
                }}
              >
                <ChevronsRight size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>

        <nav className={`${FIGMA_SIDEBAR_NAV} relative`}>
          {!collapsed ? (
            <AdminDomainPicker
              domains={selectableDomains.length ? selectableDomains : visibleDomains}
              selectedDomain={selectedDomain}
              onSelect={handleDomainSelect}
            />
          ) : null}

          {selectedDomain?.sections
            .filter((section) => splitNavSectionItems(section.items).length > 0)
            .map((section) => (
            <AdminNavSectionGroup
              key={section.id}
              section={section}
              collapsed={collapsed}
              isAccordion={Boolean(selectedDomain.navAccordion)}
              isExpanded={isSectionExpanded(section)}
              onToggle={() => toggleNavSection(section.id)}
              isActivePath={isActivePath}
              badgeForItem={badgeForItem}
              onNavigate={markNavigating}
            />
          ))}

          {!collapsed && !isSystemAdmin ? (
            <Link
              to="/app/collaborate/workspaces"
              onClick={() => markNavigating()}
              className="mt-2 block rounded-lg border border-dashed border-white/10 px-2.5 py-2 text-[0.75rem] text-white/45 transition hover:border-white/20 hover:text-white/70"
            >
              {t('companyAdmin.backToWork')}
            </Link>
          ) : null}
        </nav>

        <div className={FIGMA_SIDEBAR_FOOTER}>
          <SidebarPositionFooter collapsed={collapsed} wrap={false} />
        </div>
      </div>

      <OrgStructureSetupModal
        orgId={orgId}
        open={Boolean(orgId) && selectedDomainId === 'org-structure' && orgStructureSetupCompleted === false}
        onCompleted={async (payload) => {
          const levels = Array.isArray(payload?.levels) ? payload.levels : [];
          await reloadOrgStructureLevels();
          const raw = visibleDomains.find((d) => d.id === 'org-structure');
          const filtered = applyOrgLevelFilterToDomain(raw, levels, { setupCompleted: true });
          const firstItem = filtered?.sections?.flatMap((s) => s.items || []).find((item) => item?.path);
          if (firstItem?.path) {
            markNavigating();
            navigate(firstItem.path);
          }
        }}
      />
    </>
  );
}

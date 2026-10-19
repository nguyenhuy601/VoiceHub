import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import adminUserAPI from '../../services/api/adminUserAPI';
import UserAvatar from '../Shared/UserAvatar';
import {
  accountRoleLabel,
  memberDepartmentId,
  memberDisplayName,
  memberEmail,
  memberOrgRole,
  memberStatusKey,
  memberStatusLabel,
  memberTeamId,
  memberUserId,
  formatRbacRoleLabels,
  unwrapApi,
} from '../../utils/adminUserUtils';
import { effectiveOrgRoleLabel } from '../../utils/effectiveOrgRoleLabel';
import { normalizeRoleDisplayName } from '../../utils/adminRbacUtils';
import { adminUserHubLink } from '../../utils/adminHubLinks';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';
import useModalA11y from '../Shared/useModalA11y';
import CapabilityReviewPanel from './CapabilityReviewPanel';
import useMotionPresence from '../../motion/useMotionPresence';
import { VH_MOTION_TAB_PANEL, VH_PRESENCE_DRAWER_RIGHT } from '../../motion/classes';
import { VH_MOTION_OVERLAY_MS } from '../../motion/tokens';
import { adminPrimaryBtnClass, adminSecondaryBtnClass } from './adminUserPanelUi';

const TABS = [
  { id: 'info', labelKey: 'adminUsers.tabInfo' },
  { id: 'capability', labelKey: 'adminUsers.tabCapability' },
  { id: 'access', labelKey: 'adminUsers.tabAccess' },
  { id: 'activity', labelKey: 'adminUsers.tabActivity' },
  { id: 'history', labelKey: 'adminUsers.tabHistory' },
];

const STATUS_BADGE = {
  active: 'bg-success-bg text-success',
  locked: 'bg-warning-bg text-warning',
  inactive: 'bg-muted text-muted-foreground',
  mustChangePassword: 'bg-info-bg text-info',
};

const ROLE_BADGE = {
  owner: 'bg-ai-subtle text-ai',
  admin: 'bg-ai-subtle text-ai',
  hr: 'bg-info-bg text-info',
  member: 'bg-muted text-muted-foreground',
};

const DRAWER_LINK_CLASS =
  'rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';

const INFO_CARD_CLASS = 'rounded-xl border border-border bg-muted px-3 py-3';

function StatusBadge({ member, t }) {
  const key = memberStatusKey(member);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[key] || STATUS_BADGE.active}`}>
      {memberStatusLabel(member, t)}
    </span>
  );
}

function RoleBadge({ role, t }) {
  const r = String(role || 'member').toLowerCase();
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE[r] || ROLE_BADGE.member}`}>
      {accountRoleLabel(r, t)}
    </span>
  );
}

function RbacRoleChips({ labels, t }) {
  if (!labels.length) {
    return <span className="text-muted-foreground">{t('adminUsers.userRoleNone')}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function InlineRetryAlert({ message, onRetry, t }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive bg-error-bg px-3 py-2 text-xs text-destructive"
    >
      <span>{message}</span>
      <button type="button" onClick={onRetry} className={adminSecondaryBtnClass('px-2.5 py-1 text-xs')}>
        {t('adminUsers.listRetry')}
      </button>
    </div>
  );
}

export default function AdminUserDetailDrawer({
  orgId,
  member,
  open,
  onClose,
  departmentName,
  teamName,
  rbacRoles = [],
  orgRoleRows = [],
  formatWhen,
  onCapabilityStatusChange,
  organizationalPosition = '',
}) {
  const { t } = useAppStrings();
  const { can } = useAdminActionGate(orgId);
  const canReviewCapability = can(RBAC_GRANT.EMPLOYEE_UPDATE);
  const canConfirmExperience = canReviewCapability;
  const canAssignOrgRole = can(RBAC_GRANT.ORG_ROLE_UPDATE);
  const canAssignPosition = can(RBAC_GRANT.EMPLOYEE_UPDATE);
  const canUpdateEmployee = can(RBAC_GRANT.EMPLOYEE_UPDATE);
  const [tab, setTab] = useState('info');
  const [events, setEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [employeeCode, setEmployeeCode] = useState('');
  const [employeeCodeFailed, setEmployeeCodeFailed] = useState(false);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const asideRef = useRef(null);
  const closeButtonRef = useRef(null);
  const tabRefs = useRef({});
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const tabId = (id) => `${baseId}-tab-${id}`;
  const panelId = (id) => `${baseId}-panel-${id}`;

  const isVisible = Boolean(open && member);
  const { mounted, phase } = useMotionPresence(isVisible, {
    durationMs: VH_MOTION_OVERLAY_MS,
  });
  useModalA11y({ isOpen: isVisible, onClose, containerRef: asideRef, initialFocusRef: closeButtonRef });

  const userId = member ? memberUserId(member) : '';
  const name = member ? memberDisplayName(member) : '';
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';

  const userRoleLabels = formatRbacRoleLabels(rbacRoles, (row) =>
    normalizeRoleDisplayName(row?.name || row?.role?.name)
  );

  useEffect(() => {
    if (!open) setTab('info');
  }, [open, userId]);

  useEffect(() => {
    if (!open || !orgId || !userId) {
      setEmployeeCode('');
      setEmployeeCodeFailed(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await adminUserAPI.getProfile(orgId, userId);
        const data = unwrapApi(res)?.data ?? unwrapApi(res);
        const code = String(data?.employeeCode || '').trim();
        if (!cancelled) {
          setEmployeeCode(code);
          setEmployeeCodeFailed(false);
        }
      } catch {
        if (!cancelled) {
          setEmployeeCode('');
          setEmployeeCodeFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, userId, profileReloadKey]);

  useEffect(() => {
    if (!open || !orgId || !userId || tab !== 'history') return undefined;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      setHistoryFailed(false);
      try {
        const res = await adminUserAPI.getLoginEvents(orgId, userId, { limit: 20 });
        const body = res?.data?.data ?? res?.data ?? res;
        const list = Array.isArray(body?.events) ? body.events : Array.isArray(body) ? body : [];
        if (!cancelled) setEvents(list);
      } catch {
        if (!cancelled) {
          setEvents([]);
          setHistoryFailed(true);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, userId, tab, historyReloadKey]);

  const focusTab = (index) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const handleTabKeyDown = (event, index) => {
    if (event.key === 'ArrowRight') focusTab(index + 1);
    else if (event.key === 'ArrowLeft') focusTab(index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(TABS.length - 1);
    else return;
    event.preventDefault();
  };

  if (!mounted || !member) return null;

  return (
    <div className="fixed inset-0 z-[10030] flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 vh-motion-respect motion-safe:animate-fade-in-fast motion-reduce:animate-none"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={asideRef}
        className={`relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl ${VH_PRESENCE_DRAWER_RIGHT}`}
        data-motion-phase={phase || 'enter'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              avatar={member.avatar}
              userId={userId}
              name={name}
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0">
              <h3 id={titleId} className="truncate text-base font-semibold text-foreground">
                {name}
              </h3>
              <p className="truncate text-sm text-muted-foreground">{memberEmail(member)}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          role="tablist"
          aria-label={name}
          className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-2"
        >
          {TABS.map((item, index) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  tabRefs.current[item.id] = el;
                }}
                id={tabId(item.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId(item.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  selected
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

        <div
          key={tab}
          id={panelId(tab)}
          role="tabpanel"
          aria-labelledby={tabId(tab)}
          tabIndex={0}
          className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-none ${VH_MOTION_TAB_PANEL}`}
        >
          {tab === 'info' ? (
            <dl className="space-y-3 text-sm">
              {employeeCodeFailed ? (
                <InlineRetryAlert
                  message={t('adminUsers.employeeCodeLoadFail')}
                  onRetry={() => setProfileReloadKey((k) => k + 1)}
                  t={t}
                />
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.displayName')}</dt>
                <dd className="font-medium">{name}</dd>
              </div>
              {employeeCode ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{t('adminUsers.employeeCode')}</dt>
                  <dd className="font-mono font-medium">{employeeCode}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.importEmailAddressCol')}</dt>
                <dd>{memberEmail(member)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colOrgRoleEffective')}</dt>
                <dd className="mt-1">
                  <span className="inline-flex rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {effectiveOrgRoleLabel(member, { orgRoleRows, t })}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colAccountRole')}</dt>
                <dd className="mt-1">
                  <RoleBadge role={memberOrgRole(member)} t={t} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colUserRole')}</dt>
                <dd className="mt-1">
                  <RbacRoleChips labels={userRoleLabels} t={t} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colPosition')}</dt>
                <dd>{organizationalPosition || t('adminUsers.positionNone')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colDepartment')}</dt>
                <dd>{departmentName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colTeam')}</dt>
                <dd>{teamName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colStatus')}</dt>
                <dd className="mt-1">
                  <StatusBadge member={member} t={t} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colLastLogin')}</dt>
                <dd>{formatWhen?.(member.lastLoginAt) || '—'}</dd>
              </div>
            </dl>
          ) : null}

          {tab === 'capability' ? (
            <CapabilityReviewPanel
              orgId={orgId}
              userId={userId}
              canReview={canReviewCapability}
              canConfirmExperience={canConfirmExperience}
              onStatusChange={(status) => {
                if (userId && status) onCapabilityStatusChange?.(userId, status);
              }}
            />
          ) : null}

          {tab === 'access' ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('adminUsers.colOrgRoleEffective')}</p>
                <div className="mt-1">
                  <span className="inline-flex rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {effectiveOrgRoleLabel(member, { orgRoleRows, t })}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('adminUsers.currentRole')}</p>
                <div className="mt-1">
                  <RoleBadge role={memberOrgRole(member)} t={t} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('adminUsers.currentUserRoles')}</p>
                <div className="mt-1">
                  <RbacRoleChips labels={userRoleLabels} t={t} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('adminUsers.colDepartment')}</p>
                <p className="mt-1 font-medium">{departmentName || '—'}</p>
                <p className="text-xs text-muted-foreground">
                  ID: {memberDepartmentId(member) || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('adminUsers.colTeam')}</p>
                <p className="mt-1 font-medium">{teamName || '—'}</p>
                <p className="text-xs text-muted-foreground">ID: {memberTeamId(member) || '—'}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {canAssignOrgRole ? (
                  <Link to={`/app/admin/rbac/org-roles/assign${q}`} className={DRAWER_LINK_CLASS}>
                    {t('adminUsers.assignRole')}
                  </Link>
                ) : null}
                {canUpdateEmployee ? (
                  <Link
                    to={adminUserHubLink('/app/admin/users/people-ops', userId, 'assign-org')}
                    className={DRAWER_LINK_CLASS}
                  >
                    {t('adminDomains.users.assignOrg')}
                  </Link>
                ) : null}
                {canAssignPosition ? (
                  <Link to={`/app/admin/rbac/positions/assign${q}`} className={DRAWER_LINK_CLASS}>
                    {t('adminUsers.taxonomyLinkPosition')}
                  </Link>
                ) : null}
                <Link to={`/app/admin/rbac/organization-roles/lookup${q}`} className={DRAWER_LINK_CLASS}>
                  {t('adminUsers.taxonomyLinkOrgLookup')}
                </Link>
              </div>
            </div>
          ) : null}

          {tab === 'activity' ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t('adminUsers.activityHint')}</p>
              <div className={INFO_CARD_CLASS}>
                <p className="text-xs text-muted-foreground">{t('adminUsers.colLastLogin')}</p>
                <p className="mt-1 font-medium">{formatWhen?.(member.lastLoginAt) || '—'}</p>
              </div>
              <div className={INFO_CARD_CLASS}>
                <p className="text-xs text-muted-foreground">{t('adminUsers.colStatus')}</p>
                <div className="mt-1">
                  <StatusBadge member={member} t={t} />
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="space-y-2">
              {historyLoading ? (
                <div className="space-y-2" aria-busy="true" aria-label={t('common.loading')}>
                  {Array.from({ length: 3 }, (_, idx) => (
                    <div key={idx} className="h-12 rounded-lg bg-muted motion-safe:animate-pulse" />
                  ))}
                </div>
              ) : historyFailed ? (
                <InlineRetryAlert
                  message={t('adminUsers.historyFail')}
                  onRetry={() => setHistoryReloadKey((k) => k + 1)}
                  t={t}
                />
              ) : !events.length ? (
                <p className="text-sm text-muted-foreground">{t('adminUsers.noHistory')}</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((ev, i) => (
                    <li
                      key={String(ev._id || ev.id || i)}
                      className="rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span
                          className={`font-medium ${
                            ev.success === false || ev.result === 'failed' ? 'text-destructive' : 'text-success'
                          }`}
                        >
                          {ev.success === false || ev.result === 'failed'
                            ? t('adminUsers.loginFailed')
                            : t('adminUsers.loginSuccess')}
                        </span>
                        <span className="text-muted-foreground">
                          {formatWhen?.(ev.createdAt || ev.at || ev.timestamp) || '—'}
                        </span>
                      </div>
                      {ev.ip || ev.userAgent ? (
                        <p className="mt-1 truncate text-muted-foreground">
                          {[ev.ip, ev.userAgent].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to={`/app/admin/accounts/login-history${q}`}
                className="mt-3 inline-block rounded text-xs font-medium text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {t('adminUsers.openFullHistory')}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
          <Link
            to={adminUserHubLink('/app/admin/users/people-ops', userId, 'edit')}
            className={adminPrimaryBtnClass('px-3 py-2 text-xs')}
          >
            {t('adminUsers.editInfo')}
          </Link>
          <Link to={`/app/admin/accounts/detail${q}`} className={adminSecondaryBtnClass('px-3 py-2 text-xs')}>
            {t('adminDomains.accounts.detail')}
          </Link>
        </div>
      </aside>
    </div>
  );
}

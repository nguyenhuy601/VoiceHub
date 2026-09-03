import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import adminUserAPI from '../../services/api/adminUserAPI';
import { getInitials } from '../../utils/helpers';
import {
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
import { normalizeRoleDisplayName } from '../../utils/adminRbacUtils';
import { memberJobTitle } from '../../utils/userTaxonomyUtils';
import { adminUserHubLink } from '../../utils/adminHubLinks';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import CapabilityReviewPanel from './CapabilityReviewPanel';

const TABS = [
  { id: 'info', labelKey: 'adminUsers.tabInfo' },
  { id: 'capability', labelKey: 'adminUsers.tabCapability' },
  { id: 'access', labelKey: 'adminUsers.tabAccess' },
  { id: 'activity', labelKey: 'adminUsers.tabActivity' },
  { id: 'history', labelKey: 'adminUsers.tabHistory' },
];

function StatusBadge({ member, t }) {
  const key = memberStatusKey(member);
  const styles = {
    active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    locked: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
    inactive: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    mustChangePassword: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[key] || styles.active}`}>
      {memberStatusLabel(member, t)}
    </span>
  );
}

function RoleBadge({ role }) {
  const r = String(role || 'member').toLowerCase();
  const color =
    r === 'owner' || r === 'admin'
      ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
      : r === 'hr'
        ? 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-200'
        : 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${color}`}>
      {r}
    </span>
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
  formatWhen,
  onCapabilityStatusChange,
}) {
  const { t } = useAppStrings();
  const { isFullAccess, canAccessHub } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canReviewCapability = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.SKILL_REGISTRY_REVIEW);
  const canConfirmExperience = Boolean(canAccessHub);
  const [tab, setTab] = useState('info');
  const [events, setEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [employeeCode, setEmployeeCode] = useState('');

  const userId = member ? memberUserId(member) : '';
  const name = member ? memberDisplayName(member) : '';
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';

  const userRoleLabels = formatRbacRoleLabels(rbacRoles, (row) =>
    normalizeRoleDisplayName(row?.name || row?.role?.name)
  );

  const positionTitle = member ? memberJobTitle(member) : '';

  useEffect(() => {
    if (!open) setTab('info');
  }, [open, userId]);

  useEffect(() => {
    if (!open || !orgId || !userId) {
      setEmployeeCode('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await adminUserAPI.getProfile(orgId, userId);
        const data = unwrapApi(res)?.data ?? unwrapApi(res);
        const code = String(data?.employeeCode || '').trim();
        if (!cancelled) setEmployeeCode(code);
      } catch {
        if (!cancelled) setEmployeeCode('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, userId]);

  useEffect(() => {
    if (!open || !orgId || !userId || tab !== 'history') return undefined;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const res = await adminUserAPI.getLoginEvents(orgId, userId, { limit: 20 });
        const body = res?.data?.data ?? res?.data ?? res;
        const list = Array.isArray(body?.events) ? body.events : Array.isArray(body) ? body : [];
        if (!cancelled) setEvents(list);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, userId, tab]);

  if (!open || !member) return null;

  return (
    <div className="fixed inset-0 z-[10030] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {member.avatar ? (
              <img src={member.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-sm font-bold text-white">
                {getInitials(name)}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">{name}</h3>
              <p className="truncate text-sm text-muted-foreground">{memberEmail(member)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-xs font-medium transition ${
                tab === item.id
                  ? 'border-b-2 border-red-500 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'info' ? (
            <dl className="space-y-3 text-sm">
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
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd>{memberEmail(member)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colAccountRole')}</dt>
                <dd className="mt-1">
                  <RoleBadge role={memberOrgRole(member)} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.colUserRole')}</dt>
                <dd className="mt-1">
                  {userRoleLabels.length ? (
                    <div className="flex flex-wrap gap-1">
                      {userRoleLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{t('adminUsers.userRoleNone')}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('adminUsers.jobTitle')}</dt>
                <dd>{positionTitle || t('adminUsers.taxonomyNone')}</dd>
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
                <p className="text-xs text-muted-foreground">{t('adminUsers.currentRole')}</p>
                <div className="mt-1">
                  <RoleBadge role={memberOrgRole(member)} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('adminUsers.currentUserRoles')}</p>
                <div className="mt-1">
                  {userRoleLabels.length ? (
                    <div className="flex flex-wrap gap-1">
                      {userRoleLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{t('adminUsers.userRoleNone')}</span>
                  )}
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
                <Link
                  to={`/app/admin/rbac/assign${q}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                  {t('adminUsers.assignRole')}
                </Link>
                <Link
                  to={adminUserHubLink('/app/admin/users/people-ops', memberUserId(member), 'assign-org')}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                  {t('adminDomains.users.assignOrg')}
                </Link>
                <Link
                  to={`/app/admin/rbac/positions/assign${q}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                  {t('adminUsers.taxonomyLinkPosition')}
                </Link>
                <Link
                  to={`/app/admin/rbac/organization-roles/lookup${q}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                  {t('adminUsers.taxonomyLinkOrgLookup')}
                </Link>
              </div>
            </div>
          ) : null}

          {tab === 'activity' ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t('adminUsers.activityHint')}</p>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                <p className="text-xs text-muted-foreground">{t('adminUsers.colLastLogin')}</p>
                <p className="mt-1 font-medium">{formatWhen?.(member.lastLoginAt) || '—'}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
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
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : !events.length ? (
                <p className="text-sm text-muted-foreground">{t('adminUsers.noHistory')}</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((ev, i) => (
                    <li
                      key={String(ev._id || ev.id || i)}
                      className="rounded-lg border border-border/60 px-3 py-2 text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
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
                className="mt-3 inline-block text-xs font-medium text-red-500 hover:underline"
              >
                {t('adminUsers.openFullHistory')}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
          <Link
            to={adminUserHubLink('/app/admin/users/people-ops', memberUserId(member), 'edit')}
            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
          >
            {t('adminUsers.editInfo')}
          </Link>
          <Link
            to={`/app/admin/accounts/detail${q}`}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted/40"
          >
            {t('adminDomains.accounts.detail')}
          </Link>
        </div>
      </aside>
    </div>
  );
}

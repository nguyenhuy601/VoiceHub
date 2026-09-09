import { useEffect, useMemo, useState } from 'react';
import projectAPI from '../../services/api/projectAPI';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import { unwrapApiData, formatDateTime } from '../../utils/helpers';
import { coalesceJobTitle } from '../../utils/jobTitleProfile';
import { useOrganizationsMy } from '../../hooks/queries/useOrganizationsMy';
import useUserMe from '../../hooks/useUserMe';
import { FIGMA_SETTINGS_CARD } from './figmaSettingsClasses';
import {
  capabilityFromApi,
  proficiencyTierFromLevel,
} from '../../constants/capabilityCatalog';

const isValidMongoObjectId = (s) =>
  typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);

const ACTIVITY_PROJECT_CAP = 5;
const ACTIVITY_PER_PROJECT = 8;
const ACTIVITY_FEED_MAX = 20;

function firstOrgIdFromList(list) {
  const rows = Array.isArray(list) ? list : [];
  const first = rows[0];
  const oid = first?._id ?? first?.id;
  const idStr = oid != null ? String(oid) : '';
  return isValidMongoObjectId(idStr) ? idStr : '';
}

function dash(value, fallback) {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function pctLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v * 10) / 10}%`;
}

function hoursLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v * 10) / 10}h`;
}

function activityActorId(row) {
  return String(row?.actorId || row?.actor || row?.userId || '').trim();
}

function activityAt(row) {
  const raw = row?.createdAt || row?.at || row?.timestamp;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

export default function ProfileOverviewPanel({ onEditCapability }) {
  const { t, locale } = useAppStrings();
  const { user } = useAuth();
  const userId = String(user?.id || user?._id || '').trim();
  const { me, loading: meLoading } = useUserMe({ enabled: Boolean(userId) });
  const orgsQuery = useOrganizationsMy({ enabled: Boolean(userId) });
  const orgId = firstOrgIdFromList(orgsQuery.data);
  const loading = meLoading || orgsQuery.isPending;

  const [erp, setErp] = useState(null);
  const [erpError, setErpError] = useState('');
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErpError('');
      if (!orgId || !userId || !isValidMongoObjectId(userId)) {
        if (!cancelled) setErp(null);
        return;
      }
      try {
        const erpRes = await projectAPI.getEmployeeResourceProfile(orgId, userId, {}, {
          skipPermissionDeniedToast: true,
        });
        if (cancelled) return;
        const data = unwrapApiData(erpRes) || erpRes?.data || erpRes;
        setErp(data && typeof data === 'object' ? data : null);
      } catch (err) {
        if (cancelled) return;
        setErp(null);
        setErpError(err?.response?.status === 403 ? 'forbidden' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  const projectIds = useMemo(() => {
    const fromAlloc = Array.isArray(erp?.capacity?.projectAllocations)
      ? erp.capacity.projectAllocations.map((p) => String(p.projectId || ''))
      : [];
    const fromRoles = Array.isArray(erp?.projectRoles)
      ? erp.projectRoles.map((p) => String(p.projectId || ''))
      : [];
    return [...new Set([...fromAlloc, ...fromRoles].filter(isValidMongoObjectId))].slice(
      0,
      ACTIVITY_PROJECT_CAP
    );
  }, [erp]);

  useEffect(() => {
    if (!projectIds.length) {
      setActivity([]);
      return undefined;
    }
    let cancelled = false;
    setActivityLoading(true);
    (async () => {
      const chunks = await Promise.all(
        projectIds.map(async (pid) => {
          try {
            const res = await projectAPI.getActivity(pid, { limit: ACTIVITY_PER_PROJECT });
            const raw = unwrapApiData(res);
            const list = Array.isArray(raw) ? raw : Array.isArray(res?.data?.data) ? res.data.data : [];
            const title =
              erp?.capacity?.projectAllocations?.find((p) => String(p.projectId) === pid)?.title ||
              erp?.projectRoles?.find((p) => String(p.projectId) === pid)?.title ||
              '';
            return list.map((row) => ({
              ...row,
              _projectId: pid,
              _projectTitle: title,
            }));
          } catch {
            return [];
          }
        })
      );
      if (cancelled) return;
      const flat = chunks.flat();
      const mine = flat.filter((row) => activityActorId(row) === userId);
      const pool = mine.length ? mine : flat;
      pool.sort((a, b) => activityAt(b) - activityAt(a));
      setActivity(pool.slice(0, ACTIVITY_FEED_MAX));
      setActivityLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectIds, userId, erp]);

  const capFromMe = capabilityFromApi(me?.capability);
  const cap = erp?.capability || null;
  const skills = (cap?.skills?.length ? cap.skills : capFromMe.skills) || [];
  const domains = (cap?.businessDomains?.length ? cap.businessDomains : capFromMe.businessDomains) || [];
  const certs = (cap?.certifications?.length ? cap.certifications : capFromMe.certifications) || [];
  const seniority = cap?.seniorityBand || capFromMe.seniorityBand || '';
  const primaryDomain = cap?.primaryDomain || capFromMe.primaryDomain || '';
  const years = cap?.yearsExperience ?? capFromMe.yearsExperience ?? '';

  const identity = erp?.identity || {};
  const employee = erp?.employee || {};
  const placement = erp?.placement || {};
  const capacity = erp?.capacity || {};
  const displayName =
    identity.displayName || me?.displayName || user?.displayName || t('settingsPage.userFallback');
  const jobTitle =
    String(employee.jobTitle || '').trim() || coalesceJobTitle(me);
  const employeeCode = identity.employeeCode || me?.employeeCode || '';

  const roleByProject = useMemo(() => {
    const map = new Map();
    for (const row of erp?.projectRoles || []) {
      const pid = String(row.projectId || '');
      if (!pid) continue;
      const label = row.projectRoleLabel || row.projectRoleKey || '';
      const prev = map.get(pid) || [];
      if (label) prev.push(label);
      map.set(pid, prev);
    }
    return map;
  }, [erp]);

  const allocations = Array.isArray(capacity.projectAllocations) ? capacity.projectAllocations : [];
  const projectCount = allocations.length || (erp?.projectRoles || []).length;
  const maxConcurrent = capacity.maxConcurrentProjects;

  if (loading) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 font-display text-xl font-bold text-foreground">
            {t('settingsOverview.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('settingsOverview.subtitle')}</p>
        </div>
        {typeof onEditCapability === 'function' ? (
          <button
            type="button"
            onClick={onEditCapability}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t('settingsOverview.editCapability')}
          </button>
        ) : null}
      </div>

      {!orgId ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('settingsOverview.noOrg')}
        </p>
      ) : null}
      {orgId && erpError === 'forbidden' ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('settingsOverview.erpForbidden')}
        </p>
      ) : null}

      <section className={`${FIGMA_SETTINGS_CARD} space-y-4`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settingsOverview.companyProfile')}
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          <OverviewField label={t('settingsOverview.displayName')} value={displayName} />
          <OverviewField
            label={t('settingsOverview.employeeCode')}
            value={dash(employeeCode, t('settingsOverview.empty'))}
          />
          <OverviewField
            label={t('settingsOverview.jobTitle')}
            value={dash(jobTitle, t('settingsOverview.empty'))}
          />
          <OverviewField
            label={t('settingsOverview.seniority')}
            value={
              seniority
                ? t(`settingsCapability.seniority.${seniority}`)
                : t('settingsOverview.empty')
            }
          />
          <OverviewField
            label={t('settingsOverview.department')}
            value={dash(placement.departmentName, t('settingsOverview.empty'))}
          />
          <OverviewField
            label={t('settingsOverview.team')}
            value={dash(placement.teamName, t('settingsOverview.empty'))}
          />
          <OverviewField
            label={t('settingsCapability.domain')}
            value={
              primaryDomain
                ? t(`settingsCapability.domains.${primaryDomain}`)
                : t('settingsOverview.empty')
            }
          />
          <OverviewField
            label={t('settingsCapability.years')}
            value={years === '' || years == null ? t('settingsOverview.empty') : String(years)}
          />
        </dl>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">{t('settingsCapability.skills')}</p>
          {skills.length ? (
            <ul className="flex flex-wrap gap-2">
              {skills.map((s) => {
                const tier = s.proficiencyTier || proficiencyTierFromLevel(s.level);
                return (
                  <li
                    key={s.name}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  >
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {t(`settingsCapability.tiers.${tier}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('settingsOverview.empty')}</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            {t('settingsCapability.businessDomains')}
          </p>
          {domains.length ? (
            <p className="text-sm text-foreground">
              {domains.map((d) => d.name).join(', ')}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('settingsOverview.empty')}</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            {t('settingsCapability.certifications')}
          </p>
          {certs.length ? (
            <ul className="space-y-1 text-sm text-foreground">
              {certs.map((c) => (
                <li key={`${c.name}-${c.issuer || ''}`}>
                  {c.name}
                  {c.issuer ? <span className="text-muted-foreground"> · {c.issuer}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('settingsOverview.empty')}</p>
          )}
        </div>
      </section>

      <section className={`${FIGMA_SETTINGS_CARD} space-y-4`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settingsOverview.stats')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('settingsOverview.workingHours')}
            value={hoursLabel(capacity.month?.workingHours || capacity.billingCapacityHours)}
          />
          <StatCard
            label={t('settingsOverview.allocated')}
            value={`${pctLabel(capacity.allocatedPct)} · ${hoursLabel(capacity.allocatedHoursMonth)}`}
          />
          <StatCard
            label={t('settingsOverview.available')}
            value={`${pctLabel(capacity.availablePct)} · ${hoursLabel(capacity.availableHoursMonth)}`}
          />
          <StatCard
            label={t('settingsOverview.projects')}
            value={
              maxConcurrent != null
                ? `${projectCount} / ${maxConcurrent}`
                : String(projectCount)
            }
          />
        </div>
        {allocations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('settingsOverview.colProject')}</th>
                  <th className="py-2 pr-3 font-medium">{t('settingsOverview.colRole')}</th>
                  <th className="py-2 pr-3 font-medium">{t('settingsOverview.colPct')}</th>
                  <th className="py-2 font-medium">{t('settingsOverview.colHours')}</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((row) => {
                  const pid = String(row.projectId || '');
                  const roles = (roleByProject.get(pid) || []).join(', ');
                  return (
                    <tr key={pid || row.title} className="border-b border-border/60">
                      <td className="py-2 pr-3 text-foreground">
                        {row.title || row.projectCode || pid.slice(-6)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {roles || t('settingsOverview.empty')}
                      </td>
                      <td className="py-2 pr-3 text-foreground">{pctLabel(row.allocationPct)}</td>
                      <td className="py-2 text-foreground">{hoursLabel(row.allocatedHoursMonth)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settingsOverview.noAllocations')}</p>
        )}
      </section>

      <section className={`${FIGMA_SETTINGS_CARD} space-y-3`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settingsOverview.activity')}
        </h3>
        {activityLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : activity.length ? (
          <ul className="space-y-2">
            {activity.map((row) => {
              const id = String(row._id || `${row._projectId}-${activityAt(row)}`);
              const title = row.title || row.type || t('settingsOverview.activityItem');
              return (
                <li key={id} className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row._projectTitle || row._projectId}
                    {activityAt(row)
                      ? ` · ${formatDateTime(new Date(activityAt(row)), locale)}`
                      : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settingsOverview.activityEmpty')}</p>
        )}
      </section>
    </div>
  );
}

function OverviewField({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

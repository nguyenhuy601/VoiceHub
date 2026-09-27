import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { projectAPI } from '../../../../services/api/projectAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import {
  collectResourceRoles,
  getStructured,
  isWbsLeaf,
  readAssigneeCapacity,
  staffingPersonLabel,
} from './staffingPipelineModel';
import { useProjectMemberNames } from './useProjectMemberNames';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Step 4 — Capacity & Calendar (advisory). ≤1 capacity fetch.
 */
export default function PlanningResourcesCapacityCalendarPanel({
  projectId,
  organizationId,
}) {
  const { t } = useAppStrings();
  const orgId = String(organizationId || '').trim();
  const nameByUserId = useProjectMemberNames(projectId);
  const [selectedId, setSelectedId] = useState(null);

  const wbsQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'WBS'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'WBS' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const leaves = useMemo(() => {
    const list = Array.isArray(wbsQ.data) ? wbsQ.data : [];
    return list.filter((a) => isWbsLeaf(a, list));
  }, [wbsQ.data]);

  const selected = useMemo(
    () => leaves.find((a) => String(a._id || a.id) === String(selectedId || '')) || null,
    [leaves, selectedId]
  );

  const resourceQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'RESOURCE'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'RESOURCE' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });
  const resourceRoles = useMemo(() => collectResourceRoles(resourceQ.data), [resourceQ.data]);

  const assigneeUserId = selected
    ? String(getStructured(selected).assigneeUserId || '').trim()
    : '';

  const profileQ = useQuery({
    queryKey: ['staffingEmployeeProfile', orgId, projectId, assigneeUserId],
    queryFn: async () => {
      const raw = unwrap(
        await projectAPI.getEmployeeResourceProfile(
          orgId,
          assigneeUserId,
          { projectId },
          { skipPermissionDeniedToast: true }
        )
      );
      return raw;
    },
    enabled: Boolean(orgId && projectId && assigneeUserId),
    staleTime: 60_000,
    retry: false,
  });

  const profileDenied =
    profileQ.isError &&
    (profileQ.error?.response?.status === 403 || profileQ.error?.statusCode === 403);
  const capacityView = readAssigneeCapacity(profileQ.data);
  const availablePct = capacityView.availablePct;
  const leaveDate = capacityView.leaveDate;
  const allocations = capacityView.allocations;
  const overallocated =
    (Number.isFinite(availablePct) && availablePct <= 0 && allocations.length > 0) ||
    Boolean(profileQ.data?.capacity?.allocationStatus === 'overallocated');

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('workspace.phase1StaffingCapacityIntro')}</p>
        <p className="text-[11px] text-muted-foreground">{t('workspace.phase1StaffingCapacityAdvisory')}</p>
      </div>
      {!orgId ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
          {t('workspace.phase1StaffingCapacityDenied')}
        </div>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leaves.map((a) => {
          const id = String(a._id || a.id);
          const st = getStructured(a);
          return (
            <li key={id}>
              <button
                type="button"
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:bg-muted/30"
                onClick={() => setSelectedId(id)}
              >
                <span className="line-clamp-2 text-sm font-medium">{a.title || '—'}</span>
                <span className="text-[11px] text-muted-foreground">
                  {staffingPersonLabel(st, nameByUserId, resourceRoles)
                    ? t('workspace.phase1StaffingAssignedTo', {
                        name: staffingPersonLabel(st, nameByUserId, resourceRoles),
                      })
                    : st.assigneeUserId
                      ? t('workspace.phase1StaffingAssigned')
                      : t('workspace.phase1StaffingNoAssignee')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title || t('workspace.phaseNavPlanningResourcesCapacity')}
        size="lg"
      >
      <div className="space-y-3">
        {!selected ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
            {t('workspace.phase1StaffingSelectLeaf')}
          </div>
        ) : !assigneeUserId ? (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-sm">
            <p>{t('workspace.phase1StaffingNeedAssigneeForCapacity')}</p>
            <Link
              to={buildPhase1ModulePath(projectId, 'planning/resources/match')}
              className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
            >
              {t('workspace.phaseNavPlanningResourcesMatch')} →
            </Link>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <h3 className="text-sm font-semibold">{selected.title}</h3>
            {overallocated || (Number.isFinite(availablePct) && availablePct < 20) ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <p>{t('workspace.phase1StaffingOverloadWarn')}</p>
                <Link
                  to={buildPhase1ModulePath(projectId, 'planning/resources/match')}
                  className="mt-1 inline-block font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  {t('workspace.phase1StaffingBackToMatch')} →
                </Link>
              </div>
            ) : null}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 px-2.5 py-2">
                <dt className="text-[11px] text-muted-foreground">
                  {t('workspace.phase1StaffingAvailablePctLabel')}
                </dt>
                <dd className="font-medium">
                  {Number.isFinite(availablePct)
                    ? t('workspace.phase1StaffingAvailablePct', { pct: availablePct })
                    : '—'}
                </dd>
              </div>
              <div className="rounded-lg border border-border/70 px-2.5 py-2">
                <dt className="text-[11px] text-muted-foreground">
                  {t('workspace.phase1StaffingLeaveDate')}
                </dt>
                <dd className="font-medium">
                  {leaveDate ? String(leaveDate).slice(0, 10) : '—'}
                </dd>
              </div>
            </dl>
            <div>
              <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                {t('workspace.phase1StaffingAllocations')}
              </h4>
              {profileQ.isLoading ? (
                <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
              ) : profileDenied ? (
                <p className="text-xs text-muted-foreground">{t('workspace.phase1StaffingCapacityDenied')}</p>
              ) : !allocations.length ? (
                <p className="text-xs text-muted-foreground">{t('workspace.phase1StaffingAllocEmpty')}</p>
              ) : (
                <ul className="max-h-40 divide-y divide-border overflow-auto rounded-lg border border-border text-xs">
                  {allocations.slice(0, 12).map((row, idx) => {
                    const seg = Array.isArray(row.segments) ? row.segments[0] : null;
                    const from = String(seg?.startDate || row.joinDate || '').slice(0, 10);
                    const to = String(seg?.endDate || row.leaveDate || '').slice(0, 10);
                    return (
                      <li key={row.projectId || idx} className="px-2.5 py-1.5">
                        <span className="font-medium">{row.title || row.projectCode || '—'}</span>
                        <span className="text-muted-foreground">
                          {from || to ? ` · ${from || '—'} → ${to || '—'}` : ''}
                          {row.allocationPct != null ? ` · ${row.allocationPct}%` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      </Modal>
    </div>
  );
}

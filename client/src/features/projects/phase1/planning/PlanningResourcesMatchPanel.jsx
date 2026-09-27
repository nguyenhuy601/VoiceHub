import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import Modal from '../../../../components/Shared/Modal';
import { planningAPI } from '../../../../services/api/planningAPI';
import { projectAPI } from '../../../../services/api/projectAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import {
  assessEffortReadiness,
  assigneeLabel,
  buildStaffingSuggestionCaption,
  collectResourceRoles,
  getStructured,
  inferLeafRoleKey,
  isWbsLeaf,
  planBulkStaffingAssignments,
} from './staffingPipelineModel';
import { useProjectMemberNames } from './useProjectMemberNames';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function toIsoDay(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

const SKIP_REASON_KEYS = {
  missing_role: 'workspace.phase1StaffingSkipMissingRole',
  missing_effort: 'workspace.phase1StaffingSkipMissingEffort',
  insufficient_hours: 'workspace.phase1StaffingSkipHours',
};

async function fetchAllStaffingCandidates({ orgId, projectId, roleKey, fromDate, toDate }) {
  const rows = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 40; page += 1) {
    const raw = unwrap(
      await projectAPI.listOrgResourcePool(
        orgId,
        {
          view: 'staffingMatch',
          projectId,
          projectRoleKeys: roleKey,
          fromDate,
          toDate,
          limit,
          offset,
        },
        { skipPermissionDeniedToast: true }
      )
    );
    const batch = Array.isArray(raw?.byRole?.[roleKey]) ? raw.byRole[roleKey] : [];
    rows.push(...batch);
    const hasMore = Boolean(raw?.paging?.hasMoreByRole?.[roleKey]);
    if (!hasMore) return rows;
    if (!batch.length) break;
    offset += limit;
  }
  const err = new Error('staffing pages incomplete');
  err.code = 'incomplete_pages';
  throw err;
}

/**
 * Step 3 — Resource / Employee Matching (HITL → assigneeUserId).
 * ≤1 pool fetch when leaf selected (perf).
 */
export default function PlanningResourcesMatchPanel({ projectId, organizationId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const canEdit = Boolean(capabilities.canEditPlanning);
  const [selectedId, setSelectedId] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [fieldError, setFieldError] = useState('');
  const reportFieldError = (err) => {
    const message = resolveApiErrorMessage(err, { t });
    setFieldError(message);
    toast.error(message);
  };
  const nameByUserId = useProjectMemberNames(projectId);
  const orgId = String(organizationId || '').trim();

  const projectQ = useQuery({
    queryKey: ['project', projectId, 'staffingWindow'],
    queryFn: async () => unwrap(await projectAPI.get(projectId)),
    enabled: Boolean(projectId),
  });
  const fromDate = toIsoDay(projectQ.data?.startDate);
  const toDate = toIsoDay(projectQ.data?.expectedEndDate);
  const hasWindow = Boolean(fromDate && toDate);

  const wbsQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'WBS'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'WBS' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const resourceQ = useQuery({
    queryKey: ['planningArtifacts', projectId, 'RESOURCE'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind: 'RESOURCE' }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const resourceRoles = useMemo(
    () => collectResourceRoles(resourceQ.data),
    [resourceQ.data]
  );

  const leaves = useMemo(() => {
    const list = Array.isArray(wbsQ.data) ? wbsQ.data : [];
    return list.filter((a) => isWbsLeaf(a, list));
  }, [wbsQ.data]);

  const selected = useMemo(
    () => leaves.find((a) => String(a._id || a.id) === String(selectedId || '')) || null,
    [leaves, selectedId]
  );

  const selectedRole = selected ? inferLeafRoleKey(getStructured(selected), resourceRoles) : null;
  const roleKey = selectedRole?.roleKey || '';
  const roleQueryKey = String(roleKey).trim().toLowerCase();
  const readiness = selected ? assessEffortReadiness(selected) : null;

  const assigneeUserId = selected
    ? String(getStructured(selected).assigneeUserId || '').trim()
    : '';

  const poolQ = useQuery({
    queryKey: ['staffingRoleSuggest', orgId, roleQueryKey, assigneeUserId, fromDate, toDate],
    queryFn: async () => {
      const raw = unwrap(
        await projectAPI.listOrgResourcePool(
          orgId,
          {
            view: 'staffingMatch',
            projectId,
            projectRoleKeys: roleQueryKey,
            ...(assigneeUserId ? { assigneeUserId } : {}),
            ...(hasWindow ? { fromDate, toDate } : {}),
            limit: 20,
            offset: 0,
          },
          { skipPermissionDeniedToast: true }
        )
      );
      const byRole = raw?.byRole || {};
      const rows = Array.isArray(byRole[roleQueryKey]) ? byRole[roleQueryKey] : [];
      if (!assigneeUserId) return rows;
      const idx = rows.findIndex((row) => String(row?.userId || '') === assigneeUserId);
      if (idx <= 0) return rows;
      const next = rows.slice();
      const [hit] = next.splice(idx, 1);
      next.unshift(hit);
      return next;
    },
    enabled: Boolean(orgId && roleQueryKey),
    staleTime: 60_000,
  });

  const assignMut = useMutation({
    mutationFn: async ({ userId, name }) => {
      if (!selected) return;
      const structured = {
        ...getStructured(selected),
        assigneeUserId: String(userId),
        ...(name ? { assigneeName: String(name).slice(0, 120) } : {}),
      };
      return unwrap(
        await planningAPI.updateArtifact(projectId, selected._id || selected.id, { structured })
      );
    },
    onSuccess: () => {
      setFieldError('');
      toast.success(t('workspace.phase1StaffingAssigneeSaved'));
      queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, 'WBS'] });
    },
    onMutate: () => setFieldError(''),
    onError: reportFieldError,
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      if (!hasWindow) {
        const err = new Error('missing window');
        err.code = 'missing_window';
        throw err;
      }
      const roleKeys = [
        ...new Set(
          leaves
            .map((artifact) =>
              String(inferLeafRoleKey(getStructured(artifact), resourceRoles).roleKey || '')
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        ),
      ];
      const candidatesByRole = {};
      for (const key of roleKeys) {
        candidatesByRole[key] = await fetchAllStaffingCandidates({
          orgId,
          projectId,
          roleKey: key,
          fromDate,
          toDate,
        });
      }
      const planLeaves = leaves.map((artifact) => {
        const structured = getStructured(artifact);
        return {
          id: String(artifact._id || artifact.id),
          externalKey: String(artifact.externalKey || ''),
          roleKey: String(inferLeafRoleKey(structured, resourceRoles).roleKey || '')
            .trim()
            .toLowerCase(),
          effortHours: Number(structured.effortHours),
          assigneeUserId: String(structured.assigneeUserId || '').trim(),
        };
      });
      const plan = planBulkStaffingAssignments(planLeaves, candidatesByRole);
      for (const row of plan.assignments) {
        const artifact = leaves.find((item) => String(item._id || item.id) === row.id);
        if (!artifact) continue;
        const structured = {
          ...getStructured(artifact),
          assigneeUserId: row.userId,
          ...(row.displayName ? { assigneeName: row.displayName.slice(0, 120) } : {}),
        };
        await planningAPI.updateArtifact(projectId, row.id, { structured });
      }
      return plan;
    },
    onSuccess: (plan) => {
      const skippedAssigned = plan.skipped.filter((row) => row.reason === 'already_assigned').length;
      const skippedHours = plan.skipped.filter((row) => row.reason === 'insufficient_hours').length;
      const skippedOther = plan.skipped.filter(
        (row) => row.reason !== 'already_assigned' && row.reason !== 'insufficient_hours'
      ).length;
      toast.success(
        t('workspace.phase1StaffingBulkResult', {
          assigned: plan.assignments.length,
          skippedAssigned,
          skippedHours,
          skippedOther,
        })
      );
      setBulkResult(plan);
      queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, 'WBS'] });
    },
    onError: (err) => {
      if (err?.code === 'missing_window') {
        toast.error(t('workspace.phase1StaffingBulkNeedWindow'));
        return;
      }
      if (err?.code === 'incomplete_pages') {
        toast.error(t('workspace.phase1StaffingBulkPages'));
        return;
      }
      reportFieldError(err);
    },
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const structured = { ...getStructured(selected) };
      delete structured.assigneeUserId;
      delete structured.assigneeName;
      return unwrap(
        await planningAPI.updateArtifact(projectId, selected._id || selected.id, { structured })
      );
    },
    onSuccess: () => {
      setFieldError('');
      toast.success(t('workspace.phase1StaffingAssigneeCleared'));
      queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, 'WBS'] });
    },
    onMutate: () => setFieldError(''),
    onError: reportFieldError,
  });

  return (
    <div className="space-y-3">
      {fieldError ? (
        <p className="text-sm text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('workspace.phase1StaffingMatchIntro')}</p>
        {canEdit ? (
          <button
            type="button"
            className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
            disabled={!orgId || !hasWindow || bulkMut.isPending || !leaves.length}
            onClick={() => bulkMut.mutate()}
          >
            {bulkMut.isPending
              ? t('workspace.phase1StaffingBulkRunning')
              : t('workspace.phase1StaffingBulkAccept')}
          </button>
        ) : null}
      </div>
      {canEdit && !projectQ.isLoading && !hasWindow ? (
        <p className="text-xs text-amber-700 dark:text-amber-200">
          {t('workspace.phase1StaffingBulkNeedWindow')}
        </p>
      ) : null}
      {bulkResult ? (
        <div className="space-y-1 rounded-xl border border-border bg-muted/15 px-3 py-2 text-xs">
          {bulkResult.assignments.map((row) => {
            const artifact = leaves.find((item) => String(item._id || item.id) === row.id);
            return (
              <p key={row.id}>
                <span className="font-medium">{artifact?.title || row.displayName || row.userId}</span>
                {' · '}
                {row.displayName ? `${row.displayName} · ` : ''}
                {buildStaffingSuggestionCaption(row.suggestReasons, row.remainingHoursAfter, t)}
              </p>
            );
          })}
          {bulkResult.skipped
            .filter((row) => row.reason !== 'already_assigned')
            .map((row) => {
              const artifact = leaves.find((item) => String(item._id || item.id) === row.id);
              return (
                <p key={`${row.id}-${row.reason}`} className="text-muted-foreground">
                  {artifact?.title || row.id}
                  {' · '}
                  {t(SKIP_REASON_KEYS[row.reason] || 'workspace.phase1StaffingSkipHours')}
                </p>
              );
            })}
        </div>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leaves.map((a) => {
          const id = String(a._id || a.id);
          const st = getStructured(a);
          const leafRole = inferLeafRoleKey(st, resourceRoles);
          const memberName = st.assigneeUserId
            ? String(nameByUserId[String(st.assigneeUserId)] || '').trim()
            : '';
          const personName = leafRole.fromAssigneeName
            ? memberName
            : assigneeLabel(st, nameByUserId);
          return (
            <li key={id}>
              <button
                type="button"
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-left hover:bg-muted/30"
                onClick={() => setSelectedId(id)}
              >
                <span className="line-clamp-2 text-sm font-medium">{a.title || '—'}</span>
                <span className="text-[11px] text-muted-foreground">
                  {leafRole.roleKey
                    ? t('workspace.phase1StaffingRoleLine', { role: leafRole.roleKey })
                    : t('workspace.phase1StaffingNoRole')}
                  {personName
                    ? ` · ${t('workspace.phase1StaffingAssignedTo', { name: personName })}`
                    : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title || t('workspace.phaseNavPlanningResourcesMatch')}
        size="lg"
      >
      <div className="space-y-3">
        {!selected ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
            {t('workspace.phase1StaffingSelectLeaf')}
          </div>
        ) : !roleKey ? (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-sm">
            <p>{t('workspace.phase1StaffingNeedRoleForMatch')}</p>
            <Link
              to={buildPhase1ModulePath(projectId, 'planning/resources/effort')}
              className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
            >
              {t('workspace.phaseNavPlanningResourcesEffort')} →
            </Link>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{selected.title}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {t('workspace.phase1StaffingMatchHitl')} · {t('workspace.phase1StaffingRoleLine', { role: roleKey })}
                </p>
              </div>
              {getStructured(selected).assigneeUserId && canEdit ? (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-[11px]"
                  disabled={clearMut.isPending}
                  onClick={() => clearMut.mutate()}
                >
                  {t('workspace.phase1StaffingClearAssignee')}
                </button>
              ) : null}
            </div>
            {readiness && !readiness.readyForMatch ? (
              <p className="text-xs text-amber-700 dark:text-amber-200">
                {t('workspace.phase1StaffingNotReadyForMatch')}
              </p>
            ) : null}
            {!orgId ? (
              <p className="text-xs text-destructive">{t('workspace.phase1StaffingNoOrg')}</p>
            ) : poolQ.isError ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {poolQ.error?.response?.status === 403
                  ? t('workspace.phase1StaffingPoolDenied')
                  : resolveApiErrorMessage(poolQ.error)}
              </div>
            ) : poolQ.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : !(poolQ.data || []).length ? (
              <p className="text-xs text-muted-foreground">{t('workspace.phase1StaffingPoolEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {(poolQ.data || []).map((row) => {
                  const uid = String(row.userId || row.id || '');
                  const name =
                    row.displayName || row.fullName || row.email || uid.slice(0, 8);
                  const pct =
                    row.availablePct != null
                      ? Number(row.availablePct)
                      : row.fitAvailablePct != null
                        ? Number(row.fitAvailablePct)
                        : null;
                  const current = String(getStructured(selected).assigneeUserId || '') === uid;
                  return (
                    <li
                      key={uid}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {buildStaffingSuggestionCaption(
                            row.suggestReasons,
                            row.availableHours,
                            t
                          ) ||
                            (pct != null && Number.isFinite(pct)
                              ? t('workspace.phase1StaffingAvailablePct', { pct })
                              : t('workspace.phase1StaffingAvailableUnknown'))}
                        </p>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                            current
                              ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-200'
                              : 'bg-foreground text-background'
                          }`}
                          disabled={assignMut.isPending || current}
                          onClick={() => assignMut.mutate({ userId: uid, name })}
                        >
                          {current
                            ? t('workspace.phase1StaffingAssigned')
                            : t('workspace.phase1StaffingAssign')}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      </Modal>
    </div>
  );
}

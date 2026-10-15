import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { projectAPI } from '../../../../services/api/projectAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * PM Role Effort Budget — seed / edit / approve / allocate-from-budget.
 */
export default function PlanningResourcesRoleBudgetPanel({ projectId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const canEdit = Boolean(capabilities.canEditPlanning);
  const [draftHours, setDraftHours] = useState({});
  const [allocateDraft, setAllocateDraft] = useState({});

  const budgetsQ = useQuery({
    queryKey: ['roleEffortBudgets', projectId],
    queryFn: async () => {
      const raw = unwrap(await projectAPI.listProjectRoleEffortBudgets(projectId));
      return Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const items = budgetsQ.data || [];
  const latestByKey = useMemo(() => {
    const map = new Map();
    for (const row of items) {
      const key = `${row.userId}|${row.roleKey}|${row.deliveryPhase}`;
      const prev = map.get(key);
      if (!prev || Number(row.baselineVersion) > Number(prev.baselineVersion)) {
        map.set(key, row);
      }
    }
    return [...map.values()].filter((r) => r.status !== 'superseded');
  }, [items]);

  const patchM = useMutation({
    mutationFn: ({ budgetId, hoursPerWeek }) =>
      projectAPI.patchProjectRoleEffortBudget(projectId, budgetId, { hoursPerWeek }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roleEffortBudgets', projectId] });
      toast.success(t('workspace.phase1BudgetSaved'));
    },
    onError: (err) => {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.phase1BudgetSaveFail') }));
    },
  });

  const approveM = useMutation({
    mutationFn: (budgetId) => projectAPI.approveProjectRoleEffortBudget(projectId, budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roleEffortBudgets', projectId] });
      toast.success(t('workspace.phase1BudgetApproved'));
    },
    onError: (err) => {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phase1BudgetApproveFail') })
      );
    },
  });

  const allocateM = useMutation({
    mutationFn: ({ budgetId, hours, targetType, targetId }) =>
      projectAPI.allocateProjectRoleEffortBudget(projectId, budgetId, {
        hours,
        targetType,
        targetId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roleEffortBudgets', projectId] });
      toast.success(t('workspace.phase1BudgetAllocated'));
    },
    onError: (err) => {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phase1BudgetAllocateFail') })
      );
    },
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('workspace.phase1BudgetIntro')}</p>
        <p className="text-[11px] text-muted-foreground">{t('workspace.phase1BudgetPlannedNote')}</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Link
            className="text-primary underline-offset-2 hover:underline"
            to={buildPhase1ModulePath(projectId, 'planning/resources/capacity')}
          >
            {t('workspace.phaseNavPlanningResourcesCapacity')}
          </Link>
          <Link
            className="text-primary underline-offset-2 hover:underline"
            to={buildPhase1ModulePath(projectId, 'planning/resources/effort')}
          >
            {t('workspace.phaseNavPlanningResourcesEffort')}
          </Link>
        </div>
      </div>

      {budgetsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !latestByKey.length ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
          {t('workspace.phase1BudgetEmpty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {latestByKey.map((row) => {
            const id = String(row._id || row.id);
            const hoursValue =
              draftHours[id] != null ? draftHours[id] : String(row.hoursPerWeek ?? '');
            const alloc = allocateDraft[id] || { hours: '', targetType: 'task', targetId: '' };
            return (
              <li
                key={id}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {row.roleKey} · {row.deliveryPhase}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.activityLabel || '—'} · v{row.baselineVersion} · {row.status}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('workspace.phase1BudgetResidual')}:{' '}
                      <span className="tabular-nums text-foreground">
                        {row.residualHoursPerWeek ?? 0}h/{t('workspace.phase1BudgetPerWeek')}
                      </span>
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={80}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        value={hoursValue}
                        onChange={(e) =>
                          setDraftHours((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/40"
                        disabled={patchM.isPending}
                        onClick={() =>
                          patchM.mutate({ budgetId: id, hoursPerWeek: Number(hoursValue) })
                        }
                      >
                        {t('common.save')}
                      </button>
                      {row.status !== 'approved' ? (
                        <button
                          type="button"
                          className="rounded-lg bg-primary px-2 py-1 text-xs text-primary-foreground"
                          disabled={approveM.isPending}
                          onClick={() => approveM.mutate(id)}
                        >
                          {t('workspace.phase1BudgetApprove')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
                    <label className="text-[10px] text-muted-foreground">
                      {t('workspace.phase1BudgetAllocateHours')}
                      <input
                        type="number"
                        min={0.25}
                        step={0.25}
                        className="mt-0.5 block w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        value={alloc.hours}
                        onChange={(e) =>
                          setAllocateDraft((prev) => ({
                            ...prev,
                            [id]: { ...alloc, hours: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="text-[10px] text-muted-foreground">
                      {t('workspace.phase1BudgetTargetType')}
                      <select
                        className="mt-0.5 block rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        value={alloc.targetType}
                        onChange={(e) =>
                          setAllocateDraft((prev) => ({
                            ...prev,
                            [id]: { ...alloc, targetType: e.target.value },
                          }))
                        }
                      >
                        <option value="task">task</option>
                        <option value="meeting">meeting</option>
                      </select>
                    </label>
                    <label className="text-[10px] text-muted-foreground">
                      {t('workspace.phase1BudgetTargetId')}
                      <input
                        className="mt-0.5 block w-36 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        value={alloc.targetId}
                        onChange={(e) =>
                          setAllocateDraft((prev) => ({
                            ...prev,
                            [id]: { ...alloc, targetId: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/40"
                      disabled={allocateM.isPending || !alloc.hours || !alloc.targetId}
                      onClick={() =>
                        allocateM.mutate({
                          budgetId: id,
                          hours: Number(alloc.hours),
                          targetType: alloc.targetType,
                          targetId: alloc.targetId,
                        })
                      }
                    >
                      {t('workspace.phase1BudgetAllocate')}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

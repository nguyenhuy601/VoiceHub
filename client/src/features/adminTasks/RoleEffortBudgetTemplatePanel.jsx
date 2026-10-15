import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { projectAPI } from '../../services/api/projectAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { AdminUserFormCard } from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const EMPTY_LINE = {
  roleKey: 'business_analyst',
  deliveryPhase: 'requirement_analysis',
  hoursPerWeek: 12,
  activityLabel: '',
  spreadPolicy: 'even_weeks',
  enabled: true,
};

/**
 * Org Admin / RM — Role Effort Budget template CRUD.
 */
export default function RoleEffortBudgetTemplatePanel({
  orgId: orgIdProp,
  organizationId,
  isDarkMode = false,
}) {
  const { t } = useAppStrings();
  const orgId = String(orgIdProp || organizationId || '').trim();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);

  const templatesQ = useQuery({
    queryKey: ['roleEffortBudgetTemplates', orgId],
    queryFn: async () => {
      const raw = unwrap(await projectAPI.listRoleEffortBudgetTemplates(orgId));
      return Array.isArray(raw?.items) ? raw.items : [];
    },
    enabled: Boolean(orgId),
  });

  useEffect(() => {
    const published =
      (templatesQ.data || []).find((r) => r.status === 'published') ||
      (templatesQ.data || [])[0];
    if (!published) return;
    setTitle(published.title || '');
    setLines(
      Array.isArray(published.lines) && published.lines.length
        ? published.lines.map((l) => ({ ...EMPTY_LINE, ...l }))
        : [{ ...EMPTY_LINE }]
    );
  }, [templatesQ.data]);

  const saveM = useMutation({
    mutationFn: ({ publish }) =>
      projectAPI.putRoleEffortBudgetTemplate(orgId, {
        title,
        lines,
        publish,
      }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['roleEffortBudgetTemplates', orgId] });
      toast.success(
        vars.publish
          ? t('adminTasks.roleBudgetTemplatePublished')
          : t('adminTasks.roleBudgetTemplateSaved')
      );
    },
    onError: (err) => {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('adminTasks.roleBudgetTemplateSaveFail'),
        })
      );
    },
  });

  if (!orgId) {
    return <AdminEmptyState message={t('adminTasks.roleBudgetTemplateNeedOrg')} />;
  }

  if (templatesQ.isError) {
    return (
      <AdminLoadErrorState
        message={resolveApiErrorMessage(templatesQ.error, {
          t,
          fallback: t('adminTasks.roleBudgetTemplateLoadFail'),
        })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-muted-foreground'}`}>
        {t('adminTasks.roleBudgetTemplateIntro')}
      </p>
      <AdminUserFormCard title={t('adminTasks.roleBudgetTemplateTitle')} isDarkMode={isDarkMode}>
        <label className="mb-3 block text-xs text-muted-foreground">
          {t('adminTasks.roleBudgetTemplateName')}
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <ul className="space-y-2">
          {lines.map((line, idx) => (
            <li
              key={`line-${idx}`}
              className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-5"
            >
              <input
                className="rounded border border-border bg-background px-2 py-1 text-xs"
                placeholder="roleKey"
                value={line.roleKey}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, roleKey: e.target.value };
                  setLines(next);
                }}
              />
              <input
                className="rounded border border-border bg-background px-2 py-1 text-xs"
                placeholder="deliveryPhase"
                value={line.deliveryPhase}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, deliveryPhase: e.target.value };
                  setLines(next);
                }}
              />
              <input
                type="number"
                min={0}
                max={80}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
                value={line.hoursPerWeek}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, hoursPerWeek: Number(e.target.value) };
                  setLines(next);
                }}
              />
              <input
                className="rounded border border-border bg-background px-2 py-1 text-xs sm:col-span-2"
                placeholder="activity"
                value={line.activityLabel}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...line, activityLabel: e.target.value };
                  setLines(next);
                }}
              />
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-xs"
            onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
          >
            {t('adminTasks.roleBudgetTemplateAddLine')}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-xs"
            disabled={saveM.isPending}
            onClick={() => saveM.mutate({ publish: false })}
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
            disabled={saveM.isPending}
            onClick={() => saveM.mutate({ publish: true })}
          >
            {t('adminTasks.roleBudgetTemplatePublish')}
          </button>
        </div>
      </AdminUserFormCard>
    </div>
  );
}

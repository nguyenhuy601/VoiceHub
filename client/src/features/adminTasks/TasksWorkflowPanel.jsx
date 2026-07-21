import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrap(res) {
  return unwrapTaskApiPayload(res) ?? res?.data ?? res;
}

export default function TasksWorkflowPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromKey, setFromKey] = useState('todo');
  const [toKey, setToKey] = useState('in_progress');

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setWorkflow(null);
      return;
    }
    setLoading(true);
    try {
      const res = await taskAPI.getBoardWorkflow(boardId, { organizationId: orgId });
      setWorkflow(unwrap(res));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowLoadFail') }));
      setWorkflow(null);
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const seed = async () => {
    try {
      const res = await taskAPI.seedBoardWorkflow(boardId, { organizationId: orgId });
      setWorkflow(unwrap(res));
      toast.success(t('adminTasks.workflowSeeded'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSeedFail') }));
    }
  };

  const addTransition = async () => {
    if (!workflow) return;
    const transitions = [...(workflow.transitions || []), { fromKey, toKey }];
    try {
      const res = await taskAPI.putBoardWorkflow(
        boardId,
        {
          name: workflow.name || 'Default',
          states: workflow.states,
          transitions,
        },
        { organizationId: orgId }
      );
      setWorkflow(unwrap(res));
      toast.success(t('adminTasks.workflowSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const removeTransition = async (idx) => {
    if (!workflow) return;
    const transitions = (workflow.transitions || []).filter((_, i) => i !== idx);
    try {
      const res = await taskAPI.putBoardWorkflow(
        boardId,
        {
          name: workflow.name || 'Default',
          states: workflow.states,
          transitions,
        },
        { organizationId: orgId }
      );
      setWorkflow(unwrap(res));
      toast.success(t('adminTasks.workflowSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const states = workflow?.states || [];

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.workflow')} hint={t('adminTasks.workflowHint')} wide>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminPrimaryBtnClass()} onClick={seed}>
              {t('adminTasks.workflowSeed')}
            </button>
          </div>

          {!workflow ? (
            <p className="text-sm text-muted-foreground">{t('adminTasks.workflowEmpty')}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <AdminUserFormCard title={t('adminTasks.workflowStates')}>
                <ul className="space-y-2 text-sm">
                  {states.map((s) => (
                    <li key={s.key} className="rounded-lg border border-border px-3 py-2">
                      <span className="font-mono font-medium">{s.key}</span>
                      <span className="text-muted-foreground"> — {s.label}</span>
                      {s.isInitial ? (
                        <span className="ml-2 text-xs text-emerald-600">initial</span>
                      ) : null}
                      {s.isFinal ? <span className="ml-2 text-xs text-muted-foreground">final</span> : null}
                    </li>
                  ))}
                </ul>
              </AdminUserFormCard>

              <AdminUserFormCard title={t('adminTasks.workflowTransitions')}>
                <div className="mb-3 flex flex-wrap items-end gap-2">
                  <label className={adminLabelClass()}>
                    From
                    <select
                      className={adminInputClass()}
                      value={fromKey}
                      onChange={(e) => setFromKey(e.target.value)}
                    >
                      {states.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={adminLabelClass()}>
                    To
                    <select
                      className={adminInputClass()}
                      value={toKey}
                      onChange={(e) => setToKey(e.target.value)}
                    >
                      {states.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className={adminSecondaryBtnClass()} onClick={addTransition}>
                    {t('adminTasks.workflowAddEdge')}
                  </button>
                </div>
                <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                  {(workflow.transitions || []).map((tr, idx) => (
                    <li
                      key={`${tr.fromKey}-${tr.toKey}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <span>
                        {tr.fromKey} → {tr.toKey}
                      </span>
                      <button
                        type="button"
                        className={adminDangerBtnClass('!py-1.5 text-xs')}
                        onClick={() => removeTransition(idx)}
                      >
                        {t('adminTasks.delete')}
                      </button>
                    </li>
                  ))}
                </ul>
              </AdminUserFormCard>
            </div>
          )}
        </div>
      )}
    </AdminUserPanelShell>
  );
}

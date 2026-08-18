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
  return unwrapTaskApiPayload(res) ?? res?.data?.data ?? res?.data ?? res;
}

/**
 * Phase 4 — Workflow catalog (Startup/Enterprise) + board bind / transitions.
 */
export default function TasksWorkflowPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromKey, setFromKey] = useState('todo');
  const [toKey, setToKey] = useState('in_progress');
  const [conditionRoleKey, setConditionRoleKey] = useState('');
  const [newStateKey, setNewStateKey] = useState('');
  const [newStateLabel, setNewStateLabel] = useState('');


  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const loadTemplates = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await taskAPI.listWorkflowTemplates(orgId);
      const list = unwrap(res);
      const rows = Array.isArray(list) ? list : [];
      setTemplates(rows);
      if (!selectedTemplateId && rows[0]?._id) {
        setSelectedTemplateId(String(rows[0]._id));
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowTemplateLoadFail') })
      );
      setTemplates([]);
    }
  }, [orgId, selectedTemplateId, t]);

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
    loadTemplates();
  }, [loadTemplates]);

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

  const applyTemplate = async () => {
    if (!boardId || !selectedTemplateId) return;
    try {
      const res = await taskAPI.applyBoardWorkflowTemplate(
        boardId,
        { templateId: selectedTemplateId },
        { organizationId: orgId }
      );
      const data = unwrap(res);
      setWorkflow(data?.workflow || data);
      toast.success(t('adminTasks.workflowTemplateApplied'));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowTemplateApplyFail') })
      );
    }
  };

  const persistWorkflow = async (next) => {
    const res = await taskAPI.putBoardWorkflow(
      boardId,
      {
        name: next.name || 'Default',
        states: next.states,
        transitions: next.transitions,
        templateKey: next.templateKey,
        templateId: next.templateId,
      },
      { organizationId: orgId }
    );
    setWorkflow(unwrap(res));
  };

  const addTransition = async () => {
    if (!workflow) return;
    const role = String(conditionRoleKey || '').trim();
    const conditions = role ? [`role_in_project:${role}`] : [];
    const transitions = [
      ...(workflow.transitions || []),
      {
        fromKey,
        toKey,
        name: `${fromKey}→${toKey}`,
        ...(conditions.length ? { conditions } : {}),
      },
    ];
    try {
      await persistWorkflow({ ...workflow, transitions });
      setConditionRoleKey('');
      toast.success(t('adminTasks.workflowSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const removeTransition = async (idx) => {
    if (!workflow) return;
    const transitions = (workflow.transitions || []).filter((_, i) => i !== idx);
    try {
      await persistWorkflow({ ...workflow, transitions });
      toast.success(t('adminTasks.workflowSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const addState = async () => {
    if (!workflow || !newStateKey.trim()) return;
    const key = newStateKey.trim().toLowerCase().replace(/\s+/g, '_');
    if ((workflow.states || []).some((s) => s.key === key)) {
      toast.error(t('adminTasks.workflowStateExists'));
      return;
    }
    const states = [
      ...(workflow.states || []),
      {
        key,
        label: newStateLabel.trim() || key,
        order: (workflow.states?.length || 0) + 1,
        isInitial: false,
        isFinal: false,
      },
    ];
    try {
      await persistWorkflow({ ...workflow, states });
      setNewStateKey('');
      setNewStateLabel('');
      toast.success(t('adminTasks.workflowSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const updateStateLabel = async (key, label) => {
    if (!workflow) return;
    const states = (workflow.states || []).map((s) =>
      s.key === key ? { ...s, label: String(label || s.key).trim() || s.key } : s
    );
    try {
      await persistWorkflow({ ...workflow, states });
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const removeState = async (key) => {
    if (!workflow) return;
    const states = (workflow.states || []).filter((s) => s.key !== key);
    if (!states.length) {
      toast.error(t('adminTasks.catalogNeedOneStatus'));
      return;
    }
    const keys = new Set(states.map((s) => s.key));
    const transitions = (workflow.transitions || []).filter(
      (tr) => keys.has(tr.fromKey) && keys.has(tr.toKey)
    );
    try {
      await persistWorkflow({ ...workflow, states, transitions });
      toast.success(t('adminTasks.workflowSaved'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowSaveFail') }));
    }
  };

  const states = workflow?.states || [];

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.workflow')}
      hint={t('adminTasks.workflowHintV2')}
      wide
    >
      <AdminUserFormCard title={t('adminTasks.workflowCatalog')}>
        <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.workflowCatalogHint')}</p>
        <ul className="mb-3 space-y-2">
          {templates.map((tpl) => (
            <li key={String(tpl._id)}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40">
                <input
                  type="radio"
                  name="wf-template"
                  className="mt-1"
                  checked={selectedTemplateId === String(tpl._id)}
                  onChange={() => setSelectedTemplateId(String(tpl._id))}
                />
                <span>
                  <span className="font-semibold">{tpl.name}</span>
                  {tpl.isBuiltin ? (
                    <span className="ml-2 text-[10px] uppercase text-muted-foreground">builtin</span>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {tpl.description || tpl.key} · {(tpl.statuses || tpl.states || []).length}{' '}
                    statuses
                    {Array.isArray(tpl.companySizes) && tpl.companySizes.length
                      ? ` · size: ${tpl.companySizes.join(', ')}`
                      : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {!templates.length ? (
            <li className="text-xs text-muted-foreground">{t('adminTasks.workflowTemplateEmpty')}</li>
          ) : null}
        </ul>
      </AdminUserFormCard>

      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminPrimaryBtnClass()} onClick={applyTemplate}>
              {t('adminTasks.workflowApplyTemplate')}
            </button>
            <button type="button" className={adminSecondaryBtnClass()} onClick={seed}>
              {t('adminTasks.workflowSeed')}
            </button>
          </div>

          {!workflow ? (
            <p className="text-sm text-muted-foreground">{t('adminTasks.workflowEmpty')}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <AdminUserFormCard title={t('adminTasks.workflowStates')}>
                <ul className="mb-3 space-y-2 text-sm">
                  {states.map((s) => (
                    <li key={s.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <span className="w-24 shrink-0 font-mono font-medium">{s.key}</span>
                      <input
                        className={adminInputClass()}
                        value={s.label || ''}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== s.label) void updateStateLabel(s.key, next);
                        }}
                        onChange={(e) => {
                          setWorkflow((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  states: (prev.states || []).map((row) =>
                                    row.key === s.key ? { ...row, label: e.target.value } : row
                                  ),
                                }
                              : prev
                          );
                        }}
                      />
                      {s.isInitial ? (
                        <span className="text-xs text-emerald-600">initial</span>
                      ) : null}
                      {s.isFinal ? (
                        <span className="text-xs text-muted-foreground">final</span>
                      ) : null}
                      <button
                        type="button"
                        className={adminDangerBtnClass()}
                        disabled={states.length <= 1}
                        onClick={() => void removeState(s.key)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end gap-2">
                  <label className={adminLabelClass()}>
                    Key
                    <input
                      className={adminInputClass()}
                      value={newStateKey}
                      onChange={(e) => setNewStateKey(e.target.value)}
                      placeholder="blocked"
                    />
                  </label>
                  <label className={adminLabelClass()}>
                    Label
                    <input
                      className={adminInputClass()}
                      value={newStateLabel}
                      onChange={(e) => setNewStateLabel(e.target.value)}
                      placeholder="Blocked"
                    />
                  </label>
                  <button type="button" className={adminSecondaryBtnClass()} onClick={addState}>
                    {t('adminTasks.workflowAddState')}
                  </button>
                </div>
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
                  <label className={adminLabelClass()}>
                    Role condition (master key)
                    <input
                      className={adminInputClass()}
                      value={conditionRoleKey}
                      onChange={(e) => setConditionRoleKey(e.target.value)}
                      placeholder="project_manager"
                    />
                  </label>
                  <button type="button" className={adminPrimaryBtnClass()} onClick={addTransition}>
                    {t('adminTasks.workflowAddTransition')}
                  </button>
                </div>
                <ul className="space-y-2 text-sm">
                  {(workflow.transitions || []).map((tr, idx) => (
                    <li
                      key={`${tr.fromKey}-${tr.toKey}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <span>
                        <span className="font-mono">{tr.fromKey}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="font-mono">{tr.toKey}</span>
                        {tr.name ? (
                          <span className="ml-2 text-xs text-muted-foreground">{tr.name}</span>
                        ) : null}
                        {tr.validators?.length ? (
                          <span className="ml-2 text-[10px] text-amber-700">
                            [{tr.validators.join(',')}]
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className={adminDangerBtnClass()}
                        onClick={() => removeTransition(idx)}
                      >
                        ×
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

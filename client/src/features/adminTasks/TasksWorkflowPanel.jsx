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
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

const STATE_KEY_MAX_LENGTH = 32;
const STATE_LABEL_MAX_LENGTH = 100;
const ROLE_KEY_MAX_LENGTH = 64;

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
  const [templatesError, setTemplatesError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
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
    setTemplatesError('');
    try {
      const res = await taskAPI.listWorkflowTemplates(orgId);
      const list = unwrap(res);
      const rows = Array.isArray(list) ? list : [];
      setTemplates(rows);
      setSelectedTemplateId((prev) => prev || (rows[0]?._id ? String(rows[0]._id) : ''));
    } catch (error) {
      setTemplatesError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowTemplateLoadFail') })
      );
      setTemplates([]);
    }
  }, [orgId, t]);

  const load = useCallback(async () => {
    if (!boardId) {
      setWorkflow(null);
      setLoadError('');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await taskAPI.getBoardWorkflow(boardId, { organizationId: orgId });
      setWorkflow(unwrap(res));
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.workflowLoadFail') }));
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

  const runBusy = async (action, failKey) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t(failKey) }));
    } finally {
      setBusy(false);
    }
  };

  const seed = () =>
    runBusy(async () => {
      const res = await taskAPI.seedBoardWorkflow(boardId, { organizationId: orgId });
      setWorkflow(unwrap(res));
      toast.success(t('adminTasks.workflowSeeded'));
    }, 'adminTasks.workflowSeedFail');

  const applyTemplate = () =>
    runBusy(async () => {
      const res = await taskAPI.applyBoardWorkflowTemplate(
        boardId,
        { templateId: selectedTemplateId },
        { organizationId: orgId }
      );
      const data = unwrap(res);
      setWorkflow(data?.workflow || data);
      toast.success(t('adminTasks.workflowTemplateApplied'));
    }, 'adminTasks.workflowTemplateApplyFail');

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

  const addTransition = () => {
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
    return runBusy(async () => {
      await persistWorkflow({ ...workflow, transitions });
      setConditionRoleKey('');
      toast.success(t('adminTasks.workflowSaved'));
    }, 'adminTasks.workflowSaveFail');
  };

  const removeTransition = (idx) => {
    if (!workflow) return;
    const transitions = (workflow.transitions || []).filter((_, i) => i !== idx);
    return runBusy(async () => {
      await persistWorkflow({ ...workflow, transitions });
      toast.success(t('adminTasks.workflowSaved'));
    }, 'adminTasks.workflowSaveFail');
  };

  const addState = () => {
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
    return runBusy(async () => {
      await persistWorkflow({ ...workflow, states });
      setNewStateKey('');
      setNewStateLabel('');
      toast.success(t('adminTasks.workflowSaved'));
    }, 'adminTasks.workflowSaveFail');
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

  const removeState = (key) => {
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
    return runBusy(async () => {
      await persistWorkflow({ ...workflow, states, transitions });
      toast.success(t('adminTasks.workflowSaved'));
    }, 'adminTasks.workflowSaveFail');
  };

  const confirmRemoveState = (key) => {
    const related = (workflow?.transitions || []).filter(
      (tr) => tr.fromKey === key || tr.toKey === key
    ).length;
    setPendingConfirm({
      message: t('adminTasks.workflowRemoveStateConfirm', { key, n: related }),
      confirmText: t('adminTasks.delete'),
      run: () => removeState(key),
    });
  };

  const confirmRemoveTransition = (tr, idx) => {
    setPendingConfirm({
      message: t('adminTasks.workflowRemoveTransitionConfirm', { from: tr.fromKey, to: tr.toKey }),
      confirmText: t('adminTasks.delete'),
      run: () => removeTransition(idx),
    });
  };

  const confirmSeed = () => {
    if (!boardId) return;
    setPendingConfirm({
      message: t('adminTasks.workflowSeedConfirm'),
      confirmText: t('adminTasks.workflowSeed'),
      variant: 'danger',
      run: seed,
    });
  };

  const confirmApplyTemplate = () => {
    if (!boardId || !selectedTemplateId) return;
    const tpl = templates.find((row) => String(row._id) === selectedTemplateId);
    setPendingConfirm({
      message: t('adminTasks.workflowApplyTemplateConfirm', { name: tpl?.name || selectedTemplateId }),
      confirmText: t('adminTasks.workflowApplyTemplate'),
      run: applyTemplate,
    });
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
        {templatesError ? (
          <AdminLoadErrorState className="mb-3" message={templatesError} onRetry={loadTemplates} />
        ) : null}
        <ul className="mb-3 space-y-2">
          {templates.map((tpl) => {
            const statusCount = (tpl.statuses || tpl.states || []).length;
            const sizes = Array.isArray(tpl.companySizes) ? tpl.companySizes : [];
            return (
              <li key={String(tpl._id)}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted motion-reduce:transition-none">
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
                      <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                        {t('adminTasks.workflowBuiltin')}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {tpl.description || tpl.key} · {t('adminTasks.workflowStatusCount', { n: statusCount })}
                      {sizes.length ? ` · ${t('adminTasks.workflowSize', { sizes: sizes.join(', ') })}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {!templates.length && !templatesError ? (
          <AdminEmptyState message={t('adminTasks.workflowTemplateEmpty')} />
        ) : null}
      </AdminUserFormCard>

      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading && !workflow && !loadError ? (
        <AdminListSkeleton rows={5} />
      ) : loadError ? (
        <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              disabled={busy || !selectedTemplateId}
              aria-busy={busy}
              onClick={confirmApplyTemplate}
            >
              <AdminBusySpinner busy={busy} />
              {t('adminTasks.workflowApplyTemplate')}
            </button>
            <button
              type="button"
              className={adminSecondaryBtnClass()}
              disabled={busy}
              aria-busy={busy}
              onClick={confirmSeed}
            >
              {t('adminTasks.workflowSeed')}
            </button>
          </div>

          {!workflow ? (
            <AdminEmptyState message={t('adminTasks.workflowEmpty')} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <AdminUserFormCard title={t('adminTasks.workflowStates')}>
                <ul className="mb-3 space-y-2 text-sm">
                  {states.map((s) => (
                    <li key={s.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <span className="w-24 shrink-0 font-mono font-medium">{s.key}</span>
                      <input
                        className={adminInputClass()}
                        aria-label={t('adminTasks.workflowStateLabelAria', { key: s.key })}
                        value={s.label || ''}
                        maxLength={STATE_LABEL_MAX_LENGTH}
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
                        <span className="text-xs text-success">{t('adminTasks.workflowInitial')}</span>
                      ) : null}
                      {s.isFinal ? (
                        <span className="text-xs text-muted-foreground">{t('adminTasks.workflowFinal')}</span>
                      ) : null}
                      <button
                        type="button"
                        className={adminDangerBtnClass()}
                        aria-label={t('adminTasks.workflowRemoveStateAria', { key: s.key })}
                        disabled={busy || states.length <= 1}
                        onClick={() => confirmRemoveState(s.key)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end gap-2">
                  <label className={adminLabelClass()}>
                    {t('adminTasks.workflowKey')}
                    <input
                      className={adminInputClass()}
                      value={newStateKey}
                      maxLength={STATE_KEY_MAX_LENGTH}
                      onChange={(e) => setNewStateKey(e.target.value)}
                      placeholder={t('adminTasks.workflowKeyPlaceholder')}
                    />
                  </label>
                  <label className={adminLabelClass()}>
                    {t('adminTasks.workflowLabel')}
                    <input
                      className={adminInputClass()}
                      value={newStateLabel}
                      maxLength={STATE_LABEL_MAX_LENGTH}
                      onChange={(e) => setNewStateLabel(e.target.value)}
                      placeholder={t('adminTasks.workflowLabelPlaceholder')}
                    />
                  </label>
                  <button
                    type="button"
                    className={adminSecondaryBtnClass()}
                    disabled={busy || !newStateKey.trim()}
                    onClick={addState}
                  >
                    {t('adminTasks.workflowAddState')}
                  </button>
                </div>
              </AdminUserFormCard>

              <AdminUserFormCard title={t('adminTasks.workflowTransitions')}>
                <div className="mb-3 flex flex-wrap items-end gap-2">
                  <label className={adminLabelClass()}>
                    {t('adminTasks.workflowFrom')}
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
                    {t('adminTasks.workflowTo')}
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
                    {t('adminTasks.workflowRoleCondition')}
                    <input
                      className={adminInputClass()}
                      value={conditionRoleKey}
                      maxLength={ROLE_KEY_MAX_LENGTH}
                      onChange={(e) => setConditionRoleKey(e.target.value)}
                      placeholder={t('adminTasks.workflowRolePlaceholder')}
                    />
                  </label>
                  <button type="button" className={adminPrimaryBtnClass()} disabled={busy} onClick={addTransition}>
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
                          <span className="ml-2 text-[10px] text-warning">
                            [{tr.validators.join(',')}]
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className={adminDangerBtnClass()}
                        aria-label={t('adminTasks.workflowRemoveTransitionAria', {
                          from: tr.fromKey,
                          to: tr.toKey,
                        })}
                        disabled={busy}
                        onClick={() => confirmRemoveTransition(tr, idx)}
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

      <ConfirmDialog
        isOpen={Boolean(pendingConfirm)}
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => pendingConfirm?.run()}
        title={t('adminTasks.confirmTitle')}
        message={pendingConfirm?.message}
        confirmText={pendingConfirm?.confirmText}
        cancelText={t('adminTasks.cancel')}
        variant={pendingConfirm?.variant || 'default'}
      />
    </AdminUserPanelShell>
  );
}

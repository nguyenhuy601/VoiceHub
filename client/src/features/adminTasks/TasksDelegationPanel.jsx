import { useCallback, useEffect, useId, useState } from 'react';
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
import projectDeliveryAPI from '../../services/api/projectDeliveryAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

const TASK_TYPE_MAX = 64;

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function roleLabel(role) {
  const key = String(role?.key || '').trim();
  const label = String(role?.label || '').trim();
  return label || key;
}

export default function TasksDelegationPanel({ orgId }) {
  const { t } = useAppStrings();
  const fieldId = useId();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [roles, setRoles] = useState([]);
  const [edges, setEdges] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [taskType, setTaskType] = useState('bug');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [applyingId, setApplyingId] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingTemplate, setPendingTemplate] = useState(null);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setRoles([]);
      setEdges([]);
      setTemplates([]);
      setFromKey('');
      setToKey('');
      setLoadError('');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [rolesRes, delRes] = await Promise.all([
        projectDeliveryAPI.listProjectRoles(boardId),
        projectDeliveryAPI.listDelegation(boardId),
      ]);
      const roleList = unwrap(rolesRes) || [];
      const rolesArr = Array.isArray(roleList) ? roleList : [];
      setRoles(rolesArr);
      const del = unwrap(delRes) || {};
      setEdges(del.edges || []);
      setTemplates(del.templates || []);
      const firstKey = String(rolesArr[0]?.key || '').trim();
      const secondKey = String(rolesArr[1]?.key || firstKey).trim();
      setFromKey(firstKey);
      setToKey(secondKey);
    } catch (error) {
      setLoadError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.delegationLoadFail') })
      );
      setRoles([]);
      setEdges([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const applyTemplate = async (template) => {
    if (!template?.id || applyingId) return;
    setApplyingId(String(template.id));
    try {
      await projectDeliveryAPI.applyDelegationTemplate(boardId, template.id);
      toast.success(t('adminTasks.delegationTemplateDone', { id: template.id }));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.delegationTemplateFail') })
      );
    } finally {
      setApplyingId('');
    }
  };

  const addEdge = async () => {
    if (!fromKey || !toKey || adding) return;
    setAdding(true);
    try {
      await projectDeliveryAPI.upsertDelegationEdge(boardId, {
        fromRoleKey: fromKey,
        toRoleKey: toKey,
        taskTypes: taskType ? [taskType] : ['*'],
      });
      toast.success(t('adminTasks.delegationAdded'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.delegationAddFail') }));
    } finally {
      setAdding(false);
    }
  };

  const deleteEdge = async (edge) => {
    if (!edge?._id || deletingId) return;
    setDeletingId(String(edge._id));
    try {
      await projectDeliveryAPI.deleteDelegationEdge(boardId, edge._id);
      toast.success(t('adminTasks.delegationDeleted'));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminTasks.delegationDeleteFail'),
        })
      );
    } finally {
      setDeletingId('');
    }
  };

  const edgeFromLabel = (edge) => edge?.fromRole?.label || edge?.fromRole?.key || edge?.fromRoleId;
  const edgeToLabel = (edge) => edge?.toRole?.label || edge?.toRole?.key || edge?.toRoleId;

  let body;
  if (!boardId) {
    body = <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>;
  } else if (loading && !edges.length && !roles.length && !loadError) {
    body = <AdminListSkeleton rows={5} />;
  } else if (loadError) {
    body = <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />;
  } else {
    body = (
      <div className="space-y-4">
        <AdminUserFormCard
          title={t('adminTasks.delegationEdges')}
          hint={t('adminTasks.delegationApplyTemplateHint')}
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {(templates || []).map((tpl) => {
              const busy = applyingId === String(tpl.id);
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className={adminSecondaryBtnClass('!py-1.5 text-xs')}
                  disabled={Boolean(applyingId)}
                  aria-busy={busy}
                  onClick={() => setPendingTemplate(tpl)}
                >
                  <AdminBusySpinner busy={busy} />
                  {tpl.label || tpl.id}
                </button>
              );
            })}
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`${fieldId}-from`} className={adminLabelClass()}>
                {t('adminTasks.delegationFrom')}
              </label>
              <select
                id={`${fieldId}-from`}
                className={adminInputClass()}
                value={fromKey}
                aria-label={t('adminTasks.delegationFrom')}
                onChange={(e) => setFromKey(e.target.value)}
              >
                {(roles || []).map((r) => (
                  <option key={r.key} value={r.key}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-to`} className={adminLabelClass()}>
                {t('adminTasks.delegationTo')}
              </label>
              <select
                id={`${fieldId}-to`}
                className={adminInputClass()}
                value={toKey}
                aria-label={t('adminTasks.delegationTo')}
                onChange={(e) => setToKey(e.target.value)}
              >
                {(roles || []).map((r) => (
                  <option key={r.key} value={r.key}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-taskType`} className={adminLabelClass()}>
                {t('adminTasks.delegationTaskType')}
              </label>
              <input
                id={`${fieldId}-taskType`}
                className={adminInputClass()}
                value={taskType}
                maxLength={TASK_TYPE_MAX}
                aria-label={t('adminTasks.delegationTaskType')}
                onChange={(e) => setTaskType(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              disabled={!fromKey || !toKey || adding}
              aria-busy={adding}
              onClick={() => void addEdge()}
            >
              <AdminBusySpinner busy={adding} />
              {t('adminTasks.delegationAdd')}
            </button>
          </div>

          {!edges?.length ? (
            <AdminEmptyState message={t('adminTasks.delegationEmpty')} />
          ) : (
            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {(edges || []).map((e) => {
                const busy = deletingId === String(e._id);
                return (
                  <li
                    key={String(e._id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
                  >
                    <span>
                      <span className="font-medium">{edgeFromLabel(e)}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{edgeToLabel(e)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        [{(e.taskTypes || []).join(',')}]
                      </span>
                    </span>
                    <button
                      type="button"
                      className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
                      disabled={Boolean(deletingId)}
                      aria-busy={busy}
                      onClick={() => setPendingDelete(e)}
                    >
                      <AdminBusySpinner busy={busy} />
                      {t('adminTasks.delete')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminUserFormCard>
      </div>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.delegation')}
      hint={t('adminTasks.delegationHint')}
      wide
    >
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />
      {body}

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => (pendingDelete ? deleteEdge(pendingDelete) : undefined)}
        title={t('adminTasks.confirmTitle')}
        message={
          pendingDelete
            ? t('adminTasks.delegationDeleteConfirm', {
                from: edgeFromLabel(pendingDelete),
                to: edgeToLabel(pendingDelete),
              })
            : ''
        }
        confirmText={t('adminTasks.delete')}
        cancelText={t('adminTasks.cancel')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={Boolean(pendingTemplate)}
        onClose={() => setPendingTemplate(null)}
        onConfirm={() => (pendingTemplate ? applyTemplate(pendingTemplate) : undefined)}
        title={t('adminTasks.confirmTitle')}
        message={
          pendingTemplate
            ? t('adminTasks.delegationApplyTemplateConfirm', {
                name: pendingTemplate.label || pendingTemplate.id,
              })
            : ''
        }
        confirmText={t('adminTasks.delegationApplyTemplate')}
        cancelText={t('adminTasks.cancel')}
        variant="danger"
      />
    </AdminUserPanelShell>
  );
}

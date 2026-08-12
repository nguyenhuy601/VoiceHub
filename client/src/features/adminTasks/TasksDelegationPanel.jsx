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
import projectDeliveryAPI from '../../services/api/projectDeliveryAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function TasksDelegationPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [roles, setRoles] = useState([]);
  const [edges, setEdges] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromKey, setFromKey] = useState('qa');
  const [toKey, setToKey] = useState('developer');
  const [taskType, setTaskType] = useState('bug');

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
      return;
    }
    setLoading(true);
    try {
      const [rolesRes, delRes] = await Promise.all([
        projectDeliveryAPI.listProjectRoles(boardId),
        projectDeliveryAPI.listDelegation(boardId),
      ]);
      const roleList = unwrap(rolesRes) || [];
      setRoles(Array.isArray(roleList) ? roleList : []);
      const del = unwrap(delRes) || {};
      setEdges(del.edges || []);
      setTemplates(del.templates || []);
      if (roleList?.[0]?.key) {
        setFromKey((prev) => prev || roleList[0].key);
        setToKey((prev) => prev || roleList[1]?.key || roleList[0].key);
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.delegationAddFail') }));
    } finally {
      setLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const applyTemplate = async (templateId) => {
    try {
      await projectDeliveryAPI.applyDelegationTemplate(boardId, templateId);
      toast.success(t('adminTasks.delegationTemplateDone', { id: templateId }));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.delegationTemplateFail') })
      );
    }
  };

  const addEdge = async () => {
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
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.tasks.delegation')}
      hint={t('adminTasks.delegationHint')}
      wide
    >
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="space-y-4">
          <AdminUserFormCard title={t('adminTasks.delegationEdges')}>
            <div className="mb-3 flex flex-wrap gap-2">
              {(templates || []).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={adminSecondaryBtnClass('!py-1.5 text-xs')}
                  onClick={() => applyTemplate(tpl.id)}
                >
                  {tpl.label || tpl.id}
                </button>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className={adminLabelClass()}>
                {t('adminTasks.delegationFrom')}
                <select
                  className={adminInputClass()}
                  value={fromKey}
                  onChange={(e) => setFromKey(e.target.value)}
                >
                  {(roles || []).map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className={adminLabelClass()}>
                {t('adminTasks.delegationTo')}
                <select
                  className={adminInputClass()}
                  value={toKey}
                  onChange={(e) => setToKey(e.target.value)}
                >
                  {(roles || []).map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className={adminLabelClass()}>
                {t('adminTasks.delegationTaskType')}
                <input
                  className={adminInputClass()}
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                />
              </label>
              <button type="button" className={adminPrimaryBtnClass()} onClick={addEdge}>
                {t('adminTasks.delegationAdd')}
              </button>
            </div>

            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {(edges || []).map((e) => (
                <li
                  key={String(e._id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{e.fromRole?.key || e.fromRoleId}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">{e.toRole?.key || e.toRoleId}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      [{(e.taskTypes || []).join(',')}]
                    </span>
                  </span>
                  <button
                    type="button"
                    className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
                    onClick={async () => {
                      try {
                        await projectDeliveryAPI.deleteDelegationEdge(boardId, e._id);
                        toast.success(t('adminTasks.delegationDeleted'));
                        await load();
                      } catch (error) {
                        toast.error(
                          resolveApiErrorMessage(error, {
                            t,
                            fallback: t('adminTasks.delegationDeleteFail'),
                          })
                        );
                      }
                    }}
                  >
                    {t('adminTasks.delete')}
                  </button>
                </li>
              ))}
              {!edges?.length ? (
                <li className="text-muted-foreground">{t('adminTasks.delegationEmpty')}</li>
              ) : null}
            </ul>
          </AdminUserFormCard>
        </div>
      )}
    </AdminUserPanelShell>
  );
}

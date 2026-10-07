/**
 * Admin / board owner — quản lý vai trò nhóm dự án + đồ thị ủy quyền.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectDeliveryAPI from '../../services/api/projectDeliveryAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { useAppStrings } from '../../locales/appStrings';

export default function ProjectDeliveryPanel({ boardId }) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [edges, setEdges] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [fromKey, setFromKey] = useState('qa');
  const [toKey, setToKey] = useState('developer');
  const [taskType, setTaskType] = useState('bug');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const [rolesRes, membersRes, delRes] = await Promise.all([
        projectDeliveryAPI.listProjectRoles(boardId),
        projectDeliveryAPI.listProjectMembers(boardId),
        projectDeliveryAPI.listDelegation(boardId),
      ]);
      setRoles(rolesRes?.data?.data || rolesRes?.data || []);
      setMembers(membersRes?.data?.data || membersRes?.data || []);
      const del = delRes?.data?.data || delRes?.data || {};
      setEdges(del.edges || []);
      setTemplates(del.templates || []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.deliveryLoadFail') }));
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
      toast.success(t('adminTasks.deliveryTemplateApplied', { id: templateId }));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.deliveryTemplateFail') }));
    }
  };

  const addEdge = async () => {
    try {
      await projectDeliveryAPI.upsertDelegationEdge(boardId, {
        fromRoleKey: fromKey,
        toRoleKey: toKey,
        taskTypes: taskType ? [taskType] : ['*'],
      });
      toast.success(t('adminTasks.deliveryEdgeAdded'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.deliveryEdgeAddFail') }));
    }
  };

  if (!boardId) {
    return <p className="text-sm text-muted-foreground">{t('adminTasks.deliverySelectBoard')}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">{t('adminTasks.deliveryProjectRoles')}</h3>
        <p className="text-xs text-muted-foreground mb-2">
          {t('adminTasks.deliveryProjectRolesHint')} {loading ? t('adminTasks.deliveryLoading') : ''}
        </p>
        <ul className="text-sm grid gap-1 sm:grid-cols-2">
          {(Array.isArray(roles) ? roles : []).map((r) => (
            <li key={String(r._id || r.key)} className="rounded border px-2 py-1">
              <span className="font-medium">{r.label || r.key}</span>
              <span className="text-muted-foreground"> ({r.key})</span>
              {r.canAssign ? (
                <span className="ml-2 text-xs text-emerald-600">{t('adminTasks.canAssign')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold">{t('adminTasks.deliveryProjectTeam')}</h3>
        <ul className="text-sm space-y-1 max-h-48 overflow-auto">
          {(Array.isArray(members) ? members : []).map((m) => (
            <li key={`${m.userId}-${m.projectRoleId}`} className="rounded border px-2 py-1">
              {String(m.userId)} → {m.projectRole?.label || m.projectRole?.key || m.projectRoleId}
            </li>
          ))}
          {!members?.length ? (
            <li className="text-muted-foreground">{t('adminTasks.deliveryNoMembers')}</li>
          ) : null}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold">{t('adminTasks.deliveryDelegation')}</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {(templates || []).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => applyTemplate(tpl.id)}
            >
              {t('adminTasks.deliveryTemplate', { name: tpl.label || tpl.id })}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <label className="text-xs">
            {t('adminTasks.deliveryFrom')}
            <select
              className="block border rounded px-2 py-1 mt-1"
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
          <label className="text-xs">
            {t('adminTasks.deliveryTo')}
            <select
              className="block border rounded px-2 py-1 mt-1"
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
          <label className="text-xs">
            {t('adminTasks.deliveryTaskType')}
            <input
              className="block border rounded px-2 py-1 mt-1"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              placeholder={t('adminTasks.deliveryTaskTypePlaceholder')}
            />
          </label>
          <button
            type="button"
            className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm"
            onClick={addEdge}
          >
            {t('adminTasks.deliveryAddEdge')}
          </button>
        </div>
        <ul className="text-sm space-y-1 max-h-56 overflow-auto">
          {(edges || []).map((e) => (
            <li key={String(e._id)} className="rounded border px-2 py-1 flex justify-between gap-2">
              <span>
                {e.fromRole?.key || e.fromRoleId} → {e.toRole?.key || e.toRoleId}{' '}
                <span className="text-muted-foreground">[{(e.taskTypes || []).join(',')}]</span>
              </span>
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={async () => {
                  try {
                    await projectDeliveryAPI.deleteDelegationEdge(boardId, e._id);
                    await load();
                  } catch (error) {
                    toast.error(
                      resolveApiErrorMessage(error, { t, fallback: t('adminTasks.deliveryEdgeDeleteFail') })
                    );
                  }
                }}
              >
                {t('adminTasks.delete')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

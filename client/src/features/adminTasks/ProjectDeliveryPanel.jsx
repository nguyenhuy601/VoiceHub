/**
 * Admin / board owner — quản lý Project Team roles + Delegation Graph (danh sách cạnh).
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
      toast.error(resolveApiErrorMessage(error, { t, fallback: 'Không tải được Project Delivery' }));
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
      toast.success(`Đã áp template ${templateId}`);
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: 'Áp template thất bại' }));
    }
  };

  const addEdge = async () => {
    try {
      await projectDeliveryAPI.upsertDelegationEdge(boardId, {
        fromRoleKey: fromKey,
        toRoleKey: toKey,
        taskTypes: taskType ? [taskType] : ['*'],
      });
      toast.success('Đã thêm cạnh CanAssign');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: 'Thêm cạnh thất bại' }));
    }
  };

  if (!boardId) {
    return (
      <p className="text-sm text-muted-foreground">
        Chọn một Task Board để cấu hình Project Team / Delegation Graph.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Project Roles</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Catalog Project Role (không phải HR Role / Organization Role). {loading ? 'Đang tải…' : ''}
        </p>
        <ul className="text-sm grid gap-1 sm:grid-cols-2">
          {(Array.isArray(roles) ? roles : []).map((r) => (
            <li key={String(r._id || r.key)} className="rounded border px-2 py-1">
              <span className="font-medium">{r.label || r.key}</span>
              <span className="text-muted-foreground"> ({r.key})</span>
              {r.canAssign ? (
                <span className="ml-2 text-xs text-emerald-600">canAssign</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold">Project Team</h3>
        <ul className="text-sm space-y-1 max-h-48 overflow-auto">
          {(Array.isArray(members) ? members : []).map((m) => (
            <li key={`${m.userId}-${m.projectRoleId}`} className="rounded border px-2 py-1">
              {String(m.userId)} → {m.projectRole?.label || m.projectRole?.key || m.projectRoleId}
            </li>
          ))}
          {!members?.length ? (
            <li className="text-muted-foreground">Chưa có ProjectMembership (migrate khi mở board).</li>
          ) : null}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold">Delegation Graph</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {(templates || []).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => applyTemplate(tpl.id)}
            >
              Template: {tpl.label || tpl.id}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <label className="text-xs">
            From
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
            To
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
            taskType
            <input
              className="block border rounded px-2 py-1 mt-1"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              placeholder="* hoặc bug"
            />
          </label>
          <button type="button" className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={addEdge}>
            Thêm cạnh
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
                    toast.error(resolveApiErrorMessage(error, { t, fallback: 'Xóa cạnh thất bại' }));
                  }
                }}
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

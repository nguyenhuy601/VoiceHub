import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectDeliveryAPI from '../../../services/api/projectDeliveryAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function shortRoleDisplay(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
}

/**
 * Hub Settings — Delegation Graph (board routes). Không dùng Admin chrome.
 */
export default function ProjectHubDelegationSection({ boardId = '', t, muted = '', fieldLabelCls = '', inputCls = '' }) {
  const resolvedBoardId = String(boardId || '').trim();
  const [roles, setRoles] = useState([]);
  const [edges, setEdges] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [taskType, setTaskType] = useState('bug');

  const load = useCallback(async () => {
    if (!resolvedBoardId) {
      setRoles([]);
      setEdges([]);
      setTemplates([]);
      return;
    }
    setLoading(true);
    try {
      const [rolesRes, delRes] = await Promise.all([
        projectDeliveryAPI.listProjectRoles(resolvedBoardId),
        projectDeliveryAPI.listDelegation(resolvedBoardId),
      ]);
      const roleList = unwrap(rolesRes) || [];
      const nextRoles = Array.isArray(roleList) ? roleList : [];
      setRoles(nextRoles);
      const del = unwrap(delRes) || {};
      setEdges(Array.isArray(del.edges) ? del.edges : []);
      setTemplates(Array.isArray(del.templates) ? del.templates : []);
      if (nextRoles[0]?.key) {
        setFromKey((prev) => prev || nextRoles[0].key);
        setToKey((prev) => prev || nextRoles[1]?.key || nextRoles[0].key);
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('workspace.projectHubDelegationLoadFail') })
      );
    } finally {
      setLoading(false);
    }
  }, [resolvedBoardId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const applyTemplate = async (templateId) => {
    if (!resolvedBoardId || !templateId || busy) return;
    setBusy(true);
    try {
      await projectDeliveryAPI.applyDelegationTemplate(resolvedBoardId, templateId);
      toast.success(t('workspace.projectHubDelegationTemplateDone', { id: templateId }));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('workspace.projectHubDelegationTemplateFail'),
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const addEdge = async () => {
    if (!resolvedBoardId || !fromKey || !toKey || busy) return;
    setBusy(true);
    try {
      await projectDeliveryAPI.upsertDelegationEdge(resolvedBoardId, {
        fromRoleKey: fromKey,
        toRoleKey: toKey,
        taskTypes: taskType ? [taskType] : ['*'],
      });
      toast.success(t('workspace.projectHubDelegationAdded'));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('workspace.projectHubDelegationAddFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const removeEdge = async (edgeId) => {
    if (!resolvedBoardId || !edgeId || busy) return;
    setBusy(true);
    try {
      await projectDeliveryAPI.deleteDelegationEdge(resolvedBoardId, edgeId);
      toast.success(t('workspace.projectHubDelegationDeleted'));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('workspace.projectHubDelegationDeleteFail'),
        })
      );
    } finally {
      setBusy(false);
    }
  };

  if (!resolvedBoardId) {
    return <p className={`text-xs ${muted}`}>{t('workspace.projectHubDelegationNeedBoard')}</p>;
  }

  if (loading) {
    return (
      <p className={`text-xs ${muted}`} role="status">
        {t('workspace.projectHubSettingsCatalogLoading')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className={`text-xs leading-relaxed ${muted}`}>{t('workspace.projectHubDelegationHint')}</p>

      {templates.length ? (
        <div>
          <p className={fieldLabelCls}>{t('workspace.projectHubDelegationTemplates')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {templates.map((tpl) => {
              const id = String(tpl.id || '');
              const labelKey = `workspace.projectHubDelegationTemplate_${id}`;
              const localized = t(labelKey);
              const label =
                localized && localized !== labelKey ? localized : tpl.label || id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                  onClick={() => applyTemplate(tpl.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <p className={`text-xs font-semibold text-foreground`}>
          {t('workspace.projectHubDelegationEdges')}
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className={fieldLabelCls}>
            {t('workspace.projectHubDelegationFrom')}
            <select
              className={`${inputCls} text-foreground`}
              value={fromKey}
              disabled={busy || !roles.length}
              onChange={(e) => setFromKey(e.target.value)}
            >
              {!roles.length ? <option value="">—</option> : null}
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {shortRoleDisplay(r.label, r.key)}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabelCls}>
            {t('workspace.projectHubDelegationTo')}
            <select
              className={`${inputCls} text-foreground`}
              value={toKey}
              disabled={busy || !roles.length}
              onChange={(e) => setToKey(e.target.value)}
            >
              {!roles.length ? <option value="">—</option> : null}
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {shortRoleDisplay(r.label, r.key)}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabelCls}>
            {t('workspace.projectHubDelegationTaskType')}
            <input
              className={`${inputCls} text-foreground`}
              value={taskType}
              disabled={busy}
              onChange={(e) => setTaskType(e.target.value)}
              placeholder="* | bug | task"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !fromKey || !toKey}
          className="mt-3 h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground disabled:opacity-50"
          onClick={addEdge}
        >
          {busy ? '…' : t('workspace.projectHubDelegationAdd')}
        </button>
      </div>

      <ul className="max-h-64 space-y-2 overflow-y-auto text-sm text-foreground">
        {(edges || []).map((edge) => (
          <li
            key={String(edge._id)}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-foreground"
          >
            <span className="min-w-0 text-foreground">
              <span className="font-medium text-foreground">
                {shortRoleDisplay(edge.fromRole?.label, edge.fromRole?.key || edge.fromRoleId)}
              </span>
              <span className={`px-1 ${muted}`}>→</span>
              <span className="font-medium text-foreground">
                {shortRoleDisplay(edge.toRole?.label, edge.toRole?.key || edge.toRoleId)}
              </span>
              <span className={`ml-2 text-xs ${muted}`}>
                [{(edge.taskTypes || []).join(',')}]
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              className="rounded-md px-2 py-1 text-xs font-semibold text-destructive disabled:opacity-50"
              onClick={() => removeEdge(edge._id)}
            >
              {t('workspace.projectHubDelegationDelete')}
            </button>
          </li>
        ))}
        {!edges?.length ? (
          <li className={`text-xs ${muted}`}>{t('workspace.projectHubDelegationEmpty')}</li>
        ) : null}
      </ul>
    </div>
  );
}

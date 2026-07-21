import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
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

export default function TasksProjectTeamPanel({
  orgId,
  panelTitleKey = 'adminDomains.tasks.projectTeam',
  panelHintKey = 'adminTasks.teamHint',
}) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [roleKeys, setRoleKeys] = useState('developer');
  const [saving, setSaving] = useState(false);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setRoles([]);
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const [rolesRes, membersRes] = await Promise.all([
        projectDeliveryAPI.listProjectRoles(boardId),
        projectDeliveryAPI.listProjectMembers(boardId),
      ]);
      setRoles(unwrap(rolesRes) || []);
      setMembers(unwrap(membersRes) || []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.teamRolesFail') }));
      setRoles([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const saveRoles = async (e) => {
    e.preventDefault();
    if (!boardId || !userId.trim() || saving) return;
    const keys = roleKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      await projectDeliveryAPI.setMemberRoles(boardId, userId.trim(), keys);
      toast.success(t('adminTasks.teamRolesSaved'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.teamRolesFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t(panelTitleKey)} hint={t(panelHintKey)} wide>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminUserFormCard title={t('adminTasks.teamRolesTitle')}>
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">
              {(Array.isArray(roles) ? roles : []).map((r) => (
                <li key={String(r._id || r.key)} className="rounded-lg border border-border px-3 py-2">
                  <span className="font-medium">{r.label || r.key}</span>
                  <span className="text-muted-foreground"> ({r.key})</span>
                  {r.canAssign ? (
                    <span className="ml-2 text-xs text-emerald-600">{t('adminTasks.canAssign')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminTasks.teamMembersTitle')}>
            <form className="mb-4 space-y-3" onSubmit={saveRoles}>
              <label className={adminLabelClass()}>
                {t('adminTasks.teamUserId')}
                <input
                  className={adminInputClass()}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="user ObjectId"
                />
              </label>
              <label className={adminLabelClass()}>
                {t('adminTasks.colRole')}
                <input
                  className={adminInputClass()}
                  value={roleKeys}
                  onChange={(e) => setRoleKeys(e.target.value)}
                  placeholder={t('adminTasks.teamRoleKeysPh')}
                />
              </label>
              <button type="submit" className={adminPrimaryBtnClass()} disabled={saving}>
                {t('adminTasks.teamSetRoles')}
              </button>
            </form>
            <ul className="max-h-56 space-y-1 overflow-auto text-sm">
              {(Array.isArray(members) ? members : []).map((m) => (
                <li
                  key={`${m.userId}-${m.projectRoleId}`}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <span className="font-mono text-xs">{String(m.userId)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    → {m.projectRole?.label || m.projectRole?.key || m.projectRoleId}
                  </span>
                  <button
                    type="button"
                    className={`${adminSecondaryBtnClass('!px-2 !py-1 ml-2 text-xs')}`}
                    onClick={() => {
                      setUserId(String(m.userId));
                      setRoleKeys(m.projectRole?.key || '');
                    }}
                  >
                    {t('adminTasks.teamSetRoles')}
                  </button>
                </li>
              ))}
              {!members?.length ? (
                <li className="text-muted-foreground">{t('adminTasks.teamEmpty')}</li>
              ) : null}
            </ul>
          </AdminUserFormCard>
        </div>
      )}
    </AdminUserPanelShell>
  );
}

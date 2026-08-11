import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import projectDeliveryAPI from '../../services/api/projectDeliveryAPI';
import projectAPI from '../../services/api/projectAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberUserId } from '../../utils/adminUserUtils';
import { isOtSoftWarning, readOtSoftWarningMeta } from '../../utils/otSoftWarning';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';
import OtOverrideConfirmModal from './OtOverrideConfirmModal';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function shortRoleLabel(label, key) {
  const raw = String(label || key || '').trim();
  return raw.replace(/^(Dự án —|Project —)\s*/i, '').trim() || key || '';
}

export default function TasksProjectTeamPanel({
  orgId,
  panelTitleKey = 'adminDomains.projects.members',
  panelHintKey = 'adminTasks.teamHint',
}) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const userId = useMemo(() => String(params.get('userId') || '').trim(), [params]);

  const [projectId, setProjectId] = useState('');
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoleKeys, setSelectedRoleKeys] = useState([]);
  const [saving, setSaving] = useState(false);
  const [otModal, setOtModal] = useState(null);
  const syncedUserIdRef = useRef(null);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    next.delete('userId');
    setParams(next, { replace: true });
  };

  const onProjectIdChange = useCallback((id) => {
    setProjectId(String(id || '').trim());
  }, []);

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

  /** Unique userIds đã là thành viên dự án (theo board/project đã chọn). */
  const projectMemberUserIds = useMemo(() => {
    const ids = new Set();
    for (const m of Array.isArray(members) ? members : []) {
      const id = String(m.userId || '').trim();
      if (id) ids.add(id);
    }
    return ids;
  }, [members]);

  const filterProjectMembers = useCallback(
    (member) => projectMemberUserIds.has(memberUserId(member)),
    [projectMemberUserIds]
  );

  // Bỏ chọn user nếu không thuộc project members của board hiện tại
  useEffect(() => {
    if (!boardId || loading || !userId) return;
    if (projectMemberUserIds.size === 0) return;
    if (!projectMemberUserIds.has(userId)) {
      const next = new URLSearchParams(params);
      next.delete('userId');
      setParams(next, { replace: true });
      syncedUserIdRef.current = null;
      setSelectedRoleKeys([]);
    }
  }, [boardId, loading, userId, projectMemberUserIds, params, setParams]);

  useEffect(() => {
    if (syncedUserIdRef.current === userId) return;
    syncedUserIdRef.current = userId;
    if (!userId) {
      setSelectedRoleKeys([]);
      return;
    }
    const mine = members.filter((m) => String(m.userId) === userId);
    setSelectedRoleKeys(mine.map((m) => m.projectRole?.key).filter(Boolean));
  }, [userId, members]);

  const toggleRoleKey = (key) => {
    setSelectedRoleKeys((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return [...s];
    });
  };

  const persistRoles = async ({ otOverride = false, otRationale = '' } = {}) => {
    const pid = String(projectId || '').trim();
    await projectAPI.setMemberRoles(pid, userId, [...selectedRoleKeys], {
      otOverride,
      otRationale,
    });
  };

  const saveRoles = async (e) => {
    e.preventDefault();
    if (!boardId || !userId || saving) return;
    const pid = String(projectId || '').trim();
    if (!pid) {
      toast.error(t('adminTasks.needBoard'));
      return;
    }
    setSaving(true);
    try {
      await persistRoles();
      toast.success(t('adminTasks.teamRolesSaved'));
      await load();
    } catch (error) {
      if (isOtSoftWarning(error)) {
        setOtModal(readOtSoftWarningMeta(error));
        return;
      }
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.teamRolesFail') }));
    } finally {
      setSaving(false);
    }
  };

  const confirmOtOverride = async (rationale) => {
    if (!boardId || !userId || saving) return;
    const pid = String(projectId || '').trim();
    if (!pid) return;
    setSaving(true);
    try {
      await persistRoles({ otOverride: true, otRationale: rationale });
      setOtModal(null);
      toast.success(t('adminTasks.teamRolesSaved'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.teamRolesFail') }));
    } finally {
      setSaving(false);
    }
  };

  const assignableRoles = useMemo(
    () =>
      (Array.isArray(roles) ? roles : []).filter(
        (r) => r.canAssign && r.legacyOutsideMaster !== true && r.enabled !== false
      ),
    [roles]
  );

  return (
    <AdminUserPanelShell title={t(panelTitleKey)} hint={t(panelHintKey)} wide>
      <AdminTaskBoardPicker
        orgId={orgId}
        boardId={boardId}
        onBoardIdChange={setBoardId}
        onProjectIdChange={onProjectIdChange}
      />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <AdminUserPicker
            orgId={orgId}
            selectedUserId={userId}
            hint={t('adminTasks.teamPickerHint')}
            filterFn={filterProjectMembers}
            emptyLabel={t('adminTasks.teamPickerEmpty')}
          />

          <div className="space-y-4">
            <AdminUserFormCard title={t('adminTasks.teamMembersTitle')}>
              {!userId ? (
                <p className="mb-3 text-sm text-muted-foreground">{t('adminTasks.teamSelectUserFirst')}</p>
              ) : (
                <form className="mb-4 space-y-3" onSubmit={saveRoles}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('adminTasks.teamRolesTitle')}
                  </p>
                  {assignableRoles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('adminTasks.teamNoRoles')}</p>
                  ) : (
                    <ul className="max-h-52 space-y-1 overflow-auto">
                      {assignableRoles.map((r) => {
                        const rk = String(r.key || '').trim();
                        const label = shortRoleLabel(r.label, rk);
                        const checked = selectedRoleKeys.includes(rk);
                        return (
                          <li key={rk}>
                            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRoleKey(rk)}
                                className="h-4 w-4 rounded border-border accent-primary"
                              />
                              <span className="text-sm font-medium">{label}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button
                    type="submit"
                    className={adminPrimaryBtnClass()}
                    disabled={saving || selectedRoleKeys.length === 0}
                  >
                    {saving ? '…' : t('adminTasks.teamSetRoles')}
                  </button>
                </form>
              )}

              <ul className="max-h-56 space-y-1 overflow-auto text-sm">
                {(Array.isArray(members) ? members : []).map((m) => {
                  const roleLabel = shortRoleLabel(m.projectRole?.label, m.projectRole?.key);
                  return (
                    <li
                      key={`${m.userId}-${m.projectRoleId}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="truncate text-xs text-muted-foreground">{String(m.userId)}</span>
                        <span className="ml-2 font-medium">→ {roleLabel}</span>
                      </div>
                      <button
                        type="button"
                        className={adminSecondaryBtnClass('!px-2 !py-1 text-xs shrink-0')}
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set('userId', String(m.userId));
                          setParams(next, { replace: true });
                          syncedUserIdRef.current = String(m.userId);
                          setSelectedRoleKeys([m.projectRole?.key].filter(Boolean));
                        }}
                      >
                        {t('adminTasks.teamSetRoles')}
                      </button>
                    </li>
                  );
                })}
                {!members?.length ? (
                  <li className="text-muted-foreground">{t('adminTasks.teamEmpty')}</li>
                ) : null}
              </ul>
            </AdminUserFormCard>
          </div>
        </div>
      )}

      <OtOverrideConfirmModal
        isOpen={Boolean(otModal)}
        busy={saving}
        currentActiveProjects={otModal?.currentActiveProjects}
        maxConfigured={otModal?.maxConfigured}
        title={t('adminTasks.otOverrideTitle')}
        confirmText={t('adminTasks.otOverrideConfirm')}
        cancelText={t('common.cancel')}
        rationaleLabel={t('adminTasks.otOverrideRationale')}
        rationalePlaceholder={t('adminTasks.otOverridePlaceholder')}
        rationaleRequiredText={t('adminTasks.otOverrideNeedReason')}
        onClose={() => !saving && setOtModal(null)}
        onConfirm={confirmOtOverride}
      />
    </AdminUserPanelShell>
  );
}

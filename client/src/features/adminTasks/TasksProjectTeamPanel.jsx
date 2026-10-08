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

function memberDisplayLabel(m) {
  const nested = m?.user && typeof m.user === 'object' ? m.user : null;
  const email = String(m?.email || nested?.email || '').trim();
  const emailLocal = email.includes('@') ? email.split('@')[0] : '';
  const label =
    m?.displayName ||
    nested?.displayName ||
    m?.fullName ||
    nested?.fullName ||
    m?.name ||
    nested?.name ||
    m?.username ||
    nested?.username ||
    emailLocal ||
    '';
  if (label) return String(label);
  const id = String(m?.userId || '').trim();
  return id ? id.slice(-8) : '—';
}

function roleKeysForUser(members, uid) {
  const id = String(uid || '').trim();
  if (!id) return [];
  return (Array.isArray(members) ? members : [])
    .filter((m) => String(m.userId) === id)
    .map((m) => m.projectRole?.key)
    .filter(Boolean);
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
  const [removingKey, setRemovingKey] = useState('');
  const [otModal, setOtModal] = useState(null);
  const syncedUserIdRef = useRef(null);
  /** Pending save after OT soft-warning: assign form or remove one role. */
  const pendingActionRef = useRef(null);

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
    setSelectedRoleKeys(roleKeysForUser(members, userId));
  }, [userId, members]);

  const selectMemberForEdit = useCallback(
    (memberUserId) => {
      const uid = String(memberUserId || '').trim();
      if (!uid) return;
      const next = new URLSearchParams(params);
      next.set('userId', uid);
      setParams(next, { replace: true });
      syncedUserIdRef.current = uid;
      setSelectedRoleKeys(roleKeysForUser(members, uid));
    },
    [members, params, setParams]
  );

  const toggleRoleKey = (key) => {
    setSelectedRoleKeys((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return [...s];
    });
  };

  const persistRoles = async ({
    memberUserId,
    keys,
    clearAllRoles = false,
    otOverride = false,
    otRationale = '',
  }) => {
    const pid = String(projectId || '').trim();
    await projectAPI.setMemberRoles(pid, memberUserId, [...keys], {
      otOverride,
      otRationale,
      ...(clearAllRoles ? { clearAllRoles: true } : {}),
    });
  };

  const saveRoles = async (e) => {
    e.preventDefault();
    if (!boardId || !userId || saving || removingKey) return;
    const pid = String(projectId || '').trim();
    if (!pid) {
      toast.error(t('adminTasks.needBoard'));
      return;
    }
    const keys = [...selectedRoleKeys];
    const clearAllRoles = keys.length === 0;
    if (clearAllRoles) {
      const ok = window.confirm(t('adminTasks.teamClearRolesConfirm'));
      if (!ok) return;
    }
    pendingActionRef.current = { type: 'assign', memberUserId: userId, keys, clearAllRoles };
    setSaving(true);
    try {
      await persistRoles({ memberUserId: userId, keys, clearAllRoles });
      pendingActionRef.current = null;
      toast.success(
        clearAllRoles ? t('adminTasks.teamRolesRemoved') : t('adminTasks.teamRolesSaved')
      );
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

  const removeOneRole = async (memberRow) => {
    if (!boardId || saving || removingKey) return;
    const pid = String(projectId || '').trim();
    if (!pid) {
      toast.error(t('adminTasks.needBoard'));
      return;
    }
    const uid = String(memberRow?.userId || '').trim();
    const roleKey = String(memberRow?.projectRole?.key || '').trim();
    if (!uid || !roleKey) return;

    const roleLabel = shortRoleLabel(memberRow.projectRole?.label, roleKey);
    const ok = window.confirm(
      t('adminTasks.teamRemoveRoleConfirm', { role: roleLabel || roleKey })
    );
    if (!ok) return;

    const remaining = roleKeysForUser(members, uid).filter((k) => k !== roleKey);
    const clearAllRoles = remaining.length === 0;
    pendingActionRef.current = {
      type: 'remove',
      memberUserId: uid,
      keys: remaining,
      clearAllRoles,
      roleKey,
    };
    setRemovingKey(`${uid}:${roleKey}`);
    try {
      await persistRoles({ memberUserId: uid, keys: remaining, clearAllRoles });
      pendingActionRef.current = null;
      toast.success(t('adminTasks.teamRolesRemoved'));
      if (userId === uid) {
        syncedUserIdRef.current = uid;
        setSelectedRoleKeys(remaining);
      }
      await load();
    } catch (error) {
      if (isOtSoftWarning(error)) {
        setOtModal(readOtSoftWarningMeta(error));
        return;
      }
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.teamRolesFail') }));
    } finally {
      setRemovingKey('');
    }
  };

  const confirmOtOverride = async (rationale) => {
    const pending = pendingActionRef.current;
    if (!pending || saving) return;
    const pid = String(projectId || '').trim();
    if (!pid) return;
    setSaving(true);
    try {
      await persistRoles({
        memberUserId: pending.memberUserId,
        keys: pending.keys,
        clearAllRoles: pending.clearAllRoles,
        otOverride: true,
        otRationale: rationale,
      });
      pendingActionRef.current = null;
      setOtModal(null);
      toast.success(
        pending.clearAllRoles || pending.type === 'remove'
          ? t('adminTasks.teamRolesRemoved')
          : t('adminTasks.teamRolesSaved')
      );
      if (userId === pending.memberUserId) {
        syncedUserIdRef.current = pending.memberUserId;
        setSelectedRoleKeys([...pending.keys]);
      }
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.teamRolesFail') }));
    } finally {
      setSaving(false);
      setRemovingKey('');
    }
  };

  const assignableRoles = useMemo(
    () =>
      (Array.isArray(roles) ? roles : []).filter(
        (r) => r.canAssign && r.legacyOutsideMaster !== true && r.enabled !== false
      ),
    [roles]
  );

  const busy = saving || Boolean(removingKey);
  const hadRolesBefore = userId ? roleKeysForUser(members, userId).length > 0 : false;
  const canSubmit =
    !busy &&
    Boolean(userId) &&
    (selectedRoleKeys.length > 0 || hadRolesBefore);

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
                  <button type="submit" className={adminPrimaryBtnClass()} disabled={!canSubmit}>
                    {saving
                      ? '…'
                      : selectedRoleKeys.length === 0 && hadRolesBefore
                        ? t('adminTasks.teamClearRoles')
                        : t('adminTasks.teamSetRoles')}
                  </button>
                </form>
              )}

              <ul className="max-h-56 space-y-1 overflow-auto text-sm">
                {(Array.isArray(members) ? members : []).map((m) => {
                  const roleKey = String(m.projectRole?.key || '').trim();
                  const roleLabel = shortRoleLabel(m.projectRole?.label, roleKey);
                  const rowBusy = removingKey === `${m.userId}:${roleKey}`;
                  return (
                    <li
                      key={`${m.userId}-${m.projectRoleId}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="truncate font-medium">{memberDisplayLabel(m)}</span>
                        <span className="ml-2 text-muted-foreground">→ {roleLabel || '—'}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                          disabled={busy}
                          onClick={() => selectMemberForEdit(m.userId)}
                        >
                          {t('adminTasks.teamEditRoles')}
                        </button>
                        <button
                          type="button"
                          className={adminSecondaryBtnClass('!px-2 !py-1 text-xs text-destructive')}
                          disabled={busy}
                          onClick={() => removeOneRole(m)}
                        >
                          {rowBusy ? '…' : t('adminTasks.teamRemoveRole')}
                        </button>
                      </div>
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
        onClose={() => {
          if (saving) return;
          setOtModal(null);
          pendingActionRef.current = null;
          setRemovingKey('');
        }}
        onConfirm={confirmOtOverride}
      />
    </AdminUserPanelShell>
  );
}

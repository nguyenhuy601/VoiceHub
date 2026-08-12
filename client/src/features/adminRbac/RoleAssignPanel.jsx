import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { clearAdminUserSelection } from '../../utils/adminSelectionParams';
import {
  memberDisplayName,
  memberEmail,
  memberIsWithoutRbacRole,
  memberUserId,
} from '../../utils/adminUserUtils';
import { normalizeRoleDisplayName, normalizeRoleId, unwrapList } from '../../utils/adminRbacUtils';

export default function RoleAssignPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { members, membersById } = useAdminMembers(orgId);
  const { systemRoles } = useAdminRoles(orgId);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [effectivePerms, setEffectivePerms] = useState([]);
  const [assignmentsByUser, setAssignmentsByUser] = useState({});
  const [assignmentsReady, setAssignmentsReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const reloadAssignments = useCallback(async () => {
    if (!orgId) {
      setAssignmentsByUser({});
      setAssignmentsReady(false);
      return;
    }
    setAssignmentsReady(false);
    const rows = Array.isArray(members) ? members : [];
    if (!rows.length) {
      setAssignmentsByUser({});
      setAssignmentsReady(true);
      return;
    }
    const entries = await Promise.all(
      rows.map(async (m) => {
        const uid = memberUserId(m);
        if (!uid) return ['', []];
        try {
          const res = await roleAPI.getUserRoles(uid, orgId);
          return [uid, unwrapList(res)];
        } catch {
          return [uid, []];
        }
      })
    );
    setAssignmentsByUser(Object.fromEntries(entries.filter(([uid]) => uid)));
    setAssignmentsReady(true);
  }, [orgId, members]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reloadAssignments();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadAssignments]);

  const rolelessFilter = useCallback(
    (m) => (assignmentsReady ? memberIsWithoutRbacRole(m, assignmentsByUser) : false),
    [assignmentsReady, assignmentsByUser]
  );

  const selectedMember = membersById.get(userId) || null;
  const selectedIsRoleless = selectedMember
    ? memberIsWithoutRbacRole(selectedMember, assignmentsByUser)
    : false;

  useEffect(() => {
    if (!orgId || !userId) {
      setAssignedIds(new Set());
      setEffectivePerms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [rolesRes, permsRes] = await Promise.all([
          roleAPI.getUserRoles(userId, orgId),
          roleAPI.getUserPermissions(userId, orgId),
        ]);
        if (cancelled) return;
        const list = unwrapList(rolesRes);
        const ids = new Set(
          list.map((row) => String(row?.roleId || row?._id || row?.id || row?.role?._id || '').trim()).filter(Boolean)
        );
        setAssignedIds(ids);
        const perms = permsRes?.data?.data ?? permsRes?.data ?? permsRes ?? [];
        setEffectivePerms(Array.isArray(perms) ? perms : []);
      } catch {
        if (!cancelled) {
          setAssignedIds(new Set());
          setEffectivePerms([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  const availableRoles = useMemo(
    () => systemRoles.filter((role) => !assignedIds.has(normalizeRoleId(role))),
    [systemRoles, assignedIds]
  );

  const assign = async () => {
    if (!orgId || !userId || !selectedRoleId || busy) return;
    if (!selectedIsRoleless) {
      toast.error(t('adminRbac.assignAlreadyHasRole'));
      return;
    }
    setBusy(true);
    try {
      await roleAPI.assignRoleToUser(selectedRoleId, userId, orgId);
      toast.success(t('adminRbac.assigned'));
      setSelectedRoleId('');
      await reloadAssignments();
      clearAdminUserSelection(searchParams, setSearchParams);
      setAssignedIds(new Set());
      setEffectivePerms([]);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.assignFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker
        orgId={orgId}
        selectedUserId={userId}
        hint={t('adminRbac.assignPickerHint')}
        filterFn={rolelessFilter}
        emptyLabel={t('adminRbac.assignNoRoleless')}
        subtitleFn={(m) => `${memberEmail(m)} · ${t('adminRbac.assignRolelessBadge')}`}
      />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.assign')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminRbac.assignHint')}</p>
        {!userId ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : !selectedIsRoleless && assignmentsReady ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminRbac.assignAlreadyHasRole')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {selectedMember ? (
              <p className="text-sm text-foreground">
                {t('adminRbac.assignReady', { name: memberDisplayName(selectedMember) })}
              </p>
            ) : null}
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">{t('adminRbac.selectRole')}</option>
              {availableRoles.map((role) => {
                const id = normalizeRoleId(role);
                return (
                  <option key={id} value={id}>
                    {normalizeRoleDisplayName(role.name)}
                  </option>
                );
              })}
            </select>
            <GradientButton type="button" disabled={!selectedRoleId || busy} onClick={assign}>
              {busy ? t('common.saving') : t('adminRbac.assignAction')}
            </GradientButton>
            {effectivePerms.length ? (
              <div className="mt-4 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">{t('adminRbac.effectivePermissions')}</p>
                <ul className="list-inside list-disc space-y-1">
                  {effectivePerms.slice(0, 12).map((p, i) => (
                    <li key={`${p.resource}-${i}`}>
                      {p.resource}: {(p.actions || []).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

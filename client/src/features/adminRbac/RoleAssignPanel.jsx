import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminRoles from '../../hooks/useAdminRoles';
import useRbacRolelessAssignments from '../../hooks/useRbacRolelessAssignments';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { clearAdminUserSelection } from '../../utils/adminSelectionParams';
import { memberDisplayName, memberEmail } from '../../utils/adminUserUtils';
import { normalizeRoleDisplayName, normalizeRoleId, unwrapList } from '../../utils/adminRbacUtils';

export default function RoleAssignPanel({ orgId, embedded = false, onAssigned }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { membersById } = useAdminMembers(orgId);
  const { systemRoles } = useAdminRoles(orgId);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [assignedIds, setAssignedIds] = useState(new Set());
  const [effectivePerms, setEffectivePerms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailTick, setDetailTick] = useState(0);
  const { rolelessFilter, reloadAssignments } = useRbacRolelessAssignments(orgId, {
    enabled: !embedded,
  });

  const selectedMember = membersById.get(userId) || null;
  const selectedHasAssignedRole = assignedIds.size > 0;

  useEffect(() => {
    if (!orgId || !userId) {
      setAssignedIds(new Set());
      setEffectivePerms([]);
      setDetailLoading(false);
      setDetailError('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError('');
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
      } catch (error) {
        if (!cancelled) {
          setAssignedIds(new Set());
          setEffectivePerms([]);
          setDetailError(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.loadFail') }));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t, detailTick]);

  const availableRoles = useMemo(
    () => systemRoles.filter((role) => !assignedIds.has(normalizeRoleId(role))),
    [systemRoles, assignedIds]
  );

  const assign = async () => {
    if (!orgId || !userId || !selectedRoleId || busy) return;
    if (selectedHasAssignedRole) {
      toast.error(t('adminRbac.assignAlreadyHasRole'));
      return;
    }
    setBusy(true);
    try {
      await roleAPI.assignRoleToUser(selectedRoleId, userId, orgId);
      toast.success(t('adminRbac.assigned'));
      setSelectedRoleId('');
      if (embedded) await onAssigned?.();
      else await reloadAssignments();
      clearAdminUserSelection(searchParams, setSearchParams);
      setAssignedIds(new Set());
      setEffectivePerms([]);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.assignFail') }));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <h2 className="text-lg font-semibold">{t('adminDomains.rbac.assign')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('adminRbac.assignHint')}</p>
      {!userId ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
      ) : detailLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : detailError ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {detailError}
          </p>
          <GradientButton type="button" variant="secondary" onClick={() => setDetailTick((n) => n + 1)}>
            {t('adminRbac.retry')}
          </GradientButton>
        </div>
      ) : selectedHasAssignedRole ? (
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
  );

  if (embedded) return body;

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
      {body}
    </div>
  );
}

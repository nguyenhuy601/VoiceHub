import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import MasterPermissionTreeEditor from '../../components/adminRbac/MasterPermissionTreeEditor';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isProjectMasterPermission } from '../../config/adminRbacCatalog';
import { normalizeRoleDisplayName, unwrapRoleApi } from '../../utils/adminRbacUtils';

export default function RolePermissionsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const { rolesById, loadRoles } = useAdminRoles(orgId);
  const role = rolesById.get(roleId);

  const [tree, setTree] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [grantsDraft, setGrantsDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await roleAPI.getRbacCatalog();
        const data = unwrapRoleApi(res) || res?.data?.data || res?.data;
        if (!cancelled) setTree(data?.tree || []);
      } catch (_) {
        if (!cancelled) setTree([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orgId || !roleId) {
      setBindings([]);
      setGroupId('');
      setGrantsDraft({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await roleAPI.listRolePermissionGroups(roleId, orgId);
        const data = unwrapRoleApi(res) || res?.data?.data || res?.data || [];
        const list = Array.isArray(data) ? data : [];
        if (cancelled) return;
        setBindings(list);
        const first = list.find((b) => b.group)?.group || list[0]?.group;
        const gid = first?._id || first?.id || '';
        setGroupId(String(gid));
        const grants = first?.grants || [];
        const draft = {};
        for (const g of grants) {
          if (!isProjectMasterPermission(g)) draft[g] = true;
        }
        setGrantsDraft(draft);
      } catch (error) {
        if (!cancelled) {
          setBindings([]);
          toast.error(
            resolveApiErrorMessage(error, { t, fallback: 'Không tải được Permission Groups của role' })
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, roleId, t]);

  const activeGroup = useMemo(() => {
    const hit = bindings.find((b) => String(b.group?._id || b.permissionGroupId) === String(groupId));
    return hit?.group || null;
  }, [bindings, groupId]);

  const setMany = (keys, value) => {
    setGrantsDraft((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        if (value) next[key] = true;
        else delete next[key];
      }
      return next;
    });
  };

  const onSelectGroup = (gid) => {
    setGroupId(gid);
    const hit = bindings.find((b) => String(b.group?._id || b.permissionGroupId) === String(gid));
    const grants = hit?.group?.grants || [];
    const draft = {};
    for (const g of grants) {
      if (!isProjectMasterPermission(g)) draft[g] = true;
    }
    setGrantsDraft(draft);
  };

  const save = async () => {
    if (!orgId || !roleId || !groupId || busy) return;
    setBusy(true);
    try {
      const grants = Object.keys(grantsDraft).filter((k) => grantsDraft[k] && !isProjectMasterPermission(k));
      await roleAPI.setPermissionGroupGrants(groupId, {
        organizationId: orgId,
        serverId: orgId,
        grants,
      });
      toast.success(t('adminRbac.permissionsSaved'));
      await loadRoles();
      const res = await roleAPI.listRolePermissionGroups(roleId, orgId);
      const data = unwrapRoleApi(res) || res?.data?.data || res?.data || [];
      setBindings(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.permissionsSaveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <AdminRolePicker orgId={orgId} selectedRoleId={roleId} hint={t('adminRbac.permissionsPickerHint')} />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t('adminDomains.rbac.permissions')}</h2>
            <p className="text-sm text-muted-foreground">{t('adminRbac.permissionsHint')}</p>
            {role ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Role: <span className="font-medium text-foreground">{normalizeRoleDisplayName(role.name)}</span>
                {activeGroup ? (
                  <>
                    {' '}
                    · Group: <span className="font-medium text-foreground">{activeGroup.name}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          {role && groupId ? (
            <GradientButton type="button" disabled={busy} onClick={save}>
              {busy ? t('common.saving') : t('common.save')}
            </GradientButton>
          ) : null}
        </div>

        {!roleId || !role ? (
          <p className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
            {t('adminRbac.selectRoleFirst')}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !bindings.length ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            Role chưa gắn Permission Group. Hãy clone template (màn Create) hoặc chạy direct-replace.
          </p>
        ) : (
          <>
            {bindings.length > 1 ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Permission Group</span>
                <select
                  className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={groupId}
                  onChange={(e) => onSelectGroup(e.target.value)}
                >
                  {bindings.map((b) => {
                    const id = String(b.group?._id || b.permissionGroupId);
                    const name = b.group?.name || id;
                    return (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
            <MasterPermissionTreeEditor
              tree={tree}
              excludeCategoryKeys={['project']}
              grantsDraft={grantsDraft}
              editable
              onToggle={(key) => {
                if (isProjectMasterPermission(key)) return;
                setGrantsDraft((prev) => {
                  const next = { ...prev };
                  if (next[key]) delete next[key];
                  else next[key] = true;
                  return next;
                });
              }}
              onSetMany={(keys, value) =>
                setMany(
                  (keys || []).filter((k) => !isProjectMasterPermission(k)),
                  value
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

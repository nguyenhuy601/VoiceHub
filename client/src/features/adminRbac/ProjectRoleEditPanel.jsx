import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { projectRoleAdminAPI } from '../../services/api/projectRoleAdminAPI';
import {
  PROJECT_ROLE_LABEL_PREFIX,
  looksLikeOrgStructureForProjectRole,
  normalizeLayerLabel,
  splitLayerLabel,
} from '../../utils/roleLayerNaming';

const PERMISSION_GROUPS = [
  {
    title: 'Project',
    keys: ['project:view', 'project:edit', 'project:archive', 'project:delete'],
  },
  {
    title: 'Task',
    keys: [
      'task:view',
      'task:create',
      'task:update',
      'task:change_status',
      'task:delete',
      'task:assign',
      'task:comment',
      'task:estimate',
      'story:create',
      'story:update',
      'bug:create',
    ],
  },
  {
    title: 'Epic / Sprint / Backlog',
    keys: [
      'epic:create',
      'epic:update',
      'epic:delete',
      'sprint:view',
      'sprint:create',
      'sprint:start',
      'sprint:close',
      'sprint:delete',
      'backlog:view',
      'backlog:update',
      'backlog:prioritize',
    ],
  },
  {
    title: 'Approval / Delivery / Report',
    keys: [
      'approval:request',
      'approval:decide',
      'approval:manage_policy',
      'delivery:view',
      'delivery:manage',
      'report:view',
    ],
  },
  {
    title: 'Repository',
    keys: ['repository:view', 'repository:push', 'repository:merge'],
  },
  {
    title: 'Wiki / Meeting / Release',
    keys: ['wiki:view', 'wiki:edit', 'meeting:view', 'meeting:create', 'release:view', 'release:create'],
  },
  {
    title: 'Files / Members / Settings',
    keys: [
      'files:view',
      'files:upload',
      'files:delete',
      'members:view',
      'members:manage',
      'settings:view',
      'settings:update',
    ],
  },
];

function shortRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || key || '—';
}

function unwrapRoles(res) {
  const data = res?.data?.data || res?.data?.roles || res?.data || [];
  return Array.isArray(data) ? data : [];
}

export default function ProjectRoleEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [suffix, setSuffix] = useState('');
  const [canAssign, setCanAssign] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState(() => new Set());

  const role = useMemo(
    () => roles.find((r) => String(r._id || r.id) === roleId) || null,
    [roles, roleId]
  );

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectRoleAdminAPI.listRoles(orgId);
      const list = unwrapRoles(res);
      setRoles(list);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (!role) {
      setSuffix('');
      setCanAssign(false);
      setSelectedPerms(new Set());
      return;
    }
    setSuffix(splitLayerLabel(role?.label || '', 'project').suffix || role?.label || '');
    setCanAssign(Boolean(role?.canAssign));
    setSelectedPerms(new Set(Array.isArray(role?.permissions) ? role.permissions.map(String) : []));
  }, [role]);

  const selectRole = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('roleId', String(id));
    else next.delete('roleId');
    setSearchParams(next, { replace: true });
  };

  const togglePerm = (key) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!orgId || !roleId || !role || busy) return;
    setBusy(true);
    try {
      const body = {
        permissions: [...selectedPerms],
      };
      if (!role.isSystem) {
        if (!suffix.trim()) {
          toast.error(t('adminRbac.projectRoleLabelRequired') || 'Label bắt buộc');
          setBusy(false);
          return;
        }
        body.label = normalizeLayerLabel(suffix, 'project');
        body.canAssign = canAssign;
      }
      const res = await projectRoleAdminAPI.updateRole(orgId, roleId, body);
      const saved = res?.data?.data || res?.data || res || {};
      const savedPerms = Array.isArray(saved.permissions)
        ? saved.permissions.map(String)
        : [];
      const missing = body.permissions.filter((k) => !savedPerms.includes(k));
      if (missing.length) {
        toast.error(
          t('adminRbac.projectRolePermNotSaved', { keys: missing.join(', ') }) ||
            `Không lưu được quyền: ${missing.join(', ')}. Cần deploy project-service.`
        );
      } else {
        toast.success(t('common.saveSuccess'));
      }
      setSelectedPerms(new Set(savedPerms));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.projectRoleEdit')}
      hint={t('adminRbac.projectRolePermissionsHint') || 'Permission Matrix (resource:action) cho Project Role.'}
      wide
    >
      {loading && !roles.length ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <AdminUserFormCard title={t('adminRbac.editPickerHint') || 'Chọn Project Role'}>
            <ul className="max-h-[28rem] space-y-1 overflow-auto">
              {roles.map((r) => {
                const id = String(r._id || r.id || '');
                const active = id === roleId;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => selectRole(id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'border-primary/40 bg-primary/10 font-semibold text-foreground'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <span className="block truncate">
                        {shortRoleLabel(r.label, r.key)}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                        {r.key}
                        {r.isSystem ? ' · system' : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!roles.length ? (
                <li className="text-xs text-muted-foreground">{t('adminRbac.projectRoleCatalogEmpty')}</li>
              ) : null}
            </ul>
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminDomains.rbac.projectRoleEdit')}>
            {!roleId || !role ? (
              <p className="text-sm text-muted-foreground">{t('adminRbac.selectRoleFirst')}</p>
            ) : (
              <>
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <div className="font-medium">
                    {t('adminRbac.roleKeyField')}: {role.key}
                  </div>
                  {role.isSystem ? <div className="mt-1 text-xs text-emerald-700">System</div> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{t('adminRbac.roleKeyImmutableHint')}</p>
                </div>

                <label className="mb-4 block">
                  <span className={adminLabelClass()}>{t('adminRbac.roleLabelField')}</span>
                  <div className="flex overflow-hidden rounded-lg border border-border bg-background">
                    <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {PROJECT_ROLE_LABEL_PREFIX.trimEnd()}
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      disabled={role.isSystem}
                      placeholder={t('adminRbac.projectRoleLabelPlaceholder')}
                    />
                  </div>
                  {suffix.trim() && looksLikeOrgStructureForProjectRole(suffix) ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {t('adminRbac.projectRoleLooksLikeOrgHint')}
                    </p>
                  ) : null}
                </label>

                <label className="mb-4 flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    checked={canAssign}
                    onChange={(e) => setCanAssign(e.target.checked)}
                    disabled={role.isSystem}
                  />
                  <span className="text-muted-foreground">{t('adminRbac.canAssignField')}</span>
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} className={adminPrimaryBtnClass()} onClick={submit}>
                    {busy ? t('common.saving') : t('common.save')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={adminSecondaryBtnClass()}
                    onClick={() => navigate('/app/admin/rbac/project-roles')}
                  >
                    {t('common.cancel') || 'Cancel'}
                  </button>
                </div>
              </>
            )}
          </AdminUserFormCard>

          {role ? (
            <AdminUserFormCard title={t('adminRbac.permissionMatrixTitle') || 'Permission Matrix'}>
              <p className="mb-3 text-xs text-muted-foreground">
                {t('adminRbac.permissionMatrixHint') ||
                  'System roles: chỉ sửa permissions. Custom roles: sửa label + canAssign + permissions.'}
              </p>
              <div className="max-h-[28rem] space-y-4 overflow-auto pr-1">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </p>
                    <ul className="space-y-1">
                      {group.keys.map((key) => (
                        <li key={key}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted/40">
                            <input
                              type="checkbox"
                              checked={selectedPerms.has(key)}
                              onChange={() => togglePerm(key)}
                              className="h-4 w-4 rounded border-border accent-primary"
                            />
                            <span className="font-mono text-xs">{key}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </AdminUserFormCard>
          ) : (
            <AdminUserFormCard title={t('adminRbac.permissionMatrixTitle') || 'Permission Matrix'}>
              <p className="text-sm text-muted-foreground">{t('adminRbac.selectRoleFirst')}</p>
            </AdminUserFormCard>
          )}
        </div>
      )}
    </AdminUserPanelShell>
  );
}

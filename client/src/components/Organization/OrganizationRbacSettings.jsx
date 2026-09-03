import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Shield,
  Briefcase,
  UserCog,
  Search,
  Plus,
  Pencil,
  Copy,
  Trash2,
  X,
  Check,
  Info,
} from 'lucide-react';
import { GradientButton } from '../Shared';
import MasterPermissionTreeEditor from '../adminRbac/MasterPermissionTreeEditor';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import api from '../../services/api';
import userService from '../../services/userService';
import {
  MEMBERSHIP_ROLE_LABEL,
  buildStructurePath,
  groupStructuralRoles,
  isProtectedDefaultRole,
  isStructuralRole,
  isSystemCatalogRole,
  memberScopeFromRoleNames,
  normalizeRoleDisplayName,
  normalizeRoleId,
  structureMapsFromPayload,
  structureTierSections,
  unwrapList,
} from './rbacSettingsHelpers';
import { unwrapRoleApi } from '../../utils/adminRbacUtils';
import useRoleMasterGrantsMap from '../../hooks/useRoleMasterGrantsMap';
import { priorityFromTier, TIER_EXEC } from './roleRbacUtils';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  countMasterGrants,
  grantKeysFromDraft,
  grantsDraftFromList,
  isProjectMasterPermission,
  notifyRbacGrantsChanged,
} from '../../utils/rbacV2Ui';

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildRbacTabs(t) {
  return [
    { id: 'system', label: t('organizationSettings.rbacTabSystem'), icon: Shield },
    { id: 'structure', label: t('organizationSettings.rbacTabStructure'), icon: Briefcase },
    { id: 'assign', label: t('organizationSettings.rbacTabAssign'), icon: UserCog },
  ];
}

function roleAccentColor(role) {
  const name = String(role?.name || '').toLowerCase();
  const norm = stripDiacritics(name);
  if (norm.includes('quan tri') || norm.includes('admin'))
    return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (norm.includes('nhan su') || norm === 'hr') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
  if (role?.isDefault || norm.includes('thanh vien'))
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  return 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200';
}

export default function OrganizationRbacSettings({ orgId }) {
  const { t } = useAppStrings();
  const rbacTabs = useMemo(() => buildRbacTabs(t), [t]);
  const [activeRbacTab, setActiveRbacTab] = useState('system');
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [structureMaps, setStructureMaps] = useState({
    divisions: new Map(),
    departments: new Map(),
    teams: new Map(),
  });
  const [assignmentsByUser, setAssignmentsByUser] = useState({});
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [permEditMode, setPermEditMode] = useState(false);
  const [grantsDraft, setGrantsDraft] = useState({});
  const [bindings, setBindings] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [hydratedGroupId, setHydratedGroupId] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState('all');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberDetailPerms, setMemberDetailPerms] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState({});

  const systemRoles = useMemo(
    () => roles.filter(isSystemCatalogRole).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0)),
    [roles]
  );

  const structuralRoles = useMemo(() => roles.filter(isStructuralRole), [roles]);
  const structuralGroups = useMemo(() => groupStructuralRoles(structuralRoles), [structuralRoles]);

  const selectedRole = useMemo(
    () => systemRoles.find((r) => normalizeRoleId(r) === selectedRoleId) || null,
    [systemRoles, selectedRoleId]
  );
  const { catalog, grantsByRoleId, error: catalogMapError } = useRoleMasterGrantsMap(orgId, systemRoles);
  const tree = Array.isArray(catalog?.tree) ? catalog.tree : [];
  const catalogError = Boolean(catalogMapError);
  const totalSlots = (catalog?.masterPermissions || []).filter(
    (k) => !String(k || '').startsWith('project.')
  ).length;

  const roleMemberCounts = useMemo(() => {
    const counts = new Map();
    for (const rows of Object.values(assignmentsByUser)) {
      for (const row of rows || []) {
        const rid = String(row?.roleId || row?._id || row?.id || row?.role?._id || '');
        if (!rid) continue;
        counts.set(rid, (counts.get(rid) || 0) + 1);
      }
    }
    return counts;
  }, [assignmentsByUser]);

  const loadAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [rolesRes, bundleRes, structureRes] = await Promise.all([
        roleAPI.getRolesByOrganization(orgId),
        organizationAPI.getMembersWithRoles(orgId),
        organizationAPI.getStructure(orgId).catch(() => null),
      ]);

      const roleList = unwrapList(rolesRes);
      setRoles(roleList);

      const bundle = bundleRes?.data?.data ?? bundleRes?.data ?? bundleRes;
      const memberRows = Array.isArray(bundle?.members) ? bundle.members : unwrapList(bundleRes);
      setMembers(memberRows);

      const structureBody = structureRes?.data?.data ?? structureRes?.data ?? structureRes;
      setStructureMaps(structureMapsFromPayload(structureBody || {}, t));

      const assignmentEntries = await Promise.all(
        memberRows.map(async (m) => {
          const uid = String(m?.user?._id || m?.user || m?.userId || '');
          if (!uid) return [uid, []];
          try {
            const res = await roleAPI.getUserRoles(uid, orgId);
            return [uid, unwrapList(res)];
          } catch {
            return [uid, []];
          }
        })
      );
      setAssignmentsByUser(Object.fromEntries(assignmentEntries));

      const profileEntries = await Promise.all(
        memberRows.slice(0, 80).map(async (m) => {
          const uid = String(m?.user?._id || m?.user || m?.userId || '');
          if (!uid) return [uid, null];
          try {
            const res = await userService.getProfile(uid);
            const p = res?.data?.data ?? res?.data ?? res;
            return [
              uid,
              {
                displayName: p?.displayName || p?.username || uid.slice(-6),
                avatar: p?.avatar || null,
              },
            ];
          } catch {
            return [uid, { displayName: uid.slice(-6), avatar: null }];
          }
        })
      );
      setMemberProfiles(Object.fromEntries(profileEntries));
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacLoadFail') }));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedRoleId && systemRoles.length) {
      setSelectedRoleId(normalizeRoleId(systemRoles[0]));
    }
  }, [systemRoles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole || !orgId) {
      setBindings([]);
      setGroupId('');
      setHydratedGroupId('');
      setGrantsDraft({});
      setPermEditMode(false);
      return undefined;
    }
    const roleId = normalizeRoleId(selectedRole);
    let cancelled = false;
    (async () => {
      try {
        const res = await roleAPI.listRolePermissionGroups(roleId, orgId);
        const data = unwrapRoleApi(res) || [];
        const list = Array.isArray(data) ? data : [];
        if (cancelled) return;
        setBindings(list);
        const first = list.find((b) => b.group)?.group || list[0]?.group;
        const gid = String(first?._id || first?.id || '');
        setGroupId(gid);
        setGrantsDraft(grantsDraftFromList(first?.grants || []));
        setHydratedGroupId(gid);
        setPermEditMode(false);
      } catch {
        if (!cancelled) {
          setBindings([]);
          setHydratedGroupId('');
          setGrantsDraft({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedRole]);

  const catalogReady = tree.length > 0 && !catalogError;
  const canSavePerms =
    Boolean(selectedRole && groupId && hydratedGroupId === groupId && catalogReady && !savingPerms);

  const saveRolePermissions = async () => {
    if (!canSavePerms || !orgId) return;
    setSavingPerms(true);
    try {
      await roleAPI.setPermissionGroupGrants(groupId, {
        organizationId: orgId,
        serverId: orgId,
        grants: grantKeysFromDraft(grantsDraft),
      });
      toast.success(t('organizationSettings.rbacPermsSaved'));
      setPermEditMode(false);
      notifyRbacGrantsChanged();
      await loadAll();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacPermsSaveFail') }));
    } finally {
      setSavingPerms(false);
    }
  };

  const handleCreateRole = async () => {
    const name = createName.trim();
    if (!name || !orgId) {
      toast.error(t('organizationSettings.rbacRoleNameRequired'));
      return;
    }
    try {
      setLoading(true);
      await roleAPI.clonePermissionGroup({
        organizationId: orgId,
        serverId: orgId,
        templateKey: 'viewer',
        specialization: 'Other',
        allowOtherName: true,
        otherName: name,
        createRole: true,
        priority: priorityFromTier(TIER_EXEC),
      });
      toast.success(t('organizationSettings.rbacRoleCreated'));
      setCreateOpen(false);
      setCreateName('');
      await loadAll();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacRoleCreateFail') }));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (!role || isProtectedDefaultRole(role)) return;
    const rid = normalizeRoleId(role);
    if (!rid || !window.confirm(t('organizationSettings.rbacDeleteRoleConfirm', { name: normalizeRoleDisplayName(role.name) }))) return;
    try {
      setLoading(true);
      await roleAPI.deleteRole(rid, orgId);
      toast.success(t('organizationSettings.rbacRoleDeleted'));
      if (selectedRoleId === rid) setSelectedRoleId(null);
      await loadAll();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacRoleDeleteFail') }));
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateRole = async (role) => {
    if (!role || !orgId) return;
    try {
      setLoading(true);
      await roleAPI.clonePermissionGroup({
        organizationId: orgId,
        serverId: orgId,
        templateKey: 'viewer',
        specialization: 'Other',
        allowOtherName: true,
        otherName: `${normalizeRoleDisplayName(role.name)}${t('organizationSettings.rbacRoleCopySuffix')}`,
        createRole: true,
        priority: role.priority || priorityFromTier(TIER_EXEC),
        color: role.color,
      });
      toast.success(t('organizationSettings.rbacRoleDuplicated'));
      await loadAll();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacRoleDuplicateFail') }));
    } finally {
      setLoading(false);
    }
  };

  const openMemberDetail = async (member) => {
    const uid = String(member?.user?._id || member?.user || member?.userId || '');
    if (!uid) return;
    setSelectedMemberId(uid);
    try {
      const res = await api.get(`/permissions/user/${encodeURIComponent(uid)}/server/${encodeURIComponent(orgId)}`);
      const list = unwrapList(res);
      setMemberDetailPerms(Array.isArray(list) ? list : []);
    } catch (e) {
      setMemberDetailPerms([]);
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacMemberPermsLoadFail') }));
    }
  };

  const toggleMemberRole = async (member, role, assigned) => {
    const uid = String(member?.user?._id || member?.user || member?.userId || '');
    const rid = normalizeRoleId(role);
    if (!uid || !rid || !orgId) return;
    try {
      if (assigned) {
        await roleAPI.removeRoleFromUser(rid, uid, orgId);
      } else {
        await roleAPI.assignRoleToUser(rid, uid, orgId);
      }
      toast.success(assigned ? t('organizationSettings.rbacRoleUnassigned') : t('organizationSettings.rbacRoleAssigned'));
      await loadAll();
      if (selectedMemberId === uid) await openMemberDetail(member);
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.rbacRoleUpdateFail') }));
    }
  };

  const assignRows = useMemo(() => {
    return members
      .map((m) => {
        const uid = String(m?.user?._id || m?.user || m?.userId || '');
        const profile = memberProfiles[uid];
        const userAssignments = assignmentsByUser[uid] || [];
        const assigned = userAssignments
          .map((row) => {
            const rid = String(row?.roleId || row?._id || row?.id || row?.role?._id || '');
            return systemRoles.find((r) => normalizeRoleId(r) === rid);
          })
          .filter(Boolean);
        const roleNames = userAssignments
          .map((row) => String(row?.name || row?.role?.name || row?.displayName || ''))
          .filter(Boolean);
        const fromRoles = memberScopeFromRoleNames(roleNames, structureMaps);
        const membershipRole = String(m?.role || 'member').toLowerCase();
        return {
          member: m,
          userId: uid,
          displayName: profile?.displayName || uid.slice(-6),
          avatar: profile?.avatar,
          membershipLabel: MEMBERSHIP_ROLE_LABEL[membershipRole] || membershipRole,
          path: buildStructurePath(
            {
              teamId: m?.team || fromRoles.teamId,
              departmentId: m?.department || fromRoles.departmentId,
              divisionId: m?.division || fromRoles.divisionId,
            },
            structureMaps
          ),
          assignedRoles: assigned,
        };
      })
      .filter((row) => {
        const q = assignSearch.trim().toLowerCase();
        if (q && !`${row.displayName} ${row.path}`.toLowerCase().includes(q)) return false;
        if (assignFilter === 'all') return true;
        return row.assignedRoles.some((r) =>
          normalizeRoleDisplayName(r.name).toLowerCase().includes(assignFilter.toLowerCase())
        );
      });
  }, [members, memberProfiles, assignmentsByUser, systemRoles, structureMaps, assignSearch, assignFilter]);

  const selectedMemberRow = assignRows.find((r) => r.userId === selectedMemberId);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">{t('adminRbac.adminHubHint')}</p>
        <Link
          to="/app/admin/rbac/roles"
          className="shrink-0 text-sm font-medium text-cyan-300 underline-offset-2 hover:text-cyan-200 hover:underline"
        >
          {t('adminRbac.adminHubLink')}
        </Link>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-white">
            <Shield className="h-5 w-5 text-violet-400" />
            {t('organizationSettings.rbacTitle')}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            {t('organizationSettings.rbacSubtitle')}
          </p>
        </div>
        <GradientButton
          variant="primary"
          onClick={() => {
            setCreateOpen(true);
            setCreateName('');
            setPermDraft({});
          }}
          disabled={loading}
        >
          <Plus className="mr-1 inline h-4 w-4" />
          {t('organizationSettings.rbacCreateRole')}
        </GradientButton>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-1">
        {rbacTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeRbacTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveRbacTab(tab.id)}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-b-2 border-cyan-400 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeRbacTab === 'system' && (
        <div className="grid min-h-[520px] gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('organizationSettings.rbacRoleList')}
              </span>
              <button
                type="button"
                className="text-xs text-cyan-400 hover:text-cyan-300"
                onClick={() => setCreateOpen(true)}
              >
                {t('organizationSettings.rbacCreateShort')}
              </button>
            </div>
            {loading && systemRoles.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">{t('common.loadingEllipsis')}</p>
            ) : systemRoles.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">{t('organizationSettings.rbacNoSystemRoles')}</p>
            ) : (
              <div className="max-h-[560px] space-y-1 overflow-y-auto scrollbar-overlay">
                {systemRoles.map((role) => {
                  const rid = normalizeRoleId(role);
                  const active = rid === selectedRoleId;
                  const granted = countMasterGrants(grantsByRoleId[rid]);
                  const membersN = roleMemberCounts.get(rid) || 0;
                  return (
                    <button
                      key={rid}
                      type="button"
                      onClick={() => setSelectedRoleId(rid)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-violet-500/50 bg-violet-500/10'
                          : 'border-transparent hover:border-slate-700 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {normalizeRoleDisplayName(role.name)}
                        </span>
                        {isProtectedDefaultRole(role) ? (
                          <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {t('organizationSettings.rbacSystemBadge')}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t('organizationSettings.rbacMembersPerms', {
                          members: membersN,
                          granted,
                          total: totalSlots,
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            {!selectedRole ? (
              <p className="py-16 text-center text-sm text-slate-500">{t('organizationSettings.rbacSelectRole')}</p>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-semibold ${roleAccentColor(selectedRole)}`}
                      >
                        {normalizeRoleDisplayName(selectedRole.name)}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                        {countMasterGrants(grantsByRoleId[normalizeRoleId(selectedRole)])}/{totalSlots} quyền
                      </span>
                      {permEditMode ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                          {t('organizationSettings.rbacEditing')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      {t('organizationSettings.rbacRoleDesc')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDuplicateRole(selectedRole)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      <Copy className="mr-1 inline h-3.5 w-3.5" />
                      {t('organizationSettings.rbacDuplicate')}
                    </button>
                    {!isProtectedDefaultRole(selectedRole) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole)}
                        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                        {t('common.delete')}
                      </button>
                    ) : null}
                    {permEditMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPermEditMode(false);
                            const hit =
                              bindings.find(
                                (b) => String(b.group?._id || b.permissionGroupId) === String(groupId)
                              )?.group || bindings[0]?.group;
                            setGrantsDraft(grantsDraftFromList(hit?.grants || []));
                          }}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={saveRolePermissions}
                          disabled={!canSavePerms}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {t('common.save')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!groupId || !catalogReady}
                        onClick={() => setPermEditMode(true)}
                        className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 disabled:opacity-50"
                      >
                        <Pencil className="mr-1 inline h-3.5 w-3.5" />
                        {t('organizationSettings.rbacEdit')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {!bindings.length ? (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-slate-400">
                      Role chưa gắn Permission Group. Hãy clone template (màn Create) hoặc chạy direct-replace.
                    </p>
                  ) : catalogError || !tree.length ? (
                    <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
                      {t('organizationSettings.rbacLoadFail')}
                    </p>
                  ) : (
                    <MasterPermissionTreeEditor
                      tree={tree}
                      excludeCategoryKeys={['project']}
                      grantsDraft={grantsDraft}
                      editable={permEditMode}
                      onToggle={(key) => {
                        if (!permEditMode || isProjectMasterPermission(key)) return;
                        setGrantsDraft((prev) => {
                          const next = { ...prev };
                          if (next[key]) delete next[key];
                          else next[key] = true;
                          return next;
                        });
                      }}
                      onSetMany={(keys, value) => {
                        if (!permEditMode) return;
                        setGrantsDraft((prev) => {
                          const next = { ...prev };
                          for (const key of keys || []) {
                            if (isProjectMasterPermission(key)) continue;
                            if (value) next[key] = true;
                            else delete next[key];
                          }
                          return next;
                        });
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeRbacTab === 'structure' && (
        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100/90">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {t('organizationSettings.rbacStructureInfo')}
            </p>
          </div>
          {structureTierSections().map((tier) => {
            const list = structuralGroups[tier.id] || [];
            return (
              <div key={tier.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">
                    {tier.title}
                  </h4>
                  <span className="text-xs text-slate-500">{t('organizationSettings.rbacRolesCount', { n: list.length })}</span>
                </div>
                {list.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Chưa có vai trò — tạo {tier.title.toLowerCase()} trong tab Cấu trúc tổ chức để đồng bộ.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((role) => {
                      const rid = normalizeRoleId(role);
                      const membersN = roleMemberCounts.get(rid) || 0;
                      return (
                        <div
                          key={rid}
                          className="rounded-xl border border-border bg-muted/30 p-4"
                        >
                          <div className="font-semibold text-white">
                            {normalizeRoleDisplayName(role.name)}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{tier.hint}</p>
                          <p className="mt-2 text-xs text-slate-400">{t('organizationSettings.rbacMembersAssigned', { n: membersN })}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeRbacTab === 'assign' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
            <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder={t('organizationSettings.rbacSearchPh')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: 'all', label: t('organizationSettings.rbacFilterAll') },
                  { id: t('organizationSettings.roleAdmin'), label: t('organizationSettings.roleAdmin') },
                  { id: t('organizationSettings.roleHr'), label: t('organizationSettings.roleHr') },
                  { id: t('organizationSettings.roleMember'), label: t('organizationSettings.roleMember') },
                ].map((f) => {
                  const active = f.id === 'all' ? assignFilter === 'all' : assignFilter === f.id;
                  return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAssignFilter(f.id === 'all' ? 'all' : f.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                  );
                })}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">{t('organizationSettings.rbacColMember')}</th>
                    <th className="px-4 py-3">{t('organizationSettings.rbacColUnit')}</th>
                    <th className="px-4 py-3">Membership</th>
                    <th className="px-4 py-3">{t('organizationSettings.rbacColSystemRole')}</th>
                  </tr>
                </thead>
                <tbody>
                  {assignRows.map((row) => (
                    <tr
                      key={row.userId}
                      className={`cursor-pointer border-b border-slate-800/80 transition hover:bg-slate-800/40 ${
                        selectedMemberId === row.userId ? 'bg-violet-500/10' : ''
                      }`}
                      onClick={() => openMemberDetail(row.member)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
                            {row.displayName.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="font-medium text-white">{row.displayName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{row.path}</td>
                      <td className="px-4 py-3 text-slate-300">{row.membershipLabel}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.assignedRoles.length ? (
                            row.assignedRoles.map((r) => (
                              <span
                                key={normalizeRoleId(r)}
                                className={`rounded-full border px-2 py-0.5 text-xs ${roleAccentColor(r)}`}
                              >
                                {normalizeRoleDisplayName(r.name)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">{t('organizationSettings.rbacNotAssigned')}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            {!selectedMemberRow ? (
              <p className="py-12 text-center text-sm text-slate-500">{t('organizationSettings.rbacSelectMemberAssign')}</p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('organizationSettings.rbacMemberDetail')}</p>
                    <h4 className="mt-1 text-lg font-semibold text-white">{selectedMemberRow.displayName}</h4>
                    <p className="text-xs text-slate-400">{selectedMemberRow.membershipLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMemberId(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-3 text-xs text-slate-500">{selectedMemberRow.path}</p>

                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('organizationSettings.rbacTabSystem')}</p>
                <div className="mb-4 max-h-48 space-y-1 overflow-y-auto">
                  {systemRoles.map((role) => {
                    const rid = normalizeRoleId(role);
                    const assigned = selectedMemberRow.assignedRoles.some(
                      (r) => normalizeRoleId(r) === rid
                    );
                    return (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => toggleMemberRole(selectedMemberRow.member, role, assigned)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                          assigned
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                            : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>{normalizeRoleDisplayName(role.name)}</span>
                        {assigned ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>

                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('organizationSettings.rbacEffectivePerms')}</p>
                <div className="max-h-40 space-y-2 overflow-y-auto text-xs text-slate-400">
                  {memberDetailPerms.length === 0 ? (
                    <p>Chưa có quyền hoặc chưa gán vai trò.</p>
                  ) : (
                    memberDetailPerms.map((p) => (
                      <div key={`${p.resource}-${p.actions?.join(',')}`}>
                        <span className="text-slate-300">{p.resource}</span>:{' '}
                        {(p.actions || []).join(', ')}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h4 className="text-lg font-semibold text-white">{t('organizationSettings.rbacCreateSystemRoleTitle')}</h4>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t('organizationSettings.rbacRoleNamePh')}
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-white focus:border-violet-500/50 focus:outline-none"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateRole}
                disabled={loading}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Tạo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

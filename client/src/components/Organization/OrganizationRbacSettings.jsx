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
  Loader2,
} from 'lucide-react';
import { ConfirmDialog, GradientButton, Modal } from '../Shared';
import MasterPermissionTreeEditor from '../adminRbac/MasterPermissionTreeEditor';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import api from '../../services/api';
import {
  assignRowMatchesFilter,
  buildStructurePath,
  groupStructuralRoles,
  isProtectedDefaultRole,
  isStructuralRole,
  isSystemCatalogRole,
  memberScopeFromRoleNames,
  membershipRoleLabel,
  normalizeRoleDisplayName,
  normalizeRoleId,
  roleAccentClass,
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
  grantStripOptionsForTemplate,
  grantsDraftFromList,
  isOrgCloneableTemplate,
  isProjectPackTemplateKey,
  isToggleableMasterGrant,
  notifyRbacGrantsChanged,
  ORG_ALLOWED_PROJECT_GRANTS,
} from '../../utils/rbacV2Ui';

const MOTION_BTN =
  'motion-safe:transition-colors motion-reduce:transition-none';
const FIELD_CLASS =
  'w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring motion-safe:transition-colors motion-reduce:transition-none';

function buildRbacTabs(t) {
  return [
    { id: 'system', label: t('organizationSettings.rbacTabSystem'), icon: Shield },
    { id: 'structure', label: t('organizationSettings.rbacTabStructure'), icon: Briefcase },
    { id: 'assign', label: t('organizationSettings.rbacTabAssign'), icon: UserCog },
  ];
}

function RoleListSkeleton() {
  return (
    <div className="space-y-2 px-1" role="status" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-14 rounded-xl border border-border bg-muted/40 motion-safe:animate-pulse motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export default function OrganizationRbacSettings({ orgId }) {
  const { t } = useAppStrings();
  const rbacTabs = useMemo(() => buildRbacTabs(t), [t]);
  const membershipLabels = useMemo(() => membershipRoleLabel(t), [t]);
  const [activeRbacTab, setActiveRbacTab] = useState('system');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
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
  const [bindError, setBindError] = useState('');
  const [groupId, setGroupId] = useState('');
  const [hydratedGroupId, setHydratedGroupId] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTemplateKey, setCreateTemplateKey] = useState('viewer');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [pendingDeleteRole, setPendingDeleteRole] = useState(null);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState('all');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberDetailPerms, setMemberDetailPerms] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [assignBusyKey, setAssignBusyKey] = useState('');

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

  const cloneableTemplates = useMemo(
    () => (catalog?.templates || []).filter((tpl) => isOrgCloneableTemplate(tpl, catalog)),
    [catalog]
  );

  const activePermGroup = useMemo(() => {
    const hit = bindings.find((b) => String(b.group?._id || b.permissionGroupId) === String(groupId));
    return hit?.group || null;
  }, [bindings, groupId]);
  const isProjectPack = isProjectPackTemplateKey(activePermGroup?.templateKey, catalog);
  const stripOpts = useMemo(
    () => grantStripOptionsForTemplate(activePermGroup?.templateKey, catalog),
    [activePermGroup?.templateKey, catalog]
  );

  const selectedRoleTemplateKey = useMemo(() => {
    const fromGroup = String(activePermGroup?.templateKey || '').trim();
    if (fromGroup) return fromGroup;
    const hasViewer = cloneableTemplates.some((tpl) => tpl.key === 'viewer');
    return hasViewer ? 'viewer' : String(cloneableTemplates[0]?.key || 'viewer');
  }, [activePermGroup?.templateKey, cloneableTemplates]);

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
    setLoadError('');
    try {
      const [rolesRes, bundleRes, structureRes] = await Promise.all([
        roleAPI.getRolesByOrganization(orgId),
        organizationAPI.getMembersWithRoles(orgId, { view: 'admin_table' }),
        organizationAPI.getStructure(orgId).catch(() => null),
      ]);

      const roleList = unwrapList(rolesRes);
      setRoles(roleList);

      const bundle = bundleRes?.data?.data ?? bundleRes?.data ?? bundleRes;
      const memberRows = Array.isArray(bundle?.members) ? bundle.members : unwrapList(bundleRes);
      setMembers(memberRows);

      const structureBody = structureRes?.data?.data ?? structureRes?.data ?? structureRes;
      setStructureMaps(structureMapsFromPayload(structureBody || {}, t));

      const assignmentMap = {};
      const profileMap = {};
      for (const m of memberRows) {
        const uid = String(m?.user?._id || m?.user || m?.userId || '').trim();
        if (!uid) continue;
        assignmentMap[uid] = Array.isArray(m.rbacRoles) ? m.rbacRoles : [];
        profileMap[uid] = {
          displayName:
            m.displayName ||
            m.username ||
            (typeof m.email === 'string' ? m.email.split('@')[0] : '') ||
            uid.slice(-6),
          avatar: m.avatar || null,
        };
      }
      setAssignmentsByUser(assignmentMap);
      setMemberProfiles(profileMap);
    } catch (e) {
      const msg = resolveApiErrorMessage(e, { t, fallback: t('orgRbac.loadFail') });
      setLoadError(msg);
      toast.error(msg);
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
    if (!createOpen) return;
    const hasViewer = cloneableTemplates.some((tpl) => tpl.key === 'viewer');
    const fallback = hasViewer ? 'viewer' : String(cloneableTemplates[0]?.key || 'viewer');
    setCreateTemplateKey((prev) =>
      prev && cloneableTemplates.some((tpl) => tpl.key === prev) ? prev : fallback
    );
  }, [createOpen, cloneableTemplates]);

  useEffect(() => {
    if (!selectedRole || !orgId) {
      setBindings([]);
      setGroupId('');
      setHydratedGroupId('');
      setGrantsDraft({});
      setPermEditMode(false);
      setBindError('');
      return undefined;
    }
    const roleId = normalizeRoleId(selectedRole);
    let cancelled = false;
    (async () => {
      try {
        setBindError('');
        const res = await roleAPI.listRolePermissionGroups(roleId, orgId);
        const data = unwrapRoleApi(res) || [];
        const list = Array.isArray(data) ? data : [];
        if (cancelled) return;
        setBindings(list);
        const first = list.find((b) => b.group)?.group || list[0]?.group;
        const gid = String(first?._id || first?.id || '');
        setGroupId(gid);
        setGrantsDraft(
          grantsDraftFromList(first?.grants || [], grantStripOptionsForTemplate(first?.templateKey, catalog))
        );
        setHydratedGroupId(gid);
        setPermEditMode(false);
      } catch (e) {
        if (!cancelled) {
          setBindings([]);
          setHydratedGroupId('');
          setGrantsDraft({});
          const msg = resolveApiErrorMessage(e, { t, fallback: t('orgRbac.bindFail') });
          setBindError(msg);
          toast.error(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedRole, catalog, t]);

  const catalogReady = tree.length > 0 && !catalogError;
  const canSavePerms =
    Boolean(selectedRole && groupId && hydratedGroupId === groupId && catalogReady && !savingPerms);

  const openCreateModal = () => {
    setCreateOpen(true);
    setCreateName('');
    const hasViewer = cloneableTemplates.some((tpl) => tpl.key === 'viewer');
    setCreateTemplateKey(hasViewer ? 'viewer' : String(cloneableTemplates[0]?.key || 'viewer'));
  };

  const openDuplicateModal = (role) => {
    if (!role) return;
    setDuplicateName(
      `${normalizeRoleDisplayName(role.name)}${t('organizationSettings.rbacRoleCopySuffix')}`
    );
    setDuplicateOpen(true);
  };

  const saveRolePermissions = async () => {
    if (!canSavePerms || !orgId) return;
    setSavingPerms(true);
    try {
      await roleAPI.setPermissionGroupGrants(groupId, {
        organizationId: orgId,
        serverId: orgId,
        grants: grantKeysFromDraft(grantsDraft, stripOpts),
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
    const templateKey = String(createTemplateKey || 'viewer').trim() || 'viewer';
    try {
      setLoading(true);
      await roleAPI.clonePermissionGroup({
        organizationId: orgId,
        serverId: orgId,
        templateKey,
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

  const handleDeleteRole = (role) => {
    if (!role || isProtectedDefaultRole(role) || !normalizeRoleId(role)) return;
    setPendingDeleteRole(role);
  };

  const confirmDeleteRole = async () => {
    const role = pendingDeleteRole;
    const rid = normalizeRoleId(role);
    if (!rid || isProtectedDefaultRole(role)) return;
    try {
      setLoading(true);
      await roleAPI.deleteRole(rid, orgId);
      toast.success(t('organizationSettings.rbacRoleDeleted'));
      if (selectedRoleId === rid) setSelectedRoleId(null);
      await loadAll();
    } catch (e) {
      toast.error(
        resolveApiErrorMessage(e, {
          t,
          fallback: t('errors.codes.ROLE_PROTECTED') || t('organizationSettings.rbacRoleDeleteFail'),
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateRole = async () => {
    if (!selectedRole || !orgId) return;
    const name = duplicateName.trim();
    if (!name) {
      toast.error(t('organizationSettings.rbacRoleNameRequired'));
      return;
    }
    try {
      setLoading(true);
      await roleAPI.clonePermissionGroup({
        organizationId: orgId,
        serverId: orgId,
        templateKey: selectedRoleTemplateKey,
        specialization: 'Other',
        allowOtherName: true,
        otherName: name,
        createRole: true,
        priority: selectedRole.priority || priorityFromTier(TIER_EXEC),
        color: selectedRole.color,
      });
      toast.success(t('organizationSettings.rbacRoleDuplicated'));
      setDuplicateOpen(false);
      setDuplicateName('');
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

  const applyMemberRoleToggle = async (member, role, assigned) => {
    const uid = String(member?.user?._id || member?.user || member?.userId || '');
    const rid = normalizeRoleId(role);
    if (!uid || !rid || !orgId) return;
    const busyKey = `${uid}:${rid}`;
    setAssignBusyKey(busyKey);
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
    } finally {
      setAssignBusyKey('');
    }
  };

  const onAssignToggleClick = (member, role, assigned) => {
    if (assigned) {
      setPendingRevoke({ member, role });
      return;
    }
    applyMemberRoleToggle(member, role, false);
  };

  const confirmRevoke = async () => {
    if (!pendingRevoke) return;
    await applyMemberRoleToggle(pendingRevoke.member, pendingRevoke.role, true);
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
          membershipLabel: membershipLabels[membershipRole] || membershipRole,
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
        return assignRowMatchesFilter(row.assignedRoles, assignFilter);
      });
  }, [
    members,
    memberProfiles,
    assignmentsByUser,
    systemRoles,
    structureMaps,
    assignSearch,
    assignFilter,
    membershipLabels,
  ]);

  const selectedMemberRow = assignRows.find((r) => r.userId === selectedMemberId);

  const assignFilterChips = useMemo(
    () => [
      { id: 'all', label: t('orgRbac.assignFilterAll') },
      ...systemRoles.map((role) => ({
        id: normalizeRoleId(role),
        label: normalizeRoleDisplayName(role.name),
      })),
    ],
    [systemRoles, t]
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t('adminRbac.adminHubHint')}</p>
        <Link
          to="/app/admin/rbac/roles"
          className={`shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline ${MOTION_BTN}`}
        >
          {t('adminRbac.adminHubLink')}
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Shield className="h-5 w-5 text-primary" aria-hidden />
            {t('organizationSettings.rbacTitle')}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('organizationSettings.rbacSubtitle')}
          </p>
        </div>
        <GradientButton variant="primary" onClick={openCreateModal} disabled={loading}>
          <Plus className="mr-1 inline h-4 w-4" aria-hidden />
          {t('organizationSettings.rbacCreateRole')}
        </GradientButton>
      </div>

      {loadError ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={loadAll}
            className={`rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted ${MOTION_BTN}`}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <div
        className="flex flex-wrap gap-1 border-b border-border pb-1"
        role="tablist"
        aria-label={t('orgRbac.tabsAria')}
      >
        {rbacTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeRbacTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`org-rbac-tab-${tab.id}`}
              onClick={() => setActiveRbacTab(tab.id)}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium ${MOTION_BTN} ${
                active
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeRbacTab === 'system' && (
        <div
          className="grid min-h-[520px] gap-4 lg:grid-cols-[280px_1fr]"
          role="tabpanel"
          aria-labelledby="org-rbac-tab-system"
        >
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('organizationSettings.rbacRoleList')}
              </span>
              <button
                type="button"
                className={`text-xs text-primary hover:underline ${MOTION_BTN}`}
                onClick={openCreateModal}
              >
                {t('organizationSettings.rbacCreateShort')}
              </button>
            </div>
            {loading && systemRoles.length === 0 ? (
              <RoleListSkeleton />
            ) : systemRoles.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('orgRbac.emptyRoles')}</p>
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
                      className={`w-full rounded-xl border px-3 py-2.5 text-left ${MOTION_BTN} ${
                        active
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-transparent hover:border-border hover:bg-muted/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {normalizeRoleDisplayName(role.name)}
                        </span>
                        {isProtectedDefaultRole(role) ? (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t('organizationSettings.rbacSystemBadge')}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
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

          <div className="rounded-2xl border border-border bg-card p-5">
            {!selectedRole ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('organizationSettings.rbacSelectRole')}
              </p>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-semibold ${roleAccentClass(selectedRole)}`}
                      >
                        {normalizeRoleDisplayName(selectedRole.name)}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('orgRbac.permCount', {
                          count: countMasterGrants(grantsByRoleId[normalizeRoleId(selectedRole)]),
                          total: totalSlots,
                        })}
                      </span>
                      {permEditMode ? (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning">
                          {t('organizationSettings.rbacEditing')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('organizationSettings.rbacRoleDesc')}
                    </p>
                    {isProtectedDefaultRole(selectedRole) ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('orgRbac.protectedDefaultHint')}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openDuplicateModal(selectedRole)}
                      className={`rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted ${MOTION_BTN}`}
                    >
                      <Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                      {t('organizationSettings.rbacDuplicate')}
                    </button>
                    {!isProtectedDefaultRole(selectedRole) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole)}
                        className={`rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 ${MOTION_BTN}`}
                      >
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
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
                            setGrantsDraft(
                              grantsDraftFromList(
                                hit?.grants || [],
                                grantStripOptionsForTemplate(hit?.templateKey, catalog)
                              )
                            );
                          }}
                          className={`rounded-lg border border-border px-3 py-1.5 text-xs text-foreground ${MOTION_BTN}`}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={saveRolePermissions}
                          disabled={!canSavePerms}
                          className={`rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${MOTION_BTN}`}
                        >
                          {t('common.save')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!groupId || !catalogReady}
                        onClick={() => setPermEditMode(true)}
                        className={`rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary disabled:opacity-50 ${MOTION_BTN}`}
                      >
                        <Pencil className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                        {t('organizationSettings.rbacEdit')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {bindError ? (
                    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                      {bindError}
                    </p>
                  ) : !bindings.length ? (
                    <p className="rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm text-muted-foreground">
                      {t('orgRbac.noPermissionGroup')}
                    </p>
                  ) : catalogError || !tree.length ? (
                    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
                      {t('orgRbac.loadFail')}
                    </p>
                  ) : (
                    <MasterPermissionTreeEditor
                      tree={tree}
                      excludeCategoryKeys={isProjectPack ? [] : ['project']}
                      includePermissionKeys={isProjectPack ? [] : [...ORG_ALLOWED_PROJECT_GRANTS]}
                      grantsDraft={grantsDraft}
                      editable={permEditMode}
                      onToggle={(key) => {
                        if (!permEditMode || !isToggleableMasterGrant(key, { isProjectPack })) return;
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
                            if (!isToggleableMasterGrant(key, { isProjectPack })) continue;
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
        <div className="space-y-4" role="tabpanel" aria-labelledby="org-rbac-tab-structure">
          <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <p>{t('organizationSettings.rbacStructureInfo')}</p>
          </div>
          {structureTierSections().map((tier) => {
            const list = structuralGroups[tier.id] || [];
            return (
              <div key={tier.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    {tier.title}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {t('organizationSettings.rbacRolesCount', { n: list.length })}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('orgRbac.emptyStructureRoles', { tier: String(tier.title || '').toLowerCase() })}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((role) => {
                      const rid = normalizeRoleId(role);
                      const membersN = roleMemberCounts.get(rid) || 0;
                      return (
                        <div key={rid} className="rounded-xl border border-border bg-muted/30 p-4">
                          <div className="font-semibold text-foreground">
                            {normalizeRoleDisplayName(role.name)}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{tier.hint}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t('organizationSettings.rbacMembersAssigned', { n: membersN })}
                          </p>
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
        <div
          className="grid gap-4 lg:grid-cols-[1fr_320px]"
          role="tabpanel"
          aria-labelledby="org-rbac-tab-assign"
        >
          <div className="rounded-2xl border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  <Search className="h-4 w-4" aria-hidden />
                </span>
                <input
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder={t('organizationSettings.rbacSearchPh')}
                  className={`${FIELD_CLASS} pl-9`}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {assignFilterChips.map((f) => {
                  const active = assignFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setAssignFilter(f.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs ${MOTION_BTN} ${
                        active
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="overflow-x-auto">
              {loading && members.length === 0 ? (
                <div className="space-y-2 p-4" role="status" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-12 rounded-lg bg-muted/50 motion-safe:animate-pulse motion-reduce:animate-none"
                    />
                  ))}
                </div>
              ) : assignRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('orgRbac.emptyAssign')}</p>
              ) : (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">{t('organizationSettings.rbacColMember')}</th>
                      <th className="px-4 py-3">{t('organizationSettings.rbacColUnit')}</th>
                      <th className="px-4 py-3">{t('orgRbac.membershipLabel')}</th>
                      <th className="px-4 py-3">{t('organizationSettings.rbacColSystemRole')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignRows.map((row) => (
                      <tr
                        key={row.userId}
                        className={`cursor-pointer border-b border-border/80 hover:bg-muted/40 ${MOTION_BTN} ${
                          selectedMemberId === row.userId ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => openMemberDetail(row.member)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                              {row.displayName.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="font-medium text-foreground">{row.displayName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.path}</td>
                        <td className="px-4 py-3 text-foreground">{row.membershipLabel}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {row.assignedRoles.length ? (
                              row.assignedRoles.map((r) => (
                                <span
                                  key={normalizeRoleId(r)}
                                  className={`rounded-full border px-2 py-0.5 text-xs ${roleAccentClass(r)}`}
                                >
                                  {normalizeRoleDisplayName(r.name)}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t('organizationSettings.rbacNotAssigned')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            {!selectedMemberRow ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t('organizationSettings.rbacSelectMemberAssign')}
              </p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('organizationSettings.rbacMemberDetail')}
                    </p>
                    <h4 className="mt-1 text-lg font-semibold text-foreground">
                      {selectedMemberRow.displayName}
                    </h4>
                    <p className="text-xs text-muted-foreground">{selectedMemberRow.membershipLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMemberId(null)}
                    className={`rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground ${MOTION_BTN}`}
                    aria-label={t('common.cancel')}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">{selectedMemberRow.path}</p>

                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  {t('organizationSettings.rbacTabSystem')}
                </p>
                <div className="mb-4 max-h-48 space-y-1 overflow-y-auto">
                  {systemRoles.map((role) => {
                    const rid = normalizeRoleId(role);
                    const assigned = selectedMemberRow.assignedRoles.some(
                      (r) => normalizeRoleId(r) === rid
                    );
                    const busyKey = `${selectedMemberRow.userId}:${rid}`;
                    const busy = assignBusyKey === busyKey;
                    return (
                      <button
                        key={rid}
                        type="button"
                        aria-pressed={assigned}
                        aria-busy={busy || undefined}
                        disabled={Boolean(assignBusyKey)}
                        onClick={() =>
                          onAssignToggleClick(selectedMemberRow.member, role, assigned)
                        }
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60 ${MOTION_BTN} ${
                          assigned
                            ? 'border-primary/30 bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span>{normalizeRoleDisplayName(role.name)}</span>
                        {busy ? (
                          <Loader2
                            className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none"
                            aria-label={t('orgRbac.updatingRow')}
                          />
                        ) : assigned ? (
                          <Check className="h-4 w-4 text-primary" aria-hidden />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  {t('organizationSettings.rbacEffectivePerms')}
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto text-xs text-muted-foreground">
                  {memberDetailPerms.length === 0 ? (
                    <p>{t('orgRbac.noEffectivePerms')}</p>
                  ) : (
                    memberDetailPerms.map((p) => (
                      <div key={`${p.resource}-${p.actions?.join(',')}`}>
                        <span className="text-foreground">{p.resource}</span>:{' '}
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

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('orgRbac.createPack')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className={`rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted ${MOTION_BTN}`}
            >
              {t('orgRbac.cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreateRole}
              disabled={loading}
              className={`rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${MOTION_BTN}`}
            >
              {t('orgRbac.create')}
            </button>
          </div>
        }
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">{t('orgRbac.createNameLabel')}</span>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={t('organizationSettings.rbacRoleNamePh')}
            className={FIELD_CLASS}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-foreground">{t('orgRbac.templateKeyLabel')}</span>
          <select
            value={createTemplateKey}
            onChange={(e) => setCreateTemplateKey(e.target.value)}
            className={FIELD_CLASS}
          >
            {cloneableTemplates.length === 0 ? (
              <option value="viewer">{t('orgRbac.templateViewer')}</option>
            ) : (
              cloneableTemplates.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {tpl.label || (tpl.key === 'viewer' ? t('orgRbac.templateViewer') : tpl.key)}
                </option>
              ))
            )}
          </select>
        </label>
      </Modal>

      <Modal
        isOpen={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        title={t('orgRbac.duplicateRole')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDuplicateOpen(false)}
              className={`rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted ${MOTION_BTN}`}
            >
              {t('orgRbac.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDuplicateRole}
              disabled={loading || !selectedRole}
              className={`rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 ${MOTION_BTN}`}
            >
              {t('orgRbac.duplicateConfirm')}
            </button>
          </div>
        }
      >
        {selectedRole ? (
          <p className="mb-3 text-sm text-muted-foreground">
            {t('orgRbac.duplicateFromLabel', {
              name: normalizeRoleDisplayName(selectedRole.name),
            })}
          </p>
        ) : null}
        <p className="mb-3 text-xs text-muted-foreground">
          {t('orgRbac.templateKeyLabel')}:{' '}
          <span className="font-medium text-foreground">{selectedRoleTemplateKey}</span>
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">{t('orgRbac.createNameLabel')}</span>
          <input
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteRole)}
        onClose={() => setPendingDeleteRole(null)}
        onConfirm={confirmDeleteRole}
        title={t('common.delete')}
        message={
          pendingDeleteRole
            ? t('organizationSettings.rbacDeleteRoleConfirm', {
                name: normalizeRoleDisplayName(pendingDeleteRole.name),
              })
            : ''
        }
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={Boolean(pendingRevoke)}
        onClose={() => setPendingRevoke(null)}
        onConfirm={confirmRevoke}
        title={t('orgRbac.revokeConfirmTitle')}
        message={
          pendingRevoke
            ? t('orgRbac.revokeConfirmBody', {
                role: normalizeRoleDisplayName(pendingRevoke.role?.name),
                member:
                  memberProfiles[
                    String(
                      pendingRevoke.member?.user?._id ||
                        pendingRevoke.member?.user ||
                        pendingRevoke.member?.userId ||
                        ''
                    )
                  ]?.displayName ||
                  String(
                    pendingRevoke.member?.user?._id ||
                      pendingRevoke.member?.user ||
                      pendingRevoke.member?.userId ||
                      ''
                  ).slice(-6),
              })
            : ''
        }
        confirmText={t('orgRbac.revokeConfirm')}
        cancelText={t('orgRbac.cancel')}
        variant="danger"
      />
    </div>
  );
}

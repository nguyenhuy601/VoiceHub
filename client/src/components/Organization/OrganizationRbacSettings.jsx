import { useCallback, useEffect, useMemo, useState } from 'react';
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
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import api from '../../services/api';
import userService from '../../services/userService';
import {
  ACTION_LABEL,
  RBAC_PERMISSION_GROUPS,
  MEMBERSHIP_ROLE_LABEL,
  buildStructurePath,
  grantedPermissionCount,
  groupStructuralRoles,
  isProtectedDefaultRole,
  isStructuralRole,
  isSystemCatalogRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
  permissionEntriesFromState,
  permissionStateFromEntries,
  structureMapsFromPayload,
  structureTierSections,
  totalPermissionSlotCount,
  unwrapList,
} from './rbacSettingsHelpers';
import { priorityFromTier, TIER_EXEC } from './roleRbacUtils';

const RBAC_TABS = [
  { id: 'system', label: 'Vai trò hệ thống', icon: Shield },
  { id: 'structure', label: 'Phạm vi cấu trúc', icon: Briefcase },
  { id: 'assign', label: 'Gán quyền', icon: UserCog },
];

function roleAccentColor(role) {
  const name = String(role?.name || '').toLowerCase();
  if (name.includes('quản trị') || name.includes('admin')) return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (name.includes('nhân sự') || name === 'hr') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
  if (role?.isDefault || name.includes('thành viên')) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  return 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200';
}

export default function OrganizationRbacSettings({ orgId }) {
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
  const [permDraft, setPermDraft] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState('all');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberDetailPerms, setMemberDetailPerms] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState({});

  const totalSlots = useMemo(() => totalPermissionSlotCount(), []);

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
      setStructureMaps(structureMapsFromPayload(structureBody || {}));

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
      toast.error(e?.message || 'Không tải được dữ liệu phân quyền');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedRoleId && systemRoles.length) {
      setSelectedRoleId(normalizeRoleId(systemRoles[0]));
    }
  }, [systemRoles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) return;
    setPermDraft(permissionStateFromEntries(selectedRole.permissions));
    setPermEditMode(false);
  }, [selectedRole]);

  const saveRolePermissions = async () => {
    if (!selectedRole || !orgId) return;
    setSavingPerms(true);
    try {
      await roleAPI.updateRole(normalizeRoleId(selectedRole), {
        permissions: permissionEntriesFromState(permDraft),
        serverId: orgId,
        organizationId: orgId,
      });
      toast.success('Đã lưu quyền vai trò');
      setPermEditMode(false);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || 'Không lưu được quyền');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleCreateRole = async () => {
    const name = createName.trim();
    if (!name || !orgId) {
      toast.error('Nhập tên vai trò');
      return;
    }
    try {
      setLoading(true);
      await roleAPI.createRole({
        name,
        serverId: orgId,
        organizationId: orgId,
        permissions: permissionEntriesFromState(permDraft),
        priority: priorityFromTier(TIER_EXEC),
        isDefault: false,
      });
      toast.success('Đã tạo vai trò');
      setCreateOpen(false);
      setCreateName('');
      await loadAll();
    } catch (e) {
      toast.error(e?.message || 'Không tạo được vai trò');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (!role || isProtectedDefaultRole(role)) return;
    const rid = normalizeRoleId(role);
    if (!rid || !window.confirm(`Xóa vai trò "${normalizeRoleDisplayName(role.name)}"?`)) return;
    try {
      setLoading(true);
      await roleAPI.deleteRole(rid, orgId);
      toast.success('Đã xóa vai trò');
      if (selectedRoleId === rid) setSelectedRoleId(null);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || 'Không xóa được vai trò');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateRole = async (role) => {
    if (!role || !orgId) return;
    try {
      setLoading(true);
      await roleAPI.createRole({
        name: `${normalizeRoleDisplayName(role.name)} (bản sao)`,
        serverId: orgId,
        organizationId: orgId,
        permissions: role.permissions || [],
        priority: role.priority || priorityFromTier(TIER_EXEC),
        color: role.color,
        isDefault: false,
      });
      toast.success('Đã nhân bản vai trò');
      await loadAll();
    } catch (e) {
      toast.error(e?.message || 'Không nhân bản được');
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
      toast.error(e?.message || 'Không tải được quyền của thành viên');
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
      toast.success(assigned ? 'Đã gỡ vai trò' : 'Đã gán vai trò');
      await loadAll();
      if (selectedMemberId === uid) await openMemberDetail(member);
    } catch (e) {
      toast.error(e?.message || 'Không cập nhật được vai trò');
    }
  };

  const assignRows = useMemo(() => {
    return members
      .map((m) => {
        const uid = String(m?.user?._id || m?.user || m?.userId || '');
        const profile = memberProfiles[uid];
        const assigned = (assignmentsByUser[uid] || [])
          .map((row) => {
            const rid = String(row?.roleId || row?._id || row?.id || row?.role?._id || '');
            return systemRoles.find((r) => normalizeRoleId(r) === rid);
          })
          .filter(Boolean);
        const membershipRole = String(m?.role || 'member').toLowerCase();
        return {
          member: m,
          userId: uid,
          displayName: profile?.displayName || uid.slice(-6),
          avatar: profile?.avatar,
          membershipLabel: MEMBERSHIP_ROLE_LABEL[membershipRole] || membershipRole,
          path: buildStructurePath(
            {
              teamId: m?.team,
              departmentId: m?.department,
              divisionId: m?.division,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold text-white">
            <Shield className="h-5 w-5 text-violet-400" />
            Phân quyền (RBAC)
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Quản lý vai trò hệ thống, phạm vi cấu trúc (khối/phòng/team) và gán vai trò cho thành viên.
            Quyền kênh chat/voice cấu hình riêng tại từng kênh.
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
          Tạo vai trò mới
        </GradientButton>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-1">
        {RBAC_TABS.map((tab) => {
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
                Danh sách vai trò
              </span>
              <button
                type="button"
                className="text-xs text-cyan-400 hover:text-cyan-300"
                onClick={() => setCreateOpen(true)}
              >
                + Tạo
              </button>
            </div>
            {loading && systemRoles.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">Đang tải…</p>
            ) : systemRoles.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">Chưa có vai trò hệ thống.</p>
            ) : (
              <div className="max-h-[560px] space-y-1 overflow-y-auto scrollbar-overlay">
                {systemRoles.map((role) => {
                  const rid = normalizeRoleId(role);
                  const active = rid === selectedRoleId;
                  const granted = grantedPermissionCount(role.permissions);
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
                            Hệ thống
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {membersN} thành viên · {granted}/{totalSlots} quyền
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            {!selectedRole ? (
              <p className="py-16 text-center text-sm text-slate-500">Chọn một vai trò để xem quyền.</p>
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
                        {grantedPermissionCount(selectedRole.permissions)}/{totalSlots} quyền
                      </span>
                      {permEditMode ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                          Đang chỉnh sửa
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Quyền tính năng toàn tổ chức (chat, task, tài liệu, voice). Quyền từng kênh cấu hình tại
                      bánh răng kênh.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDuplicateRole(selectedRole)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      <Copy className="mr-1 inline h-3.5 w-3.5" />
                      Nhân bản
                    </button>
                    {!isProtectedDefaultRole(selectedRole) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole)}
                        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                        Xóa
                      </button>
                    ) : null}
                    {permEditMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPermEditMode(false);
                            setPermDraft(permissionStateFromEntries(selectedRole.permissions));
                          }}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={saveRolePermissions}
                          disabled={savingPerms}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          Lưu
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPermEditMode(true)}
                        className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200"
                      >
                        <Pencil className="mr-1 inline h-3.5 w-3.5" />
                        Chỉnh sửa
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {RBAC_PERMISSION_GROUPS.map((group) => (
                    <div key={group.id} className="rounded-xl border border-slate-800 bg-[#0a0f18] p-4">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {group.label}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {group.resources.flatMap((res) =>
                          res.actions.map((action) => {
                            const key = `${res.resource}:${action}`;
                            const on = Boolean(permDraft[key]);
                            return (
                              <button
                                key={key}
                                type="button"
                                disabled={!permEditMode}
                                onClick={() =>
                                  setPermDraft((prev) => ({ ...prev, [key]: !prev[key] }))
                                }
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                  on
                                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                    : 'border-slate-700 bg-slate-900 text-slate-500'
                                } ${permEditMode ? 'cursor-pointer hover:border-slate-500' : 'cursor-default opacity-90'}`}
                              >
                                {on ? <Check className="h-3 w-3" /> : null}
                                {ACTION_LABEL[action] || action}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
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
              Vai trò phạm vi cấu trúc được đồng bộ tự động từ khối / phòng ban / team. Dùng để gán vị trí
              và quyền kênh theo phạm vi — không thay thế vai trò hệ thống (Quản trị viên, Nhân sự, Thành
              viên).
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
                  <span className="text-xs text-slate-500">{list.length} vai trò</span>
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
                          className="rounded-xl border border-slate-700/80 bg-[#0c1220] p-4"
                        >
                          <div className="font-semibold text-white">
                            {normalizeRoleDisplayName(role.name)}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{tier.hint}</p>
                          <p className="mt-2 text-xs text-slate-400">{membersN} thành viên được gán</p>
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
                  placeholder="Tìm tên hoặc đơn vị…"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {['all', 'Quản trị', 'Nhân sự', 'Thành viên'].map((f) => {
                  const active = f === 'all' ? assignFilter === 'all' : assignFilter === f;
                  return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAssignFilter(f === 'all' ? 'all' : f)}
                    className={`rounded-lg px-2.5 py-1 text-xs ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'Tất cả' : f}
                  </button>
                  );
                })}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Thành viên</th>
                    <th className="px-4 py-3">Đơn vị tổ chức</th>
                    <th className="px-4 py-3">Membership</th>
                    <th className="px-4 py-3">Vai trò hệ thống</th>
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
                            <span className="text-xs text-slate-500">Chưa gán</span>
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
              <p className="py-12 text-center text-sm text-slate-500">Chọn thành viên để gán vai trò.</p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Chi tiết thành viên</p>
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

                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Vai trò hệ thống</p>
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

                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Quyền hiệu lực</p>
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
            <h4 className="text-lg font-semibold text-white">Tạo vai trò hệ thống</h4>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Tên vai trò"
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

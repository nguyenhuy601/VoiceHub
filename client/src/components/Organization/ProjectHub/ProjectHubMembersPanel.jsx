import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { organizationAPI } from '../../../services/api/organizationAPI';
import projectDeliveryAPI from '../../../services/api/projectDeliveryAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { flattenOrgStructureDepartments } from '../../../utils/orgMemberStructureScope';
import {
  memberDepartmentId,
  memberUserId,
} from '../../../utils/adminUserUtils';
import UserAvatar from '../../Shared/UserAvatar';
import AllocationSegmentsEditor, {
  segmentsFromApi,
  segmentsToPayload,
  toDateInput,
} from './AllocationSegmentsEditor';
import ResourcePlannerPanel from '../../../features/adminTasks/ResourcePlannerPanel';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function asUserId(row) {
  return memberUserId(row) || String(row?.user?.id || '').trim();
}

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || value.userId || '');
  return String(value);
}

/** Bỏ prefix catalog «Dự án —» / «Project —» khi hiển thị chip. */
function shortRoleLabel(label, key = '') {
  const raw = String(label || key || '').trim();
  if (!raw) return key || '—';
  return raw.replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '').trim() || raw;
}

/** Tên hiển thị — ưu tiên profile đã enrich, không dùng 6 ký tự ID nếu còn nguồn khác. */
function resolveDisplayName(row, orgById) {
  const id = asUserId(row);
  const sources = [row, id ? orgById?.get(id) : null].filter(Boolean);
  for (const src of sources) {
    const nested = src?.user && typeof src.user === 'object' ? src.user : null;
    const email = String(src?.email || nested?.email || '').trim();
    const emailLocal = email.includes('@') ? email.split('@')[0] : '';
    const label =
      src?.displayName ||
      nested?.displayName ||
      src?.fullName ||
      nested?.fullName ||
      src?.name ||
      nested?.name ||
      src?.username ||
      nested?.username ||
      emailLocal ||
      '';
    if (label) return String(label);
  }
  return id.slice(-6) || '—';
}

function defaultAllocSegments() {
  const start = new Date();
  return [
    {
      startDate: toDateInput(start),
      endDate: '',
      allocationPct: 100,
    },
  ];
}

/**
 * Thành viên + project roles + Resource Allocation (dated).
 */
export default function ProjectHubMembersPanel({
  projectId = '',
  boardId = '',
  organizationId = '',
  canManage = false,
  isDarkMode = false,
}) {
  const { t } = useAppStrings();
  const projectIdStr = String(projectId || '').trim();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orgMembers, setOrgMembers] = useState([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [deptMemberIds, setDeptMemberIds] = useState([]);
  const [deptName, setDeptName] = useState('');
  const [deptNameById, setDeptNameById] = useState(() => new Map());
  /** Helper bulk-add: chọn phòng (không phải ownership project). */
  const [bulkDeptId, setBulkDeptId] = useState('');
  const [structureDepts, setStructureDepts] = useState([]);

  const [roleCatalog, setRoleCatalog] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [projectSummary, setProjectSummary] = useState(null);

  const [candidateRoleKey, setCandidateRoleKey] = useState('');
  const [candidateUsers, setCandidateUsers] = useState([]);
  const [candidateStaffingSummary, setCandidateStaffingSummary] = useState(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [formMode, setFormMode] = useState('add');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleKeys, setSelectedRoleKeys] = useState([]);
  const [allocSegments, setAllocSegments] = useState(defaultAllocSegments);
  const [billable, setBillable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRoleKeys, setBulkRoleKeys] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [peerProjects, setPeerProjects] = useState([]);
  const [plannerOpen, setPlannerOpen] = useState(false);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';

  const load = useCallback(async () => {
    const pid = String(projectId || '').trim();
    const bid = String(boardId || '').trim();
    const id = pid || bid;
    if (!id) {
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const res = await projectDeliveryAPI.listProjectMembers(id, { asProject: Boolean(pid) });
      const data = unwrap(res);
      setMembers(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubMembersFail') }));
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, boardId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const orgById = useMemo(() => {
    const map = new Map();
    for (const m of orgMembers || []) {
      const id = asUserId(m);
      if (id) map.set(id, m);
    }
    return map;
  }, [orgMembers]);

  const rows = useMemo(() => {
    const byUser = new Map();
    for (const m of members) {
      const uid = asUserId(m);
      if (!uid) continue;
      const roleKey = m?.projectRole?.key || m?.projectRole?.name || m?.roleKey || '';
      const prev = byUser.get(uid);
      if (!prev) {
        byUser.set(uid, {
          id: uid,
          name: resolveDisplayName(m, orgById),
          avatar: m?.user?.avatar || m?.avatar || orgById.get(uid)?.avatar || '',
          roles: roleKey ? [roleKey] : [],
          allocations: Array.isArray(m.allocations) ? m.allocations : m?.resource?.allocations || [],
          allocationStatus: m.allocationStatus || m?.resource?.allocationStatus || 'ok',
          billable: Boolean(m.billable ?? m?.resource?.billable),
          joinDate: m.joinDate || m?.resource?.joinDate || null,
          leaveDate: m.leaveDate || m?.resource?.leaveDate || null,
        });
      } else {
        if (roleKey && !prev.roles.includes(roleKey)) prev.roles.push(roleKey);
        if (!prev.allocations?.length && (m.allocations?.length || m?.resource?.allocations?.length)) {
          prev.allocations = m.allocations || m.resource.allocations;
          prev.allocationStatus = m.allocationStatus || m.resource?.allocationStatus || prev.allocationStatus;
        }
      }
    }
    return [...byUser.values()];
  }, [members, orgById]);

  const existingUserIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  const selectedMemberRow = useMemo(() => {
    if (!selectedUserId) return null;
    return rows.find((r) => String(r.id) === String(selectedUserId)) || null;
  }, [rows, selectedUserId]);

  const deptCandidates = useMemo(() => {
    if (!bulkDeptId) return [];
    const idSet = new Set(deptMemberIds);
    return (orgMembers || [])
      .map((m) => {
        const id = asUserId(m);
        if (!id || existingUserIds.has(id)) return null;
        // Prefer People Graph membership of selected dept; fallback to member.departmentId.
        if (idSet.size ? !idSet.has(id) : memberDepartmentId(m) !== bulkDeptId) return null;
        return {
          id,
          name: resolveDisplayName(m, orgById),
          email: String(m?.email || m?.user?.email || '').trim(),
        };
      })
      .filter(Boolean);
  }, [bulkDeptId, deptMemberIds, orgMembers, existingUserIds, orgById]);

  const resetForm = () => {
    setFormMode('add');
    setSelectedUserId('');
    setSelectedRoleKeys([]);
    setAllocSegments(defaultAllocSegments());
    setBillable(false);
    setCandidateUsers([]);
    setCandidateStaffingSummary(null);
    setPeerProjects([]);
  };

  const startEdit = (row) => {
    setFormMode('edit');
    setSelectedUserId(String(row?.id || '').trim());
    setSelectedRoleKeys(Array.isArray(row?.roles) ? row.roles : []);
    const segs = segmentsFromApi(row?.allocations);
    setAllocSegments(segs.length ? segs : defaultAllocSegments());
    setBillable(Boolean(row?.billable));
  };

  useEffect(() => {
    const uid = String(selectedUserId || '').trim();
    const oid = String(organizationId || projectSummary?.organizationId || '').trim();
    if (!uid || !oid) {
      setPeerProjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.getUserAllocations(oid, uid);
        const data = unwrap(res);
        if (!cancelled) {
          setPeerProjects(
            (Array.isArray(data?.projects) ? data.projects : []).filter(
              (p) => String(p.projectId) !== projectIdStr
            )
          );
        }
      } catch {
        if (!cancelled) setPeerProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, organizationId, projectSummary?.organizationId, projectIdStr]);

  useEffect(() => {
    if (!canManage || !projectIdStr) return;
    let cancelled = false;
    (async () => {
      setOrgMembers([]);
      setRoleCatalog([]);
      setProjectSummary(null);
      setDeptMemberIds([]);
      setDeptName('');
      setDeptNameById(new Map());
      setBulkDeptId('');
      setStructureDepts([]);
      setCandidateRoleKey('');
      setCandidateUsers([]);
      setCandidateStaffingSummary(null);
      setFormMode('add');
      setSelectedUserId('');
      setSelectedRoleKeys([]);
      setAllocSegments(defaultAllocSegments());
      setBillable(false);

      setOrgLoading(true);
      setRolesLoading(true);
      try {
        const res = await projectAPI.get(projectIdStr);
        const data = res?.data?.data ?? res?.data ?? res;
        const nextOrgId = String(data?.organizationId || data?.orgId || '').trim();
        if (cancelled) return;
        if (!nextOrgId) throw new Error('organizationId thiếu');
        setProjectSummary({
          projectId: String(data?.projectId || data?._id || projectIdStr),
          organizationId: nextOrgId,
          title: String(data?.title || '').trim(),
          projectCode: String(data?.projectCode || '').trim(),
          requiredProjectRoles: Array.isArray(data?.requiredProjectRoles) ? data.requiredProjectRoles : [],
        });

        const [membersRes, rolesRes, structureRes] = await Promise.all([
          organizationAPI.getMembersWithRoles(nextOrgId),
          projectAPI.listRoleCatalog(nextOrgId),
          organizationAPI.getStructure(nextOrgId).catch(() => null),
        ]);
        const wrapped = unwrap(membersRes);
        const orgRows = Array.isArray(wrapped?.members)
          ? wrapped.members
          : Array.isArray(wrapped)
            ? wrapped
            : [];
        const roles = unwrap(rolesRes);
        if (cancelled) return;
        setOrgMembers(orgRows);
        const roleList = Array.isArray(roles) ? roles : [];
        setRoleCatalog(roleList);
        const defaultKeys = roleList
          .filter((r) => r.canAssign && String(r.key) === 'developer')
          .map((r) => r.key);
        setBulkRoleKeys(defaultKeys.length ? defaultKeys : roleList.filter((r) => r.canAssign).slice(0, 1).map((r) => r.key));

        const structure = unwrap(structureRes);
        const depts = flattenOrgStructureDepartments(structure);
        const nameMap = new Map();
        for (const d of depts) {
          const id = asId(d);
          if (id) nameMap.set(id, String(d.name || '').trim() || id.slice(-6));
        }
        if (Array.isArray(structure?.departments)) {
          for (const d of structure.departments) {
            const id = asId(d);
            if (id && !nameMap.has(id)) {
              nameMap.set(id, String(d.name || '').trim() || id.slice(-6));
            }
          }
        }
        setDeptNameById(nameMap);
        setStructureDepts(depts);
      } catch (err) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubMembersFail') }));
        }
      } finally {
        if (!cancelled) {
          setOrgLoading(false);
          setRolesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, projectIdStr, t]);

  useEffect(() => {
    if (!canManage || formMode !== 'add' || !projectIdStr) return;
    const roleKey = String(candidateRoleKey || '').trim();
    if (!roleKey) {
      setCandidateUsers([]);
      setCandidateStaffingSummary(null);
      setCandidatesLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCandidatesLoading(true);
      try {
        const res = await projectAPI.listMemberCandidates(projectIdStr, roleKey);
        const data = unwrap(res);
        if (cancelled) return;
        setCandidateUsers(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
        setCandidateStaffingSummary(data?.staffingSummary || null);
        if (data?.project) setProjectSummary(data.project);
      } catch (err) {
        if (!cancelled) {
          setCandidateUsers([]);
          setCandidateStaffingSummary(null);
          toast.error(
            resolveApiErrorMessage(err, {
              t,
              fallback: t('workspace.projectHubMembersCandidateLoadFail'),
            })
          );
        }
      } finally {
        if (!cancelled) setCandidatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, formMode, projectIdStr, candidateRoleKey, t]);

  useEffect(() => {
    const deptId = String(bulkDeptId || '').trim();
    if (!deptId) {
      setDeptMemberIds([]);
      setDeptName('');
      return;
    }
    const dept = structureDepts.find((d) => asId(d) === deptId) || null;
    setDeptName(deptNameById.get(deptId) || String(dept?.name || '').trim());
    const ids = new Set();
    const addPerson = (m) => {
      const id = asId(m) || asUserId(m);
      if (id) ids.add(id);
    };
    if (dept) {
      if (dept.head) addPerson(dept.head);
      (dept.members || []).forEach(addPerson);
      // People graph: members thường nằm trong teams — không bỏ sót
      (dept.teams || []).forEach((team) => {
        if (team?.leader) addPerson(team.leader);
        (team?.members || []).forEach(addPerson);
      });
    }
    // Luôn union với org members theo departmentId (fallback khi structure thiếu roster)
    for (const m of orgMembers || []) {
      if (memberDepartmentId(m) === deptId) addPerson(m);
    }
    setDeptMemberIds([...ids]);
  }, [bulkDeptId, structureDepts, deptNameById, orgMembers]);

  const canSubmit = useMemo(() => {
    if (!canManage || !projectIdStr) return false;
    if (!selectedUserId) return false;
    if (!Array.isArray(selectedRoleKeys) || !selectedRoleKeys.length) return false;
    if (rolesLoading || orgLoading) return false;
    return true;
  }, [canManage, projectIdStr, selectedUserId, selectedRoleKeys, rolesLoading, orgLoading]);

  const projectRequiredRoles = useMemo(
    () => (Array.isArray(projectSummary?.requiredProjectRoles) ? projectSummary.requiredProjectRoles : []),
    [projectSummary]
  );

  const fallbackStaffingSummary = useMemo(() => {
    const roleKey = String(candidateRoleKey || '').trim().toLowerCase();
    if (!roleKey) return null;
    const requiredRow = projectRequiredRoles.find(
      (row) => String(row?.roleKey || '').trim().toLowerCase() === roleKey
    );
    const currentCount = rows.filter((row) =>
      (Array.isArray(row.roles) ? row.roles : []).some(
        (item) => String(item || '').trim().toLowerCase() === roleKey
      )
    ).length;
    const requiredCount = Number(requiredRow?.requiredCount) || 0;
    return {
      roleKey,
      requiredCount,
      currentCount,
      remainingCount: Math.max(requiredCount - currentCount, 0),
      isFilled: requiredCount > 0 && currentCount >= requiredCount,
    };
  }, [candidateRoleKey, projectRequiredRoles, rows]);

  const effectiveStaffingSummary = candidateStaffingSummary || fallbackStaffingSummary;

  const toggleRoleKey = (key, canAssign = true) => {
    if (!canAssign) return;
    const rk = String(key || '').trim();
    if (!rk) return;
    setSelectedRoleKeys((prev) => {
      const set = new Set(prev || []);
      if (set.has(rk)) set.delete(rk);
      else set.add(rk);
      return [...set];
    });
  };

  const chooseCandidate = (candidate) => {
    const userId = String(candidate?.userId || candidate?.id || '').trim();
    if (!userId) return;
    setSelectedUserId(userId);
    if (candidateRoleKey) {
      setSelectedRoleKeys((prev) => {
        const next = new Set(prev || []);
        next.add(String(candidateRoleKey));
        return [...next];
      });
    }
  };

  const toggleBulkRole = (key, canAssign = true) => {
    if (!canAssign) return;
    const rk = String(key || '').trim();
    if (!rk) return;
    setBulkRoleKeys((prev) => {
      const set = new Set(prev || []);
      if (set.has(rk)) set.delete(rk);
      else set.add(rk);
      return [...set];
    });
  };

  const buildAllocOptions = () => {
    const payload = segmentsToPayload(allocSegments);
    return {
      allocations: payload.length ? payload : undefined,
      billable,
      status: 'active',
      joinDate: payload[0]?.startDate || new Date().toISOString().slice(0, 10),
    };
  };

  const saveRoles = async () => {
    if (!canSubmit || submitting) return;
    const keys = [...new Set(selectedRoleKeys)].filter(Boolean);
    const options = buildAllocOptions();
    if (!options.allocations?.length) {
      toast.error(t('workspace.projectHubAllocRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await projectAPI.setMemberRoles(projectIdStr, selectedUserId, keys, options);
      const data = unwrap(res);
      const status = data?.allocationStatus || data?.resource?.allocationStatus || 'ok';
      if (status === 'overallocated') {
        toast.success(t('workspace.projectHubAllocSavedOver'));
      } else {
        toast.success(t('workspace.projectHubMembersRolesSaved'));
      }
      await load();
      resetForm();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubMembersRoleSaveFail') }));
    } finally {
      setSubmitting(false);
    }
  };

  const bulkAddFromDept = async () => {
    if (!canManage || !bulkDeptId || bulkBusy) return;
    const keys = [...new Set(bulkRoleKeys)].filter(Boolean);
    if (!keys.length) {
      toast.error(t('workspace.projectHubMembersRoleRequired'));
      return;
    }
    const targets = deptCandidates;
    if (!targets.length) {
      toast.error(t('workspace.projectHubBulkNoCandidates'));
      return;
    }
    const options = buildAllocOptions();
    if (!options.allocations?.length) {
      toast.error(t('workspace.projectHubAllocRequired'));
      return;
    }

    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    let over = 0;
    try {
      for (const user of targets) {
        try {
          const res = await projectAPI.setMemberRoles(projectIdStr, user.id, keys, options);
          const data = unwrap(res);
          if ((data?.allocationStatus || data?.resource?.allocationStatus) === 'overallocated') {
            over += 1;
          }
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      toast.success(t('workspace.projectHubBulkDone', { ok, fail, over }));
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const roleLabelByKey = useMemo(() => {
    const map = new Map();
    for (const r of roleCatalog || []) {
      const k = String(r.key || '').trim();
      if (k) map.set(k, shortRoleLabel(r.label, k));
    }
    return map;
  }, [roleCatalog]);

  const assignableRoles = useMemo(
    () => (roleCatalog || []).filter((r) => r.canAssign),
    [roleCatalog]
  );

  const formatRoleKeys = (keys = []) =>
    keys.map((k) => roleLabelByKey.get(k) || shortRoleLabel('', k)).filter(Boolean).join(' · ') ||
    '—';

  const formatCandidateReasons = (candidate) => {
    const reasons = [];
    if (candidate?.responsibilityKeys?.length) {
      reasons.push(
        t('workspace.projectHubMembersCandidateReasonResp', {
          keys: candidate.responsibilityKeys.join(', '),
        })
      );
    }
    if (candidate?.priorRoleKeys?.length) {
      reasons.push(
        t('workspace.projectHubMembersCandidateReasonPrior', {
          key:
            roleLabelByKey.get(candidate.priorRoleKeys[0]) ||
            shortRoleLabel('', candidate.priorRoleKeys[0]),
        })
      );
    }
    return reasons.join(' · ');
  };

  const renderStaffingSummary = () => {
    if (!candidateRoleKey || !effectiveStaffingSummary) return null;
    if (effectiveStaffingSummary.requiredCount <= 0) {
      return (
        <p className={`rounded-lg border border-dashed border-border px-3 py-2 text-xs ${muted}`}>
          {t('workspace.projectHubMembersStaffingUnset')}
        </p>
      );
    }
    return (
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          effectiveStaffingSummary.isFilled
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700'
            : 'border-amber-500/30 bg-amber-500/5 text-amber-700'
        }`}
      >
        <div className="font-semibold">
          {effectiveStaffingSummary.isFilled
            ? t('workspace.projectHubMembersStaffingFilled')
            : t('workspace.projectHubMembersStaffingNeeds')}
        </div>
        <div className="mt-1">
          {t('workspace.projectHubMembersStaffingSummary', {
            required: effectiveStaffingSummary.requiredCount,
            current: effectiveStaffingSummary.currentCount,
            remaining: effectiveStaffingSummary.remainingCount,
          })}
        </div>
      </div>
    );
  };

  const formatAllocSummary = (allocations = []) => {
    if (!allocations?.length) return '—';
    return allocations
      .map((s) => {
        const a = toDateInput(s.startDate) || '?';
        const b = toDateInput(s.endDate) || '…';
        return `${s.allocationPct ?? '?'}% (${a}→${b})`;
      })
      .join('; ');
  };

  const fieldCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary';
  const cardCls = 'rounded-xl border border-border bg-surface';

  const renderRoleChips = (keys, selectedKeys, onToggle, { onlyAssignable = false } = {}) => {
    const list = onlyAssignable ? assignableRoles : roleCatalog || [];
    if (!list.length) {
      return (
        <p className={`text-xs ${muted}`}>
          {rolesLoading ? '…' : t('workspace.projectHubMembersNoRoles')}
        </p>
      );
    }
    return (
      <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => {
          const rk = String(r.key || '').trim();
          const canAssign = Boolean(r.canAssign);
          const selected = selectedKeys.includes(rk);
          const label = shortRoleLabel(r.label, rk);
          return (
            <button
              key={r._id || rk}
              type="button"
              disabled={!canAssign}
              title={r.label || rk}
              onClick={() => onToggle(rk, canAssign)}
              className={[
                'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                selected
                  ? 'border-primary bg-primary/10 font-semibold text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                !canAssign ? 'cursor-not-allowed opacity-40' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                ].join(' ')}
                aria-hidden
              >
                {selected ? '✓' : ''}
              </span>
              <span className="min-w-0 truncate">{label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`text-base font-bold tracking-tight ${titleCls}`}>
            {t('workspace.projectHubTabMembers')}
          </h3>
          <p className={`mt-0.5 text-xs ${muted}`}>
            {loading ? '…' : t('workspace.projectHubMembersCount', { n: rows.length })}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          {/* Member roster — primary on mobile (order) */}
          <section className={`${cardCls} order-2 flex min-h-0 flex-col p-3 sm:p-4 lg:order-1`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className={`text-sm font-semibold ${titleCls}`}>
                {t('workspace.projectHubMembersRoster')}
              </h4>
              <span className={`rounded-md bg-muted/50 px-2 py-0.5 text-[11px] tabular-nums ${muted}`}>
                {rows.length}
              </span>
            </div>

            {loading ? (
              <p className={`py-8 text-center text-sm ${muted}`}>…</p>
            ) : rows.length === 0 ? (
              <p
                className={`rounded-lg border border-dashed border-border px-3 py-10 text-center text-sm ${muted}`}
              >
                {t('workspace.projectHubMembersEmpty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => {
                  const active = formMode === 'edit' && String(selectedUserId) === String(row.id);
                  return (
                    <li
                      key={row.id}
                      className={[
                        'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                        active
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border/80 bg-background hover:border-border',
                      ].join(' ')}
                    >
                      <UserAvatar
                        name={row.name}
                        avatar={row.avatar || undefined}
                        userId={row.id}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`truncate text-sm font-semibold ${titleCls}`}>
                            {row.name}
                          </span>
                          {row.allocationStatus === 'overallocated' ? (
                            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                              {t('workspace.projectHubAllocOverBadge')}
                            </span>
                          ) : null}
                          {row.billable ? (
                            <span className={`rounded bg-muted px-1.5 py-0.5 text-[10px] ${muted}`}>
                              Billable
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(row.roles || []).length ? (
                            row.roles.map((rk) => (
                              <span
                                key={rk}
                                className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
                              >
                                {roleLabelByKey.get(rk) || shortRoleLabel('', rk)}
                              </span>
                            ))
                          ) : (
                            <span className={`text-[11px] ${muted}`}>{t('workspace.roleMemberVi')}</span>
                          )}
                        </div>
                        <p className={`mt-1 truncate text-[11px] ${muted}`}>
                          {formatAllocSummary(row.allocations)}
                        </p>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          disabled={submitting}
                          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                        >
                          {t('workspace.projectHubMembersSetRoles')}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {canManage ? (
            <div className="order-1 flex flex-col gap-3 lg:order-2">
              {/* Add / edit member */}
              <section className={`${cardCls} p-3 sm:p-4`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className={`text-sm font-semibold ${titleCls}`}>
                      {formMode === 'edit'
                        ? t('workspace.projectHubMembersEditTitle')
                        : t('workspace.projectHubMembersAddTitle')}
                    </h4>
                    <p className={`mt-0.5 text-xs ${muted}`}>
                      {t('workspace.projectHubMembersAddHint')}
                    </p>
                  </div>
                  {formMode === 'edit' ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={submitting}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted/40"
                    >
                      {t('workspace.projectHubMembersCancel')}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {formMode === 'add' ? (
                    <div className="space-y-2">
                      <label className={`block text-[11px] font-medium ${muted}`}>
                        {t('workspace.projectHubMembersFilterRole')}
                        <select
                          value={candidateRoleKey}
                          onChange={(e) => setCandidateRoleKey(e.target.value)}
                          disabled={rolesLoading || submitting}
                          className={`${fieldCls} mt-1`}
                        >
                          <option value="">{t('workspace.projectHubMembersFilterRolePh')}</option>
                          {assignableRoles.map((role) => (
                            <option key={role._id || role.key} value={role.key}>
                              {shortRoleLabel(role.label, role.key)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-background">
                        {renderStaffingSummary() ? (
                          <div className="border-b border-border p-2">{renderStaffingSummary()}</div>
                        ) : null}
                        {!candidateRoleKey ? (
                          <p className={`px-3 py-4 text-center text-xs ${muted}`}>
                            {t('workspace.projectHubMembersPickRoleFirst')}
                          </p>
                        ) : candidatesLoading ? (
                          <p className={`px-3 py-4 text-center text-xs ${muted}`}>…</p>
                        ) : !candidateUsers.length ? (
                          <p className={`px-3 py-4 text-center text-xs ${muted}`}>
                            {t('workspace.projectHubMembersNoCandidates')}
                          </p>
                        ) : (
                          <ul className="divide-y divide-border">
                            {candidateUsers.slice(0, 40).map((u) => {
                              const userId = String(u.userId || u.id || '').trim();
                              const selected = String(selectedUserId) === userId;
                              const reasonText = formatCandidateReasons(u);
                              return (
                                <li key={userId}>
                                  <button
                                    type="button"
                                    onClick={() => chooseCandidate(u)}
                                    disabled={submitting}
                                    className={[
                                      'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                                      selected ? 'bg-primary/10' : 'hover:bg-muted/40',
                                    ].join(' ')}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span
                                        className={`block truncate text-sm ${
                                          selected ? 'font-semibold text-foreground' : titleCls
                                        }`}
                                      >
                                        {u.displayName || userId}
                                      </span>
                                      <span className={`mt-0.5 block text-[10px] ${muted}`}>
                                        {reasonText || t('workspace.projectHubMembersCandidateReasonGeneric')}
                                      </span>
                                    </span>
                                    {u.availability === 'available' ||
                                    (u.allocationStatus === 'ok' && (u.availablePct ?? 100) >= 100) ? (
                                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                        {t('workspace.projectHubMembersCandidateAvailable')}
                                        {typeof u.availablePct === 'number'
                                          ? ` ${Math.round(u.availablePct)}%`
                                          : ''}
                                      </span>
                                    ) : u.availability === 'partial' ? (
                                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                        {t('workspace.projectHubMembersCandidatePartial')}
                                        {typeof u.availablePct === 'number'
                                          ? ` ${Math.round(u.availablePct)}%`
                                          : ''}
                                      </span>
                                    ) : u.availability === 'overallocated' ||
                                      u.allocationStatus === 'overallocated' ? (
                                      <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                        {t('workspace.projectHubAllocOverBadge')}
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : selectedMemberRow ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                      <UserAvatar
                        name={selectedMemberRow.name}
                        avatar={selectedMemberRow.avatar || undefined}
                        userId={selectedMemberRow.id}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-semibold ${titleCls}`}>
                          {selectedMemberRow.name}
                        </div>
                        <div className={`truncate text-xs ${muted}`}>
                          {formatRoleKeys(selectedMemberRow.roles)}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
                        {t('workspace.projectHubMembersPickRoles')}
                      </p>
                      <span className={`text-[11px] tabular-nums ${muted}`}>
                        {t('workspace.projectHubMembersRolesSelected', {
                          n: selectedRoleKeys.length,
                        })}
                      </span>
                    </div>
                    {renderRoleChips(null, selectedRoleKeys, toggleRoleKey, {
                      onlyAssignable: formMode === 'add',
                    })}
                  </div>

                  <AllocationSegmentsEditor
                    segments={allocSegments}
                    onChange={setAllocSegments}
                    disabled={submitting}
                    isDarkMode={isDarkMode}
                    t={t}
                    peerProjects={peerProjects}
                  />

                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={billable}
                      onChange={(e) => setBillable(e.target.checked)}
                      disabled={submitting}
                      className="rounded border-border"
                    />
                    {t('workspace.projectHubAllocBillable')}
                  </label>

                  <button
                    type="button"
                    onClick={saveRoles}
                    disabled={!canSubmit || submitting}
                    className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
                  >
                    {submitting ? '…' : t('workspace.projectHubMembersRolesSave')}
                  </button>
                </div>
              </section>

              {/* Resource Planner — related depts */}
              <section className={`${cardCls} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => setPlannerOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:px-4"
                >
                  <div className="min-w-0">
                    <h4 className={`text-sm font-semibold ${titleCls}`}>
                      {t('workspace.projectHubPlannerTitle')}
                    </h4>
                    <p className={`mt-0.5 text-xs ${muted}`}>{t('workspace.projectHubPlannerHint')}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${muted}`}>
                    {plannerOpen ? '▴' : '▾'}
                  </span>
                </button>
                {plannerOpen ? (
                  <div className="border-t border-border px-3 pb-4 pt-3 sm:px-4">
                    <ResourcePlannerPanel
                      orgId={String(organizationId || projectSummary?.organizationId || '')}
                      projectId={projectIdStr}
                      canManage={canManage}
                      embedded
                      isDarkMode={isDarkMode}
                    />
                  </div>
                ) : null}
              </section>

              {/* Bulk from department — secondary / collapsible */}
              <section className={`${cardCls} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => setBulkOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left sm:px-4"
                >
                  <div className="min-w-0">
                    <h4 className={`text-sm font-semibold ${titleCls}`}>
                      {t('workspace.projectHubBulkTitle')}
                    </h4>
                    <p className={`mt-0.5 text-xs ${muted}`}>
                      {bulkDeptId
                        ? t('workspace.projectHubBulkHint', {
                            dept: deptName || t('workspace.projectHubMembersUnplacedDept'),
                            n: deptCandidates.length,
                          })
                        : t('workspace.projectHubBulkPickDept')}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${muted}`}>
                    {bulkOpen ? '▴' : '▾'}
                  </span>
                </button>

                {bulkOpen ? (
                  <div className="space-y-3 border-t border-border px-3 pb-4 pt-3 sm:px-4">
                    <select
                      value={bulkDeptId}
                      onChange={(e) => setBulkDeptId(e.target.value)}
                      className={fieldCls}
                    >
                      <option value="">{t('workspace.projectHubBulkPickDept')}</option>
                      {[...deptNameById.entries()]
                        .sort((a, b) =>
                          String(a[1]).localeCompare(String(b[1]), undefined, { sensitivity: 'base' })
                        )
                        .map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                    </select>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
                          {t('workspace.projectHubMembersPickRoles')}
                        </p>
                        <span className={`text-[11px] ${muted}`}>
                          {t('workspace.projectHubMembersRolesSelected', {
                            n: bulkRoleKeys.length,
                          })}
                        </span>
                      </div>
                      {renderRoleChips(null, bulkRoleKeys, toggleBulkRole, {
                        onlyAssignable: true,
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={bulkAddFromDept}
                      disabled={
                        bulkBusy || !bulkDeptId || !deptCandidates.length || !bulkRoleKeys.length
                      }
                      className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
                    >
                      {bulkBusy
                        ? '…'
                        : t('workspace.projectHubBulkSubmitWithCount', {
                            n: deptCandidates.length,
                          })}
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

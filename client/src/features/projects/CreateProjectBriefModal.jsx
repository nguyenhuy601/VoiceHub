import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import {
  enrichMembershipsWithProfiles,
  memberUserId,
} from '../../features/search/enrichOrgMembers';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import toast from 'react-hot-toast';

const TIER_RANK = { head: 0, leader: 1, member: 2 };

/** Owner/Admin org — không chọn làm PM trừ khi đã là trưởng phòng / trưởng nhóm. */
function isElevatedOrgMembership(row) {
  const r = String(row.role || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

function unwrapMembers(payload) {
  const raw =
    payload?.data !== undefined && (payload?.success !== undefined || payload?.status !== undefined)
      ? payload.data
      : payload;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.members)) return raw.members;
  return [];
}

function personBaseLabel(row) {
  const name = String(row.displayName || row.fullName || row.name || row.username || '').trim();
  const email = String(row.email || '').trim();
  const id = memberUserId(row);
  return name && email ? `${name} (${email})` : name || email || id;
}

/** Một nhãn chức vụ duy nhất — ưu tiên cấu trúc phòng/team, không ghép «Thành viên · Owner». */
function pmRoleLabel(tier, row, t) {
  if (tier === 'head') return t('taskBoard.briefPmTierHead');
  if (tier === 'leader') return t('taskBoard.briefPmTierLeader');
  const r = String(row.role || '').toLowerCase();
  if (r === 'hr') return t('taskBoard.briefPmTierHr');
  return t('taskBoard.briefPmTierMember');
}

/**
 * Gợi ý / sắp xếp PM theo hierarchy:
 * trưởng phòng → trưởng nhóm → thành viên.
 * Ẩn owner/admin (trừ khi là head/leader của phòng/team).
 */
function buildHierarchyPmOptions(members, { headId, leaderIds }, t) {
  const head = String(headId || '').trim();
  const leaderSet = new Set((leaderIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const byId = new Map();

  for (const row of members || []) {
    const id = memberUserId(row);
    if (!id) continue;

    let tier = 'member';
    if (id === head) tier = 'head';
    else if (leaderSet.has(id)) tier = 'leader';

    if (isElevatedOrgMembership(row) && tier === 'member') continue;

    const label = `${personBaseLabel(row)} · ${pmRoleLabel(tier, row, t)}`;
    const next = { id, label, tier, rank: TIER_RANK[tier] };
    const prev = byId.get(id);
    if (!prev || next.rank < prev.rank) byId.set(id, next);
  }

  return [...byId.values()].sort(
    (a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'vi')
  );
}

function resolvePrefillPm(options, { headId, leaderIds }) {
  const ids = new Set((options || []).map((o) => o.id));
  const head = String(headId || '').trim();
  if (head && ids.has(head)) return { id: head, kind: 'head' };
  for (const raw of leaderIds || []) {
    const lid = String(raw || '').trim();
    if (lid && ids.has(lid)) return { id: lid, kind: 'leader' };
  }
  return null;
}

export default function CreateProjectBriefModal({
  isOpen,
  onClose,
  organizationId = '',
  departmentId = '',
  /** Trưởng phòng (Department.head) */
  departmentHeadUserId = '',
  /** Trưởng nhóm trong phòng — ưu tiên team đang chọn trước */
  teamLeaderUserIds = [],
  creating = false,
  onCreated,
}) {
  const { t } = useAppStrings();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneePmId, setAssigneePmId] = useState('');
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pmPrefillKind, setPmPrefillKind] = useState('');

  const hierarchy = useMemo(
    () => ({
      headId: String(departmentHeadUserId || '').trim(),
      leaderIds: Array.isArray(teamLeaderUserIds)
        ? teamLeaderUserIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
    }),
    [departmentHeadUserId, teamLeaderUserIds]
  );

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setBody('');
    setProjectCode('');
    setDueDate('');
    setAssigneePmId('');
    setMembersError('');
    setPmPrefillKind('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !organizationId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMembers(true);
      setMembersError('');
      try {
        const payload = await organizationAPI.getMembers(organizationId);
        if (cancelled) return;
        const rows = unwrapMembers(payload);
        const enriched = await enrichMembershipsWithProfiles(rows, {
          fallback: t('organizations.memberFallbackShort'),
          limit: 200,
        });
        if (cancelled) return;
        setMembers(enriched);
        if (!enriched.length) {
          setMembersError(t('taskBoard.briefPmEmpty'));
        }
        const options = buildHierarchyPmOptions(enriched, hierarchy, t);
        const prefill = resolvePrefillPm(options, hierarchy);
        if (prefill) {
          setAssigneePmId(prefill.id);
          setPmPrefillKind(prefill.kind);
        }
      } catch {
        if (!cancelled) {
          setMembers([]);
          setMembersError(t('taskBoard.briefPmLoadFail'));
        }
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, hierarchy, t]);

  const memberOptions = useMemo(
    () => buildHierarchyPmOptions(members, hierarchy, t),
    [members, hierarchy, t]
  );

  const canSubmit =
    String(title || '').trim().length > 0 &&
    Boolean(assigneePmId) &&
    !creating &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !organizationId) return;
    setSubmitting(true);
    try {
      const res = await taskAPI.createProjectBrief({
        organizationId: String(organizationId),
        departmentId: departmentId || undefined,
        title: String(title).trim(),
        body: String(body || '').trim(),
        projectCode: String(projectCode || '').trim(),
        dueDate: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : undefined,
        assigneePmId: String(assigneePmId),
      });
      const data = unwrapTaskApiPayload(res);
      toast.success(t('taskBoard.briefCreated'));
      onCreated?.(data);
      onClose?.();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('taskBoard.briefCreateFail')));
    } finally {
      setSubmitting(false);
    }
  };

  const prefillHint =
    pmPrefillKind === 'head'
      ? t('taskBoard.briefPmPrefillHead')
      : pmPrefillKind === 'leader'
        ? t('taskBoard.briefPmPrefillLeader')
        : t('taskBoard.briefPmHint');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('taskBoard.briefCreateTitle')} size="md">
      <div className="space-y-4">
        <p className="text-xs text-slate-400">{t('taskBoard.briefCreateHint')}</p>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('taskBoard.briefTitleLabel')} *</div>
          <input
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder={t('taskBoard.briefTitlePh')}
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('taskBoard.briefBodyLabel')}</div>
          <textarea
            value={body}
            maxLength={4000}
            rows={4}
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder={t('taskBoard.briefBodyPh')}
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardProjectCodeLabel')}</div>
          <input
            value={projectCode}
            maxLength={64}
            onChange={(e) => setProjectCode(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder={t('organization.taskBoardProjectCodePlaceholder')}
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('organization.taskBoardDueDateLabel')}</div>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">{t('taskBoard.briefPmLabel')} *</div>
          <select
            value={assigneePmId}
            onChange={(e) => {
              setAssigneePmId(e.target.value);
              setPmPrefillKind('');
            }}
            disabled={loadingMembers || memberOptions.length === 0}
            className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none disabled:opacity-50"
          >
            <option value="">
              {loadingMembers ? t('taskBoard.briefPmLoading') : t('taskBoard.briefPmPlaceholder')}
            </option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {membersError ? <p className="mt-1 text-xs text-rose-300">{membersError}</p> : null}
          {!loadingMembers && memberOptions.length > 0 ? (
            <p className="mt-1 text-xs text-slate-500">{prefillHint}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || creating}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            {t('nav.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {submitting || creating ? t('taskBoard.briefCreating') : t('taskBoard.briefCreateSubmit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

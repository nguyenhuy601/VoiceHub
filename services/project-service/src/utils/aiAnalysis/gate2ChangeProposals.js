/**
 * PM consolidation change proposals.
 * A change to PO/Tech content is not applied as that role's approval
 * until the owner accepts. PO risk acceptance is a separate stamp.
 */

const { REVIEW_LANE } = require('./gate2ReviewLane');
const { GATE2_TRACKS, trackForSection } = require('./gate2ReviewOwnership');

function emptyTracks({ techRequired = true } = {}) {
  return {
    po: { status: 'pending' },
    tech: techRequired ? { status: 'pending' } : { status: 'skipped' },
    pm: { status: 'pending' },
  };
}

function normalizeTracks(raw, { techRequired = true, roleKeys = null } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const usePlanKeys = Array.isArray(roleKeys);
  const keys = usePlanKeys ? roleKeys : GATE2_TRACKS;
  const legacy = !usePlanKeys;
  const base = legacy ? emptyTracks({ techRequired }) : {};
  for (const key of keys) {
    const row = src[key] && typeof src[key] === 'object' ? src[key] : {};
    const fallback = legacy ? base[key].status : 'pending';
    const status = String(row.status || fallback).trim().toLowerCase();
    const allowed = new Set(['submitted', 'skipped', 'pending', 'waiting']);
    base[key] = {
      ...row,
      status: allowed.has(status) ? status : fallback,
    };
  }
  if (legacy && !techRequired && base.tech.status === 'pending') {
    base.tech = { ...base.tech, status: 'skipped' };
  }
  return base;
}

function tracksReadyForConsolidation(tracks, roleKeys = null) {
  const keys = Array.isArray(roleKeys) ? roleKeys : GATE2_TRACKS;
  return keys.every((key) => {
    const status = String(tracks?.[key]?.status || '');
    return status === 'submitted' || status === 'skipped';
  });
}

function isBlockingProposal(row) {
  const status = String(row?.status || '');
  if (status === 'pending' || status === 'escalated') return true;
  if (status === 'rejected' && !row?.resolution) return true;
  return false;
}

function blockingProposals(list) {
  return (Array.isArray(list) ? list : []).filter(isBlockingProposal);
}

function newProposalId() {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clip(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * @returns {{ gate2: object, reviewLane: string, notify: { permission: string, title: string, content: string, kind: string } | null }}
 */
function applyGate2CollaborativeAction({
  gate2 = {},
  action,
  userId,
  note = '',
  reviewDecisions = null,
  proposal = null,
  proposalId = '',
  decision = '',
  track = '',
  techRequired = true,
}) {
  const act = String(action || '').trim().toLowerCase();
  const actor = String(userId || '').trim();
  const noteTrim = clip(note, 2000);
  const current = gate2 && typeof gate2 === 'object' ? { ...gate2 } : {};
  const reviewPlan = current.reviewPlan && typeof current.reviewPlan === 'object' ? current.reviewPlan : null;
  const planRoleKeys = reviewPlan
    ? require('./gate2RolePlan').roleKeysOfTracks(reviewPlan, current.tracks)
    : null;
  const tracks = normalizeTracks(current.tracks, { techRequired, roleKeys: planRoleKeys });
  let proposals = Array.isArray(current.changeProposals)
    ? current.changeProposals.map((row) => ({ ...row }))
    : [];
  let reviewLane = String(current.reviewLane || REVIEW_LANE.PARALLEL).toLowerCase();
  if (reviewLane === 'pm' || reviewLane === 'tech' || !reviewLane) {
    reviewLane = REVIEW_LANE.PARALLEL;
  }
  if (reviewLane === 'po') reviewLane = REVIEW_LANE.PO_FINAL;

  const fail = (statusCode, errorCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.errorCode = errorCode;
    throw err;
  };

  const packState = (lane, notify) => ({
    gate2: {
      ...current,
      reviewLane: lane,
      reviewLaneUpdatedAt: new Date().toISOString(),
      tracks,
      changeProposals: proposals,
    },
    reviewLane: lane,
    notify: notify || null,
  });

  const findProposal = (id) => proposals.find((row) => String(row.id) === String(id));

  if (act === 'track_submit' || act === 'pm_submit' || act === 'tech_submit') {
    if (reviewLane !== REVIEW_LANE.PARALLEL) {
      fail(409, 'GATE2_WRONG_LANE', 'Review song song đã kết thúc.');
    }
    let which = String(track || '').trim().toLowerCase();
    if (!which && act === 'pm_submit') which = 'pm';
    if (!which && act === 'tech_submit') which = 'tech';
    if (!tracks[which]) {
      fail(400, 'GATE2_TRACK_INVALID', 'Vai trò này không nằm trong danh sách duyệt.');
    }
    if (tracks[which].status === 'skipped') {
      fail(409, 'GATE2_TRACK_SKIPPED', 'Vai trò này được bỏ qua.');
    }
    if (tracks[which].status === 'waiting') {
      fail(409, 'GATE2_TRACK_WAITING', 'Chưa tới lượt vai trò này.');
    }
    if (tracks[which].status === 'submitted') {
      fail(409, 'GATE2_TRACK_ALREADY', 'Vai trò này đã xác nhận.');
    }
    tracks[which] = {
      status: 'submitted',
      submittedBy: actor,
      submittedAt: new Date().toISOString(),
      ...(noteTrim ? { note: noteTrim } : {}),
      ...(reviewDecisions && typeof reviewDecisions === 'object'
        ? { reviewDecisions }
        : {}),
    };
    if (reviewPlan?.mode === 'sequential') {
      const nextKey = (planRoleKeys || []).find((key) => tracks[key]?.status === 'waiting');
      if (nextKey) {
        tracks[nextKey] = { ...tracks[nextKey], status: 'pending' };
        return packState(REVIEW_LANE.PARALLEL, {
          permission: '',
          roleKey: nextKey,
          title: 'Gate 2 — đến lượt vai trò tiếp theo',
          content: 'Review tuần tự: đến lượt bạn duyệt toàn bộ kế hoạch.',
          kind: 'ai_hitl_gate2',
        });
      }
    }
    if (tracksReadyForConsolidation(tracks, planRoleKeys)) {
      const nextLane = reviewPlan?.synthesisRoleKey
        ? REVIEW_LANE.CONSOLIDATION
        : REVIEW_LANE.PO_FINAL;
      return packState(nextLane, {
        permission: reviewPlan ? '' : 'planning:pm_review',
        roleKey: reviewPlan?.synthesisRoleKey || reviewPlan?.finalRoleKey || '',
        title: 'Gate 2 — các vai trò đã review xong',
        content: reviewPlan?.synthesisRoleKey
          ? 'Chờ vai trò tổng hợp xác nhận kế hoạch.'
          : 'Chờ vai trò Tổng duyệt xác nhận cổng.',
        kind: 'ai_hitl_gate2_consolidation',
      });
    }
    return packState(REVIEW_LANE.PARALLEL, null);
  }

  if (act === 'propose_change') {
    if (reviewLane !== REVIEW_LANE.CONSOLIDATION && reviewLane !== REVIEW_LANE.RECONFIRM) {
      fail(409, 'GATE2_WRONG_LANE', 'Chỉ PM tổng hợp mới đề xuất chỉnh phần đã review.');
    }
    const body = proposal && typeof proposal === 'object' ? proposal : {};
    const owner = String(body.owner || trackForSection(body.sectionKey) || '')
      .trim()
      .toLowerCase();
    if (owner !== 'po' && owner !== 'tech') {
      fail(400, 'GATE2_PROPOSAL_OWNER', 'Đề xuất sửa chỉ áp dụng cho phần PO hoặc Tech Lead.');
    }
    const reason = clip(body.reason || noteTrim, 2000);
    if (!reason) fail(400, 'GATE2_PROPOSAL_REASON', 'Cần lý do khi đề xuất chỉnh sửa.');
    const fromValue = clip(body.fromValue, 500);
    const toValue = clip(body.toValue, 500);
    if (!toValue) fail(400, 'GATE2_PROPOSAL_VALUE', 'Cần giá trị đề xuất.');
    const supersedes = clip(body.supersedes || '', 80);
    if (supersedes) {
      const prev = findProposal(supersedes);
      if (!prev) fail(404, 'GATE2_PROPOSAL_NOT_FOUND', 'Không thấy đề xuất cần sửa lại.');
      if (prev.status !== 'rejected' || prev.resolution) {
        fail(409, 'GATE2_PROPOSAL_STATE', 'Chỉ đề xuất lại sau khi bị từ chối.');
      }
      prev.resolution = 'revised';
    }
    proposals.push({
      id: newProposalId(),
      owner,
      sectionKey: clip(body.sectionKey, 64),
      itemId: clip(body.itemId, 120),
      field: clip(body.field, 64),
      label: clip(body.label, 240),
      fromValue,
      toValue,
      reason,
      status: 'pending',
      proposedBy: actor,
      proposedAt: new Date().toISOString(),
      ...(supersedes ? { supersedes } : {}),
    });
    return packState(REVIEW_LANE.RECONFIRM, {
      permission: owner === 'tech' ? 'planning:tech_review' : 'planning:po_review',
      title: 'Gate 2 — PM đề xuất chỉnh, chờ xác nhận lại',
      content: reason,
      kind: owner === 'tech' ? 'ai_hitl_gate2_tech' : 'ai_hitl_gate2_po',
    });
  }

  if (act === 'decide_change') {
    if (reviewLane !== REVIEW_LANE.RECONFIRM) {
      fail(409, 'GATE2_WRONG_LANE', 'Không có đề xuất đang chờ xác nhận.');
    }
    const row = findProposal(proposalId);
    if (!row) fail(404, 'GATE2_PROPOSAL_NOT_FOUND', 'Không thấy đề xuất.');
    if (row.status !== 'pending') fail(409, 'GATE2_PROPOSAL_STATE', 'Đề xuất không còn chờ xác nhận.');
    if (row.proposedBy && row.proposedBy === actor) {
      fail(
        403,
        'GATE_SOD_DENIED',
        'Không tự duyệt đề xuất của mình. Chủ phần (Tech Lead hoặc PO) phải là tài khoản khác.'
      );
    }
    const verdict = String(decision || '').trim().toLowerCase();
    if (verdict !== 'accept' && verdict !== 'reject') {
      fail(400, 'GATE2_DECISION_INVALID', 'Quyết định là accept hoặc reject.');
    }
    if (verdict === 'reject' && !noteTrim) {
      fail(400, 'GATE2_REJECT_REASON_REQUIRED', 'Cần lý do khi từ chối đề xuất.');
    }
    row.status = verdict === 'accept' ? 'accepted' : 'rejected';
    row.decidedBy = actor;
    row.decidedAt = new Date().toISOString();
    if (verdict === 'reject') row.rejectReason = noteTrim;
    const nextLane = blockingProposals(proposals).length
      ? REVIEW_LANE.RECONFIRM
      : REVIEW_LANE.CONSOLIDATION;
    return packState(nextLane, {
      permission: 'planning:pm_review',
      title:
        verdict === 'accept'
          ? 'Gate 2 — đề xuất chỉnh đã được chấp nhận'
          : 'Gate 2 — đề xuất chỉnh bị từ chối',
      content:
        verdict === 'accept'
          ? 'PM có thể tổng hợp tiếp. Giá trị mới được chủ phần xác nhận.'
          : 'Giá trị mới không được áp dụng. PM giữ nguyên, đề xuất lại, hoặc escalate PO.',
      kind: 'ai_hitl_gate2_consolidation',
    });
  }

  if (act === 'keep_original') {
    const row = findProposal(proposalId);
    if (!row) fail(404, 'GATE2_PROPOSAL_NOT_FOUND', 'Không thấy đề xuất.');
    if (row.status !== 'rejected' || row.resolution) {
      fail(409, 'GATE2_PROPOSAL_STATE', 'Chỉ giữ nguyên sau khi đề xuất bị từ chối.');
    }
    row.resolution = 'reverted';
    row.resolvedBy = actor;
    row.resolvedAt = new Date().toISOString();
    if (noteTrim) row.resolutionNote = noteTrim;
    const nextLane = blockingProposals(proposals).length
      ? REVIEW_LANE.RECONFIRM
      : REVIEW_LANE.CONSOLIDATION;
    return packState(nextLane, null);
  }

  if (act === 'escalate') {
    const row = findProposal(proposalId);
    if (!row) fail(404, 'GATE2_PROPOSAL_NOT_FOUND', 'Không thấy đề xuất.');
    if (row.status !== 'rejected' || row.resolution) {
      fail(409, 'GATE2_PROPOSAL_STATE', 'Chỉ escalate sau khi chủ phần từ chối.');
    }
    if (!noteTrim) fail(400, 'GATE2_ESCALATION_REASON', 'Cần mô tả trade-off khi chuyển PO.');
    row.status = 'escalated';
    row.escalatedBy = actor;
    row.escalatedAt = new Date().toISOString();
    row.escalationNote = noteTrim;
    return packState(REVIEW_LANE.RECONFIRM, {
      permission: 'planning:po_review',
      title: 'Gate 2 — PM và Tech/PO chưa thống nhất, chờ PO quyết trade-off',
      content: noteTrim,
      kind: 'ai_hitl_gate2_escalation',
    });
  }

  if (act === 'resolve_escalation') {
    const row = findProposal(proposalId);
    if (!row || row.status !== 'escalated') {
      fail(409, 'GATE2_PROPOSAL_STATE', 'Không có escalation đang chờ PO.');
    }
    if (row.proposedBy && row.proposedBy === actor) {
      fail(403, 'GATE_SOD_DENIED', 'Người đề xuất không tự nhận rủi ro thay chủ phần.');
    }
    const verdict = String(decision || '').trim().toLowerCase();
    if (!noteTrim) fail(400, 'GATE2_ESCALATION_REASON', 'Cần ghi nhận quyết định trade-off.');
    if (verdict === 'accept_risk') {
      row.status = 'risk_accepted';
      row.riskAcceptance = {
        kind: 'po_risk_acceptance',
        notTechApproval: true,
        by: actor,
        at: new Date().toISOString(),
        note: noteTrim,
      };
    } else if (verdict === 'reject') {
      row.status = 'rejected';
      row.resolution = '';
      row.rejectReason = noteTrim;
      row.riskAcceptance = null;
    } else {
      fail(400, 'GATE2_DECISION_INVALID', 'PO chọn accept_risk hoặc reject.');
    }
    const nextLane = blockingProposals(proposals).length
      ? REVIEW_LANE.RECONFIRM
      : REVIEW_LANE.CONSOLIDATION;
    return packState(nextLane, {
      permission: 'planning:pm_review',
      title:
        verdict === 'accept_risk'
          ? 'Gate 2 — PO chấp nhận rủi ro (không phải Tech Lead đã duyệt)'
          : 'Gate 2 — PO không chấp nhận trade-off',
      content: noteTrim,
      kind: 'ai_hitl_gate2_consolidation',
    });
  }

  if (act === 'pm_confirm_plan') {
    if (reviewLane !== REVIEW_LANE.CONSOLIDATION && reviewLane !== REVIEW_LANE.RECONFIRM) {
      fail(409, 'GATE2_WRONG_LANE', 'Chưa tới bước PM xác nhận bản tổng hợp.');
    }
    const open = blockingProposals(proposals);
    if (open.length) {
      fail(
        409,
        'GATE2_CONSOLIDATION_BLOCKED',
        'Còn đề xuất chờ xác nhận, bị từ chối chưa xử lý, hoặc đang escalate.'
      );
    }
    current.consolidatedBy = actor;
    current.consolidatedAt = new Date().toISOString();
    if (noteTrim) current.consolidationNote = noteTrim;
    if (reviewPlan?.finalRoleKey) {
      return packState(REVIEW_LANE.PO_FINAL, {
        permission: '',
        roleKey: reviewPlan.finalRoleKey,
        title: 'Gate 2 — đã tổng hợp, chờ Tổng duyệt',
        content: noteTrim || 'Kế hoạch đã nhất quán. Vai trò Tổng duyệt xác nhận cổng.',
        kind: 'ai_hitl_gate2_po',
      });
    }
    return packState(REVIEW_LANE.PO_FINAL, {
      permission: 'planning:po_review',
      title: 'Gate 2 — PM đã tổng hợp, chờ PO xác nhận cuối',
      content: noteTrim || 'Kế hoạch đã nhất quán. PO xác nhận bản tổng hợp.',
      kind: 'ai_hitl_gate2_po',
    });
  }

  fail(400, 'GATE2_LANE_ACTION_INVALID', `Unknown Gate2 action: ${act}`);
}

module.exports = {
  emptyTracks,
  normalizeTracks,
  tracksReadyForConsolidation,
  isBlockingProposal,
  blockingProposals,
  applyGate2CollaborativeAction,
};

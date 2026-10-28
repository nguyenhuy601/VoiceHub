import Phase1Gate1ReviewPanel from './Phase1Gate1ReviewPanel';
import Phase2Gate2ReviewPanel from './Phase2Gate2ReviewPanel';
import WhatMonitorResultsPanel from './WhatMonitorResultsPanel';
import HowMonitorResultsPanel from './HowMonitorResultsPanel';
import { shouldShowWhatMonitorResults } from './whatMonitorResultsVisibility';
import { shouldShowHowMonitorResults } from './howMonitorResultsVisibility';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/** Read-only first AI baseline — same builders as Monitor (srsProposal / planning). */
function Gate1WaitingWithBaseline({ message, pack, t }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      {shouldShowWhatMonitorResults(pack) ? <WhatMonitorResultsPanel pack={pack} t={t} /> : null}
    </div>
  );
}

function Gate2WaitingWithBaseline({ message, pack, t }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      {shouldShowHowMonitorResults(pack) ? <HowMonitorResultsPanel pack={pack} t={t} /> : null}
    </div>
  );
}

/**
 * Host Gate1 / Gate2 panels by current HITL state.
 * Review tab = decide (Gate1 BA/PO, Gate2 PM/Tech/PO). Waiting lanes still show
 * the first AI baseline table (same SoT as Monitor) so tabs stay in sync.
 */
export default function AiHitlReviewPanel({
  reviewMode = 'idle',
  reviewView = 'waitingBa',
  t,
  // gate1
  packStatus = '',
  canSubmit = false,
  canApprove = false,
  gate1Summary = null,
  gate1Busy = false,
  gate1Decisions = null,
  setGate1Decision = null,
  clearGate1Decision = null,
  onGate1Submit,
  onGate1Approve,
  onGate1Reject,
  // gate2 — decide only (no Chạy AI Planning CTA)
  gate2ReviewView = 'howPending',
  howStatus = '',
  gate2HowStatus = '',
  gate2ReviewLane = 'pm',
  gate2RejectReason = '',
  gate2Busy = false,
  canPromote = false,
  pack = null,
  gate2Decisions = null,
  setGate2Decision = null,
  parallelTracks = [],
  gate2Proposals = [],
  onGate2TrackSubmit,
  onGate2RefreshSchedule = null,
  onGate2ProposeChange,
  onGate2DecideChange,
  onGate2KeepOriginal,
  onGate2Escalate,
  onGate2ResolveEscalation,
  onGate2PmConfirmPlan,
  onGate2PoApprove,
  onGate2PoReject,
}) {
  if (reviewMode === 'gate1') {
    if (reviewView === 'waitingBa') {
      return (
        <Gate1WaitingWithBaseline
          pack={pack}
          t={t}
          message={labelOf(
            t,
            'requirements.phase1Gate1WaitingBa',
            'Chờ BA xác nhận duyệt bản AI trên tab Duyệt. (PO: đợi BA gửi — không chỉnh quyết định BA.)'
          )}
        />
      );
    }
    if (reviewView === 'waitingPo') {
      return (
        <Gate1WaitingWithBaseline
          pack={pack}
          t={t}
          message={labelOf(
            t,
            'requirements.phase1Gate1WaitingPo',
            'Đã gửi duyệt. Chờ PO duyệt để sang Phase 2.'
          )}
        />
      );
    }
    if (reviewView === 'done') {
      return (
        <Gate1WaitingWithBaseline
          pack={pack}
          t={t}
          message={labelOf(
            t,
            'requirements.phase1Gate1LaneDone',
            'Gate 1 đã duyệt xong. Chuyển Monitor / Gate 2 khi sẵn sàng.'
          )}
        />
      );
    }

    const showPo = reviewView === 'showPoPanel';

    return (
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {labelOf(
            t,
            showPo ? 'requirements.phase1Gate1PoTitle' : 'requirements.phase1Gate1ModalTitle',
            showPo ? 'Gate 1 — PO xác nhận cuối cùng' : 'Gate 1 — BA Analysis Review'
          )}
        </h2>
        <Phase1Gate1ReviewPanel
          active
          packStatus={packStatus}
          canSubmit={canSubmit}
          canApprove={canApprove}
          reviewLaneView={reviewView}
          summary={gate1Summary}
          busy={gate1Busy}
          decisions={gate1Decisions}
          setDecision={setGate1Decision}
          clearDecision={clearGate1Decision}
          t={t}
          onSubmit={onGate1Submit}
          onApprove={onGate1Approve}
          onReject={onGate1Reject}
          showActions
        />
      </div>
    );
  }

  if (reviewMode === 'gate2') {
    let gate2WaitingMessage = null;
    if (
      gate2ReviewView === 'waitingParallel' ||
      gate2ReviewView === 'waitingPm' ||
      gate2ReviewView === 'waitingTech'
    ) {
      gate2WaitingMessage = labelOf(
        t,
        'requirements.gate2WaitingParallel',
        'Đang chờ các vai trò đã chọn review toàn bộ kế hoạch.'
      );
    } else if (gate2ReviewView === 'waitingConsolidation') {
      gate2WaitingMessage = labelOf(
        t,
        'requirements.gate2WaitingConsolidation',
        'Đã đủ review song song. Chờ PM tổng hợp xung đột rồi gửi PO xác nhận cuối.'
      );
    } else if (gate2ReviewView === 'waitingPo') {
      gate2WaitingMessage = labelOf(
        t,
        'requirements.gate2WaitingPo',
        'PM đã gửi bản tổng hợp. Chờ PO xác nhận cuối Gate 2.'
      );
    }

    if (gate2WaitingMessage) {
      return (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {labelOf(t, 'requirements.aiHitlGate2Title', 'Gate 2 — Kế hoạch (HOW)')}
          </h2>
          <Gate2WaitingWithBaseline pack={pack} t={t} message={gate2WaitingMessage} />
        </div>
      );
    }

    return (
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {labelOf(t, 'requirements.aiHitlGate2Title', 'Gate 2 — Kế hoạch (HOW)')}
        </h2>
        <Phase2Gate2ReviewPanel
          reviewView={gate2ReviewView}
          howStatus={gate2HowStatus || howStatus}
          reviewLane={gate2ReviewLane}
          rejectReason={gate2RejectReason}
          busy={gate2Busy}
          canPromote={canPromote}
          pack={pack}
          decisions={gate2Decisions}
          setDecision={setGate2Decision}
          t={t}
          parallelTracks={parallelTracks}
          proposals={gate2Proposals}
          onTrackSubmit={onGate2TrackSubmit}
          onRefreshSchedule={onGate2RefreshSchedule}
          onProposeChange={onGate2ProposeChange}
          onDecideChange={onGate2DecideChange}
          onKeepOriginal={onGate2KeepOriginal}
          onEscalate={onGate2Escalate}
          onResolveEscalation={onGate2ResolveEscalation}
          onPmConfirmPlan={onGate2PmConfirmPlan}
          onPoApprove={onGate2PoApprove}
          onPoReject={onGate2PoReject}
        />
      </div>
    );
  }

  // Idle but AI baseline already on pack — keep Duyệt synced with Monitor (first AI output).
  if (shouldShowWhatMonitorResults(pack)) {
    return (
      <Gate1WaitingWithBaseline
        pack={pack}
        t={t}
        message={labelOf(
          t,
          'requirements.aiHitlReviewIdleWithBaseline',
          'Chưa tới lượt duyệt của bạn. Bản AI WHAT (baseline) bên dưới — cùng nguồn với Monitor.'
        )}
      />
    );
  }
  if (shouldShowHowMonitorResults(pack)) {
    return (
      <Gate2WaitingWithBaseline
        pack={pack}
        t={t}
        message={labelOf(
          t,
          'requirements.aiHitlReviewIdleHowBaseline',
          'Chưa tới lượt duyệt của bạn. Bản AI HOW (baseline) bên dưới — cùng nguồn với Monitor.'
        )}
      />
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {labelOf(
        t,
        'requirements.aiHitlReviewIdle',
        'Chưa có cổng duyệt. Theo dõi tab Monitor — khi AI dừng chờ người, panel duyệt sẽ hiện ở đây.'
      )}
    </p>
  );
}

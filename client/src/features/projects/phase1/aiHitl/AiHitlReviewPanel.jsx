import Phase1Gate1ReviewPanel from './Phase1Gate1ReviewPanel';
import Phase2Gate2ReviewPanel from './Phase2Gate2ReviewPanel';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/**
 * Host Gate1 / Gate2 panels by current HITL state.
 * Review tab = decide only (Gate1 BA/PO, Gate2 PM/PO). HOW run lives on Monitor.
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
  onGate2PmSubmit,
  onGate2PoApprove,
  onGate2PoReject,
}) {
  if (reviewMode === 'gate1') {
    if (reviewView === 'waitingBa') {
      return (
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.phase1Gate1WaitingBa',
            'Chờ BA xác nhận duyệt bản AI trên tab Duyệt. (PO: đợi BA gửi — không chỉnh quyết định BA.)'
          )}
        </p>
      );
    }
    if (reviewView === 'waitingPo') {
      return (
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.phase1Gate1WaitingPo',
            'Đã gửi duyệt. Chờ PO duyệt để sang Phase 2.'
          )}
        </p>
      );
    }
    if (reviewView === 'done') {
      return (
        <p className="text-sm text-muted-foreground">
          {labelOf(
            t,
            'requirements.phase1Gate1LaneDone',
            'Gate 1 đã duyệt xong. Chuyển Monitor / Gate 2 khi sẵn sàng.'
          )}
        </p>
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
          onPmSubmit={onGate2PmSubmit}
          onPoApprove={onGate2PoApprove}
          onPoReject={onGate2PoReject}
        />
      </div>
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

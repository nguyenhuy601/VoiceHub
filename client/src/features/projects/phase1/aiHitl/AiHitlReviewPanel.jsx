import Phase1Gate1ReviewPanel from './Phase1Gate1ReviewPanel';
import AiPlanningRunPanel from '../AiPlanningRunPanel';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/**
 * Host Gate1 / Gate2 panels by current HITL state.
 * Data Gate business panel removed (RULE-R01) — legacy mode ignored.
 */
export default function AiHitlReviewPanel({
  reviewMode = 'idle',
  t,
  // gate1
  packStatus = '',
  canSubmit = false,
  canApprove = false,
  gate1Summary = null,
  gate1Busy = false,
  onGate1Submit,
  onGate1Approve,
  // gate2
  organizationId = '',
  packId = '',
  canRunHow = false,
  canPromote = false,
  onPromoted,
}) {
  if (reviewMode === 'gate1') {
    return (
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {labelOf(t, 'requirements.phase1Gate1ModalTitle', 'Gate 1 — BA Analysis Review')}
        </h2>
        <Phase1Gate1ReviewPanel
          active
          packStatus={packStatus}
          canSubmit={canSubmit}
          canApprove={canApprove}
          summary={gate1Summary}
          busy={gate1Busy}
          t={t}
          onSubmit={onGate1Submit}
          onApprove={onGate1Approve}
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
        <AiPlanningRunPanel
          organizationId={organizationId}
          packId={packId}
          canRun={canRunHow}
          canPromote={canPromote}
          onPromoted={onPromoted}
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

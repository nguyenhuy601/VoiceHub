import { Modal } from '../../components/Shared';

/**
 * Chi tiết một finding / gap từ job AI Analysis.
 */
export default function AiAnalysisFindingDrawer({
  open = false,
  finding = null,
  t,
  decision = null,
  onClose,
  onAccept,
  onReject,
  onEditRequirement,
}) {
  if (!finding) return null;
  const tr = typeof t === 'function' ? t : (key) => key;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={finding.id || tr('requirements.aiAnalysisDrawerFinding')}
      size="lg"
    >
      <div className="space-y-3 text-sm text-foreground">
        <p>
          <span className="text-muted-foreground">{tr('requirements.aiAnalysisDrawerRequirementId')}: </span>
          {finding.id}
        </p>
        <p>
          <span className="text-muted-foreground">{tr('requirements.aiAnalysisDrawerAssessment')}: </span>
          {finding.assessmentLabel || '—'}
        </p>
        <p>
          <span className="text-muted-foreground">{tr('requirements.aiAnalysisDrawerFinding')}: </span>
          {finding.finding || '—'}
        </p>
        <p>
          <span className="text-muted-foreground">{tr('requirements.aiAnalysisDrawerImpact')}: </span>
          {finding.impact || '—'}
        </p>
        <p>
          <span className="text-muted-foreground">{tr('requirements.aiAnalysisDrawerRecommendation')}: </span>
          {finding.recommendation || '—'}
        </p>
        <p>
          <span className="text-muted-foreground">{tr('requirements.aiAnalysisDrawerSource')}: </span>
          {finding.source || '—'}
        </p>
        {decision ? (
          <p className="text-muted-foreground">{decision}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
            onClick={() => onAccept?.(finding)}
          >
            {tr('requirements.aiAnalysisAcceptFinding')}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
            onClick={() => onReject?.(finding)}
          >
            {tr('requirements.aiAnalysisRejectFinding')}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
            onClick={() => onEditRequirement?.(finding)}
          >
            {tr('requirements.aiAnalysisEditRequirement')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

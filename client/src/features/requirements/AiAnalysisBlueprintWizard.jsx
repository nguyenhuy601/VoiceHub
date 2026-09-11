import { Fragment, useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Loader2,
  Lock,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { requirementAPI } from '../../services/api/requirementAPI';
import { useAiAnalysisBlueprintWizard } from './useAiAnalysisBlueprintWizard';
import {
  AI_ANALYSIS_JOBS,
  AI_ANALYSIS_UI_STATUS,
  areAllAnalysisJobsConfirmed,
  canConfirmJob,
  countConfirmedJobs,
  jobsByPhase,
  lockedReasonKey,
  previousJobId,
  resolveUiJobStatus,
} from './aiAnalysisWizardConstants';
import { buildJobSummaryChips } from './aiAnalysisResultModel';
import AiAnalysisJobPreview from './AiAnalysisJobPreview';
import AiAnalysisFindingDrawer from './AiAnalysisFindingDrawer';

function formatWhen(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

/** Persistable run duration from summary.jobs[id].durationMs */
function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  const totalSec = Math.round(n / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function StatusBadge({ status, t }) {
  const map = {
    [AI_ANALYSIS_UI_STATUS.READY]: {
      icon: Play,
      className: 'bg-sky-500/10 text-sky-800 dark:text-sky-200',
      label: t('requirements.aiAnalysisStatus.ready'),
    },
    [AI_ANALYSIS_UI_STATUS.RUNNING]: {
      icon: Loader2,
      className: 'bg-amber-500/10 text-amber-900 dark:text-amber-200',
      label: t('requirements.aiAnalysisStatus.running'),
      spin: true,
    },
    [AI_ANALYSIS_UI_STATUS.NEEDS_REVIEW]: {
      icon: Eye,
      className: 'bg-violet-500/10 text-violet-800 dark:text-violet-200',
      label: t('requirements.aiAnalysisStatus.needs_review'),
    },
    [AI_ANALYSIS_UI_STATUS.CONFIRMED]: {
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
      label: t('requirements.aiAnalysisStatus.confirmed'),
    },
    [AI_ANALYSIS_UI_STATUS.PENDING]: {
      icon: Clock3,
      className: 'bg-muted text-muted-foreground',
      label: t('requirements.aiAnalysisStatus.pending'),
    },
    [AI_ANALYSIS_UI_STATUS.LOCKED]: {
      icon: Lock,
      className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
      label: t('requirements.aiAnalysisStatus.locked'),
    },
    [AI_ANALYSIS_UI_STATUS.FAILED]: {
      icon: AlertCircle,
      className: 'bg-destructive/10 text-destructive',
      label: t('requirements.aiAnalysisStatus.failed'),
    },
  };
  const cfg = map[status] || map[AI_ANALYSIS_UI_STATUS.PENDING];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.spin ? 'animate-spin' : ''}`} aria-hidden />
      {cfg.label}
    </span>
  );
}

function ActionCell({
  status,
  busy,
  t,
  onRun,
  onView,
  onConfirm,
  onRetry,
  lockReason,
  canConfirm = false,
}) {
  if (status === AI_ANALYSIS_UI_STATUS.READY) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onRun}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Play className="h-3.5 w-3.5" />
        {t('requirements.aiAnalysisActionRun')}
      </button>
    );
  }
  if (status === AI_ANALYSIS_UI_STATUS.RUNNING) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('requirements.aiAnalysisStatus.running')}
      </span>
    );
  }
  if (status === AI_ANALYSIS_UI_STATUS.NEEDS_REVIEW) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onView}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
        >
          {t('requirements.aiAnalysisActionViewResult')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('requirements.aiAnalysisActionRunAgain')}
        </button>
        <button
          type="button"
          disabled={busy || !canConfirm}
          onClick={onConfirm}
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {t('requirements.aiAnalysisActionConfirm')}
        </button>
      </div>
    );
  }
  if (status === AI_ANALYSIS_UI_STATUS.CONFIRMED) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onView}
        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
      >
        {t('requirements.aiAnalysisActionView')}
      </button>
    );
  }
  if (status === AI_ANALYSIS_UI_STATUS.FAILED) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('requirements.aiAnalysisActionRetry')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onView}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
        >
          {t('requirements.aiAnalysisActionViewError')}
        </button>
      </div>
    );
  }
  if (status === AI_ANALYSIS_UI_STATUS.LOCKED) {
    return (
      <p className="max-w-[14rem] text-xs text-muted-foreground" title={lockReason || undefined}>
        <Lock className="mr-1 inline h-3.5 w-3.5" />
        {lockReason || t('requirements.aiAnalysisStatus.locked')}
      </p>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

/**
 * W8 — Enterprise AI Analysis: tabbed Pipeline | Job Result.
 */
export default function AiAnalysisBlueprintWizard({
  organizationId,
  packId,
  onCreateProject,
  onContinue,
  controller = null,
  hideHeader = false,
}) {
  const { t } = useAppStrings();
  const internal = useAiAnalysisBlueprintWizard({
    organizationId,
    packId,
    enabled: !controller && Boolean(organizationId && packId),
  });
  const {
    summary,
    wizardDto,
    activeJob,
    setActiveJob,
    busy,
    error,
    runJob,
    confirmJob,
    refreshWizard,
  } = controller || internal;

  const [toast, setToast] = useState(null);
  const [finding, setFinding] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [exporting, setExporting] = useState(false);
  const [panelTab, setPanelTab] = useState('pipeline');

  const confirmedCount = countConfirmedJobs(summary?.jobs);
  const allConfirmed = areAllAnalysisJobsConfirmed(summary?.jobs);
  const canContinue = allConfirmed && typeof onContinue === 'function';

  const activeMeta = AI_ANALYSIS_JOBS.find((j) => j.id === activeJob) || AI_ANALYSIS_JOBS[0];
  const activeUiStatus = resolveUiJobStatus(activeJob, summary?.jobs, { busy, activeJob });
  const phaseGroups = useMemo(() => jobsByPhase(), []);
  const engineBadgeKey =
    activeMeta.engine === 'engine'
      ? 'requirements.aiAnalysisBadgeEngine'
      : 'requirements.aiAnalysisBadgeLlm';
  const chips = useMemo(
    () =>
      wizardDto?.job === activeJob ? buildJobSummaryChips(activeJob, wizardDto, t) : [],
    [activeJob, wizardDto, t]
  );

  const analysisId = packId ? String(packId) : '—';
  const modelLabel = wizardDto?.model || summary?.model || '—';
  const startedAt = formatWhen(wizardDto?.generatedAt || summary?.generatedAt);

  const selectJob = useCallback(
    async (jobId) => {
      setActiveJob(jobId);
      setFinding(null);
      try {
        await refreshWizard?.(jobId);
      } catch {
        /* refreshWizard may throw; surface via controller error */
      }
    },
    [setActiveJob, refreshWizard]
  );

  const viewJobResult = useCallback(
    async (jobId) => {
      setPanelTab('result');
      await selectJob(jobId);
    },
    [selectJob]
  );

  const handleRun = useCallback(
    async (jobId, options = {}) => {
      await runJob(jobId, options);
    },
    [runJob]
  );

  const handleConfirm = useCallback(
    async (jobId = null) => {
      const id = typeof jobId === 'string' && jobId ? jobId : activeJob;
      await confirmJob(null, id);
      setToast(t('requirements.aiAnalysisConfirmToast'));
      setFinding(null);
      setDecisions({});
    },
    [confirmJob, activeJob, t]
  );

  const handleDiscard = useCallback(async () => {
    setDecisions({});
    setFinding(null);
    setToast(null);
    await refreshWizard?.(activeJob);
  }, [refreshWizard, activeJob]);

  const handleExport = useCallback(async () => {
    if (!organizationId || !packId) return;
    setExporting(true);
    try {
      const res = await requirementAPI.exportAiAnalysisSheet11(organizationId, packId);
      const blob = res?.data instanceof Blob ? res.data : new Blob([res?.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI_Analysis_${String(packId).slice(-8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast(err?.response?.data?.message || err.message || t('requirements.aiAnalysisExportFail'));
    } finally {
      setExporting(false);
    }
  }, [organizationId, packId, t]);

  const lockReasonFor = (jobId) => {
    const key = lockedReasonKey(jobId, summary?.jobs);
    if (!key) return '';
    const prev = previousJobId(jobId);
    const prevMeta = AI_ANALYSIS_JOBS.find((j) => j.id === prev);
    return t(key, { job: prevMeta ? t(prevMeta.labelKey) : prev });
  };

  return (
    <section className="flex flex-col gap-4">
      {!hideHeader ? (
        <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {t('requirements.aiAnalysisPageTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('requirements.aiAnalysisPageSubtitle')}</p>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline font-medium text-foreground/70">
                  {t('requirements.aiAnalysisMetaId')}:{' '}
                </dt>
                <dd className="inline font-mono">{analysisId}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground/70">
                  {t('requirements.aiAnalysisMetaModel')}:{' '}
                </dt>
                <dd className="inline">{modelLabel}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground/70">
                  {t('requirements.aiAnalysisMetaStarted')}:{' '}
                </dt>
                <dd className="inline">{startedAt}</dd>
              </div>
            </dl>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <p className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium tabular-nums text-foreground">
              {t('aiCreateWizard.previewAnalysisProgress', {
                confirmed: confirmedCount,
                total: AI_ANALYSIS_JOBS.length,
              })}
            </p>
            {typeof onContinue === 'function' ? (
              <button
                type="button"
                disabled={!canContinue || busy}
                onClick={onContinue}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {t('requirements.aiAnalysisContinue')}
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      {toast ? (
        <p
          className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
          role="status"
        >
          {toast}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error?.response?.data?.message || error.message || String(error)}
        </p>
      ) : null}

      {/* Pipeline | Job Result — single card, two tabs */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div
          className="flex shrink-0 gap-0 overflow-x-auto border-b border-border px-3"
          role="tablist"
          aria-label={t('requirements.aiAnalysisPageTitle')}
        >
          <button
            type="button"
            role="tab"
            id="ai-analysis-tab-pipeline"
            aria-selected={panelTab === 'pipeline'}
            aria-controls="ai-analysis-panel-pipeline"
            onClick={() => setPanelTab('pipeline')}
            className={`-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors ${
              panelTab === 'pipeline'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('requirements.aiAnalysisPipelineTitle')}
          </button>
          <button
            type="button"
            role="tab"
            id="ai-analysis-tab-result"
            aria-selected={panelTab === 'result'}
            aria-controls="ai-analysis-panel-result"
            onClick={() => setPanelTab('result')}
            className={`-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors ${
              panelTab === 'result'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('requirements.aiAnalysisJobResultTitle')}
          </button>
        </div>

        {panelTab === 'pipeline' ? (
          <div
            role="tabpanel"
            id="ai-analysis-panel-pipeline"
            aria-labelledby="ai-analysis-tab-pipeline"
            className="max-h-[min(28rem,55vh)] overflow-auto"
          >
            <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-2.5 font-semibold">#</th>
                  <th className="min-w-[10rem] px-3 py-2.5 font-semibold">
                    {t('requirements.aiAnalysisJobColName')}
                  </th>
                  <th className="min-w-[14rem] px-3 py-2.5 font-semibold">
                    {t('requirements.aiAnalysisJobColDescription')}
                  </th>
                  <th className="w-36 px-3 py-2.5 font-semibold">
                    {t('requirements.aiAnalysisJobColStatus')}
                  </th>
                  <th className="w-40 px-3 py-2.5 font-semibold">
                    {t('requirements.aiAnalysisJobColLastRun')}
                  </th>
                  <th className="w-24 px-3 py-2.5 font-semibold">
                    {t('requirements.aiAnalysisJobColDuration')}
                  </th>
                  <th className="min-w-[11rem] px-3 py-2.5 font-semibold">
                    {t('requirements.aiAnalysisJobColAction')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {phaseGroups.map((phase) => {
                  const phaseJobIds = phase.jobs.map((j) => j.id);
                  const phaseConfirmed = phaseJobIds.filter(
                    (id) => String(summary?.jobs?.[id]?.status || '') === 'confirmed'
                  ).length;
                  return (
                    <Fragment key={phase.id}>
                      <tr className="border-t border-border bg-muted/50">
                        <td
                          colSpan={7}
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {t(phase.labelKey)} · {phaseConfirmed}/{phase.jobs.length}
                        </td>
                      </tr>
                      {phase.jobs.map((j) => {
                        const idx = AI_ANALYSIS_JOBS.findIndex((x) => x.id === j.id);
                        const ui = resolveUiJobStatus(j.id, summary?.jobs, { busy, activeJob });
                        const active = j.id === activeJob;
                        const jobMeta = summary?.jobs?.[j.id];
                        const lastRun = formatWhen(jobMeta?.generatedAt);
                        const duration = formatDuration(jobMeta?.durationMs);
                        const badgeKey =
                          j.engine === 'engine'
                            ? 'requirements.aiAnalysisBadgeEngine'
                            : 'requirements.aiAnalysisBadgeLlm';
                        return (
                          <tr
                            key={j.id}
                            className={`border-t border-border ${
                              active ? 'bg-primary/[0.04]' : 'hover:bg-muted/20'
                            }`}
                          >
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="text-left font-medium text-foreground hover:underline"
                                onClick={() => viewJobResult(j.id)}
                              >
                                {t(j.labelKey)}
                              </button>
                              <span
                                className={`ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  j.engine === 'engine'
                                    ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
                                    : 'bg-violet-500/10 text-violet-800 dark:text-violet-200'
                                }`}
                              >
                                {t(badgeKey)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {t(j.descriptionKey)}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={ui} t={t} />
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{lastRun}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{duration}</td>
                            <td className="px-3 py-2">
                              <ActionCell
                                status={ui}
                                busy={busy}
                                t={t}
                                lockReason={lockReasonFor(j.id)}
                                canConfirm={canConfirmJob(summary?.jobs, j.id)}
                                onRun={() => handleRun(j.id)}
                                onView={() => viewJobResult(j.id)}
                                onConfirm={() => handleConfirm(j.id)}
                                onRetry={() => handleRun(j.id, { force: true })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="ai-analysis-panel-result"
            aria-labelledby="ai-analysis-tab-result"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 space-y-1">
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <span>
                    {t('requirements.aiAnalysisJobResultTitle')} — {t(activeMeta.labelKey)}
                  </span>
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      activeMeta.engine === 'engine'
                        ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
                        : 'bg-violet-500/10 text-violet-800 dark:text-violet-200'
                    }`}
                  >
                    {t(engineBadgeKey)}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <StatusBadge status={activeUiStatus} t={t} />
                  <span>
                    {t('requirements.aiAnalysisMetaStarted')}: {formatWhen(wizardDto?.generatedAt)}
                  </span>
                  <span>
                    {t('requirements.aiAnalysisMetaModel')}: {wizardDto?.model || '—'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={exporting || busy || !packId}
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-40"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t('requirements.aiAnalysisExport')}
              </button>
            </div>

            {chips.length ? (
              <div className="flex flex-wrap gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
                {chips.map((c) => (
                  <span
                    key={c.key}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            ) : null}

            {wizardDto?.error ? (
              <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {String(wizardDto.error?.message || wizardDto.error)}
              </div>
            ) : null}

            <div className="max-h-[min(28rem,55vh)] overflow-y-auto px-4 py-4">
              {wizardDto?.job === activeJob ? (
                <AiAnalysisJobPreview
                  job={activeJob}
                  dto={wizardDto}
                  t={t}
                  selectedFindingId={finding?.id}
                  onFindingClick={(row) => setFinding(row)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('requirements.aiAnalysisPreviewEmpty')}
                </p>
              )}
            </div>

            <footer className="flex flex-col gap-3 border-t border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t('requirements.aiAnalysisReviewDisclaimer')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDiscard}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-40"
                >
                  {t('requirements.aiAnalysisDiscardChanges')}
                </button>
                {activeUiStatus === AI_ANALYSIS_UI_STATUS.NEEDS_REVIEW ||
                activeUiStatus === AI_ANALYSIS_UI_STATUS.FAILED ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRun(activeJob, { force: true })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-40"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('requirements.aiAnalysisActionRunAgain')}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || !canConfirmJob(summary?.jobs, activeJob)}
                  onClick={() => handleConfirm()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {t('requirements.aiAnalysisConfirmResult')}
                </button>
                {allConfirmed && typeof onCreateProject === 'function' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onCreateProject({ applyAssignees: true, importWorkItems: true })
                    }
                    className="rounded-md border border-emerald-600/40 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300"
                  >
                    {t('requirements.aiAnalysisGenerateProject')}
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        )}
      </div>

      <AiAnalysisFindingDrawer
        open={Boolean(finding)}
        finding={finding}
        t={t}
        decision={finding ? decisions[finding.id] : null}
        onClose={() => setFinding(null)}
        onAccept={(f) => {
          setDecisions((prev) => ({ ...prev, [f.id]: 'accepted' }));
          setToast(t('requirements.aiAnalysisFindingAccepted'));
        }}
        onReject={(f) => {
          setDecisions((prev) => ({ ...prev, [f.id]: 'rejected' }));
          setToast(t('requirements.aiAnalysisFindingRejected'));
        }}
        onEditRequirement={() => {
          setToast(t('requirements.aiAnalysisEditRequirementHint'));
        }}
      />
    </section>
  );
}

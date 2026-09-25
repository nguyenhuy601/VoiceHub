import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileSearch, Loader2, ListChecks, Send } from 'lucide-react';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { buildPhase1ModulePath } from './nav/phase1NavConfig';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Understanding (hướng B Wave 1): prepare intake (prefill + corpus + tools), no LLM WHAT.
 * CTA → edit artifacts / Gate 1 reviews.
 */
export default function RequirementUnderstandingPanel({
  projectId,
  organizationId,
  packId,
  analysisMode = 'manual',
  canRun = false,
  onPrepared,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [packStatus, setPackStatus] = useState('');
  const [preparedMeta, setPreparedMeta] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isAi = String(analysisMode || '').toLowerCase() === 'ai';

  const refresh = useCallback(async () => {
    if (!organizationId || !packId) return null;
    const packRes = await requirementAPI.getPack(organizationId, packId, { view: 'full' });
    const pack = unwrap(packRes);
    setPackStatus(String(pack?.status || ''));
    const corpus = pack?.aiAnalysis?.intakeCorpus;
    if (corpus && (corpus.totalChars != null || Array.isArray(corpus.excerpts))) {
      setPreparedMeta({
        intakeCorpusChars: Number(corpus.totalChars) || 0,
        excerptsCount: Array.isArray(corpus.excerpts) ? corpus.excerpts.length : 0,
        skippedCount: Array.isArray(corpus.skipped) ? corpus.skipped.length : 0,
        toolsRan: Boolean(pack?.aiAnalysis?.analyses?.requirementTools),
        status: String(pack?.status || ''),
      });
    }
    return pack;
  }, [organizationId, packId]);

  useEffect(() => {
    if (!isAi || !organizationId || !packId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await refresh();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAi, organizationId, packId, refresh]);

  const prepare = async () => {
    if (!canRun || busy || !organizationId || !packId) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
        phase: 'what',
        mode: 'prepare_only',
      });
      const data = unwrap(res);
      setPreparedMeta({
        intakeCorpusChars: Number(data?.intakeCorpusChars) || 0,
        excerptsCount: Number(data?.excerptsCount) || 0,
        skippedCount: Number(data?.skippedCount) || 0,
        toolsRan: Boolean(data?.toolsRan),
        status: String(data?.status || packStatus || ''),
      });
      if (data?.status) setPackStatus(String(data.status));
      toast.success(
        t('requirements.understandingPrepareOk') || 'Đã chuẩn bị Understanding (prefill + corpus).'
      );
      onPrepared?.(data);
      await refresh();
    } catch (error) {
      const msg = resolveApiErrorMessage(error, {
        t,
        fallback:
          t('requirements.understandingPrepareFail') || 'Không chuẩn bị được Understanding.',
      });
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!isAi || !packId) return null;

  const gate1Done = packStatus === 'approved' || packStatus === 'project_linked';

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('requirements.understandingTitle') || 'Requirement Understanding'}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('requirements.understandingHint') ||
          'Chuẩn bị intake (prefill workbook + corpus + tools). Chỉnh FR/artifacts rồi Submit/Approve Gate 1 — không chạy AI WHAT trước duyệt.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {t('requirements.understandingPackStatus') || 'Pack'}: {packStatus || '—'}
        </span>
        {preparedMeta ? (
          <>
            <span>·</span>
            <span>
              {t('requirements.understandingCorpusChars', {
                count: preparedMeta.intakeCorpusChars,
              }) || `${preparedMeta.intakeCorpusChars} ký tự corpus`}
            </span>
            <span>·</span>
            <span>
              {t('requirements.understandingExcerpts', {
                count: preparedMeta.excerptsCount,
              }) || `${preparedMeta.excerptsCount} excerpts`}
            </span>
            {preparedMeta.toolsRan ? (
              <>
                <span>·</span>
                <span>{t('requirements.understandingToolsOk') || 'Tools: OK'}</span>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      {errorMsg ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{errorMsg}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!gate1Done ? (
          <button
            type="button"
            disabled={!canRun || busy}
            onClick={prepare}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSearch className="h-4 w-4" />
            )}
            {preparedMeta
              ? t('requirements.understandingPrepareAgain') || 'Chuẩn bị lại'
              : t('requirements.understandingPrepare') || 'Chuẩn bị Understanding'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!projectId}
          onClick={() =>
            navigate(buildPhase1ModulePath(projectId, 'analysis-fr', { organizationId }))
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
        >
          <ListChecks className="h-4 w-4" />
          {t('requirements.understandingEditArtifacts') || 'Sửa artifacts (FR)'}
        </button>
        {!gate1Done ? (
          <button
            type="button"
            disabled={!projectId}
            onClick={() =>
              navigate(buildPhase1ModulePath(projectId, 'analysis-reviews', { organizationId }))
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {t('requirements.understandingGate1Cta') || 'Gửi duyệt Gate 1'}
          </button>
        ) : (
          <p className="self-center text-xs text-emerald-700 dark:text-emerald-300">
            {t('requirements.understandingGate1Done') ||
              'Gate 1 đã duyệt — có thể chạy AI Planning (HOW).'}
          </p>
        )}
      </div>
    </section>
  );
}

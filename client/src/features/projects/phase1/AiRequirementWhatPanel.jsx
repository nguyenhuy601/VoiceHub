import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { requirementAPI } from '../../../services/api/requirementAPI';
import { useAppStrings } from '../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * AI Requirement (WHAT) panel — legacy rollback when HITL_AUTO_WHAT=1.
 * Wave1 B default: Overview mounts RequirementUnderstandingPanel instead.
 * Set VITE_SHOW_AI_WHAT_PANEL=1 to remount this panel for rollback UX.
 */
export default function AiRequirementWhatPanel({
  organizationId,
  packId,
  analysisMode = 'manual',
  canRun = false,
  onReady,
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [phaseStatus, setPhaseStatus] = useState('');
  const [seeded, setSeeded] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [docCount, setDocCount] = useState(null);
  const startWhatConsumed = useRef(false);

  const legacyWhatPanel =
    String(import.meta.env.VITE_SHOW_AI_WHAT_PANEL || '').trim() === '1';
  const isAi = String(analysisMode || '').toLowerCase() === 'ai';

  const refresh = useCallback(async () => {
    if (!organizationId || !packId) return null;
    const packRes = await requirementAPI.getPack(organizationId, packId, { view: 'full' });
    const pack = unwrap(packRes);
    const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what || {};
    setPhaseStatus(String(phaseWhat.status || ''));
    setSeeded(phaseWhat.seeded != null ? Number(phaseWhat.seeded) : null);
    setDocCount(
      Array.isArray(pack?.aiAnalysis?.inputDocuments)
        ? pack.aiAnalysis.inputDocuments.length
        : phaseWhat.inputDocumentCount != null
          ? Number(phaseWhat.inputDocumentCount)
          : null
    );
    if (phaseWhat.error?.message) {
      setErrorMsg(String(phaseWhat.error.message));
    } else {
      setErrorMsg('');
    }
    if (String(phaseWhat.status || '') === 'ready') {
      onReady?.(pack);
    }
    return pack;
  }, [organizationId, packId, onReady]);

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

  useEffect(() => {
    if (phaseStatus !== 'pending') return undefined;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [phaseStatus, refresh]);

  const startWhat = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!canRun || busy || !organizationId || !packId) return;
      setBusy(true);
      try {
        // Pin Analysis Snapshot for this pack — do not force pack re-select.
        try {
          await requirementAPI.createAiAnalysisSnapshot(organizationId, packId);
        } catch (snapErr) {
          if (!silent) {
            toast.error(
              resolveApiErrorMessage(snapErr, {
                t,
                fallback:
                  t('aiCreateWizard.snapshotCreateFail') ||
                  'Không tạo được Analysis Snapshot.',
              })
            );
          }
          throw snapErr;
        }
        await requirementAPI.startPhaseAiPlanning(organizationId, packId, {
          phase: 'what',
          force: Boolean(force),
        });
        setPhaseStatus('pending');
        if (!silent) {
          toast.success(
            t('requirements.aiWhatRunStarted') || 'Đã bắt đầu AI Requirement (WHAT).'
          );
        }
        await refresh();
      } catch (error) {
        const code = error?.errorCode || error?.response?.data?.errorCode;
        if (code === 'HITL_AUTO_WHAT_DISABLED') {
          setErrorMsg(t('requirements.aiWhatDisabled') || 'Auto WHAT đang tắt.');
        } else if (!silent) {
          toast.error(
            resolveApiErrorMessage(error, {
              t,
              fallback: t('requirements.aiWhatRunFail') || 'Không start được AI Requirement.',
            })
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, canRun, organizationId, packId, refresh, t]
  );

  // One-shot from wizard ConfirmDialog: ?startWhat=1
  useEffect(() => {
    if (!isAi || !canRun || !organizationId || !packId) return;
    if (startWhatConsumed.current) return;
    const flag = String(searchParams.get('startWhat') || '').trim();
    if (flag !== '1' && flag.toLowerCase() !== 'true') return;
    startWhatConsumed.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('startWhat');
    setSearchParams(next, { replace: true });
    startWhat({ silent: true });
  }, [isAi, canRun, organizationId, packId, searchParams, setSearchParams, startWhat]);

  if (!legacyWhatPanel || !isAi || !packId) return null;

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t('requirements.aiWhatRunTitle') || 'AI Requirement (WHAT)'}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('requirements.aiWhatRunHint') ||
          'Phân tích từ file intake → đổ Scope/BG/BR/FR… (draft) để chỉnh sửa và gửi duyệt.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {t('requirements.aiWhatPhaseStatus') || 'Phase WHAT'}: {phaseStatus || '—'}
        </span>
        {docCount != null ? (
          <>
            <span>·</span>
            <span>
              {t('requirements.aiWhatDocCount', { count: docCount }) ||
                `${docCount} file nguồn`}
            </span>
          </>
        ) : null}
        {seeded != null && phaseStatus === 'ready' ? (
          <>
            <span>·</span>
            <span>
              {t('requirements.aiWhatSeeded', { count: seeded }) ||
                `Đã đổ ${seeded} artifacts`}
            </span>
          </>
        ) : null}
      </div>
      {errorMsg ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{errorMsg}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {phaseStatus === 'pending' || busy ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('requirements.aiWhatRunning') || 'Đang phân tích…'}
          </span>
        ) : (
          <button
            type="button"
            disabled={!canRun || busy}
            onClick={() =>
              startWhat({
                silent: false,
                force: phaseStatus === 'ready' || phaseStatus === 'failed',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" />
            {phaseStatus === 'ready'
              ? t('requirements.aiWhatRerun') || 'Chạy lại WHAT'
              : t('requirements.aiWhatStart') || 'Chạy AI Requirement'}
          </button>
        )}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, ClipboardCheck, Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import { queryKeys } from '../../../lib/queryKeys';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { coerceDeliveryPhase } from '../../../utils/projectPhaseNav';
import { releaseMetricClass } from './phase3HubUiTokens';

const BLOCKER_LABEL_KEYS = Object.freeze({
  wrong_phase: 'workspace.phaseReleaseBlocker_wrong_phase',
  open_bugs: 'workspace.phaseReleaseBlocker_open_bugs',
  no_linked_test_cases: 'workspace.phaseReleaseBlocker_no_linked_test_cases',
  tc_not_pass: 'workspace.phaseReleaseBlocker_tc_not_pass',
  cards_pending: 'workspace.phaseReleaseBlocker_cards_pending',
  pending_crs: 'workspace.phaseReleaseBlocker_pending_crs',
});

function unwrap(res) {
  if (res == null) return null;
  if (res.data != null && typeof res.data === 'object' && !Array.isArray(res.data)) {
    return res.data;
  }
  return res;
}

/**
 * Overview — Release Ready + UAT: compact card (giống Deploy), chi tiết trong modal.
 */
export default function ProjectHubReleaseReadyPanel({
  projectId = '',
  deliveryPhase = 'development',
  canConfirmReleaseReady = false,
  canSignOffUat = false,
  isDarkMode = false,
  embedded = false,
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const phase = coerceDeliveryPhase(deliveryPhase);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [uatNote, setUatNote] = useState('');
  const [cardOpen, setCardOpen] = useState(false);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';

  const refreshHubAfterGate = useCallback(
    async (pid) => {
      const id = String(pid || '').trim();
      if (!id) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.overview(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      ]);
    },
    [queryClient]
  );

  const load = useCallback(async () => {
    const pid = String(projectId || '').trim();
    if (!pid || phase !== 'qa_uat') {
      setState(null);
      return;
    }
    setLoading(true);
    try {
      const res = await projectAPI.getReleaseReady(pid);
      setState(unwrap(res));
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, phase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase !== 'qa_uat') return null;

  const releaseConfirmed = String(state?.releaseReadyStatus || '') === 'confirmed';
  const uatStatus = String(state?.uatStatus || 'none');
  const uatPassed = uatStatus === 'pass';
  const blockers = Array.isArray(state?.blockers) ? state.blockers : [];

  const cardHint = loading
    ? t('common.loading')
    : releaseConfirmed && uatPassed
      ? t('workspace.phaseReleaseReadyCardDone')
      : releaseConfirmed
        ? t('workspace.phaseReleaseReadyCardUatPending')
        : t('workspace.phaseReleaseReadyCardPending');

  const onConfirm = async () => {
    const pid = String(projectId || '').trim();
    if (!pid || busy || !canConfirmReleaseReady) return;
    setBusy('confirm');
    try {
      const res = await projectAPI.confirmReleaseReady(pid);
      setState(unwrap(res));
      await refreshHubAfterGate(pid);
      toast.success(t('workspace.phaseReleaseReadySuccess'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseReleaseReadyFail') })
      );
    } finally {
      setBusy('');
    }
  };

  const onUat = async (result) => {
    const pid = String(projectId || '').trim();
    if (!pid || busy || !canSignOffUat) return;
    setBusy(result);
    try {
      const res = await projectAPI.signOffUat(pid, { result, note: uatNote });
      setState(unwrap(res));
      await refreshHubAfterGate(pid);
      toast.success(
        result === 'pass' ? t('workspace.phaseUatPassSuccess') : t('workspace.phaseUatFailSuccess')
      );
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseUatFail') }));
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setCardOpen(true)}
        className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition hover:brightness-[0.98] ${
          embedded ? '' : 'mb-4'
        } ${
          releaseConfirmed && uatPassed
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : releaseConfirmed
              ? 'border-violet-500/35 bg-violet-500/5'
              : 'border-border/70 bg-background/60'
        }`}
        aria-label={t('workspace.phaseReleaseReadyTitle')}
      >
        <Flag
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            releaseConfirmed ? 'text-emerald-600 dark:text-emerald-300' : 'text-primary'
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-bold ${titleCls}`}>
            {t('workspace.phaseReleaseReadyTitle')}
          </span>
          <span className={`mt-0.5 block text-[10px] ${muted}`}>{cardHint}</span>
        </span>
        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${muted}`} aria-hidden />
      </button>

      <Modal
        isOpen={cardOpen}
        onClose={() => setCardOpen(false)}
        title={t('workspace.phaseReleaseReadyTitle')}
        size="lg"
      >
        <div className="space-y-3">
          <p className={`text-[11px] leading-relaxed ${muted}`}>
            {t('workspace.phaseReleaseReadyHint')}
          </p>
          <div className="rounded-xl border border-[#C9DFF0] bg-[#E8F4FC]/60 px-3 py-2 text-[11px] dark:border-slate-600 dark:bg-slate-800/50">
            <p className={`font-semibold ${titleCls}`}>{t('workspace.phaseReleaseReadyRolesTitle')}</p>
            <p className={`mt-0.5 ${muted}`}>{t('workspace.phaseReleaseReadyRolesBody')}</p>
          </div>

          {state ? (
            <div className="flex flex-wrap gap-2 text-[11px] tabular-nums">
              <span
                className={`rounded-full border px-2 py-0.5 font-semibold ${releaseMetricClass('tc')}`}
              >
                {t('workspace.phaseReleaseStatTc', {
                  pass: state.tcPassCount ?? 0,
                  total: state.tcTotal ?? 0,
                })}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 font-semibold ${releaseMetricClass(
                  'bugs',
                  { count: state.openBugCount ?? 0 }
                )}`}
              >
                {t('workspace.phaseReleaseStatBugs', { count: state.openBugCount ?? 0 })}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 font-semibold ${releaseMetricClass(
                  'cards',
                  { count: state.cardsPendingCount ?? 0 }
                )}`}
              >
                {t('workspace.phaseReleaseStatCards', { count: state.cardsPendingCount ?? 0 })}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 font-semibold ${releaseMetricClass('cr', {
                  count: state.pendingCrCount ?? 0,
                })}`}
              >
                {t('workspace.phaseReleaseStatCr', { count: state.pendingCrCount ?? 0 })}
              </span>
            </div>
          ) : loading ? (
            <p className={`text-[11px] ${muted}`}>{t('common.loading')}</p>
          ) : null}

          {!releaseConfirmed ? (
            <div>
              {blockers.length > 0 ? (
                <ul className={`mb-2 list-inside list-disc text-xs ${muted}`}>
                  {blockers.map((b) => (
                    <li key={b}>
                      {t(BLOCKER_LABEL_KEYS[b] || 'workspace.phaseReleaseBlocker_unknown')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-300">
                  {t('workspace.phaseReleaseReadyOk')}
                </p>
              )}
              {canConfirmReleaseReady && state?.ready ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void onConfirm()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {busy === 'confirm'
                    ? t('common.loading')
                    : t('workspace.phaseReleaseReadyConfirm')}
                </button>
              ) : null}
              {!canConfirmReleaseReady ? (
                <p className={`mt-1 text-[11px] ${muted}`}>
                  {t('workspace.phaseReleaseReadyPmOnly')}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {t('workspace.phaseReleaseReadyConfirmed')}
            </p>
          )}

          {releaseConfirmed ? (
            <div className="rounded-xl border border-violet-500/35 bg-violet-500/5 p-3">
              <h4 className={`flex flex-wrap items-center gap-2 text-xs font-bold ${titleCls}`}>
                <ClipboardCheck
                  className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300"
                  aria-hidden
                />
                {t('workspace.phaseUatTitle')}
                <span className="rounded-md border border-violet-500/40 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-100">
                  {t('workspace.phaseUatStagingBadge')}
                </span>
              </h4>
              <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
                {t('workspace.phaseUatHint')}
              </p>
              {uatPassed ? (
                <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {t('workspace.phaseUatPassed')}
                </p>
              ) : (
                <>
                  {uatStatus === 'fail' ? (
                    <p className="mt-2 text-xs font-semibold text-destructive">
                      {t('workspace.phaseUatFailed')}
                    </p>
                  ) : null}
                  {canSignOffUat ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea
                        value={uatNote}
                        onChange={(e) => setUatNote(e.target.value)}
                        rows={2}
                        placeholder={t('workspace.phaseUatNotePh')}
                        className="w-full rounded-lg border border-border/70 bg-background px-2.5 py-2 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                        disabled={Boolean(busy)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void onUat('pass')}
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"
                        >
                          {busy === 'pass' ? t('common.loading') : t('workspace.phaseUatPass')}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void onUat('fail')}
                          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
                        >
                          {busy === 'fail' ? t('common.loading') : t('workspace.phaseUatFailBtn')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={`mt-2 text-[11px] ${muted}`}>{t('workspace.phaseUatPoOnly')}</p>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Flag,
  LayoutList,
  Rocket,
  Server,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { queryKeys } from '../../../lib/queryKeys';
import {
  coerceDeliveryPhase,
  deliveryPhaseLabelKey,
  DELIVERY_PHASES,
  DELIVERY_PHASE_FORWARD,
  RELEASE_HANDOVER_CHECKLIST_IDS,
} from '../../../utils/projectPhaseNav';

const HANDOVER_BLOCKER_KEYS = Object.freeze({
  release_ready_not_confirmed: 'workspace.phaseHandoverBlocker_release_ready_not_confirmed',
  uat_not_pass: 'workspace.phaseHandoverBlocker_uat_not_pass',
  checklist_release_notes: 'workspace.phaseHandoverBlocker_checklist',
  checklist_deployment_verified: 'workspace.phaseHandoverBlocker_checklist',
  checklist_acceptance_signed_off: 'workspace.phaseHandoverBlocker_checklist',
  checklist_handover_completed: 'workspace.phaseHandoverBlocker_checklist',
});

/** Per-item card chrome — color distinction for checklist (Plan D UX). */
const CHECKLIST_CARD_TONE = Object.freeze({
  release_notes: {
    idle: 'border-sky-500/35 bg-sky-500/5',
    on: 'border-sky-500/50 bg-sky-500/15',
    badge: 'bg-sky-500/20 text-sky-800 dark:text-sky-200',
  },
  deployment_verified: {
    idle: 'border-amber-500/35 bg-amber-500/5',
    on: 'border-amber-500/50 bg-amber-500/15',
    badge: 'bg-amber-500/20 text-amber-900 dark:text-amber-200',
  },
  acceptance_signed_off: {
    idle: 'border-violet-500/35 bg-violet-500/5',
    on: 'border-violet-500/50 bg-violet-500/15',
    badge: 'bg-violet-500/20 text-violet-900 dark:text-violet-200',
  },
  handover_completed: {
    idle: 'border-emerald-500/35 bg-emerald-500/5',
    on: 'border-emerald-500/50 bg-emerald-500/15',
    badge: 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-200',
  },
});

function checklistFromProject(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const id of RELEASE_HANDOVER_CHECKLIST_IDS) {
    out[id] = src[id] === true;
  }
  return out;
}

function evidenceFromProject(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    env: String(src.env || 'production'),
    notes: String(src.notes || ''),
    pipelineUrl: String(src.pipelineUrl || ''),
    at: src.at || null,
    releaseLabelRef: String(src.releaseLabelRef || ''),
  };
}

/**
 * Overview — delivery phase stepper, Plan D deploy SoT, handover checklist (Plan B).
 */
export default function ProjectHubDeliveryPhasePanel({
  projectId = '',
  deliveryPhase = 'development',
  canChangePhase = false,
  isDarkMode = false,
  onPhaseChanged = null,
  handoverChecklist = null,
  releaseLabel = '',
  releaseReadyStatus = 'none',
  uatStatus = 'none',
  deployEvidence = null,
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(() => checklistFromProject(handoverChecklist));
  const [evidenceDraft, setEvidenceDraft] = useState(() => evidenceFromProject(deployEvidence));
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [deployCardOpen, setDeployCardOpen] = useState(false);
  const [checklistCardOpen, setChecklistCardOpen] = useState(false);
  const [gatesCardOpen, setGatesCardOpen] = useState(false);

  const phase = coerceDeliveryPhase(deliveryPhase);
  const phaseIndex = Math.max(0, DELIVERY_PHASES.indexOf(phase));
  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const uatPassed = String(uatStatus || '') === 'pass';
  const readyConfirmed = String(releaseReadyStatus || '') === 'confirmed';

  useEffect(() => {
    setChecked(checklistFromProject(handoverChecklist));
  }, [handoverChecklist, projectId]);

  useEffect(() => {
    setEvidenceDraft(evidenceFromProject(deployEvidence));
  }, [deployEvidence, projectId]);

  const nextPhases = useMemo(() => DELIVERY_PHASE_FORWARD[phase] || [], [phase]);
  const showChecklist =
    phase === 'release_handover' || nextPhases.includes('release_handover');
  const showDeployBlock =
    showChecklist && (uatPassed || phase === 'release_handover' || readyConfirmed);

  const checklistDone = useMemo(
    () => RELEASE_HANDOVER_CHECKLIST_IDS.filter((id) => checked[id]).length,
    [checked]
  );
  const checklistTotal = RELEASE_HANDOVER_CHECKLIST_IDS.length;
  const checklistComplete = checklistDone === checklistTotal;

  const handoverGateBlockers = useMemo(() => {
    const blockers = [];
    if (!readyConfirmed) blockers.push('release_ready_not_confirmed');
    if (!uatPassed) blockers.push('uat_not_pass');
    if (!checklistComplete) {
      for (const id of RELEASE_HANDOVER_CHECKLIST_IDS) {
        if (!checked[id]) blockers.push(`checklist_${id}`);
      }
    }
    return blockers;
  }, [readyConfirmed, uatPassed, checklistComplete, checked]);

  const canAdvanceHandover = handoverGateBlockers.length === 0;

  const persistChecklist = useCallback(
    async (nextChecked) => {
      const pid = String(projectId || '').trim();
      if (!pid || !canChangePhase) return;
      try {
        await projectAPI.patch(pid, { handoverChecklist: nextChecked });
        await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(pid) });
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseHandoverChecklistFail') })
        );
        setChecked(checklistFromProject(handoverChecklist));
      }
    },
    [projectId, canChangePhase, queryClient, t, handoverChecklist]
  );

  const onToggleChecklist = (id, value) => {
    if (id === 'deployment_verified' && value && !uatPassed) {
      toast.error(t('workspace.phaseDeployVerifyNeedUat'));
      return;
    }
    const next = { ...checked, [id]: value };
    setChecked(next);
    void persistChecklist(next);
  };

  const saveEvidence = useCallback(async () => {
    const pid = String(projectId || '').trim();
    if (!pid || !canChangePhase || evidenceBusy || !uatPassed) return;
    setEvidenceBusy(true);
    try {
      await projectAPI.patch(pid, {
        deployEvidence: {
          env: evidenceDraft.env || 'production',
          notes: evidenceDraft.notes,
          pipelineUrl: evidenceDraft.pipelineUrl,
        },
      });
      toast.success(t('workspace.phaseDeployEvidenceSaved'));
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(pid) });
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseDeployEvidenceFail') })
      );
    } finally {
      setEvidenceBusy(false);
    }
  }, [
    projectId,
    canChangePhase,
    evidenceBusy,
    uatPassed,
    evidenceDraft,
    t,
    queryClient,
  ]);

  const advanceTo = useCallback(
    async (target) => {
      const pid = String(projectId || '').trim();
      if (!pid || !canChangePhase || busy) return;
      if (target === 'release_handover' && !canAdvanceHandover) {
        toast.error(t('workspace.phaseHandoverGateBlocked'));
        return;
      }
      setBusy(true);
      try {
        const res = await projectAPI.patch(pid, { deliveryPhase: target });
        const updated = res?.data ?? res;
        toast.success(t('workspace.phaseQaPhaseAdvanceSuccess'));
        if (target === 'release_handover' && updated?.releaseLabel) {
          toast.success(
            t('workspace.phaseHandoverLabelSet', { label: updated.releaseLabel })
          );
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.projectHub.project(pid) });
        onPhaseChanged?.(target);
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('workspace.phaseQaPhaseAdvanceFail') })
        );
      } finally {
        setBusy(false);
      }
    },
    [
      projectId,
      canChangePhase,
      busy,
      canAdvanceHandover,
      t,
      queryClient,
      onPhaseChanged,
    ]
  );

  const labelText = String(releaseLabel || '').trim();
  const savedEvidence = evidenceFromProject(deployEvidence);
  const showGatesCard = phase === 'qa_uat' || phase === 'release_handover';
  const gatesDoneCount =
    (readyConfirmed ? 1 : 0) + (uatPassed ? 1 : 0) + (checked.deployment_verified ? 1 : 0);

  const gateTable = (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-background/60">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40">
            <th className="border-r border-border/50 px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
              {t('workspace.phaseDeployGateCol')}
            </th>
            <th className="px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
              {t('workspace.phaseDeployStatusCol')}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/40">
            <td className="border-r border-border/40 px-3 py-2 text-foreground">
              {t('workspace.phaseReleaseReadyTitle')}
            </td>
            <td className="px-3 py-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 font-semibold ${
                  readyConfirmed
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : 'border-border bg-muted/40 text-muted-foreground'
                }`}
              >
                {readyConfirmed
                  ? t('workspace.phaseReleaseReadyConfirmed')
                  : t('workspace.phaseDeployStatusPending')}
              </span>
            </td>
          </tr>
          <tr className="border-b border-border/40">
            <td className="border-r border-border/40 px-3 py-2 text-foreground">
              {t('workspace.phaseUatTitle')}
            </td>
            <td className="px-3 py-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 font-semibold ${
                  uatPassed
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                    : String(uatStatus) === 'fail'
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-border bg-muted/40 text-muted-foreground'
                }`}
              >
                {uatPassed
                  ? t('workspace.phaseUatPassed')
                  : String(uatStatus) === 'fail'
                    ? t('workspace.phaseUatFailed')
                    : t('workspace.phaseDeployStatusPending')}
              </span>
            </td>
          </tr>
          <tr>
            <td className="border-r border-border/40 px-3 py-2 text-foreground">
              {t('workspace.phaseQaChecklist_deployment_verified')}
            </td>
            <td className="px-3 py-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 font-semibold ${
                  checked.deployment_verified
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-200'
                    : 'border-border bg-muted/40 text-muted-foreground'
                }`}
              >
                {checked.deployment_verified
                  ? t('workspace.phaseDeployVerifiedOn')
                  : t('workspace.phaseDeployStatusPending')}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <section
      className={`mb-4 rounded-xl border p-3 sm:p-4 ${
        phase === 'release_handover'
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : phase === 'qa_uat'
            ? 'border-sky-500/35 bg-sky-500/5'
            : 'border-border bg-surface'
      }`}
      aria-label={t('workspace.phaseQaDeliveryPhaseTitle')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-2 text-sm font-bold ${titleCls}`}>
            <Rocket className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            {t('workspace.phaseQaDeliveryPhaseTitle')}
          </h3>
          <p className={`mt-1 text-xs ${muted}`}>
            {t('workspace.phaseQaDeliveryPhaseCurrent')}:{' '}
            <span className="font-semibold text-foreground">
              {t(deliveryPhaseLabelKey(phase))}
            </span>
          </p>
          {labelText ? (
            <p className={`mt-1 font-mono text-[11px] ${muted}`}>
              {t('workspace.phaseHandoverReleaseLabel')}:{' '}
              <span className="font-semibold text-foreground">{labelText}</span>
            </p>
          ) : null}
        </div>
        {!canChangePhase ? (
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {t('workspace.phaseQaPhaseReadOnly')}
          </span>
        ) : null}
      </div>

      {/* Gate table → compact card + modal */}
      {showGatesCard ? (
        <button
          type="button"
          onClick={() => setGatesCardOpen(true)}
          className="mt-3 flex w-full items-start gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 text-left transition hover:brightness-[0.98]"
        >
          <LayoutList className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className={`block text-xs font-bold ${titleCls}`}>
              {t('workspace.phaseGatesCardTitle')}
            </span>
            <span className={`mt-0.5 block text-[10px] tabular-nums ${muted}`}>
              {t('workspace.phaseGatesProgress', { done: gatesDoneCount, total: 3 })}
              {' · '}
              {t('workspace.phaseGatesOpenHint')}
            </span>
          </span>
          <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${muted}`} aria-hidden />
        </button>
      ) : null}

      <ol
        className="mt-4 flex flex-wrap items-center gap-1 sm:gap-0"
        aria-label={t('workspace.phaseQaDeliveryPhaseTitle')}
      >
        {DELIVERY_PHASES.map((id, idx) => {
          const done = idx < phaseIndex;
          const current = idx === phaseIndex;
          return (
            <li key={id} className="flex items-center">
              {idx > 0 ? (
                <ChevronRight
                  className={`mx-0.5 hidden h-3.5 w-3.5 sm:inline ${muted}`}
                  aria-hidden
                />
              ) : null}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold sm:text-[11px] ${
                  current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-background text-muted-foreground'
                }`}
                aria-current={current ? 'step' : undefined}
              >
                {done ? (
                  <Check className="h-3 w-3 shrink-0" aria-hidden />
                ) : current ? (
                  <Flag className="h-3 w-3 shrink-0" aria-hidden />
                ) : (
                  <span className="tabular-nums opacity-70">{idx + 1}</span>
                )}
                <span className="max-w-[7.5rem] truncate sm:max-w-none">
                  {t(deliveryPhaseLabelKey(id))}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {canChangePhase && nextPhases.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {nextPhases.map((target) => {
              const isHandover = target === 'release_handover';
              const disabled = busy || (isHandover && !canAdvanceHandover);
              return (
                <button
                  key={target}
                  type="button"
                  disabled={disabled}
                  onClick={() => void advanceTo(target)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {t('workspace.phaseQaAdvanceTo', { phase: t(deliveryPhaseLabelKey(target)) })}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              );
            })}
          </div>
          {nextPhases.includes('release_handover') && !canAdvanceHandover ? (
            <ul className={`list-inside list-disc text-[11px] ${muted}`}>
              {handoverGateBlockers.slice(0, 6).map((b) => (
                <li key={b}>
                  {t(HANDOVER_BLOCKER_KEYS[b] || 'workspace.phaseHandoverBlocker_unknown')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Deploy + checklist — compact entry cards; detail in modal */}
      {(showDeployBlock || showChecklist) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {showDeployBlock ? (
            <button
              type="button"
              onClick={() => setDeployCardOpen(true)}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition hover:brightness-[0.98] ${
                uatPassed
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-border/70 bg-muted/20'
              }`}
            >
              <Server
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-bold ${titleCls}`}>
                  {t('workspace.phaseDeployOutsideTitle')}
                </span>
                <span className={`mt-0.5 block text-[10px] leading-snug ${muted}`}>
                  {checked.deployment_verified
                    ? t('workspace.phaseDeployVerifiedOn')
                    : uatPassed
                      ? t('workspace.phaseDeployOpenHint')
                      : t('workspace.phaseDeployWaitUat')}
                </span>
              </span>
              <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${muted}`} aria-hidden />
            </button>
          ) : null}

          {showChecklist ? (
            <button
              type="button"
              onClick={() => setChecklistCardOpen(true)}
              className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-left transition hover:brightness-[0.98]"
            >
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-bold ${titleCls}`}>
                  {t('workspace.phaseQaHandoverChecklistTitle')}
                </span>
                <span className={`mt-0.5 block text-[10px] tabular-nums ${muted}`}>
                  {t('workspace.phaseQaChecklistProgress', {
                    done: checklistDone,
                    total: checklistTotal,
                  })}
                </span>
              </span>
              <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${muted}`} aria-hidden />
            </button>
          ) : null}
        </div>
      )}

      <Modal
        isOpen={gatesCardOpen}
        onClose={() => setGatesCardOpen(false)}
        title={t('workspace.phaseGatesCardTitle')}
        size="md"
      >
        {gateTable}
      </Modal>

      <Modal
        isOpen={deployCardOpen}
        onClose={() => setDeployCardOpen(false)}
        title={t('workspace.phaseDeployOutsideTitle')}
        size="lg"
      >
        <div className="space-y-3">
          <p className={`text-[11px] leading-relaxed ${muted}`}>
            {t('workspace.phaseDeployOutsideBody')}
          </p>
          {!uatPassed ? (
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              {t('workspace.phaseDeployWaitUat')}
            </p>
          ) : (
            <ol className={`list-inside list-decimal space-y-0.5 text-[11px] ${muted}`}>
              <li>{t('workspace.phaseDeployStep1')}</li>
              <li>{t('workspace.phaseDeployStep2')}</li>
              <li>{t('workspace.phaseDeployStep3')}</li>
            </ol>
          )}

          {uatPassed && canChangePhase ? (
            <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="font-semibold text-foreground">
                  {t('workspace.phaseDeployEvidenceEnv')}
                </span>
                <select
                  className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                  value={evidenceDraft.env || 'production'}
                  disabled={evidenceBusy}
                  onChange={(e) =>
                    setEvidenceDraft((prev) => ({ ...prev, env: e.target.value }))
                  }
                >
                  <option value="production">production</option>
                  <option value="staging">staging</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="font-semibold text-foreground">
                  {t('workspace.phaseDeployEvidenceUrl')}
                </span>
                <input
                  type="url"
                  className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                  placeholder="https://…"
                  value={evidenceDraft.pipelineUrl}
                  disabled={evidenceBusy}
                  onChange={(e) =>
                    setEvidenceDraft((prev) => ({ ...prev, pipelineUrl: e.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="font-semibold text-foreground">
                  {t('workspace.phaseDeployEvidenceNotes')}
                </span>
                <textarea
                  rows={2}
                  className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs text-foreground shadow-sm outline-none focus:border-primary"
                  placeholder={t('workspace.phaseDeployEvidenceNotesPh')}
                  value={evidenceDraft.notes}
                  disabled={evidenceBusy}
                  onChange={(e) =>
                    setEvidenceDraft((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <button
                  type="button"
                  disabled={evidenceBusy}
                  onClick={() => void saveEvidence()}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-100"
                >
                  {evidenceBusy ? t('common.loading') : t('workspace.phaseDeployEvidenceSave')}
                </button>
                {savedEvidence.at ? (
                  <span className={`text-[10px] ${muted}`}>
                    {t('workspace.phaseDeployEvidenceSavedAt')}
                    {savedEvidence.pipelineUrl ? (
                      <a
                        href={savedEvidence.pipelineUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
                      >
                        link
                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                      </a>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={checklistCardOpen}
        onClose={() => setChecklistCardOpen(false)}
        title={t('workspace.phaseQaHandoverChecklistTitle')}
        size="lg"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[11px] tabular-nums ${muted}`}>
              {t('workspace.phaseQaChecklistProgress', {
                done: checklistDone,
                total: checklistTotal,
              })}
            </p>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={checklistTotal}
            aria-valuenow={checklistDone}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${checklistTotal ? (checklistDone / checklistTotal) * 100 : 0}%`,
              }}
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {RELEASE_HANDOVER_CHECKLIST_IDS.map((id) => {
              const isOn = Boolean(checked[id]);
              const tone = CHECKLIST_CARD_TONE[id] || CHECKLIST_CARD_TONE.release_notes;
              const deployLocked = id === 'deployment_verified' && !uatPassed;
              const disabled = !canChangePhase || busy || deployLocked;
              return (
                <li key={id}>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-2.5 text-sm transition ${
                      isOn ? tone.on : tone.idle
                    } ${disabled ? 'cursor-default opacity-75' : 'hover:brightness-[0.98]'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={isOn}
                      disabled={disabled}
                      onChange={(e) => onToggleChecklist(id, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-foreground">
                        {t(`workspace.phaseQaChecklist_${id}`)}
                      </span>
                      {id === 'deployment_verified' ? (
                        <span className={`mt-0.5 block text-[10px] leading-snug ${muted}`}>
                          {deployLocked
                            ? t('workspace.phaseDeployVerifyNeedUat')
                            : t('workspace.phaseDeployVerifyHint')}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone.badge}`}
                    >
                      {isOn ? 'OK' : '—'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </section>
  );
}

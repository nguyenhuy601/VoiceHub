import { useAppStrings } from '../../../../locales/appStrings';
import { RELEASE_HANDOVER_CHECKLIST_IDS } from '../../../../utils/projectPhaseNav';
import usePhase4Handover from './usePhase4Handover';
import Phase4SectionCard from './Phase4SectionCard';

const ITEM_ROLE = Object.freeze({
  release_notes: 'pm',
  deployment_verified: 'pm',
  acceptance_signed_off: 'po',
  handover_completed: 'po',
});

const ITEM_HINT_KEY = Object.freeze({
  release_notes: 'workspace.phase4ReleaseNotesHint',
  deployment_verified: 'workspace.phaseDeployVerifyHint',
  acceptance_signed_off: 'workspace.phase4AcceptanceSignHint',
  handover_completed: 'workspace.phase4HandoverCompleteHint',
});

/**
 * Phase 4 Handover — single SoT checklist (PM + PO ticks). Tab Nghiệm thu đã gộp vào đây.
 */
export default function Phase4HandoverChecklistPage({ projectId }) {
  const { t } = useAppStrings();
  const {
    isLoading,
    checklist,
    checklistDone,
    checklistTotal,
    canPhase,
    canAccept,
    uatPassed,
    busy,
    setChecklistItem,
  } = usePhase4Handover(projectId);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 sm:p-4">
      <Phase4SectionCard
        title={t('workspace.phaseQaHandoverChecklistTitle')}
        description={t('workspace.phase4HandoverHint')}
        aside={
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t('workspace.phaseQaChecklistProgress', {
              done: checklistDone,
              total: checklistTotal,
            })}
          </span>
        }
      >
        <div
          className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"
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
            const isOn = Boolean(checklist[id]);
            const role = ITEM_ROLE[id];
            const deployLocked = id === 'deployment_verified' && !uatPassed;
            const allowed = role === 'po' ? canAccept : canPhase;
            const disabled = !allowed || busy || deployLocked;
            const hintKey = ITEM_HINT_KEY[id];
            return (
              <li key={id}>
                <label
                  className={`flex items-start gap-2 rounded-xl border px-2.5 py-2.5 text-sm transition ${
                    isOn
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-border/70 bg-muted/15'
                  } ${
                    disabled
                      ? 'cursor-not-allowed opacity-75'
                      : 'cursor-pointer hover:brightness-[0.98]'
                  }`}
                  onClick={(e) => {
                    if (!disabled) return;
                    e.preventDefault();
                    if (role === 'po' && !canAccept) {
                      void setChecklistItem(id, true);
                    } else if (role === 'pm' && !canPhase) {
                      void setChecklistItem(id, true);
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={isOn}
                    disabled={disabled}
                    onChange={(e) => void setChecklistItem(id, e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-foreground">
                      {t(`workspace.phaseQaChecklist_${id}`)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {role === 'po'
                        ? t('workspace.phase4RolePo')
                        : t('workspace.phase4RolePm')}
                      {hintKey ? ` · ${t(hintKey)}` : ''}
                      {deployLocked ? ` · ${t('workspace.phaseDeployVerifyNeedUat')}` : ''}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      isOn
                        ? 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isOn ? 'OK' : role === 'po' ? 'PO' : 'PM'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Phase4SectionCard>
    </div>
  );
}

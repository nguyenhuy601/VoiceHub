import { useAppStrings } from '../../../../locales/appStrings';
import usePhase4Handover from './usePhase4Handover';
import Phase4SectionCard from './Phase4SectionCard';

/**
 * Phase 4 Release notes — PM HITL tick that release notes were published.
 */
export default function Phase4ReleaseNotesPage({ projectId }) {
  const { t } = useAppStrings();
  const { isLoading, checklist, canPhase, busy, setChecklistItem, releaseLabel } =
    usePhase4Handover(projectId);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  const notesOn = Boolean(checklist.release_notes);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 sm:p-4">
      <Phase4SectionCard
        title={t('workspace.phaseNavReleaseNotes')}
        description={t('workspace.phase4ReleaseNotesHint')}
        aside={
          releaseLabel ? (
            <span className="rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
              {releaseLabel}
            </span>
          ) : null
        }
      >
        {!canPhase ? (
          <p className="mb-3 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
            {t('workspace.phaseHandoverChecklistPmOnly')}
          </p>
        ) : null}

        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          {t('workspace.phase4ReleaseNotesBodyHint')}
        </p>

        <label
          className={`flex items-start gap-2 rounded-xl border px-3 py-3 text-sm ${
            notesOn
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-border/70 bg-muted/15'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={notesOn}
            disabled={!canPhase || busy}
            onChange={(e) => void setChecklistItem('release_notes', e.target.checked)}
          />
          <span>
            <span className="font-semibold text-foreground">
              {t('workspace.phaseQaChecklist_release_notes')}
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {t('workspace.phase4RolePm')}
            </span>
          </span>
        </label>
      </Phase4SectionCard>
    </div>
  );
}

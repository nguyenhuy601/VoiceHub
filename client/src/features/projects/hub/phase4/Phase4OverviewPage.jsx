import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { useAppStrings } from '../../../../locales/appStrings';
import { buildProjectsModulePath } from '../../../../utils/suitePathUtils';
import { RELEASE_HANDOVER_CHECKLIST_IDS } from '../../../../utils/projectPhaseNav';
import usePhase4Handover from './usePhase4Handover';
import Phase4SectionCard from './Phase4SectionCard';

const CTA_MODULES = Object.freeze([
  { module: 'release-notes', id: 'release_notes' },
  { module: 'deploy-evidence', id: 'deployment_verified' },
  { module: 'handover', id: null },
]);

/**
 * Phase 4 Overview — progress, release label, CTAs (no Deploy).
 */
export default function Phase4OverviewPage({ projectId }) {
  const { t } = useAppStrings();
  const {
    isLoading,
    checklist,
    checklistDone,
    checklistTotal,
    releaseLabel,
    readyConfirmed,
    uatPassed,
    evidence,
  } = usePhase4Handover(projectId);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 sm:p-4">
      <Phase4SectionCard
        title={t('workspace.phase4OverviewTitle')}
        description={t('workspace.phase4OverviewHint')}
        aside={
          releaseLabel ? (
            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
              {t('workspace.phaseHandoverReleaseLabel')}: {releaseLabel}
            </span>
          ) : null
        }
      >
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span
            className={`rounded-md px-2 py-1 font-semibold ${
              readyConfirmed
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            RR: {readyConfirmed ? t('workspace.phaseReleaseReadyConfirmed') : t('workspace.phaseDeployStatusPending')}
          </span>
          <span
            className={`rounded-md px-2 py-1 font-semibold ${
              uatPassed
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            UAT: {uatPassed ? 'Pass' : t('workspace.phaseDeployStatusPending')}
          </span>
        </div>

        <div className="mt-3">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {t('workspace.phaseQaChecklistProgress', {
              done: checklistDone,
              total: checklistTotal,
            })}
          </p>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
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
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {RELEASE_HANDOVER_CHECKLIST_IDS.map((id) => {
              const on = Boolean(checklist[id]);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs"
                >
                  {on ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={on ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                    {t(`workspace.phaseQaChecklist_${id}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Phase4SectionCard>

      <Phase4SectionCard title={t('workspace.phase4OverviewCtaTitle')} description={t('workspace.phase4OverviewCtaHint')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {CTA_MODULES.map(({ module, id }) => {
            const done = id ? Boolean(checklist[id]) : checklistDone === checklistTotal;
            return (
              <Link
                key={module}
                to={buildProjectsModulePath(projectId, module)}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm transition hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="font-semibold text-foreground">
                  {t(
                    module === 'handover'
                      ? 'workspace.phaseNavHandover'
                      : module === 'deploy-evidence'
                        ? 'workspace.phaseNavDeployEvidence'
                        : 'workspace.phaseNavReleaseNotes'
                  )}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    done
                      ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {done ? 'OK' : '→'}
                </span>
              </Link>
            );
          })}
        </div>
        {evidence.pipelineUrl ? (
          <a
            href={evidence.pipelineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            {t('workspace.phaseDeployEvidenceUrl')}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
        <p className="mt-2 text-[11px] text-muted-foreground">{t('workspace.phase4NoDeployHint')}</p>
      </Phase4SectionCard>
    </div>
  );
}

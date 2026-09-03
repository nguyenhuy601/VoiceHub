import { Loader2, Sparkles } from 'lucide-react';

import { wizardUi } from '../wizard/projectWizardUi';

import AiPlanningRunningBanner from '../../requirements/AiPlanningRunningBanner';

import AiStaffingProposalPanel from '../../requirements/AiStaffingProposalPanel';



/**

 * Step 2 — run AI planning on selected pack.

 */

export default function AiWizardStepPlanning({

  pack,

  busy,

  canRunAi,

  canApproveStaffing = false,

  onRunAi,

  onApproveStaffing,

  onDiscardStaffing,

  t,

}) {

  const planning = pack?.aiPlanning || {};

  const status = busy ? 'pending' : String(planning.status || 'none');

  const overlay = planning.overlay || {};

  const llm = overlay.llm || {};

  const statusLabel =

    t(`requirements.aiPlanningStatus.${status}`) || status;

  const staffingStatusLabel =

    llm.staffingStatus

      ? t(`requirements.aiLlmStaffingStatusLabels.${llm.staffingStatus}`, {

          defaultValue: llm.staffingStatus,

        })

      : null;



  return (

    <div className="space-y-6">

      <div>

        <h1 className={wizardUi.title}>{t('aiCreateWizard.planningTitle')}</h1>

        <p className={wizardUi.subtitle}>{t('aiCreateWizard.planningSubtitle')}</p>

      </div>



      <div className="rounded-xl border border-border bg-card p-4">

        <p className="text-sm font-medium text-foreground">

          {pack?.overview?.requirementName || pack?.sourceFileName || '—'}

        </p>

        <p className="mt-1 text-xs text-muted-foreground">

          {statusLabel}

          {overlay.engine ? ` · ${overlay.engine}` : ''}

          {llm.model ? ` · ${llm.model}` : ''}

        </p>

        {staffingStatusLabel && (status === 'ready' || status === 'failed') ? (

          <p className="mt-1 text-xs text-muted-foreground">

            {t('requirements.aiLlmStaffingStatus', { status: staffingStatusLabel })}

          </p>

        ) : null}

        {status === 'failed' ? (

          <p className="mt-2 text-sm text-destructive">

            {overlay.message || t('requirements.aiPlanningFail')}

          </p>

        ) : null}

        {!canRunAi ? (

          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">

            {t('aiCreateWizard.packNotReadyForAi')}

          </p>

        ) : null}

        {busy ? (

          <div className="mt-3">

            <AiPlanningRunningBanner t={t} />

          </div>

        ) : null}

      </div>



      {status === 'ready' && !busy ? (

        <div className="rounded-xl border border-border bg-card p-4">

          <AiStaffingProposalPanel

            overlay={overlay}

            t={t}

            canRunAiPlanning={canRunAi}

            canApproveStaffing={canApproveStaffing}

            busy={busy}

            onApproveStaffing={onApproveStaffing}

            onDiscardStaffing={onDiscardStaffing}

            approveButtonVariant="primary"

            ApproveButtonComponent={({ children, className, disabled, onClick }) => (

              <button

                type="button"

                className={`${wizardUi.primaryBtn} inline-flex items-center gap-1.5 ${className || ''}`}

                disabled={disabled}

                onClick={onClick}

              >

                {children}

              </button>

            )}

            DiscardButtonComponent={({ children, className, disabled, onClick }) => (

              <button

                type="button"

                className={`${wizardUi.secondaryBtn} inline-flex items-center gap-1.5 ${className || ''}`}

                disabled={disabled}

                onClick={onClick}

              >

                {children}

              </button>

            )}

            approveButtonClassName=""

            discardButtonClassName=""

          />

          <p className="mt-3 text-xs text-muted-foreground">

            {t('aiCreateWizard.planningApproveOrNextHint')}

          </p>

        </div>

      ) : null}



      <button

        type="button"

        className={`${wizardUi.primaryBtn} inline-flex items-center gap-2`}

        disabled={busy || !canRunAi}

        onClick={onRunAi}

        aria-busy={busy || undefined}

      >

        {busy ? (

          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />

        ) : (

          <Sparkles className="h-4 w-4" aria-hidden />

        )}

        {busy

          ? t('requirements.aiPlanningStatus.pending')

          : status === 'ready' || status === 'failed'

            ? t('aiCreateWizard.rerunAi')

            : t('requirements.aiPlanningRun')}

      </button>

      <p className="text-xs text-muted-foreground">{t('requirements.aiPlanningRerunHint')}</p>

    </div>

  );

}



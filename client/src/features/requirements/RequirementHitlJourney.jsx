/**
 * HITL journey stepper — Input → Gate1 → HOW → Gate2 → Create project.
 */
const STEPS = Object.freeze([
  { id: 'intake', labelKey: 'requirements.hitlStepIntake' },
  { id: 'gate1', labelKey: 'requirements.hitlStepGate1' },
  { id: 'how', labelKey: 'requirements.hitlStepHow' },
  { id: 'gate2', labelKey: 'requirements.hitlStepGate2' },
  { id: 'create', labelKey: 'requirements.hitlStepCreate' },
]);

/**
 * @param {{ packStatus?: string, projectPlanStatus?: string, t: Function }} props
 */
export default function RequirementHitlJourney({ packStatus = '', projectPlanStatus = '', t }) {
  const status = String(packStatus || '').trim();
  const plan = String(projectPlanStatus || '').trim();

  let activeIndex = 0;
  if (status === 'under_review') {
    activeIndex = 1;
  } else if (status === 'approved') {
    if (plan === 'confirmed') activeIndex = 4;
    else if (plan === 'ready') activeIndex = 3;
    else activeIndex = 2;
  } else if (status === 'project_linked') {
    activeIndex = 4;
  } else if (status === 'draft') {
    activeIndex = 0;
  }

  return (
    <nav
      aria-label={t('requirements.hitlJourneyLabel') || 'AI Project HITL'}
      className="mb-4 rounded-lg border border-border bg-muted/20 px-3 py-2"
    >
      <ol className="flex flex-wrap items-center gap-1 text-[11px] sm:gap-2 sm:text-xs">
        {STEPS.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          return (
            <li key={step.id} className="flex items-center gap-1 sm:gap-2">
              {i > 0 ? (
                <span className="text-muted-foreground/50" aria-hidden>
                  →
                </span>
              ) : null}
              <span
                className={
                  current
                    ? 'font-semibold text-foreground'
                    : done
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground'
                }
              >
                {t(step.labelKey) || step.id}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

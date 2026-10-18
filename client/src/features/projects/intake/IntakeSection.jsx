import { intakeUi } from './intakeUi';

function statusLabel(status, t) {
  if (status === 'complete') {
    return t('adminTasks.intakeSectionComplete');
  }
  if (status === 'error') {
    return t('adminTasks.intakeSectionNeedsAttention');
  }
  if (status === 'partial') {
    return t('adminTasks.intakeSectionPartial');
  }
  return t('adminTasks.intakeSectionPending');
}

export default function IntakeSection({
  index,
  title,
  subtitle = '',
  status = 'pending',
  statusDetail = '',
  sectionId,
  children,
  t,
}) {
  return (
    <section id={sectionId} className={intakeUi.section} aria-labelledby={`${sectionId}-title`}>
      <div className={intakeUi.sectionHead}>
        <div>
          <p className={intakeUi.sectionIndex}>
            {String(index).padStart(2, '0')}
          </p>
          <h2 id={`${sectionId}-title`} className={intakeUi.sectionTitle}>
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <p
          className={`${intakeUi.sectionStatus} ${
            status === 'complete'
              ? 'text-emerald-700 dark:text-emerald-400'
              : status === 'error'
                ? 'text-destructive'
                : ''
          }`}
        >
          {statusDetail || statusLabel(status, t)}
        </p>
      </div>
      {children}
    </section>
  );
}

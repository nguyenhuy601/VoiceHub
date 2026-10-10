import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { intakeUi } from './intakeUi';
import ProjectSummaryPanel from './ProjectSummaryPanel';

export default function ProjectIntakeLayout({
  formContent,
  form,
  fieldErrors,
  showErrors,
  onIssueClick,
  t,
}) {
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  return (
    <div className={intakeUi.pageGrid}>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className={intakeUi.mainScroll}>
          <div className={intakeUi.mainInner}>{formContent}</div>
        </div>
        <div className={intakeUi.summaryMobileWrap}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground"
            onClick={() => setMobileSummaryOpen((v) => !v)}
            aria-expanded={mobileSummaryOpen}
          >
            {t('adminTasks.intakeSummaryTitle') || 'Project summary'}
            <ChevronDown
              className={`h-4 w-4 transition ${mobileSummaryOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {mobileSummaryOpen ? (
            <div className="mt-3">
              <ProjectSummaryPanel
                form={form}
                fieldErrors={fieldErrors}
                showErrors={showErrors}
                onIssueClick={onIssueClick}
                t={t}
                compact
              />
            </div>
          ) : null}
        </div>
      </div>
      <aside className={`${intakeUi.summaryColumn} hidden lg:block`}>
        <div className={intakeUi.summarySticky}>
          <ProjectSummaryPanel
            form={form}
            fieldErrors={fieldErrors}
            showErrors={showErrors}
            onIssueClick={onIssueClick}
            t={t}
          />
        </div>
      </aside>
    </div>
  );
}

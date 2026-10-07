import { intakeUi } from './intakeUi';
import IntakeSection from './IntakeSection';

export default function AnalysisMethodSection({
  form,
  patchForm,
  fieldError,
  showErrors,
  sectionMeta,
  t,
}) {
  const mode = form.analysisMode === 'ai' ? 'ai' : form.analysisMode === 'manual' ? 'manual' : '';

  const options = [
    {
      id: 'manual',
      title: t('adminTasks.wizardModeManual') || 'Manual',
      hint:
        t('adminTasks.intakeModeManualHint') ||
        'BA phân tích yêu cầu thủ công từ tài liệu khách hàng.',
    },
    {
      id: 'ai',
      title: t('adminTasks.intakeModeAiTitle') || 'AI-assisted',
      hint:
        t('adminTasks.intakeModeAiHint') ||
        'AI chuẩn bị đề xuất phân tích từ nguồn đã tải. BA rà soát và phê duyệt trước khi thành requirement chính thức.',
      bullets: [
        t('adminTasks.intakeModeAiBullet1') || 'Phân tích ban đầu nhanh hơn',
        t('adminTasks.intakeModeAiBullet2') || 'Đề xuất có thể truy vết',
      ],
    },
  ];

  const sectionStatus =
    sectionMeta?.hint === 'error' ? 'error' : sectionMeta?.complete ? 'complete' : 'pending';

  return (
    <IntakeSection
      index={4}
      sectionId="intake-section-analysis"
      title={t('adminTasks.intakeSectionAnalysis') || 'Analysis method'}
      subtitle={
        t('adminTasks.intakeSectionAnalysisHint') ||
        'Chọn cách phân tích yêu cầu — AI đề xuất, con người quyết định.'
      }
      status={sectionStatus}
      t={t}
    >
      <div
        id="intake-field-analysisMode"
        className={intakeUi.modeGrid}
        role="radiogroup"
        aria-label={t('adminTasks.wizardModeTitle') || 'Analysis Mode'}
      >
        {options.map((opt) => {
          const selected = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => patchForm({ analysisMode: opt.id })}
              className={`${intakeUi.modeCard} ${selected ? intakeUi.modeCardSelected : ''} ${
                showErrors && fieldError && !selected ? 'border-border' : ''
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{opt.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{opt.hint}</p>
              {opt.bullets?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {opt.bullets.map((line) => (
                    <li key={line} className="flex gap-1.5">
                      <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('adminTasks.intakeModeGovernance') ||
          'AI-assisted không tự động phê duyệt requirement — BA review và Gate 1 vẫn bắt buộc.'}
      </p>
      {showErrors && fieldError ? <p className={intakeUi.fieldError}>{fieldError}</p> : null}
    </IntakeSection>
  );
}

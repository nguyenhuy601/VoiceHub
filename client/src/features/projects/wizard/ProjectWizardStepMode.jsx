import { wizardUi } from './projectWizardUi';

/** Step Analysis Mode — Manual vs AI. */
export default function ProjectWizardStepMode({ form, patchForm, t }) {
  const mode = form.analysisMode === 'ai' ? 'ai' : form.analysisMode === 'manual' ? 'manual' : '';

  const options = [
    {
      id: 'manual',
      title: t('adminTasks.wizardModeManual') || 'Manual',
      hint:
        t('adminTasks.wizardModeManualHint') ||
        'BA phân tích yêu cầu thủ công từ tài liệu khách hàng.',
    },
    {
      id: 'ai',
      title: t('adminTasks.wizardModeAi') || 'AI',
      hint:
        t('adminTasks.wizardModeAiHint') ||
        'AI hỗ trợ phân tích yêu cầu từ input gốc (sau khi tạo draft).',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className={wizardUi.title}>
          {t('adminTasks.wizardModeTitle') || 'Analysis Mode'}
        </h1>
        <p className={wizardUi.subtitle}>
          {t('adminTasks.wizardModeHint') ||
            'Chọn cách phân tích yêu cầu cho dự án này. Có thể đổi quy trình sau khi tạo draft.'}
        </p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label={t('adminTasks.wizardModeTitle')}>
        {options.map((opt) => {
          const selected = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => patchForm({ analysisMode: opt.id })}
              className={`w-full rounded-xl border p-4 text-left transition ${
                selected
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border bg-surface/60 hover:border-primary/40'
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{opt.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

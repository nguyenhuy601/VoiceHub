const STEPS = [
  { step: 1, labelKey: 'requirements.phase1Step1', fallback: 'Input Sources', substeps: ['prepare'] },
  {
    step: 2,
    labelKey: 'requirements.phase1Step2',
    fallback: 'Requirement Understanding',
    substeps: ['parse', 'normalize', 'extract', 'filter', 'quality', 'gate_preview'],
  },
  {
    step: 3,
    labelKey: 'requirements.phase1Step3',
    fallback: 'Semantic Fetch',
    substeps: ['semantic', 'conflict'],
  },
  {
    step: 4,
    labelKey: 'requirements.phase1Step4',
    fallback: 'Agentic Orchestration',
    substeps: ['validate', 'synthesis', 'evidence', 'feasibility'],
  },
  { step: 5, labelKey: 'requirements.phase1Step5', fallback: 'Human Review (Gate 1)', substeps: [] },
  { step: 6, labelKey: 'requirements.phase1Step6', fallback: 'Approved SRS', substeps: [] },
];

const SUBSTEP_FALLBACK = {
  prepare: 'Nạp SRS pack',
  parse: 'Parsing',
  normalize: 'Chuẩn hóa',
  extract: 'Bóc tách',
  filter: 'Lọc dữ liệu',
  quality: 'Kiểm tra chất lượng dữ liệu',
  gate_preview: 'Xem dữ liệu đã xử lý',
  semantic: 'Semantic projection',
  conflict: 'Phân tích conflict',
  validate: 'Validate quan hệ',
  synthesis: 'Tổng hợp',
  evidence: 'Evidence',
  feasibility: 'Feasibility',
};

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

export default function Phase1AiRequirementProgress({ step = 0, substep = null, t }) {
  const current = Number(step) || 0;
  if (current < 1) return null;
  const active = STEPS.find((item) => item.step === current) || STEPS[0];
  const substepIndex = active.substeps.indexOf(substep);
  const fraction =
    active.substeps.length > 0 && substepIndex >= 0
      ? (substepIndex + 1) / active.substeps.length
      : current >= 6
        ? 1
        : 0.35;
  const percent = Math.min(100, Math.round(((current - 1 + fraction) / STEPS.length) * 100));

  return (
    <div className="mt-3" aria-live="polite">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{labelOf(t, 'requirements.phase1ProgressLabel', 'Tiến trình AI Requirement')}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <ol className="mt-2 flex flex-wrap gap-1.5">
        {STEPS.map((item) => {
          const done = item.step < current;
          const isCurrent = item.step === current;
          return (
            <li
              key={item.step}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : done
                    ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {item.step}. {labelOf(t, item.labelKey, item.fallback)}
            </li>
          );
        })}
      </ol>
      {active.substeps.length ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {active.substeps.map((id) => {
            const idx = active.substeps.indexOf(id);
            const done = substepIndex > idx;
            const isCurrent = id === substep;
            return (
              <li
                key={id}
                className={
                  isCurrent
                    ? 'font-medium text-foreground'
                    : done
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground'
                }
              >
                {isCurrent ? '● ' : done ? '✓ ' : '○ '}
                {labelOf(t, `requirements.phase1Substep_${id}`, SUBSTEP_FALLBACK[id] || id)}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

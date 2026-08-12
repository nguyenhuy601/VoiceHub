import { CheckCircle2, Sparkles } from 'lucide-react';
import { FIGMA_DOC_OCR } from './figmaDocumentsClasses';
import { useAppStrings } from '../../locales/appStrings';

const STEPS = [
  { key: 'documents.ocrStepRecognize', threshold: 33 },
  { key: 'documents.ocrStepAnalyze', threshold: 66 },
  { key: 'documents.ocrStepExtract', threshold: 99 },
];

export default function DocumentOcrProgressBar({ progress = 0 }) {
  const { t } = useAppStrings();
  const pct = Math.min(Math.round(Number(progress) || 0), 99);

  return (
    <div className={FIGMA_DOC_OCR}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-primary to-info">
          <Sparkles size={11} className="text-white" />
        </div>
        <span className="flex-1 text-xs font-semibold text-primary">
          {t('documents.ocrProcessing')}
        </span>
        <span className="text-[0.6875rem] font-bold text-primary">{pct}%</span>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-info to-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-3">
        {STEPS.map((step) => {
          const done = pct >= step.threshold;
          return (
            <div key={step.key} className="flex items-center gap-1">
              <div
                className={`flex h-3 w-3 items-center justify-center rounded-full ${
                  done ? 'bg-success/15' : 'bg-muted'
                }`}
              >
                {done && <CheckCircle2 size={8} className="text-success" />}
              </div>
              <span
                className={`text-[0.625rem] ${done ? 'font-semibold text-success' : 'text-muted-foreground'}`}
              >
                {t(step.key)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

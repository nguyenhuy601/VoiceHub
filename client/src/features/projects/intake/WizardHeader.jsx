import { ArrowLeft } from 'lucide-react';
import { intakeUi } from './intakeUi';

export default function WizardHeader({ backLabel, onBack, title, subtitle }) {
  return (
    <header className={intakeUi.header}>
      <button type="button" onClick={onBack} className={intakeUi.backLink}>
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </button>
      <div className="mt-4">
        <h1 className={intakeUi.pageTitle}>{title}</h1>
        {subtitle ? <p className={intakeUi.pageSubtitle}>{subtitle}</p> : null}
      </div>
    </header>
  );
}

import React from 'react';
import { useLocale } from '../../../../context/LocaleContext';
import {
  formatCustomerRawFormIssues,
  isCustomerRawFormOk,
} from '../../../../utils/customerRawFormSummary';

/**
 * Customer Raw form check panel (sheets + headers only).
 */
export default function CustomerRawFormPanel({ formValidation, className = '' }) {
  const { t } = useLocale();
  if (!formValidation) return null;

  const ok = isCustomerRawFormOk(formValidation);
  const issues = formatCustomerRawFormIssues(formValidation, t);

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        ok
          ? 'border-emerald-500/40 bg-emerald-500/5 text-foreground'
          : 'border-destructive/40 bg-destructive/5 text-foreground'
      } ${className}`}
      data-testid="customer-raw-form-panel"
    >
      <p className="font-medium">
        {ok
          ? t('workspace.phase1RawFormOk') || 'Form template Raw: OK'
          : t('workspace.phase1RawFormInvalid') || 'Form template Raw: chưa đúng'}
      </p>
      {ok ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('workspace.phase1RawFormOkHint') ||
            'Đủ sheet và cột theo Customer Requirement Raw. Nội dung từng dự án không bị ràng buộc quota.'}
        </p>
      ) : (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {issues.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {ok && Array.isArray(formValidation.presentSheets) && formValidation.presentSheets.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {(t('workspace.phase1RawFormSheets') || 'Sheets: {list}').replace(
            '{list}',
            formValidation.presentSheets.join(', ')
          )}
        </p>
      ) : null}
    </div>
  );
}

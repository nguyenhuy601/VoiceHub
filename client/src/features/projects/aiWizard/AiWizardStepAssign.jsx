import { useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { wizardUi } from '../wizard/projectWizardUi';
import { formatAiPlanningSuggestionProfile } from '../../../utils/aiPlanningSuggestionDisplay';
import ConfirmDialog from '../../../components/Shared/ConfirmDialog';
import AiPlanningRunningBanner from '../../requirements/AiPlanningRunningBanner';

function readAssignStatus(overlay = {}) {
  const llm = overlay?.llm && typeof overlay.llm === 'object' ? overlay.llm : {};
  return String(llm.assignStatus || llm.enrichStatus || '');
}

function readAssignError(overlay = {}) {
  const llm = overlay?.llm && typeof overlay.llm === 'object' ? overlay.llm : {};
  return llm.assignError || llm.enrichError || null;
}

/**
 * Step 4 — per execution leaf assignee suggestions (Story/Task/Subtask).
 */
export default function AiWizardStepAssign({
  overlay = {},
  leafAssignMap = {},
  roleFilter = '',
  onRoleFilterChange,
  onAssignChange,
  onApplyAiSuggestions,
  onRunLeafAssign,
  canRunLeafAssign = false,
  busy = false,
  assignBusy = false,
  t,
}) {
  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);
  const leafRows = Array.isArray(overlay.leafAssignments) ? overlay.leafAssignments : [];
  const roles = [...new Set(leafRows.map((r) => r.roleKey).filter(Boolean))].sort();
  const assignStatus = readAssignStatus(overlay);
  const assignError = readAssignError(overlay);

  const filtered =
    roleFilter
      ? leafRows.filter((r) => String(r.roleKey || '') === roleFilter)
      : leafRows;

  const assignedCount = leafRows.filter((r) => {
    const ext = String(r.externalId || '').trim();
    return ext && String(leafAssignMap[ext] || '').trim();
  }).length;

  const showAssignCta =
    canRunLeafAssign &&
    leafRows.length > 0 &&
    (assignStatus === 'pending' ||
      assignStatus === 'failed' ||
      assignStatus === 'ready' ||
      assignStatus === 'partial' ||
      assignStatus === 'skipped' ||
      assignStatus === '');

  const assignCtaLabel =
    (assignStatus === 'ready' || assignStatus === 'partial') && !assignBusy
      ? t('aiCreateWizard.assignAiRerun')
      : assignBusy
        ? t('aiCreateWizard.assignAiRunning')
        : t('aiCreateWizard.assignAiRun');

  const anyBusy = busy || assignBusy;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={wizardUi.title}>{t('aiCreateWizard.assignTitle')}</h1>
        <p className={wizardUi.subtitle}>{t('aiCreateWizard.assignSubtitle')}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('aiCreateWizard.assignProgress', { assigned: assignedCount, total: leafRows.length })}
        </p>
      </div>

      {showAssignCta ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t('aiCreateWizard.assignAiHint')}</p>
          {assignBusy ? <AiPlanningRunningBanner t={t} /> : null}
          <button
            type="button"
            className={`${wizardUi.secondaryBtn} inline-flex items-center gap-1.5`}
            disabled={anyBusy}
            onClick={() => setAssignConfirmOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {assignCtaLabel}
          </button>
          {assignStatus === 'partial' ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('aiCreateWizard.assignAiPartial')}
            </p>
          ) : null}
          {assignStatus === 'failed' && assignError ? (
            <p className="text-xs text-destructive">{String(assignError)}</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={assignConfirmOpen}
        onClose={() => setAssignConfirmOpen(false)}
        onConfirm={() => {
          if (typeof onRunLeafAssign === 'function') {
            void onRunLeafAssign();
          }
        }}
        title={t('aiCreateWizard.assignAiConfirmTitle')}
        message={t('aiCreateWizard.assignAiConfirmMessage')}
        confirmText={t('aiCreateWizard.assignAiConfirm')}
        cancelText={t('common.cancel')}
      />

      {leafRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('aiCreateWizard.assignNoLeaves')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="assign-role-filter">
              {t('aiCreateWizard.assignFilterRole')}
            </label>
            <select
              id="assign-role-filter"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              value={roleFilter}
              onChange={(e) => onRoleFilterChange?.(e.target.value)}
              disabled={anyBusy}
            >
              <option value="">{t('aiCreateWizard.assignFilterAll')}</option>
              {roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button
              type="button"
              className={`${wizardUi.secondaryBtn} inline-flex items-center gap-1.5 text-xs`}
              onClick={onApplyAiSuggestions}
              disabled={anyBusy}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('aiCreateWizard.assignApplyAi')}
            </button>
          </div>

          <ul className="space-y-2 max-h-[min(52vh,520px)] overflow-y-auto pr-1">
            {filtered.map((row) => {
              const ext = String(row.externalId || '').trim();
              const suggestions = Array.isArray(row.suggestions) ? row.suggestions : [];
              const value = leafAssignMap[ext] || '';
              const topRationale = suggestions[0]?.rationale;
              return (
                <li
                  key={ext}
                  className="rounded-lg border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {row.level}
                      </span>
                      <p className="mt-1 text-sm font-medium text-foreground truncate">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.roleKey}
                        {row.estimateHours != null ? ` · ${row.estimateHours}h` : ''}
                        {row.assignSkipReason === 'budget_exhausted'
                          ? ` · ${t('aiCreateWizard.assignAiBudgetSkip')}`
                          : ''}
                      </p>
                      {topRationale ? (
                        <p className="mt-1 text-xs text-muted-foreground opacity-90">— {topRationale}</p>
                      ) : null}
                    </div>
                    <select
                      className="shrink-0 max-w-[min(100%,220px)] rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      value={value}
                      onChange={(e) => onAssignChange?.(ext, e.target.value)}
                      disabled={anyBusy}
                      aria-label={t('aiCreateWizard.assignSelectLabel', { name: row.name })}
                    >
                      <option value="">{t('aiCreateWizard.assignUnassigned')}</option>
                      {suggestions.map((s) => {
                        const profileLine = formatAiPlanningSuggestionProfile(s, t);
                        return (
                          <option key={s.userId} value={s.userId}>
                            {s.displayName || s.userId}
                            {profileLine ? ` — ${profileLine}` : ''}
                            {s.score != null ? ` (${s.score})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

import { intakeUi } from './intakeUi';

function moveRole(order, roleKey, direction) {
  const next = order.slice();
  const index = next.indexOf(roleKey);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return order;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export default function GateReviewModeFields({
  processKey,
  roleKeys,
  labelByKey,
  plan,
  onChange,
  fieldError,
  showErrors,
  t,
}) {
  if (roleKeys.length < 2) return null;
  const mode = plan?.mode === 'parallel' || plan?.mode === 'sequential' ? plan.mode : '';
  const order = Array.isArray(plan?.order) && plan.order.length ? plan.order : roleKeys;
  const parallel = new Set(plan?.parallelRoleKeys || []);

  return (
    <div id={`intake-field-${processKey}-review`} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-sm font-medium text-foreground">{t('adminTasks.intakeReviewModeTitle')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name={`gate-review-${processKey}`}
            checked={mode === 'sequential'}
            onChange={() => onChange(processKey, { mode: 'sequential', order: roleKeys })}
          />
          {t('adminTasks.intakeReviewSequential')}
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name={`gate-review-${processKey}`}
            checked={mode === 'parallel'}
            onChange={() => onChange(processKey, { mode: 'parallel' })}
          />
          {t('adminTasks.intakeReviewParallel')}
        </label>
      </div>

      {mode === 'sequential' ? (
        <ol className="space-y-2">
          {order.map((roleKey, index) => {
            const isFinal = index === order.length - 1;
            return (
              <li key={roleKey} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm text-foreground">
                  {index + 1}. {labelByKey.get(roleKey) || roleKey}
                  {isFinal ? (
                    <span className="ml-2 text-xs font-medium text-primary">{t('adminTasks.intakeFinalApprover')}</span>
                  ) : null}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className={intakeUi.secondaryBtn}
                    disabled={index === 0}
                    onClick={() => onChange(processKey, { mode: 'sequential', order: moveRole(order, roleKey, -1) })}
                  >
                    {t('adminTasks.intakeReviewMoveUp')}
                  </button>
                  <button
                    type="button"
                    className={intakeUi.secondaryBtn}
                    disabled={isFinal}
                    onClick={() => onChange(processKey, { mode: 'sequential', order: moveRole(order, roleKey, 1) })}
                  >
                    {t('adminTasks.intakeReviewMoveDown')}
                  </button>
                </span>
              </li>
            );
          })}
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeSequentialHint')}</p>
        </ol>
      ) : null}

      {mode === 'parallel' ? (
        <div className="space-y-3">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-muted-foreground">{t('adminTasks.intakeParallelRoles')}</legend>
            {roleKeys.map((roleKey) => (
              <label key={roleKey} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={parallel.has(roleKey)}
                  onChange={() => {
                    const next = new Set(parallel);
                    if (next.has(roleKey)) next.delete(roleKey);
                    else next.add(roleKey);
                    onChange(processKey, { mode: 'parallel', parallelRoleKeys: [...next] });
                  }}
                />
                {labelByKey.get(roleKey) || roleKey}
              </label>
            ))}
          </fieldset>
          <label className="block text-xs font-medium text-muted-foreground">
            {t('adminTasks.intakeSynthesisRole')}
            <select
              className={`${intakeUi.select} mt-1`}
              value={plan?.synthesisRoleKey || ''}
              onChange={(event) => onChange(processKey, { mode: 'parallel', synthesisRoleKey: event.target.value })}
            >
              <option value="">{t('adminTasks.intakePickRole')}</option>
              {roleKeys.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {labelByKey.get(roleKey) || roleKey}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            {t('adminTasks.intakeFinalRole')}
            <select
              className={`${intakeUi.select} mt-1`}
              value={plan?.finalRoleKey || ''}
              onChange={(event) => onChange(processKey, { mode: 'parallel', finalRoleKey: event.target.value })}
            >
              <option value="">{t('adminTasks.intakePickRole')}</option>
              {roleKeys.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {labelByKey.get(roleKey) || roleKey}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{t('adminTasks.intakeParallelHint')}</p>
        </div>
      ) : null}

      {showErrors && fieldError ? <p className={intakeUi.fieldError}>{fieldError}</p> : null}
    </div>
  );
}

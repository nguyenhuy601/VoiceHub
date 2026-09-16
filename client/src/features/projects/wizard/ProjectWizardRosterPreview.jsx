import { PROJECT_ROLE_LABELS } from '../../../utils/roleTaxonomy';
import { wizardUi } from './projectWizardUi';
import {
  INTAKE_LEAD_ROLE_KEYS,
  INTAKE_LEAD_LABEL_KEYS,
  emptyIntakeSlots,
} from './projectWizardIntakeRoles';

function roleLabel(key, catalogRoles = [], t) {
  const k = String(key || '').trim();
  if (!k) return '—';
  const row = (catalogRoles || []).find((r) => String(r.key || r.id || '') === k);
  if (row?.label) return String(row.label);
  if (INTAKE_LEAD_LABEL_KEYS[k] && t) return t(INTAKE_LEAD_LABEL_KEYS[k]);
  return PROJECT_ROLE_LABELS[k] || k;
}

/**
 * Bước Roster: 3 dòng intake (PO / PM / BA) + × gỡ từng slot.
 */
export default function ProjectWizardRosterPreview({
  title = '',
  projectCode = '',
  intakeSlots,
  seedMembers = [],
  catalogRoles = [],
  onClearSlot,
  onRemoveMember,
  t,
}) {
  const slots = { ...emptyIntakeSlots(), ...(intakeSlots || {}) };
  const displayTitle = String(title || '').trim() || t('workspace.projectHubUntitled');
  const filledCount = INTAKE_LEAD_ROLE_KEYS.filter((k) => String(slots[k]?.userId || '').trim())
    .length;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface/80">
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-lg font-semibold text-foreground">{displayTitle}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{projectCode || '—'}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('adminTasks.wizardPreviewMembersHint')} · {filledCount}/3
        </p>
      </div>
      <div className="max-h-full overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('adminTasks.wizardPreviewColRole')}</th>
              <th className="px-4 py-2 font-medium">{t('adminTasks.wizardPreviewColName')}</th>
              {onClearSlot || onRemoveMember ? (
                <th className="w-12 px-2 py-2">
                  <span className="sr-only">{t('common.delete')}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {INTAKE_LEAD_ROLE_KEYS.map((roleKey) => {
              const slot = slots[roleKey];
              const userId = String(slot?.userId || '').trim();
              const name = userId
                ? String(slot?.displayName || '').trim() || userId.slice(-6)
                : t('adminTasks.wizardPreviewSlotEmpty');
              return (
                <tr key={roleKey} className="border-t border-border text-foreground">
                  <td className="px-4 py-2 text-muted-foreground">
                    {roleLabel(roleKey, catalogRoles, t)}
                  </td>
                  <td className="px-4 py-2">{name}</td>
                  {onClearSlot || onRemoveMember ? (
                    <td className="px-2 py-2">
                      {userId ? (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            onClearSlot ? onClearSlot(roleKey) : onRemoveMember(userId)
                          }
                          aria-label={t('common.delete')}
                        >
                          ×
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filledCount && Array.isArray(seedMembers) && !seedMembers.length ? (
        <p className={`${wizardUi.previewHint} px-4 py-2`}>{t('adminTasks.wizardPreviewMembersEmpty')}</p>
      ) : null}
    </div>
  );
}

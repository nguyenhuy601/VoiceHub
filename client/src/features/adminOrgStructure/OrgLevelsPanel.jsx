/** Huy: Organizational Levels — deep-link read-only sau setup một lần (modal). */
import { Navigate } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { ORG_STRUCTURE_TEMPLATE_META } from '../../config/orgStructureTemplates';
import { useAppStrings } from '../../locales/appStrings';
import useOrgStructureLevels from '../../hooks/useOrgStructureLevels';

function resolveLevelLabel(level, t) {
  const key = String(level?.key || '').trim().toLowerCase();
  if (key) {
    const path = `adminOrg.levelKeys.${key}`;
    const translated = t(path);
    if (translated && translated !== path) return translated;
  }
  const fallback = String(level?.label || level?.key || '').trim();
  return fallback || '—';
}

function resolveTemplateLabel(templateId, t) {
  const id = String(templateId || '').trim();
  if (!id) return '';
  const meta = ORG_STRUCTURE_TEMPLATE_META[id];
  if (meta?.labelKey) {
    const translated = t(meta.labelKey);
    if (translated && translated !== meta.labelKey) return translated;
  }
  return t('adminOrg.templateUnknown');
}

export default function OrgLevelsPanel({ orgId }) {
  const { t } = useAppStrings();
  const { schemaLevels: levels, templateId, setupCompleted, loading } = useOrgStructureLevels(orgId);

  if (setupCompleted === false) {
    return <Navigate to="/app/admin/org-structure" replace />;
  }

  const templateLabel = resolveTemplateLabel(templateId, t);

  return (
    <AdminUserPanelShell
      title={t('adminOrg.levelsLockedTitle')}
      hint={t('adminOrg.levelsLockedHint')}
      wide
    >
      <AdminUserFormCard title={t('adminOrg.levelsTitle')}>
        {loading || setupCompleted === null ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="space-y-2 text-sm">
            {templateId ? (
              <p className="text-muted-foreground">
                {t('adminOrg.template')}:{' '}
                <span className="text-foreground" title={templateId}>
                  {templateLabel}
                </span>
              </p>
            ) : null}
            <ul className="list-inside list-disc">
              {levels.map((level) => {
                const key = String(level.key || '').trim();
                return (
                  <li key={key || level.label}>
                    <span title={key || undefined}>{resolveLevelLabel(level, t)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

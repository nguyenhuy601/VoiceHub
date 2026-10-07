/** Huy: Organizational Levels — deep-link read-only sau setup một lần (modal). */
import { Navigate } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { ORG_STRUCTURE_TEMPLATE_META } from '../../config/orgStructureTemplates';
import { useAppStrings } from '../../locales/appStrings';
import useOrgStructureLevels from '../../hooks/useOrgStructureLevels';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';

/** Domain index `/app/admin/org-structure` chuyển về item đầu (`levels`) → không dùng làm đích, tránh vòng lặp. */
const ORG_STRUCTURE_FALLBACK_PATH = '/app/admin/org-structure/departments';

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
  const {
    schemaLevels: levels,
    templateId,
    setupCompleted,
    loading,
    error,
    reload,
  } = useOrgStructureLevels(orgId);

  if (setupCompleted === false) {
    return <Navigate to={ORG_STRUCTURE_FALLBACK_PATH} replace />;
  }

  const templateLabel = resolveTemplateLabel(templateId, t);

  return (
    <AdminUserPanelShell
      title={t('adminOrg.levelsLockedTitle')}
      hint={t('adminOrg.levelsLockedHint')}
      wide
    >
      <AdminUserFormCard title={t('adminOrg.levelsTitle')}>
        {error ? (
          <AdminLoadErrorState
            message={resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') })}
            onRetry={() => reload()}
          />
        ) : loading || setupCompleted === null ? (
          <AdminListSkeleton rows={3} />
        ) : !levels.length ? (
          <AdminEmptyState message={t('adminOrg.emptyList')} />
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

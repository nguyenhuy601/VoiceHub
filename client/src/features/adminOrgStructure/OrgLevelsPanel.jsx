/** Huy: Organizational Levels — deep-link read-only sau setup một lần (modal). */
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { ORG_STRUCTURE_TEMPLATE_META } from '../../config/orgStructureTemplates';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapOrgApi } from '../../utils/adminOrgStructureUtils';

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
  const [levels, setLevels] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [setupCompleted, setSetupCompleted] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const lvlRes = await organizationAPI.getStructureLevels(orgId);
      const schema = unwrapOrgApi(lvlRes);
      setLevels(Array.isArray(schema?.levels) ? schema.levels : []);
      setTemplateId(schema?.templateId || '');
      setSetupCompleted(Boolean(schema?.setupCompleted));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') }));
      setSetupCompleted(false);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

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

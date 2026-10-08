import { useCallback, useEffect, useState } from 'react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Backup / restore ops panel — links runbook (Wave B).
 */
export default function BackupOpsPanel() {
  const { t } = useAppStrings();
  return (
    <AdminUserPanelShell title={t('adminDomains.backup.backup')} hint={t('adminTasks.backupHint')} wide>
      <AdminUserFormCard title={t('adminTasks.backupRunbookTitle')}>
        <p className="mb-3 text-sm text-muted-foreground">{t('adminTasks.backupRunbookBody')}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
          <li>{t('adminTasks.backupTipAtlas')}</li>
          <li>{t('adminTasks.backupTipEnv')}</li>
          <li>{t('adminTasks.backupTipRetention')}</li>
        </ul>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

/**
 * Wave C — MFA / SSO / IP stubs (no auth flow change).
 */
const FLAG_KEYS_BY_FOCUS = {
  mfa: ['mfa', 'webauthn'],
  ip: ['ip'],
};

export function SecurityWaveCStubPanel({ embedded = false, focus, orgId }) {
  const { t } = useAppStrings();
  const [flags, setFlags] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.getSecurityFlags(orgId);
      setFlags(unwrap(res));
    } catch (error) {
      setFlags(null);
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.securityFlagsLoadFail') }));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const flagRows = [
    ['mfa', t('adminTasks.securityFlagMfa'), flags?.mfa],
    ['sso', t('adminTasks.securityFlagSso'), flags?.sso],
    ['ip', t('adminTasks.securityFlagIpAllowlist'), flags?.ipAllowlist],
    ['webauthn', t('adminTasks.securityFlagWebauthn'), flags?.webauthn],
  ].filter(([key]) => !FLAG_KEYS_BY_FOCUS[focus] || FLAG_KEYS_BY_FOCUS[focus].includes(key));

  const body = (
      <AdminUserFormCard title={focus ? t('adminTasks.securityWaveCTitle') : t('adminTasks.securityFlagsTitle')}>
        <p className="mb-3 text-sm text-muted-foreground" role="note">
          {t('adminSecurity.notImplementedNote')}
        </p>
        {loadError ? (
          <p role="alert" className="mb-3 rounded-lg border border-destructive px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        {loading && !flags ? (
          <p className="text-sm text-muted-foreground" role="status">{t('common.loading')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {flagRows.map(([key, label, on]) => (
              <li key={key} className="flex justify-between rounded-lg border border-border px-3 py-2">
                <span>{label}</span>
                <span className={`text-xs font-medium ${on ? 'text-success' : 'text-muted-foreground'}`}>
                  {on ? t('adminTasks.securityFlagEnabled') : t('adminTasks.securityFlagOff')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={`${adminSecondaryBtnClass()} mt-3`}
          onClick={load}
          disabled={loading}
          aria-busy={loading}
        >
          {loadError ? t('common.retry') : loading ? t('common.loading') : t('common.refresh')}
        </button>
      </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminTasks.securityWaveCTitle')}
      hint={t('adminTasks.securityWaveCHint')}
      wide
    >
      {body}
    </AdminUserPanelShell>
  );
}

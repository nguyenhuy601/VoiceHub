import { useCallback, useEffect, useState } from 'react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';

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
        <p className="font-mono text-xs text-muted-foreground">
          devops/swarm/backup-retention-runbook.md
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
export function SecurityWaveCStubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [flags, setFlags] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await projectAPI.getSecurityFlags();
      setFlags(unwrap(res));
    } catch {
      setFlags({
        mfa: false,
        sso: false,
        ipAllowlist: false,
        status: 'deferred',
        note: t('adminTasks.securityWaveCNote'),
      });
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminUserPanelShell
      title={t('adminTasks.securityWaveCTitle')}
      hint={t('adminTasks.securityWaveCHint')}
      wide
    >
      <AdminUserFormCard title={t('adminTasks.securityFlagsTitle')}>
        <p className="mb-3 text-sm text-muted-foreground">
          {flags?.note || t('adminTasks.securityWaveCNote')}
        </p>
        <ul className="space-y-2 text-sm">
          {[
            ['MFA', flags?.mfa],
            ['SSO / LDAP / AD', flags?.sso],
            ['IP allowlist', flags?.ipAllowlist],
            ['WebAuthn', flags?.webauthn],
          ].map(([label, on]) => (
            <li key={label} className="flex justify-between rounded-lg border border-border px-3 py-2">
              <span>{label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {on ? 'enabled (stub)' : 'off (deferred)'}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className={`${adminSecondaryBtnClass()} mt-3`} onClick={load}>
          {t('common.refresh') || 'Refresh'}
        </button>
        {orgId ? (
          <p className="mt-2 text-[10px] text-muted-foreground">org: {orgId}</p>
        ) : null}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

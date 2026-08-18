import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Retention policy + stub job (Phase 6 Wave B).
 */
export default function RetentionPolicyPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [settings, setSettings] = useState(null);
  const [archivedCount, setArchivedCount] = useState(0);
  const [archiveInactiveAfterDays, setArchiveInactiveAfterDays] = useState(90);
  const [defaultRetentionDays, setDefaultRetentionDays] = useState(365);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stubResult, setStubResult] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectAPI.getRetentionPolicy(orgId);
      const data = unwrap(res);
      const s = data?.settings || {};
      setSettings(s);
      setArchivedCount(Number(data?.archivedCount || 0));
      setArchiveInactiveAfterDays(Number(s.archiveInactiveAfterDays ?? 90));
      setDefaultRetentionDays(Number(s.defaultRetentionDays ?? 365));
      setNotes(String(s.notes || ''));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.retentionLoadFail') })
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await projectAPI.updateRetentionPolicy(orgId, {
        archiveInactiveAfterDays,
        defaultRetentionDays,
        notes,
      });
      toast.success(t('adminTasks.retentionSaved'));
      await load();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.retentionSaveFail') })
      );
    } finally {
      setSaving(false);
    }
  };

  const runStub = async () => {
    try {
      const res = await projectAPI.runRetentionStub(orgId, { dryRun: true });
      setStubResult(unwrap(res));
      toast.success(t('adminTasks.retentionStubOk'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.retentionStubFail') })
      );
    }
  };

  const body =
    loading && !settings ? (
      <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
    ) : (
      <div className="grid gap-4 lg:grid-cols-2">
          <AdminUserFormCard title={t('adminTasks.retentionPolicyTitle')}>
            <label className="mb-3 block text-xs font-semibold">
              archiveInactiveAfterDays
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={archiveInactiveAfterDays}
                onChange={(e) => setArchiveInactiveAfterDays(Number(e.target.value))}
              />
            </label>
            <label className="mb-3 block text-xs font-semibold">
              defaultRetentionDays
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={defaultRetentionDays}
                onChange={(e) => setDefaultRetentionDays(Number(e.target.value))}
              />
            </label>
            <label className="mb-3 block text-xs font-semibold">
              notes
              <textarea
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <p className="mb-3 text-xs text-muted-foreground">
              {`${t('adminTasks.retentionArchivedCount')}`.replace('{{n}}', String(archivedCount))}
            </p>
            <button type="button" className={adminPrimaryBtnClass()} disabled={saving} onClick={save}>
              {saving ? '…' : t('common.save')}
            </button>
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminTasks.retentionStubTitle')}>
            <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.retentionStubHint')}</p>
            <p className="mb-3 font-mono text-[11px] text-muted-foreground">
              devops/swarm/backup-retention-runbook.md
            </p>
            <button type="button" className={adminSecondaryBtnClass()} onClick={runStub}>
              {t('adminTasks.retentionRunStub')}
            </button>
            {stubResult ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[10px]">
                {JSON.stringify(stubResult, null, 2)}
              </pre>
            ) : null}
          </AdminUserFormCard>
        </div>
      );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.systemConfig.retention')}
      hint={t('adminTasks.retentionHint')}
      wide
    >
      {body}
    </AdminUserPanelShell>
  );
}

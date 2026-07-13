/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberUserId } from '../../utils/adminUserUtils';

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

export default function PosDisablePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const titleParam = String(searchParams.get('title') || '').trim();
  const { members, loading, loadMembers } = useAdminMembers(orgId);
  const [title, setTitle] = useState(titleParam);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (titleParam) setTitle(titleParam);
  }, [titleParam]);

  const titles = useMemo(() => {
    const set = new Set();
    for (const m of members) {
      const jobTitle = memberJobTitle(m);
      if (jobTitle) set.add(jobTitle);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [members]);

  const confirm = async () => {
    if (!orgId || !title || busy) return;
    const targets = members.filter((m) => memberJobTitle(m) === title);
    setBusy(true);
    try {
      await Promise.all(
        targets.map((m) => adminUserAPI.patchProfile(orgId, memberUserId(m), { jobTitle: '' }))
      );
      toast.success(t('adminOrg.posCleared'));
      setOpen(false);
      setTitle('');
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posClearFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.posDisable')}
      hint={t('adminOrg.posDisableHint')}
    >
      <AdminUserFormCard danger>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="mx-auto max-w-lg space-y-4">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
              <select
                className={adminInputClass()}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              >
                <option value="">{t('adminOrg.selectTitle')}</option>
                {titles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!title}
              className={adminDangerBtnClass()}
              onClick={() => setOpen(true)}
            >
              {t('adminOrg.posDisableAction')}
            </button>
          </div>
        )}
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminDomains.orgStructure.posDisable')}
        message={t('adminOrg.posClearConfirm', { name: title })}
        confirmText={t('adminOrg.posDisableAction')}
        cancelText={t('common.cancel')}
      />
    </AdminUserPanelShell>
  );
}

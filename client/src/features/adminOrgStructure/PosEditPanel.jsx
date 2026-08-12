/** Position (HR) — admin RBAC */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberUserId } from '../../utils/adminUserUtils';

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

export default function PosEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const titleParam = String(searchParams.get('title') || '').trim();
  const { members, loading, loadMembers } = useAdminMembers(orgId);
  const [oldTitle, setOldTitle] = useState(titleParam);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (titleParam) setOldTitle(titleParam);
  }, [titleParam]);

  const titles = useMemo(() => {
    const set = new Set();
    for (const m of members) {
      const title = memberJobTitle(m);
      if (title) set.add(title);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [members]);

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    const from = String(oldTitle || '').trim();
    const to = String(newTitle || '').trim();
    if (!from || !to || from === to) {
      toast.error(t('adminOrg.posEditValidation'));
      return;
    }
    const targets = members.filter((m) => memberJobTitle(m) === from);
    if (!targets.length) {
      toast.error(t('adminOrg.posEditEmpty'));
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        targets.map((m) => adminUserAPI.patchProfile(orgId, memberUserId(m), { jobTitle: to }))
      );
      toast.success(t('adminOrg.posSaved'));
      setNewTitle('');
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.posEdit')} hint={t('adminOrg.posEditHint')}>
      <AdminUserFormCard>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <form className="mx-auto max-w-lg space-y-4" onSubmit={save}>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
              <select
                required
                className={adminInputClass()}
                value={oldTitle}
                onChange={(e) => setOldTitle(e.target.value)}
              >
                <option value="">{t('adminOrg.selectTitle')}</option>
                {titles.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.posNewTitle')}</span>
              <input
                required
                className={adminInputClass()}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('adminOrg.posNewTitle')}
              />
            </label>
            <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </form>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

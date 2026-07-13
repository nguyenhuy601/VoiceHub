/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
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

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

export default function PosAssignPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const titleParam = String(searchParams.get('title') || '').trim();
  const { members, loadMembers } = useAdminMembers(orgId);
  const [mode, setMode] = useState(titleParam ? 'existing' : 'existing');
  const [selectedTitle, setSelectedTitle] = useState(titleParam);
  const [customTitle, setCustomTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (titleParam) {
      setSelectedTitle(titleParam);
      setMode('existing');
    }
  }, [titleParam]);

  const titles = useMemo(() => {
    const set = new Set();
    for (const m of members) {
      const title = memberJobTitle(m);
      if (title) set.add(title);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [members]);

  const jobTitle =
    mode === 'custom' ? String(customTitle || '').trim() : String(selectedTitle || '').trim();

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || !jobTitle || saving) return;
    setSaving(true);
    try {
      await adminUserAPI.patchProfile(orgId, userId, { jobTitle });
      toast.success(t('adminOrg.posAssigned'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posAssignFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.posAssign')} hint={t('adminOrg.posAssignHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.posAssignUserHint')} />
        <AdminUserFormCard title={t('adminDomains.orgStructure.posAssign')}>
          <form className="space-y-4" onSubmit={save}>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="pos-mode"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                />
                {t('adminOrg.posSelectExisting')}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="pos-mode"
                  checked={mode === 'custom'}
                  onChange={() => setMode('custom')}
                />
                {t('adminOrg.posCreateNew')}
              </label>
            </div>
            {mode === 'existing' ? (
              <label className="block">
                <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
                <select
                  required
                  className={adminInputClass()}
                  value={selectedTitle}
                  onChange={(e) => setSelectedTitle(e.target.value)}
                >
                  <option value="">{t('adminOrg.selectTitle')}</option>
                  {titles.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
                <input
                  required
                  className={adminInputClass()}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={t('adminOrg.posTitle')}
                />
              </label>
            )}
            <button
              type="submit"
              disabled={saving || !userId || !jobTitle}
              className={adminPrimaryBtnClass()}
            >
              {saving ? t('common.saving') : t('adminDomains.orgStructure.posAssign')}
            </button>
          </form>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, GradientButton } from '../Shared';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import authService from '../../services/authService';
import userService from '../../services/userService';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApiData } from '../../utils/helpers';

/**
 * Bắt buộc sau login: đổi MK nếu mustChangePassword và/hoặc bổ sung hồ sơ.
 * Không cho đóng cho đến khi hoàn tất.
 */
export default function FirstLoginProfileModal({ open, mustChangePassword, onCompleted }) {
  const { t } = useAppStrings();
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    displayName: String(user?.displayName || '').trim(),
    email: String(user?.email || '').trim(),
    phone: String(user?.phone || '').trim(),
    jobTitle: String(user?.jobTitle || user?.preferences?.jobTitle || '').trim(),
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  }));

  const needsPassword = Boolean(mustChangePassword);
  const title = needsPassword ? t('firstLogin.titleFull') : t('firstLogin.titleProfile');

  const canSubmit = useMemo(() => {
    if (!String(form.displayName || '').trim()) return false;
    if (!String(form.phone || '').trim()) return false;
    if (!String(form.jobTitle || '').trim()) return false;
    if (needsPassword) {
      if (!form.currentPassword || !form.newPassword || form.newPassword !== form.confirmPassword) {
        return false;
      }
      if (form.newPassword.length < 8) return false;
    }
    return true;
  }, [form, needsPassword]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      let authPatch = {};
      if (needsPassword) {
        const pwResult = await authService.changePassword(form.currentPassword, form.newPassword);
        if (pwResult?.user) {
          authPatch = {
            ...pwResult.user,
            mustChangePassword: false,
          };
        } else {
          authPatch = { mustChangePassword: false };
        }
      }
      const patch = {
        displayName: String(form.displayName).trim(),
        phone: String(form.phone).trim(),
        jobTitle: String(form.jobTitle).trim(),
        preferences: {
          ...(user?.preferences && typeof user.preferences === 'object' ? user.preferences : {}),
          jobTitle: String(form.jobTitle).trim(),
          profileCompletedAt: new Date().toISOString(),
        },
      };
      const updated = await userService.updateProfile(patch);
      const profile = unwrapApiData(updated) || updated;
      if (typeof updateUser === 'function') {
        updateUser({
          ...authPatch,
          ...profile,
          mustChangePassword: false,
          displayName: profile?.displayName || patch.displayName,
          phone: profile?.phone || patch.phone,
          jobTitle: profile?.jobTitle || patch.jobTitle,
          preferences: {
            ...(profile?.preferences && typeof profile.preferences === 'object'
              ? profile.preferences
              : {}),
            ...patch.preferences,
          },
        });
      }
      toast.success(t('firstLogin.saved'));
      onCompleted?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('firstLogin.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => {}}
      title={title}
      size="md"
      layerClassName="z-[300]"
      closable={false}
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        <p className="text-sm text-muted-foreground">{t('firstLogin.hint')}</p>
        <label className="block text-xs font-semibold text-muted-foreground">
          {t('firstLogin.fullName')}
          <input
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          {t('firstLogin.email')}
          <input
            readOnly
            className="mt-1 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm opacity-80"
            value={form.email}
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          {t('firstLogin.phone')}
          <input
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          {t('firstLogin.jobTitle')}
          <input
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={form.jobTitle}
            onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            placeholder={t('firstLogin.jobTitlePlaceholder')}
          />
        </label>
        {needsPassword ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground">{t('firstLogin.passwordSection')}</p>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder={t('firstLogin.tempPassword')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder={t('firstLogin.newPassword')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder={t('firstLogin.confirmPassword')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
          </div>
        ) : null}
        <GradientButton type="submit" disabled={!canSubmit || saving} className="w-full justify-center">
          {saving ? t('common.saving') : t('firstLogin.submit')}
        </GradientButton>
      </form>
    </Modal>
  );
}

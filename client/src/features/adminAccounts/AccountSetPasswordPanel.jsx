import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Eye, EyeOff, KeyRound, X } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { PASSWORD_INPUT_MAX_LENGTH, PASSWORD_RULE_KEYS, evaluatePassword } from './passwordPolicy';

export default function AccountSetPasswordPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [password, setPassword] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loadMembers } = useAdminMembers(orgId, { view: 'directory' });
  const passwordId = useId();
  const confirmId = useId();
  const rulesId = useId();

  useEffect(() => {
    setPassword('');
    setConfirmValue('');
    setRevealed(false);
  }, [orgId, userId]);

  const { rules, isValid } = useMemo(() => evaluatePassword(password), [password]);
  const matches = password.length > 0 && password === confirmValue;
  const canSubmit = Boolean(userId) && !busy && isValid && matches;

  const submit = async () => {
    if (!orgId || !canSubmit) return;
    setBusy(true);
    try {
      await adminUserAPI.setPassword(orgId, userId, { password, mustChangePassword });
      toast.success(t('adminAccounts.setPasswordSuccess'));
      setPassword('');
      setConfirmValue('');
      setRevealed(false);
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.setPasswordFail') }));
    } finally {
      setBusy(false);
    }
  };

  const inputType = revealed ? 'text' : 'password';

  const body = (
    <>
      <AdminUserFormCard title={t('adminDomains.accounts.setPassword')} hint={t('adminAccounts.setPasswordHint')}>
        {!userId ? (
          <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) setConfirmOpen(true);
            }}
          >
            <div>
              <label htmlFor={passwordId} className={adminLabelClass()}>
                {t('adminAccounts.newPassword')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={passwordId}
                  type={inputType}
                  autoComplete="new-password"
                  maxLength={PASSWORD_INPUT_MAX_LENGTH}
                  className={adminInputClass()}
                  value={password}
                  aria-describedby={rulesId}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  aria-pressed={revealed}
                  aria-label={revealed ? t('adminAccounts.hidePassword') : t('adminAccounts.showPassword')}
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            </div>
            <ul id={rulesId} className="grid gap-1 text-xs sm:grid-cols-2" aria-label={t('adminAccounts.passwordRulesTitle')}>
              {PASSWORD_RULE_KEYS.map((key) => (
                <li
                  key={key}
                  className={`flex items-center gap-1.5 ${rules[key] ? 'text-success' : 'text-muted-foreground'}`}
                >
                  {rules[key] ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                  <span>{t(`adminAccounts.passwordRule_${key}`)}</span>
                  <span className="sr-only">
                    {rules[key] ? t('adminAccounts.ruleMet') : t('adminAccounts.ruleNotMet')}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <label htmlFor={confirmId} className={adminLabelClass()}>
                {t('adminAccounts.confirmPassword')}
              </label>
              <input
                id={confirmId}
                type={inputType}
                autoComplete="new-password"
                maxLength={PASSWORD_INPUT_MAX_LENGTH}
                className={adminInputClass()}
                value={confirmValue}
                aria-invalid={confirmValue.length > 0 && !matches ? true : undefined}
                onChange={(e) => setConfirmValue(e.target.value)}
              />
              {confirmValue.length > 0 && !matches ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {t('adminAccounts.passwordMismatch')}
                </p>
              ) : null}
            </div>
            <label className="flex items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-border focus-visible:ring-2 focus-visible:ring-ring"
                checked={mustChangePassword}
                onChange={(e) => setMustChangePassword(e.target.checked)}
              />
              <span>{t('adminAccounts.requireChangeAfterSet')}</span>
            </label>
            <button type="submit" disabled={!canSubmit} className={adminPrimaryBtnClass()}>
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              {busy ? t('common.saving') : t('adminAccounts.applyPassword')}
            </button>
          </form>
        )}
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        title={t('adminAccounts.setPasswordConfirmTitle')}
        message={t('adminAccounts.setPasswordConfirmMessage')}
        confirmText={t('adminAccounts.applyPassword')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.setPassword')} hint={t('adminAccounts.setPasswordHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.setPasswordPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

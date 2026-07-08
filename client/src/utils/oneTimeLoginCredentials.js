const ONE_TIME_KEY = 'vh_company_invite_credentials_shown';

/**
 * Credentials chỉ hiện 1 lần trên /login sau accept invite.
 * SessionStorage: mất khi đóng tab; + fingerprint email để tránh hiện lại nếu đã dismiss.
 */
export function stashOneTimeLoginCredentials({ email, password }) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  if (!e || !p) return;
  try {
    if (sessionStorage.getItem(`${ONE_TIME_KEY}:${e}`) === '1') return;
    sessionStorage.setItem(
      'vh_pending_login_credentials',
      JSON.stringify({ email: e, password: p, at: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function consumeOneTimeLoginCredentials() {
  try {
    const raw = sessionStorage.getItem('vh_pending_login_credentials');
    if (!raw) return null;
    sessionStorage.removeItem('vh_pending_login_credentials');
    const parsed = JSON.parse(raw);
    const email = String(parsed?.email || '').trim().toLowerCase();
    const password = String(parsed?.password || '');
    if (!email || !password) return null;
    sessionStorage.setItem(`${ONE_TIME_KEY}:${email}`, '1');
    return { email, password };
  } catch {
    return null;
  }
}

export function clearOneTimeLoginCredentials() {
  try {
    sessionStorage.removeItem('vh_pending_login_credentials');
  } catch {
    // ignore
  }
}

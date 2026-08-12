/**
 * Đọc token xác thực/reset từ URL — ưu tiên hash (#token=) để tránh Referer leak.
 * Fallback query ?token= cho bookmark cũ.
 */
export function readAuthTokenFromUrl(searchParams, hash) {
  const fromQuery = searchParams?.get?.('token');
  if (fromQuery) return String(fromQuery).trim();

  const rawHash =
    hash != null
      ? String(hash)
      : typeof window !== 'undefined'
        ? String(window.location.hash || '')
        : '';

  if (!rawHash) return '';

  const withoutHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  const params = new URLSearchParams(withoutHash);
  const fromHash = params.get('token');
  return fromHash ? String(fromHash).trim() : '';
}

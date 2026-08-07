/** FE flag — mirror TIME_TRACKING_V1 (default on). */
export function isTimeTrackingV1Enabled() {
  const raw = String(import.meta.env.VITE_TIME_TRACKING_V1 ?? '1')
    .trim()
    .toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

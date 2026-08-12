/**
 * Mirror BE ASSIGNMENT_ENGINE_V1 — mặc định bật (P5+); tắt qua VITE_ASSIGNMENT_ENGINE_V1=false.
 */
export function isAssignmentEngineEnabled() {
  const v = String(import.meta.env.VITE_ASSIGNMENT_ENGINE_V1 ?? '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  return true;
}

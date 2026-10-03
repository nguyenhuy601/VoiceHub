/**
 * Retry ownership matrix (VoiceHub HTTP resilience).
 *
 * | Layer              | Responsibility                                      |
 * |--------------------|-----------------------------------------------------|
 * | UI                 | No auto-retry; manual "Retry" buttons OK            |
 * | FE HTTP Client     | Controlled GET/safe retry + OFFLINE gate            |
 * | API Gateway proxy  | Forward once — no business request retry            |
 * | Service S2S        | GET/safe via @enterprise/shared/http/s2sSafeGet only|
 * | Queue / APS callback | Async job retry (lease + attempts) — separate     |
 *
 * Mutations (POST phase-run): Idempotency-Key + APS replay; never transport-retry POST.
 */
module.exports = {
  GATEWAY_RETRIES_BUSINESS_REQUESTS: false,
  FE_TRANSPORT_RETRIES_MUTATIONS: false,
  S2S_TRANSPORT_RETRIES_MUTATIONS: false,
};

/**
 * Metrics đơn giản (in-memory) cho mã hóa — có thể gắn Prometheus sau.
 */
const metrics = {
  encrypt_ok: 0,
  decrypt_fail: 0,
  migrate_lazy_count: 0,
  encrypted_ratio_samples: 0,
  encrypted_ratio_hits: 0,
};

function recordEncryptOk() {
  metrics.encrypt_ok += 1;
}

function recordDecryptFail() {
  metrics.decrypt_fail += 1;
}

function recordLazyMigrate() {
  metrics.migrate_lazy_count += 1;
}

function recordEncryptedRatio(isEncryptedField) {
  metrics.encrypted_ratio_samples += 1;
  if (isEncryptedField) metrics.encrypted_ratio_hits += 1;
}

function getCryptoMetrics() {
  const ratio =
    metrics.encrypted_ratio_samples > 0
      ? metrics.encrypted_ratio_hits / metrics.encrypted_ratio_samples
      : 0;
  return {
    ...metrics,
    encrypted_ratio: Number(ratio.toFixed(4)),
  };
}

function resetCryptoMetrics() {
  metrics.encrypt_ok = 0;
  metrics.decrypt_fail = 0;
  metrics.migrate_lazy_count = 0;
  metrics.encrypted_ratio_samples = 0;
  metrics.encrypted_ratio_hits = 0;
}

module.exports = {
  recordEncryptOk,
  recordDecryptFail,
  recordLazyMigrate,
  recordEncryptedRatio,
  getCryptoMetrics,
  resetCryptoMetrics,
};

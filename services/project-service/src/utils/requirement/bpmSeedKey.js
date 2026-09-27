/**
 * Khóa BPM khi seed từ pack.
 * Hậu tố row chỉ khi cùng một lần đọc có hai dòng trùng ID + Step.
 * Không nhìn artifact đã lưu: publish/re-seed phải gặp đúng key cũ để upsert bỏ qua.
 */
function allocateBpmExternalKey(externalKey, step, usedKeys, rowNumber) {
  const base = String(externalKey || '').trim();
  const stepText = String(step || '').trim();
  let key = (stepText ? `${base}-S${stepText}` : base).slice(0, 64);
  if (usedKeys.has(key)) {
    const suffix = String(rowNumber || usedKeys.size + 1);
    key = `${key}-${suffix}`.slice(0, 64);
  }
  usedKeys.add(key);
  return key;
}

module.exports = { allocateBpmExternalKey };

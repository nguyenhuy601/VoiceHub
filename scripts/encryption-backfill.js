#!/usr/bin/env node
/**
 * Backfill mã hóa dữ liệu cũ (tùy chọn): quét theo batch và mã hóa trường đã là plaintext.
 * Lazy migration trên read/write đã tự xử lý; script này giúp tăng tốc hoàn tất.
 *
 * Cấu hình: ENCRYPTION_MASTER_KEY, MONGODB_URI, BACKFILL_TARGET=messages
 */
const mongoose = require('mongoose');

const TARGET = process.env.BACKFILL_TARGET || 'messages';
const BATCH = Math.min(500, parseInt(process.env.BACKFILL_BATCH || '100', 10));

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Thiếu MONGODB_URI');
    process.exit(1);
  }
  if (!process.env.ENCRYPTION_MASTER_KEY || String(process.env.ENCRYPTION_MASTER_KEY).length < 32) {
    console.error('Thiếu ENCRYPTION_MASTER_KEY (>= 32 ký tự hoặc 64 hex)');
    process.exit(1);
  }

  const { encryptField, isEncrypted, isEncryptionEnabled } = require('../shared/utils/fieldCrypto');
  const { recordLazyMigrate } = require('../shared/utils/cryptoMetrics');

  if (!isEncryptionEnabled()) {
    console.error('isEncryptionEnabled() = false — kiểm tra ENCRYPTION_MASTER_KEY');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected. Target:', TARGET, 'batch:', BATCH);

  if (TARGET === 'messages') {
    const MessageSchema = new mongoose.Schema({}, { strict: false, collection: 'messages' });
    const Message = mongoose.models.BackfillMessage || mongoose.model('BackfillMessage', MessageSchema);
    let updated = 0;
    for (;;) {
      const docs = await Message.find({
        $or: [{ encV: { $exists: false } }, { encV: 0 }],
        content: { $exists: true, $ne: null },
      })
        .limit(BATCH)
        .lean();

      const plainDocs = docs.filter((d) => typeof d.content === 'string' && !isEncrypted(d.content));
      if (!plainDocs.length) break;

      for (const d of plainDocs) {
        await Message.updateOne(
          { _id: d._id },
          { $set: { content: encryptField(String(d.content)), encV: 1 } }
        );
        recordLazyMigrate();
        updated += 1;
      }
    }
    console.log('Messages updated:', updated);
  } else {
    console.log('Chỉ hỗ trợ BACKFILL_TARGET=messages (user/notifications dùng lazy migration API).');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

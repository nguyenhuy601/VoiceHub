const { mongoose } = require('@enterprise/shared/config/mongo');

const importRowSchema = new mongoose.Schema(
  {
    rowNumber: { type: Number, required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ['ok', 'failed', 'compensated', 'skipped', 'pending'],
      required: true,
      default: 'pending',
    },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    errorMessage: { type: String, default: '' },
    /** Đã gửi email đặt mật khẩu (fail-soft nếu SMTP lỗi). */
    emailSent: { type: Boolean, default: false },
    /** Chờ NV đặt mk qua mail hoặc admin kích hoạt. */
    pendingActivation: { type: Boolean, default: false },
  },
  { _id: false }
);

const importBatchSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Organization',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'User',
    },
    fileName: { type: String, default: '', trim: true },
    totalRows: { type: Number, default: 0 },
    /** Số dòng đã provision (confirm). */
    processedRows: { type: Number, default: 0 },
    /** Số lỗi validation lúc preview (0 = được Confirm). */
    errorCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['preview', 'validating', 'queued', 'importing', 'completed', 'failed'],
      default: 'preview',
      index: true,
    },
    rows: { type: [importRowSchema], default: [] },
    /**
     * Payload đã validate (normalized rows) — dùng lúc Confirm.
     * Không allocate mã VH ở preview (tránh đốt sequence).
     */
    previewPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Frontend origin cho mail đặt MK (worker async). */
    frontendUrl: { type: String, default: '', trim: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    /** Chi tiết lỗi preview (rowNumber + message) khi errorCount > 0. */
    validationDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

importBatchSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ImportBatch', importBatchSchema);

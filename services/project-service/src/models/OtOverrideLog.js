const mongoose = require('../db');

/**
 * OT override audit log.
 * Ghi lại khi PM override "soft warning" để tạo ProjectMembership vẫn vượt ngưỡng.
 *
 * NOTE: Hiện model này dùng cho capacity/OT guard wave sau.
 */
const otOverrideLogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'TaskBoard',
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    overriddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    rationale: {
      type: String,
      required: true,
      maxlength: 2000,
      trim: true,
    },
    activeProjectCountAtOverride: {
      type: Number,
      default: null,
    },
    maxConfigured: {
      type: Number,
      default: null,
    },
    source: {
      type: String,
      enum: ['ot_soft_warning', 'hours_soft_warning'],
      default: 'ot_soft_warning',
    },
    /** Chi tiết lố ngày/tuần khi source = hours_soft_warning. */
    hoursPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

otOverrideLogSchema.index({ organizationId: 1, targetUserId: 1, boardId: 1, createdAt: -1 });

module.exports = mongoose.model('OtOverrideLog', otOverrideLogSchema);

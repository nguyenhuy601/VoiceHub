const { mongo } = require('@enterprise/shared');
const { mongoose } = mongo;

const companyInviteSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    role: {
      type: String,
      enum: ['owner', 'admin', 'hr', 'member'],
      default: 'member',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: { type: Date, default: null },
    acceptedUserId: { type: String, default: null },
  },
  { timestamps: true }
);

companyInviteSchema.index({ organization: 1, email: 1, status: 1 });

module.exports = mongoose.model('CompanyInvite', companyInviteSchema);

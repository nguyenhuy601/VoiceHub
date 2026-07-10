const { mongoose } = require('@enterprise/shared/config/mongo');

const ROLE_SCOPES = ['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PERSONAL'];

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    scope: {
      type: String,
      enum: ROLE_SCOPES,
      default: 'ORGANIZATION',
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Server',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    permissions: [
      {
        resource: {
          type: String,
          required: true,
          trim: true,
        },
        // Fine-grained actions (view, create, …) + legacy read/write/delete/admin
        actions: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],
    color: {
      type: String,
      default: '#5865F2',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
roleSchema.index({ serverId: 1 });
roleSchema.index({ organizationId: 1 });
roleSchema.index({ name: 1, serverId: 1 }, { unique: true });

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
module.exports.ROLE_SCOPES = ROLE_SCOPES;

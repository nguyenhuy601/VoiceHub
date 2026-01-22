const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
        },
        actions: [
          {
            type: String,
            enum: ['read', 'write', 'delete', 'admin'],
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




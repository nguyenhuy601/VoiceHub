const { mongoose } = require('/shared/config/mongo');

const serverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    icon: {
      type: String,
      default: null,
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        role: {
          type: String,
          enum: ['owner', 'admin', 'member', 'guest'],
          default: 'member',
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    channels: [
      {
        name: String,
        type: {
          type: String,
          enum: ['text', 'voice'],
          default: 'text',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
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
serverSchema.index({ organizationId: 1 });
serverSchema.index({ ownerId: 1 });
serverSchema.index({ 'members.userId': 1 });
serverSchema.index({ isActive: 1 });

const Server = mongoose.model('Server', serverSchema);

module.exports = Server;




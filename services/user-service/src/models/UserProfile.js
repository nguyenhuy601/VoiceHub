const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: 'UserAuth',
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 500,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away', 'busy'],
      default: 'offline',
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto',
      },
      language: {
        type: String,
        default: 'vi',
      },
      notifications: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userProfileSchema.index({ userId: 1 });
userProfileSchema.index({ username: 1 });
userProfileSchema.index({ status: 1 });

// Virtual để lấy thông tin cơ bản
userProfileSchema.virtual('publicInfo').get(function () {
  return {
    userId: this.userId,
    username: this.username,
    displayName: this.displayName,
    avatar: this.avatar,
    status: this.status,
  };
});

// Method để cập nhật last seen
userProfileSchema.methods.updateLastSeen = function () {
  this.lastSeen = new Date();
  return this.save();
};

// Method để cập nhật status
userProfileSchema.methods.updateStatus = function (status) {
  this.status = status;
  if (status === 'online' || status === 'offline') {
    this.lastSeen = new Date();
  }
  return this.save();
};

const UserProfile = mongoose.model('UserProfile', userProfileSchema);

module.exports = UserProfile;




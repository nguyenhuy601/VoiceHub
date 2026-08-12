const Meeting = require('../models/Meeting');
const MeetingRecordingSegment = require('../models/MeetingRecordingSegment');
const objectStorage = require('../utils/objectStorage');
const meetingRecordingService = require('../services/meetingRecording.service');
const { logger } = require('@enterprise/shared');

function retentionDays() {
  return Math.max(parseInt(process.env.VOICE_RECORDING_AUDIO_RETENTION_DAYS || '7', 10) || 7, 0);
}

function gcEnabled() {
  return String(process.env.VOICE_RECORDING_GC_ENABLED || 'true').toLowerCase() !== 'false';
}

async function expireColdTierAudio() {
  const days = retentionDays();
  if (days <= 0 || !objectStorage.isEnabled()) return { expired: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let expired = 0;

  const segmentRows = await MeetingRecordingSegment.find({
    status: 'ready',
    audioStoragePath: { $ne: null },
    updatedAt: { $lte: cutoff },
  })
    .select('_id audioStoragePath tempStoragePath meetingId')
    .limit(50)
    .lean();

  for (const row of segmentRows) {
    await objectStorage.deleteObjects([row.audioStoragePath, row.tempStoragePath].filter(Boolean));
    await MeetingRecordingSegment.findByIdAndUpdate(row._id, {
      $set: { status: 'audio_expired', audioStoragePath: null, tempStoragePath: null },
    });
    expired += 1;
  }

  const rows = await Meeting.find({
    recordingStatus: 'ready',
    audioStoragePath: { $ne: null },
    endTime: { $lte: cutoff },
  })
    .select('_id audioStoragePath tempStoragePath')
    .limit(50)
    .lean();

  for (const row of rows) {
    await meetingRecordingService.deleteMeetingStorage(row);
    await Meeting.findByIdAndUpdate(row._id, {
      $set: {
        recordingStatus: 'audio_expired',
        audioStoragePath: null,
        tempStoragePath: null,
      },
    });
    expired += 1;
  }
  if (expired > 0) {
    logger.info(`recordingRetention: cold-tier expired ${expired} meetings`);
  }
  return { expired };
}

async function cleanupFailedTempObjects() {
  if (!objectStorage.isEnabled()) return { cleaned: 0 };
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await Meeting.find({
    recordingStatus: { $in: ['failed', 'processing'] },
    tempStoragePath: { $ne: null },
    updatedAt: { $lte: staleBefore },
  })
    .select('_id tempStoragePath')
    .limit(30)
    .lean();

  let cleaned = 0;
  for (const row of rows) {
    await objectStorage.deleteObject(row.tempStoragePath);
    await Meeting.findByIdAndUpdate(row._id, { $set: { tempStoragePath: null } });
    cleaned += 1;
  }
  return { cleaned };
}

async function runRecordingRetentionOnce() {
  if (!gcEnabled()) return { skipped: true };
  const cold = await expireColdTierAudio();
  const temp = await cleanupFailedTempObjects();
  return { cold, temp };
}

function startRecordingRetentionJob() {
  if (!gcEnabled()) {
    logger.info('recordingRetention job disabled');
    return;
  }
  const intervalMs = Math.max(
    parseInt(process.env.VOICE_RECORDING_GC_INTERVAL_MS || '3600000', 10) || 3600000,
    60000
  );
  const tick = () => {
    runRecordingRetentionOnce().catch((err) => {
      logger.warn(`recordingRetention tick failed: ${err.message}`);
    });
  };
  setTimeout(tick, 15000);
  setInterval(tick, intervalMs);
  logger.info(`recordingRetention job started intervalMs=${intervalMs}`);
}

module.exports = {
  runRecordingRetentionOnce,
  startRecordingRetentionJob,
  expireColdTierAudio,
};

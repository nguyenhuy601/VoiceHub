const Meeting = require('../models/Meeting');
const { publishJson } = require('../messaging/rabbit');
const { VOICE_SUMMARY_PROCESS_QUEUE } = require('@enterprise/shared/messaging/voiceSttEvents');
const { logger } = require('@enterprise/shared');

/** @type {Map<string, { meetingId: string, enabled: boolean, seq: number }>} */
const roomSummaryState = new Map();

function isAiSummaryEnabled() {
  return String(process.env.VOICE_AI_SUMMARY_ENABLED || 'true').toLowerCase() !== 'false';
}

function getRoomSummaryState(roomId) {
  return roomSummaryState.get(String(roomId)) || null;
}

async function enableRoomSummary({ roomId, meetingId }) {
  if (!isAiSummaryEnabled()) {
    const err = new Error('AI summary is disabled');
    err.statusCode = 503;
    throw err;
  }
  const objectStorage = require('../utils/objectStorage');
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage (MinIO) is not configured — AI summary unavailable');
    err.statusCode = 503;
    throw err;
  }
  const key = String(roomId);
  roomSummaryState.set(key, {
    meetingId: String(meetingId),
    enabled: true,
    seq: 0,
  });
  await Meeting.findByIdAndUpdate(meetingId, {
    $set: { aiSummaryEnabled: true, transcriptSource: 'realtime' },
  });
  logger.info(`AI summary enabled room=${roomId} meeting=${meetingId}`);
  return { enabled: true };
}

async function disableRoomSummary({ roomId, meetingId }) {
  const key = String(roomId);
  roomSummaryState.delete(key);
  if (meetingId) {
    await Meeting.findByIdAndUpdate(meetingId, { $set: { aiSummaryEnabled: false } });
  }
  return { enabled: false };
}

function clearRoomSummary(roomId) {
  roomSummaryState.delete(String(roomId));
}

function isSummaryActive(roomId) {
  const state = roomSummaryState.get(String(roomId));
  return Boolean(state?.enabled);
}

function nextTranscriptSeq(roomId) {
  const state = roomSummaryState.get(String(roomId));
  if (!state) return 0;
  state.seq += 1;
  return state.seq;
}

async function appendTranscriptChunk(meetingId, chunk) {
  const seq = Number(chunk.seq) || 0;
  const text = String(chunk.text || '').trim();
  if (!text) return null;

  const meeting = await Meeting.findByIdAndUpdate(
    meetingId,
    {
      $push: {
        transcriptChunks: {
          seq,
          text,
          speakerId: String(chunk.speakerId || ''),
          displayName: String(chunk.displayName || ''),
          at: chunk.at ? new Date(chunk.at) : new Date(),
        },
      },
      $set: {
        transcriptSource: 'realtime',
      },
    },
    { new: true }
  ).lean();

  if (!meeting) return null;

  const sorted = [...(meeting.transcriptChunks || [])].sort((a, b) => a.seq - b.seq);
  const fullTranscript = sorted.map((c) => c.text).join('\n').trim();
  await Meeting.findByIdAndUpdate(meetingId, { $set: { transcript: fullTranscript } });

  return { seq, text, fullTranscript };
}

async function triggerPostMeetingSummary(meetingId) {
  const meeting = await Meeting.findById(meetingId).lean();
  if (!meeting) return null;

  const transcript = String(meeting.transcript || '').trim();
  if (!transcript) {
    await Meeting.findByIdAndUpdate(meetingId, { $set: { summaryStatus: 'none' } });
    return null;
  }

  await Meeting.findByIdAndUpdate(meetingId, { $set: { summaryStatus: 'processing' } });

  try {
    await publishJson(VOICE_SUMMARY_PROCESS_QUEUE, {
      meetingId: String(meetingId),
      transcript,
    });
  } catch (publishErr) {
    logger.warn(`Summary queue publish failed meeting=${meetingId}: ${publishErr.message}`);
    await Meeting.findByIdAndUpdate(meetingId, { $set: { summaryStatus: 'failed' } });
    return null;
  }

  logger.info(`Summary job queued meeting=${meetingId}`);
  return { queued: true };
}

async function applySummaryResult(meetingId, payload) {
  const structured = payload.summaryStructured || {
    summary: payload.summary || '',
    keyPoints: payload.keyPoints || [],
    actionItems: payload.actionItems || [],
  };
  const update = {
    summary: payload.summary || structured.summary || '',
    summaryStatus: payload.summaryStatus || 'ready',
    summaryStructured: structured,
  };
  if (payload.error) update.summaryStatus = 'failed';

  return Meeting.findByIdAndUpdate(meetingId, { $set: update }, { new: true }).lean();
}

module.exports = {
  isAiSummaryEnabled,
  getRoomSummaryState,
  enableRoomSummary,
  disableRoomSummary,
  clearRoomSummary,
  isSummaryActive,
  nextTranscriptSeq,
  appendTranscriptChunk,
  triggerPostMeetingSummary,
  applySummaryResult,
};

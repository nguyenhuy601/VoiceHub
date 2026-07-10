const multer = require('multer');
const meetingRecordingService = require('../services/meetingRecording.service');
const { logger } = require('@enterprise/shared');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.min(
      Math.max(parseInt(process.env.VOICE_RECORDING_MAX_UPLOAD_MB || '50', 10) || 50, 1),
      200
    ) * 1024 * 1024,
  },
});

function getUserId(req) {
  return req.user?.id || req.user?.userId || req.user?._id || req.userContext?.userId;
}

function safeStatus(error, fallback = 500) {
  const code = Number(error?.statusCode);
  return code >= 400 && code < 600 ? code : fallback;
}

class MeetingRecordingController {
  uploadMiddleware = upload.single('recording');

  async uploadRecording(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { meetingId } = req.params;
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ success: false, message: 'recording file is required' });
      }
      const durationSec = parseInt(req.body?.durationSec || req.body?.duration || '0', 10) || 0;
      const segmentIndexRaw = req.query?.segmentIndex ?? req.body?.segmentIndex;
      const segmentIndex =
        segmentIndexRaw !== undefined && segmentIndexRaw !== null && segmentIndexRaw !== ''
          ? parseInt(segmentIndexRaw, 10)
          : null;
      const result = await meetingRecordingService.handleUpload({
        meetingId,
        userId,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        durationSec,
        segmentIndex: Number.isFinite(segmentIndex) ? segmentIndex : null,
      });
      return res.status(202).json({ success: true, data: result });
    } catch (error) {
      logger.error('uploadRecording error:', error);
      return res.status(safeStatus(error, 400)).json({
        success: false,
        message: error.message || 'Upload failed',
      });
    }
  }

  async getRecording(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const data = await meetingRecordingService.getRecordingPayload(
        req.params.meetingId,
        userId,
        req.user
      );
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('getRecording error:', error);
      return res.status(safeStatus(error)).json({
        success: false,
        message: error.message || 'Not found',
      });
    }
  }

  async streamRecording(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { stream, contentType } = await meetingRecordingService.streamRecording(
        req.params.meetingId,
        userId,
        req.query?.segmentId || null,
        req.user
      );
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      stream.pipe(res);
    } catch (error) {
      logger.error('streamRecording error:', error);
      if (!res.headersSent) {
        res.status(safeStatus(error)).json({
          success: false,
          message: error.message || 'Stream failed',
        });
      }
    }
  }

  async internalPatchRecording(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingRecordingService.applyWorkerResult(meetingId, req.body || {});
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }
      return res.json({ success: true, data: meeting });
    } catch (error) {
      logger.error('internalPatchRecording error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Update failed',
      });
    }
  }

  async internalPatchTranscriptChunk(req, res) {
    try {
      const { meetingId } = req.params;
      const result = await meetingRecordingService.applyTranscriptChunk(meetingId, req.body || {});
      if (!result) {
        return res.status(400).json({ success: false, message: 'Empty transcript chunk' });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error('internalPatchTranscriptChunk error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Update failed',
      });
    }
  }

  async internalPatchSummary(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingRecordingService.applySummaryResult(meetingId, req.body || {});
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }
      return res.json({ success: true, data: meeting });
    } catch (error) {
      logger.error('internalPatchSummary error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Update failed',
      });
    }
  }
}

module.exports = new MeetingRecordingController();

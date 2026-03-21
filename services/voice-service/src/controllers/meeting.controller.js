const meetingService = require('../services/meeting.service');
const { logger } = require('/shared');

class MeetingController {
  // Tạo meeting mới
  async createMeeting(req, res) {
    try {
      const { title, description, serverId, organizationId, startTime } = req.body;
      const hostId = req.user?.id || req.userContext?.userId;

      if (!title || !hostId) {
        return res.status(400).json({
          success: false,
          message: 'title and hostId are required',
        });
      }

      const meeting = await meetingService.createMeeting({
        title,
        description,
        hostId,
        serverId,
        organizationId,
        startTime,
      });

      res.status(201).json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Create meeting error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Bắt đầu meeting
  async startMeeting(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.startMeeting(meetingId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Start meeting error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Kết thúc meeting
  async endMeeting(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.endMeeting(meetingId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('End meeting error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thêm participant
  async addParticipant(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user?.id || req.userContext?.userId || req.body.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      const meeting = await meetingService.addParticipant(meetingId, userId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Add participant error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa participant
  async removeParticipant(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user?.id || req.userContext?.userId || req.body.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      const meeting = await meetingService.removeParticipant(meetingId, userId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Remove participant error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy meeting theo ID
  async getMeetingById(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.getMeetingById(meetingId);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found',
        });
      }

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Get meeting error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách meetings
  async getMeetings(req, res) {
    try {
      const { serverId, organizationId, status, page, limit } = req.query;

      const filter = {};
      if (serverId) filter.serverId = serverId;
      if (organizationId) filter.organizationId = organizationId;
      if (status) filter.status = status;

      const result = await meetingService.getMeetings(filter, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get meetings error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async bootstrapMeetingRoom(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user?.id || req.user?.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const payload = await meetingService.bootstrapMeetingRoom(meetingId, userId);
      res.json({
        success: true,
        data: payload,
      });
    } catch (error) {
      logger.error('Bootstrap meeting room error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async bootstrapRoom(req, res) {
    try {
      const userId = req.user?.id || req.user?.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { roomId } = req.params;
      if (!roomId) {
        return res.status(400).json({
          success: false,
          message: 'roomId is required',
        });
      }

      res.json({
        success: true,
        data: {
          roomId,
          role: 'participant',
          status: 'active',
        },
      });
    } catch (error) {
      logger.error('Bootstrap room error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new MeetingController();


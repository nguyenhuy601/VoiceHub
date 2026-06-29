const Meeting = require('../models/Meeting');
const mongoose = require('../db');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { getRedisClient, logger } = require('@enterprise/shared');
const axios = require('axios');
const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');

function userCanAccessMeeting(meeting, userId) {
  const uid = String(userId || '').trim();
  if (!meeting || !uid) return false;
  const hostId = String(meeting.hostId?._id || meeting.hostId || '');
  if (hostId === uid) return true;
  return (meeting.participants || []).some(
    (p) => String(p.userId?._id || p.userId) === uid && !p.leftAt
  );
}

function assertMeetingHost(meeting, userId) {
  const uid = String(userId || '').trim();
  const hostId = String(meeting?.hostId?._id || meeting?.hostId || '');
  if (!meeting || hostId !== uid) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
}

class MeetingService {
  // Tạo meeting mới
  async createMeeting(meetingData) {
    try {
      const { title, description, hostId, serverId, organizationId, startTime } = meetingData;

      // Kiểm tra hostId có tồn tại không
      try {
        await fetchUserProfileByIdInternal(hostId);
      } catch (error) {
        throw new Error('Host user not found');
      }

      // Kiểm tra serverId nếu có
      if (serverId) {
        try {
          await axios.get(`${ORGANIZATION_SERVICE_URL}/api/servers/${serverId}`);
        } catch (error) {
          throw new Error('Server not found');
        }
      }

      const meeting = new Meeting({
        title,
        description,
        hostId,
        serverId,
        organizationId,
        startTime: startTime || new Date(),
        status: 'scheduled',
        participants: [
          {
            userId: hostId,
            joinedAt: new Date(),
          },
        ],
      });

      await meeting.save();

      logger.info(`Meeting created: ${meeting._id}`);
      return meeting;
    } catch (error) {
      logger.error('Error creating meeting:', error);
      throw new Error(`Error creating meeting: ${error.message}`);
    }
  }

  // Bắt đầu meeting
  async startMeeting(meetingId) {
    try {
      const meeting = await Meeting.findByIdAndUpdate(
        meetingId,
        {
          $set: {
            status: 'active',
            startTime: new Date(),
          },
        },
        { new: true }
      );

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      logger.info(`Meeting started: ${meetingId}`);
      return meeting;
    } catch (error) {
      logger.error('Error starting meeting:', error);
      throw new Error(`Error starting meeting: ${error.message}`);
    }
  }

  // Kết thúc meeting
  async endMeeting(meetingId) {
    try {
      const meeting = await Meeting.findByIdAndUpdate(
        meetingId,
        {
          $set: {
            status: 'ended',
            endTime: new Date(),
          },
        },
        { new: true }
      );

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      logger.info(`Meeting ended: ${meetingId}`);
      return meeting;
    } catch (error) {
      logger.error('Error ending meeting:', error);
      throw new Error(`Error ending meeting: ${error.message}`);
    }
  }

  // Thêm participant vào meeting
  async addParticipant(meetingId, userId) {
    try {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      if (meeting.status !== 'active') {
        throw new Error('Meeting is not active');
      }

      // Kiểm tra đã tham gia chưa
      const existing = meeting.participants.find(
        (p) => p.userId.toString() === userId.toString() && !p.leftAt
      );

      if (existing) {
        return meeting;
      }

      meeting.participants.push({
        userId,
        joinedAt: new Date(),
      });

      await meeting.save();

      logger.info(`Participant added to meeting: ${meetingId}, user: ${userId}`);
      return meeting;
    } catch (error) {
      logger.error('Error adding participant:', error);
      throw new Error(`Error adding participant: ${error.message}`);
    }
  }

  // Xóa participant khỏi meeting
  async removeParticipant(meetingId, userId) {
    try {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      const participant = meeting.participants.find(
        (p) => p.userId.toString() === userId.toString() && !p.leftAt
      );

      if (participant) {
        participant.leftAt = new Date();
        await meeting.save();
      }

      logger.info(`Participant removed from meeting: ${meetingId}, user: ${userId}`);
      return meeting;
    } catch (error) {
      logger.error('Error removing participant:', error);
      throw new Error(`Error removing participant: ${error.message}`);
    }
  }

  // Lấy meeting theo ID
  async getMeetingById(meetingId) {
    try {
      const meeting = await Meeting.findById(meetingId).lean();
      if (!meeting) return null;
      const hostProfile = await fetchUserProfileByIdInternal(String(meeting.hostId));
      if (hostProfile) meeting.hostId = hostProfile;
      if (Array.isArray(meeting.participants)) {
        for (const p of meeting.participants) {
          if (!p?.userId) continue;
          const prof = await fetchUserProfileByIdInternal(String(p.userId));
          if (prof) p.userId = prof;
        }
      }
      return meeting;
    } catch (error) {
      logger.error('Error getting meeting:', error);
      throw new Error(`Error getting meeting: ${error.message}`);
    }
  }

  async bootstrapMeetingRoom(meetingId, userId) {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const isHost = String(meeting.hostId?._id || meeting.hostId) === String(userId);
    const participant = meeting.participants.find(
      (item) => String(item.userId) === String(userId) && !item.leftAt
    );

    if (!isHost && !participant) {
      const err = new Error('Forbidden: not a meeting participant');
      err.statusCode = 403;
      throw err;
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
      meeting.startTime = meeting.startTime || new Date();
    }

    await meeting.save();

    return {
      meetingId: meeting._id,
      roomId: String(meeting._id),
      title: meeting.title,
      status: meeting.status,
      organizationId: meeting.organizationId || null,
      role: isHost ? 'host' : 'participant',
      participants: meeting.participants
        .filter((item) => !item.leftAt)
        .map((item) => ({
          userId: item.userId,
          joinedAt: item.joinedAt,
          isMuted: item.isMuted,
          isVideoOn: item.isVideoOn,
        })),
    };
  }

  // Lấy danh sách meetings
  async getMeetings(filter, options = {}) {
    try {
      const { page = 1, limit = 50, sort: sortOption } = options;
      const sort = sortOption || { startTime: -1 };

      // Không populate hostId: voice-service không đăng ký model User — populate gây MissingSchemaError/500.
      const meetings = await Meeting.find(filter)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sort)
        .lean();

      const total = await Meeting.countDocuments(filter);

      return {
        meetings,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error getting meetings:', error);
      throw new Error(`Error getting meetings: ${error.message}`);
    }
  }

  /** Giữ tối đa `keep` cuộc họp mới nhất của user; xóa phần cũ hơn khỏi DB. */
  async trimUserMeetingHistory(userId, keep = 25) {
    const uidStr = String(userId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(uidStr)) return { deleted: 0, deletedIds: [] };
    const uid = new mongoose.Types.ObjectId(uidStr);
    const filter = {
      $or: [{ hostId: uid }, { 'participants.userId': uid }],
      status: { $in: ['active', 'ended'] },
    };
    const rows = await Meeting.find(filter).sort({ startTime: -1 }).select('_id').lean();
    if (rows.length <= keep) return { deleted: 0, deletedIds: [] };
    const overflowIds = rows.slice(keep).map((r) => r._id);
    const result = await Meeting.deleteMany({ _id: { $in: overflowIds } });
    const deletedIds = overflowIds.map((id) => String(id));
    logger.info(`trimUserMeetingHistory user=${uidStr} deleted=${result.deletedCount || 0}`);
    return { deleted: result.deletedCount || 0, deletedIds };
  }

  async enrichMeetingsWithHostProfiles(meetings) {
    if (!Array.isArray(meetings) || !meetings.length) return meetings;
    const hostIds = [
      ...new Set(
        meetings
          .map((m) => String(m?.hostId || '').trim())
          .filter((id) => id && id !== 'undefined')
      ),
    ];
    const profileMap = {};
    await Promise.all(
      hostIds.map(async (hostId) => {
        try {
          const res = await fetchUserProfileByIdInternal(hostId);
          const body = res?.data?.data ?? res?.data ?? null;
          if (body) profileMap[hostId] = body;
        } catch {
          /* ignore missing profile */
        }
      })
    );
    return meetings.map((m) => ({
      ...m,
      hostProfile: profileMap[String(m.hostId)] || null,
    }));
  }
}

const meetingServiceInstance = new MeetingService();
meetingServiceInstance.userCanAccessMeeting = userCanAccessMeeting;
meetingServiceInstance.assertMeetingHost = assertMeetingHost;

module.exports = meetingServiceInstance;


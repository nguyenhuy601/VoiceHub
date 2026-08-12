const mongoose = require('../db');
const MeetingFeatureRequest = require('../models/MeetingFeatureRequest');
const voiceRoomLobby = require('./voiceRoomLobby.service');

/** @type {Map<string, Map<string, Set<string>>>} roomId -> userId -> Set<featureType> */
const runtimeGrants = new Map();

const FEATURE_TYPES = new Set(['recording', 'ai_summary']);

function roomGrants(roomId) {
  const key = String(roomId);
  if (!runtimeGrants.has(key)) runtimeGrants.set(key, new Map());
  return runtimeGrants.get(key);
}

function mapRequest(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(plain._id),
    roomId: plain.roomId,
    meetingId: plain.meetingId ? String(plain.meetingId) : null,
    userId: String(plain.userId),
    displayName: plain.displayName || '',
    type: plain.type,
    status: plain.status,
    requestedAt: plain.requestedAt,
    resolvedAt: plain.resolvedAt,
    resolvedBy: plain.resolvedBy ? String(plain.resolvedBy) : null,
  };
}

async function isRoomHost(roomId, userId) {
  return voiceRoomLobby.canActAsRoomHost(roomId, userId);
}

async function assertHost(roomId, userId) {
  const allowed = await isRoomHost(roomId, userId);
  if (!allowed) {
    const err = new Error('Forbidden — host only');
    err.statusCode = 403;
    throw err;
  }
}

function grantRuntime(roomId, userId, type) {
  if (!FEATURE_TYPES.has(type)) return;
  const grants = roomGrants(roomId);
  const uid = String(userId);
  if (!grants.has(uid)) grants.set(uid, new Set());
  grants.get(uid).add(type);
}

function getRuntimeGrants(roomId, userId) {
  const grants = roomGrants(roomId).get(String(userId));
  return grants ? [...grants] : [];
}

function clearRoomGrants(roomId) {
  runtimeGrants.delete(String(roomId));
}

async function userCanUseFeature({ roomId, userId, type, hostId }) {
  if (!FEATURE_TYPES.has(type)) return false;
  const uid = String(userId);
  if (hostId && String(hostId) === uid) return true;
  if (await isRoomHost(roomId, uid)) return true;
  const runtime = getRuntimeGrants(roomId, uid);
  if (runtime.includes(type)) return true;
  const approved = await MeetingFeatureRequest.findOne({
    roomId: String(roomId),
    userId: new mongoose.Types.ObjectId(uid),
    type,
    status: 'approved',
  }).lean();
  return Boolean(approved);
}

async function createFeatureRequest({ roomId, meetingId, userId, displayName, type }) {
  if (!FEATURE_TYPES.has(type)) {
    const err = new Error('Invalid feature type');
    err.statusCode = 400;
    throw err;
  }
  if (await isRoomHost(roomId, userId)) {
    const err = new Error('Host does not need approval');
    err.statusCode = 400;
    throw err;
  }

  const uid = new mongoose.Types.ObjectId(String(userId));
  const existing = await MeetingFeatureRequest.findOne({
    roomId: String(roomId),
    userId: uid,
    type,
    status: 'pending',
  });
  if (existing) return mapRequest(existing);

  const doc = await MeetingFeatureRequest.create({
    roomId: String(roomId),
    meetingId: meetingId || null,
    userId: uid,
    displayName: String(displayName || '').slice(0, 120),
    type,
    status: 'pending',
  });
  return mapRequest(doc);
}

async function listPendingRequests(roomId) {
  const rows = await MeetingFeatureRequest.find({
    roomId: String(roomId),
    status: 'pending',
  })
    .sort({ requestedAt: 1 })
    .lean();
  return rows.map(mapRequest);
}

async function resolveFeatureRequest({ roomId, requestId, hostUserId, approved }) {
  await assertHost(roomId, hostUserId);
  const doc = await MeetingFeatureRequest.findOne({
    _id: requestId,
    roomId: String(roomId),
    status: 'pending',
  });
  if (!doc) {
    const err = new Error('Request not found');
    err.statusCode = 404;
    throw err;
  }

  doc.status = approved ? 'approved' : 'rejected';
  doc.resolvedAt = new Date();
  doc.resolvedBy = new mongoose.Types.ObjectId(String(hostUserId));
  await doc.save();

  if (approved) {
    grantRuntime(roomId, doc.userId, doc.type);
  }

  return mapRequest(doc);
}

async function getGrantedFeaturesForUser(roomId, userId, hostId) {
  const types = [];
  for (const type of FEATURE_TYPES) {
    if (await userCanUseFeature({ roomId, userId, type, hostId })) {
      types.push(type);
    }
  }
  return types;
}

module.exports = {
  FEATURE_TYPES,
  mapRequest,
  isRoomHost,
  assertHost,
  grantRuntime,
  getRuntimeGrants,
  clearRoomGrants,
  userCanUseFeature,
  createFeatureRequest,
  listPendingRequests,
  resolveFeatureRequest,
  getGrantedFeaturesForUser,
};

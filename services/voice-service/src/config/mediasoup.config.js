const parseNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const announcedIpRaw = process.env.MEDIASOUP_ANNOUNCED_IP || '';
const announcedIp = announcedIpRaw.trim() || undefined;

module.exports = {
  worker: {
    rtcMinPort: parseNumber(process.env.RTC_MIN_PORT, 40000),
    rtcMaxPort: parseNumber(process.env.RTC_MAX_PORT, 49999),
    logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ],
  },
  webRtcTransport: {
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
        announcedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: parseNumber(
      process.env.MEDIASOUP_INITIAL_OUTGOING_BITRATE,
      1000000
    ),
  },
};

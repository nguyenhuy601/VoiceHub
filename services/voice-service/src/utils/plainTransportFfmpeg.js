const { spawn } = require('child_process');
const fs = require('fs');

let logger = { debug() {}, info() {}, warn() {} };
try {
  ({ logger } = require('@enterprise/shared'));
} catch {
  /* unit tests may run without package link */
}

function resolveOpusCodec(rtpParameters) {
  const codecs = Array.isArray(rtpParameters?.codecs) ? rtpParameters.codecs : [];
  return (
    codecs.find((c) => String(c?.mimeType || '').toLowerCase() === 'audio/opus') ||
    codecs.find((c) => String(c?.mimeType || '').toLowerCase().startsWith('audio/')) ||
    codecs[0] ||
    null
  );
}

function resolveConsumerOpusPayloadType(consumer) {
  const opusCodec = resolveOpusCodec(consumer?.rtpParameters);
  const pt = Number(opusCodec?.payloadType);
  return Number.isFinite(pt) ? pt : 111;
}

/**
 * Build narrow rtpCapabilities for PlainTransport consume (mediasoup-record pattern).
 * Full router caps can negotiate RTX/feedback FFmpeg cannot handle.
 */
function buildAudioConsumeRtpCapabilities(router, producer) {
  const routerCodecs = Array.isArray(router?.rtpCapabilities?.codecs)
    ? router.rtpCapabilities.codecs
    : [];
  const producerMime = String(producer?.rtpParameters?.codecs?.[0]?.mimeType || 'audio/opus').toLowerCase();
  const matched =
    routerCodecs.find((c) => String(c?.mimeType || '').toLowerCase() === producerMime) ||
    routerCodecs.find((c) => String(c?.mimeType || '').toLowerCase() === 'audio/opus') ||
    routerCodecs.find((c) => String(c?.kind || '').toLowerCase() === 'audio');

  if (!matched) {
    return router.rtpCapabilities;
  }

  return {
    codecs: [
      {
        ...matched,
        rtcpFeedback: [],
      },
    ],
    headerExtensions: Array.isArray(router.rtpCapabilities?.headerExtensions)
      ? router.rtpCapabilities.headerExtensions.filter(
          (ext) => !ext?.kind || String(ext.kind).toLowerCase() === 'audio'
        )
      : [],
  };
}

function buildAudioSdp({
  rtpPort,
  rtcpPort,
  payloadType,
  channels = 2,
  clockRate = 48000,
  ssrc,
  cname = 'voicehub-recorder',
  fmtpParameters,
}) {
  const pt = Number.isFinite(Number(payloadType)) ? Number(payloadType) : 111;
  const ch = Number.isFinite(Number(channels)) && Number(channels) > 0 ? Number(channels) : 2;
  const rate = Number.isFinite(Number(clockRate)) && Number(clockRate) > 0 ? Number(clockRate) : 48000;
  const lines = [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=voicehub-plain-ffmpeg',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    `m=audio ${rtpPort} RTP/AVP ${pt}`,
    `a=rtcp:${rtcpPort}`,
    `a=rtpmap:${pt} opus/${rate}/${ch}`,
  ];

  const fmtp =
    typeof fmtpParameters === 'string' && fmtpParameters.trim()
      ? fmtpParameters.trim()
      : 'minptime=10;useinbandfec=1';
  lines.push(`a=fmtp:${pt} ${fmtp}`);

  if (ssrc != null && Number.isFinite(Number(ssrc))) {
    lines.push(`a=ssrc:${Number(ssrc)} cname:${cname}`);
  }
  lines.push('a=sendonly');
  lines.push('');
  return lines.join('\r\n');
}

function buildAudioSdpFromConsumer({ rtpPort, rtcpPort, consumer }) {
  const codec = resolveOpusCodec(consumer?.rtpParameters);
  const payloadType = Number.isFinite(Number(codec?.payloadType)) ? Number(codec.payloadType) : 111;
  const channels = Number(codec?.channels) > 0 ? Number(codec.channels) : 2;
  const clockRate = Number(codec?.clockRate) > 0 ? Number(codec.clockRate) : 48000;
  const ssrc = consumer?.rtpParameters?.encodings?.[0]?.ssrc;
  const cname = consumer?.rtpParameters?.rtcp?.cname || 'voicehub-recorder';
  let fmtpParameters;
  if (codec?.parameters && typeof codec.parameters === 'object') {
    fmtpParameters = Object.entries(codec.parameters)
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
  }
  return buildAudioSdp({
    rtpPort,
    rtcpPort,
    payloadType,
    channels,
    clockRate,
    ssrc,
    cname,
    fmtpParameters,
  });
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * mediasoup → ffmpeg: consumer tạm pause, ffmpeg listen, connect PlainTransport, rồi resume.
 * SDP phải khớp consumer.rtpParameters (PT, channels, ssrc).
 */
async function startFfmpegRtpListener({
  room,
  producer,
  rtpPort,
  rtcpPort,
  sdpPath,
  outPath,
  ffmpegExtraArgs = [],
  opusBitrateKbps = 16,
  logTag = 'plain-ffmpeg',
}) {
  const plainTransport = await room.router.createPlainTransport({
    listenIp: '127.0.0.1',
    rtcpMux: false,
    comedia: false,
  });

  const consumer = await plainTransport.consume({
    producerId: producer.id,
    rtpCapabilities: buildAudioConsumeRtpCapabilities(room.router, producer),
    paused: true,
  });

  const payloadType = resolveConsumerOpusPayloadType(consumer);
  fs.writeFileSync(sdpPath, buildAudioSdpFromConsumer({ rtpPort, rtcpPort, consumer }));

  const ffmpegArgs = [
    '-loglevel',
    'warning',
    '-protocol_whitelist',
    'file,udp,rtp',
    '-f',
    'sdp',
    '-i',
    sdpPath,
    ...ffmpegExtraArgs,
    '-map',
    '0:a:0',
    '-c:a',
    'libopus',
    '-b:a',
    `${opusBitrateKbps}k`,
    '-application',
    'voip',
    '-f',
    'webm',
    '-y',
    outPath,
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  let ffmpegStderr = '';
  ffmpeg.stderr?.on('data', (chunk) => {
    const msg = String(chunk || '').trim();
    if (!msg) return;
    ffmpegStderr = `${ffmpegStderr}\n${msg}`.slice(-2000);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`[${logTag} ffmpeg] ${msg.slice(0, 200)}`);
    }
  });

  const listenWaitMs = Math.min(
    Math.max(parseInt(process.env.VOICE_RECORDING_FFMPEG_LISTEN_MS || '350', 10) || 350, 100),
    2000
  );
  await waitMs(listenWaitMs);

  await plainTransport.connect({
    ip: '127.0.0.1',
    port: rtpPort,
    rtcpPort,
  });
  await consumer.resume();

  return {
    plainTransport,
    consumer,
    ffmpeg,
    payloadType,
    producerPaused: Boolean(producer.paused),
    getFfmpegStderr: () => ffmpegStderr.trim(),
  };
}

module.exports = {
  resolveConsumerOpusPayloadType,
  buildAudioSdp,
  buildAudioSdpFromConsumer,
  buildAudioConsumeRtpCapabilities,
  startFfmpegRtpListener,
};

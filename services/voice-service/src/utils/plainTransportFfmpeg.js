const { spawn } = require('child_process');
const fs = require('fs');
const { logger } = require('@enterprise/shared');

function resolveConsumerOpusPayloadType(consumer) {
  const codecs = Array.isArray(consumer?.rtpParameters?.codecs) ? consumer.rtpParameters.codecs : [];
  const opusCodec =
    codecs.find((c) => String(c?.mimeType || '').toLowerCase() === 'audio/opus') ||
    codecs.find((c) => String(c?.mimeType || '').toLowerCase().startsWith('audio/')) ||
    codecs[0];
  const pt = Number(opusCodec?.payloadType);
  return Number.isFinite(pt) ? pt : 111;
}

function buildAudioSdp({ rtpPort, rtcpPort, payloadType }) {
  return [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=voicehub-plain-ffmpeg',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    `m=audio ${rtpPort} RTP/AVPF ${payloadType}`,
    `a=rtcp:${rtcpPort}`,
    `a=rtpmap:${payloadType} opus/48000/2`,
    `a=fmtp:${payloadType} minptime=10;useinbandfec=1`,
    '',
  ].join('\r\n');
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * mediasoup → ffmpeg: consumer tạm pause, ffmpeg listen trước, rồi resume consumer.
 * SDP phải khớp payload type sau negotiate (consumer.rtpParameters), không dùng producer.
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

  await plainTransport.connect({
    ip: '127.0.0.1',
    port: rtpPort,
    rtcpPort,
  });

  const consumer = await plainTransport.consume({
    producerId: producer.id,
    rtpCapabilities: room.router.rtpCapabilities,
    paused: true,
  });

  const payloadType = resolveConsumerOpusPayloadType(consumer);
  fs.writeFileSync(sdpPath, buildAudioSdp({ rtpPort, rtcpPort, payloadType }));

  const ffmpegArgs = [
    '-loglevel',
    'warning',
    '-protocol_whitelist',
    'file,udp,rtp',
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
  startFfmpegRtpListener,
};

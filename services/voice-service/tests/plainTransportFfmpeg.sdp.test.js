const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAudioSdp,
  buildAudioSdpFromConsumer,
  resolveConsumerOpusPayloadType,
} = require('../src/utils/plainTransportFfmpeg');

describe('buildAudioSdp', () => {
  it('uses RTP/AVP, sendonly, and ssrc', () => {
    const sdp = buildAudioSdp({
      rtpPort: 50200,
      rtcpPort: 50201,
      payloadType: 111,
      channels: 2,
      clockRate: 48000,
      ssrc: 123456789,
      cname: 'voicehub-recorder',
    });
    assert.match(sdp, /m=audio 50200 RTP\/AVP 111/);
    assert.match(sdp, /a=rtcp:50201/);
    assert.match(sdp, /a=rtpmap:111 opus\/48000\/2/);
    assert.match(sdp, /a=ssrc:123456789 cname:voicehub-recorder/);
    assert.match(sdp, /a=sendonly/);
    assert.doesNotMatch(sdp, /RTP\/AVPF/);
  });

  it('includes channels from args', () => {
    const sdp = buildAudioSdp({
      rtpPort: 5004,
      rtcpPort: 5005,
      payloadType: 100,
      channels: 1,
      ssrc: 1,
    });
    assert.match(sdp, /a=rtpmap:100 opus\/48000\/1/);
  });
});

describe('buildAudioSdpFromConsumer', () => {
  it('reads PT, channels, ssrc from consumer.rtpParameters', () => {
    const consumer = {
      rtpParameters: {
        codecs: [
          {
            mimeType: 'audio/opus',
            payloadType: 100,
            clockRate: 48000,
            channels: 2,
            parameters: { minptime: 10, useinbandfec: 1 },
          },
        ],
        encodings: [{ ssrc: 987654321 }],
        rtcp: { cname: 'test-cname' },
      },
    };
    const sdp = buildAudioSdpFromConsumer({
      rtpPort: 51000,
      rtcpPort: 51001,
      consumer,
    });
    assert.match(sdp, /m=audio 51000 RTP\/AVP 100/);
    assert.match(sdp, /a=ssrc:987654321 cname:test-cname/);
    assert.match(sdp, /a=sendonly/);
    assert.equal(resolveConsumerOpusPayloadType(consumer), 100);
  });
});

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Mic, MicOff, PhoneOff, Users, Volume2, VolumeX, Wifi } from 'lucide-react';
import api from '../../services/api';
import {
  acquireMicStream,
  loadVoiceAudioPrefs,
  saveVoiceAudioPrefs,
} from '../../pages/Voice/voiceAudioPrefs';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { getToken } from '../../utils/tokenStorage';
import { getUserDisplayName } from '../../utils/helpers';
import { resolveAppOrigin } from '../../utils/browserOrigin';
import UserAvatar from '../Shared/UserAvatar';
import { voiceSpeakingRingClass } from '../../utils/avatarDisplay';
import {
  FIGMA_VOICE_CTRL_BTN,
  FIGMA_VOICE_CTRL_BTN_ACTIVE,
  FIGMA_VOICE_CTRL_BTN_DANGER,
  FIGMA_VOICE_CTRL_BTN_IDLE,
  FIGMA_VOICE_CTRL_DIVIDER,
  FIGMA_VOICE_CTRL_END,
  FIGMA_VOICE_CTRL_PILL,
  FIGMA_VOICE_ROOM_ROOT,
  FIGMA_VOICE_STATUS_DOT,
  FIGMA_VOICE_TILE_BASE,
  FIGMA_VOICE_TILE_IDLE,
  FIGMA_VOICE_TILE_SPEAKING,
  FIGMA_VOICE_TOP_BAR,
  FIGMA_VOICE_TOP_META,
  FIGMA_VOICE_WIFI_BADGE,
  FIGMA_VOICE_WIFI_ICON,
  FIGMA_VOICE_WIFI_TEXT,
} from '../Voice/figmaVoiceClasses';

const getSignalBaseUrl = () => resolveAppOrigin() || 'http://127.0.0.1:3000';

const getSignalPath = () => import.meta.env.VITE_VOICE_SIGNAL_PATH || '/voice-socket';

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

function formatCallDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clampVolumePct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100;
}

async function applyRemoteAudioElement(el, { speakerOff, speakerVolume, speakerDeviceId }) {
  if (!el) return;
  el.muted = Boolean(speakerOff);
  el.volume = clampVolumePct(speakerVolume) / 100;
  const sinkId = String(speakerDeviceId || '').trim();
  if (sinkId && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype) {
    try {
      await el.setSinkId(sinkId);
    } catch {
      /* BT/device đổi → fallback loa mặc định */
    }
  }
}

async function bindAndPlayRemoteAudio(el, stream, outputOpts) {
  if (!el || !stream) return;
  await applyRemoteAudioElement(el, outputOpts);
  if (el.srcObject !== stream) {
    el.srcObject = stream;
  }
  try {
    await el.play();
  } catch (err) {
    console.warn('[org-voice] remote play failed', err?.message || err);
  }
}

function collectRtcStatsRows(stats) {
  if (!stats) return [];
  if (Array.isArray(stats)) return stats;
  if (typeof stats.forEach === 'function') {
    const rows = [];
    stats.forEach((v) => rows.push(v));
    return rows;
  }
  return Object.values(stats);
}

/** Dev: kiểm tra có RTP vào consumer sau vài giây (lỗi ICE im lặng). */
async function warnIfNoInboundRtp(consumer, label, { recvState } = {}) {
  if (!import.meta.env.DEV || !consumer?.getStats) return;
  await new Promise((r) => setTimeout(r, 4500));
  try {
    const stats = await consumer.getStats();
    const rows = collectRtcStatsRows(stats);
    const inbound = rows.find(
      (s) =>
        s &&
        s.type === 'inbound-rtp' &&
        (s.kind === 'audio' || !s.kind) &&
        (Number(s.bytesReceived) > 0 || Number(s.packetsReceived) > 0)
    );
    if (!inbound) {
      const hints = [
        'MEDIASOUP_ANNOUNCED_IP = dev WiFi IP (not 127.0.0.1 inside Docker)',
        'firewall UDP/TCP 40000-40100',
        'hosts: only 1 entry for voicehub.local (dev may be 127.0.0.1; LAN dev is WiFi IP)',
        'two tabs: enable mic per account (no shared mute)',
      ];
      if (recvState && recvState !== 'connected') {
        hints.unshift(`recv transport: ${recvState}`);
      }
      console.warn(`[org-voice] Không có RTP từ "${label}" — ${hints.join('; ')}`);
    }
  } catch {
    /* ignore */
  }
}

const LOCAL_SPEAKING_RMS = 0.04;
const REMOTE_SPEAKING_RMS = 0.018;

/**
 * Kênh thoại workspace tổ chức: danh sách avatar + tên, mediasoup audio-only, viền sáng khi đang nói.
 */
export default function OrganizationVoiceChannelView({
  channelId,
  channelDisplayName = '',
  organizationId = '',
  channelLabel = '',
  isDarkMode,
  canVoice,
  landingDemo = false,
  onConnectionStateChange,
  onAudioStateChange,
  onControlActionsReady,
  onRoomSessionEnd,
  onDisconnect,
  micDeviceId: micDeviceIdProp = '',
  speakerDeviceId: speakerDeviceIdProp = '',
  speakerVolume: speakerVolumeProp,
}) {
  const { user } = useAuth();
  const { locale } = useLocale();
  const { t } = useAppStrings();
  const voiceUserId = user?.id || user?._id || user?.userId || '';

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState([]);
  const initialAudioPrefs = loadVoiceAudioPrefs(voiceUserId);
  const [isMuted, setIsMuted] = useState(Boolean(initialAudioPrefs.micMuted));
  const [isSpeakerOff, setIsSpeakerOff] = useState(Boolean(initialAudioPrefs.speakerOff));
  const speakerDeviceId = String(speakerDeviceIdProp || initialAudioPrefs.speakerDeviceId || '').trim();
  const micDeviceId = String(micDeviceIdProp || initialAudioPrefs.micDeviceId || '').trim();
  const speakerVolume =
    speakerVolumeProp !== undefined && speakerVolumeProp !== null
      ? clampVolumePct(speakerVolumeProp)
      : clampVolumePct(initialAudioPrefs.speakerVolume);

  const remoteOutputOpts = useMemo(
    () => ({ speakerOff: isSpeakerOff, speakerVolume, speakerDeviceId }),
    [isSpeakerOff, speakerVolume, speakerDeviceId]
  );
  const remoteOutputOptsRef = useRef(remoteOutputOpts);
  useEffect(() => {
    remoteOutputOptsRef.current = remoteOutputOpts;
  }, [remoteOutputOpts]);
  /** Năng lượng tín hiệu mic local (luôn theo track); UI chỉ sáng viền khi !isMuted */
  const [localVoiceEnergy, setLocalVoiceEnergy] = useState(false);
  const [remoteSpeakingMap, setRemoteSpeakingMap] = useState({});
  const [joinedAtMs, setJoinedAtMs] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const currentRoomRef = useRef('');
  const audioElsRef = useRef(new Map());
  const audioLevelMonitorsRef = useRef(new Map());
  const teardownRef = useRef(null);
  const mediasoupRef = useRef({
    socket: null,
    device: null,
    sendTransport: null,
    recvTransport: null,
    audioProducer: null,
    videoProducer: null,
    consumers: new Map(),
    localStream: null,
    remoteStreams: new Map(),
  });

  const localDisplayName =
    getUserDisplayName(user) || user?.email?.split('@')[0] || t('orgPanel.you');
  const localAvatar = user?.avatar || user?.profile?.avatar || null;

  useEffect(() => {
    if (!onConnectionStateChange) return;
    onConnectionStateChange('idle');
    return () => onConnectionStateChange('idle');
  }, [onConnectionStateChange, channelId]);

  useEffect(() => {
    onAudioStateChange?.({
      isMuted,
      isSpeakerOff,
      canToggleMute: Boolean(mediasoupRef.current.audioProducer),
    });
  }, [isMuted, isSpeakerOff, joining, onAudioStateChange]);

  const stopAudioLevelMonitor = (key) => {
    const monitor = audioLevelMonitorsRef.current.get(key);
    if (!monitor) return;
    if (monitor.rafId) cancelAnimationFrame(monitor.rafId);
    try {
      monitor.source?.disconnect();
      monitor.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    monitor.audioContext?.close?.().catch?.(() => {});
    audioLevelMonitorsRef.current.delete(key);
  };

  const startAudioLevelMonitor = (key, stream, onSpeakingChange, rmsThreshold = LOCAL_SPEAKING_RMS) => {
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    stopAudioLevelMonitor(key);

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      void audioContext.resume?.().catch?.(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let lastSpeaking = false;

      const detect = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const speaking = rms > rmsThreshold;
        if (speaking !== lastSpeaking) {
          lastSpeaking = speaking;
          onSpeakingChange(speaking);
        }
        const monitor = audioLevelMonitorsRef.current.get(key);
        if (monitor) {
          monitor.rafId = requestAnimationFrame(detect);
        }
      };

      audioLevelMonitorsRef.current.set(key, {
        audioContext,
        analyser,
        source,
        rafId: requestAnimationFrame(detect),
      });
    } catch (e) {
      console.warn('startAudioLevelMonitor failed', e);
    }
  };

  const addOrUpdateParticipant = (payload) => {
    setParticipants((prev) => {
      const index = prev.findIndex((p) => p.socketId === payload.socketId);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], ...payload };
        return next;
      }
      return [...prev, payload];
    });
  };

  const removeParticipant = (socketId) => {
    setParticipants((prev) => prev.filter((item) => item.socketId !== socketId));
  };

  useEffect(() => {
    if (!joinedAtMs || landingDemo || !channelId || !canVoice) {
      setElapsedSec(0);
      return undefined;
    }
    setElapsedSec(Math.max(0, Math.floor((Date.now() - joinedAtMs) / 1000)));
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - joinedAtMs) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [joinedAtMs, landingDemo, channelId, canVoice]);

  const elapsedLabel = useMemo(() => {
    if (!joinedAtMs || landingDemo || !channelId || !canVoice) {
      return '00:00';
    }
    return formatCallDuration(elapsedSec);
  }, [joinedAtMs, elapsedSec, channelId, landingDemo, canVoice]);

  useEffect(() => {
    participants.forEach((participant) => {
      const key = `remote:${participant.socketId}`;
      if (participant.stream) {
        startAudioLevelMonitor(
          key,
          participant.stream,
          (speaking) => {
            setRemoteSpeakingMap((prev) => {
              if (prev[participant.socketId] === speaking) return prev;
              return { ...prev, [participant.socketId]: speaking };
            });
          },
          REMOTE_SPEAKING_RMS
        );
      }
    });

    const activeRemoteKeys = new Set(participants.map((p) => `remote:${p.socketId}`));
    for (const key of [...audioLevelMonitorsRef.current.keys()]) {
      if (key.startsWith('remote:') && !activeRemoteKeys.has(key)) {
        stopAudioLevelMonitor(key);
      }
    }
  }, [participants]);

  useEffect(() => {
    participants.forEach((p) => {
      if (!p.stream) return;
      const el = audioElsRef.current.get(p.socketId);
      if (el) {
        void bindAndPlayRemoteAudio(el, p.stream, remoteOutputOpts);
      }
    });
  }, [participants, remoteOutputOpts]);

  useEffect(() => {
    audioElsRef.current.forEach((el) => {
      void applyRemoteAudioElement(el, remoteOutputOpts);
    });
  }, [remoteOutputOpts]);

  useEffect(() => {
    if (!channelId || landingDemo || !canVoice) return undefined;

    let cancelled = false;
    /** Current join-session socket — do not read ref after teardown (avoid "No socket"). */
    let voiceSocket = null;
    let recvPipelineReady = false;
    const pendingAudioProducers = [];

    const requestSocket = (eventName, payload) =>
      new Promise((resolve, reject) => {
        if (cancelled) {
          reject(new Error('Voice join cancelled'));
          return;
        }
        const socket = voiceSocket ?? mediasoupRef.current.socket;
        if (!socket?.connected) {
          reject(new Error('No socket'));
          return;
        }
        socket.emit(eventName, payload, (response) => {
          if (!response?.success) {
            reject(new Error(response?.error || `Socket request failed: ${eventName}`));
            return;
          }
          resolve(response);
        });
      });

    const abortIfCancelled = () => {
      if (cancelled) {
        throw new Error('Voice join cancelled');
      }
    };

    const ensureRemoteParticipant = (producerMeta) => {
      addOrUpdateParticipant({
        socketId: producerMeta.socketId,
        userId: producerMeta.userId,
        displayName: producerMeta.displayName || t('orgPanel.member'),
        stream: null,
      });
    };

    const consumeProducer = async (producerMeta) => {
      const { recvTransport, device } = mediasoupRef.current;
      if (!recvTransport || !device) return;
      const producerId = String(producerMeta?.producerId || '');
      if (!producerId) return;

      // Tránh consume trùng cùng 1 producer (có thể xảy ra khi event/new list bắn sát nhau).
      const alreadyConsumed = Array.from(mediasoupRef.current.consumers.values()).some(
        (c) => String(c?.appData?.producerId || '') === producerId
      );
      if (alreadyConsumed) return;

      ensureRemoteParticipant(producerMeta);

      const consumeResp = await requestSocket('voice:consume', {
        roomId: currentRoomRef.current,
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumerParams = consumeResp.consumer;
      const consumer = await recvTransport.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
        appData: { producerId },
      });

      mediasoupRef.current.consumers.set(consumer.id, consumer);

      const currentStream =
        mediasoupRef.current.remoteStreams.get(producerMeta.socketId) || new MediaStream();
      currentStream.addTrack(consumer.track);
      mediasoupRef.current.remoteStreams.set(producerMeta.socketId, currentStream);

      addOrUpdateParticipant({
        socketId: producerMeta.socketId,
        userId: producerMeta.userId,
        displayName: producerMeta.displayName || t('orgPanel.member'),
        stream: currentStream,
      });

      await requestSocket('voice:resumeConsumer', {
        roomId: currentRoomRef.current,
        consumerId: consumer.id,
      });
      // mediasoup-demo: resume server + client — track remote mặc định có thể disabled.
      consumer.resume();
      if (consumer.track) {
        consumer.track.enabled = true;
      }

      const el = audioElsRef.current.get(producerMeta.socketId);
      if (el) {
        void bindAndPlayRemoteAudio(el, currentStream, remoteOutputOptsRef.current);
      } else {
        // Participant row + <audio> có thể chưa mount — effect/ref callback sẽ play sau.
        requestAnimationFrame(() => {
          const lateEl = audioElsRef.current.get(producerMeta.socketId);
          if (lateEl) {
            void bindAndPlayRemoteAudio(lateEl, currentStream, remoteOutputOptsRef.current);
          }
        });
      }

      const speakKey = `remote:${producerMeta.socketId}`;
      startAudioLevelMonitor(
        speakKey,
        currentStream,
        (speaking) => {
          setRemoteSpeakingMap((prev) => {
            if (prev[producerMeta.socketId] === speaking) return prev;
            return { ...prev, [producerMeta.socketId]: speaking };
          });
        },
        REMOTE_SPEAKING_RMS
      );

      if (consumer.track) {
        consumer.track.addEventListener('mute', () => {
          if (consumer.track.muted) {
            setRemoteSpeakingMap((prev) => ({ ...prev, [producerMeta.socketId]: false }));
          }
        });
      }

      void warnIfNoInboundRtp(consumer, producerMeta.displayName || producerMeta.socketId, {
        recvState: mediasoupRef.current.recvTransport?.connectionState,
      });
    };

    const ingestRemoteProducer = async (producerMeta) => {
      if (producerMeta?.kind !== 'audio') return;
      if (!recvPipelineReady || !mediasoupRef.current.recvTransport) {
        pendingAudioProducers.push(producerMeta);
        return;
      }
      try {
        await consumeProducer(producerMeta);
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('Router cannot consume producer')) {
          try {
            await new Promise((r) => setTimeout(r, 500));
            const latest = await requestSocket('voice:getProducers', {
              roomId: currentRoomRef.current,
            });
            const hit = (latest?.producers || []).find(
              (p) => String(p?.producerId || '') === String(producerMeta?.producerId || '')
            );
            if (hit?.kind === 'audio') {
              await consumeProducer(hit);
              return;
            }
          } catch (retryErr) {
            console.error('[org-voice] consume retry failed', retryErr);
          }
        }
        console.error('[org-voice] consume producer failed', e);
      }
    };

    const flushPendingProducers = async () => {
      while (pendingAudioProducers.length > 0) {
        const meta = pendingAudioProducers.shift();
        await ingestRemoteProducer(meta);
      }
    };

    const teardown = async () => {
      const { socket, audioProducer, sendTransport, recvTransport, consumers, localStream } =
        mediasoupRef.current;

      if (socket?.connected) {
        socket.emit('voice:leaveRoom', { roomId: currentRoomRef.current });
      }
      for (const consumer of consumers.values()) {
        try {
          consumer.close();
        } catch {
          /* ignore */
        }
      }
      consumers.clear();
      audioProducer?.close();
      sendTransport?.close();
      recvTransport?.close();
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      mediasoupRef.current.localStream = null;
      mediasoupRef.current.audioProducer = null;
      mediasoupRef.current.sendTransport = null;
      mediasoupRef.current.recvTransport = null;
      mediasoupRef.current.device = null;
      stopAudioLevelMonitor('local');
      for (const key of [...audioLevelMonitorsRef.current.keys()]) {
        if (key.startsWith('remote:')) stopAudioLevelMonitor(key);
      }
      setRemoteSpeakingMap({});
      setLocalVoiceEnergy(false);
      setParticipants([]);
      mediasoupRef.current.remoteStreams.clear();
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      if (mediasoupRef.current.socket === socket) {
        mediasoupRef.current.socket = null;
      }
      if (voiceSocket === socket) {
        voiceSocket = null;
      }
      setJoinedAtMs(null);
      setElapsedSec(0);
      onConnectionStateChange?.('idle');
    };

    teardownRef.current = teardown;

    (async () => {
      try {
        setJoining(true);
        onConnectionStateChange?.('connecting');
        setError('');
        setParticipants([]);
        setRemoteSpeakingMap({});
        currentRoomRef.current = String(channelId);

        await api.get(`/voice/rooms/${encodeURIComponent(String(channelId))}/bootstrap`, {
          skipGlobalErrorHandling: true,
        }).catch(() => null);

        const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
        if (!mediaDevices?.getUserMedia) {
          throw new Error(t('orgPanel.voiceMediaUnsupported'));
        }
        const joinPrefs = loadVoiceAudioPrefs(voiceUserId);
        const localStream = await acquireMicStream(micDeviceId);
        const joinAudioTrack = localStream.getAudioTracks()[0];
        if (joinAudioTrack && joinPrefs.micMuted) {
          joinAudioTrack.enabled = false;
        }
        mediasoupRef.current.localStream = localStream;

        stopAudioLevelMonitor('local');
        startAudioLevelMonitor('local', localStream, (speaking) => {
          setLocalVoiceEnergy(speaking);
        });

        const token = normalizeToken(getToken()) || normalizeToken(localStorage.getItem('token'));
        const socket = io(`${getSignalBaseUrl()}/voice`, {
          path: getSignalPath(),
          // Qua reverse proxy HTTPS, ưu tiên polling trước để giảm lỗi WS handshake sớm.
          transports: ['polling', 'websocket'],
          auth: token ? { token } : {},
        });
        mediasoupRef.current.socket = socket;
        voiceSocket = socket;

        if (cancelled) {
          teardown();
          return;
        }

        socket.on('voice:peerJoined', (payload) => {
          if (cancelled || !voiceSocket?.connected) return;
          addOrUpdateParticipant({
            socketId: payload.socketId,
            userId: payload.userId,
            displayName: payload.displayName || t('orgPanel.member'),
            stream: mediasoupRef.current.remoteStreams.get(payload.socketId) || null,
          });
        });

        socket.on('voice:peerLeft', (payload) => {
          if (cancelled || !voiceSocket?.connected) return;
          removeParticipant(payload.socketId);
          stopAudioLevelMonitor(`remote:${payload.socketId}`);
          setRemoteSpeakingMap((prev) => {
            const next = { ...prev };
            delete next[payload.socketId];
            return next;
          });
          const stream = mediasoupRef.current.remoteStreams.get(payload.socketId);
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            mediasoupRef.current.remoteStreams.delete(payload.socketId);
          }
          audioElsRef.current.delete(payload.socketId);
        });

        socket.on('voice:roomClosed', (payload) => {
          if (cancelled || !voiceSocket?.connected) return;
          onRoomSessionEnd?.(payload);
        });

        socket.on('voice:newProducer', (producerMeta) => {
          void ingestRemoteProducer(producerMeta);
        });

        await new Promise((resolve, reject) => {
          if (socket.connected) {
            resolve();
            return;
          }
          const onConnect = () => {
            socket.off('connect_error', onError);
            resolve();
          };
          const onError = (err) => {
            socket.off('connect', onConnect);
            reject(err);
          };
          socket.once('connect', onConnect);
          socket.once('connect_error', onError);
        });

        if (cancelled) {
          teardown();
          return;
        }

        const mediasoupModule = await import('mediasoup-client');
        abortIfCancelled();
        const DeviceClass = mediasoupModule.Device;

        const joinResp = await requestSocket('voice:joinRoom', {
          roomId: String(channelId),
          displayName: localDisplayName,
          organizationId: organizationId || undefined,
          channelLabel: channelLabel || channelDisplayName || undefined,
        });
        const device = new DeviceClass();
        await device.load({ routerRtpCapabilities: joinResp.rtpCapabilities });
        mediasoupRef.current.device = device;
        if (!device.canProduce('audio')) {
          throw new Error(t('orgPanel.voiceCodecUnsupported'));
        }

        const sendTransportData = await requestSocket('voice:createTransport', {
          roomId: String(channelId),
          direction: 'send',
        });
        const sendTransport = device.createSendTransport(sendTransportData.transport);
        mediasoupRef.current.sendTransport = sendTransport;

        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          requestSocket('voice:connectTransport', {
            roomId: String(channelId),
            transportId: sendTransport.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch(errback);
        });

        sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
          requestSocket('voice:produce', {
            roomId: String(channelId),
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          })
            .then((resp) => callback({ id: resp.producerId }))
            .catch(errback);
        });

        const recvTransportData = await requestSocket('voice:createTransport', {
          roomId: String(channelId),
          direction: 'recv',
        });
        const recvTransport = device.createRecvTransport(recvTransportData.transport);
        mediasoupRef.current.recvTransport = recvTransport;

        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          requestSocket('voice:connectTransport', {
            roomId: String(channelId),
            transportId: recvTransport.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch(errback);
        });

        recvTransport.on('connectionstatechange', (state) => {
          if (import.meta.env.DEV) {
            console.info('[org-voice] recv transport:', state);
          }
          if (state === 'failed') {
            toast.error(t('orgPanel.voiceConnectError'));
            setError(t('orgPanel.voiceConnectError'));
          }
        });

        recvPipelineReady = true;

        const producersResp = await requestSocket('voice:getProducers', { roomId: String(channelId) });
        for (const producerMeta of producersResp.producers || []) {
          await ingestRemoteProducer(producerMeta);
        }
        await flushPendingProducers();

        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          mediasoupRef.current.audioProducer = await sendTransport.produce({
            track: audioTrack,
            appData: { mediaTag: 'audio' },
          });
        }

        const wantMuted = loadVoiceAudioPrefs(voiceUserId).micMuted;
        if (mediasoupRef.current.audioProducer) {
          if (wantMuted) {
            await mediasoupRef.current.audioProducer.pause();
          } else {
            await mediasoupRef.current.audioProducer.resume();
          }
        }
        if (audioTrack) {
          audioTrack.enabled = !wantMuted;
        }
        setIsMuted(wantMuted);
        if (import.meta.env.DEV && wantMuted) {
          console.info('[org-voice] Mic đang mute (prefs tài khoản này) — bật mic để gửi RTP.');
        }
        // Chỉ bắt đầu đồng hồ khi join/produce thành công và room đã vào trạng thái connected.
        setJoinedAtMs(Date.now());
        setElapsedSec(0);
        onConnectionStateChange?.('connected');
      } catch (e) {
        if (cancelled || e?.message === 'Voice join cancelled') return;
        console.error(e);
        const msg = e?.message || t('orgPanel.voiceConnectError');
        setError(msg);
        onConnectionStateChange?.('error');
        toast.error(msg);
        setJoinedAtMs(null);
        setElapsedSec(0);
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();

    return () => {
      cancelled = true;
      teardownRef.current = null;
      teardown();
    };
  }, [channelId, landingDemo, canVoice]);

  /** Đổi mic trong Cài đặt giọng nói khi đang ở kênh — thay track producer thay vì chờ rời/vào lại. */
  useEffect(() => {
    if (!joinedAtMs || landingDemo || !canVoice || !micDeviceId) return undefined;
    const producer = mediasoupRef.current.audioProducer;
    if (!producer) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const stream = await acquireMicStream(micDeviceId);
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) return;
        const wantMuted = loadVoiceAudioPrefs(voiceUserId).micMuted;
        newTrack.enabled = !wantMuted;
        await producer.replaceTrack({ track: newTrack });
        const old = mediasoupRef.current.localStream;
        old?.getTracks?.().forEach((tr) => {
          try {
            tr.stop();
          } catch {
            /* ignore */
          }
        });
        mediasoupRef.current.localStream = stream;
        stopAudioLevelMonitor('local');
        startAudioLevelMonitor('local', stream, (speaking) => {
          setLocalVoiceEnergy(speaking);
        });
      } catch (e) {
        console.warn('[org-voice] mic device switch failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [micDeviceId]);

  const handleLeaveVoice = async () => {
    try {
      await teardownRef.current?.();
    } catch {
      /* ignore */
    }
    setJoining(false);
    setError('');
    onConnectionStateChange?.('idle');
    onDisconnect?.();
  };

  const toggleMute = async () => {
    const next = !isMuted;
    const producer = mediasoupRef.current.audioProducer;
    const localTrack = mediasoupRef.current.localStream?.getAudioTracks?.()?.[0];
    if (producer) {
      if (next) {
        await producer.pause();
      } else {
        await producer.resume();
      }
    }
    if (localTrack) {
      localTrack.enabled = !next;
    }
    saveVoiceAudioPrefs({ micMuted: next }, voiceUserId);
    setIsMuted(next);
  };

  const sortedRemote = useMemo(() => {
    const LOCALE_TAG_EN = 'en';
    const LOCALE_TAG_VI = 'vi';
    return [...participants].sort((a, b) =>
      String(a.displayName || '').localeCompare(
        String(b.displayName || ''),
        locale === 'en' ? LOCALE_TAG_EN : LOCALE_TAG_VI
      )
    );
  }, [participants, locale]);

  const toggleSpeaker = () => {
    setIsSpeakerOff((prev) => {
      const next = !prev;
      saveVoiceAudioPrefs({ speakerOff: next }, voiceUserId);
      return next;
    });
  };

  const unlockAllRemoteAudio = () => {
    audioElsRef.current.forEach((el) => {
      if (el?.srcObject) void el.play().catch(() => {});
    });
  };

  const connected = Boolean(joinedAtMs && !joining && !error);
  const channelTitle = channelDisplayName || t('organizations.voiceChannelPh');
  const statusText = landingDemo
    ? t('orgPanel.voiceDemoHint')
    : connected
      ? t('orgPanel.voiceConnectedNow')
      : joining
        ? t('orgPanel.voiceConnecting')
        : t('voiceRoom.connected');
  const participantRows = landingDemo
    ? [
        {
          id: 'local',
          name: localDisplayName,
          avatar: localAvatar,
          userId: voiceUserId,
          speaking: false,
          muted: isMuted,
          isLocal: true,
        },
      ]
    : [
        {
          id: 'local',
          name: localDisplayName,
          avatar: localAvatar,
          userId: voiceUserId,
          speaking: localVoiceEnergy && !isMuted,
          muted: isMuted,
          isLocal: true,
        },
        ...sortedRemote.map((p) => ({
          id: p.socketId,
          name: p.displayName || p.userId || t('orgPanel.member'),
          userId: p.userId,
          speaking: Boolean(remoteSpeakingMap[p.socketId]),
          muted: false,
          isLocal: false,
        })),
      ];

  const stageTone = isDarkMode
    ? {
        root: FIGMA_VOICE_ROOM_ROOT,
        top: 'relative mx-5 mt-5 flex shrink-0 flex-wrap items-center gap-2 rounded-full border border-white/10 bg-surface-raised/95 px-4 py-2 text-sm text-foreground shadow-xl backdrop-blur-md',
        panel: 'border-white/10 bg-[#111827]',
        tile: `${FIGMA_VOICE_TILE_BASE} ${FIGMA_VOICE_TILE_IDLE}`,
        tileActive: FIGMA_VOICE_TILE_SPEAKING,
        muted: 'text-muted-foreground',
        sub: 'text-muted-foreground',
        control: FIGMA_VOICE_CTRL_PILL,
      }
    : {
        root: 'relative flex min-h-0 flex-1 flex-col bg-slate-50 text-slate-950',
        top: 'mx-5 mt-5 flex shrink-0 flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm shadow-xl backdrop-blur-md',
        panel: 'border-slate-200 bg-white',
        tile: 'relative flex min-h-[190px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-5',
        tileActive: 'border-success shadow-[0_0_22px_rgba(16,185,129,0.18)]',
        muted: 'text-slate-600',
        sub: 'text-slate-500',
        control: 'border-slate-200 bg-white/95',
      };

  if (!canVoice && !landingDemo) {
    return (
      <div className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-none ${stageTone.root}`}>
        <div className={`max-w-md rounded-2xl border p-8 text-center shadow-sm ${stageTone.panel}`}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <MicOff className="h-6 w-6" aria-hidden />
          </div>
          <p className={`text-sm ${stageTone.muted}`}>{t('orgPanel.voiceNoMicPermission')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full min-h-[520px] flex-1 overflow-hidden rounded-none ${stageTone.root}`}
      onClick={unlockAllRemoteAudio}
      role="presentation"
    >
      {!landingDemo ? (
        <div className="sr-only" aria-hidden>
          {sortedRemote.map((p) => (
            <audio
              key={p.socketId}
              ref={(el) => {
                if (el) {
                  audioElsRef.current.set(p.socketId, el);
                  if (p.stream) {
                    void bindAndPlayRemoteAudio(el, p.stream, remoteOutputOpts);
                  } else {
                    void applyRemoteAudioElement(el, remoteOutputOpts);
                  }
                } else {
                  audioElsRef.current.delete(p.socketId);
                }
              }}
              autoPlay
            />
          ))}
        </div>
      ) : null}
      <VoiceControlBridge
        onControlActionsReady={onControlActionsReady}
        toggleMute={toggleMute}
        disconnect={handleLeaveVoice}
        toggleSpeaker={toggleSpeaker}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={`${stageTone.top} shadow-xl backdrop-blur-md`}>
          <span
            className={connected || landingDemo ? FIGMA_VOICE_STATUS_DOT : 'h-2 w-2 shrink-0 rounded-full bg-warning shadow-[0_0_6px] shadow-warning'}
            title={statusText}
          />
          <span className="min-w-0 max-w-[16rem] truncate font-semibold">{channelTitle}</span>
          <span className={stageTone.sub}>|</span>
          <Users className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="tabular-nums">{participantRows.length}</span>
          <span className={stageTone.sub}>|</span>
          <span className={FIGMA_VOICE_WIFI_BADGE}>
            <Wifi className={FIGMA_VOICE_WIFI_ICON} aria-hidden />
            <span className={FIGMA_VOICE_WIFI_TEXT}>{statusText}</span>
          </span>
          <span className={`ml-auto font-mono text-xs tabular-nums ${connected ? 'text-success' : stageTone.muted}`}>
            {landingDemo ? '01:14:16' : joining ? '...' : elapsedLabel}
          </span>
        </div>

        {error && !joining ? (
          <div className="mx-5 mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-5">
          <div className="grid content-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {participantRows.map((p) => (
              <div
                key={p.id}
                className={`relative flex min-h-[190px] flex-col items-center justify-center rounded-2xl border p-5 transition ${
                  p.speaking ? stageTone.tileActive : stageTone.tile
                }`}
              >
                <UserAvatar
                  avatar={p.avatar}
                  userId={p.userId}
                  name={p.name}
                  size="xl"
                  ringClassName={voiceSpeakingRingClass(p.speaking)}
                />
                <div className="mt-4 max-w-full truncate text-sm font-semibold">
                  {p.name}
                  {p.isLocal ? (
                    <span className={`ml-1 font-normal ${stageTone.sub}`}>({t('orgPanel.you')})</span>
                  ) : null}
                </div>
                <div className={`mt-1 text-xs ${stageTone.muted}`}>
                  {p.speaking ? t('voiceRoom.connected') : t('voiceRoom.orgVoiceStageHint')}
                </div>
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                  {p.muted ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-destructive text-white">
                      <MicOff className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success/15 text-success">
                      <Mic className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-20 flex justify-center px-5">
          <div className={`pointer-events-auto flex max-w-[min(100%,34rem)] items-center justify-center gap-1.5 overflow-x-auto rounded-full border px-3 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl ${stageTone.control}`}>
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? t('voiceRoom.micOff') : t('voiceRoom.micOn')}
              className={`${FIGMA_VOICE_CTRL_BTN} ${isMuted ? FIGMA_VOICE_CTRL_BTN_DANGER : FIGMA_VOICE_CTRL_BTN_ACTIVE}`}
            >
              {isMuted ? (
                <MicOff className="h-[17px] w-[17px] text-white" aria-hidden />
              ) : (
                <Mic className="h-[17px] w-[17px] text-white" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={toggleSpeaker}
              title={isSpeakerOff ? t('orgPanel.voiceSpeakerOff') : t('orgPanel.voiceSpeakerOn')}
              className={`${FIGMA_VOICE_CTRL_BTN} ${isSpeakerOff ? FIGMA_VOICE_CTRL_BTN_DANGER : FIGMA_VOICE_CTRL_BTN_IDLE}`}
            >
              {isSpeakerOff ? (
                <VolumeX className="h-[17px] w-[17px] text-white" aria-hidden />
              ) : (
                <Volume2 className="h-[17px] w-[17px] text-white" aria-hidden />
              )}
            </button>
            <div className={FIGMA_VOICE_CTRL_DIVIDER} aria-hidden />
            <button
              type="button"
              onClick={handleLeaveVoice}
              className={FIGMA_VOICE_CTRL_END}
              title={t('voiceRoom.endCall')}
            >
              <PhoneOff className="h-4 w-4 text-white" aria-hidden />
              <span>{t('voiceRoom.endShort')}</span>
            </button>
          </div>
        </div>
      </div>

      <aside className={`hidden h-full w-[280px] shrink-0 flex-col border-l lg:flex ${stageTone.panel}`}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div>
            <div className="text-sm font-bold">{t('voiceRoom.orgVoiceMembers')}</div>
            <div className={`text-xs ${stageTone.sub}`}>{channelTitle}</div>
          </div>
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-1.5">
            {participantRows.map((p) => (
              <div key={`member-${p.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-muted">
                <UserAvatar
                  avatar={p.avatar}
                  userId={p.userId}
                  name={p.name}
                  size="sm"
                  ringClassName={voiceSpeakingRingClass(p.speaking)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {p.name}
                    {p.isLocal ? (
                      <span className={`ml-1 font-normal ${stageTone.sub}`}>({t('orgPanel.you')})</span>
                    ) : null}
                  </div>
                  <div className={`text-xs ${p.speaking ? 'text-success' : stageTone.sub}`}>
                    {p.speaking ? t('voiceRoom.connected') : t('voiceRoom.orgVoiceStageHint')}
                  </div>
                </div>
                {p.muted ? <MicOff className="h-4 w-4 shrink-0 text-destructive" aria-hidden /> : null}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function VoiceControlBridge({ onControlActionsReady, toggleMute, toggleSpeaker, disconnect }) {
  useEffect(() => {
    onControlActionsReady?.({ toggleMute, toggleSpeaker, disconnect });
  }, [onControlActionsReady, toggleMute, toggleSpeaker, disconnect]);
  return null;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  Calendar,
  ChevronUp,
  FileText,
  Heart,
  LogIn,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MoreHorizontal,
  Plus,
  Share2,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import apiClient from '../../services/api/apiClient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';

/** Nút thanh họp: icon + (badge) + chevron + nhãn — tham chiếu layout Zoom/Teams (hình 1) */
function VoiceToolbarControl({
  label,
  icon: Icon,
  iconOff,
  onClick,
  chevron = true,
  badge,
  active = true,
}) {
  const OffIcon = iconOff || Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
    >
      <div className="flex items-center justify-center gap-0.5">
        {active ? (
          <Icon className="h-6 w-6 shrink-0 text-white" strokeWidth={1.75} />
        ) : (
          <OffIcon className="h-6 w-6 shrink-0 text-red-400" strokeWidth={1.75} />
        )}
        {badge != null && (
          <span className="text-xs font-semibold tabular-nums text-white/90">{badge}</span>
        )}
        {chevron && <ChevronUp className="h-3 w-3 shrink-0 text-white/40" aria-hidden />}
      </div>
      <span className="max-w-[72px] text-center text-[11px] leading-tight text-white/60 group-hover:text-white/85">
        {label}
      </span>
    </button>
  );
}

const getSignalBaseUrl = () => {
  const explicit = import.meta.env.VITE_VOICE_SIGNAL_URL;
  if (explicit) return explicit;
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return apiUrl.replace(/\/api\/?$/, '');
};

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

function VoiceRoomPage({ landingDemo = false } = {}) {
  const navigate = useLandingSafeNavigate(landingDemo);
  const { roomId } = useParams();
  const safeRoomId = roomId?.startsWith(':') ? roomId.slice(1) || '' : roomId || '';
  const { user } = useAuth();
  const { isDarkMode } = useTheme();

  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasLocalVideoTrack, setHasLocalVideoTrack] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [remoteSpeakingMap, setRemoteSpeakingMap] = useState({});
  const [joining, setJoining] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [viewStage, setViewStage] = useState('home'); // home | prejoin | inRoom
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [meetingCode, setMeetingCode] = useState(safeRoomId || '');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [clockTick, setClockTick] = useState(0);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [prejoinAudioEnabled, setPrejoinAudioEnabled] = useState(true);
  const [prejoinVideoEnabled, setPrejoinVideoEnabled] = useState(true);

  const localVideoRef = useRef(null);
  const prejoinVideoRef = useRef(null);
  const prejoinStreamRef = useRef(null);
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
  const currentRoomRef = useRef(safeRoomId || 'room1');
  const audioLevelMonitorsRef = useRef(new Map());

  const localDisplayName = useMemo(
    () => user?.displayName || user?.fullName || user?.name || user?.email?.split('@')[0] || 'Bạn',
    [user]
  );
  const localAvatar = user?.avatar || null;

  useEffect(() => {
    setDisplayNameInput((prev) => (prev.trim() ? prev : localDisplayName));
  }, [localDisplayName]);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (viewStage !== 'inRoom') {
      setCallDurationSec(0);
      return undefined;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setCallDurationSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [viewStage, activeRoomId]);

  const totalParticipants = useMemo(() => participants.length + 1, [participants.length]);
  const currentMeetingCode = useMemo(() => activeRoomId || safeRoomId || 'room1', [activeRoomId, safeRoomId]);

  const generateMeetingCode = () => `room-${Math.random().toString(36).slice(2, 8)}`;

  const buildInitials = (name) => {
    const words = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return 'U';
    return words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');
  };

  const stopAudioLevelMonitor = (key) => {
    const monitor = audioLevelMonitorsRef.current.get(key);
    if (!monitor) return;
    if (monitor.rafId) cancelAnimationFrame(monitor.rafId);
    monitor.source?.disconnect?.();
    monitor.audioContext?.close?.().catch(() => {});
    audioLevelMonitorsRef.current.delete(key);
  };

  const startAudioLevelMonitor = (key, stream, onSpeakingChange) => {
    if (!stream || audioLevelMonitorsRef.current.has(key)) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
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
        const speaking = rms > 0.04;
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
    } catch (monitorError) {
      console.warn('startAudioLevelMonitor failed', monitorError);
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

  /**
   * Gỡ preview trước khi vào phòng.
   * @param {{ keepStreamForRoom?: boolean }} opts — nếu true: stream đã chuyển sang `mediasoupRef.localStream`,
   *   KHÔNG được stop track (nếu stop sẽ làm mất hình trong phòng và hỏng producer).
   */
  const stopPrejoinPreview = (opts = {}) => {
    const { keepStreamForRoom = false } = opts;
    if (prejoinStreamRef.current) {
      const sameAsRoom =
        keepStreamForRoom && mediasoupRef.current.localStream === prejoinStreamRef.current;
      if (sameAsRoom) {
        if (prejoinVideoRef.current) {
          prejoinVideoRef.current.srcObject = null;
        }
        prejoinStreamRef.current = null;
        return;
      }
      prejoinStreamRef.current.getTracks().forEach((track) => track.stop());
      prejoinStreamRef.current = null;
    }
    if (prejoinVideoRef.current) {
      prejoinVideoRef.current.srcObject = null;
    }
  };

  const startPrejoinPreview = async (audioEnabled = true, videoEnabled = true) => {
    stopPrejoinPreview();
    if (!audioEnabled && !videoEnabled) return;

    const mergedStream = new MediaStream();
    let hasAtLeastOneTrack = false;
    let hadPermissionError = false;

    // Xin quyền theo từng loại để không fail toàn bộ preview.
    if (videoEnabled) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          mergedStream.addTrack(videoTrack);
          hasAtLeastOneTrack = true;
        }
      } catch (videoErr) {
        hadPermissionError = true;
        console.warn('Video preview permission error', videoErr);
      }
    }

    if (audioEnabled) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          mergedStream.addTrack(audioTrack);
          hasAtLeastOneTrack = true;
        }
      } catch (audioErr) {
        hadPermissionError = true;
        console.warn('Audio preview permission error', audioErr);
      }
    }

    if (!hasAtLeastOneTrack) {
      if (hadPermissionError) {
        toast.error('Không truy cập được camera/micro để xem trước');
      }
      return;
    }

    prejoinStreamRef.current = mergedStream;
    if (prejoinVideoRef.current) {
      prejoinVideoRef.current.srcObject = mergedStream;
    }

    if (videoEnabled && mergedStream.getVideoTracks().length === 0) {
      setPrejoinVideoEnabled(false);
    }
    if (audioEnabled && mergedStream.getAudioTracks().length === 0) {
      setPrejoinAudioEnabled(false);
    }
  };

  const requestSocket = (eventName, payload) =>
    new Promise((resolve, reject) => {
      const socket = mediasoupRef.current.socket;
      socket.emit(eventName, payload, (response) => {
        if (!response?.success) {
          reject(new Error(response?.error || `Socket request failed: ${eventName}`));
          return;
        }
        resolve(response);
      });
    });

  const ensureRemoteParticipant = (producerMeta) => {
    addOrUpdateParticipant({
      socketId: producerMeta.socketId,
      userId: producerMeta.userId,
      displayName: producerMeta.displayName || 'Participant',
      stream: null,
      audioOn: true,
      videoOn: true,
    });
  };

  const consumeProducer = async (producerMeta) => {
    const { recvTransport, device } = mediasoupRef.current;
    if (!recvTransport || !device) return;

    ensureRemoteParticipant(producerMeta);

    const consumeResp = await requestSocket('voice:consume', {
      roomId: currentRoomRef.current,
      transportId: recvTransport.id,
      producerId: producerMeta.producerId,
      rtpCapabilities: device.rtpCapabilities,
    });

    const consumerParams = consumeResp.consumer;
    const consumer = await recvTransport.consume({
      id: consumerParams.id,
      producerId: consumerParams.producerId,
      kind: consumerParams.kind,
      rtpParameters: consumerParams.rtpParameters,
      appData: {},
    });

    mediasoupRef.current.consumers.set(consumer.id, consumer);

    const currentStream =
      mediasoupRef.current.remoteStreams.get(producerMeta.socketId) || new MediaStream();
    currentStream.addTrack(consumer.track);
    mediasoupRef.current.remoteStreams.set(producerMeta.socketId, currentStream);

    addOrUpdateParticipant({
      socketId: producerMeta.socketId,
      userId: producerMeta.userId,
      displayName: producerMeta.displayName || 'Participant',
      stream: currentStream,
      audioOn: producerMeta.kind === 'audio' ? true : undefined,
      videoOn: producerMeta.kind === 'video' ? true : undefined,
    });

    await requestSocket('voice:resumeConsumer', {
      roomId: currentRoomRef.current,
      consumerId: consumer.id,
    });
  };

  const initVoiceRoom = async ({
    targetRoomId,
    audioEnabled = true,
    videoEnabled = true,
    displayName = '',
  }) => {
    const roomTarget = targetRoomId || safeRoomId || 'room1';
    try {
      setJoining(true);
      setError('');
      setParticipants([]);
      currentRoomRef.current = roomTarget;
      setActiveRoomId(roomTarget);

      await apiClient.get(`/voice/rooms/${encodeURIComponent(roomTarget)}/bootstrap`);

      let localStream = prejoinStreamRef.current;
      if (!localStream) {
        if (audioEnabled || videoEnabled) {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: Boolean(audioEnabled),
            video: Boolean(videoEnabled),
          });
        } else {
          localStream = new MediaStream();
        }
      }
      mediasoupRef.current.localStream = localStream;
      // localVideoRef chỉ mount khi viewStage === 'inRoom' — gán srcObject trong ref callback / useEffect
      setHasLocalVideoTrack(localStream.getVideoTracks().length > 0);

      startAudioLevelMonitor('local', localStream, (speaking) => {
        setIsLocalSpeaking(speaking && !isMuted);
      });

      const token = normalizeToken(localStorage.getItem('token'));
      const socket = io(`${getSignalBaseUrl()}/voice`, {
        path: getSignalPath(),
        transports: ['websocket', 'polling'],
        auth: token ? { token } : {},
      });
      mediasoupRef.current.socket = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', (err) => {
        setError(err.message || 'Voice signaling connect error');
      });

      socket.on('voice:peerJoined', (payload) => {
        addOrUpdateParticipant({
          socketId: payload.socketId,
          userId: payload.userId,
          displayName: payload.displayName || 'Participant',
          stream: mediasoupRef.current.remoteStreams.get(payload.socketId) || null,
        });
      });

      socket.on('voice:peerLeft', (payload) => {
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
      });

      const mediasoupModule = await import('mediasoup-client');
      const DeviceClass = mediasoupModule.Device;

      const joinResp = await requestSocket('voice:joinRoom', { roomId: roomTarget, displayName });
      const device = new DeviceClass();
      await device.load({ routerRtpCapabilities: joinResp.rtpCapabilities });
      mediasoupRef.current.device = device;

      const sendTransportData = await requestSocket('voice:createTransport', {
        roomId: roomTarget,
        direction: 'send',
      });
      const sendTransport = device.createSendTransport(sendTransportData.transport);
      mediasoupRef.current.sendTransport = sendTransport;

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        requestSocket('voice:connectTransport', {
          roomId: roomTarget,
          transportId: sendTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        requestSocket('voice:produce', {
          roomId: roomTarget,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData,
        })
          .then((resp) => callback({ id: resp.producerId }))
          .catch(errback);
      });

      const audioTrack = audioEnabled ? localStream.getAudioTracks()[0] : null;
      const videoTrack = videoEnabled ? localStream.getVideoTracks()[0] : null;
      if (audioTrack) {
        mediasoupRef.current.audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { mediaTag: 'audio' },
        });
      }
      if (videoTrack) {
        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: { mediaTag: 'video' },
        });
      }

      const recvTransportData = await requestSocket('voice:createTransport', {
        roomId: roomTarget,
        direction: 'recv',
      });
      const recvTransport = device.createRecvTransport(recvTransportData.transport);
      mediasoupRef.current.recvTransport = recvTransport;

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        requestSocket('voice:connectTransport', {
          roomId: roomTarget,
          transportId: recvTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      const producers = await requestSocket('voice:getProducers', { roomId: roomTarget });
      for (const producerMeta of producers.producers || []) {
        // eslint-disable-next-line no-await-in-loop
        await consumeProducer(producerMeta);
      }

      socket.on('voice:newProducer', async (producerMeta) => {
        try {
          await consumeProducer(producerMeta);
        } catch (consumeError) {
          console.error('consume new producer failed', consumeError);
        }
      });
      setIsMuted(!audioTrack);
      setIsCameraOff(!videoTrack);
      setViewStage('inRoom');
      stopPrejoinPreview({ keepStreamForRoom: true });
    } catch (initError) {
      console.error(initError);
      setError(initError.message || 'Khong the ket noi room');
      toast.error(initError.message || 'Khong the ket noi room');
    } finally {
      setJoining(false);
    }
  };

  const leaveRoom = async () => {
    try {
      const { socket, audioProducer, videoProducer, sendTransport, recvTransport, consumers, localStream } =
        mediasoupRef.current;

      if (socket?.connected) {
        socket.emit('voice:leaveRoom', { roomId: currentRoomRef.current });
      }

      for (const consumer of consumers.values()) {
        consumer.close();
      }
      consumers.clear();

      audioProducer?.close();
      videoProducer?.close();
      sendTransport?.close();
      recvTransport?.close();

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      stopAudioLevelMonitor('local');
      for (const key of [...audioLevelMonitorsRef.current.keys()]) {
        if (key.startsWith('remote:')) stopAudioLevelMonitor(key);
      }
      setRemoteSpeakingMap({});
      setIsLocalSpeaking(false);
      setHasLocalVideoTrack(false);
      setActiveRoomId(null);
      setViewStage('home');

      socket?.disconnect();
      navigate('/voice');
    } catch (leaveError) {
      console.error(leaveError);
      navigate('/voice');
    }
  };

  const toggleMute = async () => {
    const producer = mediasoupRef.current.audioProducer;
    if (!producer) return;
    if (isMuted) {
      await producer.resume();
    } else {
      await producer.pause();
    }
    setIsMuted((prev) => {
      const nextMuted = !prev;
      if (nextMuted) setIsLocalSpeaking(false);
      return nextMuted;
    });
  };

  const toggleCamera = async () => {
    try {
      const { sendTransport } = mediasoupRef.current;

      // Bat camera lai: mo thiet bi cam that va tao producer moi
      if (isCameraOff) {
        if (!sendTransport) return;

        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = camStream.getVideoTracks()[0];
        if (!newVideoTrack) return;

        if (!mediasoupRef.current.localStream) {
          mediasoupRef.current.localStream = new MediaStream();
        }
        const localStream = mediasoupRef.current.localStream;

        // Dam bao chi co 1 video track local
        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
        localStream.addTrack(newVideoTrack);

        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: newVideoTrack,
          appData: { mediaTag: 'video' },
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        setHasLocalVideoTrack(true);
        setIsCameraOff(false);
        return;
      }

      // Tat camera: close producer + stop track de giai phong camera o he thong
      const producer = mediasoupRef.current.videoProducer;
      if (producer) {
        producer.close();
        mediasoupRef.current.videoProducer = null;
      }

      const localStream = mediasoupRef.current.localStream;
      if (localStream) {
        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      }

      setHasLocalVideoTrack(false);
      setIsCameraOff(true);
    } catch (cameraError) {
      console.error(cameraError);
      toast.error(cameraError.message || 'Khong the bat/tat camera');
    }
  };

  useEffect(() => {
    if (landingDemo) return undefined;
    if (safeRoomId) {
      setMeetingCode(safeRoomId);
      setViewStage('prejoin');
    } else {
      setViewStage('home');
    }

    return () => {
      const { socket, localStream, consumers, audioProducer, videoProducer, sendTransport, recvTransport } =
        mediasoupRef.current;
      socket?.disconnect();
      localStream?.getTracks().forEach((track) => track.stop());
      stopPrejoinPreview();
      stopAudioLevelMonitor('local');
      for (const key of [...audioLevelMonitorsRef.current.keys()]) {
        if (key.startsWith('remote:')) stopAudioLevelMonitor(key);
      }
      setRemoteSpeakingMap({});
      setIsLocalSpeaking(false);
      consumers.forEach((consumer) => consumer.close());
      audioProducer?.close();
      videoProducer?.close();
      sendTransport?.close();
      recvTransport?.close();
    };
  }, [safeRoomId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    const activeRemoteKeys = new Set();
    participants.forEach((participant) => {
      const key = `remote:${participant.socketId}`;
      activeRemoteKeys.add(key);
      if (participant.stream) {
        startAudioLevelMonitor(key, participant.stream, (speaking) => {
          setRemoteSpeakingMap((prev) => {
            if (prev[participant.socketId] === speaking) return prev;
            return { ...prev, [participant.socketId]: speaking };
          });
        });
      }
    });

    for (const key of [...audioLevelMonitorsRef.current.keys()]) {
      if (key.startsWith('remote:') && !activeRemoteKeys.has(key)) {
        stopAudioLevelMonitor(key);
      }
    }
  }, [participants, landingDemo]);

  useEffect(() => {
    if (landingDemo) return undefined;
    if (viewStage !== 'prejoin') return undefined;
    startPrejoinPreview(prejoinAudioEnabled, prejoinVideoEnabled);
    return () => {
      stopPrejoinPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStage, prejoinAudioEnabled, prejoinVideoEnabled, landingDemo]);

  /** Đảm bảo gán lại stream sau khi vào phòng (ref mount / StrictMode / re-render). */
  useEffect(() => {
    if (landingDemo) return;
    if (viewStage !== 'inRoom') return;
    if (!hasLocalVideoTrack || isCameraOff) return;
    const stream = mediasoupRef.current.localStream;
    const el = localVideoRef.current;
    if (!stream || !el) return;
    const live = stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!live) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play?.().catch(() => {});
    }
  }, [viewStage, hasLocalVideoTrack, isCameraOff, joining, landingDemo]);

  const handleNewMeeting = () => {
    const generated = generateMeetingCode();
    setMeetingCode(generated);
    setPrejoinAudioEnabled(true);
    setPrejoinVideoEnabled(true);
    setViewStage('prejoin');
  };

  const handleJoinMeeting = () => {
    const code = String(meetingCode || '').trim();
    if (!code) {
      toast.error('Vui lòng nhập Meeting ID');
      return;
    }
    initVoiceRoom({
      targetRoomId: code,
      audioEnabled: prejoinAudioEnabled,
      videoEnabled: prejoinVideoEnabled,
      displayName: displayNameInput,
    });
  };

  const clockNow = new Date();
  const dateLine = clockNow
    .toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();

  const voiceNav = [
    {
      id: 'new',
      label: 'Cuộc họp mới',
      icon: Plus,
      onClick: handleNewMeeting,
    },
    {
      id: 'join',
      label: 'Tham gia',
      icon: LogIn,
      onClick: () => setViewStage('prejoin'),
    },
    {
      id: 'schedule',
      label: 'Lên lịch',
      icon: Calendar,
      onClick: () => toast('Lên lịch — sắp có', { icon: '📅' }),
    },
    {
      id: 'share',
      label: 'Chia sẻ màn hình',
      icon: Monitor,
      onClick: () => toast('Chia sẻ màn hình — sắp có', { icon: '🖥️' }),
    },
    {
      id: 'notes',
      label: 'Ghi chú',
      icon: FileText,
      onClick: () => toast('Ghi chú — sắp có', { icon: '📝' }),
    },
  ];

  const voiceShell = isDarkMode ? 'min-h-screen flex bg-[#050810]' : 'min-h-screen flex bg-[#f5f7fa]';
  const voiceLobby = isDarkMode ? 'flex flex-1 min-h-0 bg-black text-slate-100' : 'flex flex-1 min-h-0 bg-slate-100 text-slate-900';

  if (landingDemo) {
    const demoAsideBtn = (label) => (
      <button
        key={label}
        type="button"
        onClick={() => toast('Đây là bản demo — đăng nhập để dùng phòng họp thật.', { icon: '🎤' })}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-500 transition hover:bg-white/5 hover:text-gray-200"
      >
        {label}
      </button>
    );
    return (
      <div className={`${voiceShell} min-h-[680px] h-[680px]`}>
        <NavigationSidebar landingDemo={landingDemo} />
        <div className={`${voiceLobby} min-h-0`}>
          <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-white/10 px-3 py-6 md:w-56">
            {demoAsideBtn('Cuộc họp mới')}
            {demoAsideBtn('Tham gia')}
            {demoAsideBtn('Lên lịch')}
          </aside>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
            <p className="text-5xl font-bold tabular-nums text-white">04:32</p>
            <p className="mt-3 max-w-md text-center text-sm text-gray-500">
              Phòng họp VoiceHub — bản demo, không truy cập mic hay camera.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={voiceShell}>
      <NavigationSidebar landingDemo={landingDemo} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {viewStage !== 'inRoom' ? (
          <div className={voiceLobby}>
            {/* Cột trái: menu (hình 1) */}
            <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-white/10 px-3 py-6 md:w-56">
              {voiceNav.map((item) => {
                const active =
                  (item.id === 'new' && viewStage === 'home') ||
                  (item.id === 'join' && viewStage === 'prejoin');
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onClick}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? 'border border-cyan-500/50 bg-white/[0.06] text-white shadow-[0_0_28px_rgba(6,182,212,0.2)]'
                        : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" strokeWidth={1.75} />
                    <span className="text-sm font-medium leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 md:px-8">
              {/* Đồng hồ + ngày */}
              <div className="mb-8 text-center">
                <div
                  className="text-4xl font-bold tabular-nums tracking-[0.2em] text-white md:text-5xl md:tracking-[0.25em]"
                  suppressHydrationWarning
                  data-clock-tick={clockTick}
                >
                  {clockNow.toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </div>
                <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-gray-500 md:text-xs">
                  {dateLine}
                </p>
              </div>

              {viewStage === 'home' && (
                <div className="flex min-h-[min(520px,70vh)] flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#121212] px-6 py-16">
                  <p className="text-lg text-white md:text-xl">Chưa có cuộc họp nào</p>
                  <button
                    type="button"
                    onClick={handleNewMeeting}
                    className="mt-8 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-900/25 transition hover:brightness-110"
                  >
                    Tạo cuộc họp ngay
                  </button>
                </div>
              )}

              {viewStage === 'prejoin' && (
                <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:justify-end lg:gap-12">
                  <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#141414] p-4 lg:max-w-md">
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-black/50">
                      {prejoinVideoEnabled ? (
                        <video
                          ref={prejoinVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 text-3xl font-bold text-white">
                            {buildInitials(displayNameInput || localDisplayName)}
                          </div>
                          <span className="text-sm text-gray-400">Camera đang tắt</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPrejoinAudioEnabled((v) => !v)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                          prejoinAudioEnabled
                            ? 'border border-white/10 bg-black/40 text-white'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {prejoinAudioEnabled ? 'Mic bật' : 'Mic tắt'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrejoinVideoEnabled((v) => !v)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                          prejoinVideoEnabled
                            ? 'border border-white/10 bg-black/40 text-white'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {prejoinVideoEnabled ? 'Camera bật' : 'Camera tắt'}
                      </button>
                    </div>
                  </div>

                  <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6 md:p-8 lg:shrink-0">
                    <h2 className="mb-8 text-3xl font-bold text-white lg:text-right">Tham gia cuộc họp</h2>
                    <div className="space-y-5">
                      <div>
                        <label className="mb-1.5 block text-sm text-gray-400">Mã phòng</label>
                        <input
                          value={meetingCode}
                          onChange={(e) => setMeetingCode(e.target.value)}
                          placeholder="vox-hacker-room"
                          className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white placeholder:text-gray-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm text-gray-400">Tên hiển thị</label>
                        <input
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder={localDisplayName}
                          className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white placeholder:text-gray-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                        />
                      </div>
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={!prejoinAudioEnabled}
                          onChange={(e) => setPrejoinAudioEnabled(!e.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-black/50 text-cyan-600 focus:ring-cyan-500"
                        />
                        Tắt mic khi vào phòng
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={!prejoinVideoEnabled}
                          onChange={(e) => setPrejoinVideoEnabled(!e.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-black/50 text-cyan-600 focus:ring-cyan-500"
                        />
                        Tắt camera khi vào phòng
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleJoinMeeting}
                      className="mt-8 w-full rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 py-3.5 text-center text-base font-semibold text-white shadow-lg transition hover:brightness-110"
                    >
                      Bắt đầu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopPrejoinPreview();
                        setViewStage('home');
                      }}
                      className="mt-4 w-full py-2 text-center text-sm text-gray-500 transition hover:text-gray-300"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col bg-black">
            {error && (
              <div className="absolute right-5 top-5 z-30 max-w-xs rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            )}
            {joining && (
              <div className="absolute right-5 top-16 z-30 rounded-full bg-zinc-900/95 px-4 py-2 text-sm text-gray-300 shadow-lg">
                Đang kết nối phòng…
              </div>
            )}

            {/* Thanh trạng thái nổi (hình 3) */}
            <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-full border border-white/10 bg-zinc-900/95 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-md md:left-8 md:top-6">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title={connected ? 'Đã kết nối' : 'Đang kết nối'} />
              <span className="max-w-[140px] truncate font-semibold tracking-tight md:max-w-[220px]">
                {currentMeetingCode}
              </span>
              <span className="text-white/25">|</span>
              <Users className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
              <span className="tabular-nums">{totalParticipants}</span>
              <span className="text-white/25">|</span>
              <span className="tabular-nums text-white/90">{formatCallDuration(callDurationSec)}</span>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-36 pt-24 md:px-8">
              <div className="w-full max-w-5xl">
                <div className="rounded-2xl border-2 border-cyan-500/35 bg-black/30 p-4 shadow-[0_0_60px_rgba(6,182,212,0.12)] md:p-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div
                      className={`relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border md:min-h-[260px] ${
                        isLocalSpeaking && !isMuted
                          ? 'border-emerald-400/60 shadow-[0_0_24px_rgba(52,211,153,0.25)]'
                          : 'border-white/10'
                      } bg-black/40`}
                    >
                      {hasLocalVideoTrack && !isCameraOff ? (
                        <video
                          ref={(node) => {
                            localVideoRef.current = node;
                            const stream = mediasoupRef.current.localStream;
                            if (node && stream && node.srcObject !== stream) {
                              node.srcObject = stream;
                              node.play?.().catch(() => {});
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="h-full min-h-[200px] w-full flex-1 object-cover"
                        />
                      ) : (
                        <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900/80 to-black/80 md:min-h-[260px]">
                          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-3xl font-bold text-white shadow-lg">
                            {localAvatar && String(localAvatar).startsWith('http') ? (
                              <img src={localAvatar} alt="" className="h-full w-full rounded-full object-cover" />
                            ) : (
                              buildInitials(localDisplayName)
                            )}
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                          {displayNameInput || localDisplayName}
                        </span>
                        <span className="rounded-md bg-cyan-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          YOU
                        </span>
                        {isMuted && (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600/90">
                            <MicOff className="h-4 w-4 text-white" aria-hidden />
                          </span>
                        )}
                      </div>
                    </div>

                    {participants.map((participant) => (
                      <div
                        key={participant.socketId}
                        className={`relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border bg-black/40 md:min-h-[260px] ${
                          remoteSpeakingMap[participant.socketId]
                            ? 'border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                            : 'border-white/10'
                        }`}
                      >
                        {participant.stream && participant.stream.getVideoTracks().length > 0 ? (
                          <video
                            autoPlay
                            playsInline
                            ref={(node) => {
                              if (!node) return;
                              if (node.srcObject !== participant.stream) {
                                node.srcObject = participant.stream;
                              }
                            }}
                            className="h-full min-h-[200px] w-full flex-1 object-cover"
                          />
                        ) : (
                          <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 bg-zinc-900/80 md:min-h-[260px]">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xl font-bold text-white">
                              {buildInitials(participant.displayName || participant.userId || 'P')}
                            </div>
                            <span className="text-xs text-gray-500">Đã tắt camera</span>
                          </div>
                        )}
                        <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2.5 py-1 text-xs text-white">
                          {participant.displayName || participant.userId || 'Thành viên'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Thanh điều khiển nổi (hình 3) */}
            <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-30 flex justify-center px-2 md:bottom-8">
              <div className="pointer-events-auto flex max-w-[min(100%,56rem)] flex-wrap items-end justify-between gap-3 rounded-2xl border border-white/10 bg-black/85 px-3 py-3 shadow-2xl backdrop-blur-xl md:gap-6 md:px-6">
                <div className="flex items-end gap-1 sm:gap-3">
                  <VoiceToolbarControl
                    label="ÂM THANH"
                    icon={Mic}
                    iconOff={MicOff}
                    active={!isMuted}
                    onClick={toggleMute}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="VIDEO"
                    icon={Video}
                    iconOff={VideoOff}
                    active={!isCameraOff}
                    onClick={toggleCamera}
                    chevron
                  />
                </div>

                <div className="flex flex-1 flex-wrap items-end justify-center gap-0.5 sm:gap-2 md:gap-4">
                  <VoiceToolbarControl
                    label="THÀNH VIÊN"
                    icon={Users}
                    badge={totalParticipants}
                    onClick={() => toast(`${totalParticipants} người trong phòng`, { icon: '👥' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="CẢM XÚC"
                    icon={Heart}
                    onClick={() => toast('Biểu cảm — sắp có', { icon: '❤️' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="CHAT"
                    icon={MessageSquare}
                    onClick={() => toast('Chat phòng — sắp có', { icon: '💬' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="CHIA SẺ"
                    icon={Share2}
                    onClick={() => toast('Chia sẻ màn hình — sắp có', { icon: '🖥️' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="THÊM"
                    icon={MoreHorizontal}
                    onClick={() => toast('Thêm tùy chọn — sắp có', { icon: '⋯' })}
                    chevron={false}
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={leaveRoom}
                    className="group flex flex-col items-center gap-1 rounded-xl px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                    title="Kết thúc cuộc gọi"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 shadow-lg transition group-hover:bg-red-500">
                      <X className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-white/70 group-hover:text-white">
                      Kết thúc
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceRoomPage;

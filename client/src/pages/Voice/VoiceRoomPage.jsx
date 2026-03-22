import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  ChevronUp,
  Heart,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  Share2,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import apiClient from '../../services/api/apiClient';
import { useAuth } from '../../context/AuthContext';

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
      className="group flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
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

function VoiceRoomPage() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const safeRoomId = roomId?.startsWith(':') ? roomId.slice(1) || '' : roomId || '';
  const { user } = useAuth();

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
  const [displayNameInput, setDisplayNameInput] = useState('Huy Nguyen');
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
  }, [safeRoomId]);

  useEffect(() => {
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
  }, [participants]);

  useEffect(() => {
    if (viewStage !== 'prejoin') return undefined;
    startPrejoinPreview(prejoinAudioEnabled, prejoinVideoEnabled);
    return () => {
      stopPrejoinPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStage, prejoinAudioEnabled, prejoinVideoEnabled]);

  /** Đảm bảo gán lại stream sau khi vào phòng (ref mount / StrictMode / re-render). */
  useEffect(() => {
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
  }, [viewStage, hasLocalVideoTrack, isCameraOff, joining]);

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

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar />
      <div className="flex-1 flex flex-col">
        {viewStage !== 'inRoom' ? (
          <div className="flex-1 p-6 bg-[#020817] text-slate-100 overflow-y-auto">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black text-white">
                  {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </h1>
                <p className="text-gray-400">
                  {new Date().toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              {viewStage === 'home' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                    <button
                      type="button"
                      onClick={handleNewMeeting}
                      className="rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-4 text-white font-semibold hover:opacity-90 transition"
                    >
                      Cuộc họp mới
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewStage('prejoin')}
                      className="rounded-2xl bg-[#040f2a] border border-slate-800 py-4 text-white font-semibold hover:bg-slate-800/70 transition"
                    >
                      Tham gia
                    </button>
                    <button type="button" className="rounded-2xl bg-[#040f2a] border border-slate-800 py-4 text-white/90 font-semibold">
                      Lên lịch
                    </button>
                    <button type="button" className="rounded-2xl bg-[#040f2a] border border-slate-800 py-4 text-white/90 font-semibold">
                      Chia sẻ màn hình
                    </button>
                    <button type="button" className="rounded-2xl bg-[#040f2a] border border-slate-800 py-4 text-white/90 font-semibold">
                      Ghi chú của tôi
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
                    <div className="text-5xl mb-4">🏖️</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Chưa có cuộc họp nào</h3>
                    <p className="text-gray-400 mb-4">Bắt đầu cuộc họp mới hoặc nhập mã phòng để tham gia.</p>
                    <button
                      type="button"
                      onClick={handleNewMeeting}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-semibold text-white"
                    >
                      Tạo cuộc họp
                    </button>
                  </div>
                </>
              )}

              {viewStage === 'prejoin' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-black/40">
                      {prejoinVideoEnabled ? (
                        <video ref={prejoinVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center gap-3">
                          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-2xl font-bold text-white">
                            {buildInitials(displayNameInput || localDisplayName)}
                          </div>
                          <div className="text-sm text-gray-300">Camera đang tắt</div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPrejoinAudioEnabled((v) => !v)}
                        className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold ${prejoinAudioEnabled ? 'bg-[#040f2a] border border-slate-800' : 'bg-red-600 text-white'}`}
                      >
                        {prejoinAudioEnabled ? 'Audio bật' : 'Audio tắt'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrejoinVideoEnabled((v) => !v)}
                        className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold ${prejoinVideoEnabled ? 'bg-[#040f2a] border border-slate-800' : 'bg-red-600 text-white'}`}
                      >
                        {prejoinVideoEnabled ? 'Video bật' : 'Video tắt'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <h2 className="text-3xl font-black text-white mb-5">Tham gia cuộc họp</h2>
                    <div className="space-y-3">
                      <input
                        value={meetingCode}
                        onChange={(e) => setMeetingCode(e.target.value)}
                        placeholder="Meeting ID hoặc mã phòng"
                        className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 text-white"
                      />
                      <input
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                        placeholder="Tên hiển thị"
                        className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 text-white"
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={!prejoinAudioEnabled}
                          onChange={(e) => setPrejoinAudioEnabled(!e.target.checked)}
                        />
                        Không kết nối âm thanh
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={!prejoinVideoEnabled}
                          onChange={(e) => setPrejoinVideoEnabled(!e.target.checked)}
                        />
                        Tắt video trước khi vào
                      </label>
                    </div>
                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={handleJoinMeeting}
                        className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-white font-semibold"
                      >
                        Bắt đầu
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stopPrejoinPreview();
                          setViewStage('home');
                        }}
                        className="rounded-xl bg-[#040f2a] border border-slate-800 px-5 py-2.5 text-white font-semibold"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-white/10 glass-strong flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-gradient">Phòng Voice/Video</h1>
                <p className="text-sm text-gray-400">
                  Phòng: {currentMeetingCode} • {totalParticipants} người tham gia • {connected ? 'Đã kết nối' : 'Mất kết nối'}
                </p>
              </div>
              {error && <div className="text-xs text-red-300">{error}</div>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {joining && (
                <div className="mb-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-300">Đang kết nối phòng...</div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div
                  className={`relative overflow-hidden rounded-2xl border aspect-video transition-all duration-200 ${
                    isLocalSpeaking && !isMuted
                      ? 'border-emerald-300/70 shadow-[0_0_28px_rgba(16,185,129,0.35)]'
                      : 'border-cyan-300/30'
                  } bg-black/30`}
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
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-slate-900/70">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center overflow-hidden">
                        {localAvatar && String(localAvatar).startsWith('http') ? (
                          <img src={localAvatar} alt={localDisplayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl font-bold text-white">{buildInitials(localDisplayName)}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-300">{localDisplayName}</div>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
                    Bạn {isMuted ? '• tắt mic' : ''} {isCameraOff ? '• tắt cam' : ''}
                  </div>
                </div>

                {participants.map((participant) => (
                  <div
                    key={participant.socketId}
                    className={`relative overflow-hidden rounded-2xl border aspect-video bg-black/30 transition-all duration-200 ${
                      remoteSpeakingMap[participant.socketId]
                        ? 'border-emerald-300/70 shadow-[0_0_22px_rgba(16,185,129,0.30)]'
                        : 'border-white/15'
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
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-slate-900/70">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-xl font-bold text-white">
                          {buildInitials(participant.displayName || participant.userId || 'P')}
                        </div>
                        <div className="text-sm text-gray-300">Đã tắt camera</div>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
                      {participant.displayName || participant.userId || 'Thành viên'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Thanh điều khiển dạng meeting bar (tham chiếu hình 1): trái — Âm thanh/Video; giữa — Thành viên & công cụ; phải — Kết thúc */}
            <div className="shrink-0 border-t border-white/10 bg-black px-3 py-3 sm:px-6">
              <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-x-2 gap-y-3">
                <div className="flex items-end gap-1 sm:gap-4">
                  <VoiceToolbarControl
                    label="Âm thanh"
                    icon={Mic}
                    iconOff={MicOff}
                    active={!isMuted}
                    onClick={toggleMute}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="Video"
                    icon={Video}
                    iconOff={VideoOff}
                    active={!isCameraOff}
                    onClick={toggleCamera}
                    chevron
                  />
                </div>

                <div className="flex flex-1 flex-wrap items-end justify-center gap-0.5 sm:gap-3 md:gap-5">
                  <VoiceToolbarControl
                    label="Thành viên"
                    icon={Users}
                    badge={totalParticipants}
                    onClick={() => toast(`${totalParticipants} người trong phòng`, { icon: '👥' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="Cảm xúc"
                    icon={Heart}
                    onClick={() => toast('Biểu cảm — sắp có', { icon: '❤️' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="Chat"
                    icon={MessageSquare}
                    onClick={() => toast('Chat phòng — sắp có', { icon: '💬' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="Chia sẻ"
                    icon={Share2}
                    onClick={() => toast('Chia sẻ màn hình — sắp có', { icon: '🖥️' })}
                    chevron
                  />
                  <VoiceToolbarControl
                    label="Thêm"
                    icon={MoreHorizontal}
                    onClick={() => toast('Thêm tùy chọn — sắp có', { icon: '⋯' })}
                    chevron={false}
                  />
                </div>

                <div className="flex items-end pl-2">
                  <button
                    type="button"
                    onClick={leaveRoom}
                    className="group flex flex-col items-center gap-1 rounded-lg px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                    title="Rời phòng / Kết thúc cuộc gọi"
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg transition group-hover:from-rose-600 group-hover:to-pink-700"
                      style={{
                        clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)',
                      }}
                    >
                      <X className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden />
                    </div>
                    <span className="text-[11px] text-white/60 group-hover:text-white/85">Kết thúc</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default VoiceRoomPage;

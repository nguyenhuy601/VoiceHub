import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import apiClient from '../../services/api/apiClient';

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
  const { roomId = 'room1' } = useParams();
  const safeRoomId = roomId?.startsWith(':') ? roomId.slice(1) || 'room1' : roomId;

  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [joining, setJoining] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const localVideoRef = useRef(null);
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

  const totalParticipants = useMemo(() => participants.length + 1, [participants.length]);

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

  const startLocalMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    mediasoupRef.current.localStream = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
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
      roomId: safeRoomId,
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
      roomId: safeRoomId,
      consumerId: consumer.id,
    });
  };

  const initVoiceRoom = async () => {
    try {
      setJoining(true);
      setError('');

      await apiClient.get(`/voice/rooms/${encodeURIComponent(safeRoomId)}/bootstrap`);

      const localStream = await startLocalMedia();

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
        const stream = mediasoupRef.current.remoteStreams.get(payload.socketId);
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          mediasoupRef.current.remoteStreams.delete(payload.socketId);
        }
      });

      const mediasoupModule = await import('mediasoup-client');
      const DeviceClass = mediasoupModule.Device;

      const joinResp = await requestSocket('voice:joinRoom', { roomId: safeRoomId });
      const device = new DeviceClass();
      await device.load({ routerRtpCapabilities: joinResp.rtpCapabilities });
      mediasoupRef.current.device = device;

      const sendTransportData = await requestSocket('voice:createTransport', {
        roomId: safeRoomId,
        direction: 'send',
      });
      const sendTransport = device.createSendTransport(sendTransportData.transport);
      mediasoupRef.current.sendTransport = sendTransport;

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        requestSocket('voice:connectTransport', {
          roomId: safeRoomId,
          transportId: sendTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        requestSocket('voice:produce', {
          roomId: safeRoomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData,
        })
          .then((resp) => callback({ id: resp.producerId }))
          .catch(errback);
      });

      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];
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
        roomId: safeRoomId,
        direction: 'recv',
      });
      const recvTransport = device.createRecvTransport(recvTransportData.transport);
      mediasoupRef.current.recvTransport = recvTransport;

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        requestSocket('voice:connectTransport', {
          roomId: safeRoomId,
          transportId: recvTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      const producers = await requestSocket('voice:getProducers', { roomId: safeRoomId });
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
        socket.emit('voice:leaveRoom', { roomId: safeRoomId });
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

      socket?.disconnect();
      navigate('/dashboard');
    } catch (leaveError) {
      console.error(leaveError);
      navigate('/dashboard');
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
    setIsMuted((prev) => !prev);
  };

  const toggleCamera = async () => {
    const producer = mediasoupRef.current.videoProducer;
    if (!producer) return;
    if (isCameraOff) {
      await producer.resume();
    } else {
      await producer.pause();
    }
    setIsCameraOff((prev) => !prev);
  };

  useEffect(() => {
    initVoiceRoom();

    return () => {
      const { socket, localStream, consumers, audioProducer, videoProducer, sendTransport, recvTransport } =
        mediasoupRef.current;
      socket?.disconnect();
      localStream?.getTracks().forEach((track) => track.stop());
      consumers.forEach((consumer) => consumer.close());
      audioProducer?.close();
      videoProducer?.close();
      sendTransport?.close();
      recvTransport?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeRoomId]);

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar />
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-white/10 glass-strong flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gradient">Voice/Video Room</h1>
            <p className="text-sm text-gray-400">
              Room: {safeRoomId} • {totalParticipants} participant(s) • {connected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          {error && <div className="text-xs text-red-300">{error}</div>}
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {joining && (
            <div className="mb-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-300">Dang ket noi phong...</div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl border border-cyan-300/30 bg-black/30 aspect-video">
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
                Ban {isMuted ? '• mic off' : ''} {isCameraOff ? '• cam off' : ''}
              </div>
            </div>

            {participants.map((participant) => (
              <div
                key={participant.socketId}
                className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/30 aspect-video"
              >
                {participant.stream ? (
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
                  <div className="flex h-full items-center justify-center text-gray-400">Dang cho stream...</div>
                )}
                <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
                  {participant.displayName || participant.userId || 'Participant'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-white/10 glass-strong flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              isMuted ? 'bg-red-600' : 'bg-gradient-to-r from-purple-600 to-pink-600'
            }`}
          >
            {isMuted ? 'Bat mic' : 'Tat mic'}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              isCameraOff ? 'bg-red-600' : 'bg-gradient-to-r from-blue-600 to-cyan-600'
            }`}
          >
            {isCameraOff ? 'Bat camera' : 'Tat camera'}
          </button>
          <button
            type="button"
            onClick={leaveRoom}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Roi phong
          </button>
        </div>
      </div>
    </div>
  );
}

export default VoiceRoomPage;

import {
  MIN_VOICE_RECORDING_SEC,
  buildMergedRecordingStream,
  pickVoiceRecorderMime,
} from './voiceRecordingUtils';

const DB_NAME = 'vh-voice-recordings';
const STORE_NAME = 'recordings';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'meetingId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function saveVoiceMeetingRecording(meetingId, blob, meta = {}) {
  if (!meetingId || !blob?.size) return false;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      meetingId: String(meetingId),
      blob,
      mimeType: blob.type || meta.mimeType || 'audio/webm',
      savedAt: new Date().toISOString(),
      durationSec: meta.durationSec || null,
      lobbyRoomId: meta.lobbyRoomId || null,
    });
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB write failed'));
    };
  });
}

export async function loadVoiceMeetingRecording(meetingId) {
  if (!meetingId) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(String(meetingId));
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('IndexedDB read failed'));
    };
  });
}

export async function hasVoiceMeetingRecording(meetingId) {
  const row = await loadVoiceMeetingRecording(meetingId);
  return Boolean(row?.blob?.size);
}

/** Xóa bản ghi local không còn trong lịch sử server (sau trim 25 cuộc). */
export async function pruneVoiceMeetingRecordingsExcept(keepMeetingIds = []) {
  if (typeof indexedDB === 'undefined') return 0;
  const keep = new Set(keepMeetingIds.map((id) => String(id)));
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let removed = 0;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const keys = req.result || [];
      for (const key of keys) {
        if (!keep.has(String(key))) {
          store.delete(key);
          removed += 1;
        }
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(removed);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB prune failed'));
    };
  });
}

export class VoiceSessionRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.mimeType = '';
  }

  start(localStream, remoteStreams) {
    this.stop();
    const stream = buildMergedRecordingStream(localStream, remoteStreams);
    if (!stream.getTracks().length) return false;
    const mimeType = pickVoiceRecorderMime(false);
    if (!mimeType) return false;
    this.chunks = [];
    this.mimeType = mimeType;
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      this.recorder = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size > 0) this.chunks.push(ev.data);
      };
      recorder.start(1000);
      this.startedAt = Date.now();
      return true;
    } catch {
      this.recorder = null;
      return false;
    }
  }

  stop() {
    if (!this.recorder || this.recorder.state === 'inactive') {
      this.recorder = null;
      return Promise.resolve(null);
    }
    const recorder = this.recorder;
    this.recorder = null;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const durationSec = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
        const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
        this.chunks = [];
        if (!blob.size || durationSec < MIN_VOICE_RECORDING_SEC) {
          resolve(null);
          return;
        }
        resolve({ blob, durationSec, mimeType: this.mimeType });
      };
      recorder.stop();
    });
  }
}

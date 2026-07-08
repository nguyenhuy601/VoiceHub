/**
 * Voice meeting real-time STT and post-meeting summary queues (RabbitMQ).
 */
const STT_CHUNK_QUEUE =
  process.env.RABBITMQ_VOICE_STT_QUEUE || 'voice.stt.chunk';
const SUMMARY_QUEUE =
  process.env.RABBITMQ_VOICE_SUMMARY_QUEUE || 'voice.summary.process';
const STT_DLQ_QUEUE =
  process.env.RABBITMQ_VOICE_STT_DLQ || 'voice.stt.dlq';
const SUMMARY_DLQ_QUEUE =
  process.env.RABBITMQ_VOICE_SUMMARY_DLQ || 'voice.summary.dlq';

module.exports = {
  VOICE_STT_CHUNK_QUEUE: STT_CHUNK_QUEUE,
  VOICE_SUMMARY_PROCESS_QUEUE: SUMMARY_QUEUE,
  VOICE_STT_DLQ_QUEUE: STT_DLQ_QUEUE,
  VOICE_SUMMARY_DLQ_QUEUE: SUMMARY_DLQ_QUEUE,
};

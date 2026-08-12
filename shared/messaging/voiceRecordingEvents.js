/**
 * Voice meeting recording jobs (RabbitMQ direct queue).
 */
const GENERATE_QUEUE =
  process.env.RABBITMQ_VOICE_RECORDING_QUEUE || 'voice.recording.process';
const DLQ_QUEUE =
  process.env.RABBITMQ_VOICE_RECORDING_DLQ || 'voice.recording.dlq';

module.exports = {
  VOICE_RECORDING_PROCESS_QUEUE: GENERATE_QUEUE,
  VOICE_RECORDING_DLQ_QUEUE: DLQ_QUEUE,
};

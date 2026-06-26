/**
 * Conversation summary jobs (RabbitMQ direct queue).
 */

const GENERATE_QUEUE =
  process.env.RABBITMQ_SUMMARY_GENERATE_QUEUE || 'conversation-summary.generate';
const DLQ_QUEUE =
  process.env.RABBITMQ_SUMMARY_DLQ_QUEUE || 'conversation-summary.dlq';

module.exports = {
  CONVERSATION_SUMMARY_GENERATE_QUEUE: GENERATE_QUEUE,
  CONVERSATION_SUMMARY_DLQ_QUEUE: DLQ_QUEUE,
};

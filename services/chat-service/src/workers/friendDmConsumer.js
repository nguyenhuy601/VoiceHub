const amqp = require('amqplib');
const { getRedisClient } = require('@enterprise/shared');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { runWithReconnect, waitForAmqpClose } = require('@enterprise/shared/messaging/rabbitReconnect');
const messageService = require('../services/message.service');
const { emitRealtimeEvent } = require('../clients/realtime.client');
const { assertDmCanSend } = require('../utils/verifyDmRelationship');
const { maybeNotifyDmReceived } = require('../utils/dmPushNotification');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';
const QUEUE = process.env.RABBITMQ_FRIEND_DM_QUEUE || 'voicehub.friend.dm';
const ROUTING_KEY = process.env.RABBITMQ_FRIEND_DM_ROUTING_KEY || 'friend.dm';

let dmConsumer = null;

async function isDuplicate(correlationId) {
  if (!correlationId) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  const k = `dm:corr:${correlationId}`;
  const res = await redis.set(k, '1', 'EX', 86400, 'NX');
  return res !== 'OK';
}

async function processPayload(data) {
  const {
    correlationId,
    senderId,
    receiverId,
    content,
    messageType = 'text',
    replyToMessageId,
    authorization,
  } = data;

  if (!senderId || !receiverId || !content) {
    console.error('[friendDmConsumer] invalid payload', data);
    return;
  }

  if (await isDuplicate(correlationId)) {
    console.warn('[friendDmConsumer] duplicate correlationId, skip', correlationId);
    return;
  }

  try {
    await assertDmCanSend({
      peerId: receiverId,
      senderId,
      authorizationHeader: authorization,
    });
  } catch (dmErr) {
    await emitRealtimeEvent({
      event: 'friend:send_failed',
      userId: String(senderId),
      payload: {
        receiverId: String(receiverId),
        code: dmErr.code || 'dm_forbidden',
        message: dmErr.message || 'Cannot send message',
        ...(dmErr.blockerId ? { blockerId: String(dmErr.blockerId) } : {}),
      },
    });
    return;
  }

  const messageData = {
    senderId,
    receiverId,
    content,
    messageType: messageType || 'text',
  };
  if (replyToMessageId) messageData.replyToMessageId = replyToMessageId;
  const message = await messageService.createMessage(messageData);

  await emitRealtimeEvent({
    event: 'friend:new_message',
    userId: String(receiverId),
    payload: message,
  });
  await emitRealtimeEvent({
    event: 'friend:sent',
    userId: String(senderId),
    payload: message,
  });
  maybeNotifyDmReceived(message).catch(() => null);
}

function isFriendDmConsumerEnabled() {
  const url = process.env.RABBITMQ_URL;
  const enabled = process.env.FRIEND_DM_USE_QUEUE !== 'false';
  return Boolean(url && enabled);
}

async function startFriendDmConsumer() {
  if (!isFriendDmConsumerEnabled()) {
    console.log('[friendDmConsumer] skipped (no RABBITMQ_URL or FRIEND_DM_USE_QUEUE=false)');
    return null;
  }

  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();

  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await assertQuorumQueue(ch, QUEUE);
  await ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

  const { consumerTag: tag } = await ch.consume(
    QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processPayload(raw);
        ch.ack(msg);
      } catch (err) {
        console.error('[friendDmConsumer] process error', err.message);
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) => console.error('[friendDmConsumer] conn error', err.message));
  console.log(`[friendDmConsumer] listening on ${QUEUE}`);

  dmConsumer = { conn, ch, tag };
  await waitForAmqpClose(conn);
  await stopFriendDmConsumer();
  return dmConsumer;
}

function runFriendDmConsumerLoop() {
  return runWithReconnect('friendDmConsumer', startFriendDmConsumer, {
    shouldRun: isFriendDmConsumerEnabled,
  });
}

async function stopFriendDmConsumer() {
  if (!dmConsumer) return;
  try {
    await dmConsumer.ch.cancel(dmConsumer.tag);
  } catch (e) {
    /* ignore */
  }
  try {
    await dmConsumer.ch.close();
  } catch (e) {
    /* ignore */
  }
  try {
    await dmConsumer.conn.close();
  } catch (e) {
    /* ignore */
  }
  dmConsumer = null;
}

module.exports = { startFriendDmConsumer, stopFriendDmConsumer, runFriendDmConsumerLoop };

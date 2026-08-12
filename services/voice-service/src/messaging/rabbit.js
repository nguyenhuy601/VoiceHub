const amqp = require('amqplib');
const { assertQuorumQueue, isQuorumQueuesEnabled } = require('@enterprise/shared/messaging/rabbitQuorum');

let conn = null;
let confirmChannel = null;

async function getConfirmChannel() {
  if (confirmChannel) return confirmChannel;
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');

  conn = await amqp.connect(url);
  confirmChannel = await conn.createConfirmChannel();
  conn.on('error', () => {
    confirmChannel = null;
    conn = null;
  });
  conn.on('close', () => {
    confirmChannel = null;
    conn = null;
  });
  return confirmChannel;
}

async function assertPublishQueue(channel, queue) {
  if (isQuorumQueuesEnabled()) {
    await assertQuorumQueue(channel, queue);
  } else {
    await channel.assertQueue(queue, { durable: true });
  }
}

function sendToQueueConfirmed(channel, queue, buf, opts) {
  return new Promise((resolve, reject) => {
    const onSent = (err) => {
      if (err) reject(err);
      else resolve();
    };
    const trySend = () => channel.sendToQueue(queue, buf, opts, onSent);
    if (!trySend()) {
      channel.once('drain', () => {
        if (!channel.sendToQueue(queue, buf, opts, onSent)) {
          reject(new Error('RabbitMQ publish drain retry failed'));
        }
      });
    }
  });
}

async function publishJson(queue, payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  const opts = {
    persistent: true,
    contentType: 'application/json',
  };

  const publishOnce = async () => {
    const ch = await getConfirmChannel();
    await assertPublishQueue(ch, queue);
    await sendToQueueConfirmed(ch, queue, buf, opts);
    return true;
  };

  try {
    return await publishOnce();
  } catch (err) {
    const msg = String(err?.message || err || '');
    const recoverable =
      msg.includes('Channel closed') ||
      msg.includes('Connection closed') ||
      msg.includes('IllegalOperationError');
    if (!recoverable) throw err;
    confirmChannel = null;
    conn = null;
    return publishOnce();
  }
}

async function getChannel() {
  return getConfirmChannel();
}

async function closeRabbit() {
  try {
    if (confirmChannel) await confirmChannel.close();
  } catch {
    /* ignore */
  }
  confirmChannel = null;
  try {
    if (conn) await conn.close();
  } catch {
    /* ignore */
  }
  conn = null;
}

module.exports = { getChannel, publishJson, closeRabbit };

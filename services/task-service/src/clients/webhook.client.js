// keep in sync: outbound webhook helper (task domain)
const axios = require('axios');
const logger = require('@enterprise/shared/utils/logger');

let hasWarnedMissingSecret = false;
let hasWarnedMissingUrl = false;

function getWebhookServiceUrl() {
  return String(process.env.WEBHOOK_SERVICE_URL || '').trim().replace(/\/+$/, '');
}

async function sendWebhook(eventType, eventName, data) {
  const WEBHOOK_SERVICE_URL = getWebhookServiceUrl();
  if (!WEBHOOK_SERVICE_URL) {
    if (!hasWarnedMissingUrl) {
      hasWarnedMissingUrl = true;
      logger.warn('[webhook] WEBHOOK_SERVICE_URL not set; skip outbound webhook');
    }
    return;
  }

  const WEBHOOK_SECRET = String(process.env.WEBHOOK_SECRET || '').trim();

  try {
    const payload = { event_type: eventName, ...data };
    await axios.post(`${WEBHOOK_SERVICE_URL}/webhook/${eventType}`, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_SECRET ? { 'X-Webhook-Secret': WEBHOOK_SECRET } : {}),
      },
      timeout: 5000,
    });
    if (!WEBHOOK_SECRET && !hasWarnedMissingSecret) {
      hasWarnedMissingSecret = true;
      logger.warn('WEBHOOK_SECRET is not configured; outbound webhook requests are unsigned');
    }
    logger.info(`Webhook sent: ${eventType}/${eventName}`);
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail || error.response?.data?.message;
    logger.error(
      `Error sending webhook ${eventType}/${eventName}: ${error.message}${status ? ` [HTTP ${status}]` : ''}${detail ? ` — ${detail}` : ''}`
    );
  }
}

const taskWebhook = {
  async created(taskId, taskTitle, createdBy, assigneeId, organizationId) {
    await sendWebhook('task', 'task_created', {
      taskId, taskTitle, createdBy, assigneeId, organizationId,
    });
  },
  async assigned(taskId, taskTitle, assigneeId, assignedBy, organizationId) {
    await sendWebhook('task', 'task_assigned', {
      taskId, taskTitle, assigneeId, assignedBy, organizationId,
    });
  },
  async completed(taskId, taskTitle, completedBy, createdBy, organizationId) {
    await sendWebhook('task', 'task_completed', {
      taskId, taskTitle, completedBy, createdBy, organizationId,
    });
  },
  async updated(taskId, taskTitle, assigneeId, updatedBy, changes, organizationId) {
    await sendWebhook('task', 'task_updated', {
      taskId, taskTitle, assigneeId, updatedBy, changes, organizationId,
    });
  },
};

module.exports = { taskWebhook };

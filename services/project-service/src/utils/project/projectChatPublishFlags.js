function isPublishEnabled() {
  const raw = String(process.env.PROJECT_CHAT_EVENT_PUBLISH ?? 'true').toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  return true;
}

module.exports = { isPublishEnabled };

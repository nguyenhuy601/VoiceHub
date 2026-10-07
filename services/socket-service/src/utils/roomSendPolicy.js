/**
 * Client không được broadcast event tùy ý vào room (chống spoof edit/delete).
 * Tin nhắn chỉ đi REST → /internal/realtime/publish.
 */
function rejectClientRoomSend() {
  return {
    rejected: true,
    code: 'ROOM_SEND_DISABLED',
    message: 'Client room:send is disabled; use REST APIs',
  };
}

module.exports = { rejectClientRoomSend };

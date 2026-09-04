(function () {
  const jsonHeaders = { "Content-Type": "application/json" };
  const apiBase = new URL("backend/api/", window.location.href).pathname;

  async function request(path, payload) {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.message || "The love server is being dramatic. Try again.");
    }

    return data;
  }

  window.DatingApi = {
    start: (visitorId) => request("start.php", { visitor_id: visitorId }),
    saveDate: (visitorId, selectedDate, selectedTime) =>
      request("date.php", {
        visitor_id: visitorId,
        selected_date: selectedDate,
        selected_time: selectedTime,
      }),
    saveFood: (visitorId, selectedFood) =>
      request("food.php", {
        visitor_id: visitorId,
        selected_food: selectedFood,
      }),
    saveLocation: (payload) => request("location.php", payload),
    accept: (visitorId) => request("accept.php", { visitor_id: visitorId }),
    matches: (visitorId) => request("matches.php", { visitor_id: visitorId }),
    startChat: (visitorId, chatMode) =>
      request("chat-start.php", { visitor_id: visitorId, chat_mode: chatMode }),
    chatStatus: (visitorId, roomToken) =>
      request("chat-status.php", { visitor_id: visitorId, room_token: roomToken }),
    sendMessage: (visitorId, roomToken, messageText) =>
      request("chat-message.php", {
        visitor_id: visitorId,
        room_token: roomToken,
        message_text: messageText,
      }),
    messages: (visitorId, roomToken, afterId) =>
      request("chat-messages.php", {
        visitor_id: visitorId,
        room_token: roomToken,
        after_id: afterId,
      }),
    sendSignal: (visitorId, roomToken, signalType, signalPayload) =>
      request("chat-signal.php", {
        visitor_id: visitorId,
        room_token: roomToken,
        signal_type: signalType,
        signal_payload: signalPayload,
      }),
    signals: (visitorId, roomToken, afterId) =>
      request("chat-signals.php", {
        visitor_id: visitorId,
        room_token: roomToken,
        after_id: afterId,
      }),
    leaveChat: (visitorId, roomToken) =>
      request("chat-leave.php", { visitor_id: visitorId, room_token: roomToken }),
    heartbeat: (payload) => request("online-heartbeat.php", payload),
    onlineStats: (visitorId) => request("online-stats.php", { visitor_id: visitorId }),
  };
})();

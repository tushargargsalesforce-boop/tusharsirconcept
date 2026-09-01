const LOCATION_DATA = {
  India: {
    Maharashtra: {
      Pune: {
        "Shivajinagar": { lat: 18.5308, lng: 73.8475 },
        "Koregaon Park": { lat: 18.5362, lng: 73.8938 },
        "Hinjawadi": { lat: 18.5913, lng: 73.7389 },
      },
      Mumbai: {
        Bandra: { lat: 19.0596, lng: 72.8295 },
        Andheri: { lat: 19.1197, lng: 72.8464 },
      },
    },
    Delhi: {
      "New Delhi": {
        "Connaught Place": { lat: 28.6315, lng: 77.2167 },
        Saket: { lat: 28.5245, lng: 77.2066 },
      },
    },
  },
  "United States": {
    California: {
      "Los Angeles County": {
        "Santa Monica": { lat: 34.0195, lng: -118.4912 },
        Pasadena: { lat: 34.1478, lng: -118.1445 },
      },
      "San Francisco County": {
        "Mission District": { lat: 37.7599, lng: -122.4148 },
        "Nob Hill": { lat: 37.793, lng: -122.4161 },
      },
    },
    "New York": {
      "New York County": {
        Chelsea: { lat: 40.7465, lng: -74.0014 },
        Harlem: { lat: 40.8116, lng: -73.9465 },
      },
    },
  },
};

const screens = [...document.querySelectorAll(".screen")];
const visitorId = getVisitorId();
let selectedFood = "";
let selectedTownPoint = null;
let chatRoomToken = "";
let chatIsCreator = false;
let chatStatusTimer = null;
let messageTimer = null;
let signalTimer = null;
let heartbeatTimer = null;
let statsTimer = null;
let lastMessageId = 0;
let lastSignalId = 0;
let peerConnection = null;
let localStream = null;
let videoStarted = false;
let chatMode = "text";

function getVisitorId() {
  const existing = localStorage.getItem("dating_visitor_id");
  if (existing) return existing;

  const generated = `dating_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  localStorage.setItem("dating_visitor_id", generated);
  return generated;
}

function showScreen(name) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === name);
  });
}

function setError(id, message = "") {
  document.getElementById(id).textContent = message;
}

function populateSelect(select, values, placeholder) {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.appendChild(empty);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.disabled = values.length === 0;
}

function initLocationControls() {
  const country = document.getElementById("countrySelect");
  const state = document.getElementById("stateSelect");
  const district = document.getElementById("districtSelect");
  const town = document.getElementById("townSelect");

  populateSelect(country, Object.keys(LOCATION_DATA), "choose country...");
  populateSelect(state, [], "choose state...");
  populateSelect(district, [], "choose district...");
  populateSelect(town, [], "choose town...");

  country.addEventListener("change", () => {
    populateSelect(state, Object.keys(LOCATION_DATA[country.value] || {}), "choose state...");
    populateSelect(district, [], "choose district...");
    populateSelect(town, [], "choose town...");
    selectedTownPoint = null;
  });

  state.addEventListener("change", () => {
    const districts = LOCATION_DATA[country.value]?.[state.value] || {};
    populateSelect(district, Object.keys(districts), "choose district...");
    populateSelect(town, [], "choose town...");
    selectedTownPoint = null;
  });

  district.addEventListener("change", () => {
    const towns = LOCATION_DATA[country.value]?.[state.value]?.[district.value] || {};
    populateSelect(town, Object.keys(towns), "choose town...");
    selectedTownPoint = null;
  });

  town.addEventListener("change", () => {
    selectedTownPoint = LOCATION_DATA[country.value]?.[state.value]?.[district.value]?.[town.value] || null;
    renderMapPins([]);
  });
}

function renderMapPins(matches) {
  const map = document.getElementById("approxMap");
  map.querySelectorAll(".match-pin").forEach((pin) => pin.remove());

  matches.forEach((match, index) => {
    const pin = document.createElement("div");
    pin.className = "map-pin match-pin";
    pin.textContent = match.label;
    pin.style.left = `${32 + ((index * 19) % 44)}%`;
    pin.style.top = `${30 + ((index * 23) % 42)}%`;
    map.appendChild(pin);
  });
}

function renderMatches(matches) {
  const list = document.getElementById("matchList");
  list.innerHTML = "";

  if (!matches.length) {
    list.innerHTML = '<div class="match-item"><strong>No accepted matches yet</strong><span>Try again later, or let someone nearby accept first.</span></div>';
    renderMapPins([]);
    return;
  }

  matches.forEach((match) => {
    const item = document.createElement("div");
    item.className = "match-item";
    item.innerHTML = `
      <strong>${escapeHtml(match.label)}</strong>
      <span>${escapeHtml(match.town)}, ${escapeHtml(match.district)} · approx ${escapeHtml(String(match.distance_km))} km away</span>
      <span>Vibe: ${escapeHtml(match.selected_food || "kept private")} · time: ${escapeHtml(match.selected_time || "kept private")}</span>
    `;
    list.appendChild(item);
  });

  renderMapPins(matches);
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function currentLocationPayload() {
  return {
    visitor_id: visitorId,
    country: document.getElementById("countrySelect")?.value || "",
    state: document.getElementById("stateSelect")?.value || "",
    district: document.getElementById("districtSelect")?.value || "",
    town: document.getElementById("townSelect")?.value || "",
  };
}

function renderStatsList(containerId, rows, formatLabel) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (!rows.length) {
    container.innerHTML = '<div class="stat-row"><span>No data yet</span><strong>0</strong></div>';
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "stat-row";
    item.innerHTML = `<span>${escapeHtml(formatLabel(row))}</span><strong>${Number(row.total).toLocaleString()}</strong>`;
    container.appendChild(item);
  });
}

async function refreshOnlineStats() {
  try {
    const stats = await DatingApi.onlineStats(visitorId);
    const total = Number(stats.total_online || 0);
    document.getElementById("onlineCounter").textContent = `${total.toLocaleString()} online now`;
    document.getElementById("onlineTotal").textContent = `${total.toLocaleString()} people online right now`;
    renderStatsList("countryStats", stats.countries || [], (row) => row.label);
    renderStatsList("stateStats", stats.states || [], (row) => `${row.state}, ${row.country}`);
  } catch (error) {
    document.getElementById("onlineCounter").textContent = "online count unavailable";
  }
}

async function sendHeartbeat() {
  try {
    await DatingApi.heartbeat(currentLocationPayload());
    await refreshOnlineStats();
  } catch (error) {
    document.getElementById("onlineCounter").textContent = "online count unavailable";
  }
}

function setChatStatus(message) {
  document.getElementById("chatStatus").textContent = message;
}

function setChatEnabled(enabled) {
  document.getElementById("messageInput").disabled = !enabled;
  document.querySelector(".send-btn").disabled = !enabled;
  document.getElementById("videoChatBtn").disabled = !enabled || chatMode !== "video";
  document.getElementById("leaveChatBtn").disabled = !chatRoomToken;
}

function addMessageBubble(message) {
  const messages = document.getElementById("messages");
  const bubble = document.createElement("div");
  bubble.className = `message ${message.sender}`;
  bubble.textContent = message.message_text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function stopTimer(timer) {
  if (timer) {
    clearInterval(timer);
  }
}

function resetChatUi() {
  stopTimer(chatStatusTimer);
  stopTimer(messageTimer);
  stopTimer(signalTimer);
  chatStatusTimer = null;
  messageTimer = null;
  signalTimer = null;
  chatRoomToken = "";
  chatIsCreator = false;
  lastMessageId = 0;
  lastSignalId = 0;
  videoStarted = false;
  setChatEnabled(false);
  setChatStatus("Not connected");
  document.getElementById("messages").innerHTML = "";
  document.getElementById("videoChatBtn").textContent = "start video";
  stopVideo();
}

function startMessagePolling() {
  stopTimer(messageTimer);
  messageTimer = setInterval(async () => {
    if (!chatRoomToken) return;

    try {
      const response = await DatingApi.messages(visitorId, chatRoomToken, lastMessageId);
      response.messages.forEach((message) => {
        lastMessageId = Math.max(lastMessageId, message.id);
        addMessageBubble(message);
      });
    } catch (error) {
      setError("chatError", error.message);
    }
  }, 1400);
}

async function pollChatStatus() {
  if (!chatRoomToken) return;

  try {
    const response = await DatingApi.chatStatus(visitorId, chatRoomToken);
    chatIsCreator = response.is_creator;

    if (response.status === "active" && response.has_partner) {
      setChatStatus(`Connected with ${response.partner_label}`);
      setChatEnabled(true);
      stopTimer(chatStatusTimer);
      chatStatusTimer = null;
      startMessagePolling();
    } else if (response.status === "ended") {
      setChatStatus("Chat ended");
      setChatEnabled(false);
      stopVideo();
    } else {
      setChatStatus("Waiting for a different person...");
    }
  } catch (error) {
    setError("chatError", error.message);
  }
}

async function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && chatRoomToken) {
      DatingApi.sendSignal(visitorId, chatRoomToken, "ice", event.candidate.toJSON()).catch((error) => {
        setError("chatError", error.message);
      });
    }
  };

  peerConnection.ontrack = (event) => {
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  return peerConnection;
}

async function startVideo() {
  if (!chatRoomToken || videoStarted) return;

  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    setError("chatError", "Video chat needs a modern browser on localhost or HTTPS.");
    return;
  }

  try {
    const connection = await createPeerConnection();
    videoStarted = true;
    document.getElementById("videoChatBtn").textContent = "video on";
    startSignalPolling();

    if (chatIsCreator) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await DatingApi.sendSignal(visitorId, chatRoomToken, "offer", offer);
    }
  } catch (error) {
    setError("chatError", error.message);
  }
}

function startSignalPolling() {
  stopTimer(signalTimer);
  signalTimer = setInterval(async () => {
    if (!chatRoomToken) return;

    try {
      const response = await DatingApi.signals(visitorId, chatRoomToken, lastSignalId);
      for (const signal of response.signals) {
        lastSignalId = Math.max(lastSignalId, signal.id);
        await handleSignal(signal);
      }
    } catch (error) {
      setError("chatError", error.message);
    }
  }, 1200);
}

async function handleSignal(signal) {
  const connection = await createPeerConnection();

  if (signal.signal_type === "offer") {
    await connection.setRemoteDescription(new RTCSessionDescription(signal.signal_payload));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await DatingApi.sendSignal(visitorId, chatRoomToken, "answer", answer);
    videoStarted = true;
    document.getElementById("videoChatBtn").textContent = "video on";
  }

  if (signal.signal_type === "answer" && connection.signalingState !== "stable") {
    await connection.setRemoteDescription(new RTCSessionDescription(signal.signal_payload));
  }

  if (signal.signal_type === "ice") {
    await connection.addIceCandidate(new RTCIceCandidate(signal.signal_payload));
  }
}

function stopVideo() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  localStream = null;
  peerConnection = null;
  document.getElementById("localVideo").srcObject = null;
  document.getElementById("remoteVideo").srcObject = null;
}

document.getElementById("noBtn").addEventListener("mouseenter", (event) => {
  const button = event.currentTarget;
  button.style.transform = `translate(${Math.random() * 140 - 70}px, ${Math.random() * 80 - 40}px)`;
});

document.getElementById("yesBtn").addEventListener("click", async () => {
  setError("inviteError");
  try {
    await DatingApi.start(visitorId);
    showScreen("yes");
  } catch (error) {
    setError("inviteError", error.message);
  }
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.next));
});

document.getElementById("saveDateBtn").addEventListener("click", async () => {
  const selectedDate = document.getElementById("dateInput").value;
  const selectedTime = document.getElementById("timeInput").value;
  setError("dateError");

  if (!selectedDate || !selectedTime) {
    setError("dateError", "Pick both day and time, sweetheart.");
    return;
  }

  try {
    await DatingApi.saveDate(visitorId, selectedDate, selectedTime);
    showScreen("food");
  } catch (error) {
    setError("dateError", error.message);
  }
});

document.getElementById("foodGrid").addEventListener("click", (event) => {
  const card = event.target.closest(".food-card");
  if (!card) return;

  selectedFood = card.dataset.food;
  document.querySelectorAll(".food-card").forEach((item) => item.classList.remove("selected"));
  card.classList.add("selected");
});

document.getElementById("saveFoodBtn").addEventListener("click", async () => {
  setError("foodError");

  if (!selectedFood) {
    setError("foodError", "Choose exactly one food vibe.");
    return;
  }

  try {
    await DatingApi.saveFood(visitorId, selectedFood);
    showScreen("location");
  } catch (error) {
    setError("foodError", error.message);
  }
});

document.getElementById("saveLocationBtn").addEventListener("click", async () => {
  const country = document.getElementById("countrySelect").value;
  const state = document.getElementById("stateSelect").value;
  const district = document.getElementById("districtSelect").value;
  const town = document.getElementById("townSelect").value;
  setError("locationError");

  if (!country || !state || !district || !town || !selectedTownPoint) {
    setError("locationError", "Complete country, state, district and town.");
    return;
  }

  try {
    await DatingApi.saveLocation({
      visitor_id: visitorId,
      country,
      state,
      district,
      town,
      latitude: selectedTownPoint.lat,
      longitude: selectedTownPoint.lng,
      search_radius_km: 10,
    });
    const response = await DatingApi.matches(visitorId);
    renderMatches(response.matches || []);
    showScreen("matches");
  } catch (error) {
    setError("locationError", error.message);
  }
});

document.getElementById("acceptBtn").addEventListener("click", async () => {
  setError("acceptError");

  try {
    await DatingApi.accept(visitorId);
    RomanceAnimations.confettiBurst();
  } catch (error) {
    setError("acceptError", error.message);
  }
});

document.getElementById("onlineCounter").addEventListener("click", async () => {
  const panel = document.getElementById("onlinePanel");
  const isOpen = panel.classList.toggle("open");
  panel.setAttribute("aria-hidden", String(!isOpen));
  await refreshOnlineStats();
});

document.getElementById("closeOnlinePanel").addEventListener("click", () => {
  const panel = document.getElementById("onlinePanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
});

document.getElementById("textModeBtn").addEventListener("click", () => {
  chatMode = "text";
  document.getElementById("textModeBtn").classList.add("active");
  document.getElementById("videoModeBtn").classList.remove("active");
  setChatEnabled(Boolean(chatRoomToken));
});

document.getElementById("videoModeBtn").addEventListener("click", () => {
  chatMode = "video";
  document.getElementById("videoModeBtn").classList.add("active");
  document.getElementById("textModeBtn").classList.remove("active");
  setChatEnabled(Boolean(chatRoomToken));
});

document.getElementById("findChatBtn").addEventListener("click", async () => {
  resetChatUi();
  setError("chatError");
  setChatStatus("Finding someone sweet...");

  try {
    const response = await DatingApi.startChat(visitorId);
    chatRoomToken = response.room_token;
    chatIsCreator = response.role === "creator";
    document.getElementById("leaveChatBtn").disabled = false;
    await pollChatStatus();
    chatStatusTimer = setInterval(pollChatStatus, 1800);
  } catch (error) {
    setError("chatError", error.message);
    setChatStatus("Not connected");
  }
});

document.getElementById("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  if (!message || !chatRoomToken) return;

  input.value = "";
  try {
    await DatingApi.sendMessage(visitorId, chatRoomToken, message);
    const response = await DatingApi.messages(visitorId, chatRoomToken, lastMessageId);
    response.messages.forEach((item) => {
      lastMessageId = Math.max(lastMessageId, item.id);
      addMessageBubble(item);
    });
  } catch (error) {
    setError("chatError", error.message);
  }
});

document.getElementById("videoChatBtn").addEventListener("click", startVideo);

document.getElementById("leaveChatBtn").addEventListener("click", async () => {
  const roomToLeave = chatRoomToken;

  try {
    if (roomToLeave) {
      await DatingApi.leaveChat(visitorId, roomToLeave);
    }
  } catch (error) {
    setError("chatError", error.message);
  } finally {
    resetChatUi();
  }
});

window.addEventListener("beforeunload", () => {
  if (chatRoomToken) {
    navigator.sendBeacon?.(
      new URL("backend/api/chat-leave.php", window.location.href).pathname,
      JSON.stringify({ visitor_id: visitorId, room_token: chatRoomToken })
    );
  }
});

RomanceAnimations.makePetals();
initLocationControls();
sendHeartbeat();
heartbeatTimer = setInterval(sendHeartbeat, 30000);
statsTimer = setInterval(refreshOnlineStats, 45000);

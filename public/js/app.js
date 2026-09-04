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
let chatAccessApproved = false;
let mediaAccessApproved = false;
let chatSearchInProgress = false;
let micEnabled = true;
let cameraEnabled = true;
let speakerEnabled = true;

function getVisitorId() {
  const existing = localStorage.getItem("dating_visitor_id");
  if (existing) return existing;

  const generated = `dating_${generateIdPart(10)}`;
  localStorage.setItem("dating_visitor_id", generated);
  return generated;
}

function generateIdPart(length) {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, "").slice(0, length);
  }

  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    window.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, length);
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
    const item = typeof value === "string" ? { name: value, geonameId: value } : value;
    const option = document.createElement("option");
    option.value = String(item.geonameId);
    option.textContent = item.name;
    option.dataset.name = item.name;
    option.dataset.lat = item.lat ?? "";
    option.dataset.lng = item.lng ?? "";
    option.dataset.countryCode = item.countryCode ?? "";
    option.dataset.adminCode1 = item.adminCode1 ?? "";
    option.dataset.adminCode2 = item.adminCode2 ?? "";
    option.dataset.featureClass = item.featureClass ?? "";
    option.dataset.featureCode = item.featureCode ?? "";
    select.appendChild(option);
  });

  select.disabled = values.length === 0;
}

function setSelectLoading(select, message) {
  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = message;
  select.appendChild(option);
  select.disabled = true;
}

function selectedGeoOption(select) {
  const option = select.selectedOptions[0];

  if (!option || !option.value) {
    return null;
  }

  return {
    geonameId: option.value,
    name: option.dataset.name || option.textContent,
    lat: Number(option.dataset.lat),
    lng: Number(option.dataset.lng),
    countryCode: option.dataset.countryCode || "",
    adminCode1: option.dataset.adminCode1 || "",
    adminCode2: option.dataset.adminCode2 || "",
    featureClass: option.dataset.featureClass || "",
    featureCode: option.dataset.featureCode || "",
  };
}

function selectedGeoName(selectId) {
  return selectedGeoOption(document.getElementById(selectId))?.name || "";
}

async function loadGeoNames(payload) {
  const response = await DatingApi.geonames(payload);
  return response.items || [];
}

async function initLocationControls() {
  const country = document.getElementById("countrySelect");
  const state = document.getElementById("stateSelect");
  const district = document.getElementById("districtSelect");
  const town = document.getElementById("townSelect");

  setSelectLoading(country, "loading countries...");
  populateSelect(state, [], "choose state...");
  populateSelect(district, [], "choose district...");
  populateSelect(town, [], "choose town...");
  updateMapPreview();

  try {
    populateSelect(country, await loadGeoNames({ action: "countries" }), "choose country...");
  } catch (error) {
    populateSelect(country, [], "GeoNames setup needed");
    setError("locationError", error.message);
  }

  country.addEventListener("change", async () => {
    const selectedCountry = selectedGeoOption(country);
    selectedTownPoint = null;
    populateSelect(district, [], "choose district...");
    populateSelect(town, [], "choose town...");
    updateMapPreview();

    if (!selectedCountry) {
      populateSelect(state, [], "choose state...");
      return;
    }

    setSelectLoading(state, "loading states...");
    setError("locationError");

    try {
      populateSelect(
        state,
        await loadGeoNames({ action: "children", geoname_id: selectedCountry.geonameId }),
        "choose state..."
      );
    } catch (error) {
      populateSelect(state, [], "states unavailable");
      setError("locationError", error.message);
    }
  });

  state.addEventListener("change", async () => {
    const selectedState = selectedGeoOption(state);
    selectedTownPoint = null;
    populateSelect(town, [], "choose town...");
    updateMapPreview();

    if (!selectedState) {
      populateSelect(district, [], "choose district...");
      return;
    }

    setSelectLoading(district, "loading districts...");
    setError("locationError");

    try {
      populateSelect(
        district,
        await loadGeoNames({ action: "children", geoname_id: selectedState.geonameId }),
        "choose district..."
      );
    } catch (error) {
      populateSelect(district, [], "districts unavailable");
      setError("locationError", error.message);
    }
  });

  district.addEventListener("change", async () => {
    const selectedDistrict = selectedGeoOption(district);
    selectedTownPoint = null;
    updateMapPreview();

    if (!selectedDistrict) {
      populateSelect(town, [], "choose town...");
      return;
    }

    setSelectLoading(town, "loading towns...");
    setError("locationError");

    try {
      let townItems = await loadGeoNames({ action: "children", geoname_id: selectedDistrict.geonameId });

      if (!townItems.length) {
        townItems = await loadGeoNames({
          action: "cities",
          country_code: selectedDistrict.countryCode,
          admin_code_1: selectedDistrict.adminCode1,
          admin_code_2: selectedDistrict.adminCode2,
        });
      }

      populateSelect(town, townItems, "choose town...");
    } catch (error) {
      populateSelect(town, [], "towns unavailable");
      setError("locationError", error.message);
    }
  });

  town.addEventListener("change", () => {
    const selectedTown = selectedGeoOption(town);
    selectedTownPoint = selectedTown && Number.isFinite(selectedTown.lat) && Number.isFinite(selectedTown.lng)
      ? { lat: selectedTown.lat, lng: selectedTown.lng }
      : null;
    updateMapPreview();
  });
}

function renderMapPins(matches) {
  const map = document.getElementById("approxMap");
  const status = document.getElementById("mapStatus");
  map.querySelectorAll(".match-pin").forEach((pin) => pin.remove());

  if (status && selectedTownPoint) {
    const town = selectedGeoName("townSelect");
    const district = selectedGeoName("districtSelect");
    status.textContent = `${town}, ${district} · approx ${selectedTownPoint.lat.toFixed(4)}, ${selectedTownPoint.lng.toFixed(4)}`;
  }

  matches.forEach((match, index) => {
    const distance = Math.min(Number(match.distance_km) || 1, 10);
    const angle = ((index * 137.5) - 90) * (Math.PI / 180);
    const radius = 8 + (distance / 10) * 35;
    const pin = document.createElement("div");
    pin.className = "map-pin match-pin";
    pin.innerHTML = `${escapeHtml(match.label)}<small>${escapeHtml(String(match.distance_km))} km</small>`;
    pin.style.left = `${50 + Math.cos(angle) * radius}%`;
    pin.style.top = `${50 + Math.sin(angle) * radius * 0.72}%`;
    pin.title = `${match.label} · approx ${match.distance_km} km away`;
    map.appendChild(pin);
  });
}

function updateMapPreview() {
  const map = document.getElementById("approxMap");
  const status = document.getElementById("mapStatus");
  const userPin = map.querySelector(".user-pin");

  map.querySelectorAll(".match-pin").forEach((pin) => pin.remove());
  map.classList.toggle("ready", Boolean(selectedTownPoint));

  if (!selectedTownPoint) {
    status.textContent = "Select your town to preview the 10 km area.";
    userPin.textContent = "You";
    return;
  }

  const town = selectedGeoName("townSelect");
  const district = selectedGeoName("districtSelect");
  status.textContent = `${town}, ${district} · approx ${selectedTownPoint.lat.toFixed(4)}, ${selectedTownPoint.lng.toFixed(4)}`;
  userPin.textContent = "You";
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
    country: selectedGeoName("countrySelect"),
    state: selectedGeoName("stateSelect"),
    district: selectedGeoName("districtSelect"),
    town: selectedGeoName("townSelect"),
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

function updateChatModeUi() {
  document.querySelector(".chat-panel").classList.toggle("video-mode", chatMode === "video");
  document.getElementById("textModeBtn").classList.toggle("active", chatMode === "text");
  document.getElementById("videoModeBtn").classList.toggle("active", chatMode === "video");
  updatePermissionButton();
  setChatEnabled(Boolean(chatRoomToken));
}

function setChatEnabled(enabled) {
  const canUseChat = enabled && chatAccessApproved;

  document.getElementById("messageInput").disabled = !canUseChat;
  document.querySelector(".send-btn").disabled = !canUseChat;
  document.getElementById("videoChatBtn").disabled = !canUseChat || chatMode !== "video" || !mediaAccessApproved;
  document.getElementById("skipChatBtn").disabled = !chatRoomToken || chatSearchInProgress;
  document.getElementById("leaveChatBtn").disabled = !chatRoomToken;
  document.getElementById("findChatBtn").disabled = !chatAccessApproved || chatSearchInProgress;
  updateMediaButtons();
}

function updateMediaButtons() {
  const micButton = document.getElementById("micToggleBtn");
  const cameraButton = document.getElementById("cameraToggleBtn");
  const speakerButton = document.getElementById("speakerToggleBtn");
  const hasStream = Boolean(localStream);

  micButton.disabled = !hasStream;
  cameraButton.disabled = !hasStream;
  speakerButton.disabled = !document.getElementById("remoteVideo").srcObject;
  micButton.textContent = micEnabled ? "mic on" : "mic off";
  cameraButton.textContent = cameraEnabled ? "camera on" : "camera off";
  speakerButton.textContent = speakerEnabled ? "speaker on" : "speaker off";
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
  chatSearchInProgress = false;
  setChatEnabled(false);
  setChatStatus("Not connected");
  document.getElementById("messages").innerHTML = "";
  document.getElementById("videoChatBtn").textContent = "start video";
  stopVideo();
  updatePermissionButton();
  updateMediaButtons();
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

      if (chatMode === "video" && mediaAccessApproved) {
        await startVideo();
      }
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

function validateChatGate() {
  const age = Number(document.getElementById("ageInput").value);
  const gender = document.getElementById("genderSelect").value;
  const adultConfirmed = document.getElementById("adultConfirm").checked;

  if (!Number.isFinite(age) || age < 18) {
    throw new Error("You must be 18 or older to use random chat.");
  }

  if (!gender) {
    throw new Error("Choose girl, boy, or other before starting.");
  }

  if (!adultConfirmed) {
    throw new Error("Please confirm you are 18+ and agree to respectful chat.");
  }
}

function approveChatGate(statusMessage = "Ready. Click find person.") {
  chatAccessApproved = true;
  document.getElementById("chatGate").classList.add("approved");
  setChatStatus(statusMessage);
  setChatEnabled(Boolean(chatRoomToken));
  updatePermissionButton();
}

function updatePermissionButton() {
  const button = document.getElementById("permissionBtn");

  if (chatMode === "video") {
    button.textContent = mediaAccessApproved ? "camera and mic allowed" : "allow camera and mic";
    return;
  }

  button.textContent = chatAccessApproved ? "chat access allowed" : "continue to text chat";
}

function isLocalhostPage() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function localVideoUrl() {
  const port = window.location.port ? `:${window.location.port}` : "";
  return `http://localhost${port}${window.location.pathname}${window.location.search}`;
}

function mediaUnavailableMessage() {
  if (!window.isSecureContext && !isLocalhostPage()) {
    return `Video needs HTTPS or localhost. Open this page as ${localVideoUrl()} or install SSL for this domain.`;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser does not support camera/mic access. Use Chrome, Edge, or Firefox.";
  }

  if (!window.RTCPeerConnection) {
    return "This browser does not support live video calls.";
  }

  return "";
}

async function getLocalMediaStream() {
  const unavailableMessage = mediaUnavailableMessage();

  if (unavailableMessage) {
    throw new Error(unavailableMessage);
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (error) {
    if (error.name === "NotAllowedError") {
      throw new Error("Camera/mic permission was blocked. Allow it from the browser address bar and try again.");
    }

    if (error.name === "NotFoundError") {
      throw new Error("No camera or microphone was found on this device.");
    }

    throw new Error(error.message || "Camera/mic could not start.");
  }
}

async function ensureLocalMediaStream() {
  if (localStream) {
    return localStream;
  }

  localStream = await getLocalMediaStream();
  micEnabled = true;
  cameraEnabled = true;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = cameraEnabled;
  });
  const localVideo = document.getElementById("localVideo");
  localVideo.srcObject = localStream;
  localVideo.play().catch(() => {});
  updateMediaButtons();
  return localStream;
}

async function requestChatPermissions() {
  validateChatGate();

  if (chatMode === "text") {
    approveChatGate();
    return;
  }

  await ensureLocalMediaStream();
  mediaAccessApproved = true;
  approveChatGate("Camera and mic allowed. Click find person.");
}

async function prepareSelectedChatMode() {
  validateChatGate();

  if (chatMode === "video") {
    await ensureLocalMediaStream();
    mediaAccessApproved = true;
    approveChatGate("Camera and mic allowed. Click find person.");
    return;
  }

  if (!chatAccessApproved) {
    approveChatGate();
  }
}

async function beginRandomChat(statusMessage = "Finding someone sweet...") {
  if (chatSearchInProgress) return;

  resetChatUi();
  chatSearchInProgress = true;
  setChatEnabled(false);
  setError("chatError");
  setChatStatus(statusMessage);

  try {
    await prepareSelectedChatMode();
  } catch (error) {
    chatSearchInProgress = false;
    setError("chatError", error.message);
    setChatStatus("Complete the 18+ chat check first");
    setChatEnabled(false);
    return;
  }

  try {
    const response = await DatingApi.startChat(visitorId, chatMode);
    chatRoomToken = response.room_token;
    chatIsCreator = response.role === "creator";
    chatSearchInProgress = false;
    setChatEnabled(false);
    await pollChatStatus();
    chatStatusTimer = setInterval(pollChatStatus, 1800);
  } catch (error) {
    chatSearchInProgress = false;
    setError("chatError", error.message);
    setChatStatus("Not connected");
    setChatEnabled(false);
  }
}

async function leaveCurrentChat() {
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
    const remoteVideo = document.getElementById("remoteVideo");
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.muted = !speakerEnabled;
    remoteVideo.play().catch(() => {});
    updateMediaButtons();
  };

  const stream = await ensureLocalMediaStream();
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  return peerConnection;
}

async function startVideo() {
  if (!chatRoomToken || videoStarted) return;

  const unavailableMessage = mediaUnavailableMessage();
  if (unavailableMessage) {
    setError("chatError", unavailableMessage);
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
  updateMediaButtons();
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

  const otherField = document.getElementById("otherFoodField");
  const otherInput = document.getElementById("otherFoodInput");
  const isOther = selectedFood === "Other";
  otherField.hidden = !isOther;

  if (isOther) {
    otherInput.focus();
  } else {
    otherInput.value = "";
  }
});

document.getElementById("saveFoodBtn").addEventListener("click", async () => {
  setError("foodError");
  const otherFood = document.getElementById("otherFoodInput").value.trim();
  const foodToSave = selectedFood === "Other" ? otherFood : selectedFood;

  if (!foodToSave) {
    setError("foodError", "Choose exactly one food vibe.");
    return;
  }

  try {
    await DatingApi.saveFood(visitorId, foodToSave);
    showScreen("location");
  } catch (error) {
    setError("foodError", error.message);
  }
});

document.getElementById("saveLocationBtn").addEventListener("click", async () => {
  const country = selectedGeoName("countrySelect");
  const state = selectedGeoName("stateSelect");
  const district = selectedGeoName("districtSelect");
  const town = selectedGeoName("townSelect");
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
  setError("chatError");
  stopVideo();
  updateChatModeUi();
});

document.getElementById("videoModeBtn").addEventListener("click", async () => {
  chatMode = "video";
  updateChatModeUi();
  setError("chatError");

  try {
    await requestChatPermissions();
    if (chatRoomToken) await startVideo();
  } catch (error) {
    setError("chatError", error.message);
    setChatStatus("Allow camera and mic before video matching");
  }
});

document.getElementById("permissionBtn").addEventListener("click", async () => {
  setError("chatError");
  try {
    await requestChatPermissions();
  } catch (error) {
    setError("chatError", error.message);
    setChatStatus("Permission needed before matching");
  }
});

["ageInput", "genderSelect", "adultConfirm"].forEach((id) => {
  const gateControl = document.getElementById(id);
  const resetGateApproval = () => {
    chatAccessApproved = false;
    document.getElementById("chatGate").classList.remove("approved");
    updatePermissionButton();
    setChatEnabled(Boolean(chatRoomToken));
  };

  gateControl.addEventListener("input", resetGateApproval);
  gateControl.addEventListener("change", resetGateApproval);
});

document.getElementById("findChatBtn").addEventListener("click", () => beginRandomChat());

document.getElementById("skipChatBtn").addEventListener("click", async () => {
  const roomToLeave = chatRoomToken;
  resetChatUi();
  setChatStatus("Skipping...");

  try {
    if (roomToLeave) {
      await DatingApi.leaveChat(visitorId, roomToLeave);
    }
  } catch (error) {
    setError("chatError", error.message);
  }

  await beginRandomChat("Finding a new person...");
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

document.getElementById("micToggleBtn").addEventListener("click", () => {
  micEnabled = !micEnabled;
  localStream?.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  updateMediaButtons();
});

document.getElementById("cameraToggleBtn").addEventListener("click", () => {
  cameraEnabled = !cameraEnabled;
  localStream?.getVideoTracks().forEach((track) => {
    track.enabled = cameraEnabled;
  });
  updateMediaButtons();
});

document.getElementById("speakerToggleBtn").addEventListener("click", () => {
  speakerEnabled = !speakerEnabled;
  const remoteVideo = document.getElementById("remoteVideo");
  remoteVideo.muted = !speakerEnabled;
  updateMediaButtons();
});

document.getElementById("leaveChatBtn").addEventListener("click", leaveCurrentChat);

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
updateChatModeUi();
updatePermissionButton();
sendHeartbeat();
heartbeatTimer = setInterval(sendHeartbeat, 30000);
statsTimer = setInterval(refreshOnlineStats, 45000);

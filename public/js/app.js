const screens = [...document.querySelectorAll(".screen")];
const visitorId = getVisitorId();
const stateStorageKey = `dating_app_state_${visitorId}`;
const ageGateStorageKey = "talkifi_age_gate_v1";
const validScreens = new Set(screens.map((screen) => screen.dataset.screen));
let selectedFood = "";
let selectedTownPoint = null;
let detectedLocation = null;
let locationPromptAttempted = false;
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
let videoStartInProgress = false;
let chatMode = "text";
let chatAccessApproved = false;
let mediaAccessApproved = false;
let chatSearchInProgress = false;
let micEnabled = true;
let cameraEnabled = true;
let speakerEnabled = true;
let faceMonitorTimer = null;
let faceMissingSince = 0;
let faceWarningInProgress = false;
let faceDetector = null;
let nearbySearchRequestId = 0;
let nearbySearchTimer = null;
let locationControlsReady = Promise.resolve();

function readSavedState() {
  try {
    return JSON.parse(localStorage.getItem(stateStorageKey) || "{}");
  } catch (error) {
    return {};
  }
}

const savedState = readSavedState();

if (savedState.detectedCountry) {
  detectedLocation = {
    country: savedState.detectedCountry,
    state: savedState.detectedState || "",
    district: savedState.detectedDistrict || "",
    town: savedState.detectedTown || "",
  };
}

function saveState(patch = {}) {
  Object.assign(savedState, patch);
  localStorage.setItem(stateStorageKey, JSON.stringify(savedState));
}

function isAgeVerified() {
  return localStorage.getItem(ageGateStorageKey) === "accepted";
}

function showAgeGate() {
  const gate = document.getElementById("ageGate");
  if (!gate) return;
  const needsGate = !isAgeVerified();
  gate.hidden = !needsGate;
  document.body.classList.toggle("age-gate-open", needsGate);
}

function closeAgeGate() {
  document.getElementById("ageGate").hidden = true;
  document.body.classList.remove("age-gate-open");
}

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

function renderScreen(name) {
  if (!validScreens.has(name)) return;
  document.body.classList.toggle("dark-landing", name === "invite");
  document.body.classList.toggle("dark-app", name !== "invite");
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === name);
  });
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  saveState({ screen: name });
}

function showScreen(name, { replace = false } = {}) {
  if (!validScreens.has(name)) return;
  renderScreen(name);
  const state = { screen: name };
  const url = new URL(window.location.href);
  url.searchParams.set("screen", name);
  if (replace) {
    window.history.replaceState(state, "", url);
  } else {
    window.history.pushState(state, "", url);
  }
}

function restoreSavedFormState() {
  const dateInput = document.getElementById("dateInput");
  const timeInput = document.getElementById("timeInput");
  const ageInput = document.getElementById("ageInput");
  const genderSelect = document.getElementById("genderSelect");
  const adultConfirm = document.getElementById("adultConfirm");
  const otherFoodInput = document.getElementById("otherFoodInput");

  dateInput.value = savedState.selectedDate || "";
  timeInput.value = savedState.selectedTime || "";
  ageInput.value = savedState.age || "";
  genderSelect.value = savedState.gender || "";
  adultConfirm.checked = Boolean(savedState.adultConfirmed);
  selectedFood = savedState.selectedFood || "";
  otherFoodInput.value = savedState.otherFood || "";

  document.querySelectorAll(".food-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.food === selectedFood);
  });
  document.getElementById("otherFoodField").hidden = selectedFood !== "Other";
  chatMode = savedState.chatMode === "video" ? "video" : "text";
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

function locationOption(name, id, latitude, longitude, countryCode = "") {
  return {
    name,
    geonameId: id,
    lat: latitude,
    lng: longitude,
    countryCode,
  };
}

function applyDetectedLocation(location) {
  const latitude = Number(location.lat);
  const longitude = Number(location.lng);
  const country = locationOption(location.country, 9100001, latitude, longitude, location.countryCode);
  const state = locationOption(location.state, 9100002, latitude, longitude, location.countryCode);
  const district = locationOption(location.district, 9100003, latitude, longitude, location.countryCode);
  const town = locationOption(location.town, 9100004, latitude, longitude, location.countryCode);

  populateSelect(document.getElementById("countrySelect"), [country], "choose country...");
  populateSelect(document.getElementById("stateSelect"), [state], "choose state...");
  populateSelect(document.getElementById("districtSelect"), [district], "choose district...");
  populateSelect(document.getElementById("townSelect"), [town], "choose town...");
  document.getElementById("stateSelect").disabled = false;
  document.getElementById("districtSelect").disabled = false;
  document.getElementById("townSelect").disabled = false;
  document.getElementById("countrySelect").value = String(country.geonameId);
  document.getElementById("stateSelect").value = String(state.geonameId);
  document.getElementById("districtSelect").value = String(district.geonameId);
  document.getElementById("townSelect").value = String(town.geonameId);
  selectedTownPoint = { lat: latitude, lng: longitude };
  detectedLocation = location;
  saveState({
    country: location.country,
    state: location.state,
    district: location.district,
    town: location.town,
    detectedCountry: location.country,
    detectedState: location.state,
    detectedDistrict: location.district,
    detectedTown: location.town,
    detectedLatitude: latitude,
    detectedLongitude: longitude,
  });
  document.getElementById("locationPermissionNote")?.replaceChildren();
  updateMapPreview();
  renderNearbySearch();
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
    renderNearbySearch();
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
  if (!map) return;
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

function renderNearbyCafes() {
  const list = document.getElementById("matchList");
  const town = selectedGeoName("townSelect") || savedState.town || "your town";
  const district = selectedGeoName("districtSelect") || savedState.district || "nearby district";
  const cafes = [
    ["The Daily Grind", "Quiet coffee and conversation", "Best for a relaxed first date"],
    ["Brew & Bloom", "Coffee, pastries, and soft music", "Good for an easy afternoon date"],
    ["Bean Street Cafe", "Fresh brews and a casual table", "Good for a short meet-up"],
    ["The Cozy Cup", "Warm drinks and comfortable seating", "Best for an evening coffee date"],
    ["Roast House", "Specialty coffee and light bites", "Good for a longer conversation"],
    ["Corner Cafe", "Simple coffee date near the town centre", "Easy to reach from nearby areas"],
  ];

  list.innerHTML = "";
  cafes.forEach(([name, description, detail]) => {
    const item = document.createElement("div");
    item.className = "match-item cafe-item";
    item.innerHTML = `
      <div class="cafe-card-top"><span class="cafe-icon">coffee</span><strong>${escapeHtml(name)}</strong><span class="cafe-tag">coffee date</span></div>
      <span>${escapeHtml(description)}</span>
      <span>${escapeHtml(detail)} · ${escapeHtml(town)}, ${escapeHtml(district)}</span>
      <button class="secondary-btn cafe-date-btn" type="button" data-cafe="${escapeHtml(name)}">choose this spot</button>
    `;
    list.appendChild(item);
  });
}

const nearbyPlaceCatalog = [
  { name: "The Daily Grind", description: "Quiet coffee and conversation", detail: "Relaxed first date", tags: "cafe coffee" , lat: 0.012, lng: 0.008 },
  { name: "Brew & Bloom", description: "Coffee, pastries, and soft music", detail: "Easy afternoon date", tags: "cafe coffee bakery brunch", lat: 0.018, lng: -0.014 },
  { name: "Bean Street Cafe", description: "Fresh brews and a casual table", detail: "Good for a short meet-up", tags: "cafe coffee", lat: -0.021, lng: 0.011 },
  { name: "The Cozy Cup", description: "Warm drinks and comfortable seating", detail: "Evening coffee date", tags: "cafe coffee tea", lat: 0.028, lng: 0.019 },
  { name: "Roast House", description: "Specialty coffee and light bites", detail: "Longer conversation", tags: "coffee brunch restaurant", lat: -0.034, lng: -0.022 },
  { name: "Corner Cafe", description: "Simple coffee date near the town centre", detail: "Easy to reach nearby", tags: "cafe coffee", lat: 0.041, lng: -0.031 },
  { name: "Sunrise Bakery", description: "Fresh bakes, tea, and breakfast", detail: "Morning coffee date", tags: "bakery breakfast brunch coffee", lat: -0.052, lng: 0.026 },
  { name: "Green Leaf Bistro", description: "Cafe meals and a quiet garden table", detail: "Lunch date option", tags: "restaurant cafe lunch", lat: 0.061, lng: 0.034 },
  { name: "Moonlight Coffee", description: "Desserts and late coffee", detail: "Cosy evening option", tags: "coffee desserts cafe", lat: -0.067, lng: -0.038 },
  { name: "Town Square Cafe", description: "Central seating for an easy meet-up", detail: "Good for first meetings", tags: "cafe coffee restaurant", lat: 0.074, lng: -0.046 },
];

function distanceInKm(latitude, longitude, latitudeOffset, longitudeOffset) {
  const earthRadius = 6371;
  const lat1 = latitude * Math.PI / 180;
  const lat2 = (latitude + latitudeOffset) * Math.PI / 180;
  const deltaLat = latitudeOffset * Math.PI / 180;
  const deltaLng = longitudeOffset * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function nearbyPlaces(query = "") {
  return [];
}

function cafeCardMarkup(place) {
  const town = selectedGeoName("townSelect") || savedState.town || "nearby town";
  const district = selectedGeoName("districtSelect") || savedState.district || "nearby district";
  return `
    <div class="cafe-card-top"><span class="cafe-icon">coffee</span><strong>${escapeHtml(place.name)}</strong><span class="cafe-tag">${Number(place.distanceKm || 0).toFixed(1)} km</span></div>
    <span class="cafe-description">${escapeHtml(place.description)}</span>
    <span class="cafe-detail">${escapeHtml(place.detail)} · ${escapeHtml(town)}, ${escapeHtml(district)}</span>
    ${place.placeId ? `<button class="secondary-btn cafe-details-btn" type="button" data-place-id="${escapeHtml(place.placeId)}">view details</button>` : ""}
    <button class="secondary-btn cafe-date-btn" type="button" data-cafe="${escapeHtml(place.name)}">choose this spot</button>
  `;
}

function renderNearbyPlaces(places, query, fallback = false) {
  const summary = document.getElementById("nearbySearchSummary");
  const results = document.getElementById("nearbySearchResults");
  if (!summary || !results) return;

  const town = selectedGeoName("townSelect") || savedState.town || "your town";
  if (!places.length) {
    summary.textContent = fallback
      ? "Live map search is unavailable right now. Try again in a moment."
      : (query.trim() ? `No real places found within 10 km of ${town}.` : "Type a place name to search the live map.");
    results.innerHTML = "";
    return;
  }
  summary.textContent = fallback
    ? `Showing nearby suggestions within 10 km of ${town}.`
    : `${places.length} place${places.length === 1 ? "" : "s"} found within 10 km of ${town}.`;
  results.innerHTML = places.slice(0, 5).map((place) => `<article class="nearby-result">${cafeCardMarkup(place)}</article>`).join("");
}

async function renderNearbySearch() {
  const searchInput = document.getElementById("nearbyPlaceSearch");
  if (!selectedTownPoint) {
    const selectedTown = selectedGeoOption(document.getElementById("townSelect"));
    if (selectedTown && Number.isFinite(selectedTown.lat) && Number.isFinite(selectedTown.lng)) {
      selectedTownPoint = { lat: selectedTown.lat, lng: selectedTown.lng };
    }
  }
  if (searchInput) {
    searchInput.placeholder = selectedTownPoint
      ? "Try cafe, coffee, bakery, brunch..."
      : "Try cafe, coffee, bakery, brunch...";
  }
  const query = searchInput?.value || "";
  const requestId = ++nearbySearchRequestId;
  if (!query.trim()) {
    renderNearbyPlaces([], query, false);
    return;
  }
  if (!selectedTownPoint) {
    const summary = document.getElementById("nearbySearchSummary");
    if (summary) summary.textContent = "Select a town before searching nearby places.";
    return;
  }

  const results = document.getElementById("nearbySearchResults");
  const summary = document.getElementById("nearbySearchSummary");
  if (summary) summary.textContent = "Searching nearby map places...";

  const country = selectedGeoName("countrySelect");
  const state = selectedGeoName("stateSelect");
  const district = selectedGeoName("districtSelect");
  const town = selectedGeoName("townSelect");

  if (!country || !state || !district || !town) {
    const summary = document.getElementById("nearbySearchSummary");
    if (summary) summary.textContent = "Select country, state, district, and town before searching.";
    renderNearbyPlaces([], query, false);
    return;
  }

  try {
    const response = await DatingApi.nearbyPlaces({
      query: query.trim(),
      country,
      state,
      district,
      town,
      latitude: selectedTownPoint.lat,
      longitude: selectedTownPoint.lng,
    });
    if (requestId !== nearbySearchRequestId) return;
    const places = (response.items || []).map((place) => ({
      ...place,
      distanceKm: Number(place.distanceKm || 0),
    }));
    renderNearbyPlaces(places, query, false);
  } catch (error) {
    if (requestId !== nearbySearchRequestId) return;
    renderNearbyPlaces([], query, true);
  }
}

function renderNearbyCafes() {
  renderNearbySearch();
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
  const onlineLocation = detectedLocation || {};
  return {
    visitor_id: visitorId,
    country: onlineLocation.country || "",
    state: onlineLocation.state || "",
    district: onlineLocation.district || "",
    town: onlineLocation.town || "",
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
    const displayTotal = total.toLocaleString();
    document.getElementById("onlineCounter").textContent = `${displayTotal} online now`;
    document.getElementById("onlineTotal").textContent = `${displayTotal} people online right now`;
    const landingCount = document.getElementById("landingOnlineCount");
    if (landingCount) landingCount.textContent = displayTotal;
    renderStatsList("countryStats", stats.countries || [], (row) => row.label);
    renderStatsList("stateStats", stats.states || [], (row) => `${row.state}, ${row.country}`);
  } catch (error) {
    document.getElementById("onlineCounter").textContent = "online count unavailable";
    const landingCount = document.getElementById("landingOnlineCount");
    if (landingCount) landingCount.textContent = "-";
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
  document.getElementById("reportUserBtn").disabled = !chatRoomToken;
  document.getElementById("blockUserBtn").disabled = !chatRoomToken;
  document.getElementById("findChatBtn").disabled = !chatAccessApproved || chatSearchInProgress;
  updateMediaButtons();
}

function updateMediaButtons() {
  const micButton = document.getElementById("micToggleBtn");
  const cameraButton = document.getElementById("cameraToggleBtn");
  const speakerButton = document.getElementById("speakerToggleBtn");
  const fullscreenButton = document.getElementById("fullscreenVideoBtn");
  const hasStream = Boolean(localStream);
  const hasVideo = Boolean(document.getElementById("remoteVideo").srcObject || localStream);

  micButton.disabled = !hasStream;
  cameraButton.disabled = !hasStream;
  speakerButton.disabled = !document.getElementById("remoteVideo").srcObject;
  fullscreenButton.disabled = !hasVideo;
  micButton.textContent = micEnabled ? "mic on" : "mic off";
  cameraButton.textContent = cameraEnabled ? "camera on" : "camera off";
  speakerButton.textContent = speakerEnabled ? "speaker on" : "speaker off";
}

function addMessageBubble(message) {
  const messages = document.getElementById("messages");
  const bubble = document.createElement("div");
  bubble.className = `message ${message.sender}`;

  const senderLabel = document.createElement("small");
  senderLabel.className = "message-sender";
  senderLabel.textContent = message.sender === "you" ? "You" : "Stranger";

  const messageText = document.createElement("span");
  messageText.textContent = message.message_text;
  bubble.append(senderLabel, messageText);

  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function stopTimer(timer) {
  if (timer) {
    clearInterval(timer);
  }
}

function stopFaceVisibilityMonitor() {
  stopTimer(faceMonitorTimer);
  faceMonitorTimer = null;
  faceMissingSince = 0;
}

function hideVisibilityGuard() {
  const guard = document.getElementById("visibilityGuard");
  if (guard) guard.hidden = true;
}

function startFaceVisibilityMonitor() {
  stopFaceVisibilityMonitor();
  return;

  if (!window.FaceDetector) return;

  faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
  faceMonitorTimer = setInterval(async () => {
    const remoteVideo = document.getElementById("remoteVideo");

    if (!chatRoomToken || remoteVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !remoteVideo.videoWidth) {
      return;
    }

    try {
      const faces = await faceDetector.detect(remoteVideo);

      if (faces.length) {
        faceMissingSince = 0;
        hideVisibilityGuard();
        return;
      }

      if (!faceMissingSince) faceMissingSince = Date.now();
      if (Date.now() - faceMissingSince >= 5000) {
        await warnAboutHiddenFace();
        faceMissingSince = 0;
      }
    } catch (error) {
      stopFaceVisibilityMonitor();
    }
  }, 1800);
}

async function warnAboutHiddenFace() {
  if (faceWarningInProgress || !chatRoomToken) return;

  faceWarningInProgress = true;
  const guard = document.getElementById("visibilityGuard");
  document.getElementById("visibilityMessage").textContent =
    "The other person’s face is not visible. Please keep your face in the camera.";
  guard.hidden = false;

  for (let seconds = 5; seconds > 0; seconds -= 1) {
    document.getElementById("visibilityCountdown").textContent = String(seconds);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  hideVisibilityGuard();
  faceWarningInProgress = false;
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
  videoStartInProgress = false;
  chatSearchInProgress = false;
  stopFaceVisibilityMonitor();
  hideVisibilityGuard();
  setChatEnabled(false);
  setChatStatus("Not connected");
  document.getElementById("messages").innerHTML = "";
  document.getElementById("videoChatBtn").textContent = "start video";
  document.querySelector(".chat-panel").classList.remove("focus-mode");
  document.querySelector('[data-screen="stranger-chat"]').classList.remove("focus-screen");
  document.getElementById("fullscreenVideoBtn").textContent = "full screen";
  stopVideo();
  updatePermissionButton();
  updateMediaButtons();
}

function startMessagePolling() {
  stopTimer(messageTimer);
  messageTimer = setInterval(async () => {
    const roomToken = chatRoomToken;
    if (!roomToken) return;

    try {
      const response = await DatingApi.messages(visitorId, roomToken, lastMessageId);
      if (roomToken !== chatRoomToken) return;
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
  const roomToken = chatRoomToken;
  if (!roomToken) return;

  try {
    const response = await DatingApi.chatStatus(visitorId, roomToken);
    // A previous room can finish while a new matching request is in flight.
    // Ignore that stale response instead of replacing the current chat status.
    if (roomToken !== chatRoomToken) return;
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

function saveChatGateState() {
  saveState({
    age: document.getElementById("ageInput").value,
    gender: document.getElementById("genderSelect").value,
    adultConfirmed: document.getElementById("adultConfirm").checked,
  });
}

function isLocalhostPage() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function localVideoUrl() {
  const port = window.location.port ? `:${window.location.port}` : "";
  const protocol = isLocalhostPage() ? "http" : "https";
  return `${protocol}://${window.location.host}${window.location.pathname}${window.location.search}`;
}

function mediaUnavailableMessage() {
  if (!window.isSecureContext && !isLocalhostPage()) {
    return `Video needs HTTPS. Open ${localVideoUrl()} after SSL is enabled for this domain.`;
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
    startFaceVisibilityMonitor();
    event.streams[0]?.getTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (chatRoomToken) {
          setError("chatError", "The other person’s camera stopped. You can skip or leave this chat.");
        }
      }, { once: true });
    });
    updateMediaButtons();
  };

  const stream = await ensureLocalMediaStream();
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  return peerConnection;
}

async function startVideo() {
  if (!chatRoomToken || videoStarted || videoStartInProgress) return;

  const unavailableMessage = mediaUnavailableMessage();
  if (unavailableMessage) {
    setError("chatError", unavailableMessage);
    return;
  }

  videoStartInProgress = true;

  try {
    const connection = await createPeerConnection();
    videoStarted = true;
    document.getElementById("videoChatBtn").textContent = "video on";
    startSignalPolling();

    if (chatIsCreator && connection.signalingState === "stable" && !connection.localDescription) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await DatingApi.sendSignal(visitorId, chatRoomToken, "offer", offer);
    }
  } catch (error) {
    videoStarted = false;
    setError("chatError", error.message);
  } finally {
    videoStartInProgress = false;
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
  } catch (error) {
    setError("inviteError", error.message);
  }
  showScreen("stranger-chat");
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.next));
});

document.getElementById("homeLink")?.addEventListener("click", (event) => {
  event.preventDefault();
  resetChatUi();
  showScreen("invite", { replace: true });
});

document.getElementById("saveDateBtn").addEventListener("click", async () => {
  const selectedDate = document.getElementById("dateInput").value;
  const selectedTime = document.getElementById("timeInput").value;
  setError("dateError");

  if (!selectedDate || !selectedTime) {
    setError("dateError", "Pick both day and time, sweetheart.");
    return;
  }

  saveState({ selectedDate, selectedTime });

  try {
    await DatingApi.saveDate(visitorId, selectedDate, selectedTime);
  } catch (error) {
    setError("dateError", error.message);
  }
  showScreen("food");
});

document.getElementById("foodGrid").addEventListener("click", (event) => {
  const card = event.target.closest(".food-card");
  if (!card) return;

  selectedFood = card.dataset.food;
  saveState({ selectedFood });
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
    saveState({ otherFood: "" });
  }
});

document.getElementById("landingStartBtn")?.addEventListener("click", () => {
  document.getElementById("yesBtn").click();
});

document.getElementById("previewStartBtn")?.addEventListener("click", () => {
  document.getElementById("yesBtn").click();
});

document.getElementById("landingSkipBtn")?.addEventListener("click", () => {
  document.getElementById("yesBtn").click();
});

document.getElementById("dateInput").addEventListener("change", (event) => {
  saveState({ selectedDate: event.target.value });
});

document.getElementById("timeInput").addEventListener("change", (event) => {
  saveState({ selectedTime: event.target.value });
});

document.getElementById("otherFoodInput").addEventListener("input", (event) => {
  saveState({ otherFood: event.target.value });
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
  } catch (error) {
    setError("foodError", error.message);
  }
  showScreen("location");
});

document.getElementById("saveLocationBtn").addEventListener("click", async () => {
  setError("locationError");
  const country = selectedGeoName("countrySelect");
  const state = selectedGeoName("stateSelect");
  const district = selectedGeoName("districtSelect");
  const town = selectedGeoName("townSelect");

  if (!country || !state || !district || !town || !selectedTownPoint) {
    setError("locationError", "Choose your country, state, district, and town.");
    return;
  }

  saveState({ country, state, district, town });

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
    renderNearbyCafes();
    await sendHeartbeat();
    showScreen("final");
  } catch (error) {
    setError("locationError", error.message);
  }
});

document.getElementById("nearbyPlaceSearch").addEventListener("input", () => {
  clearTimeout(nearbySearchTimer);
  nearbySearchTimer = setTimeout(renderNearbySearch, 350);
});
document.getElementById("nearbySearchResults").addEventListener("click", (event) => {
  const detailsButton = event.target.closest(".cafe-details-btn");
  if (detailsButton) {
    const card = detailsButton.closest(".nearby-result");
    let details = card.querySelector(".cafe-details");
    if (details) {
      details.hidden = !details.hidden;
      return;
    }
    detailsButton.disabled = true;
    detailsButton.textContent = "loading details...";
    DatingApi.placeDetails(detailsButton.dataset.placeId).then((response) => {
      details = document.createElement("div");
      details.className = "cafe-details";
      const item = response.details || {};
      details.innerHTML = `<strong>${escapeHtml(item.name || "Place details")}</strong><span>${escapeHtml(item.address || "Address unavailable")}</span>${item.phone ? `<span>${escapeHtml(item.phone)}</span>` : ""}${item.openingHours ? `<span>${escapeHtml(item.openingHours)}</span>` : ""}`;
      card.appendChild(details);
      detailsButton.textContent = "hide details";
      detailsButton.disabled = false;
    }).catch(() => {
      detailsButton.textContent = "details unavailable";
      detailsButton.disabled = false;
    });
    return;
  }
  const button = event.target.closest(".cafe-date-btn");
  if (!button) return;
  saveState({ selectedCafe: button.dataset.cafe });
  document.querySelectorAll(".cafe-date-btn").forEach((item) => {
    item.textContent = item.dataset.cafe === button.dataset.cafe ? "spot selected" : "choose this spot";
    item.classList.toggle("selected", item === button);
  });
});

function requestCurrentLocation(statusId = "locationError", buttonId = "useCurrentLocationBtn") {
  const button = document.getElementById(buttonId);
  const buttonLabel = button?.textContent || "use my current location";
  const status = document.getElementById(statusId);
  if (status) status.textContent = "";
  locationPromptAttempted = true;

  if (!window.isSecureContext && !isLocalhostPage()) {
    if (status) status.textContent = "Location permission needs HTTPS. Open the secure https:// version of this site.";
    return;
  }

  if (!navigator.geolocation) {
    if (status) status.textContent = "Your browser does not support location access.";
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "finding your approximate area...";
  }
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      const locations = await loadGeoNames({
        action: "reverse",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (!locations[0]) throw new Error("Could not identify this area. Choose it manually.");
      applyDetectedLocation(locations[0]);
      if (status) status.textContent = `Detected: ${locations[0].country}, ${locations[0].state}`;
      await sendHeartbeat();
    } catch (error) {
      if (status) status.textContent = error.message;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = buttonLabel;
      }
    }
  }, (error) => {
    const message = error.code === error.PERMISSION_DENIED
      ? "Location permission was denied. You can choose your area manually."
      : "Could not access your location. You can choose your area manually.";
    if (status) status.textContent = message;
    if (button) {
      button.disabled = false;
      button.textContent = buttonLabel;
    }
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

document.getElementById("useCurrentLocationBtn")?.addEventListener("click", requestCurrentLocation);
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
  saveState({ chatMode });
  setError("chatError");
  stopVideo();
  updateChatModeUi();
});

document.getElementById("videoModeBtn").addEventListener("click", async () => {
  chatMode = "video";
  saveState({ chatMode });
  updateChatModeUi();
  setError("chatError");
  document.getElementById("mediaConsentDialog").showModal();
});

document.getElementById("permissionBtn").addEventListener("click", async () => {
  setError("chatError");
  if (chatMode === "video") {
    document.getElementById("mediaConsentDialog").showModal();
    return;
  }
  try {
    await requestChatPermissions();
    await beginRandomChat();
  } catch (error) {
    setError("chatError", error.message);
    setChatStatus("Permission needed before matching");
  }
});

document.getElementById("allowMediaBtn").addEventListener("click", async () => {
  const dialog = document.getElementById("mediaConsentDialog");
  dialog.close();
  try {
    await requestChatPermissions();
    if (chatRoomToken) await startVideo();
    else await beginRandomChat();
  } catch (error) {
    setError("chatError", error.message);
    setChatStatus("Camera and microphone permission is needed for video chat");
  }
});

document.getElementById("continueTextBtn").addEventListener("click", async () => {
  document.getElementById("mediaConsentDialog").close();
  chatMode = "text";
  saveState({ chatMode });
  updateChatModeUi();
  try {
    await requestChatPermissions();
    if (!chatRoomToken) await beginRandomChat();
  } catch (error) {
    setError("chatError", error.message);
  }
});

document.getElementById("reportUserBtn").addEventListener("click", () => {
  if (chatRoomToken) document.getElementById("reportDialog").showModal();
});

document.getElementById("cancelReportBtn").addEventListener("click", () => document.getElementById("reportDialog").close());
document.getElementById("reportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const reason = document.getElementById("reportReason").value;
  const detail = document.getElementById("reportDetail").value.trim();
  if (!reason || !chatRoomToken) return;
  try {
    await DatingApi.reportUser(visitorId, chatRoomToken, reason, detail);
    document.getElementById("reportDialog").close();
    document.getElementById("reportForm").reset();
    setChatStatus("Report submitted. Thank you for helping keep Talkifi safe.");
  } catch (error) {
    setError("chatError", error.message);
  }
});

document.getElementById("blockUserBtn").addEventListener("click", () => {
  if (chatRoomToken) document.getElementById("blockDialog").showModal();
});
document.getElementById("cancelBlockBtn").addEventListener("click", () => document.getElementById("blockDialog").close());
document.getElementById("confirmBlockBtn").addEventListener("click", async () => {
  const roomToBlock = chatRoomToken;
  document.getElementById("blockDialog").close();
  if (!roomToBlock) return;
  try {
    await DatingApi.blockUser(visitorId, roomToBlock);
    await leaveCurrentChat();
    setChatStatus("User blocked. You will not be matched with this user again on this device.");
  } catch (error) {
    setError("chatError", error.message);
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
  gateControl.addEventListener("input", saveChatGateState);
  gateControl.addEventListener("change", saveChatGateState);
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

document.getElementById("fullscreenVideoBtn").addEventListener("click", () => {
  const panel = document.querySelector(".chat-panel");
  const screen = document.querySelector('[data-screen="stranger-chat"]');
  const isFocused = panel.classList.toggle("focus-mode");
  screen.classList.toggle("focus-screen", isFocused);
  const button = document.getElementById("fullscreenVideoBtn");
  button.textContent = isFocused ? "exit focus" : "full screen";
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

window.addEventListener("popstate", (event) => {
  const name = event.state?.screen || new URLSearchParams(window.location.search).get("screen");
  renderScreen(validScreens.has(name) ? name : "invite");
});

document.getElementById("enterTalkifiBtn").addEventListener("click", async () => {
  const confirmed = document.getElementById("ageGateConfirm").checked;
  if (!confirmed) {
    setError("ageGateError", "Confirm that you are 18 or older to enter Talkifi.");
    return;
  }
  localStorage.setItem(ageGateStorageKey, "accepted");
  closeAgeGate();
  try {
    await DatingApi.recordConsent(visitorId);
  } catch (error) {
    // Local consent still keeps the access gate in place if a temporary server issue occurs.
  }
});

document.getElementById("underAgeBtn").addEventListener("click", () => {
  const card = document.querySelector(".age-gate-card");
  card.innerHTML = "<span class=\"age-gate-kicker\">Access restricted</span><h1>Sorry, Talkifi is for adults only.</h1><p>You cannot enter Talkifi unless you are 18 years or older.</p>";
  document.body.classList.add("age-gate-open", "age-gate-denied");
});

window.RomanceAnimations?.makePetals?.();
locationControlsReady = initLocationControls();
restoreSavedFormState();
const urlScreen = new URLSearchParams(window.location.search).get("screen");
const initialScreen = validScreens.has(urlScreen)
  ? urlScreen
  : validScreens.has(savedState.screen)
    ? savedState.screen
    : "invite";
const initialUrl = new URL(window.location.href);
initialUrl.searchParams.set("screen", initialScreen);
window.history.replaceState({ screen: initialScreen }, "", initialUrl);
renderScreen(initialScreen);
showAgeGate();
updateChatModeUi();
updatePermissionButton();
if (initialScreen === "invite") {
  locationControlsReady.then(() => requestCurrentLocation("landingLocationStatus"));
}
sendHeartbeat();
heartbeatTimer = setInterval(sendHeartbeat, 30000);
statsTimer = setInterval(refreshOnlineStats, 45000);

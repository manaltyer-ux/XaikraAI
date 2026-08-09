(function () {
const SHARED_SECRET_KEY = "xaikra-e2ee-shared-secret-key-change-this";

// --- Encryption Utility (AES-256-GCM) ---
let cachedCryptoKey = null;
async function getCryptoKey() {
  if (cachedCryptoKey) return cachedCryptoKey;
  const keyData = new TextEncoder().encode(SHARED_SECRET_KEY);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  cachedCryptoKey = await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return cachedCryptoKey;
}

function bufferToBase64(buf) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
}

function base64ToBuffer(b64) {
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

async function encryptPayload(dataObj) {
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(dataObj));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
    return JSON.stringify({
      enc: true,
      iv: bufferToBase64(iv),
      data: bufferToBase64(ciphertext)
    });
  } catch (e) {
    console.error("Encryption failed:", e);
    return null;
  }
}

async function decryptPayload(rawMessageStr) {
  try {
    const parsed = JSON.parse(rawMessageStr);
    if (!parsed || !parsed.enc || !parsed.iv || !parsed.data) {
      return parsed; // Fallback for plain unencrypted messages
    }
    const key = await getCryptoKey();
    const iv = base64ToBuffer(parsed.iv);
    const data = base64ToBuffer(parsed.data);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    return null;
  }
}

const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
const HEARTBEAT_TOPIC = "xaida/servers/heartbeat";
const DEACTIVATE_TOPIC = "xaida/servers/deactivate";
const PING_TOPIC = "xaida/servers/ping";
const SERVER_TIMEOUT_MS = 12000;
const WATCHDOG_TIMEOUT_MS = 5000;

function createWorkerInterval(fn, ms) {
  try {
    const blob = new Blob([`self.onmessage=function(){setInterval(function(){postMessage(0);},${ms});};`], { type: 'text/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = fn;
    worker.postMessage(0);
    return worker;
  } catch (e) {
    return setInterval(fn, ms);
  }
}

let storedUserId = localStorage.getItem("xaikra_user_id");
if (!storedUserId) {
  storedUserId = "usr-" + Math.random().toString(36).substring(2, 8);
  localStorage.setItem("xaikra_user_id", storedUserId);
}
let storedAuthKey = localStorage.getItem("xaikra_auth_key");
if (!storedAuthKey) {
  storedAuthKey = Math.random().toString(36).substring(2) + Date.now().toString(36);
  localStorage.setItem("xaikra_auth_key", storedAuthKey);
}

const tabId = Math.random().toString(36).substring(2, 6);
const logicalClientId = storedUserId + "-" + tabId;
const clientResponseTopic = "xaida/client/" + logicalClientId + "/response";
const discoveredServers = {};
let relayClient = null;
let relayIsConnected = false;
let selectedModel = localStorage.getItem("xaikra_selected_model") || "xaikra-2.1";
let currentServer = "";
let currentResponseTopic = "";
let watchdogTimer = null;
let lastActiveTimestamp = Date.now();

const ServerConnector = {
  clientId: logicalClientId,
  authKey: storedAuthKey,
  onServerMessage: null,
  onStatusChange: null,

  getSelectedModel: function () {
    return selectedModel;
  },

  getCurrentServer: function () {
    return currentServer;
  },

  isReady: function () {
    if (!relayIsConnected || !currentServer || !discoveredServers[currentServer]) {
      return false;
    }
    return !discoveredServers[currentServer].isBusy;
  },

  start: function () {
    forceReconnect();
  },

  setSelectedModel: function (modelId) {
    if (selectedModel === modelId) return;
    selectedModel = modelId;
    localStorage.setItem("xaikra_selected_model", modelId);
    leaveCurrentServer();
    reportStatus("Looking for server...", "waiting");
    pickBestServer();
  },

  sendPromptPayload: async function (promptPayload) {
    pickBestServer();

    if (!ServerConnector.isReady()) {
      reportStatus("No available server connected", "offline");
      return false;
    }

    const serverInfo = discoveredServers[currentServer];
    if (!serverInfo || serverInfo.isBusy || (Date.now() - serverInfo.lastSeen > SERVER_TIMEOUT_MS)) {
      removeServer(currentServer);
      return false;
    }

    const backendModelId = selectedModel === "xaikra-1.3" ? "xaida-1.3" : "xaida-2.1";

    const rawPayload = {
      clientId: logicalClientId,
      authKey: storedAuthKey,
      modelId: backendModelId,
      text: promptPayload.contextText,
      imageDataUrl: null,
      requestId: promptPayload.requestId,
      replyTopic: clientResponseTopic,
      sentAt: Date.now()
    };

    try {
      const encryptedPayloadString = await encryptPayload(rawPayload);
      if (!encryptedPayloadString) return false;
      relayClient.publish("xaida/" + currentServer + "/prompt", encryptedPayloadString, { qos: 0 });
      return true;
    } catch (e) {
      forceReconnect();
      return false;
    }
  }
};

function reportStatus(statusText, statusKind) {
  if (typeof ServerConnector.onStatusChange === "function") {
    ServerConnector.onStatusChange(statusText, statusKind);
  }
}

function leaveCurrentServer() {
  if (currentResponseTopic && relayClient && relayIsConnected) {
    try {
      relayClient.unsubscribe(currentResponseTopic);
    } catch (unsubscribeError) {}
  }
  currentServer = "";
  currentResponseTopic = "";
}

function removeServer(serverId) {
  if (discoveredServers[serverId]) {
    delete discoveredServers[serverId];
  }
  if (currentServer === serverId) {
    leaveCurrentServer();
    reportStatus("Finding available server...", "waiting");
    pickBestServer();
  }
}

function joinServer(serverId) {
  leaveCurrentServer();
  currentServer = serverId;
  currentResponseTopic = "xaida/" + serverId + "/response/" + logicalClientId;
  if (relayClient && relayIsConnected) {
    relayClient.subscribe(currentResponseTopic);
    reportStatus("Online", "online");
  }
}

function pickBestServer() {
  const now = Date.now();
  Object.keys(discoveredServers).forEach(function (serverId) {
    if (now - discoveredServers[serverId].lastSeen > SERVER_TIMEOUT_MS) {
      delete discoveredServers[serverId];
    }
  });

  const healthyServers = [];
  Object.keys(discoveredServers).forEach(function (serverId) {
    const serverInfo = discoveredServers[serverId];
    if (!serverInfo.isBusy) {
      healthyServers.push({ serverId: serverId, queueLength: serverInfo.queueLength });
    }
  });

  if (currentServer) {
    const currentInfo = discoveredServers[currentServer];
    if (!currentInfo || currentInfo.isBusy) {
      leaveCurrentServer();
    }
  }

  if (healthyServers.length === 0) {
    if (!currentServer) {
      reportStatus("Searching for server...", "waiting");
    }
    return;
  }

  const smallestQueue = Math.min.apply(
    null,
    healthyServers.map(function (entry) { return entry.queueLength; })
  );

  const candidates = healthyServers.filter(function (entry) {
    return entry.queueLength === smallestQueue;
  });

  const bestServer = candidates[Math.floor(Math.random() * candidates.length)].serverId;
  if (bestServer !== currentServer) {
    joinServer(bestServer);
  }
}

function cleanupRelay() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  if (relayClient) {
    try {
      relayClient.removeAllListeners();
      relayClient.end(true);
    } catch (e) {}
    relayClient = null;
  }
  relayIsConnected = false;
}

function forceReconnect() {
  cleanupRelay();
  startRelay();
}

function startRelay() {
  if (typeof mqtt === "undefined") {
    reportStatus("MQTT library missing", "offline");
    return;
  }

  cleanupRelay();
  reportStatus("Connecting...", "waiting");

  const dynamicMqttClientId = "xaikra-" + logicalClientId + "-" + Math.random().toString(36).substring(2, 6);

  relayClient = mqtt.connect(BROKER_URL, {
    clientId: dynamicMqttClientId,
    clean: true,
    keepalive: 15,
    reconnectPeriod: 2000,
    connectTimeout: 6000
  });

  watchdogTimer = setTimeout(function () {
    if (!relayIsConnected) {
      forceReconnect();
    }
  }, WATCHDOG_TIMEOUT_MS);

  relayClient.on("connect", function () {
    relayIsConnected = true;
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }

    reportStatus("Scanning network", "waiting");

    relayClient.subscribe(clientResponseTopic);
    relayClient.subscribe(HEARTBEAT_TOPIC);
    relayClient.subscribe(DEACTIVATE_TOPIC);

    relayClient.publish(PING_TOPIC, "PING", { qos: 0 });
  });

  relayClient.on("reconnect", function () {
    reportStatus("Reconnecting...", "waiting");
  });

  relayClient.on("offline", function () {
    relayIsConnected = false;
    reportStatus("Network offline", "offline");
  });

  relayClient.on("error", function () {
    relayIsConnected = false;
    forceReconnect();
  });

  relayClient.on("message", async function (topic, rawMessage) {
    const payload = await decryptPayload(rawMessage.toString());
    if (!payload) return;

    if (topic === HEARTBEAT_TOPIC) {
      if (!payload.serverId) return;

      if (payload.status === "offline" || payload.active === false || payload.deactivated === true) {
        removeServer(payload.serverId);
        return;
      }

      const isBusy = Boolean(
        payload.isBusy || 
        payload.busy || 
        payload.status === "busy" || 
        (typeof payload.maxQueue === "number" && (payload.queueLength || 0) >= payload.maxQueue)
      );

      discoveredServers[payload.serverId] = {
        modelId: payload.modelId || "xaida-2.1",
        queueLength: Number(payload.queueLength) || 0,
        isBusy: isBusy,
        lastSeen: Date.now()
      };

      pickBestServer();
      return;
    }

    if (topic === DEACTIVATE_TOPIC) {
      if (payload.serverId) {
        removeServer(payload.serverId);
      }
      return;
    }

    if ((topic === currentResponseTopic || topic === clientResponseTopic) && typeof ServerConnector.onServerMessage === "function") {
      ServerConnector.onServerMessage(payload);
    }
  });
}

createWorkerInterval(function () {
  const now = Date.now();
  const timePassed = now - lastActiveTimestamp;
  lastActiveTimestamp = now;

  if (timePassed > 4000) {
    forceReconnect();
    return;
  }

  if (!relayIsConnected && (!relayClient || !relayClient.reconnecting)) {
    forceReconnect();
    return;
  }

  pickBestServer();
}, 2000);

window.ServerConnector = ServerConnector;
})();

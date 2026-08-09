(function () {
  const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
  const HEARTBEAT_TOPIC = "xaida/servers/heartbeat";
  const DEACTIVATE_TOPIC = "xaida/servers/deactivate";
  const PING_TOPIC = "xaida/servers/ping";
  const SERVER_TIMEOUT_MS = 12000;
  const WATCHDOG_TIMEOUT_MS = 5000;

  // ==========================================
  // E2EE CRYPTOGRAPHY ENGINE (AES-256-GCM + PBKDF2)
  // ==========================================
  async function deriveKey(passphrase, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptPayload(dataObj, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const enc = new TextEncoder();
    const encodedData = enc.encode(JSON.stringify(dataObj));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);

    return {
      e2ee: true,
      salt: bufferToBase64(salt),
      iv: bufferToBase64(iv),
      cipher: bufferToBase64(encrypted)
    };
  }

  async function decryptPayload(envelope, passphrase) {
    if (!envelope || !envelope.e2ee || !envelope.cipher || !envelope.iv || !envelope.salt) {
      throw new Error("Invalid encrypted packet structure.");
    }
    const salt = base64ToBuffer(envelope.salt);
    const iv = base64ToBuffer(envelope.iv);
    const cipher = base64ToBuffer(envelope.cipher);
    const key = await deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  }

  function bufferToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  // ==========================================

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

  let secretPassphrase = localStorage.getItem("xaikra_secret_key") || "";

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

    // Set / Get Secret Key API
    setSecretKey: function (key) {
      secretPassphrase = (key || "").trim();
      localStorage.setItem("xaikra_secret_key", secretPassphrase);
    },

    getSecretKey: function () {
      return secretPassphrase;
    },

    getSelectedModel: function () {
      return selectedModel;
    },

    getCurrentServer: function () {
      return currentServer;
    },

    isReady: function () {
      if (!secretPassphrase) {
        return false;
      }
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
      if (!secretPassphrase) {
        reportStatus("Secret Key Missing!", "offline");
        console.error("[E2EE Error] Cannot send request: Secret Key is not set.");
        return false;
      }

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

      const plainPayload = {
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
        // ENCRYPT payload before sending over MQTT
        const encryptedEnvelope = await encryptPayload(plainPayload, secretPassphrase);
        const payloadString = JSON.stringify(encryptedEnvelope);

        relayClient.publish("xaida/" + currentServer + "/prompt", payloadString, { qos: 0 });
        return true;
      } catch (e) {
        console.error("[E2EE Error] Failed to encrypt or send payload:", e);
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
      reportStatus("Online (E2EE)", "online");
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
      let rawPayload = null;
      try {
        rawPayload = JSON.parse(rawMessage.toString());
      } catch (parseError) {
        return;
      }

      if (topic === HEARTBEAT_TOPIC) {
        if (!rawPayload.serverId) return;

        if (rawPayload.status === "offline" || rawPayload.active === false || rawPayload.deactivated === true) {
          removeServer(rawPayload.serverId);
          return;
        }

        const isBusy = Boolean(
          rawPayload.isBusy || 
          rawPayload.busy || 
          rawPayload.status === "busy" || 
          (typeof rawPayload.maxQueue === "number" && (rawPayload.queueLength || 0) >= rawPayload.maxQueue)
        );

        discoveredServers[rawPayload.serverId] = {
          modelId: rawPayload.modelId || "xaida-2.1",
          queueLength: Number(rawPayload.queueLength) || 0,
          isBusy: isBusy,
          lastSeen: Date.now()
        };

        pickBestServer();
        return;
      }

      if (topic === DEACTIVATE_TOPIC) {
        if (rawPayload.serverId) {
          removeServer(rawPayload.serverId);
        }
        return;
      }

      if ((topic === currentResponseTopic || topic === clientResponseTopic) && typeof ServerConnector.onServerMessage === "function") {
        if (!secretPassphrase) {
          console.error("[E2EE Error] Cannot decrypt server message: Secret key is missing.");
          return;
        }

        try {
          // DECRYPT incoming server response envelope
          const decryptedPayload = await decryptPayload(rawPayload, secretPassphrase);
          ServerConnector.onServerMessage(decryptedPayload);
        } catch (decryptErr) {
          console.error("[E2EE Error] Failed to decrypt response (Wrong Secret Key or Untrusted Packet):", decryptErr);
        }
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

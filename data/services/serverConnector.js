(function () {
  const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
  const HEARTBEAT_TOPICS = ["xaikra/servers/heartbeat", "xaida/servers/heartbeat"];
  const DEACTIVATE_TOPICS = ["xaikra/servers/deactivate", "xaida/servers/deactivate"];
  const PING_TOPIC = "xaikra/servers/ping";
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
  const clientResponseTopic = "xaikra/client/" + logicalClientId + "/response";

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
      reportStatus("Looking for " + modelId + " server...", "waiting");
      pickBestServer();
    },

    sendPromptPayload: function (promptPayload) {
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

      const backendModelId = selectedModel.replace("xaikra", "xaida");

      const payloadString = JSON.stringify({
        clientId: logicalClientId,
        authKey: storedAuthKey,
        modelId: backendModelId,
        text: promptPayload.contextText,
        rawPrompt: promptPayload.userText,
        imageDataUrl: promptPayload.imageDataUrl || null,
        requestId: promptPayload.requestId,
        replyTopic: clientResponseTopic,
        sentAt: Date.now()
      });

      if (payloadString.length > 350000) {
        return false;
      }

      try {
        relayClient.publish("xaikra/" + currentServer + "/prompt", payloadString, { qos: 0 });
        relayClient.publish("xaida/" + currentServer + "/prompt", payloadString, { qos: 0 });
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
    currentResponseTopic = "xaikra/" + serverId + "/response/" + logicalClientId;
    if (relayClient && relayIsConnected) {
      relayClient.subscribe(currentResponseTopic);
      reportStatus("Connected (" + serverId + ")", "online");
    }
  }

  function pickBestServer() {
    const now = Date.now();

    Object.keys(discoveredServers).forEach(function (serverId) {
      if (now - discoveredServers[serverId].lastSeen > SERVER_TIMEOUT_MS) {
        delete discoveredServers[serverId];
      }
    });

    const targetModelClean = selectedModel.replace("xaikra", "").replace("xaida", "");

    const healthyServers = [];
    Object.keys(discoveredServers).forEach(function (serverId) {
      const serverInfo = discoveredServers[serverId];
      const serverModelClean = (serverInfo.modelId || "").replace("xaikra", "").replace("xaida", "");
      
      if ((serverModelClean === targetModelClean || !serverModelClean) && !serverInfo.isBusy) {
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
        reportStatus("Searching for active AI node...", "waiting");
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
      
      HEARTBEAT_TOPICS.forEach(function (topic) {
        relayClient.subscribe(topic);
      });
      
      DEACTIVATE_TOPICS.forEach(function (topic) {
        relayClient.subscribe(topic);
      });

      relayClient.publish(PING_TOPIC, "PING", { qos: 0 });
      relayClient.publish("xaida/servers/ping", "PING", { qos: 0 });
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

    relayClient.on("message", function (topic, rawMessage) {
      let payload = null;
      try {
        payload = JSON.parse(rawMessage.toString());
      } catch (parseError) {
        return;
      }

      if (HEARTBEAT_TOPICS.indexOf(topic) !== -1) {
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
          modelId: payload.modelId || "xaikra-2.1",
          queueLength: Number(payload.queueLength) || 0,
          isBusy: isBusy,
          lastSeen: Date.now()
        };

        pickBestServer();
        return;
      }

      if (DEACTIVATE_TOPICS.indexOf(topic) !== -1) {
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

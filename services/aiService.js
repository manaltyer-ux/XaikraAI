
;(function () {
  window.AIService = {
    sendMessage: function (userText, requestId) {
      if (!window.ServerConnector) {
        console.error("ServerConnector is missing from window.");
        return false;
      }

      var recentMessages = [];
      if (window.Conversation && typeof window.Conversation.getRecent === "function") {
        recentMessages = window.Conversation.getRecent(5);
      } else if (window.Conversation && Array.isArray(window.Conversation.messages)) {
        recentMessages = window.Conversation.messages.slice(-5);
      }

      var previousAiMessage = "";
      if (Array.isArray(recentMessages)) {
        for (var i = recentMessages.length - 1; i >= 0; i--) {
          var msg = recentMessages[i];
          if (msg && (msg.role === "assistant" || msg.role === "ai")) {
            previousAiMessage = msg.text || "";
            break;
          }
        }
      }

      var storedLTM = [];
      if (window.MemoryService && typeof window.MemoryService.getLongTermMemories === "function") {
        storedLTM = window.MemoryService.getLongTermMemories();
      }

      var relevantLTM = [];
      if (window.LTMMatcherService && typeof window.LTMMatcherService.findRelevantMemories === "function") {
        relevantLTM = window.LTMMatcherService.findRelevantMemories(userText, previousAiMessage, storedLTM);
      }

      var shortTermMemory = "";
      if (window.MemoryService && typeof window.MemoryService.getShortTermMemory === "function") {
        shortTermMemory = window.MemoryService.getShortTermMemory();
      }

      var emotions = {};
      if (window.EmotionService && typeof window.EmotionService.getEmotions === "function") {
        emotions = window.EmotionService.getEmotions();
      }

      var contextText = userText;
      if (window.ContextBuilder && typeof window.ContextBuilder.buildAIContext === "function") {
        contextText = window.ContextBuilder.buildAIContext({
          currentMessage: userText,
          recentMessages: recentMessages,
          shortTermMemory: shortTermMemory,
          relevantLongTermMemories: relevantLTM,
          emotions: emotions,
          aiPersonality: window.aiPersonality || {},
          userPersona: window.userPersona || {}
        });
      }

      var payload = {
        type: "GENERATE",
        requestId: requestId,
        contextText: contextText,
        recentMessages: recentMessages,
        shortTermMemory: shortTermMemory
      };

      return this.dispatchToServer(payload);
    },

    dispatchToServer: function (payload) {
      var sc = window.ServerConnector;
      if (!sc) return false;

      var methodNames = ["sendRequest", "sendMessage", "sendPayload", "send", "emit", "dispatch", "sendData", "postMessage", "post"];
      for (var i = 0; i < methodNames.length; i++) {
        var fnName = methodNames[i];
        if (typeof sc[fnName] === "function") {
          sc[fnName](payload);
          return true;
        }
      }

      var socketObjs = [sc.ws, sc.socket, sc.conn, sc.connection, sc.client];
      for (var j = 0; j < socketObjs.length; j++) {
        var sock = socketObjs[j];
        if (sock && typeof sock.send === "function") {
          sock.send(JSON.stringify(payload));
          return true;
        }
      }

      var keys = Object.keys(sc);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (typeof sc[key] === "function" && key !== "isReady" && !key.startsWith("on")) {
          try {
            sc[key](payload);
            return true;
          } catch (e) {}
        }
      }

      console.error("[AIService] Could not locate send method on ServerConnector. Available keys on ServerConnector:", Object.keys(sc));
      return false;
    }
  };
})();

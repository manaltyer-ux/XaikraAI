
(function () {
  window.AIService = {
    sendMessage: function (userText, requestId) {
      if (!window.ServerConnector) {
        console.error("ServerConnector is missing.");
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

      if (typeof window.ServerConnector.sendMessage === "function") {
        window.ServerConnector.sendMessage(payload);
        return true;
      }
      if (typeof window.ServerConnector.sendPayload === "function") {
        window.ServerConnector.sendPayload(payload);
        return true;
      }
      if (typeof window.ServerConnector.send === "function") {
        window.ServerConnector.send(payload);
        return true;
      }
      if (window.ServerConnector.ws && typeof window.ServerConnector.ws.send === "function") {
        window.ServerConnector.ws.send(JSON.stringify(payload));
        return true;
      }
      if (window.ServerConnector.socket && typeof window.ServerConnector.socket.send === "function") {
        window.ServerConnector.socket.send(JSON.stringify(payload));
        return true;
      }

      console.error("ServerConnector has no recognizable send method.");
      return false;
    }
  };
})();

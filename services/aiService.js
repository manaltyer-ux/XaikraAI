
(function () {
  window.AIService = {
    sendMessage: function (userText, requestId) {
      if (!window.ServerConnector || !window.ServerConnector.isReady()) return false;

      const recentMessages = window.Conversation ? window.Conversation.getRecent(5) : [];

      let previousAiMessage = "";
      for (let i = recentMessages.length - 1; i >= 0; i--) {
        if (recentMessages[i].role === "assistant" || recentMessages[i].role === "ai") {
          previousAiMessage = recentMessages[i].text;
          break;
        }
      }

      const storedLTM = window.MemoryService ? window.MemoryService.getLongTermMemories() : [];
      const relevantLTM = window.LTMMatcherService
        ? window.LTMMatcherService.findRelevantMemories(userText, previousAiMessage, storedLTM)
        : [];

      const shortTermMemory = window.MemoryService ? window.MemoryService.getShortTermMemory() : "";

      const contextText = window.ContextBuilder ? window.ContextBuilder.buildAIContext({
        currentMessage: userText,
        recentMessages: recentMessages,
        shortTermMemory: shortTermMemory,
        relevantLongTermMemories: relevantLTM,
        emotions: window.EmotionService ? window.EmotionService.getEmotions() : {},
        aiPersonality: window.aiPersonality || {},
        userPersona: window.userPersona || {}
      }) : userText;

      return window.ServerConnector.send({
        type: "GENERATE",
        requestId: requestId,
        contextText: contextText,
        recentMessages: recentMessages,
        shortTermMemory: shortTermMemory
      });
    }
  };
})();

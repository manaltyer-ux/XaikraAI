(function () {
  window.AIService = {
    sendMessage: function (userText, requestId) {
      const currentEmotions = window.EmotionService.getEmotions();
      const userPersona = window.UserPersona.get();
      const recentMessages = window.Conversation.getRecent(5);
      const memoryText = window.MemoryService.getFormattedMemoryText();
      const personality = window.aiPersonality || {};

      const fullContext = window.ContextBuilder.buildAIContext({
        currentMessage: userText,
        recentMessages: recentMessages,
        memoryText: memoryText,
        emotions: currentEmotions,
        aiPersonality: personality,
        userPersona: userPersona
      });

      return window.ServerConnector.sendPromptPayload({
        contextText: fullContext,
        userText: userText,
        requestId: requestId
      });
    }
  };
})();

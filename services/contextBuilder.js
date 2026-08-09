
(function () {
  window.ContextBuilder = {
    buildAIContext: function (params) {
      const currentMessage = params.currentMessage || "";
      const recentMessages = params.recentMessages || [];
      const shortTermMemory = params.shortTermMemory || "";
      const relevantLongTermMemories = params.relevantLongTermMemories || [];
      const emotions = params.emotions || {};
      const aiPersonality = params.aiPersonality || {};
      const userPersona = params.userPersona || {};

      let contextPrompt = `SYSTEM INSTRUCTIONS:
You are ${aiPersonality.name || "Xaikra"}, a distinct AI companion.
Gender: ${aiPersonality.gender || "Female"}

PERSONALITY DIRECTIVE:
${aiPersonality.personality || "Be conversational, warm, and attentive."}

EXAMPLE DIALOGUES:
`;

      if (aiPersonality.exampleDialogs && aiPersonality.exampleDialogs.length) {
        aiPersonality.exampleDialogs.forEach(function (d) {
          contextPrompt += `User: ${d.user}\n${aiPersonality.name || "Xaikra"}: ${d.ai}\n\n`;
        });
      }

      contextPrompt += `CURRENT CHARACTER EMOTIONS (0-100 scale):
- Respect: ${emotions.respect || 5}/100
- Curiosity: ${emotions.curiosity || 20}/100
- Mood: ${emotions.mood || 60}/100
- Affection: ${emotions.affection || 0}/100
- Trust: ${emotions.trust || 0}/100

USER PERSONA:
- Name: ${userPersona.name || "User"}
- Gender: ${userPersona.gender || "Not specified"}
- Backstory: ${userPersona.backstory || "None"}

SHORT-TERM CONVERSATION MEMORY:
${shortTermMemory.trim() ? shortTermMemory : "No short term memory yet."}

RELEVANT LONG-TERM MEMORIES:
`;

      if (relevantLongTermMemories.length > 0) {
        contextPrompt += `Note: The following stored facts were matched by keywords and may or may not be directly related to the current moment. Use them only if relevant:\n`;
        relevantLongTermMemories.forEach(function (m) {
          contextPrompt += `- [KEYWORD: ${m.keyword}]: ${m.fact}\n`;
        });
      } else {
        contextPrompt += "No relevant long-term memory found.\n";
      }

      contextPrompt += `\nRECENT CONVERSATION HISTORY:\n`;

      if (recentMessages.length) {
        recentMessages.forEach(function (msg) {
          const speaker = msg.role === "user" ? (userPersona.name || "User") : (aiPersonality.name || "Xaikra");
          contextPrompt += `${speaker}: ${msg.text}\n`;
        });
      } else {
        contextPrompt += "No previous history in this session.\n";
      }

      contextPrompt += `\nCURRENT USER MESSAGE:
${currentMessage}

Respond naturally as ${aiPersonality.name || "Xaikra"}, matching your current emotions, persona instructions, and memory context.`;

      return contextPrompt;
    }
  };
})();

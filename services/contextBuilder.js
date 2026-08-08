(function () {
  window.ContextBuilder = {
    buildAIContext: function (params) {
      const currentMessage = params.currentMessage || "";
      const recentMessages = params.recentMessages || [];
      const memoryText = params.memoryText || "None";
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

AVAILABLE MEMORY:
${memoryText}

RECENT CONVERSATION HISTORY:
`;

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

Respond naturally as ${aiPersonality.name || "Xaikra"}, matching your current emotions, persona instructions, and conversation context.`;

      return contextPrompt;
    }
  };
})();

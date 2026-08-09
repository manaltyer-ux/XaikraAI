
(function () {
  window.LTMMatcherService = {
  
    findRelevantMemories: function (currentMessage, previousAiMessage, storedMemories) {
      if (!storedMemories || !Array.isArray(storedMemories) || storedMemories.length === 0) {
        return [];
      }

     
      const combinedText = ((currentMessage || "") + " " + (previousAiMessage || ""))
        .toLowerCase()
        .replace(/[^\w\s]/g, " ");

      const tokens = new Set(combinedText.split(/\s+/).filter(Boolean));

     
      const matched = storedMemories.filter(function (mem) {
        if (!mem || !mem.keyword) return false;
        const cleanKeyword = mem.keyword.toLowerCase().trim();
        return tokens.has(cleanKeyword);
      });

      return matched;
    }
  };
})();

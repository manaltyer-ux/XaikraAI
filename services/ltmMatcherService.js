;(function () {
  window.LTMMatcherService = {
    findRelevantMemories: function (currentMessage, previousAiMessage, storedMemories) {
      if (!storedMemories || !Array.isArray(storedMemories) || storedMemories.length === 0) {
        return [];
      }

      var combinedText = ((currentMessage || "") + " " + (previousAiMessage || ""))
        .toLowerCase()
        .replace(/[^\w\s]/g, " ");

      var tokens = new Set(combinedText.split(/\s+/).filter(Boolean));

      var matched = storedMemories.filter(function (mem) {
        if (!mem || !mem.keyword) return false;
        var cleanKeyword = mem.keyword.toLowerCase().trim();
        return tokens.has(cleanKeyword);
      });

      return matched;
    }
  };
})();

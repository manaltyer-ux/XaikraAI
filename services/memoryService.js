;(function () {
  var shortTermMemory = "";
  var longTermMemories = [];

  window.MemoryService = {
    getShortTermMemory: function () {
      return shortTermMemory;
    },

    setShortTermMemory: function (text) {
      if (typeof text === "string") {
        shortTermMemory = text.trim();
      }
    },

    getLongTermMemories: function () {
      return longTermMemories.slice();
    },

    addLongTermMemory: function (memObject) {
      if (!memObject || typeof memObject !== "object") return;
      var keyword = memObject.keyword;
      var fact = memObject.fact;

      if (!keyword || !fact) return;

      var cleanKeyword = keyword.trim().toLowerCase();
      var cleanFact = fact.trim();

      var isDuplicate = longTermMemories.some(function (existing) {
        return (
          existing.keyword.toLowerCase() === cleanKeyword ||
          existing.fact.toLowerCase() === cleanFact.toLowerCase()
        );
      });

      if (!isDuplicate) {
        longTermMemories.push({
          keyword: cleanKeyword,
          fact: cleanFact
        });
      }
    }
  };
})();

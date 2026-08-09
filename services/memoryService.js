
(function () {
  let shortTermMemory = "";
  const longTermMemories = []; }

  window.MemoryService = {
    /////// short term
    getShortTermMemory: function () {
      return shortTermMemory;
    },

    setShortTermMemory: function (text) {
      if (typeof text === "string") {
        shortTermMemory = text.trim();
      }
    },

    ///// long term memoryy 
    getLongTermMemories: function () {
      return longTermMemories.slice();
    },

    addLongTermMemory: function (memObject) {
      if (!memObject || typeof memObject !== "object") return;
      const { keyword, fact } = memObject;

      if (!keyword || !fact) return;

      const cleanKeyword = keyword.trim().toLowerCase();
      const cleanFact = fact.trim();
/////// check for duplicated boii
      const isDuplicate = longTermMemories.some(function (existing) {
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

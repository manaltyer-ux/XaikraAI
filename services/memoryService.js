(function () {
  const memories = [];

  window.MemoryService = {
    getMemories: function () {
      return memories.slice();
    },

    addMemory: function (fact) {
      if (fact && typeof fact === "string") {
        const cleanFact = fact.trim();

        if (!cleanFact) return;
/////// memory checker boi
        const isDuplicate = memories.some(function (existing) {
          return existing.toLowerCase() === cleanFact.toLowerCase();
        });

        if (!isDuplicate) {
          memories.push(cleanFact);
        }
      }
    },

    getFormattedMemoryText: function () {
      if (memories.length === 0) {
        return "No explicit stored memories yet.";
      }
      return memories.map(function (m, idx) {
        return (idx + 1) + ". " + m;
      }).join("\n");
    }
  };
})();

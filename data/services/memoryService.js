(function () {
  const memories = [];

  window.MemoryService = {
    getMemories: function () {
      return memories.slice();
    },

    addMemory: function (fact) {
      if (fact && typeof fact === "string") {
        memories.push(fact.trim());
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

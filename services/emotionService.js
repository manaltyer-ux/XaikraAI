(function () {
  const defaultEmotions = {
    respect: 5,
    curiosity: 50,
    mood: 65,
    affection: 0,
    trust: 0
  };

  let currentEmotions = Object.assign({}, defaultEmotions);
  const listeners = [];

  window.EmotionService = {
    getEmotions: function () {
      return Object.assign({}, currentEmotions);
    },

    updateEmotions: function (newEmotions) {
      if (!newEmotions || typeof newEmotions !== "object") return;
      
      let hasChanged = false;
      Object.keys(newEmotions).forEach(function (key) {
        const lowerKey = key.toLowerCase();
        if (lowerKey in currentEmotions) {
          const parsedVal = parseInt(newEmotions[key], 10);
          if (!isNaN(parsedVal)) {
            const val = Math.max(0, Math.min(100, parsedVal));
            currentEmotions[lowerKey] = val;
            hasChanged = true;
          }
        }
      });

      if (hasChanged) {
        listeners.forEach(function (cb) { cb(Object.assign({}, currentEmotions)); });
      }
    },

    subscribe: function (callback) {
      if (typeof callback === "function") {
        listeners.push(callback);
      }
    }
  };
})();

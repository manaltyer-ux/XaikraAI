(function () {
  const defaultEmotions = {
    respect: 0,
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
      Object.keys(newEmotions).forEach(function (key) {
        if (key in currentEmotions) {
          const val = Math.max(0, Math.min(100, Math.round(newEmotions[key])));
          currentEmotions[key] = val;
        }
      });
      listeners.forEach(function (cb) { cb(currentEmotions); });
    },

    subscribe: function (callback) {
      if (typeof callback === "function") {
        listeners.push(callback);
      }
    }
  };
})();

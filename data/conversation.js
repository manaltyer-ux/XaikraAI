(function () {
  const messages = [];

  window.Conversation = {
    add: function (role, text) {
      messages.push({
        role: role,
        text: text,
        timestamp: Date.now()
      });
    },

    getRecent: function (limit) {
      const count = limit || 5;
      return messages.slice(-count);
    },

    getAll: function () {
      return messages.slice();
    },

    clear: function () {
      messages.length = 0;
    }
  };
})();

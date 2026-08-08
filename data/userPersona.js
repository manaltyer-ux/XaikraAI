(function () {
  const STORAGE_KEY = "xaikra_user_persona";

  const defaultPersona = {
    name: "Alex",
    gender: "Not specified",
    backstory: "A curious explorer who enjoys engaging conversations."
  };

  function loadPersona() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return Object.assign({}, defaultPersona, JSON.parse(stored));
      }
    } catch (e) {}
    return Object.assign({}, defaultPersona);
  }

  let currentPersona = loadPersona();

  window.UserPersona = {
    get: function () {
      return Object.assign({}, currentPersona);
    },
    set: function (updatedPersona) {
      currentPersona = Object.assign({}, currentPersona, updatedPersona);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPersona));
      } catch (e) {}
    }
  };
})();

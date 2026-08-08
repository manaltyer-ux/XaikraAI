(function () {
  function renderEmotions(emotions) {
    const container = document.getElementById("emotionsContainer");
    if (!container) return;

    container.innerHTML = "";

    const keys = ["respect", "curiosity", "mood", "affection", "trust"];

    keys.forEach(function (key) {
      const val = typeof emotions[key] === "number" ? emotions[key] : 50;
      const label = key.charAt(0).toUpperCase() + key.slice(1);

      const item = document.createElement("div");
      item.className = "emotion-item";

      const labelRow = document.createElement("div");
      labelRow.className = "emotion-label-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "emotion-name";
      nameSpan.textContent = label;

      const valSpan = document.createElement("span");
      valSpan.className = "emotion-value";
      valSpan.textContent = val + "/100";

      labelRow.appendChild(nameSpan);
      labelRow.appendChild(valSpan);

      const barBg = document.createElement("div");
      barBg.className = "emotion-bar-bg";

      const barFill = document.createElement("div");
      barFill.className = "emotion-bar-fill";
      barFill.style.width = val + "%";

      barBg.appendChild(barFill);
      item.appendChild(labelRow);
      item.appendChild(barBg);

      container.appendChild(item);
    });
  }

  function updatePersonaDisplay() {
    const p = window.UserPersona.get();
    const nameVal = document.getElementById("personaNameValue");
    const genderVal = document.getElementById("personaGenderValue");
    const backstoryVal = document.getElementById("personaBackstoryValue");

    if (nameVal) nameVal.textContent = p.name || "User";
    if (genderVal) genderVal.textContent = p.gender || "Not specified";
    if (backstoryVal) backstoryVal.textContent = p.backstory || "No backstory provided yet.";
  }

  function initPersonaEditor() {
    const toggleBtn = document.getElementById("togglePersonaEdit");
    const displayDiv = document.getElementById("personaDisplay");
    const form = document.getElementById("personaForm");
    const saveBtn = document.getElementById("savePersonaButton");
    const cancelBtn = document.getElementById("cancelPersonaButton");

    const nameInput = document.getElementById("personaNameInput");
    const genderInput = document.getElementById("personaGenderInput");
    const backstoryInput = document.getElementById("personaBackstoryInput");

    if (!toggleBtn || !form) return;

    toggleBtn.addEventListener("click", function () {
      const p = window.UserPersona.get();
      nameInput.value = p.name || "";
      genderInput.value = p.gender || "";
      backstoryInput.value = p.backstory || "";

      displayDiv.hidden = true;
      form.hidden = false;
    });

    cancelBtn.addEventListener("click", function () {
      form.hidden = true;
      displayDiv.hidden = false;
    });

    saveBtn.addEventListener("click", function () {
      window.UserPersona.set({
        name: nameInput.value.trim() || "User",
        gender: genderInput.value.trim() || "Not specified",
        backstory: backstoryInput.value.trim() || "None"
      });

      updatePersonaDisplay();
      form.hidden = true;
      displayDiv.hidden = false;
    });
  }

  function initModelSelector() {
    const radios = document.querySelectorAll('input[name="modelChoice"]');
    const currentSelected = window.ServerConnector.getSelectedModel();

    radios.forEach(function (radio) {
      if (radio.value === currentSelected) {
        radio.checked = true;
      }

      radio.addEventListener("change", function () {
        if (radio.checked) {
          window.ServerConnector.setSelectedModel(radio.value);
        }
      });
    });
  }

  function initCompanionCard() {
    const config = window.aiPersonality || {};
    const nameEl = document.getElementById("companionName");
    const avatarEl = document.getElementById("companionAvatar");

    if (nameEl && config.name) nameEl.textContent = config.name;
    if (avatarEl && config.image) avatarEl.src = config.image;
  }

  window.CompanionPanel = {
    init: function () {
      initCompanionCard();
      
      const initialEmotions = window.EmotionService.getEmotions();
      renderEmotions(initialEmotions);
      window.EmotionService.subscribe(renderEmotions);

      updatePersonaDisplay();
      initPersonaEditor();
      initModelSelector();
    }
  };
})();

(function () {
  const chatBox = document.getElementById("chatBox");
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");

  let activeRequestId = null;
  let activeAiBubble = null;

  let targetMarkdown = "";
  let displayedMarkdown = "";
  let typingAnimationId = null;
  let isResponseComplete = false;
  let stallTimer = null;

  if (typeof marked !== "undefined" && marked.setOptions) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  function scrollChatToBottom() {
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  }

  function addUserRow(userText) {
    const row = document.createElement("div");
    row.className = "chat-row row-user";

    if (userText) {
      const bubble = document.createElement("div");
      bubble.className = "bubble-user";
      bubble.textContent = userText;
      row.appendChild(bubble);
    }

    chatBox.appendChild(row);
    scrollChatToBottom();
  }

  function addAiBubble() {
    const row = document.createElement("div");
    row.className = "chat-row row-ai";
    const bubble = document.createElement("div");
    bubble.className = "bubble-ai";
    bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    row.appendChild(bubble);
    chatBox.appendChild(row);
    scrollChatToBottom();
    return bubble;
  }

  function addNoteLine(noteText, isError) {
    const note = document.createElement("div");
    note.className = isError ? "note-line note-error" : "note-line";
    note.textContent = noteText;
    chatBox.appendChild(note);
    scrollChatToBottom();
  }

  function decorateCodeBlocks(bubbleElement) {
    bubbleElement.querySelectorAll("pre").forEach(function (preElement) {
      if (preElement.parentNode.classList.contains("code-block")) return;

      const codeElement = preElement.querySelector("code");
      const languageName = (codeElement && codeElement.className.replace("language-", "").trim()) || "code";

      const wrapper = document.createElement("div");
      wrapper.className = "code-block";

      const headBar = document.createElement("div");
      headBar.className = "code-block-head";

      const languageLabel = document.createElement("span");
      languageLabel.textContent = languageName;

      const copyButton = document.createElement("button");
      copyButton.className = "copy-code-button";
      copyButton.type = "button";
      copyButton.textContent = "Copy";
      copyButton.addEventListener("click", function () {
        navigator.clipboard.writeText(codeElement ? codeElement.innerText : preElement.innerText);
        copyButton.textContent = "Copied";
        setTimeout(function () { copyButton.textContent = "Copy"; }, 1600);
      });

      headBar.appendChild(languageLabel);
      headBar.appendChild(copyButton);

      preElement.parentNode.insertBefore(wrapper, preElement);
      wrapper.appendChild(headBar);
      wrapper.appendChild(preElement);

      if (codeElement && window.hljs) {
        try { hljs.highlightElement(codeElement); } catch (e) {}
      }
    });
  }

  function renderMarkdownText(text) {
    if (!activeAiBubble) return;

    if (typeof marked !== "undefined" && marked.parse) {
      activeAiBubble.innerHTML = marked.parse(text);
    } else {
      activeAiBubble.textContent = text;
    }
    decorateCodeBlocks(activeAiBubble);
    scrollChatToBottom();
  }

  function startTypingLoop() {
    if (typingAnimationId) return;

    function step() {
      if (!activeAiBubble) {
        typingAnimationId = null;
        return;
      }

      const remainingChars = targetMarkdown.length - displayedMarkdown.length;

      if (remainingChars > 0) {
        let charsToAdd = 1;
        if (remainingChars > 120) charsToAdd = 7;
        else if (remainingChars > 60) charsToAdd = 4;
        else if (remainingChars > 20) charsToAdd = 2;

        if (isResponseComplete) {
          charsToAdd = Math.max(charsToAdd, Math.ceil(remainingChars / 4));
        }

        const nextLength = displayedMarkdown.length + charsToAdd;
        displayedMarkdown = targetMarkdown.slice(0, nextLength);

        renderMarkdownText(displayedMarkdown);
        typingAnimationId = requestAnimationFrame(step);
      } else {
        if (isResponseComplete) {
          renderMarkdownText(targetMarkdown);
          window.Conversation.add("assistant", targetMarkdown);
          typingAnimationId = null;
          finishRequest();
        } else {
          typingAnimationId = null;
        }
      }
    }

    typingAnimationId = requestAnimationFrame(step);
  }

  function resetStallTimer() {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(function () {
      if (!activeRequestId) return;
      if (typingAnimationId) cancelAnimationFrame(typingAnimationId);
      if (activeAiBubble) {
        activeAiBubble.textContent = "Connection timed out while waiting for AI response.";
      }
      addNoteLine("Request timed out.", true);
      finishRequest();
    }, 60000);
  }

  function finishRequest() {
    if (stallTimer) clearTimeout(stallTimer);
    if (typingAnimationId) cancelAnimationFrame(typingAnimationId);

    stallTimer = null;
    typingAnimationId = null;
    activeRequestId = null;
    activeAiBubble = null;
    targetMarkdown = "";
    displayedMarkdown = "";
    isResponseComplete = false;

    refreshSendAvailability();
    if (messageInput) messageInput.focus();
  }

  function refreshSendAvailability() {
    const isBusy = activeRequestId !== null;
    if (sendButton) {
      sendButton.disabled = !window.ServerConnector || !window.ServerConnector.isReady() || isBusy;
    }
  }

  function sendCurrentMessage() {
    const userText = messageInput.value.trim();
    if (!userText || activeRequestId || !window.ServerConnector.isReady()) return;

    activeRequestId = "req-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    targetMarkdown = "";
    displayedMarkdown = "";
    isResponseComplete = false;

    addUserRow(userText);
    window.Conversation.add("user", userText);

    activeAiBubble = addAiBubble();

    const wasSent = window.AIService.sendMessage(userText, activeRequestId);

    if (!wasSent) {
      if (activeAiBubble) activeAiBubble.textContent = "Unable to route message to Xaikra AI server.";
      finishRequest();
      return;
    }

    messageInput.value = "";
    messageInput.style.height = "auto";
    refreshSendAvailability();
    resetStallTimer();
  }

  function initEvents() {
    if (window.ServerConnector) {
      window.ServerConnector.onStatusChange = function (statusText, statusKind) {
        const textEl = document.getElementById("statusText");
        const dotEl = document.getElementById("statusDot");

        if (textEl) textEl.textContent = statusText;
        if (dotEl) {
          dotEl.className = "";
          if (statusKind === "online") dotEl.classList.add("status-online");
          if (statusKind === "offline") dotEl.classList.add("status-offline");
        }
        refreshSendAvailability();
      };

      window.ServerConnector.onServerMessage = function (payload) {
        if (!payload) return;

        if (payload.type === "EMOTION_UPDATE" && payload.emotions) {
          window.EmotionService.updateEmotions(payload.emotions);
          return;
        }

        if (payload.type === "MEMORY_UPDATE" && payload.memory) {
          window.MemoryService.addMemory(payload.memory);
          return;
        }

        if (payload.requestId !== activeRequestId) return;

        if (payload.type === "QUEUED" || payload.type === "PROCESSING") {
          resetStallTimer();
          return;
        }

        if (payload.type === "CHUNK") {
          resetStallTimer();
          if (typeof payload.text === "string") {
            targetMarkdown = payload.text;
          } else if (typeof payload.delta === "string") {
            targetMarkdown += payload.delta;
          }
          startTypingLoop();
          return;
        }

        if (payload.type === "RESPONSE_COMPLETE") {
          resetStallTimer();
          if (typeof payload.text === "string" && payload.text.length > 0) {
            targetMarkdown = payload.text;
          }
          isResponseComplete = true;
          startTypingLoop();
          return;
        }

        if (payload.type === "ERROR") {
          if (typingAnimationId) cancelAnimationFrame(typingAnimationId);
          if (activeAiBubble) activeAiBubble.textContent = "Error: " + (payload.text || "Failed to respond.");
          finishRequest();
        }
      };
    }

    if (sendButton) sendButton.addEventListener("click", sendCurrentMessage);

    if (messageInput) {
      messageInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendCurrentMessage();
        }
      });

      messageInput.addEventListener("input", function () {
        messageInput.style.height = "auto";
        messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + "px";
      });
    }
  }

  window.ChatView = {
    init: function () {
      initEvents();
      
      const firstGreeting = window.aiPersonality && window.aiPersonality.firstMessage;
      if (firstGreeting) {
        const bubble = addAiBubble();
        bubble.textContent = firstGreeting;
        window.Conversation.add("assistant", firstGreeting);
      }
    },
    refreshSendAvailability: refreshSendAvailability
  };
})();

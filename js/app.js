document.addEventListener("DOMContentLoaded", function () {
  if (window.CompanionPanel) {
    window.CompanionPanel.init();
  }

  if (window.ChatView) {
    window.ChatView.init();
  }

  if (window.ServerConnector) {
    window.ServerConnector.start();
  }
});

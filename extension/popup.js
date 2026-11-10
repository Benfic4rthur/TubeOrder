(() => {
  "use strict";
  let tabId = null;
  let polling = false;
  let stopped = false;
  let pollTimer = null;
  let savedRemoveWatched = true;
  const openSection = document.getElementById("open-section");
  const removeWatched = document.getElementById("remove-watched");
  const removeWatchedError = document.getElementById("remove-watched-error");
  const inactive = {
    available: false, busy: false, phase: "idle", count: 0, total: null,
    moved: 0, moves: 0, order: null,
    message: "Abra o Assistir mais tarde com sua conta logada.",
    detail: "A TubeOrder organiza somente essa playlist."
  };
  const view = TubeOrderUI.mount(document.getElementById("app"), {
    onSort: order => command({ type: "TUBEORDER_SORT", order }),
    onCancel: () => command({ type: "TUBEORDER_CANCEL" })
  }, { popup: true });

  function render(status) {
    view.update(status);
    openSection.hidden = Boolean(status.available);
    clearTimeout(pollTimer);
    if (status.busy && !stopped) pollTimer = setTimeout(() => void refresh(), 500);
  }

  async function refresh() {
    if (polling || stopped || tabId === null) return;
    polling = true;
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "TUBEORDER_STATUS" });
      render(result?.status || inactive);
    } catch {
      render(inactive);
    } finally {
      polling = false;
    }
  }

  async function command(payload) {
    if (tabId === null) return;
    try {
      const result = await chrome.tabs.sendMessage(tabId, payload);
      if (result?.status) render(result.status);
      else await refresh();
    } catch {
      render({ ...inactive, phase: "error", message: "Atualize a página do YouTube e tente novamente." });
    }
  }

  function showPreferenceError(message) {
    removeWatchedError.textContent = message;
    removeWatchedError.hidden = !message;
  }

  async function loadCleanupPreference() {
    try {
      const saved = await chrome.storage.local.get("removeWatched");
      savedRemoveWatched = typeof saved.removeWatched === "boolean" ? saved.removeWatched : true;
      removeWatched.checked = savedRemoveWatched;
      removeWatched.indeterminate = false;
      removeWatched.disabled = false;
    } catch {
      removeWatched.indeterminate = true;
      removeWatched.disabled = true;
      showPreferenceError("Não consegui carregar esta opção. Feche e abra o popup para tentar novamente.");
    }
  }

  removeWatched.addEventListener("change", async () => {
    const chosen = removeWatched.checked;
    removeWatched.disabled = true;
    showPreferenceError("");
    try {
      await chrome.storage.local.set({ removeWatched: chosen });
      savedRemoveWatched = chosen;
    } catch {
      removeWatched.checked = savedRemoveWatched;
      showPreferenceError("Não consegui salvar. A opção anterior foi mantida.");
    } finally {
      removeWatched.disabled = false;
    }
  });

  document.getElementById("open-playlist").addEventListener("click", async () => {
    await chrome.tabs.create({ url: "https://www.youtube.com/playlist?list=WL" });
    window.close();
  });

  render({ ...inactive, message: "Conectando ao YouTube…", detail: "" });
  void loadCleanupPreference();
  chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    tabId = tabs[0]?.id ?? null;
    if (tabId === null) render(inactive);
    else void refresh();
  }).catch(() => render(inactive));
  window.addEventListener("pagehide", () => { stopped = true; clearTimeout(pollTimer); });
})();

(function () {
  "use strict";
  if (globalThis.__tubeOrderRecommendationsLoaded) return;
  globalThis.__tubeOrderRecommendationsLoaded = true;
  const surface = globalThis.TubeOrderSaveContext, CARDS = surface.CARDS;
  const mounted = new Map(), pending = new Map();
  let root = null, panel = null, observer = null, panelObserver = null, discovery = null;
  let timer = null, discoveryTimer = null, discoveryTarget = null, scanId = null, style = null, navigating = false;

  function available() {
    return !navigating && surface.available();
  }
  function ensureStyle() {
    if (style?.isConnected) return;
    style = document.createElement("style");
    style.textContent = `
      .tubeorder-save-row { display:flex!important;flex-direction:row!important;align-items:center!important;flex-wrap:wrap!important;column-gap:5px;row-gap:3px;min-width:0; }
      .tubeorder-save { display:inline-flex!important;align-items:center;justify-content:center;flex:none;order:2;box-sizing:border-box;inline-size:max-content!important;min-inline-size:0!important;align-self:center!important;min-height:22px;padding:2px 7px;border:1px solid #c5aaff40;border-radius:12px;background:#c5aaff12;color:#dfcffb;font:600 10px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer; }
      .tubeorder-save:hover:not(:disabled) { background:#c5aaff2c; }
      .tubeorder-save:disabled { opacity:.6;cursor:wait; }
      .tubeorder-save:focus-visible { outline:2px solid #d9c3ff;outline-offset:2px; }
    `;
    document.documentElement.appendChild(style);
  }
  function unmount(entry) { entry.button.remove(); entry.host.classList.remove("tubeorder-save-row"); }
  function stopDiscovery() { discovery?.disconnect(); discovery = discoveryTarget = null; clearTimeout(discoveryTimer); discoveryTimer = null; }
  function discover(target) {
    if (discovery && discoveryTarget === target) return;
    stopDiscovery(); discoveryTarget = target;
    discovery = new MutationObserver(schedule);
    discovery.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    discoveryTimer = setTimeout(stopDiscovery, 15000);
  }
  function stop() {
    clearTimeout(timer); timer = null; scanId = null;
    observer?.disconnect(); panelObserver?.disconnect(); observer = panelObserver = null;
    root = panel = null; stopDiscovery();
    for (const entry of mounted.values()) unmount(entry);
    mounted.clear(); style?.remove(); style = null;
  }
  function schedule() { if (timer === null) timer = setTimeout(() => { timer = null; reconcile(); }, 100); }
  function relevant(record) {
    if (record.type === "attributes") return Boolean(record.target.closest(CARDS)) &&
      (record.attributeName === "href" || record.attributeName === "hidden" ||
        record.target.matches("ytd-thumbnail-overlay-resume-playback-renderer #progress, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment, [role='progressbar']"));
    return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE &&
      !node.matches(".tubeorder-save") && (node.matches(CARDS) || node.querySelector(CARDS) ||
        node.matches("ytd-thumbnail-overlay-resume-playback-renderer, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment")));
  }
  function reconcile() {
    if (!available()) {
      if (navigating || !surface.supported()) { stop(); return; }
      if (root || observer || mounted.size) stop();
      // YouTube may finish signing in after document_idle without another
      // navigation event. Wait briefly on the masthead, then disconnect.
      discover(document.querySelector("ytd-masthead") || document.body || document.documentElement);
      return;
    }
    const next = surface.root();
    if (!next) {
      discover(document.body || document.documentElement);
      return;
    }
    stopDiscovery(); ensureStyle();
    if (next !== root) {
      observer?.disconnect(); root = next;
      observer = new MutationObserver(records => { if (records.some(relevant)) schedule(); });
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "hidden", "style", "aria-valuenow"] });
    }
    const nextPanel = document.querySelector("ytd-playlist-panel-renderer:not([hidden]) #items, ytd-playlist-panel-renderer:not([hidden]) #contents");
    if (nextPanel !== panel) {
      panelObserver?.disconnect(); panel = nextPanel;
      panelObserver = panel ? new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && node.matches("ytd-playlist-panel-video-renderer")))) schedule();
      }) : null;
      if (panel) panelObserver.observe(panel, { childList: true });
    }
    scanId = crypto.randomUUID();
    window.dispatchEvent(new CustomEvent("tubeorder:recommendations-scan", { detail: { requestId: scanId, contextUrl: location.href } }));
  }
  function save(entry, event) {
    event.preventDefault(); event.stopPropagation();
    if (!event.isTrusted || entry.button.disabled || !available() || document.getElementById("tubeorder-lock")) return;
    if (!chrome.runtime.id) { globalThis.TubeOrderRowActions?.notify("A extensão foi atualizada. Recarregue esta aba do YouTube para reativar os botões.", true); return; }
    const requestId = crypto.randomUUID();
    for (const item of mounted.values()) if (item.videoId === entry.videoId) { item.button.disabled = true; item.button.textContent = "Salvando…"; }
    const timeout = setTimeout(() => finish({ requestId, type: "error", message: "O YouTube demorou para confirmar. Confira sua lista antes de tentar novamente." }), 25000);
    pending.set(requestId, { videoId: entry.videoId, timeout });
    window.dispatchEvent(new CustomEvent("tubeorder:save-request", { detail: { requestId, key: entry.key, videoId: entry.videoId, contextUrl: location.href } }));
  }
  function finish(result) {
    const current = pending.get(result?.requestId);
    if (!current) return;
    clearTimeout(current.timeout); pending.delete(result.requestId);
    for (const entry of mounted.values()) if (entry.videoId === current.videoId) { entry.button.disabled = false; entry.button.textContent = "+ Mais tarde"; }
    const done = result.type === "done" && result.serverConfirmed === true;
    if (available()) globalThis.TubeOrderRowActions?.notify(done ? "Vídeo salvo no Assistir mais tarde." : result.message || "Não consegui confirmar a inclusão.", !done);
    schedule();
  }
  window.addEventListener("tubeorder:save-result", event => finish(event.detail));
  window.addEventListener("tubeorder:recommendations-state", event => {
    const result = event.detail;
    if (!available() || result?.requestId !== scanId || !Array.isArray(result.items) || !root) return;
    const live = new Set();
    for (const info of result.items) {
      if (!info.eligible || typeof info.key !== "string" || !/^[a-f\d-]{36}$/.test(info.key)) continue;
      const row = root.querySelector(`[data-tubeorder-save-key="${info.key}"]`);
      if (!row) continue;
      const host = row.querySelector("#byline-container") || row.querySelector(".ytContentMetadataViewModelMetadataRow, .yt-content-metadata-view-model__metadata-row") || row.querySelector("ytd-channel-name");
      if (!host) continue;
      live.add(info.key);
      let entry = mounted.get(info.key);
      if (entry && (entry.host !== host || entry.videoId !== info.videoId)) { unmount(entry); mounted.delete(info.key); entry = null; }
      if (!entry) {
        const button = document.createElement("button"); button.type = "button"; button.className = "tubeorder-save"; button.textContent = "+ Mais tarde";
        button.title = "Salvar no Assistir mais tarde"; button.setAttribute("aria-label", "Salvar no Assistir mais tarde");
        entry = { key: info.key, videoId: info.videoId, row, host, button }; mounted.set(info.key, entry);
        button.addEventListener("click", event => save(entry, event));
      }
      host.classList.add("tubeorder-save-row");
      if (!entry.button.isConnected) host.appendChild(entry.button);
      if ([...pending.values()].some(item => item.videoId === entry.videoId)) { entry.button.disabled = true; entry.button.textContent = "Salvando…"; }
    }
    for (const [key, entry] of mounted) if (!live.has(key) || !entry.row.isConnected) { unmount(entry); mounted.delete(key); }
  });
  document.addEventListener("yt-navigate-start", () => { navigating = true; stop(); });
  document.addEventListener("yt-navigate-finish", () => { navigating = false; reconcile(); });
  document.addEventListener("yt-page-data-updated", () => { if (surface.supported()) schedule(); });
  window.addEventListener("popstate", schedule);
  window.addEventListener("tubeorder:sort-unlocked", schedule);
  window.addEventListener("tubeorder:sidebar-ready", schedule);
  reconcile();
})();

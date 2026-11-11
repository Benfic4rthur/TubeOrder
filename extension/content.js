(function () {
  "use strict";
  if (globalThis.__tubeOrderLoaded) return;
  globalThis.__tubeOrderLoaded = true;

  const { parseDuration, sortVideos, planMoves } = globalThis.TubeOrderCore;
  const ROW_SELECTOR = "ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer";
  const LIST_RENDERER = "ytd-playlist-video-list-renderer, ytd-playlist-panel-renderer";
  const STALL_MS = 25000;
  let host = null;
  let ui = null;
  let noticeHost = null;
  let notice = null;
  let preferredOrder = "asc";
  let secondsPerMove = 0.9;
  let secondsPerBatch = 1.5;
  let preferencesReady = false;
  let entryAutoStarted = false;
  let lastContextKey = null;
  let list = null;
  let job = null;
  let navigating = false;
  let refreshTimer;
  let startupObserver = null;
  let startupTimeout = null;
  let listObserver = null;
  let watchedList = null;
  let knownEntries = null;
  let additionTimer = null;
  let additionsPending = false;
  let originals = new Map();
  let anonymous = new WeakMap();
  let nextIndex = 0;
  let status = inactiveStatus();
  let cleanupSettingsReady = false;
  let cleanupEnabled = false;
  function sendCleanupSettings() {
    if (cleanupSettingsReady) window.dispatchEvent(new CustomEvent("tubeorder:cleanup-settings", { detail: { enabled: cleanupEnabled } }));
  }
  window.addEventListener("tubeorder:cleanup-ready", sendCleanupSettings);

  function inactiveStatus() {
    return { available: false, busy: false, phase: "idle", count: 0, total: null,
      moved: 0, moves: 0, order: null, etaSeconds: null,
      message: "Abra o Assistir mais tarde com sua conta conectada.", detail: "A organização funciona somente nessa playlist." };
  }

  function isWatchLater() {
    return ["/playlist", "/watch"].includes(location.pathname.replace(/\/$/, "")) && new URL(location.href).searchParams.get("list") === "WL";
  }

  const isPlayer = () => location.pathname.replace(/\/$/, "") === "/watch";
  const contextKey = () => isWatchLater() ? (isPlayer() ? "watch:WL" : "playlist:WL") : null;

  function mediaRect() {
    if (!isPlayer()) return null;
    const player = document.querySelector("#movie_player") || document.querySelector("video");
    if (!player) return null;
    const rect = player.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  }

  function isLoggedIn() {
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    return Boolean(avatar && !avatar.closest("[hidden]"));
  }

  function findList() {
    const selector = isPlayer() ? "ytd-playlist-panel-renderer" : "ytd-playlist-video-list-renderer";
    for (const renderer of document.querySelectorAll(selector)) {
      if (renderer.closest("[hidden]")) continue;
      const contents = isPlayer()
        ? renderer.querySelector("#items") || renderer.querySelector("#contents")
        : renderer.querySelector(":scope > #contents") || renderer.querySelector("#contents");
      if (contents) return contents;
    }
    return null;
  }

  function rows() {
    if (!list?.isConnected) return [];
    return Array.from(list.children).filter((element) => element.matches(ROW_SELECTOR));
  }

  function idFor(row) {
    const link = row.querySelector("a#video-title, a[href*='/watch?'], a[href*='watch?v=']");
    let id;
    try { id = new URL(link?.getAttribute("href"), location.origin).searchParams.get("v"); } catch { /* unavailable item */ }
    if (id) return id;
    if (!anonymous.has(row)) anonymous.set(row, `unavailable-${nextIndex++}`);
    return anonymous.get(row);
  }

  function readDuration(row) {
    const overlays = row.querySelectorAll("ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text, yt-thumbnail-badge-view-model");
    for (const overlay of overlays) {
      const duration = parseDuration(overlay.textContent || overlay.getAttribute("aria-label") || "");
      if (duration !== null) return duration;
    }
    return null;
  }

  function snapshot() {
    return rows().map((node) => {
      const id = idFor(node);
      if (!originals.has(id)) originals.set(id, nextIndex++);
      return { id, node, duration: readDuration(node), originalIndex: originals.get(id) };
    });
  }

  function expectedTotal() {
    if (isPlayer()) {
      const panel = list?.closest("ytd-playlist-panel-renderer") || document.querySelector("ytd-playlist-panel-renderer:not([hidden])");
      const header = panel?.querySelector("#publisher-container") || panel?.querySelector("#header-description") || panel?.querySelector("#header-contents") || panel;
      // The player repeats its count in hidden accessibility text. textContent
      // concatenates "1 / 31" twice into "1 / 311 / 31". Read visible text.
      const visibleText = header?.innerText || header?.textContent || "";
      const match = visibleText.match(/\/\s*([\d.,]+)/);
      return match ? Number(match[1].replace(/\D/g, "")) || null : null;
    }
    for (const header of document.querySelectorAll("ytd-playlist-header-renderer, ytd-playlist-sidebar-primary-info-renderer")) {
      if (header.closest("[hidden]")) continue;
      const match = header.textContent.match(/([\d][\d\s.,\u00a0\u202f]*)\s*v[ií]deos?\b/i);
      if (match) return Number(match[1].replace(/\D/g, "")) || null;
    }
    return null;
  }

  function update(patch = {}) {
    status = { ...status, ...patch };
    if (status.busy && !host && isWatchLater() && isLoggedIn()) {
      hideNotice();
      host = document.createElement("div");
      host.id = "tubeorder-lock";
      document.documentElement.appendChild(host);
      ui = globalThis.TubeOrderUI.mountBusy(host, { onCancel: cancel });
    } else if (!status.busy && host) {
      ui?.destroy();
      host.remove();
      host = null;
      ui = null;
      window.dispatchEvent(new CustomEvent("tubeorder:sort-unlocked"));
    }
    ui?.update(status);
  }

  function hideNotice() {
    notice?.destroy();
    noticeHost?.remove();
    notice = null;
    noticeHost = null;
  }

  function checkOrder() {
    if (job || !list?.isConnected) return;
    const videos = snapshot();
    globalThis.TubeOrderRowActions?.sync(videos.map(video => ({ row: video.node, id: video.id })));
    const target = sortVideos(videos, preferredOrder);
    const disorder = videos.some((video, index) => video.id !== target[index].id);
    if (!noticeHost?.isConnected) {
      hideNotice();
      noticeHost = document.createElement("div");
      noticeHost.id = "tubeorder-notice";
      noticeHost.style.cssText = "display:inline-flex;align-items:center;margin:0 0 0 10px;vertical-align:middle;";
      const renderer = list.closest(LIST_RENDERER);
      const publisher = isPlayer() ? renderer.querySelector("#publisher-container, #header-description") : null;
      const nativeSort = Array.from(document.querySelectorAll("chip-bar-view-model button[role='combobox'], ytd-sort-filter-sub-menu-renderer"))
        .find((element) => !element.closest("[hidden]") && element.getClientRects().length);
      const nativeChip = nativeSort?.closest(".ytChipBarViewModelChipWrapper") || nativeSort?.closest("chip-view-model") || nativeSort;
      if (publisher) {
        noticeHost.style.cssText = "display:inline-flex;align-items:center;min-width:0;margin-left:8px;vertical-align:middle;max-width:100%;";
        publisher.appendChild(noticeHost);
      } else if (isPlayer()) {
        noticeHost.style.cssText = "display:block;margin:3px 10px 6px;";
        const items = renderer.querySelector("#items, #contents");
        items.parentNode.insertBefore(noticeHost, items);
      } else if (nativeChip) nativeChip.insertAdjacentElement("afterend", noticeHost);
      else {
        noticeHost.style.cssText = "display:block;margin:2px 0 8px;";
        renderer.parentNode.insertBefore(noticeHost, renderer);
      }
      notice = globalThis.TubeOrderUI.mountNotice(noticeHost, { onSort: startSort });
    }
    const total = expectedTotal();
    notice.update({ ...status, count: videos.length, order: preferredOrder, disorder,
      complete: total !== null && videos.length >= total });
  }

  function reconcile() {
    clearTimeout(refreshTimer);
    if (!navigating && contextKey() !== lastContextKey) {
      lastContextKey = contextKey();
      entryAutoStarted = false;
      knownEntries = null;
    }
    if (navigating || !isWatchLater() || !isLoggedIn()) {
      if (job && !job.cancelled) cancel();
      ui?.destroy();
      host?.remove();
      ui = null;
      host = null;
      hideNotice();
      list = null;
      watchList(null);
      globalThis.TubeOrderRowActions?.destroy();
      clearTimeout(additionTimer); additionTimer = null;
      if (!isWatchLater()) { knownEntries = null; additionsPending = false; }
      originals.clear();
      anonymous = new WeakMap();
      status = inactiveStatus();
      if (!isWatchLater()) entryAutoStarted = false;
      if (!navigating && isWatchLater()) discoverList(); else stopDiscovery();
      return;
    }
    const nextList = findList();
    if (!nextList) { discoverList(); return; }
    stopDiscovery();
    if (list && nextList !== list) {
      if (job && !job.cancelled) cancel();
      originals = new Map();
      anonymous = new WeakMap();
      nextIndex = 0;
    }
    list = nextList;
    watchList(list);
    if (!status.available) {
      status = { ...inactiveStatus(), available: true, count: rows().length, total: expectedTotal(),
        message: "Sua próxima sessão, em ordem.", detail: "Escolha uma opção. Eu carrego a lista toda e salvo a ordem no YouTube." };
    }
    if (!job) snapshot();
    if (!job) rememberEntries(true);
    update({ available: true, count: rows().length, total: expectedTotal() });
    if (isPlayer()) {
      window.dispatchEvent(new CustomEvent("tubeorder:cleanup-context-ready"));
      window.dispatchEvent(new CustomEvent("tubeorder:sidebar-ready"));
    }
    if (!job) checkOrder();
    if (!job && preferencesReady && !entryAutoStarted) {
      entryAutoStarted = true;
      queueMicrotask(() => {
        if (!job && isWatchLater() && isLoggedIn()) startSort(preferredOrder);
      });
    } else if (!job && entryAutoStarted && !isPlayer()) watchList(null);
  }

  function queueAdditionSort() {
    clearTimeout(additionTimer);
    additionTimer = setTimeout(() => {
      additionTimer = null;
      if (navigating || !isWatchLater() || !isPlayer() || !isLoggedIn()) return;
      if (job) { additionsPending = true; return; }
      startSort(preferredOrder);
    }, 450);
  }

  function rememberEntries(trigger) {
    const current = new Set(rows().map(idFor));
    const added = knownEntries && [...current].some(id => !knownEntries.has(id));
    const total = expectedTotal();
    if (!knownEntries || (total !== null && current.size >= total)) knownEntries = current;
    else for (const id of current) knownEntries.add(id);
    if (trigger && added && entryAutoStarted && preferencesReady && isPlayer()) queueAdditionSort();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(reconcile, 180);
  }

  function stopDiscovery() {
    startupObserver?.disconnect();
    startupObserver = null;
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }

  function discoverList() {
    if (startupObserver || navigating || !isWatchLater()) return;
    // Observe startup only until YouTube mounts the playlist. Never watch the
    // full YouTube document during playback or on unrelated pages.
    startupObserver = new MutationObserver(scheduleRefresh);
    startupObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    startupTimeout = setTimeout(stopDiscovery, 15000);
  }

  function watchList(target) {
    if (target === watchedList) return;
    listObserver?.disconnect();
    listObserver = null;
    watchedList = target;
    if (!target) return;
    listObserver = new MutationObserver((records) => {
      const changedRows = records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === Node.ELEMENT_NODE && node.matches(ROW_SELECTOR)));
      if (!changedRows) return;
      if (job) {
        if (status.phase === "sorting" && knownEntries && rows().some(row => !knownEntries.has(idFor(row)))) additionsPending = true;
        return;
      }
      rememberEntries(true);
      scheduleRefresh();
    });
    // Direct additions/removals only: no thumbnails, text, player or page-wide
    // observation, no timers or periodic rescans while the page is idle.
    listObserver.observe(target, { childList: true });
  }

  function assertActive(activeJob) {
    if (activeJob.cancelled || job !== activeJob || navigating || !isWatchLater() || !isLoggedIn()) {
      throw new DOMException("Organização interrompida", "AbortError");
    }
    if (!list?.isConnected || findList() !== list) {
      throw new Error("O YouTube atualizou a lista durante a organização. Tente novamente.");
    }
  }

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function continuation() {
    return Array.from(list.closest(LIST_RENDERER).querySelectorAll("ytd-continuation-item-renderer"))
      .find((element) => !element.closest("[hidden]"));
  }

  async function loadAll(activeJob) {
    let previousCount = -1;
    let lastProgress = Date.now();
    let quietSince = Date.now();
    while (true) {
      assertActive(activeJob);
      const count = rows().length;
      if (count !== previousCount) {
        previousCount = count;
        lastProgress = Date.now();
        quietSince = Date.now();
        snapshot();
      }
      const next = continuation();
      update({ phase: "loading", count, total: expectedTotal(),
        message: "Carregando sua lista inteira…",
        detail: `${count.toLocaleString("pt-BR")} vídeos encontrados. Você pode deixar comigo.` });
      const total = expectedTotal();
      const pending = list.closest(LIST_RENDERER).querySelector("tp-yt-paper-spinner[active], yt-spinner[active], [aria-busy='true']");
      if (!next && !pending && total !== null && count >= total) return snapshot();
      if (!next && !pending && (total === null || count >= total) && Date.now() - quietSince >= 1200) return snapshot();
      if (Date.now() - lastProgress > STALL_MS) {
        throw new Error("O YouTube parou de carregar os vídeos. A lista ainda não foi ordenada por completo. Tente novamente.");
      }
      if (next) {
        quietSince = Date.now();
        next.scrollIntoView({ block: "center", behavior: "instant" });
        const button = next.querySelector("button, yt-button-shape button, tp-yt-paper-button");
        if (button && !button.disabled) button.click();
      } else if (total !== null && count < total) {
        rows().at(-1)?.scrollIntoView({ block: "end", behavior: "instant" });
      }
      await pause(250);
    }
  }

  const normalize = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const sameOrder = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);

  async function waitFor(activeJob, predicate, errorMessage, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      assertActive(activeJob);
      const result = predicate();
      if (result) return result;
      await pause(40);
    }
    throw new Error(errorMessage);
  }

  async function moveNative(activeJob, move, expectedOrder) {
    const node = rows().find((row) => idFor(row) === move.id);
    if (!node) throw new Error("Um vídeo saiu da lista durante a organização. Tente novamente.");
    const button = node.querySelector("#menu button, yt-icon-button#button button, button[aria-label='Menu de ações'], button[aria-label='Action menu']");
    if (!button) throw new Error("O YouTube não exibiu o menu para mover um vídeo. Atualize a página e tente novamente.");
    button.click();
    let command;
    try {
      command = await waitFor(activeJob, () => {
        const candidates = document.querySelectorAll("ytd-menu-service-item-renderer, tp-yt-paper-item[role='menuitem'], [role='menuitem']");
        return Array.from(candidates).find((item) => {
          if (item.closest("[hidden]") || !item.getClientRects().length) return false;
          const label = normalize(item.querySelector("yt-formatted-string")?.innerText || item.innerText || item.textContent || "");
          return move.edge === "top"
            ? /^(mover para o inicio|mover para o topo|move to top|move to beginning)$/.test(label)
            : /^(mover para o fim|mover para o final|move to bottom|move to end)$/.test(label);
        });
      }, "O comando de mover não apareceu. Deixe a ordenação do YouTube em Manual e tente novamente.", 5000);
    } catch (error) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      throw error;
    }
    assertActive(activeJob);
    command.click();
    await waitFor(activeJob, () => sameOrder(rows().map(idFor), expectedOrder),
      "O YouTube não confirmou a mudança de ordem. A organização parou; os movimentos já concluídos foram mantidos.");
    // The native list updates after the edit response. Continue immediately.
    await pause(30);
  }

  function cancel() {
    if (job) {
      job.cancelled = true;
      if (job.batchRequestId) window.dispatchEvent(new CustomEvent("tubeorder:batch-cancel", { detail: { requestId: job.batchRequestId } }));
      update({ message: "Interrompendo…", detail: "Os movimentos que já foram salvos no YouTube serão mantidos." });
    }
  }

  function startSort(order) {
    reconcile();
    if (job || !status.available || !["asc", "desc"].includes(order)) return;
    clearTimeout(additionTimer); additionTimer = null;
    try {
      if (!chrome.runtime.id) throw new Error("Extension context invalidated");
      void chrome.storage.local.set({ lastOrder: order }).catch(() => {});
    } catch {
      update({ phase: "error", detail: "A extensão foi atualizada. Recarregue esta aba do YouTube para reativar os botões." });
      checkOrder();
      globalThis.TubeOrderRowActions?.notify(status.detail, true);
      return;
    }
    const activeJob = { cancelled: false };
    entryAutoStarted = true;
    preferredOrder = order;
    job = activeJob;
    update({ busy: true, phase: "loading", moved: 0, moves: 0, order, etaSeconds: null, mediaRect: mediaRect(), message: "Preparando sua lista…", detail: "A ordem será salva na própria playlist." });
    void runSort(activeJob, order);
  }

  function tryNativeBatch(activeJob, videos, moves, targetIds) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      activeJob.batchRequestId = requestId;
      let started = false;
      let timeout;
      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener("tubeorder:batch-result", onResult);
        delete activeJob.batchRequestId;
      };
      const fail = (message) => { cleanup(); reject(new Error(message)); };
      const armTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fail("O YouTube demorou para confirmar o lote. Atualize a página para verificar a ordem salva."), 25000);
      };
      const onResult = (event) => {
        const result = event.detail;
        if (result?.requestId !== requestId) return;
        if (result.type === "unsupported" && !started) { cleanup(); resolve(false); return; }
        if (result.type === "started") {
          started = true;
          armTimeout();
          update({ etaSeconds: Math.ceil(Math.ceil(moves.length / 50) * secondsPerBatch),
            detail: "Salvando várias mudanças de uma vez pelo próprio YouTube." });
        } else if (result.type === "progress") {
          armTimeout();
          update({ moved: result.moved, etaSeconds: result.etaSeconds,
            detail: `${result.moved} de ${moves.length} movimentos salvos. A playlist tem ${videos.length.toLocaleString("pt-BR")} vídeos.` });
        } else if (result.type === "done") {
          if (result.elapsedMs > 0 && moves.length) secondsPerBatch = Math.max(0.05, Math.min(20, result.elapsedMs / 1000 / Math.ceil(moves.length / 50)));
          cleanup(); resolve(true);
        } else if (result.type === "cancelled") {
          cleanup(); reject(new DOMException("Organização interrompida", "AbortError"));
        } else if (result.type === "error") fail(result.message || "O YouTube não confirmou a organização.");
      };
      window.addEventListener("tubeorder:batch-result", onResult);
      timeout = setTimeout(() => {
        if (!started) { cleanup(); resolve(false); }
      }, 350);
      window.dispatchEvent(new CustomEvent("tubeorder:batch-request", { detail: {
        requestId, currentIds: videos.map((video) => video.id), targetIds, moves,
      } }));
    });
  }

  async function runSort(activeJob, order) {
    const oldScroll = { x: scrollX, y: scrollY };
    const refreshVideoRect = () => { if (job === activeJob && status.busy) update({ mediaRect: mediaRect() }); };
    if (isPlayer()) window.addEventListener("resize", refreshVideoRect, { passive: true });
    const activePlayer = isPlayer() ? document.querySelector("#movie_player") || document.querySelector("video") : null;
    const playerResizeObserver = activePlayer ? new ResizeObserver(refreshVideoRect) : null;
    if (activePlayer) playerResizeObserver.observe(activePlayer);
    try {
      const videos = await loadAll(activeJob);
      assertActive(activeJob);
      rememberEntries(false);
      const target = sortVideos(videos, order);
      const currentIds = videos.map((video) => video.id);
      const targetIds = target.map((video) => video.id);
      const moves = planMoves(currentIds, targetIds, { topOnly: videos.some((video) => video.duration === null) });
      if (moves.some((move) => move.id.startsWith("unavailable-"))) {
        throw new Error("O YouTube ocultou a identificação de um vídeo indisponível. Exiba os vídeos indisponíveis no menu da playlist e tente novamente.");
      }
      update({ phase: "sorting", moves: moves.length, moved: 0, etaSeconds: Math.ceil(moves.length * secondsPerMove),
        message: "Salvando a ordem no YouTube…", detail: "A reprodução automática vai seguir essa sequência." });
      let model = [...currentIds];
      const sortingStarted = performance.now();
      const batched = moves.length ? await tryNativeBatch(activeJob, videos, moves, targetIds) : false;
      if (isPlayer() && moves.length && !batched) throw new Error("O YouTube ainda não disponibilizou uma fila editável. Tente Reorganizar; se continuar, recarregue a aba para atualizar a extensão.");
      for (let i = 0; !batched && i < moves.length; i += 1) {
        assertActive(activeJob);
        const move = moves[i];
        model = model.filter((id) => id !== move.id);
        if (move.edge === "top") model.unshift(move.id); else model.push(move.id);
        await moveNative(activeJob, move, model);
        const measuredAverage = (performance.now() - sortingStarted) / 1000 / (i + 1);
        const average = i >= 1 ? measuredAverage : (measuredAverage + secondsPerMove) / 2;
        update({ moved: i + 1, etaSeconds: Math.ceil((moves.length - i - 1) * average),
          detail: `${i + 1} de ${moves.length} movimentos salvos. A playlist tem ${videos.length.toLocaleString("pt-BR")} vídeos.` });
      }
      if (moves.length && !batched) secondsPerMove = Math.max(0.05, Math.min(15, (performance.now() - sortingStarted) / 1000 / moves.length));
      assertActive(activeJob);
      if (!sameOrder(snapshot().map((video) => video.id), targetIds)) {
        throw new Error("A playlist mudou durante a organização. Tente novamente para concluir.");
      }
      const unknown = videos.filter((video) => video.duration === null).length;
      update({ busy: false, phase: "done", count: videos.length,
        message: videos.length ? `${videos.length.toLocaleString("pt-BR")} vídeos em ordem. Pode dar o play!` : "Seu Assistir mais tarde está vazio.",
        detail: unknown ? `${unknown} vídeo(s) sem duração ficaram no fim. A ordem foi salva no YouTube.` : "Ordem salva no YouTube. O próximo vídeo segue a duração escolhida." });
      try { await chrome.storage.local.set({ lastOrder: order, secondsPerMove, secondsPerBatch }); } catch { /* extension may have been reloaded */ }
    } catch (error) {
      if (isWatchLater() && isLoggedIn() && job === activeJob) {
        update({ busy: false, phase: error.name === "AbortError" ? "cancelled" : "error",
          message: error.name === "AbortError" ? "Organização interrompida." : "Não consegui concluir a organização.",
          detail: error.name === "AbortError" ? "Os movimentos já salvos no YouTube foram mantidos. Clique em uma ordem para continuar." : error.message });
        if (error.name !== "AbortError") globalThis.TubeOrderRowActions?.notify(error.message, true);
      }
    } finally {
      window.removeEventListener("resize", refreshVideoRect);
      playerResizeObserver?.disconnect();
      if (job === activeJob) job = null;
      if (isWatchLater() && !navigating) scrollTo({ left: oldScroll.x, top: oldScroll.y, behavior: "instant" });
      if (isWatchLater() && !navigating) checkOrder();
      if (isWatchLater() && !navigating) rememberEntries(false);
      watchList(isWatchLater() && isPlayer() && !navigating ? list : null);
      if (additionsPending) {
        additionsPending = false;
        if (!activeJob.cancelled) queueAdditionSort();
      }
      originals.clear();
      anonymous = new WeakMap();
      nextIndex = 0;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type?.startsWith("TUBEORDER_")) return;
    reconcile();
    if (message.type === "TUBEORDER_SORT") startSort(message.order);
    if (message.type === "TUBEORDER_CANCEL") cancel();
    sendResponse({ ok: true, status: { ...status } });
  });

  document.addEventListener("yt-navigate-start", () => {
    if (job) cancel();
    navigating = true;
    reconcile();
  });
  document.addEventListener("yt-navigate-finish", () => {
    navigating = false;
    reconcile();
  });
  document.addEventListener("yt-page-data-updated", () => {
    if (!navigating && isWatchLater()) scheduleRefresh();
  });
  window.addEventListener("popstate", scheduleRefresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.removeWatched) {
      cleanupEnabled = changes.removeWatched.newValue !== false;
      cleanupSettingsReady = true;
      sendCleanupSettings();
    }
    if (area === "local" && !job && ["asc", "desc"].includes(changes.lastOrder?.newValue)) {
      preferredOrder = changes.lastOrder.newValue;
      if (isWatchLater() && !navigating) scheduleRefresh();
    }
  });
  chrome.storage.local.get(["lastOrder", "secondsPerMove", "secondsPerBatch", "removeWatched"]).then((saved) => {
    cleanupEnabled = saved.removeWatched !== false;
    cleanupSettingsReady = true;
    sendCleanupSettings();
    if (["asc", "desc"].includes(saved.lastOrder) && !job) preferredOrder = saved.lastOrder;
    if (Number.isFinite(saved.secondsPerMove) && saved.secondsPerMove > 0) secondsPerMove = Math.max(0.05, Math.min(15, saved.secondsPerMove));
    if (Number.isFinite(saved.secondsPerBatch) && saved.secondsPerBatch > 0) secondsPerBatch = Math.max(0.05, Math.min(20, saved.secondsPerBatch));
    preferencesReady = true;
    if (!job) scheduleRefresh();
  }).catch(() => { preferencesReady = true; scheduleRefresh(); });
  reconcile();
})();

(function () {
  "use strict";
  if (globalThis.TubeOrderRemoved) return;
  const PREFIX = "removed:", PAGE_SIZE = 50;
  let binding = null, open = false, pane = null, heading = null, summary = null, style = null;
  let hidden = [], movedNotice = null, account = null, entries = [], shown = PAGE_SIZE, sequence = 0;
  const requests = new Map(), pending = new Map();
  const notify = (message, error = false) => globalThis.TubeOrderRowActions?.notify(message, error);
  const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text) element.textContent = text; return element; };
  const rpc = message => chrome.runtime.sendMessage(message);

  window.addEventListener("tubeorder:removed-record", event => {
    const data = event.detail;
    if (!data || !/^[a-f\d]{64}$/.test(data.accountKey) || !Array.isArray(data.entries)) return;
    void rpc({ type: "TUBEORDER_REMOVED_RECORD", ...data }).then(reply => {
      if (!reply?.ok) notify("Não consegui guardar esta remoção no histórico local.", true);
    }).catch(() => {});
  });
  window.addEventListener("tubeorder:history-context", event => {
    const current = requests.get(event.detail?.requestId);
    if (!current) return;
    clearTimeout(current.timer); requests.delete(event.detail.requestId); current.resolve(event.detail.accountKey);
  });
  function identify() {
    return new Promise(resolve => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { requests.delete(requestId); resolve(null); }, 4000);
      requests.set(requestId, { resolve, timer });
      window.dispatchEvent(new CustomEvent("tubeorder:history-context-request", { detail: { requestId } }));
    });
  }
  function ensureStyle() {
    if (style?.isConnected) return;
    style = node("style", null, `
      .tubeorder-removed-hidden { display:none!important; }
      .tubeorder-removed-heading { margin:0 0 4px!important;color:var(--yt-spec-text-primary,#f1f1f1);font:700 18px/24px Roboto,Arial,sans-serif; }
      .tubeorder-removed-summary { margin:0 0 4px;color:var(--yt-spec-text-secondary,#aaa);font:12px/18px Roboto,Arial,sans-serif; }
      #tubeorder-removed-list { overflow-y:auto;overscroll-behavior:contain;min-height:0;max-height:72vh;box-sizing:border-box;flex:1;color:var(--yt-spec-text-primary,#f1f1f1);background:var(--yt-spec-base-background,#0f0f0f);font:12px/1.4 Roboto,Arial,sans-serif; }
      #tubeorder-removed-list .removed-row { display:flex;align-items:flex-start;gap:8px;padding:8px 12px;box-sizing:border-box; }
      #tubeorder-removed-list .removed-row:hover { background:var(--yt-spec-badge-chip-background,#ffffff14); }
      #tubeorder-removed-list .removed-thumb { position:relative;display:block;width:100px;aspect-ratio:16/9;flex:none;border-radius:8px;overflow:hidden;background:#222; }
      #tubeorder-removed-list img { width:100%;height:100%;object-fit:cover;display:block; }
      #tubeorder-removed-list .removed-duration { position:absolute;right:3px;bottom:3px;padding:0 3px;border-radius:3px;background:#000c;color:white;font-size:11px;font-weight:600; }
      #tubeorder-removed-list .removed-copy { min-width:0;flex:1; }
      #tubeorder-removed-list .removed-title { color:inherit;text-decoration:none;font-size:14px;line-height:18px;font-weight:600;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden; }
      #tubeorder-removed-list .removed-byline { display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:3px;color:var(--yt-spec-text-secondary,#aaa); }
      #tubeorder-removed-list button { flex:none;border:1px solid #c5aaff40;border-radius:14px;padding:3px 10px;min-height:24px;background:#c5aaff12;color:#dfcffb;cursor:pointer;font:600 11px/1.4 Roboto,Arial,sans-serif; }
      #tubeorder-removed-list button:hover:not(:disabled) { background:#c5aaff2c; }
      #tubeorder-removed-list button:focus-visible { outline:2px solid #c5aaff;outline-offset:2px; }
      #tubeorder-removed-list button:disabled { opacity:.6;cursor:wait; }
      #tubeorder-removed-list .removed-empty { padding:32px 20px;margin:0;color:var(--yt-spec-text-secondary,#aaa);text-align:center;line-height:1.6; }
      #tubeorder-removed-list .removed-more { display:block;margin:14px auto; }
    `);
    document.documentElement.append(style);
  }
  function suspend() {
    for (const element of hidden) element.classList.remove("tubeorder-removed-hidden");
    hidden = [];
    if (movedNotice) {
      if (movedNotice.node.isConnected && movedNotice.marker.isConnected) movedNotice.marker.before(movedNotice.node);
      movedNotice.marker.remove(); movedNotice = null;
    }
    pane?.remove(); heading?.remove(); summary?.remove(); pane = heading = summary = null;
    binding?.renderer?.classList.remove("tubeorder-history-open");
  }
  function hide(element) { if (element) { element.classList.add("tubeorder-removed-hidden"); hidden.push(element); } }
  function show() {
    if (!open || !binding?.list?.isConnected || pane?.isConnected) return;
    ensureStyle();
    const renderer = binding.renderer, list = binding.list;
    const title = renderer.querySelector("#header-description h3, #header-contents h3, h3, #title") || document.querySelector("ytd-playlist-header-renderer h1, ytd-playlist-sidebar-primary-info-renderer #title");
    const publisher = renderer.querySelector("#publisher-container");
    if (publisher && binding.noticeHost && publisher.contains(binding.noticeHost)) {
      const marker = document.createComment("TubeOrder controls"); binding.noticeHost.before(marker);
      movedNotice = { marker, node: binding.noticeHost }; publisher.after(binding.noticeHost);
    }
    heading = node("h3", "tubeorder-removed-heading", "Removidos"); heading.id = "tubeorder-removed-title";
    summary = node("div", "tubeorder-removed-summary", "Carregando…");
    if (title) { title.before(heading, summary); hide(title); }
    else (renderer.querySelector("#header-contents") || renderer).prepend(heading, summary);
    hide(publisher); hide(renderer.querySelector("#playlist-actions"));
    const height = list.clientHeight || Math.min(innerHeight * .65, 500);
    pane = node("div"); pane.id = "tubeorder-removed-list"; pane.setAttribute("role", "list"); pane.setAttribute("aria-label", "Vídeos removidos recentemente"); pane.style.height = height + "px";
    list.before(pane); hide(list); renderer.classList.add("tubeorder-history-open");
    render(); void load();
  }
  function render(message) {
    if (!pane?.isConnected) return;
    pane.replaceChildren();
    if (summary) summary.textContent = `${entries.length} removido${entries.length === 1 ? "" : "s"} · neste navegador`;
    if (message || !entries.length) { pane.append(node("p", "removed-empty", message || "Nenhum vídeo removido por aqui ainda. As próximas remoções registradas aparecerão nesta lista.")); return; }
    for (const entry of entries.slice(0, shown)) {
      const row = node("div", "removed-row"); row.setAttribute("role", "listitem"); row.dataset.removedId = entry.id;
      row.title = `Removido em ${new Date(entry.removedAt).toLocaleString("pt-BR")}`;
      const url = `https://www.youtube.com/watch?v=${entry.videoId}`;
      const thumb = node("a", "removed-thumb"); thumb.href = url; thumb.title = entry.title; thumb.setAttribute("aria-label", `Assistir ${entry.title}`);
      const img = node("img"); img.src = entry.thumbnail; img.alt = ""; img.loading = "lazy"; thumb.append(img);
      img.addEventListener("error", () => { const fallback = `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`; if (img.src !== fallback) img.src = fallback; }, { once: true });
      if (entry.duration) thumb.append(node("span", "removed-duration", entry.duration));
      const copy = node("div", "removed-copy"), title = node("a", "removed-title", entry.title); title.href = url; title.title = entry.title;
      const byline = node("div", "removed-byline"); byline.append(node("span", null, entry.channel || "Canal indisponível"));
      const button = node("button", null, "Restaurar"); button.type = "button"; button.title = "Devolver ao Assistir mais tarde"; button.setAttribute("aria-label", `Restaurar ${entry.title}`);
      button.disabled = [...pending.values()].some(item => item.entry.id === entry.id); if (button.disabled) button.textContent = "Restaurando…";
      button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); if (event.isTrusted) void restore(entry, button); });
      byline.append(button); copy.append(title, byline); row.append(thumb, copy); pane.append(row);
    }
    if (entries.length > shown) { const more = node("button", "removed-more", "Mostrar mais"); more.type = "button"; more.title = "Mostrar mais vídeos removidos"; more.addEventListener("click", () => { shown += PAGE_SIZE; render(); }); pane.append(more); }
  }
  async function load() {
    if (!open || !binding) return;
    const current = ++sequence;
    try {
      const nextAccount = await identify();
      if (current !== sequence || !open) return;
      if (!nextAccount) { entries = []; render("Não consegui identificar sua conta. Atualize a aba do YouTube para consultar os removidos."); return; }
      if (account && account !== nextAccount) { entries = []; render("Carregando…"); }
      account = nextAccount;
      const presentIds = [...binding.list.children].flatMap(row => { try { const id = new URL(row.querySelector("a[href*='watch?']")?.getAttribute("href"), location.origin).searchParams.get("v"); return id ? [id] : []; } catch { return []; } });
      const result = await rpc({ type: "TUBEORDER_REMOVED_LIST", accountKey: account, complete: binding.complete, presentIds });
      if (current !== sequence || !open) return;
      if (!result?.ok) throw new Error(result?.error || "Não consegui carregar os vídeos removidos.");
      entries = result.entries; render();
    } catch (error) { if (current === sequence && open) render(error.message || "Atualize a aba para consultar os removidos."); }
  }
  async function restore(entry, button) {
    if (button.disabled || !account || document.getElementById("tubeorder-lock")) return;
    if (!binding?.complete) { notify("Aguarde a lista terminar de carregar antes de restaurar.", true); return; }
    try { if (!chrome.runtime.id) throw new Error(); } catch { notify("A extensão foi atualizada. Recarregue esta aba para restaurar.", true); return; }
    button.disabled = true; button.textContent = "Restaurando…";
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => finish({ requestId, type: "error", message: "O YouTube demorou para confirmar. O vídeo continua em Removidos." }), 25000);
    pending.set(requestId, { entry, account, timer, button });
    window.dispatchEvent(new CustomEvent("tubeorder:restore-request", { detail: { requestId, videoId: entry.videoId, accountKey: account, contextUrl: location.href } }));
  }
  async function finish(result) {
    const current = pending.get(result?.requestId);
    if (!current) return;
    clearTimeout(current.timer); pending.delete(result.requestId);
    current.button.disabled = false; current.button.textContent = "Restaurar";
    if (result.type === "done" && result.alreadySaved && result.queueConfirmed) {
      notify("O vídeo já aparece no Assistir mais tarde desta aba. O registro foi mantido; recarregue a aba se precisar conferir.");
      return;
    }
    if (result.type !== "done" || !(result.serverConfirmed || result.alreadySaved && result.queueConfirmed)) { notify(result.message || "Não consegui confirmar a restauração. O vídeo continua em Removidos.", true); return; }
    try {
      const reply = await rpc({ type: "TUBEORDER_REMOVED_RESTORED", accountKey: current.account, entryId: current.entry.id });
      if (!reply?.ok) throw new Error();
      if (account === current.account) entries = entries.filter(entry => entry.id !== current.entry.id);
      render(); notify(result.alreadySaved ? "O vídeo já está no Assistir mais tarde." : "Vídeo restaurado no Assistir mais tarde.");
    } catch { notify("Vídeo restaurado no YouTube. Não consegui atualizar o histórico local; reabra Removidos.", true); }
  }
  window.addEventListener("tubeorder:restore-result", event => { void finish(event.detail); });
  chrome.storage.onChanged.addListener((changes, area) => { if (open && area === "local" && account && changes[PREFIX + account]) void load(); });
  globalThis.TubeOrderRemoved = Object.freeze({
    isOpen: () => open,
    sync(next) {
      if (binding && (binding.renderer !== next.renderer || binding.list !== next.list || binding.noticeHost !== next.noticeHost)) suspend();
      binding = next; if (open) show();
    },
    toggle() { if (!binding) return; open = !open; if (open) { shown = PAGE_SIZE; show(); } else { sequence++; suspend(); entries = []; account = null; window.dispatchEvent(new CustomEvent("tubeorder:removed-closed")); } binding?.onChange?.(); },
    close() { if (open) { open = false; sequence++; suspend(); entries = []; account = null; binding?.onChange?.(); } },
    suspend,
    destroy() { open = false; sequence++; suspend(); entries = []; account = null; binding = null; style?.remove(); style = null; }
  });
})();

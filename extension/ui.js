(() => {
  "use strict";

  const styles = `
    :host { display:block; color-scheme:dark; font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#f5f2ff; font-size:14px; line-height:1.5; }
    * { box-sizing:border-box; }
    button { font:inherit; }
    .panel { position:relative; overflow:hidden; padding:24px; border:1px solid #ffffff16; border-radius:22px; background:radial-gradient(ellipse at 0 0,#ad91ff15,transparent 65%),#19181f; box-shadow:0 12px 36px #0000001c; }
    .header { display:flex; align-items:center; gap:11px; margin-bottom:20px; }
    .mark { display:grid; place-items:center; width:42px; height:42px; border-radius:13px; color:#231a3c; background:linear-gradient(140deg,#ddd0ff,#ad8af7); flex:none; }
    .mark svg { width:27px; height:27px; }
    .brand { font-size:19px; font-weight:750; letter-spacing:-.7px; line-height:1.2; }
    .tagline { margin:3px 0 0; color:#aaa5b7; font-size:12px; }
    .badge { margin-left:auto; display:flex; align-items:center; gap:5px; padding:4px 8px; border-radius:20px; background:#b9a0ff10; color:#c9b4ff; font-size:11px; font-weight:600; white-space:nowrap; }
    .badge::before { content:""; width:5px; height:5px; border-radius:50%; background:currentColor; }
    h2 { margin:0 0 4px; font-size:20px; font-weight:680; letter-spacing:-.6px; line-height:1.3; }
    .intro { margin:0 0 18px; color:#aaa5b7; font-size:13px; }
    .actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .sort { display:flex; align-items:center; justify-content:flex-start; text-align:left; gap:12px; cursor:pointer; padding:16px; min-height:76px; border:1px solid #ffffff13; border-radius:14px; background:#ffffff05; color:#f2edff; transition:background .15s,border-color .15s,transform .15s; }
    .sort:hover:not(:disabled) { background:#b7a0f51c; border-color:#bfa4ff70; transform:translateY(-1px); }
    .sort[aria-pressed="true"] { background:#bca2ff19; border-color:#bda1ff; }
    .sort:focus-visible,.cancel:focus-visible { outline:3px solid #ddccff; outline-offset:3px; }
    .sort:disabled { cursor:default; opacity:.4; }
    .sort svg { width:25px; height:25px; flex:none; color:#c9b1ff; }
    .sort strong { display:block; font-size:13px; font-weight:650; line-height:1.4; }
    .sort small { display:block; color:#a8a2b5; font-size:11px; margin-top:2px; }
    .status { margin-top:18px; padding:13px 14px; background:#0000001c; border:1px solid #ffffff08; border-radius:12px; }
    .status-row { display:flex; align-items:center; gap:9px; }
    .status-icon { display:grid; place-items:center; color:#baa3ef; width:17px; height:17px; flex:none; }
    .status-icon svg { width:17px; height:17px; }
    .message { margin:0; font-size:12px; font-weight:550; color:#d9d3e5; }
    .detail { margin:3px 0 0 26px; font-size:11px; color:#9c96aa; }
    .detail:empty { display:none; }
    .track { height:4px; margin-top:12px; border-radius:6px; background:#ffffff0a; overflow:hidden; }
    .track[hidden] { display:none; }
    .bar { height:100%; width:0; border-radius:6px; background:#b89af8; transition:width .25s; }
    .track.indeterminate .bar { width:36%!important; animation:slide 1.4s ease-in-out infinite; }
    .cancel { display:block; margin:12px auto 0; background:none; color:#c5b7df; border:0; text-decoration:underline; text-underline-offset:3px; cursor:pointer; font-size:12px; }
    .cancel[hidden] { display:none; }
    .note { display:flex; align-items:flex-start; gap:7px; margin:15px 0 0; color:#9890a7; font-size:11px; }
    .note svg { width:13px; height:13px; flex:none; margin-top:2px; color:#a994c9; }
    .panel[data-phase="done"] .status-icon { color:#a8dcb6; }
    .panel[data-phase="error"] .status-icon { color:#ffb4a7; }
    .panel[data-busy="true"] .status-icon { animation:spin 1.3s linear infinite; }
    .popup .panel { border:none; border-radius:0; padding:23px; box-shadow:none; }
    .popup .actions { grid-template-columns:1fr; }
    .popup .sort { min-height:70px; }
    .popup h2 { font-size:22px; }
    @keyframes slide { 0% { transform:translateX(-110%); } 100% { transform:translateX(390%); } }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media(max-width:480px) { .actions { grid-template-columns:1fr; } .panel { padding:19px; } .sort { min-height:66px; padding:13px; } }
    @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }
  `;

  const icon = `<svg viewBox="20 24 90 80" fill="none" aria-hidden="true"><path d="M30 39a4 4 0 0 1 6-3.46l35 25a4.25 4.25 0 0 1 0 6.92l-35 25A4 4 0 0 1 30 89Z" fill="currentColor"/><rect x="78" y="35" width="25" height="9" rx="4.5" fill="#fff"/><rect x="78" y="59.5" width="19" height="9" rx="4.5" fill="#fff"/><rect x="78" y="84" width="13" height="9" rx="4.5" fill="#fff"/></svg>`;
  const shortIcon = `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 7h7M4 14h12M4 21h18M22 5v10m-3-3 3 3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const longIcon = `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 7h18M4 14h12M4 21h7M22 15v10m-3-3 3 3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const idleIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4l2.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const busyIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6" opacity=".25"/><path d="M10 3a7 7 0 0 1 7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const doneIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6"/><path d="m6.5 10 2.3 2.5 4.7-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function mount(host, handlers = {}, options = {}) {
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${styles}</style><div class="${options.popup ? "popup" : "inline"}"><section class="panel" aria-label="TubeOrder: organizar por duração" data-phase="idle" data-busy="false"><header class="header"><div class="mark">${icon}</div><div><div class="brand">TubeOrder</div><p class="tagline">Seu tempo, na ordem certa.</p></div><span class="badge">Assistir mais tarde</span></header><h2>O que você quer ver primeiro?</h2><p class="intro">Escolha uma ordem. A gente organiza a lista inteira.</p><div class="actions"><button class="sort" data-order="asc" type="button" aria-pressed="false" disabled>${shortIcon}<span><strong>Mais curtos primeiro</strong><small>Do menor para o maior</small></span></button><button class="sort" data-order="desc" type="button" aria-pressed="false" disabled>${longIcon}<span><strong>Mais longos primeiro</strong><small>Do maior para o menor</small></span></button></div><div class="status" role="status" aria-live="polite" aria-atomic="true"><div class="status-row"><span class="status-icon">${idleIcon}</span><p class="message">Conectando ao YouTube…</p></div><p class="detail"></p><div class="track" role="progressbar" aria-label="Progresso da organização" aria-valuemin="0" aria-valuemax="100" hidden><div class="bar"></div></div></div><button class="cancel" type="button" hidden>Parar organização</button><p class="note"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>A ordem fica salva no YouTube. A reprodução automática segue essa sequência.</span></p></section></div>`;
    const panel = shadow.querySelector(".panel");
    const buttons = [...shadow.querySelectorAll(".sort")];
    const cancel = shadow.querySelector(".cancel");
    const message = shadow.querySelector(".message");
    const detail = shadow.querySelector(".detail");
    const statusIcon = shadow.querySelector(".status-icon");
    const track = shadow.querySelector(".track");
    const bar = shadow.querySelector(".bar");
    let destroyed = false;
    for (const button of buttons) button.addEventListener("click", () => handlers.onSort?.(button.dataset.order));
    cancel.addEventListener("click", () => handlers.onCancel?.());

    return {
      update(status = {}) {
        if (destroyed) return;
        const busy = Boolean(status.busy);
        panel.dataset.phase = status.phase || "idle";
        panel.dataset.busy = String(busy);
        for (const button of buttons) {
          button.disabled = !status.available || busy;
          button.setAttribute("aria-pressed", String(status.order === button.dataset.order && status.phase === "done"));
        }
        message.textContent = status.message || (status.available ? "Pronto para organizar seus vídeos." : "Abra o Assistir mais tarde com sua conta logada.");
        detail.textContent = status.detail || "";
        cancel.hidden = !busy;
        statusIcon.innerHTML = busy ? busyIcon : status.phase === "done" ? doneIcon : idleIcon;
        const denominator = status.phase === "sorting" ? status.moves : status.total;
        const numerator = status.phase === "sorting" ? status.moved : status.count;
        const determined = Number.isFinite(denominator) && denominator > 0;
        const progress = determined ? Math.min(100, Math.max(0, (Number(numerator) || 0) / denominator * 100)) : 0;
        track.hidden = !busy;
        track.classList.toggle("indeterminate", !determined);
        if (determined) track.setAttribute("aria-valuenow", String(Math.round(progress)));
        else track.removeAttribute("aria-valuenow");
        bar.style.width = `${progress}%`;
      },
      destroy() {
        destroyed = true;
        shadow.replaceChildren();
      }
    };
  }

  function mountBusy(host, handlers = {}) {
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const previousFocus = document.activeElement;
    const previousPointerEvents = host.style.getPropertyValue("--tubeorder-pointer-events");
    const previousPointerPriority = host.style.getPropertyPriority("--tubeorder-pointer-events");
    shadow.innerHTML = `<style>
      :host { position:fixed!important; inset:0!important; z-index:2147483647!important; display:block!important; pointer-events:var(--tubeorder-pointer-events,auto)!important; color-scheme:dark; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#f5f2ff; }
      * { box-sizing:border-box; }
      .shield { position:fixed; inset:0; display:grid; place-items:center; padding:20px; background:#0e0b16; pointer-events:auto; overscroll-behavior:contain; touch-action:none; }
      .shield.has-video { background:transparent; pointer-events:none; }
      .video-window { position:fixed; z-index:0; pointer-events:none; background:transparent; box-shadow:0 0 0 100vmax #0e0b16; }
      .video-window[hidden] { display:none; }
      .blocker { position:fixed; z-index:0; pointer-events:auto; }
      .blocker[hidden] { display:none; }
      .card { position:relative; z-index:1; pointer-events:auto; width:min(350px,100%); max-height:calc(100vh - 40px); overflow:auto; padding:25px; border:1px solid #ffffff1a; border-radius:20px; background:radial-gradient(ellipse at 0 0,#ad91ff18,transparent 70%),#19181f; box-shadow:0 24px 100px #0008; }
      .brand { display:flex; align-items:center; gap:9px; margin-bottom:19px; font-size:14px; font-weight:700; letter-spacing:-.3px; }
      .mark { display:grid; place-items:center; flex:none; width:30px; height:30px; border-radius:9px; color:#231a3c; background:linear-gradient(140deg,#ddd0ff,#ad8af7); }
      .mark svg { width:23px; height:23px; }
      .message { margin:0; font-size:17px; line-height:1.4; font-weight:650; letter-spacing:-.4px; }
      .detail { margin:7px 0 0; min-height:32px; font-size:12px; line-height:1.5; color:#aaa2ba; overflow-wrap:anywhere; }
      .detail:empty { display:none; }
      .eta { margin:9px 0 0; font-size:11px; line-height:1.5; color:#cab6ed; }
      .track { height:5px; margin:17px 0 0; border-radius:6px; background:#ffffff10; overflow:hidden; }
      .bar { height:100%; width:0; border-radius:6px; background:#bea1ff; transition:width .2s; }
      .track.indeterminate .bar { width:35%!important; animation:travel 1.3s ease-in-out infinite; }
      .notice { margin:14px 0 18px; color:#a59ab7; font-size:11px; line-height:1.5; }
      .cancel { width:100%; min-height:39px; border:1px solid #d0baff42; border-radius:11px; background:#bea1ff10; color:#e0ceff; font:600 12px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; cursor:pointer; }
      .cancel:hover { background:#bea1ff24; }
      .cancel:focus-visible { outline:2px solid #ddccff; outline-offset:3px; }
      @keyframes travel { from { transform:translateX(-110%); } to { transform:translateX(390%); } }
      @media(prefers-reduced-motion:reduce) { * { animation:none!important; transition:none!important; } }
    </style><div class="shield"><div class="video-window" aria-hidden="true" hidden></div><div class="blocker" data-side="top" aria-hidden="true" hidden></div><div class="blocker" data-side="bottom" aria-hidden="true" hidden></div><div class="blocker" data-side="left" aria-hidden="true" hidden></div><div class="blocker" data-side="right" aria-hidden="true" hidden></div><section class="card" role="dialog" aria-modal="true" aria-label="Organizando o Assistir mais tarde"><div class="brand"><span class="mark">${icon}</span>TubeOrder</div><div role="status" aria-live="polite" aria-atomic="true"><p class="message">Aguarde enquanto o TubeOrder organiza seus vídeos</p><p class="detail"></p><p class="eta">Calculando o tempo estimado…</p></div><div class="track indeterminate" role="progressbar" aria-label="Progresso da organização" aria-valuemin="0" aria-valuemax="100"><div class="bar"></div></div><p class="notice">A ordem será salva na sua playlist do YouTube.</p><button class="cancel" type="button">Parar organização</button></section></div>`;
    const cancel = shadow.querySelector(".cancel");
    const message = shadow.querySelector(".message");
    const detail = shadow.querySelector(".detail");
    const eta = shadow.querySelector(".eta");
    const track = shadow.querySelector(".track");
    const bar = shadow.querySelector(".bar");
    const shield = shadow.querySelector(".shield");
    const card = shadow.querySelector(".card");
    const videoWindow = shadow.querySelector(".video-window");
    const blockers = [...shadow.querySelectorAll(".blocker")];
    let watchMode = false;
    let destroyed = false;
    const blockPointer = event => event.stopPropagation();
    const preventScroll = event => { event.preventDefault(); event.stopPropagation(); };
    const trapKeyboard = event => {
      if (!event.isTrusted || event.metaKey || event.ctrlKey || event.altKey) return;
      const playerKey = /^(?:[0-9]|[kmftjlc]| |<|>|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/i.test(event.key);
      if (watchMode && playerKey && !event.composedPath().includes(card) && !card.contains(shadow.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        handlers.onCancel?.();
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel.focus({ preventScroll: true });
      } else if (!(shadow.activeElement === cancel && ["Enter", " "].includes(event.key))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    host.addEventListener("wheel", preventScroll, { passive: false });
    host.addEventListener("touchmove", preventScroll, { passive: false });
    host.addEventListener("click", blockPointer);
    host.addEventListener("pointerdown", blockPointer);
    document.addEventListener("keydown", trapKeyboard, true);
    cancel.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onCancel?.();
    });
    cancel.focus({ preventScroll: true });

    return {
      update(status = {}) {
        if (destroyed) return;
        detail.textContent = status.detail || "";
        const rect = status.mediaRect;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const hasRect = rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
        const left = hasRect ? Math.max(0, rect.left) : 0;
        const top = hasRect ? Math.max(0, rect.top) : 0;
        const right = hasRect ? Math.min(viewportWidth, rect.left + rect.width) : 0;
        const bottom = hasRect ? Math.min(viewportHeight, rect.top + rect.height) : 0;
        const showVideo = hasRect && right > left && bottom > top;
        videoWindow.hidden = !showVideo;
        shield.classList.toggle("has-video", Boolean(showVideo));
        host.style.setProperty("--tubeorder-pointer-events", showVideo ? "none" : "auto");
        for (const blocker of blockers) blocker.hidden = !showVideo;
        if (showVideo) {
          videoWindow.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;`;
          const zones = {
            top: { left: 0, top: 0, width: viewportWidth, height: top },
            bottom: { left: 0, top: bottom, width: viewportWidth, height: viewportHeight - bottom },
            left: { left: 0, top, width: left, height: bottom - top },
            right: { left: right, top, width: viewportWidth - right, height: bottom - top }
          };
          for (const blocker of blockers) {
            const zone = zones[blocker.dataset.side];
            blocker.style.cssText = `left:${zone.left}px;top:${zone.top}px;width:${zone.width}px;height:${zone.height}px;`;
          }
          card.style.position = "fixed";
          card.style.right = "20px";
          card.style.width = "min(350px, calc(100vw - 40px))";
          if (viewportWidth - right >= 370) {
            const cardTop = Math.max(20, Math.min(top, viewportHeight - 340));
            card.style.top = `${cardTop}px`;
            card.style.bottom = "auto";
            card.style.maxHeight = `${Math.max(100, viewportHeight - cardTop - 20)}px`;
          } else {
            card.style.top = "auto";
            card.style.bottom = "20px";
            card.style.maxHeight = "calc(100vh - 40px)";
          }
        } else {
          videoWindow.removeAttribute("style");
          card.removeAttribute("style");
        }
        if (showVideo && !watchMode) {
          cancel.blur();
          if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
        }
        watchMode = Boolean(showVideo);
        if (Number.isFinite(status.etaSeconds) && status.etaSeconds >= 0) {
          const seconds = Math.ceil(status.etaSeconds);
          const minutes = Math.floor(seconds / 60);
          const remainder = seconds % 60;
          const duration = minutes ? `${minutes} min${remainder ? ` ${remainder} s` : ""}` : `${seconds} s`;
          eta.textContent = seconds === 0 ? "Finalizando…" : `Tempo estimado restante: cerca de ${duration}`;
        } else {
          eta.textContent = "Calculando o tempo estimado…";
        }
        const denominator = status.phase === "sorting" ? status.moves : status.total;
        const numerator = status.phase === "sorting" ? status.moved : status.count;
        const determined = Number.isFinite(denominator) && denominator > 0;
        const progress = determined ? Math.min(100, Math.max(0, (Number(numerator) || 0) / denominator * 100)) : 0;
        track.classList.toggle("indeterminate", !determined);
        if (determined) track.setAttribute("aria-valuenow", String(Math.round(progress)));
        else track.removeAttribute("aria-valuenow");
        bar.style.width = `${progress}%`;
      },
      destroy() {
        destroyed = true;
        host.removeEventListener("wheel", preventScroll);
        host.removeEventListener("touchmove", preventScroll);
        host.removeEventListener("click", blockPointer);
        host.removeEventListener("pointerdown", blockPointer);
        document.removeEventListener("keydown", trapKeyboard, true);
        if (previousPointerEvents) host.style.setProperty("--tubeorder-pointer-events", previousPointerEvents, previousPointerPriority);
        else host.style.removeProperty("--tubeorder-pointer-events");
        shadow.replaceChildren();
        if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
      }
    };
  }

  function mountNotice(host, handlers = {}) {
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host { display:inline-block; width:fit-content; max-width:100%; overflow-x:auto; overflow-y:hidden; color-scheme:dark; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      * { box-sizing:border-box; }
      .notice { display:flex; flex-wrap:nowrap; align-items:center; gap:5px; width:max-content; height:32px; white-space:nowrap; padding:3px 5px; border:1px solid #bea1ff32; border-radius:9px; background:#2b213b; color:#c1b5d1; }
      .mini-mark { display:grid; place-items:center; flex:none; width:20px; height:20px; border-radius:5px; background:linear-gradient(140deg,#ddd0ff,#ad8af7); color:#231a3c; }
      .mini-mark svg { width:17px; height:17px; }
      p { flex:none; display:flex; align-items:center; gap:4px; margin:0 0 0 3px; font-size:11px; line-height:1.4; white-space:nowrap; }
      p.organized { color:#a8dcb6; }
      p.disorder { color:#ffb1aa; }
      .status-mark { font-size:13px; font-weight:800; line-height:1; }
      .status-mark[hidden] { display:none; }
      p.organized .status-mark { color:#7cdb9b; }
      p.disorder .status-mark { color:#ff8181; }
      button { flex:none; height:22px; padding:2px 7px; border:1px solid #d9c4ff50; border-radius:5px; background:#c5aaff; color:#251a3b; cursor:pointer; font:600 10.5px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; white-space:nowrap; }
      button:hover:not(:disabled) { background:#ddcaff; border-color:#e8d9ff; }
      button[aria-pressed="true"] { background:#ddcaff; border-color:#f1e8ff; color:#251a3b; }
      button:disabled { opacity:.5; cursor:default; }
      button:focus-visible { outline:2px solid #e4d5ff; outline-offset:3px; }
    </style><aside class="notice" aria-label="Organizar por duração"><span class="mini-mark" title="TubeOrder">${icon}</span><button type="button" data-order="asc" aria-label="Mais curtos primeiro" aria-pressed="false" title="Mais curtos primeiro">Curtos primeiro</button><button type="button" data-order="desc" aria-label="Mais longos primeiro" aria-pressed="false" title="Mais longos primeiro">Longos primeiro</button><p role="status"><span class="status-mark" aria-hidden="true" hidden></span><span class="status-text">Itens carregados em ordem</span></p></aside>`;
    const buttons = [...shadow.querySelectorAll("button")];
    const message = shadow.querySelector(".status-text");
    const statusLine = shadow.querySelector("p");
    const mark = shadow.querySelector(".status-mark");
    let destroyed = false;
    for (const button of buttons) {
      button.addEventListener("click", event => {
        event.stopPropagation();
        handlers.onSort?.(button.dataset.order);
      });
    }
    return {
      update(status = {}) {
        if (destroyed) return;
        const disorder = Boolean(status.disorder);
        for (const button of buttons) {
          button.disabled = Boolean(status.busy) || status.count === 0;
          button.setAttribute("aria-pressed", String(!disorder && status.order === button.dataset.order));
        }
        const empty = status.count === 0;
        const organized = !empty && !disorder && Boolean(status.complete);
        message.textContent = empty ? "Lista vazia" : disorder ? "Vídeos desorganizados" : organized ? "Vídeos organizados" : "Itens carregados em ordem";
        statusLine.classList.toggle("disorder", !empty && disorder);
        statusLine.classList.toggle("organized", organized);
        mark.textContent = organized ? "✓" : !empty && disorder ? "×" : "";
        mark.hidden = !organized && (empty || !disorder);
      },
      destroy() {
        destroyed = true;
        shadow.replaceChildren();
      }
    };
  }

  globalThis.TubeOrderUI = Object.freeze({ mount, mountBusy, mountNotice });
})();

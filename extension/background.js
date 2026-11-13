chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setTitle({ title: "TubeOrder — Organizar o Assistir mais tarde" });
});

// Serialize read/modify/write across tabs. The worker sleeps when no message is pending.
let historyQueue = Promise.resolve();
const HISTORY_PREFIX = "removed:";
const HISTORY_LIMIT = 500;
const validId = value => typeof value === "string" && /^[\w-]{11}$/.test(value);
function historyEntry(value) {
  if (!value || !validId(value.videoId) || typeof value.id !== "string" || !/^[a-f\d-]{36}$/.test(value.id)) return null;
  const text = (value, limit) => typeof value === "string" ? value.slice(0, limit) : "";
  let thumbnail = `https://i.ytimg.com/vi/${value.videoId}/hqdefault.jpg`;
  try { const url = new URL(value.thumbnail); if (url.protocol === "https:" && /^(i\d*\.ytimg\.com)$/.test(url.hostname)) thumbnail = url.href.slice(0, 700); } catch { /* Use YouTube's standard thumbnail. */ }
  return { id: value.id, videoId: value.videoId, title: text(value.title, 500) || `Vídeo ${value.videoId}`,
    channel: text(value.channel, 200), duration: text(value.duration, 24), thumbnail,
    removedAt: Number.isFinite(value.removedAt) ? Math.min(Date.now(), Math.max(0, value.removedAt)) : Date.now(), state: "pending" };
}
async function historyMessage(message) {
  const key = HISTORY_PREFIX + message.accountKey;
  const stored = (await chrome.storage.local.get(key))[key];
  let entries = Array.isArray(stored) ? stored.map(entry => ({ ...entry })) : [];
  if (message.type === "TUBEORDER_REMOVED_RECORD") {
    const batch = Array.isArray(message.entries) ? message.entries.slice(0, 50) : [];
    for (const raw of batch) {
      const entry = historyEntry(raw);
      if (!entry) continue;
      if (message.phase === "pending") entries = [entry, ...entries.filter(item => item.videoId !== entry.videoId)];
      else if (message.phase === "done") {
        const existing = entries.find(item => item.id === entry.id);
        if (existing) existing.state = "removed";
        else if (!entries.some(item => item.videoId === entry.videoId && item.removedAt >= entry.removedAt)) entries = [{ ...entry, state: "removed" }, ...entries.filter(item => item.videoId !== entry.videoId)];
      } else if (message.phase === "failed") entries = entries.filter(item => item.id !== entry.id || item.state === "removed");
    }
  } else if (message.type === "TUBEORDER_REMOVED_RESTORED") {
    entries = entries.filter(item => item.id !== message.entryId);
  } else if (message.type === "TUBEORDER_REMOVED_LIST" && message.complete === true && Array.isArray(message.presentIds)) {
    const present = new Set(message.presentIds.filter(validId));
    // Recover an interrupted tab's staged metadata only after the complete WL list is known.
    entries = entries.filter(item => item.state !== "pending" || !present.has(item.videoId));
    for (const item of entries) if (item.state === "pending") item.state = "removed";
  }
  entries = entries.sort((a, b) => b.removedAt - a.removedAt).slice(0, HISTORY_LIMIT);
  if (JSON.stringify(entries) !== JSON.stringify(stored || [])) await chrome.storage.local.set({ [key]: entries });
  return message.type === "TUBEORDER_REMOVED_LIST" ? { ok: true, entries: entries.filter(item => item.state === "removed") } : { ok: true };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!["TUBEORDER_REMOVED_RECORD", "TUBEORDER_REMOVED_LIST", "TUBEORDER_REMOVED_RESTORED"].includes(message?.type)) return;
  let allowed = false;
  try { const url = new URL(sender.url); allowed = sender.id === chrome.runtime.id && url.origin === "https://www.youtube.com" && ["/watch", "/playlist"].includes(url.pathname) && url.searchParams.get("list") === "WL"; } catch { /* Reject unrelated senders. */ }
  if (!allowed || typeof message.accountKey !== "string" || !/^[a-f\d]{64}$/.test(message.accountKey)) { reply({ ok: false, error: "Não consegui confirmar a conta do YouTube." }); return; }
  const task = historyQueue.then(() => historyMessage(message));
  historyQueue = task.then(() => {}, () => {});
  task.then(reply, () => reply({ ok: false, error: "Não consegui salvar o histórico neste navegador." }));
  return true;
});

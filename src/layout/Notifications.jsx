import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";
import { ago } from "../lib/format";
import { go } from "../lib/router";
import { Button, Icon, Switch, fail, toast } from "../ui/kit";
import { popAnim, usePopover } from "../ui/popover";

const KIND_ICON = { application: "briefcase", offer: "star", job: "zap", campaign: "send", bounce: "alert", error: "alert", queue: "clock", sync: "refresh", info: "bell", reply: "reply" };

/* chime: soft notes made with Web Audio */
let audioCtx;
function chime(strong) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime;
    (strong ? [660, 880, 1175] : [880, 1320]).forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * .12);
      g.gain.exponentialRampToValueAtTime(.18, t + i * .12 + .02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * .12 + .45);
      o.connect(g).connect(audioCtx.destination); o.start(t + i * .12); o.stop(t + i * .12 + .5);
    });
  } catch { /* no audio */ }
}
document.addEventListener("pointerdown", () => { try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* */ } }, { once: true });

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
const b64ToBytes = s => Uint8Array.from(atob((s + "===".slice((s.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export default function Notifications() {
  const { open, setOpen, ref } = usePopover();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [cfg, setCfg] = useState({ prefs: { sound: true, mac: false }, macAvailable: false, pushKey: "" });
  const [settings, setSettings] = useState(false);
  const [popups, setPopups] = useState([]);
  const since = useRef(Date.now() / 1000);
  const soundOn = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/notifications");
      setItems(d.items); setUnread(d.unread);
      setCfg({ prefs: d.prefs, macAvailable: d.mac_available, pushKey: d.push_key });
      soundOn.current = d.prefs.sound;
      if (d.items[0]) since.current = Math.max(since.current, d.items[0].at);
    } catch { /* the live stream retries */ }
  }, []);

  useEffect(() => {
    let es, retry;
    const connect = () => {
      es?.close();
      es = new EventSource(`/api/notifications/stream?since=${since.current}`);
      es.addEventListener("notify", e => {
        const n = JSON.parse(e.data);
        since.current = Math.max(since.current, n.at);
        setItems(list => list.some(x => x.id === n.id) ? list : [n, ...list].slice(0, 40));
        setUnread(n.unread);
        if (soundOn.current) chime(n.kind === "offer");
        if (document.visibilityState === "visible") {
          setPopups(p => [...p, n].slice(-3));
          setTimeout(() => setPopups(p => p.filter(x => x.id !== n.id)), 8000);
        } else if ("Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.ready.then(reg => reg.showNotification(n.title, { body: n.body, tag: n.kind, icon: "/assets/icon-192.png", data: { link: n.link } }))
            .catch(() => new Notification(n.title, { body: n.body }));
        }
        if (["application", "offer", "sync"].includes(n.kind)) emit("apps-changed");
        if (["reply", "offer"].includes(n.kind)) emit("replies-changed");
        if (n.kind === "sync") emit("sync-done");
      });
      es.onerror = () => { if (es.readyState === EventSource.CLOSED) retry = setTimeout(connect, 10000); };
    };
    load().then(connect);
    if (pushSupported()) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    const vis = () => { if (document.visibilityState === "visible" && es?.readyState === EventSource.CLOSED) connect(); };
    document.addEventListener("visibilitychange", vis);
    return () => { es?.close(); clearTimeout(retry); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  useEffect(() => { if (open) { setSettings(false); load(); } }, [open, load]);

  const markRead = async ids => {
    const d = await api("/api/notifications/read", { json: ids ? { ids } : { all: true } }).catch(() => null);
    if (!d) return;
    setItems(list => list.map(n => (!ids || ids.includes(n.id)) ? { ...n, read: true } : n));
    setUnread(d.unread);
  };
  const clear = async () => { await api("/api/notifications/clear", { json: {} }).catch(fail); setItems([]); setUnread(0); };
  const openItem = n => { markRead([n.id]); setOpen(false); go(n.link || "dashboard"); };

  return (
    <div className="pop-wrap" ref={ref}>
      <button className={`top-btn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open}>
        <motion.span key={unread} animate={unread ? { rotate: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: .6 }} style={{ display: "grid" }}><Icon name="bell" /></motion.span>
        <AnimatePresence>{unread > 0 && <motion.span className="bell-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>{unread > 9 ? "9+" : unread}</motion.span>}</AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="popover notif-pop" role="dialog" aria-label="Notifications" {...popAnim}>
            <div className="pop-head"><b>Notifications</b><span className="grow" />
              {unread > 0 && <button className="link-btn" onClick={() => markRead()}>Mark all read</button>}
              <Button variant="ghost" size="sm" icon="settings" className={settings ? "on" : ""} aria-label="Notification settings" onClick={() => setSettings(!settings)} />
            </div>
            <AnimatePresence initial={false}>
              {settings && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                <NotifSettings cfg={cfg} setCfg={c => { setCfg(c); soundOn.current = c.prefs.sound; }} />
              </motion.div>}
            </AnimatePresence>
            <div className="notif-list">
              {items.length ? <>
                <AnimatePresence initial={false}>
                  {items.map(n => (
                    <motion.button layout key={n.id} className={`notif ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                      <span className={`notif-ic k-${n.kind}`}><Icon name={KIND_ICON[n.kind] || "bell"} /></span>
                      <span className="t"><b>{n.title}</b>{n.body && <span>{n.body}</span>}<span className="help">{ago(n.at)}</span></span>
                    </motion.button>
                  ))}
                </AnimatePresence>
                <button className="link-btn notif-clear" onClick={clear}>Clear all</button>
              </> : <div className="notif-empty"><Icon name="bell" /><b>You're all caught up</b><span>Replies, application updates and finished sends show up here.</span></div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="note-toasts">
        <AnimatePresence>
          {popups.map(n => (
            <motion.div key={n.id} layout className="note-toast" role="status" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }} transition={{ type: "spring", stiffness: 400, damping: 32 }}
              onClick={() => { setPopups(p => p.filter(x => x.id !== n.id)); openItem(n); }}>
              <span className={`notif-ic k-${n.kind}`}><Icon name={KIND_ICON[n.kind] || "bell"} /></span>
              <span className="t"><b>{n.title}</b>{n.body && <span>{n.body}</span>}</span>
              <button className="nt-x" aria-label="Dismiss notification" onClick={e => { e.stopPropagation(); setPopups(p => p.filter(x => x.id !== n.id)); }}><Icon name="x" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NotifSettings({ cfg, setCfg }) {
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSub().then(setSub).catch(() => {}); }, []);
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const save = async (k, v) => {
    try { const r = await api("/api/notifications/prefs", { method: "PUT", json: { [k]: v } }); setCfg({ ...cfg, prefs: r.prefs }); if (k === "sound" && v) chime(); }
    catch (e) { fail(e); }
  };
  const togglePush = async on => {
    setBusy(true);
    try {
      if (on) {
        if (!pushSupported()) throw new Error("This browser can't show notifications from websites.");
        if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const s = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.pushKey) });
        await api("/api/notifications/subscribe", { json: { subscription: s.toJSON() } });
        setSub(s); toast("Browser notifications are on");
      } else {
        const s = await currentSub();
        if (s) { await api("/api/notifications/unsubscribe", { json: { endpoint: s.endpoint } }).catch(() => {}); await s.unsubscribe(); }
        setSub(null); toast("Browser notifications are off");
      }
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  return (
    <div className="notif-settings">
      <div className="switch-row"><span className="sr-t"><b>Sound</b><span className="help">Play a chime when something new arrives</span></span><Switch checked={cfg.prefs.sound} onChange={v => save("sound", v)} /></div>
      <div className="switch-row"><span className="sr-t"><b>Browser notifications</b><span className="help">{!pushSupported() ? "Not supported in this browser" : perm === "denied" ? "Blocked. Allow notifications for this site in your browser settings" : "Alerts even when Reachout's tab is closed"}</span></span>
        <Switch checked={!!sub} disabled={busy || !pushSupported() || perm === "denied"} onChange={togglePush} /></div>
      <div className="switch-row"><span className="sr-t"><b>Mac alerts</b><span className="help">{cfg.macAvailable ? "macOS notifications, even with the browser quit" : "Available when Reachout runs on your own Mac"}</span></span>
        <Switch checked={cfg.prefs.mac} disabled={!cfg.macAvailable} onChange={v => save("mac", v)} /></div>
      <div className="ns-actions">
        <Button size="sm" icon="bell" onClick={() => api("/api/notifications/test", { json: {} }).catch(fail)}>Send a test</Button>
        {sub && <Button size="sm" variant="ghost" onClick={() => api("/api/notifications/test", { json: { mode: "push" } }).then(() => toast("Sent. It appears as a system notification.")).catch(fail)}>Test closed-tab alert</Button>}
      </div>
    </div>
  );
}

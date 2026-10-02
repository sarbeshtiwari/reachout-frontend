import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ago } from "../lib/format";
import { useApp } from "../lib/store";
import { Alert, Button, Empty, Icon, Spinner, fail, modal, toast } from "../ui/kit";

export default function WhatsApp() {
  const { me } = useApp();
  if (me?.whatsapp === false) return (
    <div className="card"><Empty icon="phone" title="WhatsApp isn't available here">
      This version of Reachout sends by email only. WhatsApp doesn't allow automated messaging, so it's switched off on this server.</Empty></div>
  );
  return <WhatsAppPage />;
}

function WhatsAppPage() {
  const app = useApp();
  const w = app.wa;
  const [busy, setBusy] = useState("");
  const [qrT, setQrT] = useState(Date.now());
  const polling = useRef(false);
  const pending = ["starting", "qr", "saving"].includes(w.state);
  const hours = w.hours || 2;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const left = w.expires_at ? Math.max(0, new Date(w.expires_at).getTime() - now) : null;
  const leftText = left === null ? "" : left < 60000 ? "less than a minute" : left < 3600000 ? `${Math.ceil(left / 60000)} min` : `${Math.floor(left / 3600000)} h ${Math.round((left % 3600000) / 60000)} min`;
  useEffect(() => { // when it runs out, pick up the new state (the server removes it within a minute)
    if (left === 0) { const t = setTimeout(async () => app.setWa(await api("/api/whatsapp").catch(() => app.wa)), 65000); return () => clearTimeout(t); }
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = async () => {
    if (polling.current) return;
    polling.current = true;
    const was = app.wa.state;
    try {
      for (;;) {
        const s = await api("/api/whatsapp");
        app.setWa(s);
        if (s.state === "qr") setQrT(Math.floor(Date.now() / 4000));
        if (!["starting", "qr", "saving"].includes(s.state)) { if (s.state === "connected" && was !== "connected") toast("WhatsApp linked"); break; }
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) { fail(e); }
    polling.current = false;
  };
  useEffect(() => { poll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const link = async () => { setBusy("link"); try { await api("/api/whatsapp/link", { json: {} }); app.setWa({ state: "starting" }); poll(); } catch (e) { fail(e); } setBusy(""); };
  const cancel = async () => { setBusy("cancel"); await api("/api/whatsapp/cancel", { json: {} }).catch(fail); setBusy(""); };
  const unlink = async () => {
    if (!await modal({ title: "Unlink WhatsApp?", text: "Your saved WhatsApp login will be deleted. You'll need to scan a QR code again before sending.", confirm: "Unlink", danger: true })) return;
    setBusy("unlink");
    try { await api("/api/whatsapp/unlink", { json: {} }); app.setWa(await api("/api/whatsapp")); toast("WhatsApp unlinked"); } catch (e) { fail(e); }
    setBusy("");
  };
  return (
    <div className="wa-grid">
      <div className="card card-pad wa-card">
        <AnimatePresence mode="wait">
          <motion.div key={w.state} initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} transition={{ duration: .2 }} className="wa-state">
            {w.state === "connected" ? <>
              <motion.div className="wa-status on" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}><Icon name="check" /></motion.div>
              <h3>WhatsApp is linked</h3><p>Messages go out from your phone's WhatsApp.{w.linked_at ? ` Linked ${ago(w.linked_at)}.` : ""}</p>
              {leftText && <Alert tone="warn" style={{ margin: "0 auto 16px", maxWidth: 380, textAlign: "left" }}>For your security this login is deleted automatically in <b>{leftText}</b>. You'll get a notification, and can link again anytime.</Alert>}
              <div className="form-actions" style={{ justifyContent: "center" }}><Button icon="refresh" busy={busy === "link"} onClick={link}>Re-link</Button><Button variant="danger" icon="x" busy={busy === "unlink"} onClick={unlink}>Unlink</Button></div>
            </> : pending ? <>
              <div className="qr">{w.state === "qr" ? <motion.img key={qrT} alt="WhatsApp QR code" src={`/api/whatsapp/qr?t=${qrT}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} /> : <Spinner size={28} />}</div>
              <h3>{{ starting: "Starting WhatsApp…", qr: "Scan with your phone", saving: "Linked. Saving securely…" }[w.state]}</h3>
              <p>{{ starting: "This usually takes 5–15 seconds.", qr: "WhatsApp → Settings → Linked devices → Link a device. The code refreshes automatically.", saving: "Encrypting your WhatsApp login. This takes a few seconds." }[w.state]}</p>
              {w.state !== "saving" && <Button busy={busy === "cancel"} onClick={cancel}>Cancel</Button>}
            </> : <>
              <div className="wa-status off"><Icon name="phone" /></div>
              <h3>WhatsApp isn't linked</h3><p>Link it by scanning a QR code with your phone. For your security, the saved login is deleted automatically {hours} hours after linking. Link again whenever you need to send.</p>
              {w.error && <Alert tone="bad" style={{ margin: "0 auto 16px", maxWidth: 380, textAlign: "left" }}>{w.error}</Alert>}
              <Button variant="primary" size="lg" icon="link" busy={busy === "link"} busyLabel="Starting…" onClick={link}>Link WhatsApp</Button>
            </>}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="card card-pad">
        <h3 className="sec-h">How to link</h3>
        <ol className="howto"><li>Click <b>Link WhatsApp</b> and wait for the QR code.</li><li>On your phone open <b>WhatsApp → Settings → Linked devices</b>.</li><li>Tap <b>Link a device</b> and scan the code on this page.</li></ol>
        <Alert tone="warn" style={{ marginTop: 18 }}>WhatsApp doesn't officially allow automated messages. Keep batches small (about 20 a day), only contact relevant people, and use a number you can afford to have restricted.</Alert>
        <p className="help" style={{ marginTop: 14 }}>Your WhatsApp login is stored encrypted and deleted automatically {hours} hours after you link it.</p>
      </div>
    </div>
  );
}

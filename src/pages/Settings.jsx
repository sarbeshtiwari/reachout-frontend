import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LANDING } from "../lib/format";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import { setTheme, themeChoice } from "../lib/theme";
import { Alert, Button, Field, Icon, Seg, applyError, fail, toast } from "../ui/kit";

export default function Settings() {
  const app = useApp();
  const [cc, setCc] = useState(app.data.settings.country_code || "91");
  const [theme, setT] = useState(themeChoice());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const [del, setDel] = useState(null);
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft(l => l - 1), 1000); return () => clearTimeout(t); }, [left]);

  const save = async e => {
    e.preventDefault(); setErrors({});
    const c = cc.replace(/\D/g, "");
    if (c.length < 1 || c.length > 3) return setErrors({ country_code: "Country code must be 1–3 digits, like 91 for India or 1 for the US." });
    setBusy("save");
    try { const s = await api("/api/settings", { json: { country_code: c } }); app.setData(x => ({ ...x, settings: s })); setCc(s.country_code); toast("Settings saved"); }
    catch (err) { applyError(err, setErrors); }
    setBusy("");
  };
  const request = async () => {
    setBusy("req");
    try { const d = await api("/api/account/delete/request", { json: {} }); setDel({ dev: d.dev }); setLeft(d.resend_in || 60); setCode(""); }
    catch (e) { fail(e); }
    setBusy("");
  };
  const confirm = async e => {
    e.preventDefault(); setErrors({});
    if (!/^\d{6}$/.test(code)) return setErrors({ code: "Enter the 6-digit code from the email." });
    setBusy("del");
    try { await api("/api/account/delete", { json: { code } }); location.href = LANDING; } catch (err) { applyError(err, setErrors); setBusy(""); }
  };
  return (
    <div className="settings">
      <motion.form className="card card-pad" onSubmit={save} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h3 className="sec-h"><Icon name="settings" />Preferences</h3>
        <div className="row-2">
          <Field label="Default country code" error={errors.country_code} hint="Added to 10-digit numbers without one. India is 91."><input className="input" inputMode="numeric" maxLength={4} value={cc} onChange={e => setCc(e.target.value.replace(/[^\d+]/g, ""))} /></Field>
          <div className="field"><span className="label">Appearance</span>
            <Seg value={theme} onChange={t => { setT(t); setTheme(t); }} options={[["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Match device", "monitor"]]} /></div>
        </div>
        <div className="form-actions"><span className="grow" /><Button type="submit" variant="primary" busy={busy === "save"} busyLabel="Saving…">Save</Button></div>
      </motion.form>
      <motion.div className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>
        <h3 className="sec-h"><Icon name="shield" />Sign-in</h3>
        <p className="help">You sign in with a one-time code sent to <b>{app.me.email}</b>. There's no password to remember. Your session is kept in a secure, HttpOnly cookie.</p>
      </motion.div>
      <motion.div className="card card-pad danger-zone" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
        <h3 className="sec-h"><Icon name="trash" />Delete account</h3>
        <p className="help" style={{ marginBottom: 14 }}>Permanently deletes your contacts, templates, files, history, applications and WhatsApp link. This can't be undone.</p>
        <AnimatePresence mode="wait">
          {!del ? <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Button variant="danger" icon="trash" busy={busy === "req"} busyLabel="Sending code…" onClick={request}>Delete my account</Button></motion.div>
            : <motion.form key="b" onSubmit={confirm} noValidate initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }}>
              <Alert tone="warn" style={{ marginBottom: 14 }}>We sent a 6-digit code to your email. Enter it to confirm.{del.dev && " (Local mode: the code is printed in the terminal running the app.)"}</Alert>
              <Field label="Confirmation code" error={errors.code} style={{ maxWidth: 260 }}><input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus /></Field>
              <div className="form-actions"><Button onClick={() => setDel(null)}>Cancel</Button><Button variant="ghost" disabled={left > 0} onClick={request}>{left > 0 ? `Resend in ${left}s` : "Resend code"}</Button><span className="grow" />
                <Button type="submit" variant="danger-solid" busy={busy === "del"} busyLabel="Deleting…">Delete forever</Button></div>
            </motion.form>}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

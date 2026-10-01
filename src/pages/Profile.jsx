import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { emailOk, phoneOk } from "../lib/format";
import { useApp } from "../lib/store";
import { Alert, Badge, Button, Field, FormError, Icon, applyError, fail, modal, toast } from "../ui/kit";
import { MailSyncCard } from "../ui/shared";

export default function Profile() {
  const app = useApp();
  const p = app.data.profile;
  const init = () => ({ name: p.name || "", phone: p.phone || "", email: p.email || "", smtp_host: p.smtp_host || "", smtp_port: p.smtp_port || 465, smtp_user: p.smtp_user || "", smtp_password: "" });
  const [v, setV] = useState(init);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { setV(init()); setDirty(false); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setDirty(true); setErrors(x => ({ ...x, [k]: "" })); };

  const validate = () => {
    const d = { ...v, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), smtp_host: v.smtp_host.trim(), smtp_user: v.smtp_user.trim() };
    const e = {};
    if (d.name.length < 2) e.name = "Enter your full name (at least 2 characters).";
    if (!phoneOk(d.phone)) e.phone = "Enter a valid phone number: 8–15 digits.";
    if (!d.email) e.email = "Email is required."; else if (!emailOk(d.email)) e.email = "Enter a valid email address.";
    if (d.smtp_host && !/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(d.smtp_host)) e.smtp_host = "Enter a mail server like smtp.gmail.com.";
    const port = Number(d.smtp_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) e.smtp_port = "Port must be a number from 1 to 65535.";
    if (d.smtp_password && !d.smtp_host) e.smtp_host = "Add the mail server for this password.";
    setErrors(e);
    return Object.keys(e).length ? null : { ...d, smtp_port: port };
  };
  const save = async e => {
    e.preventDefault(); setFormError("");
    const d = validate(); if (!d) return;
    setBusy("save");
    try { const prof = await api("/api/profile", { method: "PUT", json: d }); app.setData(x => ({ ...x, profile: prof })); toast("Profile saved"); }
    catch (err) { applyError(err, setErrors, setFormError); }
    setBusy("");
  };
  const clearPass = async () => {
    if (!await modal({ title: "Remove app password?", text: "You won't be able to send email or sync Gmail until you add one again.", confirm: "Remove", danger: true })) return;
    const d = validate(); if (!d) return;
    try { const prof = await api("/api/profile", { method: "PUT", json: { ...d, smtp_password: "", clear_password: true } }); app.setData(x => ({ ...x, profile: prof })); toast("App password removed"); } catch (err) { fail(err); }
  };
  const test = async () => {
    if (dirty) return toast("Save your changes first, then send a test.", true);
    setBusy("test");
    try { await api("/api/profile/test", { json: {} }); toast(`Test email sent to ${p.email}`); } catch (err) { applyError(err, setErrors, setFormError); }
    setBusy("");
  };
  return (
    <div className="profile">
      <motion.form className="card profile-card" onSubmit={save} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="card-pad">
          <h3 className="sec-h"><Icon name="user" />Your details</h3>
          <div className="row-3">
            <Field label="Full name" error={errors.name}><input className="input" value={v.name} onChange={set("name")} maxLength={80} autoComplete="name" /></Field>
            <Field label="Phone" opt="(optional)" error={errors.phone}><input className="input" value={v.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" /></Field>
            <Field label="Email" error={errors.email}><input className="input" type="email" value={v.email} onChange={set("email")} autoComplete="email" /></Field>
          </div>
          <p className="help" style={{ marginTop: 10 }}>Used in messages as <code>{"{sender_name}"}</code>, <code>{"{sender_phone}"}</code> and <code>{"{sender_email}"}</code>.</p>
        </div>
        <div className="card-pad divider">
          <h3 className="sec-h"><Icon name="mail" />Gmail connection <Badge tone={p.has_password ? "ok" : ""}>{p.has_password ? "Connected" : "Not set up"}</Badge></h3>
          <Alert style={{ marginBottom: 16 }}><b>Gmail:</b> turn on 2-Step Verification, then create an <b>App password</b> at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">myaccount.google.com/apppasswords</a> and paste it below. Server <code>smtp.gmail.com</code>, port <code>465</code>. <b>Outlook:</b> <code>smtp.office365.com</code>, port <code>587</code>.</Alert>
          <div className="row-2">
            <Field label="Mail server" error={errors.smtp_host}><input className="input" value={v.smtp_host} onChange={set("smtp_host")} placeholder="smtp.gmail.com" autoComplete="off" /></Field>
            <Field label="Port" error={errors.smtp_port}><input className="input" type="number" value={v.smtp_port} onChange={set("smtp_port")} placeholder="465" /></Field>
            <Field label="Login" error={errors.smtp_user}><input className="input" value={v.smtp_user} onChange={set("smtp_user")} placeholder="Usually your email" autoComplete="off" /></Field>
            <Field label="App password" error={errors.smtp_password} hint={p.has_password ? "Saved. Leave blank to keep it." : "Needed to send email and sync Gmail."}>
              <input className="input" type="password" value={v.smtp_password} onChange={set("smtp_password")} autoComplete="new-password" /></Field>
          </div>
          <p className="help" style={{ marginTop: 12 }}>Your app password is stored encrypted and is never shown again.</p>
          <FormError>{formError}</FormError>
        </div>
        <div className="card-pad divider form-actions" style={{ margin: 0 }}>
          {p.has_password && <Button variant="ghost" onClick={clearPass}>Remove app password</Button>}
          <span className="grow" />
          <Button icon="mail" disabled={!p.has_password} busy={busy === "test"} busyLabel="Sending…" onClick={test}>Send test email</Button>
          <Button type="submit" variant="primary" busy={busy === "save"} busyLabel="Saving…">Save changes</Button>
        </div>
      </motion.form>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }}><MailSyncCard /></motion.div>
    </div>
  );
}

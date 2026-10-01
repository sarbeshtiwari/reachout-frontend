import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { addDays, ago, emailOk, fmtDate, initials, phoneOk, today } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Badge, Button, Empty, Field, Icon, SkBlock, applyError, fail, modal, toast } from "../ui/kit";
import { EmailBadge, SendBadge } from "../ui/shared";
import { extraCols } from "./Campaign";

const CORE = ["name", "company", "phone", "email"];

export default function Contact({ route }) {
  const app = useApp();
  const id = route.param;
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api("/api/contacts/" + encodeURIComponent(id));
      setD(r); setForm(Object.fromEntries([...CORE, ...extraCols(app.data.recipients)].map(k => [k, r.contact[k] || ""]))); setDirty(false);
      document.title = `${r.contact.name || r.contact.company || r.contact.email || r.contact.phone || "Contact"} · Reachout`;
    } catch (e) { if (e.status === 404) setMissing(true); else { fail(e); go("contacts"); } }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  if (missing) return <div className="card"><Empty icon="users" title="Contact not found" action={<a className="btn btn-sm" href="/app/contacts">Back to contacts</a>}>It may have been deleted.</Empty></div>;
  if (!d) return <div><SkBlock h={110} /><div className="cd-grid" style={{ marginTop: 16 }}><SkBlock h={320} /><SkBlock h={320} /></div></div>;
  const c = d.contact;
  const title = c.name || c.company || c.phone || c.email;

  const patch = async (changes, what) => {
    setBusy(what);
    try {
      const row = await api("/api/recipients/" + id, { method: "PUT", json: changes });
      app.patchRecipient(id, row); await load();
      return row;
    } finally { setBusy(""); }
  };
  const saveForm = async e => {
    e.preventDefault(); setErrors({});
    const v = Object.fromEntries(Object.entries(form).map(([k, x]) => [k, x.trim()]));
    if (!v.phone && !v.email) return setErrors({ phone: "Add a phone number or an email address." });
    if (!phoneOk(v.phone)) return setErrors({ phone: "Enter a valid phone number: 8–15 digits." });
    if (!emailOk(v.email)) return setErrors({ email: "Enter a valid email address." });
    try { await patch(v, "save"); toast("Contact saved"); } catch (err) { applyError(err, setErrors); }
  };
  const setFollow = async value => {
    if (value && value < today() && !await modal({ title: "Date is in the past", text: "Set a follow-up for a date that has already passed?", confirm: "Set anyway" })) return;
    try { await patch({ follow_up: value }, "follow"); toast(value ? `Follow-up set for ${fmtDate(value)}` : "Follow-up cleared"); } catch (err) { fail(err); }
  };
  const addNote = async e => {
    e.preventDefault();
    if (!note.trim()) return setErrors({ note: "Write a note first." });
    setBusy("note");
    try { const ev = await api(`/api/contacts/${id}/notes`, { json: { text: note.trim() } }); setD(x => ({ ...x, events: [ev, ...x.events] })); setNote(""); toast("Note added"); }
    catch (err) { applyError(err, setErrors); }
    setBusy("");
  };
  const delNote = async nid => {
    if (!await modal({ title: "Delete this note?", confirm: "Delete", danger: true })) return;
    try { await api(`/api/contacts/${id}/notes/${nid}`, { method: "DELETE" }); setD(x => ({ ...x, events: x.events.filter(e => e.id !== nid) })); toast("Note deleted"); } catch (err) { fail(err); }
  };
  const del = async () => {
    if (!await modal({ title: `Delete ${c.name || "this contact"}?`, text: "Their notes and follow-ups are deleted too. Message history stays in Activity.", confirm: "Delete", danger: true })) return;
    try { await api("/api/recipients/delete", { json: { ids: [id] } }); app.setData(x => ({ ...x, recipients: x.recipients.filter(r => r.id !== id) })); go("contacts"); toast("Contact deleted"); } catch (err) { fail(err); }
  };
  const send = () => { app.setSelected(new Set([id])); app.setCampaignPreset({ who: "selected", resend: true }); go("campaign"); toast("Campaign set up for this contact only"); };

  const items = [...d.events, ...d.messages.map(m => ({ type: "message", at: m.timestamp, id: m.timestamp + m.to, m }))].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const fu = c.follow_up;
  return (
    <div>
      <a href="/app/contacts" className="btn btn-ghost btn-sm back-link"><Icon name="arrow-left" />All contacts</a>
      <motion.div className="card cd-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <motion.div className="cd-avatar" initial={{ scale: .6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>{initials(c.name || c.company || c.email)}</motion.div>
        <div className="cd-id"><h2>{title}</h2><p>{[c.name && c.company, c.phone, c.email].filter(Boolean).join(" · ")}</p>
          <div className="cd-badges"><span className="lbl">WhatsApp</span><SendBadge status={c.wa_status} ts={c.wa_last} /><span className="lbl">Email</span><EmailBadge r={c} />{c.replied_at && <Badge tone="brand"><Icon name="reply" />Replied {ago(c.replied_at)}</Badge>}</div></div>
        <span className="grow" />
        <div className="cd-actions">
          <Field label="Stage"><select className="select" value={c.stage || "new"} disabled={busy === "stage"} onChange={async e => { try { await patch({ stage: e.target.value }, "stage"); toast(`Stage set to ${app.me.stages[e.target.value]}`); } catch (err) { fail(err); } }}>
            {Object.entries(app.me.stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Button variant="primary" icon="send" disabled={!(c.phone || c.email)} onClick={send}>Send message</Button>
          <Button variant="ghost" className="btn-danger" icon="trash" aria-label="Delete contact" onClick={del} />
        </div>
      </motion.div>
      <div className="cd-grid">
        <div className="col">
          <motion.form className="card card-pad" onSubmit={saveForm} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>
            <h3 className="sec-h">Details</h3>
            <div className="row-2">{Object.keys(form).map(k => (
              <Field key={k} label={k.replace(/_/g, " ").replace(/^./, m => m.toUpperCase())} error={errors[k]}>
                <input className="input" value={form[k]} type={k === "email" ? "email" : "text"} inputMode={k === "phone" ? "tel" : undefined} maxLength={CORE.includes(k) ? 254 : 500}
                  onChange={e => { setForm(f => ({ ...f, [k]: e.target.value })); setDirty(true); setErrors(x => ({ ...x, [k]: "" })); }} />
              </Field>))}</div>
            <div className="form-actions"><span className="grow" />{dirty && <Button onClick={load}>Discard</Button>}<Button type="submit" variant="primary" disabled={!dirty} busy={busy === "save"} busyLabel="Saving…">Save changes</Button></div>
          </motion.form>
          <motion.div className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
            <h3 className="sec-h">Follow-up</h3>
            <Field label="Remind me on"><input className="input" type="date" value={fu || ""} onChange={e => setFollow(e.target.value)} /></Field>
            <div className="chipset" style={{ marginTop: 10 }}>
              <Button size="sm" onClick={() => setFollow(addDays(1))}>Tomorrow</Button><Button size="sm" onClick={() => setFollow(addDays(3))}>In 3 days</Button>
              <Button size="sm" onClick={() => setFollow(addDays(7))}>Next week</Button><Button size="sm" variant="ghost" onClick={() => setFollow("")}>Clear</Button>
            </div>
            <p className={`help ${fu && fu <= today() ? "warn-text" : ""}`} style={{ marginTop: 10 }}>{!fu ? "No follow-up set. Set a date and it shows up on your dashboard." : fu < today() ? `Overdue since ${fmtDate(fu)}.` : fu === today() ? "Due today." : `Reminder on ${fmtDate(fu)}.`}</p>
          </motion.div>
        </div>
        <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
          <div className="card-head"><h3>Activity</h3><span className="grow" /><span className="help">{items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : ""}</span></div>
          <form className="cd-note" onSubmit={addNote} noValidate>
            <Field error={errors.note}><textarea className="textarea" rows={3} maxLength={2000} placeholder="Add a note: a call summary, what they asked for, next steps…" value={note}
              onChange={e => { setNote(e.target.value); setErrors(x => ({ ...x, note: "" })); }} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(e); }} /></Field>
            <div className="form-actions" style={{ marginTop: 10 }}><span className="help">Only you can see notes. ⌘↵ to add.</span><span className="grow" /><Button type="submit" size="sm" variant="primary" busy={busy === "note"} busyLabel="Adding…">Add note</Button></div>
          </form>
          <ol className="timeline">
            <AnimatePresence initial={false}>
              {items.map((it, i) => <motion.li key={it.id || i} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ delay: Math.min(i, 10) * .03 }}
                className={`tl ${it.type === "message" ? "msg" : it.type === "note" ? "note" : ["replied", "auto_reply", "answered"].includes(it.type) ? "reply" : "sys"}`}><TimelineItem it={it} onDelete={delNote} /></motion.li>)}
            </AnimatePresence>
            {!items.length && <li><Empty icon="activity" title="No activity yet">Messages you send and notes you add will appear here.</Empty></li>}
          </ol>
        </motion.div>
      </div>
    </div>
  );
}

function TimelineItem({ it, onDelete }) {
  const t = <time title={new Date(it.at).toLocaleString()}>{ago(it.at)}</time>;
  if (it.type === "message") {
    const m = it.m, wa = m.channel !== "email";
    return <><span className={`tl-ic ${wa ? "wa" : "em"}`}><Icon name={wa ? "phone" : "mail"} /></span>
      <div className="tl-body"><div className="tl-top"><b>{wa ? "WhatsApp" : "Email"} to {m.to}</b><SendBadge status={m.status} />
        {m.tracked && (m.opens ? <Badge tone="ok">Opened{m.opens > 1 ? ` ${m.opens}×` : ""}</Badge> : <Badge>Not opened</Badge>)}{t}</div>
        {m.preview && <p className="tl-preview">{m.preview}</p>}{m.detail && <p className="help">{m.detail}</p>}</div></>;
  }
  if (["replied", "auto_reply", "answered"].includes(it.type)) return <><span className={`tl-ic rpl ${it.type === "auto_reply" ? "auto" : ""}`}><Icon name={it.type === "answered" ? "send" : "reply"} /></span>
    <div className="tl-body"><div className="tl-top"><b>{it.text}</b>{t}</div>{it.body && <p className="tl-note">{it.body}</p>}{it.reply_id && <a className="help" href={`/app/replies/${it.reply_id}`}>Open reply →</a>}</div></>;
  const note = it.type === "note";
  return <><span className="tl-ic"><Icon name={note ? "note" : it.type === "follow_up" ? "clock" : it.type === "opened" ? "eye" : it.type === "bounced" ? "alert" : "flag"} /></span>
    <div className="tl-body"><div className="tl-top"><b>{note ? "Note" : it.text}</b>{t}{note && <Button variant="ghost" size="sm" icon="trash" className="tl-del" aria-label="Delete note" onClick={() => onDelete(it.id)} />}</div>
      {note && <p className="tl-note">{it.text}</p>}</div></>;
}

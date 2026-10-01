import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { emit } from "../lib/bus";
import { EMAIL_RE, localInput } from "../lib/format";
import { replacePath } from "../lib/router";
import { useApp } from "../lib/store";
import { Alert, Button, Empty, Field, FileIcon, FormError, Icon, applyError, fail, modal, toast, Pager, usePager } from "../ui/kit";

export default function Posts({ route }) {
  const app = useApp();
  const [text, setText] = useState(route.query.get("t") || "");
  const [url, setUrl] = useState(route.query.get("u") || "");
  const [info, setInfo] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const [queue, setQueue] = useState(null);
  const offset = useRef(0);
  const draftRef = useRef(null);

  const loadQueue = useCallback(async () => {
    try { const d = await api("/api/queue"); offset.current = d.now * 1000 - Date.now(); setQueue(d.items); app.setCounts(c => ({ ...c, queue: d.items.filter(i => i.status === "queued").length })); } catch (e) { fail(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadQueue(); const t = setInterval(loadQueue, 20000); return () => clearInterval(t); }, [loadQueue]);

  const parse = async e => {
    e?.preventDefault(); setErrors({});
    if (text.trim().length < 20) return setErrors({ text: "Paste the whole post, including the part with the email address." });
    if (url.trim() && !/^https?:\/\//.test(url.trim())) return setErrors({ url: "Enter a full link starting with https://" });
    setBusy("parse");
    try { setInfo(await api("/api/posts/parse", { json: { text: text.trim(), url: url.trim() } })); setTimeout(() => draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); }
    catch (er) { applyError(er, setErrors); }
    setBusy("");
  };
  useEffect(() => { if (route.query.get("t")) { replacePath("posts"); parse(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="posts-grid">
      <div className="col">
        <form className="card card-pad" onSubmit={parse} noValidate>
          <h3 className="sec-h"><span className="num">1</span>The post</h3>
          <Field label="Post text" error={errors.text}><textarea className="textarea" rows={7} style={{ minHeight: 150 }} placeholder="Paste the whole post here, including the part with the email address…" value={text} onChange={e => setText(e.target.value)} /></Field>
          <Field label="Post link" opt="(optional)" error={errors.url} style={{ marginTop: 10 }}><input className="input" placeholder="https://www.linkedin.com/posts/…" value={url} onChange={e => setUrl(e.target.value)} /></Field>
          <div className="form-actions"><span className="help">Tip: use the bookmarklet below to send a post here straight from LinkedIn.</span><span className="grow" /><Button type="submit" variant="primary" icon="sparkles" busy={busy === "parse"} busyLabel="Reading…">Read post</Button></div>
        </form>
        <AnimatePresence>{info && <motion.div ref={draftRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
          <Draft info={info} setInfo={setInfo} postUrl={url} onDone={() => { setInfo(null); setText(""); setUrl(""); loadQueue(); app.reload().catch(() => {}); }} />
        </motion.div>}</AnimatePresence>
        <details className="card card-pad">
          <summary><b>Bookmarklet: send a post here from LinkedIn</b></summary>
          <p className="help" style={{ marginTop: 8 }}>Drag this button to your browser's bookmarks bar. On LinkedIn, select the text of a post, then click the bookmark: Reachout opens with the post filled in.</p>
          <a className="btn" style={{ marginTop: 10 }} draggable onClick={e => { e.preventDefault(); toast("Drag this button to your bookmarks bar, then use it on LinkedIn."); }}
            href={`javascript:(()=>{const t=String(getSelection()||'').trim();if(t.length<20){alert('Select the text of the post first, then click this bookmark.');return}window.open('${location.origin}/app#posts?u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(t.slice(0,6000)),'_blank')})()`}>➜ Send to Reachout</a>
        </details>
      </div>
      <div className="col">
        <Queue items={queue} offset={offset} reload={loadQueue} />
        <TemplateCard />
      </div>
    </div>
  );
}

function Draft({ info, setInfo, postUrl, onDone }) {
  const app = useApp();
  const [v, setV] = useState({ to: info.email, name: "", role: info.role, company: info.company, subject: info.draft.subject, body: info.draft.body });
  const [docs, setDocs] = useState(() => new Set(app.data.settings.documents ?? info.documents));
  const [delay, setDelay] = useState("60");
  const [when, setWhen] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: "" })); };
  const warns = [];
  if (!info.email) warns.push(["warn", "No email address found in the post. Add one below, or ask the poster how to apply."]);
  if (info.domain_problem) warns.push(["bad", info.domain_problem]);
  if (info.already?.status === "sent") warns.push(["warn", `You already emailed this address${info.already.when ? " on " + new Date(info.already.when).toLocaleDateString() : ""}.`]);
  if (["bounced", "invalid"].includes(info.already?.status)) warns.push(["bad", "Email to this address bounced before, so it can't be sent again."]);
  if (info.subject_hint) warns.push(["info", `The post asks for a specific subject line, so it's been used: “${info.subject_hint}”.`]);
  if (info.exp_min != null) warns.push(["info", `The post asks for ${info.exp_min}${info.exp_max != null ? "–" + info.exp_max : "+"} years of experience${info.location ? " · " + info.location : ""}.`]);
  const redraft = async () => {
    if (v.body.trim() !== info.draft.body.trim() && !await modal({ title: "Replace your edits?", text: "Redrafting rewrites the subject and message from the template.", confirm: "Redraft" })) return;
    setBusy("redraft");
    try { const dd = await api("/api/posts/draft", { json: { name: v.name, role: v.role, company: v.company, subject_hint: info.subject_hint } }); setInfo(x => ({ ...x, draft: dd })); setV(x => ({ ...x, subject: dd.subject, body: dd.body })); } catch (e) { fail(e); }
    setBusy("");
  };
  const due = () => {
    if (delay === "custom") return { send_at: when };
    if (delay === "morning") { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); return { send_at: localInput(d) }; }
    return { delay_minutes: +delay };
  };
  const submit = async e => {
    e.preventDefault(); setErrors({}); setFormError("");
    const data = { ...v, to: v.to.trim(), subject: v.subject.trim(), post_url: postUrl.trim(), documents: [...docs], ...due() };
    if (!data.to) return setErrors({ to: "Add the email address to send to." });
    if (!EMAIL_RE.test(data.to)) return setErrors({ to: "Enter a valid email address." });
    if (!data.subject) return setErrors({ subject: "Add a subject." });
    if (!data.body.trim()) return setErrors({ body: "Write your message." });
    if (/\{[a-z_]+\}/.test(data.subject + data.body)) return setErrors({ body: "Replace the {placeholders} first." });
    if (delay === "custom" && (!data.send_at || new Date(data.send_at) < new Date())) return setErrors({ send_at: "Pick a time in the future." });
    if (!data.documents.length && !await modal({ title: "Send without your resume?", text: "No attachment is selected.", confirm: "Schedule anyway" })) return;
    setBusy("q");
    try {
      const r = await api("/api/queue/email", { json: data });
      toast(`Scheduled for ${new Date(r.due * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}. You can edit or cancel it until then.`);
      emit("history-changed"); onDone();
    } catch (er) { applyError(er, setErrors, setFormError); }
    setBusy("");
  };
  return (
    <form className="card card-pad" onSubmit={submit} noValidate>
      <h3 className="sec-h"><span className="num">2</span>Your reply</h3>
      {warns.map(([t, x], i) => <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .05 }}><Alert tone={t} style={{ marginBottom: 10 }}>{x}</Alert></motion.div>)}
      <div className="row-2">
        <Field label="Send to" error={errors.to}>{info.emails.length >= 2
          ? <select className="select" value={v.to} onChange={set("to")}>{info.emails.map(x => <option key={x}>{x}</option>)}</select>
          : <input className="input" type="email" value={v.to} onChange={set("to")} />}</Field>
        <Field label="Their name" opt="(optional)"><input className="input" placeholder="e.g. Priya" value={v.name} onChange={set("name")} /></Field>
        <Field label="Role"><input className="input" value={v.role} onChange={set("role")} /></Field>
        <Field label="Company"><input className="input" value={v.company} onChange={set("company")} /></Field>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <div className="label-row"><label>Subject</label><span className="grow" /><Button size="sm" variant="ghost" icon="refresh" busy={busy === "redraft"} onClick={redraft}>Redraft from fields</Button></div>
        <input className="input" maxLength={200} value={v.subject} onChange={set("subject")} aria-invalid={errors.subject ? "true" : undefined} />{errors.subject && <span className="field-error">{errors.subject}</span>}
      </div>
      <Field label="Message" error={errors.body} style={{ marginTop: 12 }}><textarea className="textarea" rows={12} value={v.body} onChange={set("body")} /></Field>
      <div className="field" style={{ marginTop: 12 }}><span className="label">Attachments</span>
        <div className="attach">{info.documents.length ? info.documents.map(n => (
          <label key={n} className={docs.has(n) ? "on" : ""}><input type="checkbox" checked={docs.has(n)} onChange={e => setDocs(s => { const x = new Set(s); e.target.checked ? x.add(n) : x.delete(n); return x; })} /><FileIcon name={n} /><span className="n">{n}</span></label>))
          : <div className="help">No files yet. <a href="/app/files">Upload your resume</a>.</div>}</div></div>
      <div className="row-2" style={{ marginTop: 14 }}>
        <Field label="Send"><select className="select" value={delay} onChange={e => { setDelay(e.target.value); if (e.target.value === "custom" && !when) { const d = new Date(Date.now() + 2 * 3600e3); d.setMinutes(0, 0, 0); setWhen(localInput(d)); } }}>
          <option value="15">In 15 minutes</option><option value="60">In 1 hour</option><option value="180">In 3 hours</option><option value="morning">Tomorrow at 9:30 am</option><option value="custom">Pick a date and time…</option></select></Field>
        {delay === "custom" && <Field label="Date and time" error={errors.send_at}><input className="input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></Field>}
      </div>
      <FormError>{formError}</FormError>
      <div className="form-actions"><Button variant="ghost" onClick={() => setInfo(null)}>Start over</Button><span className="grow" /><Button type="submit" variant="primary" icon="clock" busy={busy === "q"} busyLabel="Scheduling…">Schedule email</Button></div>
    </form>
  );
}

function Queue({ items, offset, reload }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const now = (Date.now() + offset.current) / 1000;
  const when = t => new Date(t * 1000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const left = t => { const s = Math.max(0, t - now); return s < 60 ? "any moment" : s < 3600 ? `in ${Math.round(s / 60)} min` : s < 86400 ? `in ${(s / 3600).toFixed(1)} h` : `in ${Math.round(s / 86400)} d`; };
  const act = async (i, a) => {
    if (a === "cancel") {
      if (!await modal({ title: "Cancel this scheduled item?", text: "It won't be sent.", confirm: "Cancel it", cancel: "Keep", danger: true })) return;
      try { await api(`/api/queue/${i.id}/cancel`, { json: {} }); toast("Cancelled"); reload(); } catch (e) { fail(e); }
    } else if (a === "now") {
      if (!await modal({ title: "Send it now?", confirm: "Send now" })) return;
      try { const r = await api(`/api/queue/${i.id}/now`, { json: {} }); r.status === "sent" ? toast("Sent") : toast(r.detail || "Couldn't send", true); reload(); } catch (e) { fail(e); }
    } else {
      const item = await api("/api/queue/" + i.id).catch(fail); if (!item) return;
      const isEmail = item.kind === "email";
      const txt = await modal({ title: isEmail ? "Edit message" : "Edit post", text: isEmail ? `To ${item.payload.to} · ${item.payload.subject}` : "", input: isEmail ? item.payload.body : item.payload.text, multiline: true, confirm: "Save" });
      if (txt === null) return;
      try { await api("/api/queue/" + i.id, { method: "PUT", json: isEmail ? { body: txt } : { text: txt } }); toast("Saved"); reload(); } catch (e) { fail(e); }
    }
  };
  const pg = usePager(items || [], "", 10);
  const badge = i => ({ queued: <span className="badge brand">{left(i.due)}</span>, sending: <span className="badge brand">Sending…</span>, sent: <span className="badge ok">Sent</span>, failed: <span className="badge bad">Failed</span>, cancelled: <span className="badge">Cancelled</span> })[i.status];
  return (
    <div className="card">
      <div className="card-head"><h3>Scheduled &amp; sent</h3><span className="grow" /><Button size="sm" variant="ghost" icon="refresh" aria-label="Refresh" onClick={reload} /></div>
      <div className="queue">
        <AnimatePresence initial={false}>
          {pg.items.map(i => (
            <motion.div key={i.id} layout className={`q-item ${i.status}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className={`ch ${i.kind === "email" ? "em" : "li"}`}><Icon name={i.kind === "email" ? "mail" : "linkedin"} /></span>
              <div className="t"><b>{i.kind === "email" ? (i.company || i.to) : "LinkedIn post"}</b><span>{i.kind === "email" ? i.subject : i.text}</span>
                <span className="help">{i.status === "queued" ? "Sends " + when(i.due) : when(i.sent_at || i.due)}{i.detail && i.status !== "sent" ? " · " + i.detail : ""}</span></div>
              {badge(i)}
              {i.status === "queued" && <div className="q-act"><Button size="sm" onClick={() => act(i, "now")}>Send now</Button><Button size="sm" variant="ghost" onClick={() => act(i, "edit")}>Edit</Button><Button size="sm" variant="ghost" className="btn-danger" onClick={() => act(i, "cancel")}>Cancel</Button></div>}
            </motion.div>))}
        </AnimatePresence>
        {items && !items.length && <Empty icon="clock" title="Nothing scheduled">Replies you schedule from a hiring post, and scheduled LinkedIn posts, appear here.</Empty>}
        {!items && <div className="card-pad"><div className="sk-block card" style={{ height: 120 }} /></div>}
      </div>
      <Pager p={pg} label="items" sizes={[10, 25, 50]} />
    </div>
  );
}

function TemplateCard() {
  const [v, setV] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/posts/template").then(t => setV({ subject: t.subject, body: t.body })).catch(() => {}); }, []);
  const save = async e => {
    e.preventDefault(); setErrors({});
    if (!v.subject.trim()) return setErrors({ subject: "Add a subject." });
    if (!v.body.trim()) return setErrors({ body: "Write the message." });
    setBusy(true);
    try { await api("/api/posts/template", { method: "PUT", json: v }); toast("Template saved"); } catch (er) { applyError(er, setErrors); }
    setBusy(false);
  };
  return (
    <details className="card card-pad">
      <summary><b>Reply template</b> <span className="help">used for every new draft</span></summary>
      {v && <form onSubmit={save} noValidate style={{ marginTop: 12 }}>
        <Field label="Subject" error={errors.subject}><input className="input" value={v.subject} onChange={e => setV(x => ({ ...x, subject: e.target.value }))} /></Field>
        <Field label="Message" error={errors.body} hint="Fields: {name} {company} {role} {at_company} {sender_name} {sender_phone} {sender_email}" style={{ marginTop: 10 }}>
          <textarea className="textarea" rows={10} value={v.body} onChange={e => setV(x => ({ ...x, body: e.target.value }))} /></Field>
        <div className="form-actions"><span className="grow" /><Button type="submit" variant="primary" busy={busy}>Save template</Button></div>
      </form>}
    </details>
  );
}

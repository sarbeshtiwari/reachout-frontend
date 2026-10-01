import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { emit, on } from "../lib/bus";
import { EMAIL_RE, ago, fmtDT, gmailLink, safeHref } from "../lib/format";
import { useApp } from "../lib/store";
import { Alert, Avatar, Badge, Button, Chips, Drawer, DrawerHead, Empty, Field, FileIcon, FormError, Icon, Sk, Switch, applyError, fail, modal, toast, Pager, usePager } from "../ui/kit";
import { Kpi, MailSyncLine } from "../ui/shared";

const TONE = { interested: "ok", interview: "teal", asks_resume: "brand", asks_details: "brand", referral: "violet", not_interested: "bad", question: "warn", thanks: "", replied: "", auto_reply: "muted" };
const FILTERS = [["open", "To handle"], ["all", "All replies"], ["interested", "Interested"], ["interview", "Interview / call"], ["asks_resume", "Wants resume"],
  ["asks_details", "Wants details"], ["referral", "Referred / portal"], ["question", "Questions"], ["not_interested", "Not interested"], ["auto", "Auto-replies"]];
const PH = { current_ctc: "e.g. 6 LPA", expected_ctc: "e.g. 9–10 LPA", notice_period: "e.g. 30 days / Immediate", current_location: "e.g. Noida",
  preferred_location: "e.g. Noida, Gurugram, Remote", experience: "e.g. 2+ years", availability: "e.g. Weekdays after 6 pm IST", portfolio: "https://…", linkedin: "https://linkedin.com/in/…" };
const BRACKET = /\[(?:add|write) your [^\]]*\]/gi;

export default function Replies({ route }) {
  const [f, setF] = useState(route.param ? "all" : "open");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [compose, setCompose] = useState(null);
  const focus = useRef(route.param);
  const load = useCallback(() => api(`/api/replies?f=${f === "all" ? "" : f}`).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.message)), [f]);
  useEffect(() => { load(); return on("replies-changed", load); }, [load]);
  useEffect(() => {
    if (!d || !focus.current) return;
    const el = document.querySelector(`[data-reply="${focus.current}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 2200); }
    focus.current = "";
  }, [d]);
  const pg = usePager(d?.items || [], f, 10);
  const mark = async (id, handled) => {
    try { await api(`/api/replies/${id}`, { method: "PUT", json: { handled } }); toast(handled ? "Marked as handled" : "Moved back to To handle"); load(); emit("replies-changed"); } catch (e) { fail(e); }
  };
  if (err) return <div className="card"><Empty icon="alert" title="Couldn't load replies">{err}</Empty></div>;
  const c = d?.counts || {};
  return (
    <div>
      <div className="kpis four">
        {d ? <>
          <Kpi index={0} icon="reply" tone="brand" label="Replies" value={c.all} sub={`${c.open} waiting for you`} />
          <Kpi index={1} icon="trend" tone="teal" label="Reply rate" value={d.rate} suffix="%" sub={`${d.replied} of ${d.sent} emails answered`} />
          <Kpi index={2} icon="star" tone="ok" label="Positive" value={(c.interested || 0) + (c.interview || 0) + (c.asks_resume || 0) + (c.asks_details || 0)} sub={`${c.interview || 0} want a call`} />
          <Kpi index={3} icon="x" tone="bad" label="Not interested" value={c.not_interested || 0} sub={`${c.auto} auto-replies set aside`} />
        </> : [0, 1, 2, 3].map(i => <div key={i} className="kpi sk-card" style={{ height: 104 }} />)}
      </div>
      <div className="toolbar">
        <Chips value={f} onChange={setF} options={FILTERS.filter(([k]) => ["open", "all"].includes(k) || c[k]).map(([k, l]) => [k, l, c[k] ?? 0])} />
        <span className="grow" /><MailSyncLine />
      </div>
      <div className="rp-list">
        {!d && [0, 1].map(i => <div key={i} className="card card-pad"><Sk w="40%" h={18} /><Sk w="90%" style={{ marginTop: 14 }} /><Sk w="70%" style={{ marginTop: 8 }} /></div>)}
        <AnimatePresence initial={false}>
          {pg.items.map((r, i) => <ReplyCard key={r.id} r={r} labels={d.labels} i={i} onCompose={() => setCompose(r.id)} onMark={mark} />)}
        </AnimatePresence>
        {d && !d.items.length && <div className="card"><Empty icon="reply" title={f === "open" ? "Nothing waiting for you" : "No replies here yet"}>When someone answers an email you sent from Reachout, it shows up here within a few minutes, with a notification.</Empty></div>}
      </div>
      {pg.total > 0 && <div className="card" style={{ marginTop: 14 }}><Pager p={pg} label="replies" sizes={[5, 10, 25]} /></div>}
      <Drawer open={!!compose} onClose={() => setCompose(null)} wide label="Reply">
        {compose && <Composer id={compose} onClose={() => setCompose(null)} onSent={() => { setCompose(null); load(); emit("replies-changed"); }} />}
      </Drawer>
    </div>
  );
}

function ReplyCard({ r, labels, i, onCompose, onMark }) {
  const inf = r.info || {}, sig = inf.signature || {};
  const who = r.contact || sig.name || r.from || r.addr;
  const facts = [];
  if (inf.calendar) facts.push(["calendar", "Invite", fmtDT(inf.calendar)]);
  if (inf.when?.length) facts.push(["clock", "Time mentioned", inf.when.join(" · ")]);
  (inf.meeting_links || []).forEach(l => facts.push(["link", "Meeting link", <a href={safeHref(l)} target="_blank" rel="noopener noreferrer">{l.replace(/^https?:\/\//, "").slice(0, 60)}</a>]));
  if (inf.asks?.length) facts.push(["flag", "They're asking for", inf.asks.join(", ")]);
  if (inf.phones?.length) facts.push(["phone", "Phone", inf.phones.join(", ")]);
  if (inf.emails?.length) facts.push(["mail", "Email mentioned", inf.emails.join(", ")]);
  if (r.cc?.length) facts.push(["users", "Also copied", r.cc.join(", ")]);
  (inf.links || []).slice(0, 3).forEach(l => facts.push(["external", "Link", <a href={safeHref(l)} target="_blank" rel="noopener noreferrer">{l.replace(/^https?:\/\//, "").slice(0, 60)}{l.length > 68 ? "…" : ""}</a>]));
  const how = { thread: "Replied in the same thread", address: "Wrote back from the address you emailed", company: "Answered from the same company" }[r.how] || "";
  return (
    <motion.article layout data-reply={r.id} className={`card rp ${r.handled ? "done" : ""} ${r.auto ? "auto" : ""}`}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * .05 } }} exit={{ opacity: 0, scale: .98 }}>
      <div className="rp-head">
        <Avatar name={who} logo />
        <div className="grow"><b>{who}</b><span className="help">{[sig.title, sig.company].filter(Boolean).join(" · ") || r.addr}{(sig.title || sig.company) && ` · ${r.addr}`}</span></div>
        <time className="help" title={new Date(r.at).toLocaleString()}>{ago(r.at)}</time>
      </div>
      <div className="rp-intents">{(inf.intents || []).map(k => <span key={k} className={`badge ${TONE[k] || ""}`}>{labels[k] || (k === "replied" ? "Replied" : k)}</span>)}</div>
      <p className="rp-subj"><b>{r.subject}</b>{r.sent_subject && <span className="help">In reply to “{r.sent_subject}”{r.sent_at && `, sent ${ago(r.sent_at)}`} · {how}</span>}</p>
      <blockquote className="rp-text">{r.text}</blockquote>
      {r.answered && <div className="rp-answered"><Icon name="check" /><span>You replied {ago(r.answered.at)}{r.answered.documents?.length ? ` · attached ${r.answered.documents.join(", ")}` : ""}</span>
        <details><summary>Show</summary><pre>{r.answered.body}</pre></details></div>}
      {inf.questions?.length > 0 && <div className="rp-q"><span className="k">Questions for you</span><ul>{inf.questions.map(q => <li key={q}>{q}</li>)}</ul></div>}
      {facts.length > 0 && <dl className="rp-facts">{facts.map(([ic, k, v], n) => <div key={n}><dt><Icon name={ic} />{k}</dt><dd>{v}</dd></div>)}</dl>}
      <div className="rp-actions">
        {!r.auto && <Button variant="primary" size="sm" icon="reply" onClick={onCompose}>{r.answered ? "Reply again" : "Reply"}</Button>}
        <a className="btn btn-sm btn-ghost" href={gmailLink(r.msgid)} target="_blank" rel="noopener noreferrer"><Icon name="external" />Gmail</a>
        {r.rid && <a className="btn btn-sm" href={`/app/contact/${r.rid}`}><Icon name="user" />Open contact</a>}
        <span className="grow" />
        {!r.auto && <Button variant="ghost" size="sm" icon={r.handled ? "refresh" : "check"} onClick={() => onMark(r.id, !r.handled)}>{r.handled ? "Mark as to handle" : "Mark as handled"}</Button>}
      </div>
    </motion.article>
  );
}

function Composer({ id, onClose, onSent }) {
  const app = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [details, setDetails] = useState({});
  const [docs, setDocs] = useState(new Set());
  const [quote, setQuote] = useState(true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    api(`/api/replies/${id}/draft`).then(r => {
      setD(r); setTo(r.to); setCc(r.cc.join(", ")); setSubject(r.subject); setBody(r.body); setDetails({ ...r.details }); setDocs(new Set(r.documents));
    }).catch(e => setErr(e.message));
  }, [id]);
  if (err) return <div className="dr-pad"><Empty icon="alert" title="Couldn't prepare a reply">{err}</Empty></div>;
  if (!d) return <div className="dr-pad"><Sk w="50%" h={22} /><div className="card sk-block" style={{ marginTop: 20, height: 360 }} /></div>;
  const asked = [...new Set([...d.asked, ...d.missing.filter(k => d.detail_labels[k])])];
  const left = (body.match(BRACKET) || []).length;
  const setDetail = (k, v) => {
    setDetails(x => ({ ...x, [k]: v }));
    const lbl = d.detail_labels[k];
    const rx = new RegExp(`^(•\\s*${lbl.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:\\s*).*$`, "m");
    if (rx.test(body)) setBody(b => b.replace(rx, `$1${v.trim() || `[add your ${/CTC/.test(lbl) ? lbl : lbl.toLowerCase()}]`}`));
  };
  const saveDetails = async () => {
    const changed = Object.fromEntries(Object.entries(details).filter(([k, v]) => (d.details[k] || "") !== (v || "")));
    if (Object.keys(changed).length) await api("/api/replies/details", { method: "PUT", json: changed }).catch(() => {});
  };
  const redraft = async () => {
    if (body !== d.body && !await modal({ title: "Replace your edits with a new suggestion?", confirm: "Replace" })) return;
    setBusy("redraft");
    await saveDetails();
    try { const nd = await api(`/api/replies/${id}/draft`); setBody(nd.body); setD(x => ({ ...x, body: nd.body })); } catch (e) { fail(e); }
    setBusy("");
  };
  const send = async e => {
    e.preventDefault(); setErrors({}); setFormError("");
    if (!EMAIL_RE.test(to.trim())) return setErrors({ to: "Enter a valid email address." });
    if (!subject.trim()) return setErrors({ subject: "Add a subject." });
    if (left) return setErrors({ body: "Fill in the parts in [brackets] first." });
    setBusy("send");
    try {
      await saveDetails();
      await api(`/api/replies/${id}/send`, { json: { to: to.trim(), cc, subject, body, documents: [...docs], quote } });
      toast("Reply sent"); onSent();
    } catch (er) { applyError(er, setErrors, setFormError); }
    setBusy("");
  };
  const o = d.original;
  return <>
    <DrawerHead logo={<span className="co-logo lg grad"><Icon name="reply" /></span>} title={`Reply to ${o.from || o.addr}`} sub={`Sent from ${app.me.email} in the same thread · a suggested message is filled in`} onClose={onClose} />
    <form className="dr-pad composer" onSubmit={send} noValidate>
      {d.answered && <Alert style={{ marginBottom: 14 }}>You already replied {ago(d.answered.at)}. Sending again adds another email to the thread.</Alert>}
      <details className="cp-orig"><summary><Icon name="mail" />Their message · {ago(o.at)}</summary><blockquote className="rp-text">{o.text}</blockquote></details>
      <Field label="To" error={errors.to}><input className="input" type="email" value={to} onChange={e => setTo(e.target.value)} /></Field>
      <Field label="Cc" opt="(optional, comma separated)" error={errors.cc} style={{ marginTop: 10 }}><input className="input" value={cc} onChange={e => setCc(e.target.value)} /></Field>
      <Field label="Subject" error={errors.subject} style={{ marginTop: 10 }}><input className="input" value={subject} maxLength={200} onChange={e => setSubject(e.target.value)} /></Field>
      {asked.length > 0 && <motion.div className="cp-details" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="label-row"><b>Details they asked for</b><span className="grow" /><span className="help">Saved for next time</span></div>
        <div className="row-2">{asked.map(k => (
          <Field key={k} label={d.detail_labels[k]}><input className={`input ${!(details[k] || "").trim() ? "need" : ""}`} value={details[k] || ""} maxLength={200} placeholder={PH[k] || ""} onChange={e => setDetail(k, e.target.value)} /></Field>))}
        </div>
      </motion.div>}
      <div className="field" style={{ marginTop: 12 }}>
        <div className="label-row"><label htmlFor="cpBody">Message</label><span className="grow" /><Button size="sm" variant="ghost" icon="sparkles" busy={busy === "redraft"} onClick={redraft}>Suggest again</Button></div>
        <textarea id="cpBody" className="textarea" rows={16} value={body} onChange={e => { setBody(e.target.value); setErrors(x => ({ ...x, body: "" })); }} aria-invalid={errors.body ? "true" : undefined} style={{ minHeight: 300 }} />
        {errors.body ? <span className="field-error">{errors.body}</span> : <span className={`help ${left ? "warn-text" : ""}`}>{left ? `${left} part${left === 1 ? "" : "s"} in [brackets] still to fill in.` : "Ready to send. It goes from your own mailbox and appears in Gmail's Sent folder."}</span>}
      </div>
      <div className="field" style={{ marginTop: 12 }}><span className="label">Attachments</span>
        <div className="attach">{d.available_docs.length ? d.available_docs.map(n => (
          <label key={n} className={docs.has(n) ? "on" : ""}><input type="checkbox" checked={docs.has(n)} onChange={e => setDocs(s => { const x = new Set(s); e.target.checked ? x.add(n) : x.delete(n); return x; })} /><FileIcon name={n} /><span className="n">{n}</span></label>))
          : <span className="help">No files yet. <a href="/app/files">Upload your resume</a>.</span>}</div></div>
      <div style={{ marginTop: 14 }}><Switch checked={quote} onChange={setQuote}>Include their message below mine</Switch></div>
      <FormError>{formError}</FormError>
      <div className="form-actions sticky-actions"><Button onClick={onClose}>Cancel</Button><span className="grow" /><Button type="submit" variant="primary" icon="send" busy={busy === "send"} busyLabel="Sending…">Send reply</Button></div>
    </form>
  </>;
}

export { Badge };

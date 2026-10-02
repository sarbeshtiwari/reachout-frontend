import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { api, upload } from "../lib/api";
import { emit } from "../lib/bus";
import { emailOk, fmtDate, phoneOk, today } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Badge, Button, Check, Empty, Field, FormError, Icon, Spinner, Switch, applyError, fail, modal, toast, useDebounced, Pager, usePager } from "../ui/kit";
import { Dropzone, EmailBadge, SendBadge } from "../ui/shared";
import { extraCols } from "./Campaign";

const CORE = ["name", "company", "phone", "email"];
const STATUS = ["wa_status", "wa_last", "email_status", "email_last", "email_opened", "replied_at", "reply_intent", "reply_count", "added_at"];
const PH = { name: "Add name", company: "Add company", phone: "Add phone", email: "Add email" };

// Whole days since the contact was added (0 = today), or null for contacts saved before dates were recorded.
// What kind of inbox an address reaches: hiring (careers@, jobs@, hr@…) or a general one (info@, contact@…).
const HIRING = /^(careers?|jobs?|hiring|recruit\w*|talent\w*|hr|people|join\w*|apply|applications?|resumes?|cv)([._-]|$)/i;
const GENERAL = /^(hello|hi|info|contact|team|office|mail|enquir\w*|inquir\w*|general|support|sales|admin)([._-]|$)/i;
function addressKind(r) {
  if (!r.email) return "none";
  if (r.email_type === "careers") return "hiring";
  if (r.email_type === "general") return "general";
  if (r.email_type === "referral") return "person";
  const local = r.email.split("@")[0];
  return HIRING.test(local) ? "hiring" : GENERAL.test(local) ? "general" : "person";
}

function addedAge(r) {
  if (!r.added_at) return null;
  const d = new Date(r.added_at); if (isNaN(d)) return null;
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(new Date()) - start(d)) / 86400000);
}

export default function Contacts() {
  const app = useApp();
  const { data, me, selected, setSelected } = app;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [added, setAdded] = useState("");
  const [list, setList] = useState("");
  const [kind, setKind] = useState("");
  const lists = useMemo(() => [...new Set(data.recipients.map(r => r.list).filter(Boolean))].sort(), [data.recipients]);
  const addedCounts = useMemo(() => {
    const c = { today: 0, yesterday: 0, "7": 0, "30": 0, older: 0 };
    data.recipients.forEach(r => { const a = addedAge(r); if (a === null) c.older++; else { if (a === 0) c.today++; if (a === 1) c.yesterday++; if (a < 7) c["7"]++; if (a < 30) c["30"]++; } });
    return c;
  }, [data.recipients]);
  const [panel, setPanel] = useState(null);
  const [save, setSave] = useState({ text: "", tone: "" });
  const dq = useDebounced(q, 120);
  const cols = [...CORE, ...extraCols(data.recipients)];

  const rows = useMemo(() => data.recipients.filter(r => {
    const s = dq.trim().toLowerCase();
    if (s && !Object.entries(r).some(([k, v]) => k !== "id" && String(v).toLowerCase().includes(s))) return false;
    if (stage && (r.stage || "new") !== stage) return false;
    if (list && (r.list || "") !== (list === "(none)" ? "" : list)) return false;
    if (kind && addressKind(r) !== kind) return false;
    if (added) {
      const a = addedAge(r);
      if (added === "today" && a !== 0) return false;
      if (added === "yesterday" && a !== 1) return false;
      if ((added === "7" || added === "30") && (a === null || a >= +added)) return false;
      if (added === "older" && a !== null) return false;
    }
    if (status === "pending") return !r.wa_status && !r.email_status;
    if (status === "sent") return r.wa_status === "sent" || r.email_status === "sent";
    if (status === "failed") return ["failed", "not_on_whatsapp"].includes(r.wa_status) || ["failed", "bounced", "invalid"].includes(r.email_status);
    if (status === "opened") return !!r.email_opened;
    if (status === "unopened") return r.email_status === "sent" && !r.email_opened;
    if (status === "replied") return !!r.replied_at;
    return true;
  }), [data.recipients, dq, status, stage, added, list, kind]);
  const pg = usePager(rows, [dq, status, stage, added, list, kind].join("|"), 50);
  const filtered = !!(dq || status || stage || added || list || kind);
  const allOn = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleSel = (id, on) => setSelected(s => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  const saveCell = async (r, k, el) => {
    const value = el.value.trim();
    if (value === (r[k] || (k === "stage" ? "new" : ""))) return;
    const bad = msg => { el.setAttribute("aria-invalid", "true"); el.title = msg; setSave({ text: msg, tone: "err" }); };
    if (k === "phone" && !phoneOk(value)) return bad("Enter a valid phone number: 8–15 digits.");
    if (k === "email" && !emailOk(value)) return bad("Enter a valid email address.");
    if ((k === "phone" || k === "email") && !value && !(k === "phone" ? r.email : r.phone)) return bad("A contact needs a phone number or an email.");
    el.removeAttribute("aria-invalid"); el.title = "";
    el.classList.add("saving"); setSave({ text: "Saving…", tone: "busy" });
    try {
      const row = await api("/api/recipients/" + r.id, { method: "PUT", json: { [k]: value } });
      app.patchRecipient(r.id, row);
      setSave({ text: "Saved", tone: "ok" }); setTimeout(() => setSave(s => s.tone === "ok" ? { text: "", tone: "" } : s), 2000);
    } catch (err) { el.value = r[k] || ""; bad(err.message); }
    el.classList.remove("saving");
  };

  const bulkDelete = async () => {
    const n = selected.size;
    if (!await modal({ title: `Delete ${n} contact${n === 1 ? "" : "s"}?`, text: "They'll be removed from your list. Activity history is kept.", confirm: "Delete", danger: true })) return;
    try { await api("/api/recipients/delete", { json: { ids: [...selected] } }); app.setData(d => ({ ...d, recipients: d.recipients.filter(r => !selected.has(r.id)) })); setSelected(new Set()); toast(`Deleted ${n} contact${n === 1 ? "" : "s"}`); }
    catch (err) { fail(err); }
  };
  const bulkReset = async () => {
    try {
      await api("/api/recipients/reset", { json: { ids: [...selected] } });
      app.setData(d => ({ ...d, recipients: d.recipients.map(r => selected.has(r.id) ? { ...r, ...Object.fromEntries(STATUS.map(k => [k, ""])) } : r) }));
      toast("Marked as not contacted");
    } catch (err) { fail(err); }
  };
  const addColumn = async () => {
    if (!data.recipients.length) return toast("Add a contact first", true);
    const raw = await modal({ title: "Add a column", text: "For example role or city. You can then use it in messages as {role}.", input: "", confirm: "Add column" });
    if (raw === null) return;
    const name = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(name)) return toast("Column names must start with a letter and be up to 40 characters.", true);
    if ([...cols, ...STATUS, "id"].includes(name)) return toast(`There's already a column called “${name}”.`, true);
    const r = data.recipients[0];
    try { await api("/api/recipients/" + r.id, { method: "PUT", json: { [name]: "" } }); app.patchRecipient(r.id, { [name]: "" }); toast(`Column added. Use {${name}} in messages`); }
    catch (err) { fail(err); }
  };
  const togglePanel = p => setPanel(x => x === p ? null : p);

  return (
    <div>
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Search contacts…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search contacts" /></div>
        <select className="select auto" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="pending">Not contacted</option><option value="sent">Sent</option><option value="replied">Replied</option>
          <option value="failed">Failed / not on WhatsApp</option><option value="opened">Email opened</option><option value="unopened">Emailed, not opened</option>
        </select>
        <select className="select auto" value={stage} onChange={e => setStage(e.target.value)} aria-label="Filter by stage">
          <option value="">All stages</option>{Object.entries(me.stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select auto" value={added} onChange={e => setAdded(e.target.value)} aria-label="Filter by when added">
          <option value="">Added any time</option>
          <option value="today">Added today ({addedCounts.today})</option>
          <option value="yesterday">Added yesterday ({addedCounts.yesterday})</option>
          <option value="7">Added in the last 7 days ({addedCounts["7"]})</option>
          <option value="30">Added in the last 30 days ({addedCounts["30"]})</option>
          <option value="older">Added earlier ({addedCounts.older})</option>
        </select>
        {lists.length > 0 && <select className="select auto" value={list} onChange={e => setList(e.target.value)} aria-label="Filter by list">
          <option value="">All lists</option>{lists.map(l => <option key={l} value={l}>{l}</option>)}<option value="(none)">No list</option>
        </select>}
        <select className="select auto" value={kind} onChange={e => setKind(e.target.value)} aria-label="Filter by email address type">
          <option value="">Any address</option>
          <option value="hiring">Careers / HR address</option>
          <option value="general">General address (info@, contact@…)</option>
          <option value="person">A person (referral)</option>
          <option value="none">No email</option>
        </select>
        {filtered && <Button variant="ghost" size="sm" icon="x" onClick={() => { setQ(""); setStatus(""); setStage(""); setAdded(""); setList(""); setKind(""); }}>Clear</Button>}
        <span className="grow" />
        <Button icon="mail" className={panel === "sent" ? "on" : ""} onClick={() => togglePanel("sent")}>Import from Sent mail</Button>
        <Button icon="upload" className={panel === "import" ? "on" : ""} onClick={() => togglePanel("import")}>Import Excel</Button>
        <Button variant="primary" icon="plus" onClick={() => togglePanel("add")}>Add contact</Button>
      </div>

      <AnimatePresence mode="wait">
        {panel && <motion.div key={panel} initial={{ opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
          {panel === "add" && <AddPanel onClose={() => setPanel(null)} />}
          {panel === "import" && <ImportPanel onClose={() => setPanel(null)} />}
          {panel === "sent" && <SentPanel onClose={() => setPanel(null)} />}
        </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div className="bulkbar" initial={{ opacity: 0, y: -10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}>
            <b>{selected.size} selected</b><span className="grow" />
            <Button size="sm" icon="send" onClick={() => { app.setCampaignPreset({ who: "selected" }); go("campaign"); }}>Send to selected</Button>
            <Button size="sm" icon="refresh" onClick={bulkReset}>Mark not contacted</Button>
            <Button size="sm" variant="danger" icon="trash" onClick={bulkDelete}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card table-card">
        <div className="table-wrap contacts-wrap">
          <table className="table">
            <thead><tr>
              <th className="cb"><input type="checkbox" checked={allOn} onChange={e => setSelected(s => { const n = new Set(s); rows.forEach(r => e.target.checked ? n.add(r.id) : n.delete(r.id)); return n; })} aria-label="Select all" /></th>
              {cols.map(c => <th key={c}>{c.replace(/_/g, " ")}</th>)}<th>Stage</th><th>Follow-up</th><th>WhatsApp</th><th>Email</th><th />
            </tr></thead>
            <tbody>
              {pg.items.map((r, i) => (
                <motion.tr key={r.id} className={selected.has(r.id) ? "sel" : ""} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * .012 }}>
                  <td className="cb"><input type="checkbox" checked={selected.has(r.id)} onChange={e => toggleSel(r.id, e.target.checked)} aria-label={`Select ${r.name || r.phone || r.email}`} /></td>
                  {cols.map(c => (
                    <td key={c} className="tight"><input className="cell" defaultValue={r[c] || ""} key={r.id + c + (r[c] || "")} placeholder={PH[c] || "Add"} maxLength={CORE.includes(c) ? 254 : 500} aria-label={c}
                      type={c === "email" ? "email" : "text"} inputMode={c === "phone" ? "tel" : undefined}
                      onBlur={e => saveCell(r, c, e.target)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { e.target.value = r[c] || ""; e.target.removeAttribute("aria-invalid"); e.target.blur(); } }} /></td>
                  ))}
                  <td className="tight"><select className={`cell stage-cell st-${r.stage || "new"}`} value={r.stage || "new"} onChange={e => saveCell(r, "stage", e.target)} aria-label="Stage">
                    {Object.entries(me.stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                  <td>{r.follow_up ? <span className={`due ${r.follow_up <= today() && !["won", "not_interested"].includes(r.stage) ? "late" : ""}`}>{fmtDate(r.follow_up)}</span> : <span className="help">—</span>}</td>
                  <td><SendBadge status={r.wa_status} ts={r.wa_last} /></td>
                  <td><div className="badges">{r.replied_at ? <Badge tone="brand"><Icon name="reply" />Replied</Badge> : <EmailBadge r={r} />}</div></td>
                  <td><a className="btn btn-sm btn-ghost btn-icon" href={`/app/contact/${r.id}`} aria-label="Open contact" title="Open contact"><Icon name="external" /></a></td>
                </motion.tr>
              ))}
              {!data.recipients.length && <tr><td colSpan={cols.length + 6}><Empty icon="users" title="No contacts yet" action={<Button size="sm" onClick={() => setPanel("import")}>Import a spreadsheet</Button>}>Import an Excel or CSV file. Columns like "Name", "Mobile No." or "Email ID" are recognised automatically.</Empty></td></tr>}
              {data.recipients.length > 0 && !rows.length && <tr><td colSpan={cols.length + 6}><Empty icon="search" title="No contacts match" action={<button className="link-btn" onClick={() => { setQ(""); setStatus(""); setStage(""); }}>Clear the filters</button>} /></td></tr>}
            </tbody>
          </table>
        </div>
        <Pager p={pg} label="contacts" sizes={[25, 50, 100, 250]} />
        <div className="table-foot">
          <span>{rows.length} of {data.recipients.length} contacts match</span>
          <AnimatePresence mode="wait">{save.text && <motion.span key={save.text} className={`save-state ${save.tone}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {save.tone === "busy" ? <Spinner size={12} /> : <Icon name={save.tone === "err" ? "alert" : "check"} />}{save.text}</motion.span>}</AnimatePresence>
          <span className="grow" />
          <Button size="sm" variant="ghost" icon="columns" onClick={addColumn}>Add column</Button>
          <a className="btn btn-sm btn-ghost" href="/api/recipients/export"><Icon name="download" />Export</a>
        </div>
      </div>
    </div>
  );
}

function AddPanel({ onClose }) {
  const app = useApp();
  const empty = { name: "", company: "", phone: "", email: "" };
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErrors({});
    const d = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()]));
    if (!d.phone && !d.email) return setErrors({ phone: "Add a phone number or an email address." });
    if (!phoneOk(d.phone)) return setErrors({ phone: "Enter a valid phone number: 8–15 digits, optionally starting with +." });
    if (!emailOk(d.email)) return setErrors({ email: "Enter a valid email address, like name@example.com." });
    setBusy(true);
    try { const row = await api("/api/recipients", { json: d }); app.setData(x => ({ ...x, recipients: [...x.recipients, row] })); setV(empty); toast(`${row.name || row.phone || row.email} added`); }
    catch (err) { applyError(err, setErrors); }
    setBusy(false);
  };
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setErrors(x => ({ ...x, [k]: "" })); };
  return (
    <form className="card card-pad panel" onSubmit={submit} noValidate>
      <h3 className="sec-h">New contact</h3>
      <div className="row-4">
        <Field label="Name" error={errors.name}><input className="input" value={v.name} onChange={set("name")} maxLength={120} autoFocus /></Field>
        <Field label="Company" error={errors.company}><input className="input" value={v.company} onChange={set("company")} maxLength={120} /></Field>
        <Field label="Phone" error={errors.phone}><input className="input" value={v.phone} onChange={set("phone")} inputMode="tel" placeholder="+91 98765 43210" /></Field>
        <Field label="Email" error={errors.email}><input className="input" type="email" value={v.email} onChange={set("email")} placeholder="name@company.com" /></Field>
      </div>
      <div className="form-actions"><span className="help">Add a phone number, an email address, or both.</span><span className="grow" /><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">Save contact</Button></div>
    </form>
  );
}

function ImportPanel({ onClose }) {
  const app = useApp();
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const onFiles = async files => {
    const file = files[0]; setErr("");
    if (!/\.(xlsx|xlsm|csv)$/i.test(file.name)) return setErr("Choose an Excel (.xlsx) or CSV file.");
    if (file.size > 5 * 1048576) return setErr("That file is larger than 5 MB. Split it into smaller files.");
    if (replace && !await modal({ title: "Replace all contacts?", text: "Your current list, including who has already been contacted, will be replaced by this file.", confirm: "Replace", danger: true })) return;
    const fd = new FormData(); fd.append("file", file); fd.append("replace", replace ? "1" : "0");
    setBusy(file.name);
    try {
      const d = await upload("/api/recipients/import", fd);
      const skipped = [d.duplicates && `${d.duplicates} duplicate${d.duplicates === 1 ? "" : "s"}`, d.invalid && `${d.invalid} without a valid phone or email`].filter(Boolean).join(", ");
      toast(`Added ${d.added} contact${d.added === 1 ? "" : "s"}` + (skipped ? ` · skipped ${skipped}` : ""));
      await app.reload(); onClose();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };
  return (
    <div className="card card-pad panel">
      <Dropzone onFiles={onFiles} accept=".xlsx,.xlsm,.csv" busy={!!busy}>
        <div className="dz-ic"><Icon name="sheet" /></div>
        <b>{busy ? <><Spinner /> Importing {busy}…</> : "Drop your Excel or CSV file here, or click to choose"}</b>
        <span className="help">Name, company, phone and email columns are found automatically. Other columns become fields you can use in your message. Max 5 MB.</span>
      </Dropzone>
      <FormError>{err}</FormError>
      <div className="form-actions"><Switch checked={replace} onChange={setReplace}>Replace my whole list</Switch><span className="grow" />
        <a className="btn btn-sm btn-ghost" href="/api/recipients/sample"><Icon name="download" />Sample sheet</a><Button size="sm" onClick={onClose}>Done</Button></div>
    </div>
  );
}

function SentPanel({ onClose }) {
  const app = useApp();
  const [days, setDays] = useState("0");
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [filter, setFilter] = useState("");
  const [mark, setMark] = useState(false);
  const [err, setErr] = useState(app.data.profile.has_password ? "" : "Set up email on the Profile page first. Reachout uses the same app password to read your Sent folder.");
  const [busy, setBusy] = useState("");
  const vis = (items || []).filter(x => !filter || [x.email, x.name, x.company, x.last_subject].some(v => (v || "").toLowerCase().includes(filter.toLowerCase())));
  const pickable = vis.filter(x => !x.imported);
  const scan = async () => {
    setBusy("scan"); setErr("");
    try { const d = await api("/api/sentmail/scan", { json: { days: +days } }); setItems(d.items); setPicked(new Set(d.items.filter(x => !x.imported).map(x => x.email))); if (!d.items.length) toast("No sent emails found in that period."); }
    catch (e) { setErr(e.message); }
    setBusy("");
  };
  const doImport = async () => {
    setBusy("import");
    try {
      const sel = items.filter(x => picked.has(x.email)).map(({ email, name, company, sends }) => ({ email, name, company, sends }));
      const d = await api("/api/sentmail/import", { json: { items: sel, mark_contacted: mark } });
      toast(mark ? `Imported ${d.added} new, updated ${d.updated}, added ${d.history} past emails to Activity` : `Imported ${d.added} new contact${d.added === 1 ? "" : "s"} (${d.updated} already existed).`);
      setItems(list => list.map(x => picked.has(x.email) ? { ...x, imported: true, contact: true } : x)); setPicked(new Set());
      await app.reload(); emit("history-changed");
    } catch (e) { setErr(e.message); }
    setBusy("");
  };
  return (
    <div className="card card-pad panel">
      <h3 className="sec-h" style={{ marginBottom: 4 }}>Import people you've already emailed</h3>
      <p className="help">Reachout looks at your mailbox's <b>Sent</b> folder and reads only who you wrote to, when, and the subject line. Personal addresses (gmail.com, yahoo.com…) are skipped.</p>
      <div className="form-actions" style={{ marginTop: 12 }}>
        <select className="select auto" value={days} onChange={e => setDays(e.target.value)} aria-label="Look back"><option value="0">All time</option><option value="30">Last 30 days</option><option value="90">Last 3 months</option><option value="180">Last 6 months</option><option value="365">Last 12 months</option></select>
        <Button variant="primary" icon="search" busy={busy === "scan"} busyLabel="Scanning…" onClick={scan} disabled={!app.data.profile.has_password}>Scan Sent folder</Button>
        <span className="grow" /><Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <FormError>{err}</FormError>
      {items && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="sent-bar">
          <Check checked={pickable.length > 0 && pickable.every(x => picked.has(x.email))} onChange={on => setPicked(s => { const n = new Set(s); pickable.forEach(x => on ? n.add(x.email) : n.delete(x.email)); return n; })}>{picked.size} selected of {items.filter(x => !x.imported).length}</Check>
          <span className="grow" /><input className="input" type="search" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 220 }} />
        </div>
        <div className="table-wrap sent-wrap"><table className="table">
          <thead><tr><th className="cb" /><th>Person</th><th>Company</th><th>Emails</th><th>Last sent</th><th>Last subject</th><th /></tr></thead>
          <tbody>{vis.map(x => (
            <tr key={x.email} className={picked.has(x.email) ? "sel" : ""}>
              <td className="cb"><input type="checkbox" checked={picked.has(x.email)} disabled={x.imported} onChange={e => setPicked(s => { const n = new Set(s); e.target.checked ? n.add(x.email) : n.delete(x.email); return n; })} /></td>
              <td><b>{x.name || x.email.split("@")[0]}</b><div className="help">{x.email}</div></td>
              <td className="tight"><input className="cell" defaultValue={x.company} placeholder="Add company" onChange={e => { x.company = e.target.value.trim(); }} /></td>
              <td className="num">{x.count}</td><td className="nowrap">{fmtDate(x.last)}</td>
              <td><div className="clip help" title={x.last_subject}>{x.last_subject || "(no subject)"}</div></td>
              <td>{x.imported ? <Badge tone="ok">Imported</Badge> : x.contact ? <Badge tone="brand">In contacts</Badge> : null}</td>
            </tr>))}
            {!vis.length && <tr><td colSpan={7}><Empty icon="mail" title="Nobody to show">{items.length ? "Nobody matches your filter." : "No new work addresses in your Sent folder for this period."}</Empty></td></tr>}
          </tbody></table></div>
        <div className="form-actions"><Switch checked={mark} onChange={setMark}>Mark as already contacted <span className="help">(campaigns will skip them)</span></Switch><span className="grow" />
          <Button variant="primary" icon="download" disabled={!picked.size} busy={busy === "import"} busyLabel="Importing…" onClick={doImport}>Import selected</Button></div>
      </motion.div>}
    </div>
  );
}

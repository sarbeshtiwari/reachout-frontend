import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { replacePath } from "../lib/router";
import { api } from "../lib/api";
import { ago, initials } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Badge, Button, Empty, Field, Icon, Seg, Sk, fail, modal, toast, useDebounced, Pager, usePager } from "../ui/kit";
import { Kpi } from "../ui/shared";

const TONE = { new: "brand", contacted: "warn", qualified: "ok", closed: "", spam: "bad" };

export default function Leads({ route }) {
  const app = useApp();
  const [scope, setScope] = useState(route?.query?.get("scope") === "site" ? "site" : "mine");
  const qs = scope === "site" ? "?scope=site" : "";
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [f, setF] = useState("");
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q, 120);
  const load = async () => {
    setBusy(true);
    try { const r = await api("/api/leads" + qs); setD(r); setErr(""); if (scope === "mine") app.setCounts(c => ({ ...c, leads: r.leads.filter(l => l.status === "new").length })); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  useEffect(() => { setD(null); setOpenId(null); load(); replacePath("leads" + qs); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = d?.leads || [];
  const rows = useMemo(() => all.filter(l => (f ? l.status === f : l.status !== "spam")
    && (!dq || [l.name, l.email, l.phone, l.company, l.topic, l.message].some(v => (v || "").toLowerCase().includes(dq.toLowerCase())))), [all, f, dq]);
  const pg = usePager(rows, [f, dq].join("|"), 25);
  const lead = all.find(l => l.id === openId) || (innerWidth > 1100 ? rows[0] : null);
  const saveLead = async (id, changes) => {
    const u = await api(`/api/leads/${id}${qs}`, { method: "PUT", json: changes });
    setD(x => ({ ...x, leads: x.leads.map(l => l.id === id ? u : l) }));
    if (scope === "mine") app.setCounts(c => ({ ...c, leads: all.map(l => l.id === id ? u : l).filter(l => l.status === "new").length }));
  };
  const week = Date.now() / 1000 - 7 * 86400;
  return (
    <div>
      {d?.is_admin && <div className="toolbar"><Seg value={scope} onChange={setScope} name="Whose enquiries" options={[["mine", "My website", "globe"], ["site", "Reachout site", "shield", d.site_new || undefined]]} /></div>}
      {d && <div className="kpis four">
        <Kpi index={0} icon="inbox" tone="brand" label="New" value={all.filter(l => l.status === "new").length} />
        <Kpi index={1} icon="calendar" label="This week" value={all.filter(l => l.created > week).length} />
        <Kpi index={2} icon="star" tone="ok" label="Qualified" value={all.filter(l => l.status === "qualified").length} />
        <Kpi index={3} icon="users" label="Total" value={all.filter(l => l.status !== "spam").length} />
      </div>}
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Search enquiries…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="select auto" value={f} onChange={e => setF(e.target.value)}><option value="">All statuses</option>{Object.entries(d?.statuses || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="grow" />
        <Button icon="refresh" busy={busy} onClick={load}>Refresh</Button>
        <a className="btn" href={"/api/leads/export" + qs}><Icon name="download" />Export</a>
      </div>
      <div className="leads-layout">
        <div className="card table-card"><div className="table-wrap"><table className="table">
          <thead><tr><th>Received</th><th>From</th><th>Topic</th><th>Status</th></tr></thead>
          <tbody>
            {!d && !err && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={4}><Sk w={`${40 + (i * 17) % 50}%`} /></td></tr>)}
            {err && <tr><td colSpan={4}><Empty icon="alert" title="Couldn't load enquiries" action={<Button size="sm" onClick={load}>Try again</Button>}>{err}</Empty></td></tr>}
            {pg.items.map(l => (
              <tr key={l.id} className={`click ${lead?.id === l.id ? "sel" : ""} ${l.status === "new" ? "unread" : ""}`} onClick={() => setOpenId(l.id)}>
                <td className="nowrap">{ago(l.created)}</td>
                <td><b>{l.name}</b><div className="help">{l.email}{l.company ? " · " + l.company : ""}</div></td>
                <td><div>{l.topic}</div><div className="help clip">{l.message}</div></td>
                <td><Badge tone={TONE[l.status]}>{d.statuses[l.status] || l.status}</Badge></td>
              </tr>))}
            {d && !rows.length && <tr><td colSpan={4}><Empty icon="inbox" title={all.length ? "No enquiries match" : "No enquiries yet"}>{all.length ? "" : scope === "site" ? "Enquiries from Reachout's own contact page and pop-up land here." : <>When someone uses the contact form on your website, it lands here. <a href="/app/portfolio/website">Build or edit your website</a></>}</Empty></td></tr>}
          </tbody></table></div><Pager p={pg} label="enquiries" /></div>
        <AnimatePresence mode="wait">
          {lead ? <motion.aside key={lead.id} className="card lead-detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
            <LeadDetail l={lead} statuses={d.statuses} onSave={saveLead} onClose={() => setOpenId(null)}
              onDelete={async () => {
                if (!await modal({ title: "Delete this enquiry?", text: "It will be removed permanently. To hide junk instead, set the status to Spam.", confirm: "Delete", danger: true })) return;
                try { await api(`/api/leads/${lead.id}${qs}`, { method: "DELETE" }); setD(x => ({ ...x, leads: x.leads.filter(y => y.id !== lead.id) })); setOpenId(null); toast("Enquiry deleted"); } catch (e) { fail(e); }
              }} />
          </motion.aside> : <aside className="card lead-detail"><Empty icon="inbox" title="Select an enquiry">Its details appear here.</Empty></aside>}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LeadDetail({ l, statuses, onSave, onClose, onDelete }) {
  const app = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const utm = Object.entries(l.utm || {}).map(([k, v]) => `${k.replace("utm_", "")}: ${v}`).join(" · ");
  const addContact = async () => {
    setBusy("c");
    try {
      const row = await api("/api/recipients", { json: { name: l.name, company: l.company, phone: l.phone, email: l.email } });
      app.setData(x => ({ ...x, recipients: [...x.recipients, row] }));
      await api(`/api/contacts/${row.id}/notes`, { json: { text: `Website enquiry (${l.topic}): ${l.message}` } });
      toast("Added to your contacts"); go("contact/" + row.id);
    } catch (e) { fail(e); }
    setBusy("");
  };
  return <>
    <div className="ld-head"><span className="avatar lg">{initials(l.name)}</span><div className="grow"><h3>{l.name}</h3><p className="help">{new Date(l.created * 1000).toLocaleString()}</p></div>
      <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} /></div>
    <dl className="ld-info">
      <dt>Email</dt><dd>{l.email} <a href={`mailto:${l.email}?subject=${encodeURIComponent("Re: " + l.topic)}`}>Reply</a></dd>
      {l.phone && <><dt>Phone</dt><dd>{l.phone} <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></dd></>}
      {l.company && <><dt>Company</dt><dd>{l.company}</dd></>}
      <dt>Topic</dt><dd>{l.topic}</dd>
      <dt>Source</dt><dd>{{ popup: "Home page pop-up", contact_page: "Contact page", website: "Your website's contact form" }[l.source] || l.source || "—"}{l.page ? ` (${l.page})` : ""}</dd>
      {l.referrer && <><dt>Came from</dt><dd className="clip">{l.referrer}</dd></>}
      {utm && <><dt>Campaign</dt><dd>{utm}</dd></>}
    </dl>
    <div className="ld-msg">{l.message}</div>
    <div className="ld-row">
      <Field label="Status"><select className="select" value={l.status} onChange={async e => { try { await onSave(l.id, { status: e.target.value }); toast(`Marked as ${statuses[e.target.value]}`); } catch (err) { fail(err); } }}>
        {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Button size="sm" icon="users" busy={busy === "c"} onClick={addContact}>Add to my contacts</Button>
    </div>
    <form onSubmit={async e => { e.preventDefault(); if (!note.trim()) return; setBusy("n"); try { await onSave(l.id, { note: note.trim() }); setNote(""); toast("Note added"); } catch (err) { fail(err); } setBusy(""); }}>
      <Field label="Add a note"><textarea className="textarea" rows={2} maxLength={2000} placeholder="Called back, sent pricing…" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div className="form-actions" style={{ marginTop: 8 }}><Button variant="ghost" size="sm" className="btn-danger" icon="trash" onClick={onDelete}>Delete</Button><span className="grow" /><Button type="submit" size="sm" variant="primary" busy={busy === "n"}>Add note</Button></div>
    </form>
    <ol className="timeline compact">{(l.notes || []).map((n, i) => (
      <li key={i} className={`tl ${n.type === "note" ? "note" : "sys"}`}><span className="tl-ic"><Icon name={n.type === "note" ? "note" : "flag"} /></span>
        <div className="tl-body"><div className="tl-top"><b>{n.type === "note" ? (n.by || "Note") : n.text}</b><time>{ago(n.at)}</time></div>{n.type === "note" && <p className="tl-note">{n.text}</p>}</div></li>))}
    </ol>
  </>;
}

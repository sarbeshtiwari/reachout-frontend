import { useEffect, useMemo, useRef, useState } from "react";
import { api, upload } from "../lib/api";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Alert, Badge, Button, Check, Empty, Field, Icon, Seg, fail, toast } from "../ui/kit";

const KIND = { hr: ["HR", "brand"], careers: ["Careers", "ok"], hiring: ["Recruiting", "warn"] };
const blank = () => ({ company: "", website: "" });
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export default function Finder() {
  const app = useApp();
  const [rows, setRows] = useState([blank()]);
  const [err, setErr] = useState({});
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [kind, setKind] = useState("");
  const [ownOnly, setOwnOnly] = useState(true);
  const [picked, setPicked] = useState(new Set());
  const [list, setList] = useState("Website finder");
  const fileRef = useRef(null);
  const timer = useRef(null);

  const load = async () => {
    try {
      const r = await api("/api/finder");
      setD(r);
      clearTimeout(timer.current);
      if (r.state === "running") timer.current = setTimeout(load, 2000);
    } catch (e) { fail(e); }
  };
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const running = d?.state === "running";
  const started = r => { toast(`Checking ${r.total} website${r.total === 1 ? "" : "s"}…${r.skipped ? ` ${r.skipped} address${r.skipped === 1 ? " wasn't" : "es weren't"} valid and ${r.skipped === 1 ? "was" : "were"} skipped.` : ""}`); setPicked(new Set()); load(); };

  const start = async () => {
    const items = rows.filter(r => r.website.trim() || r.company.trim());
    const missing = items.findIndex(r => !r.website.trim());
    if (!items.length || missing >= 0) { setErr({ website: missing >= 0 ? `Add the website for ${items[missing].company || "this company"}.` : "Add at least one website.", row: Math.max(missing, 0) }); return; }
    setErr({}); setBusy("start");
    try { started(await api("/api/finder/scan", { json: { items } })); }
    catch (e) { e.field ? setErr({ website: e.message, row: 0 }) : fail(e); }
    setBusy("");
  };
  const uploadSheet = async file => {
    if (!file) return;
    setBusy("upload");
    const fd = new FormData(); fd.append("file", file);
    try { started(await upload("/api/finder/scan", fd)); } catch (e) { fail(e); }
    setBusy(""); fileRef.current.value = "";
  };
  const stop = async () => { await api("/api/finder/stop", { json: {} }).catch(fail); toast("Stopping after the current pages…"); };

  // One row per address, with the company it came from.
  const found = useMemo(() => (d?.results || []).flatMap(s => s.emails.map(e => ({ ...e, company: s.company, website: s.website }))), [d]);
  const shown = found.filter(e => (!kind || e.kind === kind) && (!ownOnly || e.same_domain));
  const savable = shown.filter(e => !e.saved);
  const toggle = email => setPicked(p => { const n = new Set(p); n.has(email) ? n.delete(email) : n.add(email); return n; });
  const allPicked = savable.length > 0 && savable.every(e => picked.has(e.email));
  const pickAll = on => setPicked(on ? new Set(savable.map(e => e.email)) : new Set());

  const save = async () => {
    const items = found.filter(e => picked.has(e.email) && !e.saved).map(({ email, company, website }) => ({ email, company, website }));
    if (!items.length) return;
    setBusy("save");
    try {
      const r = await api("/api/finder/save", { json: { items, list } });
      toast(`${r.added} contact${r.added === 1 ? "" : "s"} saved to “${list}”${r.duplicates ? `, ${r.duplicates} already in your contacts` : ""}.`);
      setPicked(new Set()); load(); app.reload?.();
    } catch (e) { fail(e); }
    setBusy("");
  };
  const downloadCsv = () => {
    const q = v => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t])/, "'$1")}"`;
    const csv = ["company,website,email,type,found_on", ...shown.map(e => [e.company, e.website, e.email, KIND[e.kind][0], e.page].map(q).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "hiring-emails.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  const pct = d?.total ? Math.round((d.done / d.total) * 100) : 0;
  const noHits = (d?.results || []).filter(s => !s.emails.length);

  return (
    <div className="finder">
      <div className="grid-2 finder-top">
        <div className="card card-pad">
          <h3 className="sec-h"><Icon name="search" />Websites to search</h3>
          <p className="help" style={{ marginTop: -6, marginBottom: 14 }}>Reachout opens each website's pages (careers, contact and about first) and lists the HR and careers email addresses it publishes.</p>
          {rows.map((r, i) => (
            <div className="finder-row" key={i}>
              <Field label={i === 0 ? "Company" : ""} opt={i === 0 ? "(optional)" : ""}>
                <input className="input" value={r.company} placeholder="Acme Corp" maxLength={120}
                  onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, company: e.target.value } : x))} />
              </Field>
              <Field label={i === 0 ? "Website" : ""} error={err.row === i ? err.website : ""}>
                <input className="input" value={r.website} placeholder="acme.com" inputMode="url" maxLength={500}
                  onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, website: e.target.value } : x))}
                  onKeyDown={e => e.key === "Enter" && start()} />
              </Field>
              <Button className="finder-del" variant="ghost" icon="x" aria-label="Remove this website" disabled={rows.length === 1}
                onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="form-actions">
            <Button icon="plus" onClick={() => setRows(rs => rs.length < 20 ? [...rs, blank()] : rs)} disabled={rows.length >= 20}>Add another</Button>
            <span className="grow" />
            <Button variant="primary" icon="search" busy={busy === "start"} busyLabel="Starting…" disabled={running} onClick={start}>Find emails</Button>
          </div>
        </div>
        <div className="card card-pad">
          <h3 className="sec-h"><Icon name="sheet" />Or upload a list</h3>
          <p className="help" style={{ marginTop: -6, marginBottom: 14 }}>A CSV or Excel file with a <b>Website</b> column and, optionally, a <b>Company</b> column. A plain list of web addresses, one per line, works too. Up to {d?.max_sites || 100} websites per run.</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" hidden onChange={e => uploadSheet(e.target.files[0])} />
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <Button icon="upload" busy={busy === "upload"} busyLabel="Uploading…" disabled={running} onClick={() => fileRef.current.click()}>Upload CSV or Excel</Button>
            <a className="btn ghost" href="/api/finder/sample"><Icon name="download" />Sample file</a>
          </div>
          <Alert tone="info" style={{ marginTop: 16 }}>Only pages on each company's own website are read, and pages its robots.txt asks visitors to skip are left out. Some sites block automated visits; they're listed as not opened.</Alert>
        </div>
      </div>

      {running && (
        <div className="card card-pad finder-progress">
          <div className="finder-progress-head">
            <b>Checking websites… {d.done} of {d.total}</b>
            <span className="help">{found.length} address{found.length === 1 ? "" : "es"} found so far</span>
            <span className="grow" />
            <Button icon="stop" onClick={stop}>Stop</Button>
          </div>
          <div className="progress"><div style={{ width: `${Math.max(pct, 3)}%` }} /></div>
        </div>
      )}

      {d && d.state !== "idle" && (
        <div className="card table-card finder-results">
          <div className="toolbar" style={{ padding: "14px 16px 0" }}>
            <Seg value={kind} onChange={setKind} name="Address type" size="sm"
              options={[["", "All", null, found.length || undefined], ["hr", "HR"], ["careers", "Careers"], ["hiring", "Recruiting"]]} />
            <Check checked={ownOnly} onChange={setOwnOnly}>Company's own domain only</Check>
            <span className="grow" />
            <Button icon="download" disabled={!shown.length} onClick={downloadCsv}>Download CSV</Button>
          </div>
          {shown.length ? <>
            <div className="table-wrap"><table className="table">
              <thead><tr>
                <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all" checked={allPicked} disabled={!savable.length} onChange={e => pickAll(e.target.checked)} /></th>
                <th>Email</th><th>Type</th><th>Company</th><th>Found on</th>
              </tr></thead>
              <tbody>{shown.map(e => (
                <tr key={e.email + e.website}>
                  <td><input type="checkbox" aria-label={`Select ${e.email}`} disabled={e.saved} checked={e.saved || picked.has(e.email)} onChange={() => toggle(e.email)} /></td>
                  <td><b className="mono">{e.email}</b>{e.saved && <> <Badge tone="ok">In contacts</Badge></>}{!e.same_domain && <> <Badge title="This address is on a different domain from the company's website">Other domain</Badge></>}</td>
                  <td><Badge tone={KIND[e.kind][1]}>{KIND[e.kind][0]}</Badge></td>
                  <td>{e.company}<div className="help">{host(e.website)}</div></td>
                  <td><a className="link" href={e.page} target="_blank" rel="noopener noreferrer">{(() => { try { return new URL(e.page).pathname; } catch { return e.page; } })()}</a></td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="finder-save">
              <span><b>{[...picked].filter(p => savable.some(e => e.email === p)).length}</b> selected</span>
              <Field label="Save to list" className="finder-list"><input className="input" value={list} maxLength={60} onChange={e => setList(e.target.value)} /></Field>
              <Button variant="primary" icon="users" busy={busy === "save"} disabled={!savable.some(e => picked.has(e.email)) || !list.trim()} onClick={save}>Save to contacts</Button>
              <Button variant="ghost" onClick={() => go("contacts")}>Open contacts</Button>
            </div>
          </> : (
            <Empty icon="search" title={running ? "Nothing found yet" : found.length ? "No addresses match these filters" : "No HR or careers addresses found"}>
              {running ? "Results appear here as each website is checked." : found.length ? "Try “All” or turn off “Company's own domain only”." : "These websites don't publish an HR or careers email. Try their careers page address directly, like acme.com/careers."}
            </Empty>
          )}
          {!running && noHits.length > 0 && (
            <details className="finder-misses">
              <summary>{noHits.length} website{noHits.length === 1 ? "" : "s"} with no HR or careers address</summary>
              <ul>{noHits.map(s => <li key={s.website}><b>{s.company}</b> · {host(s.website)} · <span className="help">{s.error || `checked ${s.pages} page${s.pages === 1 ? "" : "s"}${s.other ? `, ${s.other} other address${s.other === 1 ? "" : "es"} (info, sales…) left out` : ""}`}</span></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
